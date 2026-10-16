import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { request as httpRequest } from 'node:http';
import { validateData, escapeMarkup, avatarMediaType, loadAvatars, renderPage, renderSvg, generate, rootDirectory, outputNames } from '../generate.mjs';
import { createSponsorServer } from '../server.mjs';

const template = await readFile(new URL('../template.html', import.meta.url), 'utf8');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
const base = () => ({ version: 1, currency: 'CNY', updatedAt: '2026-10-16', donationLinks: [], sponsors: [] });
const person = (id, extra = {}) => ({ id, name: id, amountMinor: 0, ...extra });
const dataWith = sponsors => validateData({ ...base(), sponsors });
const idsIn = output => [...output.matchAll(/data-sponsor-id="([a-z0-9-]+)"/g)].map(match => match[1]);

async function fixture(t, raw = base()) {
  const directory = await mkdtemp(path.join(tmpdir(), 'starpie-sponsor-test-'));
  t.after(async () => {
    // Only clean up the exact disposable directory created by this test.
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert.ok(path.basename(resolved).startsWith('starpie-sponsor-test-'));
    await rm(resolved, { recursive: true, force: true });
  });
  await mkdir(path.join(directory, 'avatars'));
  await writeFile(path.join(directory, 'data.json'), JSON.stringify(raw));
  await writeFile(path.join(directory, 'template.html'), template);
  return directory;
}

test('Cumulative amounts sort descending, ties use stable IDs, and input is not mutated', () => {
  const raw = { ...base(), sponsors: [person('beta', { amountMinor: 5000 }), person('alpha', { amountMinor: 5000 }), person('first', { amountMinor: 9000 }), person('last')] };
  const before = structuredClone(raw);
  assert.deepEqual(validateData(raw).sponsors.map(entry => entry.id), ['first', 'alpha', 'beta', 'last']);
  assert.deepEqual(raw, before);
  raw.sponsors.reverse();
  assert.deepEqual(validateData(raw).sponsors.map(entry => entry.id), ['first', 'alpha', 'beta', 'last']);
});

test('Money rejects floats, negative values, coercion and unsafe integers', () => {
  for (const value of [-1, 0.1, '500', Number.MAX_SAFE_INTEGER + 1, null, undefined, NaN, Infinity]) {
    assert.throws(() => dataWith([person('one', { amountMinor: value })]), /amountMinor/);
  }
  assert.equal(dataWith([person('one', { amountMinor: 0 })]).sponsors[0].amountMinor, 0);
  assert.equal(dataWith([person('one', { amountMinor: Number.MAX_SAFE_INTEGER })]).sponsors[0].amountMinor, Number.MAX_SAFE_INTEGER);
});

test('One explicit currency, a real date and v1 schema are required', () => {
  for (const patch of [{ currency: 'cny' }, { currency: 'CNY/USD' }, { currency: null }, { currency: undefined }, { version: 2 }, { updatedAt: '2026-02-29' }, { updatedAt: '2026-13-01' }, { updatedAt: '2026-1-1' }]) {
    assert.throws(() => validateData({ ...base(), ...patch }));
  }
  assert.equal(validateData({ ...base(), updatedAt: '2024-02-29' }).updatedAt, '2024-02-29');
});

test('Duplicate IDs, hidden extra fields and tier configuration are rejected', () => {
  assert.throws(() => dataWith([person('same'), person('same')]), /Duplicate/);
  assert.throws(() => dataWith([person('ok', { tier: 'gold' })]), /unknown field/);
  assert.throws(() => dataWith([person('ok', { email: 'private@example.com' })]), /unknown field/);
  assert.throws(() => validateData({ ...base(), tiers: [] }), /unknown field/);
  assert.throws(() => dataWith([person('../bad')]));
});

test('Names support Unicode but reject control characters and malformed surrogate data', () => {
  assert.equal(dataWith([person('unicode', { name: '星盘🌟' })]).sponsors[0].name, '星盘🌟');
  for (const name of ['', ' name', 'name ', 'a\nb', 'a\u0000b', '\ud800', 'x'.repeat(81)]) {
    assert.throws(() => dataWith([person('bad', { name })]));
  }
});

test('Profile and donation links only accept credential-free HTTPS', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//example.com', 'http://example.com', 'https://user:pass@example.com', 'https://example.com/a b', 'https://example.com/\n']) {
    assert.throws(() => dataWith([person('bad', { url })]));
  }
  assert.equal(dataWith([person('ok', { url: 'https://example.com' })]).sponsors[0].url, 'https://example.com/');
  assert.throws(() => validateData({ ...base(), donationLinks: [{ label: { 'zh-CN': '支持', en: 'Support' }, url: 'javascript:alert(1)' }] }));
});

