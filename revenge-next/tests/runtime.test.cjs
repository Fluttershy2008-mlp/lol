'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createLegacyAdapter, createNextPlugin } = require('../runtime.cjs');
const ROOT = path.resolve(__dirname, '..');
const metadata = { id: 'dev.fluttershy2008.test', legacyManifest: { name: 'Test' }, repository: 'https://example.com/index.json' };

function environment(modules = [], initial = {}) {
    const writes = [], errors = [], cleanup = [], copied = [], toasts = [], timers = new Map(), pendingIntervals = new Map();
    let nextTimer = 0;
    const host = {
        setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, fn); return id; },
        clearTimeout: id => timers.delete(id),
        setInterval: fn => { const id = ++nextTimer; pendingIntervals.set(id, fn); return id; },
        clearInterval: id => pendingIntervals.delete(id),
        fetch: async () => { throw new Error('Unexpected network request in test'); },
    };
    const React = {
        Component: class { constructor(props) { this.props = props; this.state = {}; } setState(value) { Object.assign(this.state, value); } },
        createElement: (type, props, ...children) => ({ type, props: { ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) } }),
        cloneElement: (element, props) => ({ ...element, props: { ...element.props, ...props } }),
        useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
        useEffect: () => {}, useRef: value => ({ current: value }), useMemo: fn => fn(), useCallback: fn => fn,
        isValidElement: element => !!element?.props,
        Children: { toArray: x => x == null ? [] : Array.isArray(x) ? x : [x] },
    };
    const RN = { View: 'View', Text: 'Text', TextInput: 'TextInput', ScrollView: 'ScrollView',
        TouchableOpacity: 'TouchableOpacity', Pressable: 'Pressable', Image: 'Image',
        ToastAndroid: { SHORT: 0, show: text => toasts.push(text) }, Alert: { alert() {} },
        Appearance: { getColorScheme: () => 'dark' },
        AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
        StyleSheet: { create: value => value, absoluteFillObject: {} }, Platform: { OS: 'android' },
        Dimensions: { get: () => ({ width: 480, height: 900 }) }, Linking: { openURL: async () => {} },
    };
    const createFilterGenerator = (fn, key) => (...args) => {
        const filter = (id, value) => fn(args, id, value, true);
        filter.key = key(args); return filter;
    };
    const withProps = (...keys) => (_, value) => value && keys.every(key => key in value);
    const withName = name => (_, value) => value?.name === name;
    function* lookupModules(filter, options) {
        for (let i = 0; i < modules.length; i++) {
            const ns = modules[i];
            const value = ns?.default && filter(i, ns.default) ? ns.default : ns;
            if (filter(i, value)) yield [options?.returnNamespace ? ns : value, i];
        }
    }
    const stores = { ThemeStore: { theme: 'dark' }, UserStore: { getCurrentUser: () => ({ id: '111111111111111111' }) } };
    const api = { logger: { error: (...args) => errors.push(args), warn() {}, log() {} },
        plugin: { startedLate: false, requireReload() { api.reloads++; } }, reloads: 0,
        cleanup: fn => cleanup.push(fn),
        jsonStorage: { loaded: true, cache: JSON.parse(JSON.stringify(initial)),
            async get() { this.loaded = true; return this.cache; },
            async set(value, replace) { assert.equal(replace, true); this.cache = JSON.parse(JSON.stringify(value)); writes.push(this.cache); } },
        unscoped: { react: { React, ReactNative: RN },
            modules: { finders: { filters: { createFilterGenerator, withProps, withName }, lookupModules,
                lookupModule: (filter, options) => [...lookupModules(filter, options)][0] ?? [] },
                native: { callNativeMethod: async () => [] } },
            patcher: { instead(parent, key, hook) {
                const original = parent[key];
                const patched = function (...args) { return hook.call(this, args, original); };
                parent[key] = patched;
                return () => { if (parent[key] === patched) parent[key] = original; };
            } },
            discord: { common: { flux: { Dispatcher: { dispatch() {}, subscribe() {}, unsubscribe() {} } }, constants: { Constants: {} } },
                flux: { Stores: stores }, design: { Design: { TableRow: 'TableRow', TableRowGroup: 'TableRowGroup', Button: 'Button' } },
                actions: { AlertActionCreators: { openAlert() {}, dismissAlert() {} } } },
            externals: { ReactNativeClipboard: { Clipboard: { setString: text => copied.push(text) } } },
            assets: { getAssetIdByName: () => 3, getAssetByName: () => ({ id: 3 }) },
        },
    };
    return { api, host, writes, errors, cleanup, copied, toasts, timers, pendingIntervals, modules, stores, React, RN };
}

