import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeWebView } from '../src/native-webview.mjs';

function fixture(options = {}) {
    let probes = 0, views = 0;
    const React = { forwardRef: render => ({ $$typeof: Symbol.for('react.forward_ref'), render }) };
    const native = Object.freeze({ shouldStartLoadWithLockIdentifier() {}, isFileUploadSupported: async () => true });
    const RN = { Platform: { OS: 'android' }, NativeModules: options.noModule ? {} : { [options.nativeName ?? 'RNCWebView']: native },
        Image: { resolveAssetSource: value => value }, StyleSheet: { create: value => value },
        UIManager: { getViewManagerConfig() { probes++; return options.missingView ? undefined : { Commands: {} }; }, hasViewManagerConfig() { return !options.missingView; }, dispatchViewManagerCommand() {} },
        findNodeHandle: () => 42, requireNativeComponent(name) {
            views++; assert.equal(name, 'RNCWebView');
            if (options.duplicate) throw new Error('Tried to register two views with the same name RNCWebView');
            if (options.broken) throw new Error('Native view is unavailable');
            return 'RNCWebView';
        },
    };
    const host = { RN$registerCallableModule() {} };
    const provider = createNativeWebView(React, RN, host, () => { throw new Error('No Metro API is installed'); });
    return { RN, host, provider, native, probes: () => probes, views: () => views };
}

for (const nativeName of ['RNCWebView', 'RNCWebViewModule']) test('bundled browser opens with ' + nativeName + ' and no Metro API', () => {
    const f = fixture({ nativeName });
    assert.equal(f.probes(), 0); assert.equal(f.views(), 0);
    const view = f.provider.load(); assert.equal(view.$$typeof, Symbol.for('react.forward_ref'));
    assert.equal(f.provider.load(), view); assert.equal(f.probes(), 1); assert.equal(f.views(), 1);
    assert.equal(f.provider.reason(), undefined); assert.ok(Object.isFrozen(f.native));
    f.provider.dispose(); assert.equal(f.provider.load(), undefined);
});

test('direct native WebView can initialize when RNCWebViewModule is absent but the view exists', () => {
    const f = fixture({ noModule: true });
    const view = f.provider.load();
    assert.equal(typeof view.render, 'function');
    assert.equal(f.provider.reason(), undefined);
    assert.equal(f.views(), 1);
    f.provider.dispose();
});

test('native fallback declines when the WebView view itself is not registered', () => {
    const f = fixture({ noModule: true, missingView: true });
    assert.equal(f.provider.load(), undefined);
    assert.equal(f.provider.reason(), 'NATIVE-VIEW');
    assert.equal(f.views(), 0);
});

test('bundled browser reuses a view name already registered by Discord', () => {
    const f = fixture({ duplicate: true }); assert.ok(f.provider.load()); assert.equal(f.views(), 1);
});

test('unexpected native view errors remain local and allow the existing browser fallback', () => {
    const f = fixture({ broken: true }); assert.equal(f.provider.load(), undefined);
    assert.equal(f.provider.reason(), 'NATIVE-VIEW');
});

test('bundled browser can use the public native-module API without native exports on RN', () => {
    const f = fixture(); f.RN.NativeModules = { RNCWebView: {} };
    const provider = createNativeWebView({ forwardRef: render => ({ render }) }, f.RN, f.host,
        () => ({ modules: { native: { getNativeModule: name => name === 'RNCWebView' ? f.native : undefined } } }));
    assert.ok(provider.load()); provider.dispose();
});

test('rejecting a failed native browser stops retrying it until the plugin restarts', () => {
    const f = fixture(), view = f.provider.load(); f.provider.reject(view);
    assert.equal(f.provider.load(), undefined); assert.equal(f.views(), 1);
    f.provider.dispose(); f.provider.reset(); assert.ok(f.provider.load()); assert.equal(f.views(), 2);
});

test('missing callable messaging fails before registering a native host view', () => {
    const f = fixture(); delete f.host.RN$registerCallableModule;
    assert.equal(f.provider.load(), undefined); assert.equal(f.provider.reason(), 'NATIVE-MESSAGING');
    assert.equal(f.views(), 0);
});

test('bundled browser supports React Native’s public callable-module API without bridge globals', () => {
    const f = fixture(); delete f.host.RN$registerCallableModule;
    f.RN.registerCallableModule = () => {};
    assert.ok(f.provider.load()); assert.equal(f.provider.reason(), undefined);
});
