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
    const requests = new Set();
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
    const rawFind = (...props) => finders.lookupModule(filters.withProps(...props), { initialize: false })[0];
    const hasProps = (value, props) => value && props.every(key => safe(() => value[key] != null));
    // Discord has shipped both flat REST exports and { HTTP, getAPIBaseURL }.
    // Bind each method to its actual owner; a spread loses lazy getters/receivers.
    let httpSource, httpFacade;
    function legacyHTTP() {
        const source = rawFind('HTTP');
        if (!source?.HTTP) return rawFind('get', 'post', 'del');
        if (source === httpSource) return httpFacade;
        httpSource = source;
        httpFacade = new Proxy({}, {
            get(_target, key) {
                const owner = source.HTTP[key] != null ? source.HTTP : source;
                const value = owner[key];
                return typeof value === 'function' ? value.bind(owner) : value;
            },
            has: (_target, key) => key in source.HTTP || key in source,
        });
        return httpFacade;
    }
    const navigationWrappers = new WeakMap();
    let navigationSource, navigationModule;
    const legacyRoute = metadata.id + '.legacy-page';
    let routeRegistered = false, routeWaiting = false;
    function LegacyPage({ route }) {
        const Page = route?.params?.render;
        return active && typeof Page === 'function' ? React.createElement(Page) :
            React.createElement(RN.Text, { style: { padding: 20 } }, 'Reopen this page from the enabled plugin.');
    }
    function openLegacyPage(navigation, params) {
        if (!active) return;
        if (typeof params?.render !== 'function') throw new Error('The plugin page has no renderer.');
        const settings = U.discord.modules?.settings;
        if (!settings?.onSettingsModulesLoaded || !settings.registerSettingsItem)
            throw new Error('Update Revenge Next to open this plugin page.');
        const navigate = () => setTimeoutScoped(() => {
            const open = () => { if (active) navigation.navigate(legacyRoute, params); };
            if (navigation.isReady?.() === false && navigation.addListener) {
                let remove;
                const ready = () => { remove?.(); open(); };
                const unsubscribe = navigation.addListener('ready', ready);
                remove = own(typeof unsubscribe === 'function' ? unsubscribe : () => navigation.removeListener?.('ready', ready));
            } else open();
        }, 0);
        if (routeRegistered) return navigate();
        if (routeWaiting) return;
        routeWaiting = true;
        own(settings.onSettingsModulesLoaded(() => {
            if (!active) return;
            const unregister = settings.registerSettingsItem(legacyRoute, {
                type: 'route', parent: metadata.id, unsearchable: true,
                useTitle: () => metadata.legacyManifest.name,
                screen: { route: legacyRoute, getComponent: () => LegacyPage },
            });
            routeRegistered = true;
            own(() => { unregister(); routeRegistered = false; settings.refreshSettings(); });
            settings.refreshSettings();
            navigate();
        }));
    }
    function wrapNavigation(navigation) {
        if (!navigation || typeof navigation !== 'object') return navigation;
        if (navigationWrappers.has(navigation)) return navigationWrappers.get(navigation);
        const wrapper = new Proxy(navigation, {
            get(target, key) {
                if (key === 'navigate') return function (route, params, ...rest) {
                    const name = typeof route === 'object' ? route?.name : route;
                    if (name === 'BUNNY_CUSTOM_PAGE') return openLegacyPage(target, typeof route === 'object' ? route.params : params);
                    return target.navigate(route, params, ...rest);
                };
                const value = Reflect.get(target, key, target);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });
        navigationWrappers.set(navigation, wrapper); return wrapper;
    }
    function legacyNavigation() {
        const source = rawFind('getRootNavigationRef') ?? U.discord.modules?.mainTabsV2?.RootNavigationRef;
        if (!source) return;
        if (source === navigationSource) return navigationModule;
        navigationSource = source;
        navigationModule = new Proxy(source, { get(target, key) {
            if (key === 'getRootNavigationRef') return () => wrapNavigation(target.getRootNavigationRef());
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
        } });
        return navigationModule;
    }
    function findByProps(...props) {
        if (props.includes('getRootNavigationRef')) {
            const navigation = legacyNavigation();
            if (hasProps(navigation, props)) return navigation;
        }
        const found = rawFind(...props);
        if (found) return found;
        if (props.some(p => ['get', 'post', 'put', 'patch', 'del', 'getAPIBaseURL'].includes(p))) {
            const http = legacyHTTP();
            if (hasProps(http, props)) return http;
        }
        // Use Next's curated modules when the corresponding Metro barrel is lazy.
        for (const get of [() => U.discord.design.Design, () => U.discord.actions.ActionSheetActionCreators,
            () => U.discord.actions.AlertActionCreators]) {
            const candidate = safe(get);
            if (hasProps(candidate, props)) return candidate;
        }
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
    // More Alts deliberately inspects initialized records instead of executing
    // arbitrary Metro factories. Supply that legacy view using Next's finders.
    let initialized = new Map();
    metro.modules = new Proxy({}, {
        ownKeys() {
            const navigation = legacyNavigation(), http = legacyHTTP();
            initialized = new Map([...finders.lookupModules(custom(() => true, 'initialized'),
                { cached: false, initialize: false, returnNamespace: true })].map(([value, id]) => [String(id),
                    navigation && value === navigationSource ? navigation : navigation && safe(() => value.default === navigationSource)
                        ? { __esModule: true, default: navigation } : value]));
            if (navigation) initialized.set('next.navigation', navigation);
            if (http) initialized.set('next.http', http);
            return [...initialized.keys()];
        },
        get: (_target, key) => initialized.has(key) ? { isInitialized: true, publicModule: { exports: initialized.get(key) } } : undefined,
        getOwnPropertyDescriptor: (_target, key) => initialized.has(key) ? { enumerable: true, configurable: true } : undefined,
    });
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
        Flux: () => rawFind('Store', 'connectStores') ?? U.discord.common.flux,
        constants: () => U.discord.common.constants.Constants,
        clipboard: () => U.externals.ReactNativeClipboard.Clipboard,
        RestAPI: legacyHTTP,
        commands: () => findByProps('getBuiltInCommands'),
        messageUtil: () => findByProps('sendMessage', 'receiveMessage') ?? findByProps('sendMessage'),
        i18n: () => findByProps('Messages', 'setLocale'),
        url: () => findByProps('openURL', 'openDeeplink'),
        stylesheet: () => U.discord.design.Design,
        lodash: () => findByProps('cloneDeep', 'isEqual'),
        moment: () => findByProps('isMoment'),
        chroma: () => findByProps('valid', 'rgb'),
        NavigationNative: () => U.externals.ReactNavigation?.ReactNavigationNative,
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
        Forms: { FormRow: ({ leading, ...props }) => h(design.TableRow, { ...props, icon: props.icon ?? leading }),
            FormSection: design.TableRowGroup,
            FormSwitchRow: ({ leading, ...props }) => h(design.TableSwitchRow, { ...props, icon: props.icon ?? leading }),
            FormIcon: props => h(RN.Image, { ...props, style: [{ width: 24, height: 24 }, props.style] }),
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
                        if (channelId && result.type === 4 && result.data) return sendLocalMessage(channelId, result.data);
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
    function sendLocalMessage(channelId, body, modifications) {
        if (!active) return;
        const actions = findByProps('receiveMessage'), factory = findByProps('createBotMessage');
        if (actions?.receiveMessage && factory?.createBotMessage) {
            const message = factory.createBotMessage({ ...body, channelId, channel_id: channelId });
            const author = message.author;
            Object.assign(message, modifications ?? {});
            if (modifications?.author) message.author = { ...author, ...modifications.author };
            actions.receiveMessage(channelId, message);
            return;
        }
        const bot = findByProps('sendBotMessage');
        if (bot?.sendBotMessage && typeof body.content === 'string' && !body.embeds?.length)
            return bot.sendBotMessage(channelId, body.content);
        throw new Error('Local message output is unavailable on this Discord build.');
    }
    const plugins = {}, themes = {};
    async function refreshRegistry() {
        const response = await U.modules.native.callNativeMethod('revenge.plugins.list', []);
        if (!active) return;
        // The generic bridge unwraps its transport envelope. Plugin-system
        // methods return a second { result } or { error } envelope inside it.
        if (response && !Array.isArray(response) && Object.hasOwn(response, 'error')) {
            const detail = response.error;
            const error = new Error(detail?.message ?? 'Could not read installed plugins.');
            error.code = detail?.code ?? 'UNKNOWN';
            throw error;
        }
        const list = Array.isArray(response) ? response : response?.result;
        if (list !== null && !Array.isArray(list)) throw new Error('Invalid plugin registry response from Revenge Next.');
        for (const registry of [plugins, themes]) for (const key of Object.keys(registry)) delete registry[key];
        for (const item of list ?? []) {
            const manifest = item?.manifest;
            if (!manifest?.id) continue;
            const data = { ...manifest, authors: [manifest.author, ...(manifest.contributors ?? [])].filter(Boolean) };
            // A sideloaded or third-party plugin must not inherit our repo URL.
            const repository = item.source?.repo ?? (item.source === undefined && manifest.id.startsWith('dev.fluttershy2008.')
                ? metadata.repository : manifest.id);
            const entry = { id: repository, manifest: data, data,
                enabled: typeof item.enabled === 'boolean' ? item.enabled : undefined };
            if (manifest.dependencies?.['revenge.api.themes']) themes[manifest.id] = entry;
            else plugins[manifest.id] = entry;
        }
    }
    const adapter = {
        metro, patcher, logger: {
            ...api.logger,
            warn: (...args) => api.logger?.warn?.(...args),
            log: (...args) => api.logger?.log?.(...args),
            error(...args) {
                if (args.length <= 2 && typeof args.at(-1) === 'string' &&
                    /^(Blocked Users|Friends List|Server Leaver) shortcut is unavailable; the plugin settings page is still accessible\.$/.test(args.at(-1)))
                    api.logger?.warn?.(...args);
                else log(...args);
            },
        },
        plugin: { id: metadata.id, manifest: metadata.legacyManifest, storage },
        storage: { useProxy, awaitSyncWrapper: async value => {
            if (value === plugins || value === themes) await refreshRegistry();
            return value;
        } },
        commands: { registerCommand, sendLocalMessage }, plugins: { plugins }, themes: { themes },
        ui: { components, assets: { getAssetIDByName: name => U.assets.getAssetIdByName(name),
            getAssetByName: name => U.assets.getAssetByName(name) },
            toasts: { showToast }, alerts: { showConfirmationAlert, showInputAlert },
            semanticColors: safe(() => findByProps('unsafe_rawColors', 'colors')?.colors) ?? {},
        },
        utils: { findInTree, findInReactTree, safeFetch,
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
    async function safeFetch(url, init = {}, timeout = 10000) {
        if (!active) throw new Error('Plugin is stopped.');
        if (init.signal?.aborted) throw init.signal.reason ?? new Error('Request aborted.');
        const controller = typeof host.AbortController === 'function' ? new host.AbortController() : undefined;
        let timer, rejectPending;
        const cancel = reason => { controller?.abort(reason); rejectPending(reason); };
        const abort = () => cancel(init.signal.reason ?? new Error('Request aborted.'));
        try {
            const cancelled = new Promise((_resolve, reject) => { rejectPending = reject; });
            requests.add(cancel);
            init.signal?.addEventListener?.('abort', abort, { once: true });
            if (init.signal?.aborted) abort();
            if (Number.isFinite(timeout) && timeout > 0)
                timer = setTimeoutScoped(() => cancel(new Error('Request timed out.')), timeout);
            return await Promise.race([cancelled, host.fetch(url, { ...init, ...(controller ? { signal: controller.signal } : {}) })]);
        } finally {
            clearTimeoutScoped(timer); requests.delete(cancel);
            init.signal?.removeEventListener?.('abort', abort);
        }
    }
    function dispose() {
        if (!active) return writes;
        active = false;
        for (const cancel of requests) cancel(new Error('Plugin is stopped.'));
        requests.clear();
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
            const state = { bridge, legacy: undefined, stopped: false, stopping: undefined, stop };
            running = state;
            function stop() {
                if (state.stopped) return state.stopping;
                state.stopped = true;
                if (running === state) running = undefined;
                let unload;
                try { unload = Promise.resolve(state.legacy?.onUnload?.()); }
                catch (error) { unload = Promise.reject(error); }
                // Remove hooks and cancel timers/requests before waiting for a
                // legacy async unload. Next invokes registered cleanups again.
                state.stopping = Promise.all([unload, bridge.dispose()]).then(() => undefined);
                return state.stopping;
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
        stop() { epoch++; return running?.stop(); },
        SettingsComponent({ api }) {
            const React = api.unscoped.react.React;
            const Settings = running?.legacy?.settings;
            return Settings ? React.createElement(Settings) : React.createElement(api.unscoped.react.ReactNative.Text,
                { style: { padding: 20 }, selectable: true }, running
                    ? 'This plugin has no settings. Use its Discord menu items or commands.'
                    : 'Enable this plugin to open its settings.');
        },
    };
}

module.exports = { createLegacyAdapter, createNextPlugin };
