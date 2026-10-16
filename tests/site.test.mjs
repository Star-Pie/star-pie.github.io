import test from 'node:test';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { translations, translate } from '../scripts/i18n.js';
import { presets, polar, sectorPath } from '../scripts/menu-data.js';
import { createSiteServer } from '../scripts/dev.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);

test('Chinese and English have the same complete translation keys', () => {
  assert.deepEqual(Object.keys(translations.en).sort(), Object.keys(translations['zh-CN']).sort());
  for (const dictionary of Object.values(translations)) {
    for (const [key, value] of Object.entries(dictionary)) assert.ok(value.trim(), key);
  }
});
test('Every HTML translation key exists in both languages', () => {
  for (const match of html.matchAll(/data-i18n(?:-aria|-alt)?="([^"]+)"/g)) {
    for (const dictionary of Object.values(translations)) assert.ok(dictionary[match[1]], match[1]);
  }
  assert.doesNotMatch(html, /data-i18n="[^"]+">\s*<\//, 'Static HTML must contain usable Chinese fallback text');
});
test('Translation placeholders are safe and match in both languages', () => {
  for (const key of Object.keys(translations.en)) {
    const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(placeholders(translations.en[key]), placeholders(translations['zh-CN'][key]), key);
  }
  assert.equal(translate('demo.selected', 'en', { action: 'Copy' }), 'Selected · Copy');
  assert.equal(translate('hero.download', 'unknown'), '免费下载');
});
test('All page IDs are unique', () => assert.equal(new Set(ids).size, ids.length));
test('All internal anchors and SVG references resolve', () => {
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(match[1]), match[1]);
  for (const match of html.matchAll(/aria-(?:controls|labelledby)="([^"]+)"/g)) {
    for (const id of match[1].split(' ')) assert.ok(ids.includes(id), id);
  }
});
test('All local HTML assets exist', async () => {
  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) await access(path.join(root, match[1]));
});
test('External tabs isolate their opener and use HTTPS', () => {
  for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    assert.match(match[0], /rel="noopener noreferrer"/);
    assert.match(match[0], /href="https:\/\//);
  }
});
test('Three presets contain eight localized actions with valid unique icons', () => {
  assert.equal(Object.keys(presets).length, 3);
  for (const items of Object.values(presets)) {
    assert.equal(items.length, 8);
    assert.equal(new Set(items.map(item => item.id)).size, items.length);
    for (const item of items) {
      assert.ok(ids.includes('i-' + item.icon), item.icon);
      assert.ok(item.label.en && item.label['zh-CN']);
    }
  }
});
test('Radial geometry is finite and each sector has a distinct path', () => {
  for (const count of [4, 8, 12]) {
    const paths = Array.from({ length: count }, (_, index) => sectorPath(index, count));
    assert.equal(new Set(paths).size, count);
    for (const d of paths) { assert.ok(d.endsWith('Z')); assert.doesNotMatch(d, /NaN|Infinity/); }
  }
  assert.deepEqual(polar(100, 0), [400, 300]);
  assert.throws(() => sectorPath(9), RangeError);
  assert.throws(() => sectorPath(0, 0), RangeError);
  assert.throws(() => sectorPath(0, 8, 100, 123), RangeError);
});
test('Download links use stable releases and beta features stay labeled', () => {
  assert.equal((html.match(/href="https:\/\/github.com\/Star-Pie\/StarPie\/releases\/latest"/g) || []).length, 3);
  assert.match(translations['zh-CN']['appearance.studioCaption'], /Beta/);
  assert.match(translations.en['plugins.description'], /Beta/);
  assert.match(translations.en['demo.disclaimer'], /No actions/);
});
test('Preview server serves the site and denies private or executable files', async t => {
  const server = createSiteServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const file of ['/', '/styles/main.css', '/scripts/app.js', '/assets/logo.webp']) {
    const result = await fetch(base + file);
    assert.equal(result.status, 200, file);
    await result.arrayBuffer();
  }
  for (const file of ['/.git/config', '/scripts/dev.mjs', '/package.json', '/missing', '/assets/%5C..%5Cpackage.json', '/assets/%00oops']) {
    const result = await fetch(base + file);
    assert.equal(result.status, 404, file);
    await result.arrayBuffer();
  }
  assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  const head = await fetch(base + '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});


test('First-paint preferences survive blocked storage and reject unknown values', async () => {
  const script = await readFile(path.join(root, 'scripts/preferences.js'), 'utf8');
  for (const storage of [
    { getItem() { throw new Error('Storage disabled'); } },
    { getItem() { return 'unrecognized'; } }
  ]) {
    const element = { dataset: {}, classList: { add() {} } };
    runInNewContext(script, { localStorage: storage, document: { documentElement: element } });
    assert.equal(element.dataset.theme, 'dark');
    assert.equal(element.dataset.language, 'zh-CN');
  }
  const element = { dataset: {}, classList: { add() {} } };
  runInNewContext(script, {
    localStorage: { getItem(key) { return key === 'starpie-theme' ? 'light' : 'en'; } },
    document: { documentElement: element }
  });
  assert.equal(element.dataset.theme, 'light');
  assert.equal(element.dataset.language, 'en');
});


test('GitHub support appears only once, below the hero download actions', () => {
  const actions = html.indexOf('class="hero-actions"');
  const support = html.indexOf('class="hero-support"');
  const metadata = html.indexOf('class="hero-meta"');
  assert.ok(actions < support && support < metadata);
  assert.equal((html.match(/data-i18n="community.action"/g) || []).length, 1);
  assert.doesNotMatch(html, /class="community-section/);
});
test('Download icons and titles share explicit alignment containers', () => {
  const headings = [...html.matchAll(/<div class="download-option-heading">([\s\S]*?)<\/div>/g)];
  assert.equal(headings.length, 3);
  for (const [, content] of headings) {
    assert.match(content, /class="icon download-type-icon"/);
    assert.match(content, /<h3 data-i18n="download\./);
  }
});
test('Typography keeps a readable minimum size at every breakpoint', async () => {
  const css = await readFile(path.join(root, 'styles/main.css'), 'utf8');
  assert.match(css, /--font-caption: 12px/);
  assert.match(css, /--font-body: 16px/);
  for (const [, size] of css.matchAll(/font-size:\s*(\d+)px/g)) assert.ok(Number(size) >= 12);
  assert.match(css, /\.download-option-heading\s*\{[^}]*align-items: center/);
});
