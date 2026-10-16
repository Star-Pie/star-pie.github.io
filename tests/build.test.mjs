import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, cp, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSite } from '../scripts/build.mjs';
import { generate } from '../sponsor/generate.mjs';

const mainFiles = ['index.html', '.nojekyll', 'styles/main.css', 'scripts/app.js', 'scripts/preferences.js', 'scripts/i18n.js', 'scripts/menu-data.js'];
const sponsorFiles = ['index.html', 'styles.css', 'preferences.js', 'app.js', 'logo.webp', 'data.json', 'sponsors-light.svg', 'sponsors-dark.svg'];
const homepage = '<!doctype html><html lang="en"><title>Homepage fixture</title><h1>Homepage remains intact</h1></html>\n';
const baseData = () => ({ version: 1, currency: 'CNY', updatedAt: '2026-10-16', donationLinks: [], sponsors: [] });
const idsIn = output => [...output.matchAll(/data-sponsor-id="([a-z0-9-]+)"/g)].map(match => match[1]);

async function fixture(t, data = baseData()) {
  const root = await mkdtemp(path.join(tmpdir(), 'starpie-pages-build-'));
  t.after(async () => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert.ok(path.basename(resolved).startsWith('starpie-pages-build-'));
    await rm(resolved, { recursive: true, force: true });
  });
  for (const file of mainFiles) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), file === 'index.html' ? homepage : `fixture ${file}\n`);
  }
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'assets', 'keep.webp'), 'fixture asset');
  await cp(new URL('../sponsor/', import.meta.url), path.join(root, 'sponsor'), { recursive: true });
  await writeFile(path.join(root, 'sponsor', 'data.json'), JSON.stringify(data));
  return root;
}

async function filesWithin(root, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const file = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await filesWithin(root, file));
    else files.push(file);
  }
  return files.sort();
}

test('One Pages build contains the unchanged homepage and freshly generated ranked sponsor page', async t => {
  const data = { ...baseData(), sponsors: [{ id: 'smaller', name: 'Smaller donation', amountMinor: 12345 }, { id: 'larger', name: 'Larger donation', amountMinor: 67890 }] };
  const root = await fixture(t, data);
  const result = await buildSite(root);
  const output = path.join(root, 'dist');
  assert.equal(result.output, output);
  assert.equal(await readFile(path.join(output, 'index.html'), 'utf8'), homepage);
  assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), homepage);
  assert.equal(await readFile(path.join(output, 'assets', 'keep.webp'), 'utf8'), 'fixture asset');
  for (const file of ['index.html', 'sponsors-light.svg', 'sponsors-dark.svg']) {
    const content = await readFile(path.join(output, 'sponsor', file), 'utf8');
    assert.deepEqual(idsIn(content), ['larger', 'smaller']);
    assert.ok(!content.includes('12345') && !content.includes('67890'));
  }
  const publishedData = JSON.parse(await readFile(path.join(output, 'sponsor', 'data.json'), 'utf8'));
  assert.deepEqual(publishedData.sponsors.map(sponsor => sponsor.id), ['larger', 'smaller']);
  assert.equal(publishedData.sponsors[0].amountMinor, 67890);
  await generate(path.join(root, 'sponsor'), { check: true });
  const manifest = JSON.parse(await readFile(path.join(output, 'build-info.json'), 'utf8'));
  assert.deepEqual(manifest.files, result.files);
  assert.ok(manifest.files.includes('index.html') && manifest.files.includes('.nojekyll') && manifest.files.includes('sponsor/index.html'));
});

test('Publication allowlist excludes source, tests, templates and unreferenced avatar files', async t => {
  const data = { ...baseData(), sponsors: [{ id: 'one', name: 'One', amountMinor: 100, avatar: 'avatars/shared.webp' }, { id: 'two', name: 'Two', amountMinor: 50, avatar: 'avatars/shared.webp' }] };
  const root = await fixture(t, data);
  await cp(path.join(root, 'sponsor', 'logo.webp'), path.join(root, 'sponsor', 'avatars', 'shared.webp'));
  await writeFile(path.join(root, 'sponsor', 'avatars', 'not-public.png'), 'Unreferenced private fixture');
  await buildSite(root);
  const published = await filesWithin(path.join(root, 'dist', 'sponsor'));
  assert.deepEqual(published, [...sponsorFiles, 'avatars/shared.webp'].sort());
  const manifest = JSON.parse(await readFile(path.join(root, 'dist', 'build-info.json'), 'utf8'));
  assert.equal(manifest.files.filter(file => file === 'sponsor/avatars/shared.webp').length, 1);
  assert.ok(!manifest.files.some(file => /template|generate|server|README|tests|not-public/.test(file)));
});

