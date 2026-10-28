'use strict';
const assert = require('node:assert/strict');

// Native APIs only. No Discord WebView module or dependency metadata is added.
function installNativeWebView(world, options = {}) {
    const { RN, React } = world, messages = new Map(), nativeNavigation = [], commands = [], lookups = [];
    const existing = { onMessage() { throw new Error('An unrelated app callback was invoked'); } };
    messages.set('WebViewMessageHandler1', existing);
    let views = 0, dependencies = 0;
    const native = Object.freeze({ isFileUploadSupported: async () => true,
        shouldStartLoadWithLockIdentifier: (...args) => nativeNavigation.push(args) });
    RN.NativeModules = Object.freeze({ [options.nativeName ?? 'RNCWebView']: native });
    Object.assign(RN.Image, { resolveAssetSource: value => value });
    RN.UIManager = {
        getViewManagerConfig(name) {
            lookups.push(name); assert.equal(name, 'RNCWebView');
            return { Commands: options.commandNames ? {} : { injectJavaScript: 5, loadUrl: 8 } };
        },
        dispatchViewManagerCommand(tag, command, args) {
            assert.equal(tag, 42); commands.push({ tag, command, args });
            if (command === 5 || command === 'injectJavaScript') world.qrStops.push(args[0]);
        },
    };
    RN.findNodeHandle = ref => ref?._nativeTag;
    RN.requireNativeComponent = name => {
        views++; assert.equal(name, 'RNCWebView');
        if (options.duplicate) throw new Error('Tried to register two views with the same name RNCWebView');
        return React.forwardRef((props, ref) => {
            React.useImperativeHandle(ref, () => ({ _nativeTag: 42 }), []);
            return React.createElement('WebView', props);
        });
    };
    const register = (name, value) => {
        assert.match(name, /^MoreAltsQr_/); assert.equal(messages.has(name), false);
        messages.set(name, typeof value === 'function' ? value() : value);
    };
    if (options.legacyBridge) {
        world.host.__fbBatchedBridge = { registerCallableModule: register }; world.host.RN$Bridgeless = false;
        world.host.RN$registerCallableModule = () => { throw new Error('The legacy host must use its active bridge'); };
    }
    else { world.host.RN$Bridgeless = true; world.host.RN$registerCallableModule = register; }
    world.U.modules.metro.getModuleDependencies = () => { dependencies++; throw new Error('No dependency lookup is needed'); };
    world.U.modules.native.getNativeModule = () => { throw new Error('Use RN’s native-module facade'); };
    return { messages, existing, nativeNavigation, commands, lookups, views: () => views, dependencies: () => dependencies,
        owned: () => [...messages.entries()].filter(([name]) => name.startsWith('MoreAltsQr_')) };
}

module.exports = { installNativeWebView };
