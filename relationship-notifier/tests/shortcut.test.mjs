import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSettingsShortcut, SHORTCUT_KEY } from '../src/shortcut.js';

function setup({ label = 'Revenge', customRPC = true } = {}) {
  const keys = ['BUNNY', 'BUNNY_PLUGINS', ...(customRPC ? ['CUSTOMRPC_FLUTTERSHY_SETTINGS'] : []),
    'BUNNY_THEMES', 'BUNNY_FONTS', 'BUNNY_DEVELOPER', 'ACCOUNT_SWITCHER'];
  const rows = keys.map(key => ({ key }));
  const base = Object.fromEntries(keys.map(key => [key, { type: 'pressable', parent: null }]));
  const constants = {};
  Object.defineProperty(constants, 'SETTING_RENDERER_CONFIG', {
    configurable: true, enumerable: true, get: () => ({ ...base }),
  });
  const treeManager = {
    // This intentionally dereferences .parent just like the original crash.
    getAncestors(key) {
      const ancestors = [];
      let parent = constants.SETTING_RENDERER_CONFIG[key].parent;
      while (parent != null) {
        ancestors.push(parent);
        parent = constants.SETTING_RENDERER_CONFIG[parent].parent;
      }
      return ancestors;
    },
    isBlocked(key, blocked) { return [...this.getAncestors(key), key].some(id => blocked.has(id)); },
  };
  const patcher = {
    before(method, target, callback) {
      const original = target[method];
      const wrapped = function (...args) { callback(args); return original.apply(this, args); };
      target[method] = wrapped;
      return () => { if (target[method] === wrapped) target[method] = original; };
    },
  };
  const opened = [];
  return {
    rows, base, constants, treeManager, patcher, opened,
    settingsAPI: { registeredSections: { [label]: rows } },
    Settings: () => 'RelationshipNotifier settings', openSettings: () => opened.push(true),
    getAssetID: name => name === 'FriendsIcon' ? 42 : undefined,
  };
}

test('shortcut appears under CustomRPC with a valid native renderer before the row is exposed', async () => {
  const f = setup();
  const original = [...f.rows], customRenderer = f.base.CUSTOMRPC_FLUTTERSHY_SETTINGS;
  const nativeSplice = f.rows.splice;
  f.rows.splice = function (index, count, ...inserted) {
    for (const row of inserted) assert.doesNotThrow(() => f.treeManager.getAncestors(row.key));
    return nativeSplice.call(this, index, count, ...inserted);
  };
  const remove = registerSettingsShortcut(f);
  assert.deepEqual(f.rows.map(row => row.key), [
    'BUNNY', 'BUNNY_PLUGINS', 'CUSTOMRPC_FLUTTERSHY_SETTINGS', SHORTCUT_KEY,
    'BUNNY_THEMES', 'BUNNY_FONTS', 'BUNNY_DEVELOPER', 'ACCOUNT_SWITCHER',
  ]);
  const row = f.rows[3], renderer = f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY];
  assert.equal(row.title(), 'RelationshipNotifier'); assert.equal(row.icon, 42);
  assert.equal((await row.render()).default, f.Settings);
  assert.equal(renderer.parent, null); assert.equal(renderer.usePredicate(), true);
  renderer.onPress(); assert.equal(f.opened.length, 1);
  assert.equal(f.constants.SETTING_RENDERER_CONFIG.CUSTOMRPC_FLUTTERSHY_SETTINGS, customRenderer);
  assert.doesNotThrow(() => f.rows.filter(row => !f.treeManager.isBlocked(row.key, new Set())));
  remove(); assert.deepEqual([...f.rows], original);
});

test('localized headings and installations without CustomRPC use the Plugins anchor', () => {
  const f = setup({ label: 'Localized heading', customRPC: false });
  const remove = registerSettingsShortcut(f), duplicate = registerSettingsShortcut(f);
  assert.equal(f.rows[2].key, SHORTCUT_KEY);
  assert.equal(f.rows.filter(row => row.key === SHORTCUT_KEY).length, 1);
  duplicate(); assert.equal(f.rows.filter(row => row.key === SHORTCUT_KEY).length, 1);
  remove(); assert.equal(f.rows.some(row => row.key === SHORTCUT_KEY), false);
});

test('unload hides captured entries safely, preserves other rows and re-enable reuses the renderer bridge', () => {
  const f = setup(), original = [...f.rows];
  const remove = registerSettingsShortcut(f);
  const cachedKeys = f.rows.map(row => row.key), captured = f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY];
  const extra = { key: 'ANOTHER_PLUGIN' };
  f.settingsAPI.registeredSections.Revenge = [...f.rows, extra];
  remove(); remove();
  assert.deepEqual(f.rows, original);
  assert.equal(f.settingsAPI.registeredSections.Revenge.at(-1), extra);
  assert.equal(f.settingsAPI.registeredSections.Revenge.some(row => row.key === SHORTCUT_KEY), false);
  assert.doesNotThrow(() => cachedKeys.forEach(key => f.treeManager.getAncestors(key)));
  assert.equal(captured.usePredicate(), false); captured.onPress(); assert.equal(f.opened.length, 0);
  assert.equal(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), false);
  const getter = Object.getOwnPropertyDescriptor(f.constants, 'SETTING_RENDERER_CONFIG').get;
  const removeAgain = registerSettingsShortcut(f);
  assert.equal(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), true);
  assert.equal(Object.getOwnPropertyDescriptor(f.constants, 'SETTING_RENDERER_CONFIG').get, getter);
  removeAgain();
});

