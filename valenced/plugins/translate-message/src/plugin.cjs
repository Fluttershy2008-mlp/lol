// SPDX-License-Identifier: GPL-3.0-or-later
// Valenced native shell for the Vencord Translate port; upstream attribution in THIRD_PARTY_NOTICES.md.
'use strict';

function createPluginOptions(env = globalThis) {
    let current, writes = Promise.resolve();
    const listeners = new Set();
    const broadcast = () => { for (const listener of [...listeners]) { try { listener(); } catch {} } };
    const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
    function saveSettings(api, updates) {
        const old = current?.controller?.settings() ?? normalizeSettings(api.jsonStorage.cache);
        const values = normalizeSettings({ ...old, ...updates });
        current?.controller?.configure(values);
        broadcast();
        writes = writes.catch(() => {}).then(() => api.jsonStorage.set(values));
        return writes.then(() => true, () => {
            current?.notify?.('Could not save Translate settings. Try again.'); return false;
        });
    }
    const optional = fn => { try { return fn(); } catch { return undefined; } };
    const MENU_KEYS = new Set(['MessageLongPressActionSheet', 'MessageActionSheet', 'MessageActionsSheet']);
    const TRANSLATE_KEY = 'valenced.translate-message.translate';
    const REVERT_KEY = 'valenced.translate-message.revert';

    async function shutdown(session) {
        if (!session) return;
        if (session.stopping) return session.stopping;
        session.stopping = (async () => {
            await session.outgoing?.dispose();
            await session.controller?.dispose();
            session.active = false;
            env.clearTimeout(session.retry);
            for (const remove of session.removers.splice(0).reverse()) optional(remove);
            if (current === session) current = undefined;
            broadcast();
        })();
        return session.stopping;
    }

    async function start(api) {
        if (current?.active) return;
        const U = api.unscoped, { React, ReactNative: RN } = U.react;
        const h = React.createElement, F = U.modules.finders;
        const session = { active: true, connected: false, removers: [] };
        current = session;
        api.cleanup(() => shutdown(session));
        const live = () => session.active && current === session && !session.stopping;
        const byProps = (...props) => optional(() => F.lookupModule(F.filters.withProps(...props), { initialize: false })[0]);
        const stores = () => U.discord.flux.Stores;
        const getMessage = ref => optional(() => stores().MessageStore.getMessage(ref.channelId, ref.messageId));
        const notify = text => {
            if (!session.active) return;
            if (typeof RN.ToastAndroid?.show === 'function') RN.ToastAndroid.show(text, RN.ToastAndroid.SHORT ?? 0);
            else optional(() => RN.Alert?.alert?.('Translate Message', text));
        };
        const localEvent = Symbol('translate-message.local-display');
        session.live = live; session.changed = broadcast; session.notify = notify;
        session.ui = { api, getSession: () => current, subscribe, save: values => saveSettings(api, values) };
        const translator = createVencordTranslator(env, notify);
        session.translator = translator;
        session.controller = createController({
            account: () => optional(() => stores().UserStore.getCurrentUser()?.id),
            message: getMessage, notify, changed: broadcast,
            settings: api.jsonStorage?.cache,
            translate: (text, target, signal, options) => translator('received', text, options.settings, signal),
            display(ref, content) {
                const dispatcher = U.discord.common.flux.Dispatcher;
                if (typeof dispatcher?.dispatch !== 'function') throw failure('DISPLAY', 'Discord message updates are unavailable.');
                // A partial local Flux update; no Discord REST or send/edit API is called.
                return dispatcher.dispatch({
                    type: 'MESSAGE_UPDATE', [localEvent]: true,
                    message: { id: ref.messageId, channel_id: ref.channelId, content },
                });
            },
        }, env);

        const watch = U.discord.flux.onAnyFluxEventDispatched;
        if (typeof watch !== 'function') {
            await shutdown(session);
            throw new Error('Update Valenced: its Flux event API is required by Translate Message.');
        }
        session.removers.push(watch(event => {
            if (!session.active || event[localEvent]) return event;
            try { return session.controller.onEvent(event); }
            catch { return event; }
        }));
        const removeUserListener = optional(() => {
            const store = stores().UserStore;
            const update = () => { session.controller.stats(); session.outgoing?.syncAccount(); broadcast(); };
            store.addChangeListener?.(update);
            return () => store.removeChangeListener?.(update);
        });
        if (removeUserListener) session.removers.push(removeUserListener);
        try {
            const loaded = api.jsonStorage.loaded ? api.jsonStorage.cache : await api.jsonStorage.get();
            if (live()) session.controller.configure(loaded);
        } catch {
            optional(() => api.logger?.warn?.('Translate Message could not load language settings; using English.'));
        }
        if (!live()) return;
        connectMobileComposer(session, api, env);

        let host, Row;
        const asset = names => names.map(name => optional(() => U.assets.getAssetIdByName(name))).find(value => value != null);
        function rowType() {
            return Row ??= optional(() => U.discord.design.Design.ActionSheetRow) ?? byProps('ActionSheetRow')?.ActionSheetRow;
        }
        function resolveRef(props) {
            if (!props || typeof props !== 'object') return;
            const message = props.message ?? props.messageRecord ?? props.targetMessage;
            const channelId = message?.channel_id ?? message?.channelId ?? props.channelId ?? props.channel_id ?? props.channel?.id;
            const messageId = message?.id ?? props.messageId ?? props.message_id;
            if (!validId(channelId) || !validId(messageId)) return;
            const ref = { channelId, messageId };
            const value = getMessage(ref) ?? message;
            return getMessageContent(value).trim() ? ref : undefined;
        }
        function icon(source, fallback) {
            return source != null && rowType()?.Icon
                ? h(Row.Icon, { source })
                : h(RN.Text, { style: { fontSize: 24, fontWeight: '600', color: '#B6A8FF', width: 24, textAlign: 'center' } }, fallback);
        }
        function TranslationAction({ messageRef: ref, sheetKey }) {
            const [, redraw] = React.useState(0);
            React.useEffect(() => subscribe(() => redraw(value => value + 1)), []);
            const { entry, pending } = session.controller.status(ref);
            const revertIcon = asset(['ArrowCounterClockwiseIcon', 'HistoryIcon', 'ic_history_24px', 'ic_reply_24px']);
            const action = async () => {
                if (!live()) return;
                // Recheck at press time: an open menu may outlive a request or edit.
                const state = session.controller.status(ref);
                const kind = state.entry || state.pending ? 'revert' : 'translate';
                optional(() => host.hideActionSheet(sheetKey));
                try { await session.controller[kind](ref); }
                catch { notify('Could not ' + kind + ' this message. Try again.'); }
            };
            const config = session.controller.settings();
            const restore = Boolean(entry || pending);
            return h(Row, {
                label: pending ? 'Cancel Translation' : entry ? 'Revert Message' : 'Translate',
                subLabel: pending ? 'Translation in progress… Tap to cancel' : entry ? 'Restore original text'
                    : ((config.receivedInput === 'auto' || config.receivedInput === '') ? 'Auto-detect' : languageName(config.receivedInput, config.service)) + ' → ' + languageName(config.receivedOutput, config.service),
                icon: restore ? icon(revertIcon, '↶') : h(RN.Image, {
                    source: { uri: TRANSLATE_ICON_URI }, style: { width: 24, height: 24,
                        tintColor: optional(() => stores().ThemeStore.theme) === 'light' ? '#535461' : '#F2F1F6' } }),
                onPress: action,
                accessibilityLabel: pending ? 'Cancel translation' : entry ? 'Revert message to its original text'
                    : 'Translate message to ' + languageName(config.receivedOutput, config.service),
                accessibilityRole: 'button',
            });
        }
        function buttons(ref, sheetKey) {
            return [h(TranslationAction, { key: TRANSLATE_KEY, messageRef: ref, sheetKey })];
        }
        const labelOf = node => String(node?.props?.label ?? node?.props?.text ?? '');
        const isRow = node => node?.props && typeof node.props.onPress === 'function'
            && (node.type === rowType() || node.props.label != null || node.props.text != null);
        function transformMenu(tree, ref, sheetKey) {
            let target, best = -1, duplicate = false, scanned = 0;
            function scan(node, depth = 0) {
                if (!node || depth > 32 || ++scanned > 1800) return;
                if (Array.isArray(node)) {
                    const rows = node.filter(isRow);
                    const score = rows.length + (rows.some(row => /copy text/i.test(labelOf(row))) ? 1000 : 0);
                    if (rows.length && score > best) { target = node; best = score; }
                    for (const child of node) scan(child, depth + 1);
                } else if (node.props) {
                    if ([TRANSLATE_KEY, REVERT_KEY].includes(node.key)) duplicate = true;
                    scan(node.props.children, depth + 1);
                }
            }
            scan(tree);
            if (duplicate) return { tree, done: true };
            if (!target || !rowType()) return { tree, done: false };
            const index = target.findIndex(row => /copy text/i.test(labelOf(row)));
            const at = index >= 0 ? index + 1 : target.length;
            const added = [...target.slice(0, at), ...buttons(ref, sheetKey), ...target.slice(at)];
            let changed = 0;
            function replace(node, depth = 0) {
                if (!node || depth > 32 || ++changed > 1800) return node;
                if (node === target) return added.map(wrapEdit);
                if (Array.isArray(node)) {
                    const children = node.map(child => replace(child, depth + 1));
                    return children.some((child, i) => child !== node[i]) ? children : node;
                }
                if (!node.props) return node;
                const guarded = wrapEdit(node);
                if (guarded.props.children == null) return guarded;
                const children = replace(guarded.props.children, depth + 1);
                return children !== guarded.props.children ? React.cloneElement(guarded, { children }) : guarded;
            }
            function wrapEdit(node) {
                if (!isRow(node) || !(/^(?:edit|edit message)$/i.test(labelOf(node)) || /(?:^|[.:-])edit(?:$|[.:-])/i.test(String(node.key ?? '')))) return node;
                const original = node.props.onPress;
                return React.cloneElement(node, { onPress: async (...args) => {
                    if (!live()) return;
                    await session.controller.revert(ref, false);
                    if (session.controller.status(ref).entry) {
                        notify('Could not restore this message. Reopen the channel before editing it.');
                        return;
                    }
                    return original(...args);
                } });
            }
            return { tree: replace(tree), done: true };
        }

        function wrapSheet(component, opening, sheetKey) {
            const caches = Array.from({ length: 5 }, () => new WeakMap());
            let ref = resolveRef(opening) ?? resolveRef(opening?.analyticsLocation);
            function finish(props, tree, level) {
                if (!live()) return tree;
                try {
                    ref ??= resolveRef(props) ?? resolveRef(props?.analyticsLocation);
                    if (ref) {
                        const result = transformMenu(tree, ref, sheetKey);
                        if (result.done) return result.tree;
                    }
                    let visited = 0;
                    function descend(node, depth = 0) {
                        if (!node || depth > 32 || ++visited > 1800) return node;
                        if (Array.isArray(node)) return node.map(child => descend(child, depth + 1));
                        if (!node.props) return node;
                        const children = node.props.children == null ? node.props.children : descend(node.props.children, depth + 1);
                        const native = [RN.View, RN.ScrollView, RN.Text, RN.Image, RN.Pressable, RN.TouchableOpacity, Row];
                        const type = level < 4 && !native.includes(node.type) ? wrap(node.type, level + 1) : node.type;
                        return type !== node.type ? h(type, { ...node.props, children, key: node.key })
                            : children !== node.props.children ? React.cloneElement(node, { children }) : node;
                    }
                    return descend(tree);
                } catch { return tree; }
            }
            function wrap(original, level = 0) {
                if (!original || !['function', 'object'].includes(typeof original) || level > 4) return original;
                const cache = caches[level];
                if (cache.has(original)) return cache.get(original);
                let wrapped = original;
                if (typeof original === 'function') {
                    wrapped = original.prototype?.isReactComponent
                        ? class TranslationSheet extends original { render() { return finish(this.props, super.render(), level); } }
                        : function TranslationSheet(...args) { return finish(args[0], original.apply(this, args), level); };
                } else if (original.$$typeof === Symbol.for('react.memo')) {
                    wrapped = React.memo(wrap(original.type, level), original.compare);
                } else if (original.$$typeof === Symbol.for('react.forward_ref')) {
                    wrapped = React.forwardRef((props, ref) => finish(props, original.render(props, ref), level));
                }
                cache.set(original, wrapped);
                return wrapped;
            }
            return wrap(component);
        }

        function connect() {
            if (!live() || session.connected) return;
            host = optional(() => U.discord.actions.ActionSheetActionCreators) ?? byProps('openLazy', 'hideActionSheet');
            if (typeof host?.openLazy !== 'function') return;
            session.removers.push(U.patcher.instead(host, 'openLazy', function (args, original) {
                const [lazy, key, context] = args;
                if (!live() || !MENU_KEYS.has(key) || typeof lazy?.then !== 'function') return Reflect.apply(original, this, args);
                const next = [...args];
                next[0] = Promise.resolve(lazy).then(module => {
                    if (!live() || !module?.default) return module;
                    return { ...module, default: wrapSheet(module.default, context, key) };
                });
                return Reflect.apply(original, this, next);
            }));
            session.connected = true; broadcast();
        }
        connect();
        let attempts = 0;
        const retry = () => {
            session.retry = undefined;
            if (!live()) return;
            optional(connect);
            if (!session.connected && ++attempts < 20) session.retry = env.setTimeout(retry, 1500);
        };
        if (!session.connected) session.retry = env.setTimeout(retry, 1500);
        const appSubscription = optional(() => RN.AppState?.addEventListener('change', state => {
            if (state === 'active') optional(connect);
        }));
        if (appSubscription) session.removers.push(() => appSubscription.remove());
    }

    function SettingsComponent({ api }) {
        return api.unscoped.react.React.createElement(TranslationSettingsView,
            { api, getSession: () => current, subscribe, save: values => saveSettings(api, values) });
    }

    return { jsonStorage: { default: { ...DEFAULTS } }, start,
        stop() { return shutdown(current); }, SettingsComponent };
}

// NODE_EXPORTS
module.exports = { createPluginOptions };
