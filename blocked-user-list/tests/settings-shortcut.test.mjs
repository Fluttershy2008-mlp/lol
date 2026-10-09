import test from 'node:test';
import assert from 'node:assert/strict';
import { attachSettingsShortcut, SHORTCUT_KEY } from '../src/settings-shortcut.mjs';

function fixture({ captured = false } = {}) {
  const originals = ['BUNNY', 'BUNNY_PLUGINS', 'BUNNY_THEMES', 'BUNNY_FONTS', 'ACCOUNT_SWITCHER'].map(key => ({ key, title: () => key }));
  const api = { registeredSections: { 'Localized Revenge heading': [...originals], OtherPlugin: [{ key: 'OTHER_PLUGIN' }] } };
  let base = { ACCOUNT: { type: 'route', parent: null } };
  const constants = {};
  Object.defineProperty(constants, 'SETTING_RENDERER_CONFIG', captured
    ? { configurable: true, enumerable: true, writable: true, value: { ...base, EXISTING_PLUGIN: { parent: null } } }
    : { configurable: true, enumerable: true,
      get: () => ({ ...base, ...Object.fromEntries(Object.values(api.registeredSections).flat().map(row => [row.key, { ...row.rawTabsConfig }])) }),
      set: value => { base = value; } });
  let opened = 0, removed = 0, guard;
  const tree = { getAncestors(key) { return constants.SETTING_RENDERER_CONFIG[key].parent; } };
  const patcher = { before(method, object, fn) {
    const original = object[method];
    guard = fn;
    object[method] = function(...args) { fn(args); return original.apply(this, args); };
    return () => { object[method] = original; removed++; };
  } };
  const Settings = () => 'list';
  const options = { api, constants, Settings, open: () => opened++, tree, patcher,
    getAsset: name => name === 'FriendsIcon' ? 123 : undefined, renderIcon: source => ({ source }) };
  const attach = () => attachSettingsShortcut(options);
  return { api, constants, originals, tree, Settings, attach,
    rows: () => api.registeredSections['Localized Revenge heading'],
    counts: () => ({ opened, removed }), guard: () => guard };
}

test('Blocked Users is placed directly below Plugins without replacing the section or other rows', async () => {
  const f = fixture();
  const section = f.rows();
  f.attach();
  assert.equal(f.rows(), section);
  assert.deepEqual(section.map(row => row.key), ['BUNNY', 'BUNNY_PLUGINS', SHORTCUT_KEY, 'BUNNY_THEMES', 'BUNNY_FONTS', 'ACCOUNT_SWITCHER']);
  for (const row of f.originals) assert.ok(section.includes(row));
  const row = section[2];
  assert.equal(row.title(), 'Blocked Users');
  assert.equal(row.icon, 123);
  assert.equal((await row.render()).default, f.Settings);
  assert.equal(row.usePredicate(), true);
  f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].onPress();
  assert.equal(f.counts().opened, 1);
});

test('native renderer exists before its key is exposed, including captured renderer maps', () => {
  const f = fixture({ captured: true });
  const section = f.rows();
  const splice = section.splice;
  section.splice = function(...args) {
    assert.equal(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].parent, null);
    return splice.apply(this, args);
  };
  f.attach();
  const map = f.constants.SETTING_RENDERER_CONFIG;
  assert.equal(map[SHORTCUT_KEY].type, 'pressable');
  assert.equal(map[SHORTCUT_KEY].parent, null);
  assert.ok(map.ACCOUNT);
  assert.ok(map.EXISTING_PLUGIN);
});

test('existing dynamic getter and setter continue to expose later-added plugin settings', () => {
  const f = fixture(); f.attach();
  f.api.registeredSections.NewPlugin = [{ key: 'LATER_PLUGIN', rawTabsConfig: { parent: null } }];
  assert.ok(f.constants.SETTING_RENDERER_CONFIG.LATER_PLUGIN);
  f.constants.SETTING_RENDERER_CONFIG = { REPLACED_NATIVE_BASE: { parent: null } };
  assert.ok(f.constants.SETTING_RENDERER_CONFIG.REPLACED_NATIVE_BASE);
  assert.ok(f.constants.SETTING_RENDERER_CONFIG.LATER_PLUGIN);
  assert.equal(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), true);
});

test('disable removes only this row and retains a hidden renderer for cached native keys', () => {
  const f = fixture(); const stop = f.attach();
  const stale = f.rows().find(row => row.key === SHORTCUT_KEY);
  stop(); stop();
  assert.deepEqual(f.rows().map(row => row.key), f.originals.map(row => row.key));
  const hidden = f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY];
  assert.equal(hidden.parent, null);
  assert.equal(hidden.usePredicate(), false);
  hidden.onPress(); stale.onPress();
  assert.equal(f.counts().opened, 0);
  assert.equal(f.counts().removed, 1);
  assert.equal(f.tree.getAncestors(SHORTCUT_KEY), null);
  assert.ok(f.constants.SETTING_RENDERER_CONFIG.OTHER_PLUGIN);
});

test('re-enable reuses the renderer layer and exposes exactly one shortcut', () => {
  const f = fixture(); const stop = f.attach();
  const getter = Object.getOwnPropertyDescriptor(f.constants, 'SETTING_RENDERER_CONFIG').get;
  stop();
  const stopAgain = f.attach();
  assert.equal(Object.getOwnPropertyDescriptor(f.constants, 'SETTING_RENDERER_CONFIG').get, getter);
  assert.equal(f.rows().filter(row => row.key === SHORTCUT_KEY).length, 1);
  assert.equal(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), true);
  stopAgain();
});

test('guard repairs its renderer if another plugin replaces the native map', () => {
  const f = fixture(); f.attach();
  Object.defineProperty(f.constants, 'SETTING_RENDERER_CONFIG', { configurable: true, enumerable: true, writable: true, value: { NEW_NATIVE_ROW: { parent: null } } });
  assert.equal(f.tree.getAncestors(SHORTCUT_KEY), null);
  assert.ok(f.constants.SETTING_RENDERER_CONFIG.NEW_NATIVE_ROW);
  assert.equal(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), true);
});

test('cleanup finds the same row when another plugin replaces a section array', () => {
  const f = fixture(); const stop = f.attach();
  const oldRows = f.rows();
  f.api.registeredSections['Localized Revenge heading'] = [...oldRows, { key: 'NEW_ROW' }];
  stop();
  assert.ok(!oldRows.some(row => row.key === SHORTCUT_KEY));
  assert.ok(!f.rows().some(row => row.key === SHORTCUT_KEY));
  assert.ok(f.rows().some(row => row.key === 'NEW_ROW'));
});

test('unsupported native maps or frozen sections do not expose a broken row', () => {
  const f = fixture({ captured: true });
  Object.defineProperty(f.constants, 'SETTING_RENDERER_CONFIG', { configurable: false });
  f.attach()();
  assert.deepEqual(f.rows().map(row => row.key), f.originals.map(row => row.key));
  const g = fixture(); Object.freeze(g.rows());
  g.attach()();
  assert.equal(g.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), false);
  assert.deepEqual(g.rows().map(row => row.key), g.originals.map(row => row.key));
  assert.doesNotThrow(() => attachSettingsShortcut({})());
});
