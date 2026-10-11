import test from 'node:test';
import assert from 'node:assert/strict';
import { attachSettingsShortcut, SHORTCUT_KEY } from '../src/settings-shortcut.mjs';

function fixture({ captured = false, blocked = false } = {}) {
  const keys = ['BUNNY', 'BUNNY_PLUGINS', ...(blocked ? ['FLUTTERSHY_BLOCKED_USERS'] : []), 'BUNNY_THEMES', 'BUNNY_FONTS', 'ACCOUNT_SWITCHER'];
  const originals = keys.map(key => ({ key, title: () => key }));
  const api = { registeredSections: { 'Localized Revenge heading': [...originals], OtherPlugin: [{ key: 'OTHER_PLUGIN' }] } };
  let base = { ACCOUNT: { type: 'route', parent: null } };
  const constants = {};
  Object.defineProperty(constants, 'SETTING_RENDERER_CONFIG', captured
    ? { configurable: true, enumerable: true, writable: true, value: { ...base, EXISTING_PLUGIN: { parent: null } } }
    : { configurable: true, enumerable: true,
      get: () => ({ ...base, ...Object.fromEntries(Object.values(api.registeredSections).flat().map(row => [row.key, { ...row.rawTabsConfig }])) }),
      set: value => { base = value; } });
  let opened = 0, removed = 0;
  const tree = { getAncestors(key) { return constants.SETTING_RENDERER_CONFIG[key].parent; } };
  const patcher = { before(method, object, fn) {
    const original = object[method];
    object[method] = function(...args) { fn(args); return original.apply(this, args); };
    return () => { object[method] = original; removed++; };
  } };
  const Settings = () => 'list';
  const options = { api, constants, Settings, open: () => opened++, tree, patcher, useTrailing: () => '42 friends',
    getAsset: name => name === 'FriendsIcon' ? 123 : undefined, renderIcon: source => ({ source }) };
  return { api, constants, originals, tree, Settings, attach: () => attachSettingsShortcut(options),
    rows: () => api.registeredSections['Localized Revenge heading'], counts: () => ({ opened, removed }) };
}

test('inserts next to Blocked Users or below Plugins without replacing existing settings', async () => {
  for (const blocked of [false, true]) {
    const f = fixture({ blocked });
    const section = f.rows(); f.attach();
    assert.equal(f.rows(), section);
    assert.equal(section[blocked ? 3 : 2].key, SHORTCUT_KEY);
    for (const row of f.originals) assert.ok(section.includes(row));
    const row = section.find(row => row.key === SHORTCUT_KEY);
    assert.equal(row.title(), 'Friends List');
    assert.equal(row.useTrailing(), '42 friends');
    assert.equal((await row.render()).default, f.Settings);
    f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].onPress();
    assert.equal(f.counts().opened, 1);
  }
});

test('publishes native renderer before exposing its key, including captured maps', () => {
  const f = fixture({ captured: true });
  const section = f.rows(), splice = section.splice;
  section.splice = function(...args) {
    assert.equal(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].parent, null);
    return splice.apply(this, args);
  };
  f.attach();
  assert.ok(f.constants.SETTING_RENDERER_CONFIG.ACCOUNT);
  assert.ok(f.constants.SETTING_RENDERER_CONFIG.EXISTING_PLUGIN);
});

test('native getter and setter preserve settings added by other plugins', () => {
  const f = fixture(); f.attach();
  f.api.registeredSections.Later = [{ key: 'LATER_PLUGIN', rawTabsConfig: { parent: null } }];
  f.constants.SETTING_RENDERER_CONFIG = { NEW_NATIVE_BASE: { parent: null } };
  assert.ok(f.constants.SETTING_RENDERER_CONFIG.NEW_NATIVE_BASE);
  assert.ok(f.constants.SETTING_RENDERER_CONFIG.LATER_PLUGIN);
  assert.ok(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY]);
});

test('disable removes only Friends List and leaves a hidden renderer for cached row keys', () => {
  const f = fixture({ blocked: true }); const stop = f.attach();
  const stale = f.rows().find(row => row.key === SHORTCUT_KEY);
  stop(); stop();
  assert.deepEqual(f.rows(), f.originals);
  assert.equal(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), false);
  f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].onPress(); stale.onPress();
  assert.equal(f.counts().opened, 0);
  assert.equal(f.counts().removed, 1);
  assert.equal(f.tree.getAncestors(SHORTCUT_KEY), null);
});

test('re-enable adds exactly one shortcut and reuses its renderer layer', () => {
  const f = fixture(); const stop = f.attach();
  const getter = Object.getOwnPropertyDescriptor(f.constants, 'SETTING_RENDERER_CONFIG').get;
  stop(); const stopAgain = f.attach();
  assert.equal(Object.getOwnPropertyDescriptor(f.constants, 'SETTING_RENDERER_CONFIG').get, getter);
  assert.equal(f.rows().filter(row => row.key === SHORTCUT_KEY).length, 1);
  stopAgain();
});

test('guard repairs the renderer if another plugin replaces the native map', () => {
  const f = fixture(); f.attach();
  Object.defineProperty(f.constants, 'SETTING_RENDERER_CONFIG', {
    configurable: true, enumerable: true, writable: true, value: { NEW_NATIVE_ROW: { parent: null } } });
  assert.equal(f.tree.getAncestors(SHORTCUT_KEY), null);
  assert.ok(f.constants.SETTING_RENDERER_CONFIG.NEW_NATIVE_ROW);
});

test('cleanup handles section array replacement', () => {
  const f = fixture(); const stop = f.attach(); const old = f.rows();
  f.api.registeredSections['Localized Revenge heading'] = [...old, { key: 'NEW_ROW' }];
  stop();
  assert.ok(!old.some(row => row.key === SHORTCUT_KEY));
  assert.ok(!f.rows().some(row => row.key === SHORTCUT_KEY));
  assert.ok(f.rows().some(row => row.key === 'NEW_ROW'));
});

test('missing registry, frozen rows and immutable maps retain plugin Configure access without a broken row', () => {
  assert.doesNotThrow(() => attachSettingsShortcut({})());
  const f = fixture({ captured: true });
  Object.defineProperty(f.constants, 'SETTING_RENDERER_CONFIG', { configurable: false });
  f.attach()();
  assert.deepEqual(f.rows(), f.originals);
  const g = fixture(); Object.freeze(g.rows());
  g.attach()();
  assert.deepEqual(g.rows(), g.originals);
  assert.equal(g.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), false);
});