test('live renderer getters and normal blocked-setting behavior remain intact', () => {
  const f = setup(), remove = registerSettingsShortcut(f);
  f.base.LATE_PLUGIN = { type: 'pressable', parent: 'BUNNY' };
  assert.equal(f.constants.SETTING_RENDERER_CONFIG.LATE_PLUGIN, f.base.LATE_PLUGIN);
  assert.deepEqual(f.treeManager.getAncestors('LATE_PLUGIN'), ['BUNNY']);
  assert.equal(f.treeManager.isBlocked('LATE_PLUGIN', new Set(['BUNNY'])), true);
  assert.equal(f.treeManager.isBlocked(SHORTCUT_KEY, new Set([SHORTCUT_KEY])), true);
  assert.throws(() => f.treeManager.getAncestors('UNRELATED_MISSING_KEY'), /parent/);
  remove();
});

test('a replaced renderer accessor is repaired for this plugin while keeping other rows', () => {
  const f = setup(), original = f.treeManager.getAncestors;
  const remove = registerSettingsShortcut(f);
  Object.defineProperty(f.constants, 'SETTING_RENDERER_CONFIG', {
    configurable: true, get: () => ({ ...f.base, LATE_PLUGIN: { type: 'pressable', parent: null } }),
  });
  assert.equal(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY], undefined);
  assert.doesNotThrow(() => f.treeManager.isBlocked(SHORTCUT_KEY, new Set()));
  assert.ok(f.constants.SETTING_RENDERER_CONFIG.LATE_PLUGIN);
  remove(); assert.equal(f.treeManager.getAncestors, original);
});

test('missing or unpatchable settings APIs do not expose a crashing row', () => {
  assert.doesNotThrow(() => registerSettingsShortcut({})());
  const f = setup(), original = [...f.rows], messages = [];
  Object.defineProperty(f.constants, 'SETTING_RENDERER_CONFIG', { configurable: false });
  const remove = registerSettingsShortcut({ ...f, log: value => messages.push(value) });
  assert.deepEqual(f.rows, original); assert.match(messages[0], /safely/);
  assert.doesNotThrow(() => f.rows.forEach(row => f.treeManager.getAncestors(row.key)));
  remove();
});

test('native renderer assignments retain the existing setter and both plugin entries', () => {
  const f = setup();
  let assigned = f.base;
  Object.defineProperty(f.constants, 'SETTING_RENDERER_CONFIG', {
    configurable: true, get: () => assigned, set: next => { assigned = next; },
  });
  const remove = registerSettingsShortcut(f), replacement = { ...f.base, EXTRA: { parent: null } };
  f.constants.SETTING_RENDERER_CONFIG = replacement;
  assert.equal(assigned, replacement);
  assert.equal(f.constants.SETTING_RENDERER_CONFIG.EXTRA, replacement.EXTRA);
  assert.ok(f.constants.SETTING_RENDERER_CONFIG.CUSTOMRPC_FLUTTERSHY_SETTINGS);
  assert.doesNotThrow(() => f.treeManager.getAncestors(SHORTCUT_KEY));
  remove();
});

test('coexists with the installed CustomRPC renderer bridge without repeated wrapping', () => {
  const f = setup();
  const key = 'CUSTOMRPC_FLUTTERSHY_SETTINGS';
  let legacyGetter, wrapperCount = 0;
  // CustomRPC 1.1.1 checks its getter's identity before wrapping another
  // accessor. Our bridge must accept an entry preserved by that outer getter.
  function ensureCustomRPC() {
    const previous = Object.getOwnPropertyDescriptor(f.constants, 'SETTING_RENDERER_CONFIG');
    if (legacyGetter && previous.get === legacyGetter) return;
    legacyGetter = () => ({ ...previous.get.call(f.constants), [key]: f.base[key] });
    Object.defineProperty(f.constants, 'SETTING_RENDERER_CONFIG', { configurable: true, get: legacyGetter });
    wrapperCount++;
  }
  ensureCustomRPC();
  const unpatch = f.patcher.before('getAncestors', f.treeManager, ([id]) => { if (id === key) ensureCustomRPC(); });
  const remove = registerSettingsShortcut(f);
  for (let i = 0; i < 100; i++) {
    f.treeManager.getAncestors(key);
    f.treeManager.getAncestors(SHORTCUT_KEY);
  }
  assert.equal(wrapperCount, 2, 'only initial registration and one outer wrapper are needed');
  assert.equal(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), true);
  remove(); unpatch();
});
