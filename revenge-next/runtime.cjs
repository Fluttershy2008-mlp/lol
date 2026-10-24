// SPDX-License-Identifier: MIT
// Per-plugin adapter for the documented Revenge Next API. No globals are replaced.
'use strict';

function createLegacyAdapter(api, metadata, host = globalThis) {
    const U = api.unscoped;
    const { React, ReactNative: RN } = U.react;
    const finders = U.modules.finders;
    const filters = finders.filters;
    if (!React?.createElement || !RN || !finders.lookupModule || !U.patcher.instead)
        throw new Error('This package requires the Revenge Next plugin API.');
    const disposers = new Set();
    const timeouts = new Set();
    const intervals = new Set();
    const listeners = new Set();
    const ownedCommands = new Set();
    let active = true, revision = 0, scheduled = false, writes = Promise.resolve();
    const log = (...args) => api.logger?.error?.(...args);
    const safe = fn => { try { return fn(); } catch { return undefined; } };
    const own = fn => {
        let current = fn;
        const remove = () => {
            if (!current) return;
            const dispose = current; current = undefined; disposers.delete(remove);
            try { dispose(); } catch (error) { log(error); }
        };
        if (active) disposers.add(remove); else remove();
        return remove;
    };
    function findByProps(...props) {
        return finders.lookupModule(filters.withProps(...props), { initialize: false })[0];
    }
    function custom(predicate, label) {
        return filters.createFilterGenerator(
            (_, id, value) => Boolean(safe(() => predicate(value, id))),
            () => 'fluttershy.next.' + metadata.id + '.' + label,
        )();
    }
    let sequence = 0;
    const metro = {
        findByProps,
        findByPropsAll: (...props) => [...finders.lookupModules(filters.withProps(...props), { initialize: false })].map(x => x[0]),
        findByName: (name, defaultExport = true) => finders.lookupModule(filters.withName(name),
            { initialize: false, returnNamespace: !defaultExport })[0],
        findByTypeName: name => finders.lookupModule(custom(m => m?.type?.name === name || m?.type?.displayName === name,
            'type.' + name), { initialize: false })[0],
        findByDisplayName: (name, defaultExport = true) => finders.lookupModule(custom(m => m?.displayName === name,
            'display.' + name), { initialize: false, returnNamespace: !defaultExport })[0],
        findByStoreName: name => U.discord.flux.Stores[name],
        find: (predicate, defaultExport = true) => finders.lookupModule(custom(predicate, 'custom.' + sequence++),
            { cached: false, initialize: false, returnNamespace: !defaultExport })[0],
        findAll: predicate => [...finders.lookupModules(custom(predicate, 'all.' + sequence++),
            { cached: false, initialize: false })].map(x => x[0]),
    };
    function patch(kind, key, parent, hook, once) {
        if (!active) return () => {};
        if (typeof parent?.[key] !== 'function') throw new Error('Unavailable Discord method: ' + key);
        let remove, used = false;
        remove = own(U.patcher.instead(parent, key, function (args, original) {
            if (!active || (once && used)) return Reflect.apply(original, this, args);
            used = true;
            try {
                if (kind === 'instead') return hook.call(this, args, original);
                if (kind === 'before') {
                    const replacement = hook.call(this, args);
                    return Reflect.apply(original, this, Array.isArray(replacement) ? replacement : args);
                }
                const result = Reflect.apply(original, this, args);
                const replacement = hook.call(this, args, result);
                return replacement === undefined ? result : replacement;
            } finally { if (once) remove?.(); }
        }));
        return remove;
    }
    const patcher = Object.fromEntries(['before', 'after', 'instead'].map(kind =>
        [kind, (key, parent, hook, once) => patch(kind, key, parent, hook, once)]));

    // Work against a private copy: Next's cache must only be changed with set().
    const raw = JSON.parse(JSON.stringify(api.jsonStorage.cache ?? {}));
    const proxies = new WeakMap();
    const rawValues = new WeakMap();
    function notify() {
        revision++;
        for (const listener of [...listeners]) { try { listener(); } catch (error) { log(error); } }
        if (!scheduled) {
            scheduled = true;
            Promise.resolve().then(() => { scheduled = false; flush(); });
        }
    }
    function flush() {
        const value = JSON.parse(JSON.stringify(raw));
        writes = writes.then(() => api.jsonStorage.set(value, true)).catch(error => { log('Could not save plugin settings', error); });
        return writes;
    }
    function proxify(value) {
        if (!value || typeof value !== 'object') return value;
        if (proxies.has(value)) return proxies.get(value);
        const proxy = new Proxy(value, {
            get: (target, key) => proxify(Reflect.get(target, key)),
            set(target, key, next) {
                if (!active) return true;
                next = rawValues.get(next) ?? next;
                if (Object.is(target[key], next)) return true;
                const changed = Reflect.set(target, key, next);
                if (changed) notify();
                return changed;
            },
            deleteProperty(target, key) {
                if (!active) return true;
                const present = Object.hasOwn(target, key), changed = Reflect.deleteProperty(target, key);
                if (present && changed) notify();
                return changed;
            },
        });
        proxies.set(value, proxy); rawValues.set(proxy, value);
        return proxy;
    }
    const storage = proxify(raw);
    function useProxy(value) {
        const [, redraw] = React.useState(0);
        React.useEffect(() => {
            const onChange = () => redraw(revision);
            listeners.add(onChange);
            return () => listeners.delete(onChange);
        }, []);
        return value;
    }
    const common = { React, ReactNative: RN };
    const commonGetters = {
        FluxDispatcher: () => U.discord.common.flux.Dispatcher,
        Flux: () => U.discord.common.flux,
        constants: () => U.discord.common.constants.Constants,
        clipboard: () => U.externals.ReactNativeClipboard.Clipboard,
        RestAPI: () => findByProps('HTTP')?.HTTP ?? findByProps('get', 'post', 'patch', 'del'),
        commands: () => findByProps('getBuiltInCommands'),
        messageUtil: () => findByProps('sendMessage', 'receiveMessage') ?? findByProps('sendMessage'),
        i18n: () => findByProps('Messages', 'setLocale'),
        url: () => findByProps('openURL', 'openDeeplink'),
        stylesheet: () => U.discord.design.Design,
        lodash: () => findByProps('cloneDeep', 'isEqual'),
        moment: () => findByProps('isMoment'),
        chroma: () => findByProps('valid', 'rgb'),
        NavigationNative: () => U.externals.ReactNavigation,
    };
    for (const [key, get] of Object.entries(commonGetters)) Object.defineProperty(common, key, { get, enumerable: true });
    metro.common = common;

    function showToast(message) {
        if (!active) return;
        const text = typeof message === 'string' ? message : String(message?.message ?? message?.text ?? message ?? '');
        if (typeof RN.ToastAndroid?.show === 'function') RN.ToastAndroid.show(text, RN.ToastAndroid.SHORT ?? 0);
        else api.logger?.log?.(text);
    }
    function findInTree(root, predicate, options = {}) {
        const seen = new Set();
        const walk = (value, depth) => {
            if (!value || typeof value !== 'object' || seen.has(value) || depth > (options.maxDepth ?? 40) || seen.size > 5000) return;
            seen.add(value);
            if (predicate(value)) return value;
            const keys = Array.isArray(value) ? Object.keys(value) : (options.walkable ?? Object.keys(value));
            for (const key of keys) {
                if (options.ignore?.includes(key)) continue;
                const match = walk(value[key], depth + 1);
                if (match) return match;
            }
        };
        return walk(root, 0);
    }
    const findInReactTree = (tree, predicate) => findInTree(tree, predicate, { walkable: ['props', 'children', 'child', 'sibling'] });
    const design = U.discord.design.Design;
    const h = React.createElement;
    function showConfirmationAlert(options) {
        const { title, content, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel } = options;
        const confirm = () => { if (active) Promise.resolve().then(() => onConfirm?.()).catch(log); };
        if (typeof content === 'string' || content == null) {
            return RN.Alert.alert(title, content ?? '', [
                { text: cancelText, style: 'cancel', onPress: () => active && onCancel?.() },
                { text: confirmText, style: options.confirmColor === 'red' ? 'destructive' : 'default', onPress: confirm },
            ]);
        }
        const alerts = U.discord.actions.AlertActionCreators;
        const key = metadata.id + '.alert.' + sequence++;
        const close = own(() => alerts.dismissAlert(key));
        alerts.openAlert(key, h(design.AlertModal, { title, content, actions: h(RN.View, null,
            h(design.AlertActionButton, { text: cancelText, onPress: () => { close(); if (active) onCancel?.(); } }),
            h(design.AlertActionButton, { text: confirmText, onPress: () => { close(); confirm(); } })) }));
    }
    function showInputAlert(options) {
        function Input() {
            const [value, setValue] = React.useState(options.initialValue ?? '');
            return h(RN.View, { style: { padding: 12 } },
                h(RN.TextInput, { value, onChangeText: setValue, placeholder: options.placeholder, autoCapitalize: 'none' }),
                h(design.Button, { text: options.confirmText ?? 'Confirm', onPress: () => { close(); if (active) options.onConfirm?.(value); } }));
        }
        const key = metadata.id + '.input.' + sequence++, alerts = U.discord.actions.AlertActionCreators;
        const close = own(() => alerts.dismissAlert(key));
        alerts.openAlert(key, h(design.AlertModal, { title: options.title, content: h(Input) }));
    }
    const components = {
        // Define an own property so React Native's inherited getter is never
        // assigned to. Keep the other native exports lazy and unchanged.
        General: Object.create(RN, {
            Button: { value: design.Button, enumerable: true, writable: true, configurable: true },
        }),
        Forms: { FormRow: design.TableRow, FormSection: design.TableRowGroup, FormSwitchRow: design.TableSwitchRow,
            FormInput: design.TextInput, FormText: design.Text, FormDivider: RN.View },
        Button: design.Button,
    };
    if (React.Component) components.ErrorBoundary = class extends React.Component {
        constructor(props) { super(props); this.state = { error: null }; }
        static getDerivedStateFromError(error) { return { error }; }
        componentDidCatch(error) { log(error); }
        render() { return this.state.error ? h(RN.Text, { selectable: true }, String(this.state.error.message)) : this.props.children; }
    };
    function registerCommand(input) {
        if (!active) return () => {};
        const mod = common.commands;
        if (!mod?.getBuiltInCommands) throw new Error('Local commands are unavailable on this Discord version.');
        let builtIns;
        try { builtIns = mod.getBuiltInCommands(1, true, false); }
        catch { builtIns = mod.getBuiltInCommands([1, 2, 3], true, false); }
        const ids = (builtIns ?? []).map(c => Number(c.id)).filter(Number.isFinite);
        const id = String(Math.min(-1, ...ids) - 1);
        const command = { ...input, id, applicationId: '-1', type: input.type ?? 1, inputType: 1,
            displayName: input.displayName ?? input.name, untranslatedName: input.name,
            displayDescription: input.displayDescription ?? input.description, untranslatedDescription: input.description,
            options: (input.options ?? []).map(option => ({ ...option, displayName: option.displayName ?? option.name,
                displayDescription: option.displayDescription ?? option.description })),
            execute(...args) {
                if (!active || !ownedCommands.has(id)) return;
                return Promise.resolve().then(() => input.execute.apply(command, args)).then(result => {
                    if (active && ownedCommands.has(id) && result && typeof result === 'object') {
                        const channelId = args[1]?.channel?.id;
                        const send = common.messageUtil;
                        if (channelId && send?.sendMessage) return send.sendMessage(channelId, result);
                    }
                }).catch(log);
            },
        };
        ownedCommands.add(id);
        const unpatch = patcher.after('getBuiltInCommands', mod, ([types], result) => {
            if (!active || !ownedCommands.has(id) || input.shouldHide?.() === false) return result;
            if (!(Array.isArray(types) ? types.includes(command.type) : types === command.type)) return result;
            return [...(result ?? []), command];
        });
        return own(() => { ownedCommands.delete(id); unpatch(); });
    }
    const plugins = {}, themes = {};
    async function refreshRegistry() {
        const list = await U.modules.native.callNativeMethod('revenge.plugins.list', []);
        if (!active || !Array.isArray(list)) return;
        for (const registry of [plugins, themes]) for (const key of Object.keys(registry)) delete registry[key];
        for (const item of list) {
            const manifest = item.manifest;
            if (!manifest?.id) continue;
            const data = { ...manifest, authors: [manifest.author, ...(manifest.contributors ?? [])].filter(Boolean) };
            const entry = { id: item.source?.repo ?? metadata.repository, manifest: data, data,
                enabled: typeof item.enabled === 'boolean' ? item.enabled : undefined };
            if (manifest.dependencies?.['revenge.api.themes']) themes[manifest.id] = entry;
            else plugins[manifest.id] = entry;
        }
    }
    const adapter = {
        metro, patcher, logger: api.logger,
        plugin: { id: metadata.id, manifest: metadata.legacyManifest, storage },
        storage: { useProxy, awaitSyncWrapper: async value => {
            if (value === plugins || value === themes) await refreshRegistry();
            return value;
        } },
        commands: { registerCommand }, plugins: { plugins }, themes: { themes },
        ui: { components, assets: { getAssetIDByName: name => U.assets.getAssetIdByName(name),
            getAssetByName: name => U.assets.getAssetByName(name) },
            toasts: { showToast }, alerts: { showConfirmationAlert, showInputAlert },
            semanticColors: safe(() => findByProps('unsafe_rawColors', 'colors')?.colors) ?? {},
        },
        utils: { findInTree, findInReactTree, safeFetch: (...args) => host.fetch(...args),
            unfreeze: value => ({ ...value }) },
    };
    function setTimeoutScoped(fn, delay, ...args) {
        if (!active) return;
        const id = host.setTimeout(() => { timeouts.delete(id); if (active) fn(...args); }, delay);
        timeouts.add(id); return id;
    }
    function setIntervalScoped(fn, delay, ...args) {
        if (!active) return;
        const id = host.setInterval(() => { if (active) fn(...args); }, delay);
        intervals.add(id); return id;
    }
    function clearTimeoutScoped(id) { host.clearTimeout(id); timeouts.delete(id); }
    function clearIntervalScoped(id) { host.clearInterval(id); intervals.delete(id); }
    function dispose() {
        if (!active) return writes;
        active = false;
        for (const id of timeouts) host.clearTimeout(id);
        for (const id of intervals) host.clearInterval(id);
        timeouts.clear(); intervals.clear(); ownedCommands.clear();
        for (const remove of [...disposers].reverse()) remove();
        listeners.clear();
        return flush();
    }
    return { adapter, dispose, flush, timers: [setTimeoutScoped, clearTimeoutScoped, setIntervalScoped, clearIntervalScoped] };
}

