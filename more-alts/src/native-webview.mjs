/* SPDX-License-Identifier: GPL-3.0-or-later */
import { createPackagedWebView } from './webview-sdk.mjs';
import { webViewRuntimeClient } from './webview-loader.mjs';

// Some Discord builds ship the native WebView view but hide its separate
// RNCWebViewModule. The native view can load an isolated HTML page directly.
// No navigation approval is possible without the module, so only our own
// CSP-restricted, navigation-free QR document may be loaded through this path.
export function createViewOnlyWebView(React, RN, NativeView, Commands, bridge, prefix) {
    const h = React.createElement;
    let next = 0;
    return React.forwardRef(function MoreAltsViewOnly(props, outerRef) {
        const node = React.useRef(null);
        const channel = React.useRef(prefix + (++next)).current;
        const onMessage = React.useRef(props.onMessage);
        onMessage.current = props.onMessage;
        React.useEffect(() => {
            bridge.registerCallableModule(channel, {
                onMessage: event => onMessage.current?.(event?.nativeEvent ? event : { nativeEvent: event }),
                // WebView's native module is absent. Never approve a
                // secondary navigation in this limited mode.
                onShouldStartLoadWithRequest() {}
            });
            return () => bridge.unregisterCallableModule(channel);
        }, [channel]);
        React.useImperativeHandle(outerRef, () => ({
            injectJavaScript(script) { Commands.injectJavaScript(node.current, script); },
            stopLoading() { Commands.stopLoading(node.current); },
            reload() { Commands.reload(node.current); },
        }), []);
        const { source, containerStyle, style, onMessage: _unused, onShouldStartLoadWithRequest: _navigation, ...safe } = props;
        const document = source && typeof source.html === 'string' && source.baseUrl === 'https://discord.com/'
            && source.html.includes('default-src \'none\'') && source.html.includes('frame-src \'none\'')
            && source.html.includes('window.stopMoreAltsQr');
        if (!document) return null;
        return h(RN.View, { style: [{ flex: 1 }, containerStyle] },
            h(NativeView, {
                ...safe, ref: node, source, newSource: source,
                style: [{ flex: 1 }, style], messagingEnabled: true, messagingModuleName: channel,
                injectedJavaScriptObject: '{}',
                onMessage: event => onMessage.current?.(event?.nativeEvent ? event : { nativeEvent: event }),
                // Must not permit popups, file access or mixed content.
                setSupportMultipleWindows: false, allowFileAccess: false,
                allowFileAccessFromFileURLs: false, allowUniversalAccessFromFileURLs: false,
                javaScriptCanOpenWindowsAutomatically: false, mixedContentMode: 'never',
            }));
    });
}

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
        if (typeof RN.registerCallableModule === 'function') {
            // The public RN API selects the correct legacy or bridgeless path.
            register = (name, value) => RN.registerCallableModule(name, value);
        } else if (host.RN$Bridgeless !== true && typeof host.__fbBatchedBridge?.registerCallableModule === 'function') {
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
        component = safely(() => nativeModule
            ? createPackagedWebView(React, RN, bridge, nativeModule, NativeView, Commands, prefix)
            : createViewOnlyWebView(React, RN, NativeView, Commands, bridge, prefix));
        if (component) failure = undefined;
        return component;
    }
    return { load, reason: () => failure,
        reject(value) { if (value && value === component) { rejected = true; failure = 'NATIVE-RENDER'; callbacks.clear(); } },
        reset() { active = true; rejected = false; component = undefined; callbacks.clear(); registered.clear(); },
        dispose() { active = false; callbacks.clear(); registered.clear(); component = undefined; },
    };
}
