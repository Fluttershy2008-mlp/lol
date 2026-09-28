import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const bundle = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

test('install bundle evaluates with Revenge’s exact expression wrapper and context', async () => {
  const events = [], hooks = [], cleanups = [];
  const storage = { enabled: true, config: { appName: 'Bundle test', type: 0 } };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const value = typeof initial === 'function' ? initial() : initial; hooks.push(value); return [value, () => {}]; },
    useEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
  };
  const RN = Object.fromEntries(['Pressable', 'View', 'Text', 'TextInput', 'ScrollView', 'KeyboardAvoidingView'].map(name => [name, name]));
  Object.assign(RN, { Platform: { OS: 'android' }, Alert: { alert() {} }, useColorScheme: () => 'dark', AppState: { addEventListener: () => ({ remove() {} }) } });
  const constants = { SETTING_RENDERER_CONFIG: { BUNNY: { parent: null }, BUNNY_PLUGINS: { parent: null },
    BUNNY_THEMES: { parent: null }, ACCOUNT_SWITCHER: { parent: null }, BUNNY_CUSTOM_PAGE: { type: 'route', parent: null } } };
  const navigation = [];
  const vendetta = { plugin: { storage }, metro: { common: { React, ReactNative: RN,
    FluxDispatcher: { dispatch: event => events.push(event), subscribe() {}, unsubscribe() {} } },
    findByProps: key => key === 'SETTING_RENDERER_CONFIG' ? constants
      : key === 'getRootNavigationRef' ? { getRootNavigationRef: () => ({ navigate: (...args) => navigation.push(args) }) } : undefined,
    findByStoreName: () => undefined }, logger: { error() {} } };
  const rows = [{ key: 'BUNNY' }, { key: 'BUNNY_PLUGINS' }, { key: 'BUNNY_THEMES' }, { key: 'ACCOUNT_SWITCHER' }];
  const originalRows = [...rows];
  const bunny = { ui: { settings: { registeredSections: { Revenge: rows, Bunny: [], Vendetta: [] } } } };
  const plugin = vm.runInNewContext(`(vendetta => { return ${bundle}\n})`, { setTimeout, clearTimeout, bunny })(vendetta);
  assert.equal(typeof plugin.onLoad, 'function'); assert.equal(typeof plugin.settings, 'function');
  plugin.onLoad(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(events[0].activity.name, 'Bundle test');
  const shortcut = rows[2];
  assert.equal(shortcut.title(), 'CustomRPC');
  assert.equal((await shortcut.render()).default, plugin.settings);
  const renderer = constants.SETTING_RENDERER_CONFIG[shortcut.key];
  assert.equal(renderer.parent, null); assert.equal(renderer.usePredicate(), true);
  renderer.onPress();
  assert.equal(navigation[0][0], 'BUNNY_CUSTOM_PAGE');
  assert.equal(navigation[0][1].render().type, plugin.settings);
  plugin.onLoad(); assert.equal(rows.length, originalRows.length + 1);
  const tree = plugin.settings();
  assert.equal(tree.type, 'KeyboardAvoidingView');
  function materialize(node) {
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return materialize(node.type(node.props));
    for (const child of node.props?.children ?? []) materialize(child);
    return node;
  }
  materialize(tree);
  assert.ok(hooks.length > 5);
  for (const cleanup of cleanups) cleanup();
  plugin.onUnload();
  assert.equal(events.at(-1).activity, null);
  assert.equal(events[0].socketId, events.at(-1).socketId);
  assert.deepEqual(rows, originalRows);
  assert.equal(constants.SETTING_RENDERER_CONFIG[shortcut.key].usePredicate(), false);
  assert.equal(renderer.usePredicate(), false, 'captured renderer entries also become hidden');
  // Updating/re-enabling the plugin must add exactly one shortcut.
  plugin.onLoad(); assert.equal(rows.length, originalRows.length + 1);
  plugin.onUnload(); assert.deepEqual(rows, originalRows);
});

test('manifest hash matches the exact install bundle and no imports remain', () => {
  assert.equal(manifest.main, 'index.js');
  assert.equal(manifest.hash, createHash('sha256').update(bundle).digest('hex'));
  assert.doesNotMatch(bundle, /(?:require\(|from ["']@vendetta|FluxContainer\(Alert\)|getToken)/);
  assert.match(bundle, /GPL-3\.0-or-later/);
});
