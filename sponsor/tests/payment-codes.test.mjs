import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, rmdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateData, renderPage, loadPaymentCodes } from '../generate.mjs';

const method = (id = 'wechat', image = null) => ({ id, label: { 'zh-CN': '扫码支持', en: 'Scan to support' }, image });
const data = qrMethods => ({ version: 1, currency: 'CNY', updatedAt: '2026-10-16', donationLinks: [], sponsors: [], qrMethods });
// A non-payment 1 px PNG fixture; never published in repository data.
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'starpie-qr-test-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('starpie-qr-test-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'payment-codes'));
  return root;
}

test('QR schema permits unavailable choices and rejects paths, duplicates and private fields', () => {
  assert.deepEqual(validateData(data([method(), method('alipay')])).qrMethods.map(m => m.image), [null, null]);
  const old = data(undefined); delete old.qrMethods;
  assert.deepEqual(validateData(old).qrMethods, []);
  for (const image of ['https://example.org/code.png', '../secret.png', 'payment-codes/alipay.png', 'payment-codes/wechat.svg']) {
    assert.throws(() => validateData(data([method('wechat', image)])), /QR image/);
  }
  assert.throws(() => validateData(data([method(), method()])), /duplicate/);
  assert.throws(() => validateData(data([method('other')])), /Invalid/);
  assert.throws(() => validateData(data([{ ...method(), token: 'private' }])), /unknown field/);
});

test('Unavailable QR choice renders an honest fragment panel, real code renders only its approved image', async () => {
  const template = await readFile(new URL('../template.html', import.meta.url), 'utf8');
  const unavailable = renderPage(validateData(data([method()])), template);
  assert.ok(unavailable.includes('href="#pay-wechat"') && unavailable.includes('href="#support-choices"'));
  assert.ok(unavailable.includes('此方式暂未开放'));
  assert.ok(!unavailable.includes('class="payment-code"'));
  const ready = renderPage(validateData(data([method('wechat', 'payment-codes/wechat.png')])), template);
  assert.ok(ready.includes('src="./payment-codes/wechat.png"'));
  assert.ok(ready.includes('付款前核对收款方'));
  assert.ok(!ready.includes('class="qr-note"'));
  assert.ok(!ready.includes('通过邮箱申请致谢 →'));
});

test('QR loader accepts PNG and refuses missing, disguised and oversized files', async t => {
  const root = await fixture(t), methods = [method('wechat', 'payment-codes/wechat.png')];
  await assert.rejects(loadPaymentCodes(root, methods), /ENOENT/);
  await writeFile(path.join(root, methods[0].image), '<svg/>');
  await assert.rejects(loadPaymentCodes(root, methods), /signature/);
  await writeFile(path.join(root, methods[0].image), Buffer.alloc(2 * 1024 * 1024 + 1));
  await assert.rejects(loadPaymentCodes(root, methods), /2 MiB/);
  await writeFile(path.join(root, methods[0].image), png);
  const first = await loadPaymentCodes(root, methods);
  const template = await readFile(new URL('../template.html', import.meta.url), 'utf8');
  const before = renderPage(validateData(data(methods)), template, first);
  assert.match(before, /wechat\.png\?v=[a-f0-9]{16}/);
  await writeFile(path.join(root, methods[0].image), Buffer.concat([png, Buffer.from('Changed fixture bytes')]));
  const after = renderPage(validateData(data(methods)), template, await loadPaymentCodes(root, methods));
  assert.notEqual(after, before, 'Replacing QR bytes changes the static cache key');
});

test('QR loader refuses a redirected payment directory without reading its target', async t => {
  const root = await fixture(t);
  const outside = path.join(root, 'outside'); await mkdir(outside);
  await writeFile(path.join(outside, 'wechat.png'), png);
  await rmdir(path.join(root, 'payment-codes'));
  try { await symlink(outside, path.join(root, 'payment-codes'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('Host does not allow directory links'); throw error; }
  await assert.rejects(loadPaymentCodes(root, [method('wechat', 'payment-codes/wechat.png')]), /symbolic link/);
});

test('Email acknowledgement replaces public forms, supports corrections/removal and rejects injection', async () => {
  const template = await readFile(new URL('../template.html', import.meta.url), 'utf8');
  const raw = { ...data([method(), method('alipay')]), contactEmail: 'support+project@example.org' };
  const html = renderPage(validateData(raw), template);
  const contactHeading = html.match(/<h2 id="contact-title">([\s\S]*?)<\/h2>/)[1];
  assert.ok(contactHeading.includes('希望公开展示在致谢名单') && contactHeading.includes('Be publicly acknowledged'));
  assert.ok(html.includes('mailto:support+project@example.org'));
  assert.ok(html.includes('用于核对的订单信息') && html.includes('如需修改昵称、头像或链接，或希望移除展示'));
  assert.ok(html.includes('公开展示完全自愿') && html.includes('支持金额不会直接显示在页面中，但会进入公开仓库'));
  assert.ok(html.includes('付款凭证仅供私下核对，不会进入公开仓库'));
  assert.ok(html.includes('联系邮箱：') && html.includes('Email: '));
  const contactSection = html.match(/<section class="email-acknowledgement"[\s\S]*?<\/section>/)[0];
  assert.equal((contactSection.match(/<p(?:\s|>)/g) ?? []).length, 4, 'Keep the application and update instructions, email address and privacy note');
  for (const retired of ['LOCAL_SUPPORT_', 'preference-panel', 'support.html', '<form']) assert.ok(!html.includes(retired));
  for (const email of ['not-email', 'a@example.org?subject=Injected', 'a@example.org\r\nBcc:other@example.org', 'a..b@example.org', '<script>@example.org']) {
    assert.throws(() => validateData({ ...raw, contactEmail: email }), /contactEmail/);
  }
  assert.throws(() => validateData({ ...raw, profileFormUrl: 'https://old.example.org/form' }), /retired/);
  assert.equal(validateData({ ...raw, profileFormUrl: null }).contactEmail, raw.contactEmail);
  const pending = renderPage(validateData(data([method()])), template);
  assert.ok(pending.includes('公开联系邮箱尚未配置'));
  assert.ok(!pending.includes('mailto:'));
});


test('Contact entry is a prominent single CTA and QR panels omit repeated acknowledgement content', async () => {
  const template = await readFile(new URL('../template.html', import.meta.url), 'utf8');
  const html = renderPage(validateData(data([
    method('wechat', 'payment-codes/wechat.png'),
    method('alipay', 'payment-codes/alipay.png')
  ])), template);
  assert.match(html, /class="acknowledgement-button" href="#contact-support"/);
  assert.ok(html.includes('希望公开展示在致谢名单') && html.includes('Be publicly acknowledged'));
  assert.equal((html.match(/href="#contact-support"/g) ?? []).length, 1);
  const panels = [...html.matchAll(/<section class="qr-panel"[\s\S]*?<\/section>/g)];
  assert.equal(panels.length, 2);
  for (const [panel] of panels) {
    assert.ok(panel.includes('付款前核对收款方'));
    assert.ok(!panel.includes('qr-note') && !panel.includes('#contact-support'));
  }
});