test('patch adapter preserves arguments, receiver, return values, once and teardown', async () => {
    const env = environment(), bridge = createLegacyAdapter(env.api, metadata, env.host), V = bridge.adapter;
    const obj = { base: 4, calculate(n) { return this.base + n; } }, original = obj.calculate;
    const undo = V.patcher.before('calculate', obj, args => { args[0] *= 2; });
    assert.equal(obj.calculate(3), 10); undo();
    const undoAfter = V.patcher.after('calculate', obj, (args, result) => result + args[0]);
    assert.equal(obj.calculate(3), 10); undoAfter();
    let calls = 0;
    V.patcher.after('calculate', obj, () => { calls++; }, true);
    assert.equal(obj.calculate(3), 7); assert.equal(obj.calculate(3), 7); assert.equal(calls, 1);
    V.patcher.instead('calculate', obj, function (args, orig) { return orig.apply(this, args) * 2; });
    assert.equal(obj.calculate(3), 14);
    await bridge.dispose(); assert.equal(obj.calculate, original);
});

test('deep storage mutations persist in order without mutating the Next cache', async () => {
    const env = environment([], { accounts: { one: { values: [1] } }, remove: true });
    const bridge = createLegacyAdapter(env.api, metadata, env.host), V = bridge.adapter;
    V.plugin.storage.accounts.one.values.push(2);
    delete V.plugin.storage.remove;
    assert.deepEqual(env.api.jsonStorage.cache.accounts.one.values, [1]);
    await bridge.flush();
    assert.deepEqual(env.writes.at(-1), { accounts: { one: { values: [1, 2] } } });
    const stale = V.plugin.storage;
    await bridge.dispose(); stale.injected = true;
    assert.equal(env.writes.at(-1).injected, undefined);
});

test('timers stop with their plugin and cannot create new timers after disposal', async () => {
    const env = environment(), bridge = createLegacyAdapter(env.api, metadata, env.host);
    const [later, , repeat] = bridge.timers;
    let calls = 0;
    later(() => calls++, 1); repeat(() => calls++, 2);
    assert.equal(env.timers.size, 1); assert.equal(env.pendingIntervals.size, 1);
    await bridge.dispose(); assert.equal(env.timers.size, 0); assert.equal(env.pendingIntervals.size, 0);
    later(() => calls++, 1); assert.equal(env.timers.size, 0); assert.equal(calls, 0);
});

test('finder translations keep module namespace when requested', async () => {
    function Profile() {}
    const props = { marker: true }, ns = { default: Profile };
    const env = environment([props, ns]);
    const bridge = createLegacyAdapter(env.api, metadata, env.host), metro = bridge.adapter.metro;
    assert.equal(metro.findByProps('marker'), props);
    assert.equal(metro.findByName('Profile'), Profile);
    assert.equal(metro.findByName('Profile', false), ns);
    assert.deepEqual(metro.findByPropsAll('marker'), [props]);
    assert.equal(metro.find(m => m.marker), props);
    assert.equal(metro.findByProps('missing'), undefined);
    await bridge.dispose();
});

test('local command registration fills metadata, stays local and unregisters', async () => {
    const builtins = { getBuiltInCommands: () => [{ id: '-1', name: 'existing', type: 1 }] };
    const env = environment([builtins]), bridge = createLegacyAdapter(env.api, metadata, env.host);
    let executed = 0;
    const remove = bridge.adapter.commands.registerCommand({ name: 'local-test', description: 'Test', execute: () => { executed++; } });
    const command = builtins.getBuiltInCommands(1).find(x => x.name === 'local-test');
    assert.equal(command.applicationId, '-1'); assert.equal(command.id, '-2'); assert.equal(command.displayName, 'local-test');
    await command.execute([], { channel: { id: '1' } }); assert.equal(executed, 1);
    remove(); assert.equal(builtins.getBuiltInCommands(1).length, 1);
    await command.execute(); assert.equal(executed, 1);
    await bridge.dispose();
});

test('startup failure removes installed patches and stops timers', async () => {
    const env = environment(), target = { fn() { return 1; } }, original = target.fn;
    const options = createNextPlugin((V, later) => ({ onLoad() {
        V.patcher.after('fn', target, () => 7); later(() => {}, 10); throw new Error('startup failed');
    } }), metadata, env.host);
    await assert.rejects(options.start(env.api), /startup failed/);
    assert.equal(target.fn, original); assert.equal(env.timers.size, 0);
});

test('stop during pending storage load prevents factory execution', async () => {
    const env = environment(); let ready, created = false;
    env.api.jsonStorage.loaded = false; env.api.jsonStorage.get = () => new Promise(resolve => ready = resolve);
    const options = createNextPlugin(() => { created = true; return {}; }, metadata, env.host);
    const start = options.start(env.api); options.stop(); ready({}); await start;
    assert.equal(created, false);
});

test('Next settings component delegates to the legacy settings without changing globals', async () => {
    const env = environment(); function Settings() {}
    const options = createNextPlugin(() => ({ settings: Settings }), metadata, env.host);
    const original = globalThis.vendetta;
    await options.start(env.api);
    assert.equal(options.SettingsComponent({ api: env.api }).type, Settings);
    assert.equal(globalThis.vendetta, original);
    for (const dispose of env.cleanup.reverse()) await dispose();
    assert.equal(options.SettingsComponent({ api: env.api }).type, 'Text');
});

