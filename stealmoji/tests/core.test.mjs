import test from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/core.mjs';

const id = '123456789012345678';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const gif = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
function environment(responses) {
  const urls = [];
  class Reader {
    readAsDataURL(blob) { this.result = `data:${blob.type};base64,${blob.data}`; queueMicrotask(() => this.onload?.()); }
    abort() { this.onabort?.(); }
  }
  return { urls, FileReader: Reader, setTimeout, clearTimeout, AbortController,
    fetch: async url => { urls.push(url); const r = responses.shift(); if (r instanceof Error) throw r;
      return { ok: true, status: 200, headers: { get: () => null }, ...r, blob: async () => ({ size: 24, type: 'image/png', data: png, ...r?.blob }) }; } };
}

test('parses custom mentions, animated WebP URLs and IDs without accepting arbitrary URLs', () => {
  const c = createCore();
  assert.deepEqual(c.parse(`<a:wave:${id}>`), { id, name: 'wave', animated: true });
  assert.equal(c.parse(`https://media.discordapp.net/emojis/${id}.webp?animated=true`).animated, true);
  assert.equal(c.parse({ id, alt: ':wave:', src: `https://cdn.discordapp.com/emojis/${id}.gif` }).animated, true);
  for (const input of ['😀', 'https://example.com/emoji.png', '123', `https://cdn.discordapp.com.evil.test/emojis/${id}.gif`, `<:wave:${id}> extra`]) assert.equal(c.parse(input), null);
  assert.equal(c.parse(id).id, id);
  assert.equal(c.validName('a'), false); assert.equal(c.validName('good_name'), true);
});
test('permissions fail closed and undefined owner IDs do not grant access', () => {
  const c = createCore(), P = { Permissions: { CREATE_GUILD_EXPRESSIONS: 'create', ADMINISTRATOR: 'admin', MANAGE_GUILD_EXPRESSIONS: 'manage' } };
  assert.equal(c.canCreate({ id: 'g' }, undefined, undefined, P), false);
  assert.equal(c.canCreate({ id: 'g', ownerId: 'u' }, { id: 'u' }, undefined, P), true);
  assert.equal(c.canCreate({ id: 'g' }, { id: 'u' }, { can: p => p === 'manage' }, P), false);
  assert.equal(c.canCreate({ id: 'g' }, { id: 'u' }, { can: p => p === 'create' }, P), true);
});
test('counts static and animated slots separately; unknown cache is not a made-up limit', () => {
  const c = createCore(), g = { id: 'g', getMaxEmojiSlots: () => 1 };
  const s = { getGuilds: () => ({ g: { emojis: [{ animated: false }, { animated: true, managed: true }] } }) };
  assert.equal(c.slots(g, false, s).full, true);
  assert.equal(c.slots(g, true, s).full, false);
  assert.equal(c.slots(g, false, {}).max, null);
});
test('preserves GIF bytes and MIME even when RN reports octet-stream', async () => {
  const env = environment([{ blob: { type: 'application/octet-stream', data: gif } }]);
  const result = await createCore(env).imageData({ id, animated: true });
  assert.equal(result, 'data:image/gif;base64,' + gif);
  assert.match(env.urls[0], /\.gif\?size=128/);
});
test('shrinks only oversize downloads and enforces the encoded-byte limit', async () => {
  const env = environment([{ blob: { size: 300000 } }, { blob: { data: png + 'A'.repeat(400000), size: 12 } }, {}]);
  assert.match(await createCore(env).imageData({ id, animated: false }), /^data:image\/png/);
  assert.deepEqual(env.urls.map(u => /size=(\d+)/.exec(u)[1]), ['128', '64', '32']);
});
test('network and HTTP errors stop without repeated requests', async () => {
  for (const response of [new Error('offline'), { ok: false, status: 404 }]) {
    const env = environment([response]);
    await assert.rejects(createCore(env).imageData({ id }), /offline|404/);
    assert.equal(env.urls.length, 1);
  }
});
test('rejects invalid images and animated emoji silently converted to PNG', async () => {
  await assert.rejects(createCore(environment([{}])).imageData({ id, animated: true }), /still image/);
  await assert.rejects(createCore(environment([{ blob: { data: 'aHRtbA==' } }])).imageData({ id }), /supported emoji/);
});
test('times out stalled reads and settles reader errors', async () => {
  const env = environment([{}]);
  env.FileReader = class { readAsDataURL() {} abort() {} };
  env.setTimeout = callback => setTimeout(callback, 5);
  await assert.rejects(createCore(env).imageData({ id }), /timed out/);
  const failed = environment([{}]);
  failed.FileReader = class { readAsDataURL() { queueMicrotask(() => this.onerror()); } };
  await assert.rejects(createCore(failed).imageData({ id }), /read emoji/);
});
test('cancelled lifecycle prevents a download and every oversize candidate fails clearly', async () => {
  const env = environment([]);
  await assert.rejects(createCore(env).imageData({ id }, () => false), /disabled/);
  assert.equal(env.urls.length, 0);
  const large = environment(Array.from({ length: 3 }, () => ({ blob: { size: 300000 } })));
  await assert.rejects(createCore(large).imageData({ id }), /256 KiB/);
});
