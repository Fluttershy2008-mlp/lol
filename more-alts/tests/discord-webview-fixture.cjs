'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Execute the actual pinned Discord fork, with only its native host and external
// libraries mocked. Dependencies come from its compiled requires, not a guessed
// EventEmitter graph. This fixture must remain unloaded until the QR click.
function installDiscordWebViewModule(world, options = {}) {
    const { U, RN, React } = world, finders = U.modules.finders;
    const definitions = new Map(), ids = new Map(), loaded = new Map(), deps = new Map();
    const messages = new Map(), probes = [], initializations = [], navigation = [];
    let nextId = 93000, unrelated = 0;
    function add(name, value) {
        const id = world.addModule(value); ids.set(name, id); return id;
    }
    const native = { isFileUploadSupported: async () => true,
        shouldStartLoadWithLockIdentifier(...args) { navigation.push(args); } };
    RN.Image = { resolveAssetSource: value => value };
    RN.TurboModuleRegistry = { getEnforcing(name) { assert.equal(name, 'RNCWebView'); return native; } };
    U.react.ReactModuleId = add('react', React); U.react.ReactNativeModuleId = add('react-native', RN);
    class MessageQueue {
        registerCallableModule(name, callbacks) { messages.set(name, callbacks); }
        getCallableModule(name) { return messages.get(name); }
    }
    if (options.coldBridge) {
        const constructor = 'react-native/Libraries/BatchedBridge/MessageQueue';
        const constructorId = add(constructor, { __esModule: true, default: MessageQueue });
        const bridgeId = nextId++; ids.set('react-native/Libraries/BatchedBridge/BatchedBridge', bridgeId);
        definitions.set(bridgeId, 'module.exports = new (require("' + constructor + '").default)();');
        deps.set(bridgeId, [constructorId]);
    } else add('react-native/Libraries/BatchedBridge/BatchedBridge', new MessageQueue());
    add('invariant', (value, message) => { if (!value) throw new Error(message); });
    add('escape-string-regexp', value => value.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&'));
    function codegenNativeComponent(name) {
        assert.equal(name, 'RNCWebView');
        return React.forwardRef((props, ref) => {
            const view = React.useRef({}); React.useImperativeHandle(ref, () => view.current, []);
            return React.createElement('WebView', props);
        });
    }
    function codegenNativeCommands({ supportedCommands }) {
        return Object.fromEntries(supportedCommands.map(name => [name, (_ref, script) => {
            if (name === 'injectJavaScript') world.qrStops.push(script);
        }]));
    }
    add('react-native/Libraries/Utilities/codegenNativeComponent', { __esModule: true, default: codegenNativeComponent });
    add('react-native/Libraries/Utilities/codegenNativeCommands', { __esModule: true, default: codegenNativeCommands });
    const names = ['WebView.android', 'WebViewShared', 'NativeRNCWebView', 'RNCWebViewNativeComponent', 'WebView.styles'];
    for (const name of names) ids.set('./' + name, nextId++);
    for (const name of names) {
        const id = ids.get('./' + name), source = fs.readFileSync(path.join(__dirname, 'vendor/discord-webview/lib', name + '.cjs'), 'utf8');
        const imports = [...source.matchAll(/require\("([^"\n]+)"\)/g)].map(match => match[1]);
        for (const request of imports) assert.ok(ids.has(request), 'known package dependency: ' + request);
        deps.set(id, imports.map(request => ids.get(request)));
        definitions.set(id, source);
    }
    const mainId = ids.get('./WebView.android');
    // A nearby non-browser native component must not run.
    const decoyId = nextId++; definitions.set(decoyId, 'throw new Error("unrelated factory");');
    deps.set(decoyId, [ids.get('react'), ids.get('react-native')]);
    const originalMany = finders.lookupModules.bind(finders), originalOne = finders.lookupModule.bind(finders);
    const scopes = { All: 1, Uninitialized: 2, Initialized: 4 };
    finders.filters.FilterScopes = scopes;
    finders.filters.createFilterGenerator = (callback, key, scope = scopes.Initialized) => (...args) => Object.assign(
        (id, value, initialized = true) => callback(args, id, value, initialized), { key: key(args), scopes: scope });
    function requireId(id) {
        if (loaded.has(id)) return loaded.get(id);
        if (!definitions.has(id)) return world.modules[id];
        if (id === decoyId) { unrelated++; throw new Error('Unrelated factory initialized'); }
        if (options.fail && id === mainId) throw new Error('fixture native package load failure');
        initializations.push(id);
        const module = { exports: {} }; loaded.set(id, module.exports);
        new Function('require', 'module', 'exports', definitions.get(id))(
            name => requireId(ids.get(name)), module, module.exports);
        loaded.set(id, module.exports); return module.exports;
    }
    finders.lookupModules = function* (filter, opts = {}) {
        yield* originalMany(filter, opts);
        for (const id of definitions.keys()) {
            const initialized = loaded.has(id);
            if (!initialized && !(filter.scopes & (scopes.All | scopes.Uninitialized))) continue;
            const value = loaded.get(id);
            if (filter(id, value, initialized)) {
                if (opts.initialize) yield [requireId(id), id]; else yield [value, id];
            }
        }
    };
    finders.lookupModule = (filter, opts = {}) => {
        if (opts.initialize === true) for (const id of definitions.keys()) {
            if (filter(id, loaded.get(id), loaded.has(id))) return [requireId(id), id];
        }
        return originalOne(filter, opts);
    };
    const originalInitialized = U.modules.metro.isModuleInitialized;
    U.modules.metro.isModuleInitialized = id => definitions.has(id) ? loaded.has(id) : originalInitialized(id);
    U.modules.metro.getModuleDependencies = id => deps.get(id) ?? (world.modules[id] ? [] : undefined);
    U.modules.native.getNativeModule = name => {
        probes.push(name);
        if (name !== 'RNCWebView') throw new Error('Native module not found: ' + name);
        return native;
    };
    return { ids, mainId, messages, probes, initializations, navigation, preload: () => requireId(mainId), unrelated: () => unrelated };
}

module.exports = { installDiscordWebViewModule };
