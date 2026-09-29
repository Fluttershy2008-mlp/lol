import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';
import { createPlugin } from '../src/plugin.js';
import { registerSettingsShortcut, SHORTCUT_KEY } from '../src/shortcut.js';

function harness() {
  const instances = new Map();
  let instance, cursor;
  const cleanups = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const row = instance, i = cursor++;
      if (!(i in row)) row[i] = initial;
      return [row[i], value => { row[i] = typeof value === 'function' ? value(row[i]) : value; }];
    },
    useEffect(callback) {
      const i = cursor++;
      if (!(i in instance)) { instance[i] = true; const cleanup = callback(); if (cleanup) cleanups.push(cleanup); }
    },
  };
  const render = (Component, props = {}, key = Component) => {
    if (!instances.has(key)) instances.set(key, []);
    instance = instances.get(key); cursor = 0;
    return Component(props);
  };
  const alerts = [], writes = [], commands = [], pages = [];
  const watch = new Set();
  let account = '100';
  const userStore = { getCurrentUser: () => ({ id: account }), addChangeListener: cb => watch.add(cb), removeChangeListener: cb => watch.delete(cb) };
  const protoStore = { settings: { status: {} } };
  const actions = { updateAsync: async (_, mutate) => { mutate(protoStore.settings.status); writes.push(protoStore.settings.status.customStatus); for (const cb of watch) cb(); } };
  const modules = [{ PreloadedUserSettingsActionCreators: actions }, { getRootNavigationRef: () => ({ navigate: (...args) => pages.push(args) }) }];
  const RN = Object.fromEntries(['View', 'Text', 'TextInput', 'ScrollView', 'Pressable', 'Image', 'Modal', 'KeyboardAvoidingView'].map(x => [x, x]));
  RN.Alert = { alert: (...args) => alerts.push(args) };
  RN.useColorScheme = () => 'dark';
  RN.Platform = { OS: 'android' };
  const storage = {};
  const V = { plugin: { storage }, metro: { common: { React, ReactNative: RN },
    findByProps: (...keys) => modules.find(m => keys.every(k => k in m)),
    findByStoreName: name => ({ UserStore: userStore, UserSettingsProtoStore: protoStore })[name],
  }, commands: { registerCommand(command) { commands.push(command); return () => commands.splice(commands.indexOf(command), 1); } } };
  const plugin = createPlugin(V, {});
  function screen() {
    const root = render(plugin.settings);
    return render(root.type, root.props, root.props.key);
  }
  function find(tree, predicate) {
    if (!tree || typeof tree !== 'object') return null;
    if (Array.isArray(tree)) { for (const child of tree) { const found = find(child, predicate); if (found) return found; } return null; }
    if (predicate(tree)) return tree;
    return find(tree.props?.children, predicate);
  }
  const label = name => {
    const el = find(screen(), el => el.props?.accessibilityLabel === name);
    assert.ok(el, `Missing control: ${name}`);
    return el;
  };
  return { V, plugin, screen, label, alerts, writes, commands, pages, watch, storage,
    account: value => { account = value; }, cleanup: () => cleanups.splice(0).forEach(fn => fn()) };
}

test('mobile settings can create, apply, edit, capture and delete a preset with native controls', async () => {
  const f = harness();
  f.plugin.onLoad();
  f.label('+ New preset').props.onPress();
  f.label('Preset name').props.onChangeText('Gaming');
  f.label('Status text').props.onChangeText('Playing with friends');
  f.label('Emoji (optional)').props.onChangeText('🎮');
  f.label('1 hour').props.onPress();
  f.label('Save preset').props.onPress();
  assert.equal(f.writes.length, 0);
  f.label('Apply Gaming').props.onPress();
  await setImmediate();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].emojiName, '🎮');
  assert.equal(f.writes[0].text, 'Playing with friends');
  f.label('Edit Gaming').props.onPress();
  f.label('Preset name').props.onChangeText('Relaxing');
  f.label('Save preset').props.onPress();
  assert.equal(f.storage.accounts['100'].presets[0].name, 'Relaxing');
  f.label('Save current status').props.onPress();
  assert.equal(f.label('Status text').props.value, 'Playing with friends');
  f.label('Cancel').props.onPress();
  f.label('Delete Relaxing').props.onPress();
  f.alerts.at(-1)[2].find(b => b.text === 'Delete').onPress();
  assert.equal(f.storage.accounts['100'].presets.length, 0);
  assert.equal(f.writes.length, 1);
  f.cleanup(); f.plugin.onUnload();
  assert.equal(f.watch.size, 0);
  assert.equal(f.commands.length, 0);
});

