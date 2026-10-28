/* SPDX-License-Identifier: GPL-3.0-or-later */
import { createPackagedWebView } from './webview-sdk.mjs';
import { webViewRuntimeClient } from './webview-loader.mjs';

// Bind the bundled SDK on an explicit QR click; no Metro package search.
export function createNativeWebView(React, RN, host = globalThis, getClient = webViewRuntimeClient) {
    let active = true, component, rejected = false, failure = 'NATIVE-API';
    const callbacks = new Map();
    const registered = new Set();
    const safely = fn => { try { return fn(); } catch { return undefined; } };
    function load() {
        if (!active || rejected) return;
        if (component) return component;
        failure = 'NATIVE-API';
        if (RN.Platform?.OS !== 'android' || typeof RN.requireNativeComponent !== 'function') return;
        const manager = safely(() => RN.UIManager);
        if (typeof manager?.dispatchViewManagerCommand !== 'function' || typeof RN.findNodeHandle !== 'function') return;
        failure = 'NATIVE-MESSAGING';
        let register;
        if (host.RN$Bridgeless !== true && typeof host.__fbBatchedBridge?.registerCallableModule === 'function') {
            register = (name, value) => host.__fbBatchedBridge.registerCallableModule(name, value);
        } else if (typeof host.RN$registerCallableModule === 'function') {
            register = (name, value) => host.RN$registerCallableModule(name, () => value);
        }
        if (!register) return;
        failure = 'NATIVE-MODULE';
        let nativeModule;
        for (const name of ['RNCWebViewModule', 'RNCWebView']) {
            for (const read of [() => RN.NativeModules?.[name], () => RN.TurboModuleRegistry?.get?.(name),
                () => getClient()?.modules.native?.getNativeModule?.(name)]) {
                const value = safely(read);
                if (safely(() => typeof value?.shouldStartLoadWithLockIdentifier === 'function')) { nativeModule = value; break; }
            }
            if (nativeModule) break;
        }
        if (!nativeModule) return;
        failure = 'NATIVE-VIEW';
        const config = safely(() => manager.getViewManagerConfig('RNCWebView'));
        if (!config && safely(() => manager.hasViewManagerConfig('RNCWebView')) === false) return;
        let NativeView;
        try { NativeView = RN.requireNativeComponent('RNCWebView'); }
        catch (error) {
            // An existing SDK can have registered this host view already.
            if (!/register two views with the same name.*RNCWebView/.test(String(error?.message))) return;
            NativeView = 'RNCWebView';
        }
        if (!NativeView) return;
        const Commands = Object.fromEntries(['goBack', 'goForward', 'reload', 'stopLoading', 'injectJavaScript',
            'requestFocus', 'postMessage', 'loadUrl', 'clearFormData', 'clearCache', 'clearHistory'].map(name => [name, (ref, ...args) => {
                if (!active) return;
                const tag = RN.findNodeHandle(ref);
                if (typeof tag === 'number') manager.dispatchViewManagerCommand(tag, config?.Commands?.[name] ?? name, args);
            }]));
        const bridge = {
            registerCallableModule(name, value) {
                if (!active) return;
                callbacks.set(name, value);
                if (!registered.has(name)) {
                    register(name, { onMessage: event => active && callbacks.get(name)?.onMessage?.(event),
                        onShouldStartLoadWithRequest: event => active && callbacks.get(name)?.onShouldStartLoadWithRequest?.(event) });
                    registered.add(name);
                }
            },
            unregisterCallableModule(name) { callbacks.delete(name); },
        };
        // Routing identity only; authentication keys remain in Web Crypto.
        const prefix = 'MoreAltsQr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + '_';
        failure = 'NATIVE-SDK';
        component = safely(() => createPackagedWebView(React, RN, bridge, nativeModule, NativeView, Commands, prefix));
        if (component) failure = undefined;
        return component;
    }
    return { load, reason: () => failure,
        reject(value) { if (value && value === component) { rejected = true; failure = 'NATIVE-RENDER'; callbacks.clear(); } },
        reset() { active = true; rejected = false; component = undefined; callbacks.clear(); registered.clear(); },
        dispose() { active = false; callbacks.clear(); registered.clear(); component = undefined; },
    };
}