test('Avatar inputs cannot be remote URLs, executable SVGs or paths outside avatars', () => {
  for (const avatar of ['https://example.com/a.png', '../a.png', 'avatars/../../a.png', 'avatars\\a.png', 'avatars/a.svg', 'avatars/.a.png', 'avatars/a b.png']) {
    assert.throws(() => dataWith([person('bad', { avatar })]), /avatar/);
  }
});

test('Names, URLs and replacement metacharacters remain inert markup', () => {
  const name = '<script>alert("x")</script> $& $` $\' & 🌟';
  const data = dataWith([person('literal', { name, url: 'https://example.com/?a=1&b=2' })]);
  const html = renderPage(data, template);
  assert.ok(html.includes(escapeMarkup(name)));
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('href="https://example.com/?a=1&amp;b=2"'));
  assert.ok(!html.includes('{{SUPPORTERS}}'));
  const svg = renderSvg(data.sponsors, new Map(), 'light');
  assert.ok(svg.includes(`<title>${escapeMarkup(name)}</title>`));
  assert.ok(!svg.includes('<script>'));
});

test('Template-looking names stay literal and repeated avatars have one embedded bitmap', () => {
  const data = dataWith([person('one', { name: '{{UPDATED_AT}} $&', avatar: 'avatars/shared.png' }), person('two', { avatar: 'avatars/shared.png' })]);
  assert.ok(renderPage(data, template).includes('{{UPDATED_AT}} $&amp;'));
  const svg = renderSvg(data.sponsors, new Map([['avatars/shared.png', `data:image/png;base64,${png.toString('base64')}`]]), 'light');
  assert.equal((svg.match(/<image /g) ?? []).length, 1);
  assert.equal((svg.match(/<use /g) ?? []).length, 2);
});
test('HTML, public JSON and both SVG themes share amount ranking without rendering amounts', () => {
  const data = dataWith([person('low', { amountMinor: 13579111 }), person('high', { amountMinor: 24680222 }), person('zero')]);
  assert.deepEqual(data.sponsors.map(entry => entry.id), ['high', 'low', 'zero']);
  assert.equal(data.currency, 'CNY');
  assert.equal(data.sponsors[0].amountMinor, 24680222, 'Ranking amounts are public in v1 JSON');
  const outputs = [renderPage(data, template), renderSvg(data.sponsors, new Map(), 'light'), renderSvg(data.sponsors, new Map(), 'dark')];
  for (const output of outputs) {
    assert.deepEqual(idsIn(output), ['high', 'low', 'zero']);
    assert.ok(!output.includes('13579111') && !output.includes('24680222'));
    assert.ok(!output.includes('amountMinor'));
    assert.ok(!output.includes('gold') && !output.includes('tier='));
  }
  assert.ok(outputs[0].includes('支持金额不会直接显示在页面中，但会进入公开仓库'));
});

test('Donation buttons use confirmed data only, with bilingual labels and isolated tabs', () => {
  const data = validateData({ ...base(), donationLinks: [{ label: { 'zh-CN': '确认的渠道', en: 'Confirmed channel' }, url: 'https://example.com/support' }] });
  const html = renderPage(data, template);
  assert.ok(html.includes('确认的渠道') && html.includes('Confirmed channel'));
  assert.ok(html.includes('href="https://example.com/support" target="_blank" rel="noopener noreferrer"'));
  assert.ok(!html.includes('ko-fi.com/schneegans'));
});

test('Empty output contains no fictitious donors and does not require JavaScript for its content', () => {
  const data = validateData(base());
  const html = renderPage(data, template);
  assert.deepEqual(idsIn(html), []);
  assert.ok(html.includes('目前还没有添加公开展示的赞助者'));
  assert.ok(html.includes('No supporters have been added'));
  assert.ok(!html.includes('donation-links'));
  assert.deepEqual(idsIn(renderSvg([], new Map(), 'dark')), []);
});