test('local command opens the page without returning a chat message, and lifecycle is idempotent', () => {
  const f = harness();
  f.plugin.onLoad(); f.plugin.onLoad();
  assert.equal(f.commands.length, 1);
  assert.equal(f.commands[0].name, 'statuspresets');
  assert.equal(f.commands[0].execute(), undefined);
  assert.equal(f.pages[0][0], 'BUNNY_CUSTOM_PAGE');
  assert.equal(f.writes.length, 0);
  f.plugin.onUnload(); f.plugin.onUnload();
  f.plugin.onLoad();
  assert.equal(f.commands.length, 1);
  f.plugin.onUnload();
});

test('a new account remounts the editor so a previous draft is not saved to it', () => {
  const f = harness(); f.plugin.onLoad();
  f.label('+ New preset').props.onPress();
  f.label('Preset name').props.onChangeText('Private draft');
  const oldKey = f.plugin.settings;
  f.account('200');
  f.label('+ New preset').props.onPress();
  assert.equal(f.label('Preset name').props.value, '');
  assert.equal(f.storage.accounts['200'], undefined);
  f.cleanup(); f.plugin.onUnload();
});

test('installable bundle evaluates using Revenge loader semantics and manifest hash matches', () => {
  const code = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.main, 'index.js');
  assert.equal(manifest.hash, createHash('sha256').update(code).digest('hex'));
  const f = harness();
  const plugin = vm.runInNewContext(`vendetta => { return ${code} }`)(f.V);
  assert.equal(typeof plugin.settings, 'function');
  plugin.onLoad(); plugin.onUnload();
  assert.equal(f.writes.length, 0);
  assert.equal(f.commands.length, 0);
});

test('shortcut registers its renderer before key insertion and retains safe hidden rows on disable', () => {
  let registered = { BUNNY_PLUGINS: { parent: null }, ACCOUNT_SWITCHER: { parent: null } };
  const constants = {};
  Object.defineProperty(constants, 'SETTING_RENDERER_CONFIG', { configurable: true, get: () => ({ ...registered }) });
  const rows = [{ key: 'BUNNY_PLUGINS' }, { key: 'ACCOUNT_SWITCHER' }];
  const nativeSplice = rows.splice;
  rows.splice = function (...args) {
    if (args[2]?.key === SHORTCUT_KEY) assert.equal(constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].parent, null);
    return nativeSplice.apply(this, args);
  };
  const settingsAPI = { registeredSections: { LocalizedRevenge: rows } };
  const args = { settingsAPI, constants, Settings: () => null };
  const remove = registerSettingsShortcut(args);
  assert.equal(rows[1].key, SHORTCUT_KEY);
  const duplicate = registerSettingsShortcut(args);
  assert.equal(rows.filter(row => row.key === SHORTCUT_KEY).length, 1);
  registered.LATE_PLUGIN = { parent: null };
  assert.ok(constants.SETTING_RENDERER_CONFIG.LATE_PLUGIN);
  assert.ok(constants.SETTING_RENDERER_CONFIG.ACCOUNT_SWITCHER);
  duplicate(); remove();
  assert.equal(rows.some(row => row.key === SHORTCUT_KEY), false);
  assert.equal(constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].parent, null);
  assert.equal(constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), false);
  const removeAgain = registerSettingsShortcut(args);
  assert.equal(constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), true);
  removeAgain();
});

test('frozen or missing native renderer leaves plugin settings available without unsafe shortcut keys', () => {
  const rows = [{ key: 'BUNNY_PLUGINS' }];
  const args = { settingsAPI: { registeredSections: { Revenge: rows } }, Settings: () => null };
  registerSettingsShortcut(args)();
  const constants = Object.freeze({ SETTING_RENDERER_CONFIG: {} });
  registerSettingsShortcut({ ...args, constants })();
  assert.equal(rows.length, 1);
});
