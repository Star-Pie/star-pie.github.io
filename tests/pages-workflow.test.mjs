import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
const build = workflow.slice(workflow.indexOf('  build:'), workflow.indexOf('  deploy:'));
const deploy = workflow.slice(workflow.indexOf('  deploy:'));
const guard = "github.event_name != 'pull_request' && github.ref == 'refs/heads/main'";

test('Pages workflow handles main pushes, pull requests, and manual runs', () => {
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /pull_request:\n\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /group: pages-/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('Pages checks and builds before uploading only the static output', () => {
  const check = build.indexOf('run: npm run check');
  const generate = build.indexOf('run: node sponsor/generate.mjs');
  const tests = build.indexOf('run: npm test');
  const compile = build.indexOf('run: npm run build');
  const upload = build.indexOf('uses: actions/upload-pages-artifact@');
  assert.ok(check >= 0 && check < generate && generate < tests && tests < compile && compile < upload);
  assert.match(build, /path: dist\s*$/);
  assert.match(build, /package-manager-cache: false/);
  assert.doesNotMatch(build, /run: npm (?:install|ci)\b/);
});

test('Pull requests and non-main manual runs cannot upload or deploy', () => {
  assert.ok(build.includes('if: ' + '$' + '{{ ' + guard + ' }}'));
  assert.ok(deploy.includes('if: ' + '$' + '{{ ' + guard + ' }}'));
  assert.match(deploy, /needs: build/);
  assert.match(deploy, /uses: actions\/configure-pages@/);
  assert.match(deploy, /uses: actions\/deploy-pages@/);
  assert.match(deploy, /id: deployment/);
});

test('Pages write permissions are limited to the deployment job', () => {
  const defaults = workflow.slice(workflow.indexOf('\npermissions:'), workflow.indexOf('\nconcurrency:'));
  assert.match(defaults, /contents: read/);
  assert.doesNotMatch(defaults, /write/);
  assert.doesNotMatch(build, /pages: write|id-token: write/);
  assert.match(deploy, /pages: write/);
  assert.match(deploy, /id-token: write/);
  assert.match(deploy, /name: github-pages/);
  assert.ok(deploy.includes('steps.deployment.outputs.page_url'));
  assert.equal((workflow.match(/persist-credentials: false/g) || []).length, 2);
});
