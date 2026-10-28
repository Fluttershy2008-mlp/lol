/* SPDX-License-Identifier: GPL-3.0-or-later */

export function webViewRuntimeClient() {
    try { if (typeof valenced !== 'undefined' && valenced.modules?.metro) return valenced; } catch {}
    try { if (typeof revenge !== 'undefined' && revenge.modules?.metro) return revenge; } catch {}
}

// Android packages import React, RN, EventEmitter or BatchedBridge, generated
// view/commands, a native bridge, shared hook and styles. Inspect that graph before
// requiring anything; a props-only search cannot identify an unloaded package.
export function createColdWebViewLoader(getClient = webViewRuntimeClient) {
    const attempted = new Set();
    let failure = 'API';
    const safely = fn => { try { return fn(); } catch { return undefined; } };
    function load(validate) {
        failure = 'API';
        const client = safely(getClient), finders = client?.modules?.finders;
        const filters = finders?.filters, metro = client?.modules?.metro;
        if (!finders?.lookupModules || !finders.lookupModule || !filters?.createFilterGenerator
            || !metro?.getModuleDependencies || !metro.isModuleInitialized) return;
        const scopes = filters.FilterScopes;
        if (!scopes?.Initialized || !scopes.Uninitialized || !scopes.All) return;

        // Discord's fork requests RNCWebView; newer upstream uses
        // RNCWebViewModule. Do not let a missing first alias stop the lookup.
        failure = 'NATIVE';
        let native;
        for (const name of ['RNCWebViewModule', 'RNCWebView']) {
            const value = safely(() => client.modules.native.getNativeModule(name));
            if (safely(() => typeof value?.shouldStartLoadWithLockIdentifier === 'function')) { native = value; break; }
        }
        if (!native) return;
        failure = 'REACT';
        const React = client.react?.React, RN = client.react?.ReactNative;
        if (!React || !RN) return;
        const codegenComponent = safely(() => RN.codegenNativeComponent);
        const codegenCommands = safely(() => RN.codegenNativeCommands);
        const browserView = value => value === 'RNCWebView'
            || value?.uiViewClassName === 'RNCWebView' || value?.__INTERNAL_VIEW_CONFIG?.uiViewClassName === 'RNCWebView';

        const relevant = value => safely(() => {
            if (!value) return false;
            if (value === React || value === RN || (value.createElement === React.createElement && value.useState === React.useState)
                || (RN.AppRegistry && value.AppRegistry === RN.AppRegistry && value.View === RN.View)) return true;
            if (typeof value === 'function') {
                if (['codegenNativeComponent', 'codegenNativeCommands'].includes(value.name)
                    || value === codegenComponent || value === codegenCommands) return true;
                if (['addListener', 'emit', 'removeAllListeners', 'listenerCount'].every(key => typeof value.prototype?.[key] === 'function')) return true;
                if (['registerCallableModule', 'getCallableModule'].every(key => typeof value.prototype?.[key] === 'function')) return true;
            }
            if (typeof value.dispatchCommand === 'function') return true;
            if (typeof value.registerCallableModule === 'function') return true;
            if (typeof value.get === 'function' && typeof value.getEnforcing === 'function') return true;
            return browserView(value.default) && ['goBack', 'goForward', 'injectJavaScript', 'postMessage'].every(key => typeof value.Commands?.[key] === 'function');
        });
        // Include cold IDs without exports, plus only the few initialized
        // anchors. Avoid filling the global finder cache with every app module.
        const readOnly = filters.createFilterGenerator((_, _id, value, initialized) => !initialized
            || relevant(value) || relevant(safely(() => value?.default)),
            () => 'fluttershy.morealts.webview.metadata', scopes.All | scopes.Initialized | scopes.Uninitialized)();
        failure = 'METADATA';
        const records = safely(() => [...finders.lookupModules(readOnly,
            { initialize: false, cached: false, returnNamespace: true })]);
        if (!records) return;
        const deps = new Map(), reactIds = new Set(), rnIds = new Set(), emitterIds = new Set();
        const bridgeIds = new Set(), bridgeConstructorIds = new Set();
        const componentIds = new Set(), commandIds = new Set(), registryIds = new Set(), nativeViewIds = new Set();
        const dispatcherIds = new Set();
        const seed = (set, id) => { if (Number.isInteger(id) && id >= 0) set.add(id); };
        seed(reactIds, client.react.ReactModuleId); seed(rnIds, client.react.ReactNativeModuleId);
        const intersects = (ids, anchors) => ids?.some(id => anchors.has(id));
        for (const [namespace, id] of records) {
            const dependencies = safely(() => metro.getModuleDependencies(id));
            if (Array.isArray(dependencies)) deps.set(id, dependencies);
            for (const value of [namespace, safely(() => namespace?.default)]) {
                if (!value) continue;
                safely(() => {
                    if (value === React || (value.createElement === React.createElement && value.useState === React.useState)) reactIds.add(id);
                    if (value === RN || (RN.AppRegistry && value.AppRegistry === RN.AppRegistry && value.View === RN.View)) rnIds.add(id);
                    if (typeof value === 'function') {
                        if (value.name === 'codegenNativeComponent' || value === codegenComponent) componentIds.add(id);
                        if (value.name === 'codegenNativeCommands' || value === codegenCommands) commandIds.add(id);
                        const p = value.prototype;
                        if (['addListener', 'emit', 'removeAllListeners', 'listenerCount'].every(key => typeof p?.[key] === 'function')) emitterIds.add(id);
                        if (['registerCallableModule', 'getCallableModule'].every(key => typeof p?.[key] === 'function')) bridgeConstructorIds.add(id);
                    }
                    if (typeof value.dispatchCommand === 'function') dispatcherIds.add(id);
                    if (typeof value.registerCallableModule === 'function') bridgeIds.add(id);
                    if (typeof value.get === 'function' && typeof value.getEnforcing === 'function') registryIds.add(id);
                    const commands = value.Commands, view = value.default;
                    if (browserView(view) && ['goBack', 'goForward', 'injectJavaScript', 'postMessage'].every(key => typeof commands?.[key] === 'function')) nativeViewIds.add(id);
                });
            }
        }
        // RN's BatchedBridge singleton has one dependency: MessageQueue. It can
        // still be cold even when the constructor has already been imported.
        for (const [id, imports] of deps) {
            if (!metro.isModuleInitialized(id) && imports.length === 1 && bridgeConstructorIds.has(imports[0])) bridgeIds.add(id);
        }
        failure = 'ANCHORS';
        if (!reactIds.size || !rnIds.size || (!emitterIds.size && !bridgeIds.size)) return;
        const candidates = [];
        for (const [id, imports] of deps) {
            if (attempted.has(id) || metro.isModuleInitialized(id)
                || !intersects(imports, reactIds) || !intersects(imports, rnIds)
                || (!intersects(imports, emitterIds) && !intersects(imports, bridgeIds))) continue;
            let generatedView = false, sharedHook = false, nativeBridge = false;
            const rnOnlyChildren = new Set();
            for (const child of imports) {
                if (reactIds.has(child) || rnIds.has(child) || emitterIds.has(child) || bridgeIds.has(child)) continue;
                const nested = deps.get(child) ?? safely(() => metro.getModuleDependencies(child));
                // Release codegen may inline commands or minify helper names.
                // Both still import RN's dispatcher, directly or via the helper.
                const dispatches = !intersects(nested, reactIds) && (intersects(nested, dispatcherIds) || nested?.some(helper =>
                    !rnIds.has(helper) && !reactIds.has(helper) && !emitterIds.has(helper) && !bridgeIds.has(helper)
                    && intersects(deps.get(helper) ?? safely(() => metro.getModuleDependencies(helper)), dispatcherIds)));
                if (nativeViewIds.has(child) || (intersects(nested, componentIds) && intersects(nested, commandIds)) || dispatches) generatedView = true;
                if (intersects(nested, reactIds) && intersects(nested, rnIds)) sharedHook = true;
                if (intersects(nested, registryIds)) nativeBridge = true;
                if (intersects(nested, rnIds) && !intersects(nested, reactIds)) rnOnlyChildren.add(child);
            }
            // Current bridge + styles each import RN. Older bridge wrappers
            // import TurboModuleRegistry separately and have one RN styles leaf.
            if (generatedView && sharedHook && (rnOnlyChildren.size >= 2 || (nativeBridge && rnOnlyChildren.size >= 1))) candidates.push(id);
        }
        // An ambiguous dependency graph is not a licence to run extra factories.
        failure = candidates.length > 1 ? 'AMBIGUOUS' : attempted.size ? 'LOAD' : 'MATCH';
        if (candidates.length !== 1) return;
        const id = candidates[0]; attempted.add(id);
        const target = filters.createFilterGenerator((_, candidate) => candidate === id,
            () => 'fluttershy.morealts.webview.load.' + id, scopes.Initialized | scopes.Uninitialized)();
        failure = 'LOAD';
        const namespace = safely(() => finders.lookupModule(target,
            { initialize: true, cached: false, returnNamespace: true })?.[0]);
        if (!namespace) return;
        failure = 'EXPORT';
        const component = safely(() => validate(namespace));
        if (component) failure = undefined;
        return component;
    }
    return { load, reason: () => failure, clear() { attempted.clear(); failure = 'API'; } };
}
