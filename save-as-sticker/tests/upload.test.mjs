import test from 'node:test';
import assert from 'node:assert/strict';
import { createStickerUpload, stickerValidationError } from '../src/upload.mjs';

const input = { guildId: '123',name: 'Test',tags: 'slight_smile',description: '',uri: 'file:///cache/test.png',mimeType: 'image/png' };
class Form {
  constructor() { this.parts = []; }
  append(...args) { assert.equal(args.length,2); this.parts.push(args); }
  getParts() { return this.parts; }
}
function fixture() {
  const posts = [],reads = [],events = [],delays = []; let native = 0;
  const rest = { marker: true,
    async get(request) { assert.equal(this.marker,true); reads.push(request); return { body: [] }; },
    async post(request) { assert.equal(this.marker,true); posts.push(request); return { status: 201,body: { id: 'new',name: 'Test' } }; } };
  const V = { host: { id: 'valenced' },metro: { common: { RestAPI: rest,ReactNative: {},FluxDispatcher: { dispatch: event => events.push(event) } },
    findByStoreName: () => ({ getCurrentUser: () => ({ id: 'me' }) }),
    findByProps: (...props) => props.includes('createGuildSticker') ? { createGuildSticker() { native++; } } : undefined } };
  const env = { FormData: Form,setTimeout(fn,delay) { delays.push(delay); queueMicrotask(fn); return {}; },clearTimeout() {} };
  return { V,env,rest,posts,reads,events,delays,native: () => native,upload: () => createStickerUpload(V,env).resolve('sticker') };
}

test('Valenced stickers use one signed-in multipart request even when an internal action returns void', async () => {
  const f = fixture(), created = await f.upload()(input);
  assert.equal(created.id,'new'); assert.equal(f.native(),0); assert.equal(f.posts.length,1);
  assert.equal(f.posts[0].url,'/guilds/123/stickers'); assert.equal(f.posts[0].headers,undefined);
  assert.equal(f.posts[0].failImmediatelyWhenRateLimited,true);
  assert.equal(f.posts[0].body,undefined,'mobile HTTP must not receive a FormData object through .send()');
  assert.deepEqual(f.posts[0].fields,[{ name: 'name',value: 'Test' },{ name: 'tags',value: 'slight_smile' },{ name: 'description',value: '' }]);
  assert.deepEqual(f.posts[0].attachments,[{ name: 'file',file: { uri: input.uri,name: 'sticker.png',type: 'image/png' } }]);
  assert.equal(f.events[0].sticker.id,'new'); assert.equal(f.events[0].sticker.guild_id,'123');
  assert.equal(f.events[0].sticker.user_id,'me','the cache event keeps the mobile action’s creator ID');
});

test('an empty success is confirmed after server propagation without another upload', async () => {
  const f = fixture(); let reads = 0;
  f.rest.get = async request => { f.reads.push(request); return { body: ++reads < 3 ? [{ id: 'old',name: 'Test' }]
    : [{ id: 'old',name: 'Test' },{ id: 'new',name: 'Test',user: { id: 'me' },guild_id: '123',format_type: 1 }] }; };
  f.rest.post = async request => { f.posts.push(request); return { status: 201 }; };
  assert.equal((await f.upload()(input)).id,'new'); assert.equal(f.posts.length,1);
  assert.equal(f.reads.length,3); assert.deepEqual(f.delays,[350]);
});

test('a wrapper returning void can be confirmed by a new server ID', async () => {
  const f = fixture(); let posted = false;
  f.rest.get = async () => ({ body: posted ? [{ id: 'new',name: 'Test' }] : [] });
  f.rest.post = async request => { f.posts.push(request); posted = true; };
  assert.equal((await f.upload()(input)).id,'new'); assert.equal(f.posts.length,1);
});

test('verification is bounded and cannot mistake an existing same-name sticker for a new upload', async () => {
  const f = fixture(); f.rest.get = async request => { f.reads.push(request); return { body: [{ id: 'old',name: 'Test' }] }; };
  f.rest.post = async request => { f.posts.push(request); return { status: 201 }; };
  await assert.rejects(f.upload()(input),/did not confirm/);
  assert.equal(f.posts.length,1); assert.equal(f.reads.length,5); assert.deepEqual(f.delays,[350,750,1500]); assert.equal(f.events.length,0);
});