test('registry adapter reads installed metadata through Next native bridge', async () => {
    const env = environment();
    env.api.unscoped.modules.native.callNativeMethod = async (name, args) => {
        assert.equal(name, 'revenge.plugins.list'); assert.deepEqual(args, []);
        return [{ manifest: { id: 'example', name: 'Example', author: 'Someone', dependencies: {} }, source: { repo: 'https://example.org/index.json' } }];
    };
    const bridge = createLegacyAdapter(env.api, metadata, env.host), V = bridge.adapter;
    await V.storage.awaitSyncWrapper(V.plugins.plugins);
    assert.equal(V.plugins.plugins.example.manifest.name, 'Example');
    assert.equal(V.plugins.plugins.example.enabled, undefined);
    await bridge.dispose();
});

function load(slug, env) {
    const file = path.join(ROOT, '.build', 'plugins', slug, 'index.js');
    return vm.runInNewContext(fs.readFileSync(file, 'utf8'), { console, Promise,
        setTimeout: env.host.setTimeout, clearTimeout: env.host.clearTimeout,
        setInterval: env.host.setInterval, clearInterval: env.host.clearInterval,
        revenge: env.api.unscoped, plugin: value => value,
    }, { filename: file }).default;
}

test('every generated script is a valid Next plugin expression', () => {
    for (const slug of fs.readdirSync(path.join(ROOT, '.build', 'plugins'))) {
        const env = environment(), options = load(slug, env);
        assert.equal(typeof options, 'object', slug);
        assert.ok(typeof options.start === 'function' || typeof options.preInit === 'function', slug);
    }
});

test('all four native themes register colours and a background through Next Themes API', () => {
    for (const slug of ['fluttershy-theme', 'rainbow-dash-theme', 'sunset-shimmer-theme', 'tokyo-nights-theme']) {
        const env = environment(), options = load(slug, env), registered = [];
        options.preInit({ themes: { registerGroup() {}, registerTheme: (...args) => registered.push(args) } });
        assert.equal(registered.length, 1); assert.equal(registered[0][1], slug);
        const theme = registered[0][2], colors = theme.getColors();
        assert.ok(Object.keys(colors.semantic.dark).length > 0);
        assert.match(theme.background.path, /^https:\/\//);
        assert.ok(theme.background.opacity >= 0 && theme.background.opacity <= 1);
    }
});

test('Copy User ID package adds a working message menu item using Next APIs', async () => {
    const host = { openLazy(promise) { return promise; }, hideActionSheet() {} };
    const rowModule = { ActionSheetRow: 'ActionSheetRow', TableRow: 'TableRow', TableRowGroup: 'TableRowGroup' };
    const env = environment([host, rowModule]);
    const options = load('copy-user-id', env);
    await options.start(env.api);
    const originalSheet = function MessageSheet() { return env.React.createElement('Group', null,
        [env.React.createElement('ActionSheetRow', { label: 'Copy Text', onPress() {} })]); };
    const resolved = await host.openLazy(Promise.resolve({ default: originalSheet }), 'MessageLongPressActionSheet',
        { message: { id: '999999999999999999', author: { id: '123456789012345678' } } });
    const tree = resolved.default({ message: { id: '999999999999999999', author: { id: '123456789012345678' } } });
    let item;
    function visit(node) {
        if (!node) return;
        if (Array.isArray(node)) { node.forEach(visit); return; }
        if (String(node.props?.label).includes('Copy User ID')) item = node;
        visit(node.props?.children);
    }
    visit(tree);
    assert.ok(item, 'message action sheet has the ID item');
    await item.props.onPress(); assert.deepEqual(env.copied, ['<@123456789012345678>']);
    for (const dispose of env.cleanup.reverse()) await dispose();
    assert.equal(env.timers.size, 0);
});

test('native toast adapter uses the Android API', async () => {
    const env = environment(), bridge = createLegacyAdapter(env.api, metadata, env.host);
    bridge.adapter.ui.toasts.showToast('Saved'); assert.deepEqual(env.toasts, ['Saved']);
    await bridge.dispose(); bridge.adapter.ui.toasts.showToast('Stale'); assert.deepEqual(env.toasts, ['Saved']);
});

test('all 21 legacy factories initialize with the scoped Next adapter', async () => {
    const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources.json'), 'utf8')).plugins;
    let count = 0;
    for (const [id, source] of Object.entries(sources)) {
        if (source.kind !== 'compatibility-preview') continue;
        const env = environment(), bridge = createLegacyAdapter(env.api, { ...metadata, id }, env.host);
        const file = path.resolve(ROOT, '..', source.path);
        const options = vm.runInNewContext(fs.readFileSync(file, 'utf8'), { console,
            vendetta: bridge.adapter, revenge: env.api.unscoped,
            setTimeout: bridge.timers[0], clearTimeout: bridge.timers[1],
            setInterval: bridge.timers[2], clearInterval: bridge.timers[3],
        }, { filename: file });
        assert.ok(options && typeof options === 'object', id);
        assert.equal(typeof options.onLoad, 'function', id);
        await bridge.dispose(); count++;
    }
    assert.equal(count, 21);
});
