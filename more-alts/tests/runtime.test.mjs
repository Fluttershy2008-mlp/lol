import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { createPlugin } from '../src/plugin.mjs';
import { SHORTCUT_KEY, registerSettingsShortcut } from '../src/shortcut.mjs';

function mockRuntime() {
    const storeListeners = new Set(), commands = [], notices = [], patches = [];
    const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
        useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }), useEffect: () => {} };
    const native = { getCanUseMultiAccountMobile: () => false };
    const userStore = { getCurrentUser: () => undefined, addChangeListener: fn => storeListeners.add(fn), removeChangeListener: fn => storeListeners.delete(fn) };
    let appListeners = 0;
    const V = {
        plugin: { storage: {} }, logger: { warn: () => {} },
        metro: { common: { React: react, ReactNative: { Text: 'Text', View: 'View', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView',
            Image: 'Image', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', Switch: 'Switch', Platform: { OS: 'android' }, useColorScheme: () => 'dark',
            Alert: { alert: (...args) => notices.push(args) }, AppState: { addEventListener: () => { appListeners++; return { remove: () => appListeners-- }; } } } },
            findByProps: (...keys) => keys.includes('getCanUseMultiAccountMobile') ? native : undefined,
            findByStoreName: name => name === 'UserStore' ? userStore : undefined },
        patcher: { after: (key, obj, callback) => { const before = obj[key]; obj[key] = (...args) => callback(args, before(...args));
            const unpatch = () => { obj[key] = before; }; patches.push(unpatch); return unpatch; } },
        commands: { registerCommand: command => { commands.push(command); return () => commands.splice(commands.indexOf(command), 1); } },
        ui: { toasts: { showToast: text => notices.push(text) } }
    };
    return { V, native, storeListeners, commands, notices, get appListeners() { return appListeners; } };
}
test('onLoad, settings and unload work without optional Discord modules', () => {
    const h = mockRuntime(); const plugin = createPlugin(h.V, { fetch: () => { throw new Error('must not request on startup for unsaved account'); } });
    plugin.onLoad(); plugin.onLoad();
    assert.equal(h.native.getCanUseMultiAccountMobile(), true); assert.equal(h.commands.length, 1); assert.equal(h.storeListeners.size, 1);
    assert.equal(plugin.settings().type, 'KeyboardAvoidingView');
    h.commands[0].execute(); assert.match(h.notices[0], /Open Revenge/);
    h.V.plugin.storage.settings.enableNativeSwitcher = false; assert.equal(h.native.getCanUseMultiAccountMobile(), false);
    plugin.onUnload(); plugin.onUnload();
    assert.equal(h.native.getCanUseMultiAccountMobile(), false); assert.equal(h.commands.length, 0); assert.equal(h.storeListeners.size, 0); assert.equal(h.appListeners, 0);
    plugin.onLoad(); assert.equal(h.commands.length, 1); plugin.onUnload();
});
test('missing or throwing Metro lookups do not break plugin loading and settings', () => {
    const h = mockRuntime(); h.V.metro.findByProps = () => { throw new Error('module unavailable'); }; h.V.metro.findByStoreName = h.V.metro.findByProps;
    const plugin = createPlugin(h.V, {}); plugin.onLoad(); assert.ok(plugin.settings()); plugin.onUnload();
});
test('native notification property is never overwritten', () => {
    const h = mockRuntime(); const multi = {};
    Object.defineProperty(multi, 'canUseMultiAccountNotifications', { value: false, configurable: false });
    const original = h.V.metro.findByStoreName; h.V.metro.findByStoreName = name => name === 'MultiAccountStore' ? multi : original(name);
    const plugin = createPlugin(h.V, {}); plugin.onLoad(); plugin.onUnload(); assert.equal(multi.canUseMultiAccountNotifications, false);
});
test('settings shortcut preserves dynamic rows and leaves cached keys safe after unload', () => {
    let dynamic = { ACCOUNT: { parent: null } };
    const constants = {}; Object.defineProperty(constants, 'SETTING_RENDERER_CONFIG', { configurable: true, get: () => dynamic });
    const rows = [{ key: 'BUNNY_PLUGINS' }], settingsAPI = { registeredSections: { Revenge: rows } };
    const cleanup = registerSettingsShortcut({ settingsAPI, Settings: () => {}, constants, getAssetID: () => 1 });
    assert.ok(rows.some(row => row.key === SHORTCUT_KEY));
    assert.equal(constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].parent, null);
    dynamic = { ...dynamic, LATER_PLUGIN: { parent: null } };
    assert.ok(constants.SETTING_RENDERER_CONFIG.LATER_PLUGIN);
    cleanup(); assert.equal(rows.length, 1);
    assert.equal(constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), false);
    assert.equal(constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].parent, null);
});
test('frozen renderer map does not receive a dangling shortcut key', () => {
    const constants = {}; Object.defineProperty(constants, 'SETTING_RENDERER_CONFIG', { value: {}, configurable: false });
    const rows = [{ key: 'BUNNY_PLUGINS' }];
    registerSettingsShortcut({ settingsAPI: { registeredSections: { Revenge: rows } }, Settings: () => {}, constants });
    assert.equal(rows.length, 1);
});
test('built plugin is a valid Vendetta expression and manifest hash matches', () => {
    const code = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
    const h = mockRuntime(); const plugin = vm.runInNewContext(code, { vendetta: h.V, setTimeout, clearTimeout });
    assert.equal(typeof plugin.onLoad, 'function'); assert.equal(typeof plugin.settings, 'function');
    plugin.onLoad(); plugin.onUnload();
    assert.equal(createHash('sha256').update(code).digest('hex'), manifest.hash);
    assert.equal(manifest.main, 'index.js');
    assert.ok(!code.includes('forceLogout')); assert.ok(!code.includes('Copy Token'));
});