test('ambiguous new IDs cannot confirm a sticker', async () => {
  const f = fixture(); let posted = false;
  f.rest.get = async () => ({ body: posted ? [{ id: 'one',name: 'Test' },{ id: 'two',name: 'Test' }] : [] });
  f.rest.post = async request => { f.posts.push(request); posted = true; return { status: 201 }; };
  await assert.rejects(f.upload()(input),/did not confirm/); assert.equal(f.posts.length,1); assert.equal(f.events.length,0); assert.equal(f.delays.length,0);
});

for (const mismatch of [{ user: { id: 'other' } },{ user_id: 'other' },{ guild_id: 'other' },{ format_type: 4 }])
test('verification rejects unrelated sticker metadata: ' + JSON.stringify(mismatch), async () => {
  const f = fixture(); let posted = false;
  f.rest.get = async () => ({ body: posted ? [{ id: 'new',name: 'Test',...mismatch }] : [] });
  f.rest.post = async request => { f.posts.push(request); posted = true; return { status: 201 }; };
  await assert.rejects(f.upload()(input),/did not confirm/); assert.equal(f.posts.length,1); assert.equal(f.events.length,0);
});

test('Back aborts a verification wait and removes its timer before another read', async () => {
  const f = fixture(), timers = new Map(), controller = new AbortController();
  f.env.setTimeout = fn => { const id = {}; timers.set(id,fn); return id; }; f.env.clearTimeout = id => timers.delete(id);
  f.rest.post = async request => { f.posts.push(request); return { status: 201 }; };
  const waiting = f.upload()(input,() => {},controller.signal);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(timers.size,1);
  controller.abort(); await assert.rejects(waiting,error => error.code === 'E_PICKER_CANCELLED');
  assert.equal(timers.size,0); assert.equal(f.posts.length,1); assert.equal(f.reads.length,2); assert.equal(f.events.length,0);
});

test('Discord errors retain the original status and do not fall back to an internal upload', async () => {
  const f = fixture(); f.rest.post = async request => { f.posts.push(request); return { status: 403,body: { code: 50013,message: 'Missing Permissions' } }; };
  await assert.rejects(f.upload()(input),error => error.status === 403 && error.body.code === 50013);
  assert.equal(f.posts.length,1); assert.equal(f.native(),0); assert.equal(f.reads.length,1);
});

test('a confirmed response succeeds even when the preflight list is unavailable', async () => {
  const f = fixture(); f.rest.get = async () => { throw new Error('read unavailable'); };
  assert.equal((await f.upload()(input)).id,'new'); assert.equal(f.posts.length,1);
});

test('classic and Next sticker action selection is preserved', async () => {
  const f = fixture(); delete f.V.host;
  f.V.metro.findByProps = () => ({ createGuildSticker() { return { id: 'legacy' }; } });
  assert.equal((await f.upload()(input)).id,'legacy'); assert.equal(f.posts.length,0);
});

test('Valenced multipart is built by the client and needs no plugin FormData global', async () => {
  const f = fixture(); delete f.env.FormData;
  assert.equal((await f.upload()(input)).id,'new'); assert.equal(f.posts.length,1);
});

test('form validation reports the rejected file and name instead of hiding their details', () => {
  const error = { body: { code: 50035,message: 'Invalid Form Body',errors: {
    file: { _errors: [{ code: 'STICKER_INVALID_FILE',message: 'File is not a valid PNG.' }] },
    name: { _errors: [{ code: 'BASE_TYPE_REQUIRED',message: 'This field is required.' }] },
  } } };
  assert.equal(stickerValidationError(error),'Discord rejected the sticker:\nSticker file: File is not a valid PNG.\nSticker name: This field is required.');
  assert.equal(stickerValidationError({ body: JSON.stringify(error.body) }),stickerValidationError(error));
});

test('validation formatting is bounded and never renders message objects as React children', () => {
  const errors = { file: { _errors: Array.from({ length: 20 },() => ({ message: 'x'.repeat(1000) })) } };
  errors.loop = errors;
  const result = stickerValidationError({ body: { errors } });
  assert.equal(result.split('\n').length,7); assert.ok(result.length < 1300);
  assert.equal(stickerValidationError({ body: { errors: { file: { _errors: [{ message: { locale: 'en',ast: [] } }] } } } }),undefined);
});
