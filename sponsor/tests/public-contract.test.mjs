import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateData, renderSvg } from '../generate.mjs';

const base = () => ({ version: 2, updatedAt: '2026-10-16', donationLinks: [], sponsors: [] });

test('v2 public data needs no amounts and remains stable when input order changes', () => {
  const raw = { ...base(), sponsors: [{ id: 'beta', name: 'Same name' }, { id: 'alpha', name: 'Same name' }] };
  const before = structuredClone(raw);
  assert.deepEqual(validateData(raw).sponsors.map(p => p.id), ['alpha', 'beta']);
  raw.sponsors.reverse();
  assert.deepEqual(validateData(raw).sponsors.map(p => p.id), ['alpha', 'beta']);
  raw.sponsors.reverse();
  assert.deepEqual(raw, before);
  assert.equal(validateData(raw).sponsors.length, 2, 'Same names must not merge identities');
});

test('v2 rejects even valid monetary values and private order fields before rendering', () => {
  for (const key of ['amountMinor', 'amount', 'total_amount', 'reference', 'token', 'user_id', 'tier', 'order']) {
    assert.throws(() => validateData({ ...base(), sponsors: [{ id: 'one', name: 'One', [key]: 5000 }] }), /unknown field/);
  }
  assert.throws(() => validateData({ ...base(), currency: 'CNY' }), /unknown field/);
  assert.throws(() => validateData({ ...base(), version: 1 }), /version/);
  const svg = renderSvg(validateData(base()).sponsors, new Map(), 'light');
  assert.ok(!svg.includes('cumulative donations'));
});

test('candidate includes the confirmed Afdian entry without invented supporters', async () => {
  const data = validateData(JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8')));
  assert.deepEqual(data.sponsors, []);
  assert.ok(data.donationLinks.some(link => link.url === 'https://afdian.com/a/starpieproject'));
});