test('Compact SVG wraps after eight equal-size avatars and preserves complete names in titles', () => {
  const data = dataWith(Array.from({ length: 9 }, (_, i) => person(`person-${i}`, { name: '很长的昵称 With emoji 🌟' })));
  const svg = renderSvg(data.sponsors, new Map(), 'light');
  assert.ok(svg.includes('height="268"'));
  assert.equal((svg.match(/r="36"/g) ?? []).length, 9);
  assert.equal((svg.match(/<title>很长的昵称 With emoji 🌟<\/title>/g) ?? []).length, 9);
  assert.ok(svg.includes('…'));
  assert.throws(() => renderSvg(data.sponsors, new Map(), 'unknown'));
});

test('Local avatars are verified and embedded into SVG rather than linked remotely', async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'avatars', 'one.png'), png);
  const data = dataWith([person('one', { avatar: 'avatars/one.png' })]);
  const images = await loadAvatars(directory, data.sponsors);
  assert.equal(images.size, 1);
  assert.equal(images.get('avatars/one.png'), `data:image/png;base64,${png.toString('base64')}`);
  const svg = renderSvg(data.sponsors, images, 'dark');
  assert.ok(svg.includes('href="data:image/png;base64,'));
  assert.ok(!svg.includes('href="https:'));
  assert.throws(() => renderSvg(data.sponsors, new Map(), 'light'), /not loaded/);
  assert.equal(avatarMediaType(png, '.PNG'), 'image/png');
  assert.throws(() => avatarMediaType(png, '.jpg'));
  await writeFile(path.join(directory, 'avatars', 'bad.png'), '<svg onload="alert(1)"/>');
  await assert.rejects(loadAvatars(directory, dataWith([person('bad', { avatar: 'avatars/bad.png' })]).sponsors), /signature/);
});

test('Oversize avatars fail before generating large embedded content', async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'avatars', 'large.png'), Buffer.alloc(256 * 1024 + 1));
  await assert.rejects(loadAvatars(directory, dataWith([person('large', { avatar: 'avatars/large.png' })]).sponsors), /256 KiB/);
});

test('Missing and unsupported template tokens fail rather than publishing placeholders', () => {
  assert.throws(() => renderPage(validateData(base()), '<html></html>'), /Missing template token/);
  assert.throws(() => renderPage(validateData(base()), template + '{{UNKNOWN_TOKEN}}'), /Unknown template token/);
});

test('Generation is deterministic, --check is read-only and stale results fail', async t => {
  const directory = await fixture(t, { ...base(), sponsors: [person('test')] });
  assert.deepEqual((await generate(directory)).changed, outputNames);
  assert.deepEqual((await generate(directory)).changed, []);
  assert.deepEqual((await generate(directory, { check: true })).changed, []);
  await writeFile(path.join(directory, 'index.html'), 'stale marker');
  await assert.rejects(generate(directory, { check: true }), /stale/);
  assert.equal(await readFile(path.join(directory, 'index.html'), 'utf8'), 'stale marker');
  assert.deepEqual((await generate(directory)).changed, ['index.html']);
});

test('Invalid data does not partially overwrite generated output', async t => {
  const directory = await fixture(t);
  await generate(directory);
  const before = await Promise.all(outputNames.map(name => readFile(path.join(directory, name), 'utf8')));
  await writeFile(path.join(directory, 'data.json'), JSON.stringify({ ...base(), sponsors: [person('bad', { amountMinor: 0.1 })] }));
  await assert.rejects(generate(directory), /amountMinor/);
  assert.deepEqual(await Promise.all(outputNames.map(name => readFile(path.join(directory, name), 'utf8'))), before);
});

test('Avatar symbolic links cannot expose files outside the public avatar directory', async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'private.png'), png);
  try { await symlink(path.join(directory, 'private.png'), path.join(directory, 'avatars', 'linked.png'), 'file'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('This host does not allow test symlinks'); throw error; }
  await assert.rejects(loadAvatars(directory, dataWith([person('linked', { avatar: 'avatars/linked.png' })]).sponsors), /regular local file/);
});

