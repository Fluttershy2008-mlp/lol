'use strict';

// Read-only Metro graph modeled from the Android WebView package, including its
// generated view/commands, NativeRNCWebViewModule, WebViewShared and styles.
// https://github.com/react-native-webview/react-native-webview/tree/v13.13.5/src
// https://github.com/react-native-webview/react-native-webview/tree/master/src
function installColdWebViewModule(world, options = {}) {
    const U = world.U, modules = world.modules, finders = U.modules.finders;
    const ids = {}, dependencies = new Map(), loaded = new Map();
    let requires = 0, unrelated = 0, nativeProbes = 0, initializedLookups = 0;
    const add = value => world.addModule(value);
    ids.react = add(world.React); ids.rn = add(world.RN);
    U.react.ReactModuleId = ids.react; U.react.ReactNativeModuleId = ids.rn;
    function codegenNativeComponent() { throw new Error('Do not invoke codegen during discovery'); }
    function codegenNativeCommands() { throw new Error('Do not invoke codegen during discovery'); }
    class EventEmitter { addListener() {} emit() {} removeAllListeners() {} listenerCount() { return 0; } }
    ids.component = add({ __esModule: true, default: codegenNativeComponent });
    ids.commands = add({ __esModule: true, default: codegenNativeCommands });
    ids.emitter = add({ __esModule: true, default: options.batchedBridge
        ? { registerCallableModule() { throw new Error('Do not register messaging during discovery'); } } : EventEmitter });
    ids.registry = add({ get() {}, getEnforcing() {} });
    ids.dispatcher = add({ dispatchCommand() { throw new Error('Do not dispatch commands during discovery'); } });
    ids.main = 90000; ids.view = 90001; ids.bridge = 90002; ids.shared = 90003; ids.styles = 90004;
    if (options.coldBatchedBridge) {
        class MessageQueue { registerCallableModule() {} getCallableModule() {} }
        const queue = add({ __esModule: true, default: MessageQueue });
        ids.emitter = 90005; dependencies.set(ids.emitter, [queue]);
    }
    dependencies.set(ids.main, [ids.react, ids.rn, ids.emitter, ids.view, ids.bridge, ids.shared, ids.styles]);
    dependencies.set(ids.view, [ids.component, ids.commands]);
    dependencies.set(ids.bridge, [options.legacyRegistry ? ids.registry : ids.rn]);
    dependencies.set(ids.shared, [ids.react, ids.rn, ids.styles]);
    dependencies.set(ids.styles, [ids.rn]);
    if (options.compiled) dependencies.set(ids.view, [ids.rn, ids.dispatcher]);
    if (options.minifiedHelpers) {
        Object.defineProperty(codegenNativeComponent, 'name', { value: 'a' });
        Object.defineProperty(codegenNativeCommands, 'name', { value: 'b' });
        dependencies.set(ids.commands, [ids.dispatcher]);
    }
    if (options.loadedNativeView) {
        const Commands = Object.fromEntries(['goBack', 'goForward', 'injectJavaScript', 'postMessage'].map(key => [key, () => {}]));
        dependencies.set(ids.main, dependencies.get(ids.main).map(id => id === ids.view ? add({ default: 'RNCWebView', Commands }) : id));
    }
    // A nearby unrelated native component has all the other imports but does
    // not import the browser's EventEmitter. It must never be initialized.
    ids.decoy = 91000;
    dependencies.set(ids.decoy, [ids.react, ids.rn, ids.view, ids.bridge, ids.shared, ids.styles]);
    if (options.ambiguous) dependencies.set(92000, [...dependencies.get(ids.main)]);
    if (options.incomplete) dependencies.set(ids.view, [ids.component]);
    const namespace = { __esModule: true, default: options.component ?? world.WebView };
    const scopes = { All: 1, Uninitialized: 2, Initialized: 4 };
    finders.filters.FilterScopes = scopes;
    finders.filters.createFilterGenerator = (callback, key, scope = scopes.Initialized) => (...args) => Object.assign(
        (id, value, initialized = true) => callback(args, id, value, initialized), { key: key(...args), scopes: scope });
    const originalMany = finders.lookupModules.bind(finders), originalOne = finders.lookupModule.bind(finders);
    finders.lookupModules = function* (filter, opts = {}) {
        yield* originalMany(filter, opts);
        if (!(filter.scopes & scopes.Uninitialized)) return;
        for (const id of dependencies.keys()) {
            const value = loaded.get(id), initialized = loaded.has(id);
            if (filter(id, value, initialized)) {
                if (opts.initialize) throw new Error('Only the selected module may be initialized');
                yield [value, id];
            }
        }
    };
    finders.lookupModule = (filter, opts = {}) => {
        if (opts.initialize === true) {
            initializedLookups++;
            for (const id of dependencies.keys()) {
                if (!filter(id, loaded.get(id), loaded.has(id))) continue;
                if (id !== ids.main) { unrelated++; throw new Error('Unrelated factory initialization'); }
                requires++;
                if (options.fail) throw new Error('SDK initialization failed');
                for (const dependency of [ids.view, ids.bridge, ids.shared, ids.styles]) loaded.set(dependency, {});
                loaded.set(id, namespace); add(namespace);
                return [namespace, id];
            }
        }
        return originalOne(filter, opts);
    };
    const originalInitialized = U.modules.metro.isModuleInitialized;
    U.modules.metro.isModuleInitialized = id => dependencies.has(id) ? loaded.has(id) : originalInitialized?.(id);
    U.modules.metro.getModuleDependencies = id => dependencies.get(id) ?? (modules[id] ? [] : undefined);
    U.modules.native.getNativeModule = name => {
        nativeProbes++;
        if (!['RNCWebViewModule', 'RNCWebView'].includes(name)) throw new Error('Unexpected native probe');
        if (name !== (options.nativeName ?? 'RNCWebViewModule')) return null;
        return options.noNative ? null : { shouldStartLoadWithLockIdentifier() { throw new Error('Do not invoke native browser methods during discovery'); } };
    };
    return { ids, namespace, requires: () => requires, unrelated: () => unrelated,
        nativeProbes: () => nativeProbes, initializedLookups: () => initializedLookups };
}

module.exports = { installColdWebViewModule };
