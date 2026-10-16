import { cp, mkdir, writeFile, readdir, lstat, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generate } from '../sponsor/generate.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const mainFiles = ['index.html', '.nojekyll', 'styles/main.css', 'scripts/app.js', 'scripts/preferences.js', 'scripts/i18n.js', 'scripts/menu-data.js'];
const sponsorRuntimeFiles = ['index.html', 'styles.css', 'preferences.js', 'app.js', 'logo.webp', 'sponsors-light.svg', 'sponsors-dark.svg'];

async function requireDirectoryIfPresent(directory) {
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Build output must be a regular directory: ${directory}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function resetSponsorOutput(output) {
  const target = path.resolve(output, 'sponsor');
  if (path.relative(output, target) !== 'sponsor') throw new Error('Sponsor output is outside the build directory');
  await requireDirectoryIfPresent(target);
  try {
    const resolvedOutput = await realpath(output);
    const resolvedTarget = await realpath(target);
    if (path.relative(output, resolvedOutput) !== '' || path.relative(resolvedOutput, resolvedTarget) !== 'sponsor') throw new Error('Sponsor output resolves outside the build directory');
    // Only this generated child directory is rebuilt; never remove dist/ or other pages.
    await rm(resolvedTarget, { recursive: true });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(target);
  return target;
}

export async function buildSite(sourceRoot = projectRoot) {
  const root = await realpath(sourceRoot);
  const output = path.join(root, 'dist');
  await requireDirectoryIfPresent(output);
  await requireDirectoryIfPresent(path.join(output, 'sponsor'));
  const sponsorRoot = path.join(root, 'sponsor');
  // Generate before touching the publication candidate. Invalid data must fail the entire build.
  const { data } = await generate(sponsorRoot);
  const avatars = Array.from(new Set(data.sponsors.map(sponsor => sponsor.avatar).filter(Boolean))).sort();
  const paymentCodes = data.qrMethods.map(method => method.image).filter(Boolean);
  const sponsorFiles = sponsorRuntimeFiles.concat(avatars, paymentCodes);
  for (const file of sponsorFiles) {
    const info = await lstat(path.join(sponsorRoot, ...file.split('/')));
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Sponsor publication input must be a regular file: ${file}`);
  }

  // All resources are local. No dependency installation or network request is needed.
  await mkdir(output, { recursive: true });
  for (const file of mainFiles) {
    const destination = path.join(output, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(root, file), destination);
  }
  await cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
  const sponsorOutput = await resetSponsorOutput(output);
  for (const file of sponsorFiles) {
    const destination = path.join(sponsorOutput, ...file.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(sponsorRoot, ...file.split('/')), destination);
  }
  // Publish the same validated snapshot used by the page/SVG generator, including its stable order.
  await writeFile(path.join(sponsorOutput, 'data.json'), JSON.stringify(data, null, 2) + '\n');
  const assets = (await readdir(path.join(output, 'assets'))).sort();
  const files = mainFiles.concat(assets.map(name => 'assets/' + name), sponsorFiles.concat('data.json').map(name => 'sponsor/' + name));
  await writeFile(path.join(output, 'build-info.json'), JSON.stringify({ files }, null, 2) + '\n');
  return { output, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { output } = await buildSite();
  console.log('Static site built: ' + output);
  console.log('Homepage and sponsor page are ready for one GitHub Pages deployment.');
}