test('Preview server serves only public files with correct types, redirects and safe methods', async t => {
  const server = createSponsorServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const [file, type] of [['/sponsor/', 'text/html'], ['/sponsor/styles.css', 'text/css'], ['/sponsor/app.js', 'text/javascript'], ['/sponsor/data.json', 'application/json'], ['/sponsor/sponsors-light.svg', 'image/svg+xml'], ['/sponsor/sponsors-dark.svg', 'image/svg+xml']]) {
    const response = await fetch(url + file);
    assert.equal(response.status, 200, file);
    assert.ok(response.headers.get('content-type').startsWith(type));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
  for (const file of ['/sponsor/generate.mjs', '/sponsor/template.html', '/sponsor/README.md', '/sponsor/avatars/README.md', '/sponsor/tests/sponsor.test.mjs', '/.git/config', '/sponsor/%2e%2e/.git/config', '/data.json']) {
    assert.equal((await fetch(url + file)).status, 404, file);
  }
  // Use raw HTTP here: fetch normalizes dot segments before the server sees them.
  for (const rawPath of ['/sponsor/avatars/%2e%2e/data.json', '/sponsor/avatars/../data.json', '/sponsor/%2e%2e/.git/config']) {
    const status = await new Promise((resolve, reject) => {
      const request = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path: rawPath }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject);
      request.end();
    });
    assert.equal(status, 404, rawPath);
  }
  const redirect = await fetch(url + '/sponsor', { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/sponsor/');
  assert.equal((await fetch(url + '/sponsor/', { method: 'POST' })).status, 405);
  const head = await fetch(url + '/sponsor/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

function browserContext({ storageFails = false, stored = {}, dark = false } = {}) {
  const values = new Map(Object.entries(stored));
  const root = { dataset: {}, lang: '', classList: { add() {} } };
  const elements = new Map(['theme-toggle', 'language-toggle'].map(key => [key, { attributes: {}, listeners: {}, textContent: '', setAttribute(name, value) { this.attributes[name] = value; }, addEventListener(name, callback) { this.listeners[name] = callback; } }]));
  const media = { matches: dark, addEventListener(name, callback) { this.listener = callback; } };
  const navigation = { setAttribute() {} };
  const document = { documentElement: root, title: '', getElementById: key => elements.get(key), querySelector: () => navigation };
  const localStorage = { getItem(key) { if (storageFails) throw new Error('blocked'); return values.get(key) ?? null; }, setItem(key, value) { if (storageFails) throw new Error('blocked'); values.set(key, value); } };
  return { context: vm.createContext({ document, localStorage, window: { matchMedia: () => media } }), root, elements, media, values, document };
}

test('Theme and language survive blocked storage, reject unknown preferences and respond to user actions', async () => {
  const preferences = await readFile(new URL('../preferences.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  for (const options of [{ storageFails: true }, { stored: { 'starpie-theme': 'invalid', 'starpie-language': 'invalid' } }]) {
    const browser = browserContext(options);
    vm.runInContext(preferences, browser.context);
    vm.runInContext(app, browser.context);
    assert.equal(browser.root.dataset.theme, 'light');
    assert.equal(browser.root.lang, 'zh-CN');
    browser.elements.get('language-toggle').listeners.click();
    assert.equal(browser.root.lang, 'en');
    assert.equal(browser.document.title, 'Thank you for your support · StarPie');
    browser.media.listener({ matches: true });
    assert.equal(browser.root.dataset.theme, 'dark');
    browser.elements.get('theme-toggle').listeners.click();
    assert.equal(browser.root.dataset.theme, 'light');
    browser.media.listener({ matches: true });
    assert.equal(browser.root.dataset.theme, 'light');
  }
  const saved = browserContext({ stored: { 'starpie-theme': 'dark', 'starpie-language': 'en' } });
  vm.runInContext(preferences, saved.context);
  vm.runInContext(app, saved.context);
  assert.equal(saved.root.dataset.theme, 'dark');
  assert.equal(saved.root.lang, 'en');
});

test('Current published outputs match their data and template', async () => {
  assert.deepEqual((await generate(rootDirectory, { check: true })).changed, []);
});


test('Sponsor page omits the about-list section and visual timestamp while preserving contact guidance', () => {
  const data = validateData(base());
  const html = renderPage(data, template);
  for (const removed of ['about-list', 'about-title', '关于这份名单', 'About this list', '名单更新于', 'List updated']) {
    assert.ok(!html.includes(removed), removed);
  }
  assert.ok(html.includes('id="contact-support"'));
  assert.ok(html.includes('支持金额不会直接显示在页面中，但会进入公开仓库'));
  assert.ok(html.includes('付款凭证仅供私下核对，不会进入公开仓库'));
  assert.ok(!html.includes('{{UPDATED_AT}}'));
  assert.equal(data.updatedAt, '2026-10-16', 'The public data timestamp remains available');
  const datedTemplate = template.replace('{{CONTACT}}', '{{CONTACT}}<time datetime="{{UPDATED_AT}}">{{UPDATED_AT}}</time>');
  const dated = renderPage(data, datedTemplate);
  assert.ok(dated.includes('<time datetime="2026-10-16">2026-10-16</time>'));
});
