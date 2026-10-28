import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpressionUpload, expressionResponse } from './expression-upload.mjs';

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

for (const [label, response] of [
  ['JSON text', { status: 201, text: '{"id":"created"}' }],
  ['string body', { status: 201, body: '{"id":"created"}' }],
  ['data envelope', { status: 201, data: { id: 'created' } }],
  ['nested body', { status: 201, data: { body: { id: 'created' } } }],
  ['Fetch response', new Response('{"id":"created"}', { status: 201 })],
  ['promised body', { status: 201, body: Promise.resolve({ id: 'created' }) }],
]) test('creation accepts ' + label + ' without a second POST', async () => {
  const f = fixture(); f.rest.post = async input => { f.calls.push(input); return response; };
  assert.equal((await f.uploads.resolve('emoji')(emoji)).id, 'created'); assert.equal(f.calls.length, 1);
});

test('a successful empty response is verified by a new server ID, with one POST', async () => {
  const f = fixture(), list = [{ id: 'old', name: 'pony' }], reads = [];
  f.rest.get = async input => { reads.push(input); return { text: JSON.stringify(list) }; };
  f.rest.post = async input => { f.calls.push(input); list.push({ id: 'created', name: 'pony' }); return { status: 201 }; };
  assert.equal((await f.uploads.resolve('emoji')(emoji)).id, 'created');
  assert.equal(f.calls.length, 1); assert.equal(reads.length, 2);
});
for (const extra of [[], [{ id: 'other1', name: 'pony' }, { id: 'other2', name: 'pony' }]])
test('read-back does not mistake existing or ambiguous names for this upload: ' + extra.length, async () => {
  const f = fixture(), list = [{ id: 'old', name: 'pony' }];
  f.rest.get = async () => ({ body: [...list] });
  f.rest.post = async input => { f.calls.push(input); list.push(...extra); return { status: 201 }; };
  await assert.rejects(f.uploads.resolve('emoji')(emoji), /did not confirm/); assert.equal(f.calls.length, 1);
});
test('HTTP errors in JSON text retain their status and Discord message', async () => {
  const f = fixture(); f.rest.post = async () => new Response('{"code":50013,"message":"Missing permissions"}', { status: 403 });
  await assert.rejects(f.uploads.resolve('emoji')(emoji), error => error.status === 403 && error.body.code === 50013);
});
test('an unreadable response cannot become a created expression', async () => {
  assert.equal(await expressionResponse({ status: 201, text: '<html>broken</html>' }), undefined);
});
test('an unavailable preflight read does not block an explicitly confirmed upload', async () => {
  const f = fixture(); f.rest.get = async () => { throw new Error('read unavailable'); };
  assert.equal((await f.uploads.resolve('emoji')(emoji)).id,'created'); assert.equal(f.calls.length,1);
});
test('a new expression belonging to another user cannot confirm an empty response', async () => {
  const f = fixture(); let posted = false;
  f.V.metro.findByStoreName = () => ({ getCurrentUser: () => ({ id: 'me' }) });
  f.rest.get = async () => ({ body: posted ? [{ id: 'new', name: 'pony', user: { id: 'other' } }] : [] });
  f.rest.post = async input => { f.calls.push(input); posted = true; return { status: 201 }; };
  await assert.rejects(f.uploads.resolve('emoji')(emoji),/did not confirm/); assert.equal(f.calls.length,1);
});
test('account cancellation during a preflight read stops the write', async () => {
  const f = fixture(); let current = true;
  f.rest.get = async () => { current = false; return { body: [] }; };
  await assert.rejects(f.uploads.resolve('emoji')(emoji,() => { if (!current) throw new Error('cancelled'); }),/cancelled/);
  assert.equal(f.calls.length,0);
});
