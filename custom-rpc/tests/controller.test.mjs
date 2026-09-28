import test from 'node:test';
import assert from 'node:assert/strict';
import { createController, SOCKET_ID } from '../src/controller.js';

const config = { appName: 'Pony', type: 0 };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
  const events = [], listeners = new Map();
  let nativeListener, removed = 0;
  const storage = options.storage ?? {};
  const controller = createController({
    storage,
    dispatcher: { dispatch: event => events.push(event), subscribe: (event, callback) => listeners.set(event, callback),
      unsubscribe: (event, callback) => { assert.equal(listeners.get(event), callback); listeners.delete(event); } },
    appState: { addEventListener: (_, listener) => { nativeListener = listener; return { remove: () => { removed++; } }; } },
    resolveAsset: async () => '1234', minInterval: 0, ...options,
  });
  controller.load();
  return { controller, storage, events, listeners, get nativeListener() { return nativeListener; }, get removed() { return removed; } };
}

test('first install publishes nothing until Apply; stop removes only our socket', async () => {
  const f = fixture(); assert.equal(f.events.length, 0);
  assert.equal(await f.controller.apply(config), true);
  assert.equal(f.storage.enabled, true); assert.equal(f.controller.getStatus().running, true);
  f.controller.stop();
  assert.equal(f.storage.enabled, false);
  assert.deepEqual(f.events.map(event => [event.socketId, event.activity?.name ?? null]), [[SOCKET_ID, 'Pony'], [SOCKET_ID, null]]);
  f.controller.unload(); assert.equal(f.events.length, 2);
});

test('unload clears activity, removes listeners and retains resume preference', async () => {
  const f = fixture({ storage: { enabled: true, config } }); await tick();
  assert.equal(f.events[0].activity.name, 'Pony');
  assert.equal(f.listeners.size, 2);
  f.controller.unload();
  assert.equal(f.events.at(-1).activity, null); assert.equal(f.storage.enabled, true);
  assert.equal(f.listeners.size, 0); assert.equal(f.removed, 1);
});

test('Stop cancels an in-flight image lookup so it cannot republish later', async () => {
  let complete;
  const f = fixture({ resolveAsset: () => new Promise(resolve => { complete = resolve; }) });
  const operation = f.controller.apply({ ...config, imageBig: 'https://example.com/pony.png' });
  f.controller.stop(); complete('1234');
  assert.equal(await operation, false); assert.equal(f.events.length, 0);
  assert.equal(f.storage.enabled, false); assert.equal(f.controller.getStatus().busy, false);
  f.controller.unload();
});

test('a newer apply wins over an older asynchronous edit', async () => {
  let complete;
  const f = fixture({ resolveAsset: () => new Promise(resolve => { complete = resolve; }) });
  const stale = f.controller.apply({ ...config, appName: 'Old', imageBig: 'https://example.com/a.png' });
  assert.equal(await f.controller.apply({ ...config, appName: 'New' }), true);
  complete('1234'); assert.equal(await stale, false);
  assert.equal(f.events.length, 1); assert.equal(f.events[0].activity.name, 'New');
  assert.equal(f.storage.config.appName, 'New'); f.controller.unload();
});

test('Stop also cancels an update waiting for the send interval', async () => {
  const f = fixture({ minInterval: 10000 });
  await f.controller.apply(config);
  const pending = f.controller.apply({ ...config, state: 'Edited' }); await tick();
  f.controller.stop(); assert.equal(await pending, false);
  assert.equal(f.events.length, 2); assert.equal(f.events[1].activity, null);
  f.controller.unload();
});

test('foreground and reconnect coalesce; unloaded callbacks do nothing', async () => {
  const f = fixture(); await f.controller.apply(config);
  const callback = f.listeners.get('CONNECTION_OPEN');
  callback(); f.nativeListener('active');
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.equal(f.events.filter(event => event.activity).length, 2);
  f.controller.unload(); callback(); f.nativeListener('active');
  assert.equal(f.events.length, 3); assert.equal(f.events[2].activity, null);
});

test('unload during image resolution prevents a late publish', async () => {
  let complete;
  const f = fixture({ resolveAsset: () => new Promise(resolve => { complete = resolve; }) });
  const pending = f.controller.apply({ ...config, imageBig: 'https://example.com/a.png' });
  f.controller.unload(); complete('1234');
  assert.equal(await pending, false); assert.equal(f.events.length, 0);
});

test('invalid edits and a missing dispatcher report errors without throwing at startup', async () => {
  const f = fixture(); await f.controller.apply(config);
  assert.equal(await f.controller.apply({ appName: '' }), false);
  assert.equal(f.storage.config.appName, 'Pony'); assert.equal(f.events.length, 1);
  f.controller.unload();
  const missing = fixture({ dispatcher: undefined });
  assert.equal(await missing.controller.apply(config), false);
  assert.match(missing.controller.getStatus().message, /dispatcher is unavailable/);
  assert.equal(missing.storage.enabled, false); missing.controller.unload();
});