test('Rebuilding removes retired avatars and stale sponsor artifacts without deleting homepage output', async t => {
  const data = { ...baseData(), sponsors: [{ id: 'retiring', name: 'Retiring fixture', amountMinor: 100, avatar: 'avatars/retiring.webp' }] };
  const root = await fixture(t, data);
  await cp(path.join(root, 'sponsor', 'logo.webp'), path.join(root, 'sponsor', 'avatars', 'retiring.webp'));
  await buildSite(root);
  await writeFile(path.join(root, 'dist', 'keep-outside-sponsor.txt'), 'Do not delete');
  await writeFile(path.join(root, 'dist', 'sponsor', 'source-leak.mjs'), 'Stale artifact');
  await writeFile(path.join(root, 'sponsor', 'data.json'), JSON.stringify(baseData()));
  await buildSite(root);
  assert.deepEqual(await filesWithin(path.join(root, 'dist', 'sponsor')), sponsorFiles.slice().sort());
  assert.equal(await readFile(path.join(root, 'dist', 'keep-outside-sponsor.txt'), 'utf8'), 'Do not delete');
  assert.equal(await readFile(path.join(root, 'dist', 'index.html'), 'utf8'), homepage);
  const manifest = JSON.parse(await readFile(path.join(root, 'dist', 'build-info.json'), 'utf8'));
  assert.ok(!manifest.files.some(file => /retiring|source-leak/.test(file)));
});

test('Invalid sponsor data fails before replacing an existing publication candidate', async t => {
  const root = await fixture(t);
  await buildSite(root);
  const beforeMain = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
  const beforeSponsor = await readFile(path.join(root, 'dist', 'sponsor', 'index.html'), 'utf8');
  await writeFile(path.join(root, 'index.html'), 'Changed main input');
  await writeFile(path.join(root, 'sponsor', 'data.json'), JSON.stringify({ ...baseData(), sponsors: [{ id: 'invalid', name: 'Invalid fixture', amountMinor: 0.5 }] }));
  await assert.rejects(buildSite(root), /amountMinor/);
  assert.equal(await readFile(path.join(root, 'dist', 'index.html'), 'utf8'), beforeMain);
  assert.equal(await readFile(path.join(root, 'dist', 'sponsor', 'index.html'), 'utf8'), beforeSponsor);
});

test('All sponsor page local assets and homepage links resolve inside the combined artifact', async t => {
  const root = await fixture(t);
  await buildSite(root);
  const html = await readFile(path.join(root, 'dist', 'sponsor', 'index.html'), 'utf8');
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = new URL(match[1], 'https://fixture.invalid/sponsor/');
    if (url.origin !== 'https://fixture.invalid') continue;
    const file = decodeURIComponent(url.pathname.slice(1)) + (url.pathname.endsWith('/') ? 'index.html' : '');
    assert.ok(file && !file.startsWith('..'));
    await readFile(path.join(root, 'dist', file));
  }
});

test('A redirected sponsor output directory is rejected rather than recursively deleting its target', async t => {
  const root = await fixture(t);
  const outside = path.join(root, 'outside-output');
  await mkdir(outside);
  await writeFile(path.join(outside, 'keep.txt'), 'Keep this fixture');
  await mkdir(path.join(root, 'dist'));
  try { await symlink(outside, path.join(root, 'dist', 'sponsor'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('This host does not allow test directory links'); throw error; }
  await assert.rejects(buildSite(root), /regular directory|symbolic link|output/i);
  assert.equal(await readFile(path.join(outside, 'keep.txt'), 'utf8'), 'Keep this fixture');
});

test('A redirected dist directory is rejected before copying publication files', async t => {
  const root = await fixture(t);
  const outside = path.join(root, 'outside-dist');
  await mkdir(outside);
  await writeFile(path.join(outside, 'keep.txt'), 'Keep this fixture');
  try { await symlink(outside, path.join(root, 'dist'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('This host does not allow test directory links'); throw error; }
  await assert.rejects(buildSite(root), /regular directory|symbolic link|output/i);
  assert.deepEqual(await filesWithin(outside), ['keep.txt']);
});
