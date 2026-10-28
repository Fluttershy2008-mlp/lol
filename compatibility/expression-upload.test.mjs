import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpressionUpload } from './expression-upload.mjs';

class NativeFormData {
  constructor() { this.parts = []; }
  append(...args) { assert.equal(args.length, 2); this.parts.push(args); }
  getParts() { return this.parts; }
}
const emoji = { guildId: '123', name: 'pony', image: 'data:image/gif;base64,R0lGODlh', roles: undefined };
const sticker = { guildId: '123', name: 'pony', tags: 'slight_smile', description: '',
  uri: 'file:///cache/sticker.gif', mimeType: 'image/gif', platform: 'mobile', originalMd5: null };
function fixture() {
  const calls = [], events = [], modules = [];
  const rest = { marker: 1, async post(input) { assert.equal(this.marker, 1); calls.push(input); return { status: 201, body: { id: 'created' } }; } };
  const V = { metro: { common: { RestAPI: rest, ReactNative: {}, FluxDispatcher: { dispatch: value => events.push(value) } },
    findByProps: (...keys) => modules.find(value => keys.every(key => key in value)) } };
  const uploads = createExpressionUpload(V, { FormData: NativeFormData });
  return { calls, events, rest, modules, V, uploads };
}

test('missing emoji actions use authenticated JSON REST with the original image bytes', async () => {
  const f = fixture(); await f.uploads.resolve('emoji')(emoji);
  assert.deepEqual(f.calls, [{ url: '/guilds/123/emojis', body: { name: 'pony', image: emoji.image, roles: [] },
    oldFormErrors: true, failImmediatelyWhenRateLimited: true }]);
  assert.equal(f.calls[0].headers, undefined); assert.deepEqual(f.events, []);
});
test('missing sticker actions use native multipart with the prepared local file', async () => {
  const f = fixture(); const created = await f.uploads.resolve('sticker')(sticker);
  assert.equal(created.id, 'created'); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, '/guilds/123/stickers');
  assert.deepEqual(f.calls[0].body.getParts(), [['name', 'pony'], ['tags', 'slight_smile'], ['description', ''],
    ['file', { uri: sticker.uri, name: 'sticker.gif', type: 'image/gif' }]]);
  assert.equal(f.events[0].type, 'GUILD_STICKERS_CREATE_SUCCESS');
});
test('a late native action is chosen once and a failed native POST does not fall back to REST', async () => {
  const f = fixture(); let posts = 0;
  f.modules.push(Object.freeze({ async uploadEmoji() { posts++; throw new Error('timeout'); } }));
  await assert.rejects(f.uploads.resolve('emoji')(emoji), /timeout/);
  assert.equal(posts, 1); assert.equal(f.calls.length, 0);
});
test('native emoji actions that dispatch success and return void remain supported', async () => {
  const f = fixture(); let posts = 0;
  f.modules.push({ async uploadEmoji() { posts++; } });
  await f.uploads.resolve('emoji')(emoji); assert.equal(posts, 1); assert.equal(f.calls.length, 0);
});
test('canonical HTTP wins over an unrelated object with get/post/del methods', async () => {
  const f = fixture(); f.modules.push({ get() {}, del() {}, post() { assert.fail('wrong HTTP module'); } });
  await f.uploads.resolve('emoji')(emoji); assert.equal(f.calls.length, 1);
});
test('HTTP wrapper remains available when common HTTP access throws', async () => {
  const f = fixture(); Object.defineProperty(f.V.metro.common, 'RestAPI', { get() { throw new Error('unavailable'); } });
  f.modules.push({ HTTP: f.rest }); await f.uploads.resolve('emoji')(emoji); assert.equal(f.calls.length, 1);
});
for (const result of [{ status: 429, body: { message: 'Slow down' } }, { ok: false, status: 403 }, { status: 200, body: {} }])
test('unconfirmed or rejected REST creation cannot report success or retry: ' + JSON.stringify(result), async () => {
  const f = fixture(); f.rest.post = async input => { f.calls.push(input); return result; };
  await assert.rejects(f.uploads.resolve('sticker')(sticker));
  assert.equal(f.calls.length, 1); assert.deepEqual(f.events, []);
});
test('cancellation prevents dispatch and suppresses a late local success event', async () => {
  const f = fixture(), fail = () => { throw new Error('cancelled'); };
  await assert.rejects(f.uploads.resolve('sticker')(sticker, fail), /cancelled/); assert.equal(f.calls.length, 0);
  let checks = 0;
  await assert.rejects(f.uploads.resolve('sticker')(sticker, () => { if (++checks === 3) fail(); }), /cancelled/);
  assert.equal(f.calls.length, 1); assert.deepEqual(f.events, []);
});
test('non-native FormData is rejected before an invalid local-file POST', async () => {
  const f = fixture(), uploads = createExpressionUpload(f.V, { FormData: class { append() {} } });
  await assert.rejects(uploads.resolve('sticker')(sticker), /native multipart/); assert.equal(f.calls.length, 0);
});
test('native files require only write/remove and can resolve through the RN facade', () => {
  const f = fixture(), files = Object.freeze({ writeFile() {}, removeFile() {} });
  f.V.metro.common.ReactNative.NativeModules = { NativeFileModule: files };
  assert.equal(f.uploads.files(), files);
});
