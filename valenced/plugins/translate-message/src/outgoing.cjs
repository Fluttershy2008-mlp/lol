// SPDX-License-Identifier: GPL-3.0-or-later
// Mobile adaptation of Vencord Translate's onBeforeMessageSend lifecycle.
'use strict';

function createOutgoingController(io, env = globalThis) {
    let active = true, account = io.account();
    const operations = new Set(), byObject = new WeakMap(), byNonce = new Map(), recoveries = [];
    const changed = () => io.changed?.();
    function cancelAll() { for (const operation of [...operations]) operation.cancel(); }
    function syncAccount() {
        const next = io.account();
        if (next !== account) { cancelAll(); account = next; recoveries.length = 0; changed(); }
    }
    function hook(args, original, receiver) {
        syncAccount();
        const [channelId, message] = args, config = normalizeSettings(io.settings());
        if (!active || !config.autoTranslate || !validId(channelId) || !message
            || typeof message.content !== 'string' || !message.content.trim()) return Reflect.apply(original, receiver, args);
        const nonce = typeof message.nonce === 'string' ? channelId + ':' + message.nonce : undefined;
        const previous = byObject.get(message) ?? (nonce ? byNonce.get(nonce) : undefined);
        if (previous) return previous;
        const owner = account, content = message.content, controller = abortController(env);
        let rejectStop, handedToDiscord = false;
        const stopped = new Promise((_, reject) => { rejectStop = reject; });
        const operation = { cancel() { controller.abort(); rejectStop(cancelled()); } };
        operations.add(operation); changed();
        const unchanged = () => {
            const now = normalizeSettings(io.settings());
            return active && owner === io.account() && now.autoTranslate
                && ['service', 'sentInput', 'sentOutput', 'deeplApiKey', 'kagiSession'].every(key => now[key] === config[key]);
        };
        const promise = Promise.resolve().then(async () => {
            try {
                const translated = await Promise.race([io.translate('sent', content, config, controller.signal), stopped]);
                if (!unchanged() || controller.signal.aborted) throw cancelled();
                if (typeof translated?.text !== 'string' || !translated.text.trim())
                    throw failure('PROVIDER', 'No outgoing translation was returned.');
                // Preserve nonce, attachments, reply metadata, allowed mentions and receiver.
                const next = [channelId, { ...message, content: translated.text }, ...args.slice(2)];
                operations.delete(operation); changed();
                handedToDiscord = true;
                const result = Reflect.apply(original, receiver, next);
                if (config.showAutoTranslateTooltip) io.notify('Auto Translate → ' + languageName(config.sentOutput, config.service));
                return await result;
            } catch (error) {
                if (handedToDiscord) throw error;
                if (owner === io.account()) {
                    let restored = false;
                    try { restored = await io.recoverDraft?.(channelId, content); } catch {}
                    if (!restored) {
                        if (recoveries.length >= 3) recoveries.shift();
                        recoveries.push({ channelId, content }); changed();
                    }
                    io.notify('Message not sent. ' + (restored ? 'Your original draft was restored.' : 'Your original text is available in Translate settings.'));
                }
                throw failure(error?.code === 'CANCELLED' ? 'CANCELLED' : 'TRANSLATION_SEND_FAILED',
                    'Outgoing translation stopped before sending. Your original message was kept.');
            } finally {
                operations.delete(operation); byObject.delete(message);
                if (nonce && byNonce.get(nonce) === promise) byNonce.delete(nonce);
                changed();
            }
        });
        byObject.set(message, promise);
        if (nonce) byNonce.set(nonce, promise);
        operation.promise = promise;
        return promise;
    }
    return {
        hook, syncAccount,
        count: () => operations.size,
        recoveries: () => [...recoveries],
        forgetRecovery(index) { recoveries.splice(index, 1); changed(); },
        async dispose() {
            if (!active) return;
            active = false;
            const pending = [...operations].map(operation => operation.promise);
            cancelAll(); await Promise.allSettled(pending);
            byNonce.clear(); changed();
        },
    };
}

