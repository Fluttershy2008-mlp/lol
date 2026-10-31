(() => {
    'use strict';
    const DEFAULTS = { tapActions: true, directDelete: false, directReply: false, quickReply: true, skipDelete: true, skipEmbeds: true, moderation: true, feedback: true };
    const SHEET = 'dev.fluttershy2008.quick-delete.actions';
    const HANDLERS_PATH = 'modules/messages/native/MessagesHandlers.tsx';
    const MESSAGE_ACTIONS_PATH = 'actions/MessageActionCreators.tsx';
    const optional = fn => { try { return fn(); } catch { return undefined; } };
    const validId = value => typeof value === 'string' && /^\d{1,20}$/.test(value);
    const settingsOf = value => {
        const next = Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) =>
            [key, typeof value?.[key] === 'boolean' ? value[key] : fallback]));
        // Conflicting imported settings always prefer the non-destructive reply mode.
        if (next.directReply) next.directDelete = false;
        return next;
    };
    let current, writes = Promise.resolve();
    const listeners = new Set();
    const changed = () => { for (const fn of [...listeners]) optional(fn); };

    function stopSession(session) {
        if (!session?.active) return;
        session.active = false;
        if (current === session) current = undefined;
        for (const job of session.replyJobs.values()) { job.cancelled = true; optional(() => job.cancel?.()); }
        session.replyJobs.clear();
        optional(() => session.sheets?.hideActionSheet(SHEET));
        for (const remove of session.removers.splice(0).reverse()) optional(remove);
        session.pending.clear(); session.recent.clear();
        changed();
    }

    async function start(api) {
        if (current?.active) return;
        const U = api.unscoped, { React, ReactNative: RN } = U.react;
        const F = U.modules.finders, paths = U.discord.utils?.modules?.finders;
        const S = U.discord.flux.Stores, h = React.createElement;
        const session = { active: true, removers: [], pending: new Set(), recent: new Map(), replyJobs: new Map(),
            settings: settingsOf(api.jsonStorage?.cache), account: null, taps: 0, status: 'Open a chat to connect tap actions.', hooks: 0 };
        current = session;
        api.cleanup(() => stopSession(session));
        const live = () => session.active && current === session;
        const byProps = (...keys) => optional(() => F.lookupModule(F.filters.withProps(...keys), { initialize: false })[0]);
        const account = () => optional(() => S.UserStore.getCurrentUser()?.id);
        session.account = account();
        function notify(text, success = false) {
            if (!live()) return;
            session.status = text; changed();
            if (!success || session.settings.feedback) optional(() => RN.ToastAndroid?.show(text, RN.ToastAndroid.SHORT ?? 0));
        }
        function watchProps(keys, callback) {
            const seen = new WeakSet();
            const accept = value => {
                if (!live() || !value || !['object', 'function'].includes(typeof value) || seen.has(value)) return;
                seen.add(value); callback(value);
            };
            accept(byProps(...keys));
            const remove = optional(() => F.getModules(F.filters.withProps(...keys), accept));
            if (typeof remove === 'function') session.removers.push(remove);
        }
        function watchPath(path, callback) {
            const remove = optional(() => paths?.getModuleWithImportedPath(path, value => { if (live()) callback(value); }));
            if (typeof remove === 'function') session.removers.push(remove);
        }
        let actions, intl, nativeReply, pendingReply, inputUtils, canReplyMessage;
        const acceptActions = value => {
            const candidate = typeof value?.default?.deleteMessage === 'function' ? value.default : value;
            if (typeof candidate?.deleteMessage === 'function') actions = candidate;
        };
        watchPath(MESSAGE_ACTIONS_PATH, acceptActions);
        watchProps(['deleteMessage', 'sendMessage'], acceptActions);
        watchProps(['intl', 't'], value => { intl = value; });
        function acceptReply(value) {
            for (const key of ['default', 'replyToMessage', 'longPressMessageHandleReply'])
                if (typeof value?.[key] === 'function') { nativeReply = { holder: value, key }; return; }
        }
        watchPath('modules/replies/native/replyToMessage.tsx', acceptReply);
        for (const name of ['longPressMessageHandleReply', 'replyToMessage']) {
            const remove = optional(() => F.getModules(F.filters.withName(name), value => { if (live()) acceptReply(value); }, { returnNamespace: true }));
            if (typeof remove === 'function') session.removers.push(remove);
        }
        const acceptPending = value => {
            const candidate = value?.default?.createPendingReply ? value.default : value;
            if (typeof candidate?.createPendingReply === 'function') pendingReply = candidate;
        };
        watchPath('modules/replies/PendingReplyActionCreators.tsx', acceptPending);
        watchProps(['createPendingReply', 'deletePendingReply'], acceptPending);
        const acceptInput = value => {
            const candidate = value?.default?.getBestActiveInputForChannelId ? value.default : value;
            if (typeof candidate?.getBestActiveInputForChannelId === 'function') inputUtils = candidate;
        };
        watchPath('utils/native/ChatInputUtils.tsx', acceptInput);
        watchProps(['getBestActiveInputForChannelId'], acceptInput);
        watchPath('modules/replies/canReplyToMessage.tsx', value => {
            if (typeof value?.canReplyToMessage === 'function') canReplyMessage = value;
        });
        watchProps(['canReplyToMessage', 'useCanReplyToMessage'], value => { canReplyMessage = value; });
        const translated = key => optional(() => intl?.t?.[key] == null ? undefined : intl.intl.string(intl.t[key]));
        const exact = (value, keys) => typeof value === 'string' && keys.some(key => {
            const match = translated(key); return typeof match === 'string' && match.length && value === match;
        });
        function manage(channel) {
            if ([1, 3].includes(channel?.type) || optional(() => channel?.isDM?.()) || optional(() => channel?.isGroupDM?.())) return false;
            if (!session.settings.moderation || !(channel?.guild_id ?? channel?.guildId ?? optional(() => channel.getGuildId()))) return false;
            const flag = optional(() => U.discord.common.constants.Constants.Permissions.MANAGE_MESSAGES) ?? 8192n;
            return optional(() => S.PermissionStore.can(flag, channel)) === true;
        }
        function replyAllowed(message, channel, flags) {
            if (!(session.settings.quickReply || session.settings.directReply) || !(nativeReply || pendingReply) || flags & 64n) return false;
            if (canReplyMessage) return optional(() => canReplyMessage.canReplyToMessage(channel, message)) === true;
            if (optional(() => channel.isSystemDM?.()) || optional(() => channel.isArchivedThread?.())) return false;
            if ([1, 3].includes(channel.type) || optional(() => channel.isPrivate?.())) return true;
            const permissions = optional(() => U.discord.common.constants.Constants.Permissions) ?? {};
            const send = optional(() => channel.isThread?.()) ? permissions.SEND_MESSAGES_IN_THREADS ?? 274877906944n : permissions.SEND_MESSAGES ?? 2048n;
            return optional(() => S.PermissionStore.can(send, channel) && S.PermissionStore.can(permissions.READ_MESSAGE_HISTORY ?? 65536n, channel)) === true;
        }
        function resolve(ref) {
            if (!live() || !ref || ref.accountId !== account() || !validId(ref.channelId) || !validId(ref.messageId)) return;
            const message = optional(() => S.MessageStore.getMessage(ref.channelId, ref.messageId));
            const channel = optional(() => S.ChannelStore.getChannel(ref.channelId));
            if (!message || !channel || message.id !== ref.messageId || message.channel_id && message.channel_id !== ref.channelId) return;
            if (message.deleted || ['SENDING', 'SEND_FAILED', 'sending', 'send_failed'].includes(message.state)) return;
            // Keep boost notices, automod, thread starters and other special message taps native.
            if (![0, 19, 20, 23].includes(message.type ?? 0)) return;
            const own = message.author?.id === ref.accountId;
            const canDelete = own || manage(channel);
            const flags = optional(() => BigInt(message.flags ?? 0)) ?? 0n;
            const embedCount = message.embeds?.length ?? message.embeds?.size ?? 0;
            return { message, channel, canDelete, canEmbed: canDelete && embedCount > 0 && !(flags & 4n),
                canReply: replyAllowed(message, channel, flags) };
        }
        function refFor(message, channelId) {
            const ref = { channelId: message?.channel_id ?? message?.channelId ?? channelId, messageId: message?.id, accountId: account() };
            return resolve(ref) ? ref : undefined;
        }
        function eventRef(event, handler) {
            const data = event?.nativeEvent ?? event;
            if (!data || data.touches?.length > 1 || data.numberOfPointers > 1) return;
            const id = data.messageId ?? data.message_id;
            if (!validId(id)) return;
            const selected = optional(() => S.SelectedChannelStore.getChannelId());
            const channelId = data.channelId ?? data.channel_id ?? selected;
            if (!validId(channelId) || selected && channelId !== selected) return;
            const native = optional(() => handler?.getMessageData?.(id));
            const message = native?.message ?? optional(() => S.MessageStore.getMessage(channelId, id));
            return refFor(message, channelId);
        }
        async function run(kind, ref) {
            const target = resolve(ref);
            if (!target || !target.canDelete || (kind === 'embed' && !target.canEmbed)) { notify('This message is no longer available, or you do not have permission.'); return false; }
            const method = kind === 'delete' ? 'deleteMessage' : 'suppressEmbeds';
            if (typeof actions?.[method] !== 'function') { notify('Discord message actions are unavailable. Reopen the chat and try again.'); return false; }
            const key = [ref.accountId, ref.channelId, ref.messageId].join(':');
            const now = Date.now();
            for (const [id, time] of session.recent) if (now - time > 1200) session.recent.delete(id);
            if (session.pending.has(key) || session.recent.has(key)) return false;
            session.pending.add(key); session.recent.set(key, now);
            try {
                const args = kind === 'delete' ? [ref.channelId, ref.messageId, false] : [ref.channelId, ref.messageId];
                const result = await Reflect.apply(actions[method], actions, args);
                if (result?.ok === false || typeof result?.status === 'number' && result.status >= 400) throw new Error('request failed');
                if (live() && ref.accountId === account()) notify(kind === 'delete' ? 'Message deleted' : 'Embeds removed', true);
                return true;
            } catch {
                if (live() && ref.accountId === account()) notify(kind === 'delete' ? 'Could not delete this message. Try again.' : 'Could not remove these embeds. Try again.');
                return false;
            } finally { session.pending.delete(key); }
        }
        session.sheets = optional(() => U.discord.actions.ActionSheetActionCreators) ?? byProps('openLazy', 'hideActionSheet');
        function closeQuick() { optional(() => session.sheets?.hideActionSheet(SHEET)); }
        function queueReply(ref, handler, direct = false) {
            if (!live()) return;
            const key = [ref.accountId, ref.channelId, ref.messageId].join(':');
            if (session.replyJobs.has(key)) return;
            const job = { cancelled: false };
            session.replyJobs.set(key, job);
            const begin = () => {
                session.replyJobs.delete(key);
                if (job.cancelled || !live() || ref.accountId !== account()
                    || optional(() => S.SelectedChannelStore.getChannelId()) !== ref.channelId) return;
                if (direct && (!session.settings.directReply || !session.settings.tapActions)) return;
                const target = resolve(ref);
                if (!target?.canReply) { notify('You cannot reply to this message right now.'); return; }
                const input = optional(() => inputUtils?.getBestActiveInputForChannelId(ref.channelId));
                // Resolve the input at click time so channel navigation cannot focus a stale composer.
                const chatInputRef = input ? { current: input } : optional(() => handler?.params?.chatInputRef);
                try {
                    let result;
                    if (nativeReply) result = Reflect.apply(nativeReply.holder[nativeReply.key], nativeReply.holder, [{
                        message: target.message, channel: target.channel, chatInputRef,
                        actionSource: 'action_sheet', invertible: false,
                    }]);
                    else {
                        // Same pending-reply action and mention defaults as Discord's Reply row.
                        actions?.endEditMessage?.(ref.channelId);
                        result = pendingReply.createPendingReply({ message: target.message, channel: target.channel,
                            shouldMention: !(optional(() => target.channel.isDM?.()) ?? target.channel.type === 1)
                                && target.message.author?.id !== ref.accountId,
                            source: 'action_sheet' });
                        optional(() => chatInputRef?.current?.openSystemKeyboard());
                    }
                    session.status = 'Reply ready in Discord’s message bar.'; changed();
                    if (result?.catch) result.catch(() => {
                        if (live() && ref.accountId === account()) notify('Could not open Reply. Try again.');
                    });
                } catch { if (live() && ref.accountId === account()) notify('Could not open Reply. Try again.'); }
            };
            if (typeof RN.InteractionManager?.runAfterInteractions === 'function') {
                const work = RN.InteractionManager.runAfterInteractions(begin);
                job.cancel = () => work?.cancel?.();
            } else {
                const timer = setTimeout(begin, 0); job.cancel = () => clearTimeout(timer);
            }
        }
        function showQuick(ref, handler) {
            const target = resolve(ref), Design = optional(() => U.discord.design.Design);
            const Sheet = Design?.ActionSheet, Row = Design?.ActionSheetRow;
            if (!target || typeof session.sheets?.openLazy !== 'function' || !Sheet || !Row) return false;
            const allowDelete = target.canDelete && typeof actions?.deleteMessage === 'function';
            const allowEmbed = target.canEmbed && typeof actions?.suppressEmbeds === 'function';
            if (!(allowDelete || allowEmbed || target.canReply)) return false;
            function QuickActions() {
                if (!live() || !resolve(ref)) return null;
                const choose = kind => () => { if (!live()) return; closeQuick(); void run(kind, ref); };
                const rows = [];
                if (session.settings.quickReply && target.canReply) rows.push(h(Row, { key: 'reply', label: 'Reply',
                    accessibilityLabel: 'Reply to message', onPress: () => { closeQuick(); queueReply(ref, handler); } }));
                if (allowDelete) rows.push(h(Row, { key: 'delete', label: 'Delete Message', variant: 'danger',
                    accessibilityLabel: 'Delete message without confirmation', onPress: choose('delete') }));
                if (allowEmbed) rows.push(h(Row, { key: 'embed', label: 'Remove Embeds',
                    accessibilityLabel: 'Remove message embeds without confirmation', onPress: choose('embed') }));
                rows.push(h(Row, { key: 'cancel', label: 'Cancel', onPress: closeQuick }));
                const children = Row.Group ? h(Row.Group, null, rows) : rows;
                return h(Sheet, null, children);
            }
            session.sheets.openLazy(Promise.resolve({ default: QuickActions }), SHEET, {}, 'replaceTopSheet');
            return true;
        }
        function tap(event, handler) {
            if (!live() || !session.settings.tapActions || optional(() => handler?.isModalOrActionsheetObstructing?.())) return false;
            const ref = eventRef(event, handler);
            if (!ref) return false;
            session.taps++; session.status = 'Tap actions connected.';
            if (session.settings.directReply) {
                if (!resolve(ref)?.canReply) return false;
                queueReply(ref, handler, true);
                return true;
            }
            // One-tap deletion still requires deletion permission. Reply-only messages open the menu.
            if (session.settings.directDelete && resolve(ref)?.canDelete && typeof actions?.deleteMessage === 'function') { void run('delete', ref); return true; }
            return showQuick(ref, handler);
        }
        const patchedHandlers = new WeakSet(), patchedClasses = new WeakSet();
        function patchHandler(handler) {
            if (!live() || !handler || patchedHandlers.has(handler) || typeof handler.handleTapMessage !== 'function') return;
            patchedHandlers.add(handler);
            session.removers.push(U.patcher.instead(handler, 'handleTapMessage', function(args, original) {
                if (tap(args[0], handler)) return;
                return Reflect.apply(original, this, args);
            }));
            session.hooks++;
        }
        function attachHandlers(value) {
            const Type = value?.MessagesHandlers ?? value?.default?.MessagesHandlers;
            if (!Type?.prototype || patchedClasses.has(Type)) return;
            patchedClasses.add(Type);
            const descriptor = Object.getOwnPropertyDescriptor(Type.prototype, 'params');
            // Some builds expose a configurable getter. Other builds use the native-view fallback below.
            if (descriptor?.get && descriptor.configurable) {
                const get = function() { patchHandler(this); return Reflect.apply(descriptor.get, this, []); };
                Object.defineProperty(Type.prototype, 'params', { ...descriptor, get });
                session.removers.push(() => {
                    if (Object.getOwnPropertyDescriptor(Type.prototype, 'params')?.get === get)
                        Object.defineProperty(Type.prototype, 'params', descriptor);
                });
            }
        }
        watchPath(HANDLERS_PATH, attachHandlers);
        watchProps(['MessagesHandlers'], attachHandlers);

        // Modern Discord renders chat in a native list. Wrap only its message-tap prop;
        // image/link/avatar taps, swipes, long presses and scroll gestures keep their handlers.
        const wrappedTaps = new WeakMap();
        function wrapElement(element) {
            const props = element?.props;
            if (!live() || typeof props?.onTapMessage !== 'function' || typeof props.onLongPressMessage !== 'function') return element;
            const original = props.onTapMessage;
            let wrapped = wrappedTaps.get(original);
            if (!wrapped) {
                wrapped = function(event, ...rest) {
                    if (tap(event)) return;
                    return Reflect.apply(original, this, [event, ...rest]);
                };
                wrappedTaps.set(original, wrapped); wrappedTaps.set(wrapped, wrapped);
                session.hooks++; session.status = 'Tap actions connected.';
            }
            return React.cloneElement(element, { onTapMessage: wrapped });
        }
        const factories = new WeakMap();
        function patchFactories(value, keys) {
            if (!value || !['object', 'function'].includes(typeof value)) return;
            let done = factories.get(value);
            if (!done) factories.set(value, done = new Set());
            for (const key of keys) if (typeof value[key] === 'function' && !done.has(key)) {
                done.add(key);
                session.removers.push(U.patcher.instead(value, key, function(args, original) {
                    return wrapElement(Reflect.apply(original, this, args));
                }));
            }
        }
        patchFactories(React, ['createElement']);
        patchFactories(U.react.ReactJSXRuntime, ['jsx', 'jsxs', 'jsxDEV']);
        watchProps(['jsx', 'jsxs'], value => patchFactories(value, ['jsx', 'jsxs', 'jsxDEV']));

        // Only Discord's two exact, localized message prompts are eligible. There is
        // no global 'confirm everything' hook, so leave/block/purchase dialogs stay native.
        const patchedAlerts = new WeakSet();
        function preview(node, depth = 0) {
            if (!node || depth > 8) return;
            if (Array.isArray(node)) { for (const child of node.slice(0, 30)) { const found = preview(child, depth + 1); if (found) return found; } return; }
            if (validId(node.props?.message?.id)) return node.props.message;
            return preview(node.props?.children, depth + 1);
        }
        function attachAlerts(value) {
            if (typeof value?.show !== 'function' || patchedAlerts.has(value)) return;
            patchedAlerts.add(value);
            session.removers.push(U.patcher.instead(value, 'show', function(args, original) {
                const options = args[0];
                if (!live() || typeof options?.onConfirm !== 'function') return Reflect.apply(original, this, args);
                const title = options.title ?? options.children?.props?.title;
                const isDelete = session.settings.skipDelete && exact(title, ['MWMcg7', 'xwMqD7'])
                    && exact(options.body, ['AMvpS4']) && !!resolve(refFor(preview(options.children)))?.canDelete;
                const isEmbed = session.settings.skipEmbeds && exact(title, ['VL1KOk']) && exact(options.body, ['vXZ+Fo']);
                if (!isDelete && !isEmbed) return Reflect.apply(original, this, args);
                // Preserve the native, permission-checked callback, including its receiver.
                try {
                    const result = options.onConfirm();
                    return result?.catch ? result.catch(() => { notify('Discord could not complete this message action.'); }) : result;
                } catch { notify('Discord could not complete this message action.'); }
            }));
        }
        watchProps(['show', 'openLazy'], attachAlerts);
        const userChanged = () => {
            if (!live()) return;
            if (session.account !== account()) {
                session.account = account(); closeQuick(); session.recent.clear();
            }
        };
        optional(() => {
            S.UserStore.addChangeListener(userChanged);
            session.removers.push(() => S.UserStore.removeChangeListener(userChanged));
        });
        optional(() => {
            const store = S.SelectedChannelStore;
            const dismiss = () => { if (live()) closeQuick(); };
            store.addChangeListener(dismiss);
            session.removers.push(() => store.removeChangeListener(dismiss));
        });
        try {
            const data = api.jsonStorage.loaded ? api.jsonStorage.cache : await api.jsonStorage.get();
            if (live()) session.settings = settingsOf(data);
        } catch { notify('Quick Delete could not load settings; using defaults.'); }
    }

    function SettingsComponent({ api }) {
        const { React, ReactNative: RN } = api.unscoped.react;
        const h = React.createElement, [, refresh] = React.useState(0);
        React.useEffect(() => { const fn = () => refresh(x => x + 1); listeners.add(fn); return () => listeners.delete(fn); }, []);
        const session = current, values = session?.settings ?? settingsOf(api.jsonStorage?.cache);
        const light = (optional(() => api.unscoped.discord.flux.Stores.ThemeStore.theme) === 'light');
        const fg = light ? '#18191C' : '#F2F3F5', muted = light ? '#4E5058' : '#B5BAC1', card = light ? '#F2F3F5' : '#2B2D31';
        function save(key, value) {
            if (!session?.active || current !== session) return;
            const updates = { [key]: value };
            if (value && key === 'directReply') { updates.directDelete = false; updates.tapActions = true; }
            if (value && key === 'directDelete') { updates.directReply = false; updates.tapActions = true; }
            session.settings = settingsOf({ ...session.settings, ...updates }); changed();
            const next = { ...session.settings };
            writes = writes.catch(() => {}).then(() => api.jsonStorage.set(next, true)).catch(() => {
                optional(() => RN.ToastAndroid?.show('Could not save Quick Delete settings.', 0));
            });
        }
        const toggle = (key, title, detail) => h(RN.View, { key, style: { backgroundColor: card, borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' } },
            h(RN.View, { style: { flex: 1, marginRight: 14 } },
                h(RN.Text, { style: { color: fg, fontSize: 16, fontWeight: '600' } }, title),
                h(RN.Text, { style: { color: muted, marginTop: 5, lineHeight: 19 } }, detail)),
            h(RN.Switch, { accessibilityLabel: title, value: values[key], onValueChange: value => save(key, value) }));
        return h(RN.ScrollView, { contentContainerStyle: { padding: 20, paddingBottom: 40 } },
            h(RN.Text, { style: { color: fg, fontSize: 26, fontWeight: '700', marginBottom: 8 } }, 'Quick Delete'),
            h(RN.Text, { style: { color: muted, lineHeight: 21, marginBottom: 20 } }, 'Choose what a message tap does: show quick actions, reply immediately or delete immediately. Hold a message for the full Discord menu.'),
            toggle('tapActions', 'Tap for quick actions', 'Enable message taps. Use the quick menu or the selected one-tap option.'),
            toggle('directDelete', 'One-tap delete', 'Delete a message immediately when you tap it. Switches off one-tap reply.'),
            toggle('directReply', 'One-tap reply', 'Tap a message to open Discord’s reply bar and keyboard immediately. Switches off one-tap delete.'),
            toggle('quickReply', 'Reply in tap menu', 'Show Reply in the quick menu when both one-tap options are off.'),
            toggle('moderation', 'Include moderation actions', 'Also work on server messages you have Manage Messages permission to delete.'),
            toggle('skipDelete', 'Skip Delete confirmation', 'Skip the native Delete Message confirmation from the full message menu.'),
            toggle('skipEmbeds', 'Skip Remove Embeds confirmation', 'Skip the native Remove Embeds confirmation from the full message menu.'),
            toggle('feedback', 'Success feedback', 'Show a short toast after a successful action. Errors are always shown.'),
            h(RN.Text, { style: { color: muted, lineHeight: 21, marginTop: 8 } }, 'Reply opens Discord’s normal reply bar and keeps your draft. Remove Embeds keeps the text and attachments. Deleting a message removes it for everyone and requires permission.'),
            h(RN.Text, { style: { color: muted, lineHeight: 21, marginTop: 14 } }, (session?.status ?? 'Plugin is stopped.') + '\nQuick Delete 1.2.0'));
    }
    return { default: { jsonStorage: { load: true, default: { ...DEFAULTS } }, start,
        stop() { stopSession(current); }, SettingsComponent } };
})()
