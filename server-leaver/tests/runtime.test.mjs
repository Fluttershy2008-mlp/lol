import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const bundle = await fs.readFile(new URL('../index.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await fs.readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const U = '322423286283632660', V = '422423286283632660';
const A = '100000000000000001', B = '100000000000000002', C = '100000000000000003';
const MAIN = JSON.parse(await fs.readFile(new URL('./main-ids.json', import.meta.url), 'utf8'));
function runtime(initial = {}) {
  let user = U, finish, accountListener, appListener;
  const calls = [], alerts = [], storage = initial, guilds = { [A]: { id: A, name: 'A', ownerId: V }, [B]: { id: B, name: 'B', ownerId: V } };
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: value => [value, () => {}], useCallback: value => value, useEffect: () => {} };
  const RN = { View: 'View', Text: 'Text', TextInput: 'Input', FlatList: 'List', Pressable: 'Button',
    Alert: { alert: (...args) => alerts.push(args) },
    AppState: { currentState: 'active', addEventListener: (_, fn) => { appListener = fn; return { remove() { appListener = null; } }; } } };
  const users = { getCurrentUser: () => ({ id: user }), getUser() {}, addChangeListener: fn => accountListener = fn,
    removeChangeListener: () => accountListener = null };
  const guildStore = { getGuilds: () => guilds, getGuild: id => guilds[id] };
  const HTTP = { del: options => { calls.push(options); return new Promise(resolve => { finish = resolve; }); } };
  const vendetta = { plugin: { storage }, logger: { error() {} }, metro: { common: { React, ReactNative: RN },
    findByStoreName: name => name === 'GuildStore' ? guildStore : name === 'UserStore' ? users : undefined,
    findByProps: (...keys) => keys[0] === 'HTTP' ? { HTTP } : undefined } };
  const context = vm.createContext({ vendetta, console, setTimeout: (fn, delay) => { if (delay === 1500) queueMicrotask(fn); return 1; },
    clearTimeout() {}, setInterval() {}, clearInterval() {} });
  // Exactly the Revenge Vendetta compatibility loader's expression wrapper.
  const plugin = vm.runInContext(`(vendetta => { return ${bundle}\n })`, context)(vendetta);
  return { plugin, calls, alerts, storage, guilds, setUser: id => { user = id; accountListener?.(); },
    background: () => { RN.AppState.currentState = 'background'; appListener?.('background'); },
    finish: status => finish({ status }), hasListeners: () => !!accountListener || !!appListener };
}
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function findButton(node, label) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Button' && node.props.accessibilityLabel === label) return node;
  for (const child of [...(node.children ?? []), node.props?.ListHeaderComponent]) { const found = findButton(child, label); if (found) return found; }
}
test('manifest has the exact build hash and loader exports lifecycle/settings', () => {
  assert.equal(manifest.hash, createHash('sha256').update(bundle).digest('hex'));
  const r = runtime(); assert.equal(typeof r.plugin.settings, 'function'); r.plugin.onLoad(); assert.deepEqual(r.calls, []); r.plugin.onUnload();
});
test('settings render and canceling confirmation sends no leave request', () => {
  const r = runtime(); r.plugin.onLoad(); r.plugin.controller.save(U, A);
  const ui = r.plugin.settings(); findButton(ui, 'Leave 1 unprotected servers').props.onPress();
  assert.equal(r.alerts[0][0], 'Leave these servers?'); assert.equal(r.alerts[0][2][0].style, 'cancel');
  assert.deepEqual(r.calls, []); r.plugin.onUnload();
});
test('additional protected IDs are scoped to each account while main IDs remain protected', () => {
  const r = runtime(); r.plugin.onLoad(); r.plugin.controller.save(U, A); r.setUser(V);
  assert.deepEqual(Array.from(r.plugin.controller.freshPlan(V).ids), MAIN); r.setUser(U);
  assert.ok(r.plugin.controller.freshPlan(U).ids.includes(A)); r.plugin.onUnload();
});
test('stale confirmation is rejected if a new server appears', async () => {
  const r = runtime(); r.plugin.onLoad(); const plan = r.plugin.controller.freshPlan(U);
  r.guilds[C] = { id: C, name: 'C', ownerId: V };
  await assert.rejects(r.plugin.controller.execute(plan, r.plugin.controller.getEpoch()), /changed/);
  assert.deepEqual(r.calls, []); r.plugin.onUnload();
});
test('double execution is rejected and native request uses only the approved guild', async () => {
  const r = runtime(); r.plugin.onLoad(); r.plugin.controller.save(U, A);
  const plan = r.plugin.controller.freshPlan(U), epoch = r.plugin.controller.getEpoch();
  const running = r.plugin.controller.execute(plan, epoch);
  assert.equal(r.calls[0].url, `/users/@me/guilds/${B}`);
  await assert.rejects(r.plugin.controller.execute(plan, epoch), /already running/);
  r.finish(204); await running; assert.equal(r.calls.length, 1); r.plugin.onUnload();
});
for (const action of ['stop', 'unload', 'account', 'background']) test(`${action} during first request prevents any second request`, async () => {
  const r = runtime(); r.plugin.onLoad(); const p = r.plugin.controller;
  const running = p.execute(p.freshPlan(U), p.getEpoch());
  if (action === 'stop') p.stop();
  if (action === 'unload') r.plugin.onUnload();
  if (action === 'account') { r.setUser(V); r.setUser(U); }
  if (action === 'background') r.background();
  r.finish(204); await running; await tick(); assert.equal(r.calls.length, 1); assert.equal(p.isRunning(), false);
  r.plugin.onUnload(); assert.equal(r.hasListeners(), false);
});
test('disabling/re-enabling invalidates an old confirmation', async () => {
  const r = runtime(); r.plugin.onLoad(); const p = r.plugin.controller, plan = p.freshPlan(U), epoch = p.getEpoch();
  r.plugin.onUnload(); r.plugin.onLoad(); await assert.rejects(p.execute(plan, epoch), /changed/);
  assert.deepEqual(r.calls, []); r.plugin.onUnload();
});

test('upgrading merges main protection without replacing the account’s existing saved IDs', () => {
  const r = runtime({ accounts: { [U]: [A] } }); r.plugin.onLoad();
  const p = r.plugin.controller.freshPlan(U);
  assert.deepEqual(Array.from(p.ids), [...MAIN, A]); assert.deepEqual(r.storage.accounts[U], [A]);
  assert.deepEqual(r.calls, []); r.plugin.onUnload();
});

test('saving an empty field retains all main protection and still requires leave confirmation', () => {
  const r = runtime(); r.plugin.onLoad(); r.plugin.controller.save(U, '');
  assert.deepEqual(Array.from(r.storage.accounts[U]), MAIN);
  for (const id of MAIN) r.guilds[id] = { id, name: id, ownerId: V };
  const p = r.plugin.controller.freshPlan(U);
  assert.ok(p.kept.filter(row => MAIN.includes(row.id)).every(row => row.reason === 'Main protected'));
  assert.equal(p.kept.length, 22); assert.deepEqual(r.calls, []); r.plugin.onUnload();
});
