import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateData, renderSvg } from '../generate.mjs';

const base = () => ({ version: 1, currency: 'CNY', updatedAt: '2026-10-16', donationLinks: [], sponsors: [] });

test('v1 keeps explicit public amounts, ranks descending and stabilizes equal amounts by ID', () => {
  const raw = { ...base(), sponsors: [
    { id: 'beta', name: 'Same name', amountMinor: 500 },
    { id: 'alpha', name: 'Same name', amountMinor: 500 },
    { id: 'z-highest', name: 'Highest', amountMinor: 900 }
  ] };
  const before = structuredClone(raw);
  const normalized = validateData(raw);
  assert.equal(normalized.version, 1);
  assert.equal(normalized.currency, 'CNY');
  assert.deepEqual(normalized.sponsors.map(p => p.id), ['z-highest', 'alpha', 'beta']);
  assert.deepEqual(normalized.sponsors.map(p => p.amountMinor), [900, 500, 500]);
  raw.sponsors.reverse();
  assert.deepEqual(validateData(raw).sponsors, normalized.sponsors);
  raw.sponsors.reverse();
  assert.deepEqual(raw, before);
  assert.equal(normalized.sponsors.length, 3, 'Same names must not merge identities');
});

test('v1 requires money but still rejects private order fields and v2 input', () => {
  for (const key of ['amount', 'total_amount', 'reference', 'token', 'user_id', 'tier', 'order']) {
    assert.throws(() => validateData({ ...base(), sponsors: [{ id: 'one', name: 'One', amountMinor: 5000, [key]: 5000 }] }), /unknown field/);
  }
  assert.throws(() => validateData({ ...base(), sponsors: [{ id: 'one', name: 'One' }] }), /amountMinor/);
  assert.throws(() => validateData({ ...base(), currency: undefined }), /currency/);
  assert.throws(() => validateData({ ...base(), version: 2 }), /version/);
  const svg = renderSvg(validateData(base()).sponsors, new Map(), 'light');
  assert.ok(svg.includes('Ordered by cumulative donations'));
});

test('Original v1 input remains usable without optional QR and email settings', () => {
  const normalized = validateData(base());
  assert.deepEqual(normalized.qrMethods, []);
  assert.equal(normalized.contactEmail, null);
});

test('Candidate keeps the confirmed support channels without inventing donors or amounts', async () => {
  const data = validateData(JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8')));
  assert.equal(data.version, 1);
  assert.equal(data.currency, 'CNY');
  assert.deepEqual(data.sponsors, []);
  assert.ok(data.donationLinks.some(link => link.url === 'https://afdian.com/a/starpieproject'));
  assert.deepEqual(data.qrMethods.map(method => method.id), ['wechat', 'alipay']);
  assert.ok(data.contactEmail);
});
