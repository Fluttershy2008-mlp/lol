import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSettingsShortcut, SHORTCUT_KEY } from '../src/shortcut.js';

function setup() {
  const rows = [{ key: 'BUNNY' }, { key: 'BUNNY_PLUGINS' }, { key: 'ACCOUNT_SWITCHER' }];
  // A sidebar plugin can cache the renderer map before CustomRPC starts.
  // Changing registeredSections alone does not update this captured map.
  const base = Object.fromEntries(rows.map(row => [row.key, { type: 'pressable', parent: null }]));
  base.BUNNY_CUSTOM_PAGE = { type: 'route', parent: null };
  const constants = {};
  Object.defineProperty(constants, 'SETTING_RENDERER_CONFIG', {
    configurable: true, enumerable: true, get: () => ({ ...base }),
  });
  const treeManager = {
    getAncestors(key) {
      // Model the native contract in the reported getAncestors stack:
      // every menu key must resolve to a record before .parent is accessed.
      const result = [];
      let parent = constants.SETTING_RENDERER_CONFIG[key].parent;
      while (parent != null) {
        result.push(parent);
        parent = constants.SETTING_RENDERER_CONFIG[parent].parent;
      }
      return result;
    },
    isBlocked(key, blocked) {
      return [...this.getAncestors(key), key].some(item => blocked.has(item));
    },
  };
  const patcher = {
    before(method, target, callback) {
      const original = target[method];
      const wrapped = function (...args) { callback(args); return original.apply(this, args); };
      target[method] = wrapped;
      return () => { if (target[method] === wrapped) target[method] = original; };
    },
  };
  return {
    rows, base, constants, treeManager, patcher,
    settingsAPI: { registeredSections: { Revenge: rows } },
    Settings: () => 'editor', openSettings: () => {},
  };
}

test('reproduces the old parent crash when only the menu row is registered', () => {
  const f = setup();
  f.rows.push({ key: SHORTCUT_KEY });
  assert.throws(() => f.rows.filter(row => !f.treeManager.isBlocked(row.key, new Set())), /parent/);
});

test('registers a native renderer before exposing the CustomRPC menu key', () => {
  const f = setup();
  const remove = registerSettingsShortcut(f);
  assert.ok(f.rows.some(row => row.key === SHORTCUT_KEY), 'shortcut must still be available');
  assert.doesNotThrow(() => f.rows.filter(row => !f.treeManager.isBlocked(row.key, new Set())));
  const renderer = f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY];
  assert.equal(renderer.parent, null);
  assert.equal(renderer.usePredicate(), true);
  remove();
});

test('keeps prior renderer getters live and preserves other settings blocking behavior', () => {
  const f = setup(), remove = registerSettingsShortcut(f);
  f.base.LATE_PLUGIN = { parent: 'BUNNY', type: 'pressable' };
  assert.equal(f.constants.SETTING_RENDERER_CONFIG.LATE_PLUGIN, f.base.LATE_PLUGIN);
  assert.deepEqual(f.treeManager.getAncestors('LATE_PLUGIN'), ['BUNNY']);
  assert.equal(f.treeManager.isBlocked('LATE_PLUGIN', new Set(['BUNNY'])), true);
  assert.equal(f.treeManager.isBlocked(SHORTCUT_KEY, new Set([SHORTCUT_KEY])), true);
  assert.throws(() => f.treeManager.getAncestors('UNRELATED_MISSING_SETTING'), /parent/);
  remove();
});

test('repairs a renderer getter replaced later by another sidebar plugin', () => {
  const f = setup(), originalGetAncestors = f.treeManager.getAncestors;
  const remove = registerSettingsShortcut(f);
  const lateRow = { parent: null, type: 'pressable' };
  Object.defineProperty(f.constants, 'SETTING_RENDERER_CONFIG', {
    configurable: true, enumerable: true, get: () => ({ ...f.base, ANOTHER_PLUGIN: lateRow }),
  });
  assert.equal(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY], undefined);
  assert.doesNotThrow(() => f.treeManager.isBlocked(SHORTCUT_KEY, new Set()));
  assert.equal(f.constants.SETTING_RENDERER_CONFIG.ANOTHER_PLUGIN, lateRow);
  remove();
  assert.equal(f.treeManager.getAncestors, originalGetAncestors);
});

test('cached keys and captured renderer entries remain safe and hidden after unload', () => {
  const f = setup(), originalRows = [...f.rows];
  let opened = 0; f.openSettings = () => { opened++; };
  const remove = registerSettingsShortcut(f);
  const cachedKeys = f.rows.map(row => row.key);
  const capturedRenderer = f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY];
  capturedRenderer.onPress(); assert.equal(opened, 1);
  remove();
  assert.deepEqual(f.rows, originalRows);
  assert.doesNotThrow(() => cachedKeys.filter(key => !f.treeManager.isBlocked(key, new Set())));
  assert.equal(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), false);
  assert.equal(capturedRenderer.usePredicate(), false);
  capturedRenderer.onPress(); assert.equal(opened, 1);

  const getter = Object.getOwnPropertyDescriptor(f.constants, 'SETTING_RENDERER_CONFIG').get;
  const removeAgain = registerSettingsShortcut(f);
  assert.equal(f.rows.filter(row => row.key === SHORTCUT_KEY).length, 1);
  assert.equal(Object.getOwnPropertyDescriptor(f.constants, 'SETTING_RENDERER_CONFIG').get, getter);
  assert.equal(f.constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), true);
  removeAgain();
});

test('does not insert an unsafe menu key when the renderer export cannot be patched', () => {
  const f = setup(), originalRows = [...f.rows], messages = [];
  Object.defineProperty(f.constants, 'SETTING_RENDERER_CONFIG', { configurable: false });
  const remove = registerSettingsShortcut({ ...f, log: message => messages.push(message) });
  assert.deepEqual(f.rows, originalRows);
  assert.doesNotThrow(() => f.rows.filter(row => !f.treeManager.isBlocked(row.key, new Set())));
  assert.match(messages[0], /safely/);
  remove();
});

test('renderer assignments retain the native setter while keeping CustomRPC available', () => {
  const f = setup();
  let assigned = f.base;
  Object.defineProperty(f.constants, 'SETTING_RENDERER_CONFIG', {
    configurable: true, enumerable: true, get: () => assigned, set: next => { assigned = next; },
  });
  const remove = registerSettingsShortcut(f), replacement = { ...f.base, EXTRA: { parent: null } };
  f.constants.SETTING_RENDERER_CONFIG = replacement;
  assert.equal(assigned, replacement);
  assert.equal(f.constants.SETTING_RENDERER_CONFIG.EXTRA, replacement.EXTRA);
  assert.doesNotThrow(() => f.treeManager.getAncestors(SHORTCUT_KEY));
  remove();
});
