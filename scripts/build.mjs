import { cp, mkdir, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const files = ['index.html', '.nojekyll', 'styles/main.css', 'scripts/app.js', 'scripts/preferences.js', 'scripts/i18n.js', 'scripts/menu-data.js'];
// No dependencies, transforms, or remote assets are required for deployment.
await mkdir(output, { recursive: true });
for (const file of files) {
  const destination = path.join(output, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, file), destination);
}
await cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
const assets = await readdir(path.join(output, 'assets'));
await writeFile(path.join(output, 'build-info.json'), JSON.stringify({ files: files.concat(assets.map(name => 'assets/' + name)) }, null, 2) + '\n');
console.log('Static site built: ' + output);
console.log('Ready for GitHub Pages. No runtime dependencies.');
