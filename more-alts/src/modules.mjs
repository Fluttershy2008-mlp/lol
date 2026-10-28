/* SPDX-License-Identifier: GPL-3.0-or-later */
import { createColdWebViewLoader } from './webview-loader.mjs';

// Vendetta's finders require uninitialized Metro factories while searching.
// Optional features must never do that during Discord's startup.
export function createModuleResolver(metro, { now = Date.now } = {}) {
    const entries = new Map();
    let rejectedWebViews = new WeakSet();
    const coldWebView = createColdWebViewLoader();
    const modules = metro.modules;
    const loadedOnly = !!modules && typeof modules === 'object';
    function componentType(value, depth = 0) {
        if (typeof value === 'function') return true;
        if (!value || typeof value !== 'object' || depth > 8) return false;
        if (value.$$typeof === Symbol.for('react.forward_ref')) return typeof value.render === 'function';
        return value.$$typeof === Symbol.for('react.memo') && componentType(value.type, depth + 1);
    }
    function webViewExport(exports, trustedPath = false) {
        try {
            const named = exports?.WebView, fallback = exports?.default;
            const candidate = named ?? fallback ?? exports;
            if (!componentType(candidate) || rejectedWebViews.has(candidate)) return;
            // A translation catalogue can also export "WebView". The package
            // re-exports the same component as default and WebView; Android's
            // platform export additionally has isFileUploadSupported.
            if (trustedPath || (named && named === fallback)
                || typeof candidate.isFileUploadSupported === 'function'
                || (typeof candidate.prototype?.injectJavaScript === 'function' && typeof candidate.prototype?.reload === 'function')) return candidate;
        } catch {}
    }
    function entry(kind, keys) {
        const id = JSON.stringify([kind, ...keys]);
        if (!entries.has(id)) entries.set(id, { kind, keys, value: undefined, checked: -Infinity });
        return entries.get(id);
    }
    function inspect(record, exports) {
        if (record.value || !exports) return;
        try {
            if (record.kind === 'webview') { record.value = webViewExport(exports); return; }
            if (record.kind === 'props' ? record.keys.every(key => exports[key] != null)
                : typeof exports.getName === 'function' && exports.getName.length === 0 && exports.getName() === record.keys[0]) record.value = exports;
        } catch {}
    }
    function inspectModule(module, records) {
        // Do not invoke the factory, __r, or read exports on uninitialized modules.
        if (!module?.isInitialized || module.hasError) return;
        let exports;
        try { exports = module.publicModule?.exports; } catch { return; }
        for (const record of records) {
            try { if (exports?.__esModule) inspect(record, exports.default); } catch {}
            inspect(record, exports);
        }
    }
    function lookup(kind, keys, userAction = false) {
        const record = entry(kind, keys);
        if (record.value || (!userAction && now() - record.checked < 5000)) return record.value;
        record.checked = now();
        if (kind === 'webview') {
            try { record.value = webViewExport(metro.findByImportedPath?.('react-native-webview'), true); } catch {}
            if (record.value) return record.value;
        }
        if (loadedOnly) {
            for (const id in modules) { try { inspectModule(modules[id], [record]); } catch {} if (record.value) break; }
        } else {
            // Older loaders without the module registry: user actions only.
            if (kind === 'webview') {
                for (const props of [['WebView', 'default'], ['WebView']]) {
                    try { record.value = webViewExport(metro.findByProps(...props)); } catch {}
                    if (record.value) break;
                }
            } else try { record.value = kind === 'props' ? metro.findByProps(...keys) : metro.findByStoreName(keys[0]); } catch {}
        }
        if (kind === 'webview' && !record.value) record.value = coldWebView.load(namespace => webViewExport(namespace, true));
        return record.value;
    }
    return {
        loadedOnly,
        byProps: (...keys) => lookup('props', keys),
        byStore: name => lookup('store', [name]),
        // Explicit QR clicks may retry a previously missing component at once.
        webView: () => lookup('webview', [], true),
        rejectWebView(component) {
            if (component && ['function', 'object'].includes(typeof component)) rejectedWebViews.add(component);
            entries.delete(JSON.stringify(['webview']));
        },
        clear() { entries.clear(); rejectedWebViews = new WeakSet(); coldWebView.clear(); },
        async prepare(queries, yieldFrame, isActive) {
            if (!loadedOnly) return;
            const records = queries.map(([kind, ...keys]) => entry(kind, keys));
            let count = 0;
            for (const id in modules) {
                if (!isActive()) return;
                try { inspectModule(modules[id], records); } catch {}
                if (records.every(record => record.value)) break;
                if (++count % 64 === 0) await yieldFrame();
            }
            if (isActive()) for (const record of records) record.checked = now();
        }
    };
}