function connectMobileComposer(session, api, env = globalThis) {
    const U = api.unscoped, { React, ReactNative: RN } = U.react, h = React.createElement;
    const F = U.modules.finders;
    const optional = fn => { try { return fn(); } catch { return undefined; } };
    const byProps = (...props) => optional(() => F.lookupModule(F.filters.withProps(...props), { initialize: false })[0]);
    const stores = () => U.discord.flux.Stores;
    session.outgoing = createOutgoingController({
        account: () => optional(() => stores().UserStore.getCurrentUser()?.id),
        settings: () => session.controller.settings(),
        translate: session.translator, notify: session.notify, changed: session.changed,
        async recoverDraft(channelId, content) {
            const store = optional(() => stores().DraftStore);
            const actions = byProps('saveDraft', 'clearDraft') ?? byProps('saveDraft');
            if (typeof store?.getDraft !== 'function' || typeof actions?.saveDraft !== 'function') return false;
            const draft = store.getDraft(channelId, 0);
            const current = typeof draft === 'string' ? draft : draft?.content;
            if (typeof current !== 'string' || (current && current !== content)) return false;
            await actions.saveDraft(channelId, content, 0);
            const saved = store.getDraft(channelId, 0);
            return (typeof saved === 'string' ? saved : saved?.content) === content;
        },
    }, env);
    const hookedSenders = new WeakSet();
    function attachSender(module) {
        if (!session.live() || typeof module?.sendMessage !== 'function' || hookedSenders.has(module)) return;
        hookedSenders.add(module);
        session.removers.push(U.patcher.instead(module, 'sendMessage', function (args, original) {
            return session.outgoing.hook(args, original, this);
        }));
        session.outgoingConnected = true; session.changed();
    }
    attachSender(byProps('sendMessage', 'deleteMessage'));
    if (typeof F.getModules === 'function') session.removers.push(F.getModules(
        F.filters.withProps('sendMessage', 'deleteMessage'), attachSender, { max: 1 }));

    const imported = U.discord.utils?.modules?.finders;
    const ACTIONS_PATH = 'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx';
    const buttonKey = 'valenced.vencord-translate.composer';
    function TranslationIcon(props = {}) {
        // Native composer buttons may memoize their icon independently of the button.
        const [, update] = React.useState(0);
        React.useEffect(() => session.ui.subscribe(() => update(value => value + 1)), []);
        const theme = optional(() => stores().ThemeStore.theme);
        const enabled = session.controller.settings().autoTranslate;
        const width = props.width ?? 24, height = props.height ?? 24;
        return h(RN.View, { pointerEvents: 'none', accessible: false,
            style: [props.style, { width, height, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
                backgroundColor: enabled ? '#145A3A' : 'transparent', borderWidth: enabled ? 1 : 0,
                borderColor: enabled ? '#62FFAD' : 'transparent',
                shadowColor: '#62FFAD', shadowOpacity: enabled ? 0.7 : 0,
                shadowRadius: 5, shadowOffset: { width: 0, height: 0 }, elevation: enabled ? 3 : 0 }] },
            h(RN.Image, { source: { uri: TRANSLATE_ICON_URI }, resizeMode: 'contain',
                style: { width: enabled ? width - 4 : width, height: enabled ? height - 4 : height,
                    tintColor: enabled ? '#62FFAD' : props.color ?? (theme === 'light' ? '#535461' : '#B9B8C6') },
                accessible: false }),
            enabled ? h(RN.View, { testID: 'valenced.translate.active-indicator',
                style: { position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: 4,
                    backgroundColor: '#62FFAD', borderWidth: 1, borderColor: '#145A3A' } }) : null);
    }
    function TranslateChatBarButton() {
        const [, update] = React.useState(0), [open, setOpen] = React.useState(false);
        const held = React.useRef(false);
        React.useEffect(() => {
            const notify = () => update(value => value + 1);
            return session.ui.subscribe(notify);
        }, []);
        if (!session.live()) return null;
        const config = session.controller.settings();
        const onLongPress = () => {
            if (!session.live()) return;
            held.current = true;
            setOpen(true);
        };
        const onPress = () => {
            // Releasing a hold must never toggle auto-translation as well.
            if (!session.live() || held.current) return;
            if (!session.outgoingConnected) { session.notify('Open a chat before enabling Auto Translate.'); return; }
            const next = !session.controller.settings().autoTranslate;
            void session.ui.save({ autoTranslate: next });
            session.notify('Auto Translate ' + (next ? 'on → ' + languageName(config.sentOutput, config.service) : 'off'));
        };
        const props = { accessibilityLabel: 'Auto Translate', accessibilityRole: 'button',
            accessibilityHint: 'Tap to toggle outgoing auto-translation. Hold to open translation settings.',
            accessibilityState: { checked: config.autoTranslate }, onPress, onLongPress,
            onPressIn: () => { held.current = false; }, delayLongPress: 450 };
        // Own the touch surface: Discord's private action button can discard onLongPress.
        const button = h(RN.Pressable, { ...props, testID: 'valenced.translate.composer-button', hitSlop: 4,
            style: { width: 36, height: 40, justifyContent: 'center', alignItems: 'center' } }, h(TranslationIcon));
        return h(React.Fragment, null, button,
            h(RN.Modal, { visible: open, transparent: true, animationType: 'slide', onRequestClose: () => setOpen(false) },
                h(RN.View, { style: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' } },
                    h(RN.Pressable, { style: { flex: 1 }, onPress: () => setOpen(false), accessibilityLabel: 'Close Translate', accessibilityRole: 'button' }),
                    h(RN.SafeAreaView, { style: { height: '86%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: '#202127' } },
                        h(TranslationSettingsView, { ...session.ui, compact: true, onClose: () => setOpen(false) })))));
    }
    function insertButton(tree) {
        let target, visited = 0;
        function scan(node, depth = 0) {
            if (!node || target || depth > 24 || ++visited > 1000) return;
            if (Array.isArray(node)) { for (const child of node) scan(child, depth + 1); return; }
            if (!node.props) return;
            if (Array.isArray(node.props.children)) { target = node.props.children; return; }
            scan(node.props.children, depth + 1);
        }
        scan(tree);
        if (!target || target.some(child => String(child?.key ?? '').includes(buttonKey))) return tree;
        const added = [h(TranslateChatBarButton, { key: buttonKey }), ...target];
        let copied = 0;
        function replace(node, depth = 0) {
            if (!node || depth > 24 || ++copied > 1000) return node;
            if (node === target) return added;
            if (Array.isArray(node)) {
                const children = node.map(child => replace(child, depth + 1));
                return children.some((child, i) => child !== node[i]) ? children : node;
            }
            if (!node.props || node.props.children == null) return node;
            const children = replace(node.props.children, depth + 1);
            return children === node.props.children ? node : React.cloneElement(node, { children });
        }
        return replace(tree);
    }
    let composerAttached = false;
    function attachActions(module) {
        if (!session.live() || composerAttached || !module?.default) return;
        let parent = module, key = 'default';
        for (let i = 0; i < 8; i++) {
            const component = parent[key];
            if (component?.$$typeof === Symbol.for('react.memo')) { parent = component; key = 'type'; }
            else if (component?.$$typeof === Symbol.for('react.forward_ref')) { parent = component; key = 'render'; }
            else if (component?.prototype?.isReactComponent) { parent = component.prototype; key = 'render'; break; }
            else break;
        }
        if (typeof parent[key] !== 'function') return;
        session.removers.push(U.patcher.instead(parent, key, function (args, original) {
            const tree = Reflect.apply(original, this, args);
            return session.live() ? insertButton(tree) : tree;
        }));
        composerAttached = true; session.composerConnected = true; session.changed();
    }
    if (typeof imported?.getModuleWithImportedPath === 'function') {
        session.removers.push(imported.getModuleWithImportedPath(ACTIONS_PATH, attachActions));
    }
    attachActions(optional(() => imported.lookupModuleWithImportedPath(ACTIONS_PATH)[0]));
}

// NODE_EXPORTS
module.exports = { createOutgoingController, connectMobileComposer };
