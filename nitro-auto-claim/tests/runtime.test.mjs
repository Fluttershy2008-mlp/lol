import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createPlugin, extractCodes } from '../src/plugin.mjs';

const codeA = 'AbCdEf1234567890';
const codeB = 'BcDeFg1234567890';
const codeC = 'CdEfGh1234567890';
function fixture(storage = {}, responder = () => Promise.resolve({ status: 200, body: { id: 'entitlement' } })) {
  const handlers = new Map(), timers = new Map(), calls = [], toasts = [];
  let tick = Date.parse('2026-10-11T13:22:00Z'), seq = 0, account = '100';
  const clock = {
    Date: { now: () => tick },
    setTimeout(fn, delay) { const id = ++seq; timers.set(id, { at: tick + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const dispatcher = {
    subscribe(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); },
    unsubscribe(type, fn) { handlers.get(type)?.delete(fn); },
  };
  const api = { getAPIBaseURL() {}, get() {}, post(request) { calls.push({ ...request, account }); return responder(request); } };
  const userStore = { getCurrentUser: () => account ? { id: account } : null };
  const V = {
    plugin: { storage },
    metro: {
      common: { FluxDispatcher: dispatcher, React: { createElement() {}, useState() {}, useEffect() {} }, ReactNative: {} },
      findByStoreName: () => userStore,
      findByProps: (...props) => props.every(p => p in api) ? api : null,
    },
    ui: { toasts: { showToast: text => toasts.push(text) }, assets: { getAssetIDByName: () => 1 } },
  };
  const plugin = createPlugin(V, clock);
  async function advance(ms = 0) {
    tick += ms;
    for (let i = 0; i < 12; i++) {
      const due = [...timers].filter(([, timer]) => timer.at <= tick);
      for (const [id, timer] of due) { timers.delete(id); timer.fn(); }
      await Promise.resolve();
    }
  }
  const emit = (type, event) => { for (const fn of handlers.get(type) ?? []) fn(event); };
  const msg = (code = codeA, extra = {}) => ({ message: {
    id: String(1000 + ++seq), channel_id: '200', author: { id: '300' },
    timestamp: new Date(tick).toISOString(), content: `https://discord.gift/${code}`, ...extra,
  } });
  plugin.onLoad();
  return { plugin, V, storage, calls, toasts, emit, msg, advance, handlers, timers, clock, setAccount: value => { account = value; } };
}

test('recognizes complete official links and multiple codes without partial matches', () => {
  assert.deepEqual(extractCodes(`<https://discord.gift/${codeA}> discord.com/gifts/${codeB} https://www.discordapp.com/gifts/${codeA}`), [codeA, codeB]);
  assert.deepEqual(extractCodes(`https://discord.gift/${'x'.repeat(24)}?foo=1`), ['x'.repeat(24)]);
  assert.deepEqual(extractCodes(`https://discord.gift/${'x'.repeat(25)} https://discord.gift/short`), []);
});
test('rejects fake hosts, userinfo, redirects, insecure links and promo paths', () => {
  for (const text of [
    `https://fake.discord.gift/${codeA}`, `https://notdiscord.gift/${codeA}`,
    `https://evil.tld/discord.gift/${codeA}`, `https://discord.gift@evil.tld/${codeA}`,
    `https://evil.tld/?next=https://discord.gift/${codeA}`, `http://discord.gift/${codeA}`,
    `https://discord.com/billing/promotions/${codeA}`, `https://discord.gift/${codeA}/extra`,
  ]) assert.deepEqual(extractCodes(text), [], text);
});
test('claims once using the native client and persists duplicate protection', async () => {
  const f = fixture();
  const m = f.msg(); f.emit('MESSAGE_CREATE', m); f.emit('MESSAGE_CREATE', m);
  await f.advance();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, `/entitlements/gift-codes/${codeA}/redeem`);
  assert.deepEqual(f.calls[0].body, { channel_id: '200', payment_source_id: null });
  assert.equal(f.storage.accounts['100'].history[0].result, 'claimed');
  f.plugin.onUnload(); f.plugin.onLoad(); f.emit('MESSAGE_CREATE', f.msg()); await f.advance(2000);
  assert.equal(f.calls.length, 1);
  f.plugin.onUnload();
});
test('ignores own messages, old messages, optimistic messages and history embed updates', async () => {
  const f = fixture();
  f.emit('MESSAGE_CREATE', f.msg(codeA, { author: { id: '100' } }));
  f.emit('MESSAGE_CREATE', f.msg(codeA, { timestamp: '2020-01-01T00:00:00Z' }));
  f.emit('MESSAGE_CREATE', { ...f.msg(), optimistic: true });
  f.emit('MESSAGE_UPDATE', f.msg(codeA));
  f.emit('MESSAGE_UPDATE', f.msg(codeA, { edited_timestamp: '2020-01-01T00:00:00Z' }));
  await f.advance(); assert.equal(f.calls.length, 0);
  f.emit('MESSAGE_UPDATE', f.msg(codeB, { edited_timestamp: '2026-10-11T13:22:00Z' }));
  await f.advance(); assert.equal(f.calls.length, 1); f.plugin.onUnload();
});
test('serializes requests and applies spacing', async () => {
  let resolve;
  const f = fixture({}, () => new Promise(r => { resolve = r; }));
  f.emit('MESSAGE_CREATE', f.msg(codeA)); f.emit('MESSAGE_CREATE', f.msg(codeB));
  await f.advance(); assert.equal(f.calls.length, 1);
  await f.advance(5000); assert.equal(f.calls.length, 1);
  resolve({ status: 200 }); await f.advance();
  await f.advance(1499); assert.equal(f.calls.length, 1);
  await f.advance(1); assert.equal(f.calls.length, 2);
  resolve({ status: 200 }); await f.advance(); f.plugin.onUnload();
});
test('pauses on rate limits without retrying or draining queued gifts', async () => {
  const f = fixture({}, () => Promise.reject({ status: 429, body: { retry_after: 1 } }));
  f.emit('MESSAGE_CREATE', f.msg(codeA)); f.emit('MESSAGE_CREATE', f.msg(codeB));
  await f.advance(); await f.advance(10000);
  assert.equal(f.calls.length, 1); assert.equal(f.storage.enabled, false);
  assert.equal(f.storage.accounts['100'].history[0].result, 'paused');
  f.plugin.onUnload();
});
test('invalid gifts record failure and never claim success', async () => {
  const f = fixture({}, () => Promise.reject({ status: 404, body: { code: 10038 }, token: 'secret' }));
  f.emit('MESSAGE_CREATE', f.msg()); await f.advance();
  assert.equal(f.storage.accounts['100'].history[0].result, 'failed');
  assert.ok(!JSON.stringify(f.storage).includes('secret'));
  f.plugin.onUnload();
});
test('unknown timeout outcome pauses and late success cannot overwrite it', async () => {
  let resolve;
  const f = fixture({}, () => new Promise(r => { resolve = r; }));
  f.emit('MESSAGE_CREATE', f.msg(codeA)); f.emit('MESSAGE_CREATE', f.msg(codeB));
  await f.advance(); await f.advance(20000);
  assert.equal(f.storage.enabled, false); assert.equal(f.calls.length, 1);
  resolve({ status: 200 }); await f.advance(5000);
  assert.equal(f.storage.accounts['100'].history[0].result, 'paused'); f.plugin.onUnload();
});
test('account changes cancel old queued gifts and scope duplicate history', async () => {
  const f = fixture();
  f.emit('MESSAGE_CREATE', f.msg(codeA)); f.emit('MESSAGE_CREATE', f.msg(codeB));
  await f.advance(); f.setAccount('999');
  f.emit('MESSAGE_CREATE', f.msg(codeC)); await f.advance(2000);
  assert.deepEqual(f.calls.map(x => x.account), ['100', '999']);
  assert.ok(!f.calls.some(x => x.url.includes(codeB)));
  assert.equal(f.storage.accounts['999'].history.length, 1); f.plugin.onUnload();
});
test('disconnect and unload cancel queued work and remove all subscriptions', async () => {
  const f = fixture();
  f.emit('MESSAGE_CREATE', f.msg()); f.emit('CONNECTION_CLOSED', {}); await f.advance();
  assert.equal(f.calls.length, 0);
  f.emit('CONNECTION_OPEN', {}); f.emit('MESSAGE_CREATE', f.msg(codeB));
  f.plugin.onUnload(); await f.advance(5000);
  assert.equal(f.calls.length, 0);
  assert.ok([...f.handlers.values()].every(set => set.size === 0)); assert.equal(f.timers.size, 0);
});
test('unload and reload while a request is pending never start a second request', async () => {
  let resolve;
  const f = fixture({}, () => new Promise(r => { resolve = r; }));
  f.emit('MESSAGE_CREATE', f.msg(codeA)); await f.advance();
  f.plugin.onUnload(); f.plugin.onLoad(); f.emit('MESSAGE_CREATE', f.msg(codeB)); await f.advance();
  assert.equal(f.calls.length, 1);
  resolve({ status: 200 }); await f.advance(); await f.advance(1500);
  assert.equal(f.calls.length, 2);
  resolve({ status: 200 }); await f.advance(); f.plugin.onUnload();
});
test('generated bundle loads using Revenge expression wrapper and hash matches', async () => {
  const bundle = await readFile(new URL('../index.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  const f = fixture(); f.plugin.onUnload();
  const loaded = new Function('vendetta', `return ${bundle}`)(f.V);
  assert.equal(typeof loaded.onLoad, 'function'); assert.equal(typeof loaded.settings, 'function');
  loaded.onLoad(); loaded.onUnload();
  assert.equal(manifest.hash, createHash('sha256').update(bundle).digest('hex'));
});