function createNextPlugin(factory, metadata, host = globalThis) {
    let running, epoch = 0;
    return {
        jsonStorage: { load: true, default: {} },
        async start(api) {
            const session = ++epoch;
            if (!api.jsonStorage.loaded) await api.jsonStorage.get();
            if (session !== epoch) return;
            const bridge = createLegacyAdapter(api, metadata, host);
            const state = { bridge, legacy: undefined, stopped: false };
            running = state;
            async function stop() {
                if (state.stopped) return;
                state.stopped = true;
                try { await state.legacy?.onUnload?.(); }
                finally { await bridge.dispose(); if (running === state) running = undefined; }
            }
            api.cleanup(stop);
            try {
                state.legacy = factory(bridge.adapter, ...bridge.timers);
                if (!state.legacy || typeof state.legacy !== 'object') throw new Error('Invalid legacy plugin exports.');
                await state.legacy.onLoad?.();
                if (session !== epoch || state.stopped) { await stop(); return; }
                if (api.plugin.startedLate) api.plugin.requireReload();
            } catch (error) { await stop(); throw error; }
        },
        stop() { epoch++; },
        SettingsComponent({ api }) {
            const React = api.unscoped.react.React;
            const Settings = running?.legacy?.settings;
            return Settings ? React.createElement(Settings) : React.createElement(api.unscoped.react.ReactNative.Text,
                { style: { padding: 20 }, selectable: true }, 'Enable this plugin to open its settings.');
        },
    };
}

module.exports = { createLegacyAdapter, createNextPlugin };
