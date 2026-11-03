(() => {
    'use strict';
    const optional = fn => { try { return fn(); } catch { return undefined; } };
    const validId = value => typeof value === 'string' && /^\d{1,20}$/.test(value);
    const GESTURE = Symbol.for('dev.fluttershy2008.message-taps.v1');
    const settingsOf = value => ({ enabled: value?.enabled !== false,
        interval: [250, 350, 500].includes(value?.interval) ? value.interval : 350 });
    let current;
    function stop(session) {
        if (!session?.active) return;
        session.active = false;
        session.cancel();
        for (const remove of session.removers.splice(0).reverse()) optional(remove);
        if (current === session) current = undefined;
    }
    async function start(api) {
        if (current?.active) return;
        const U = api.unscoped, { React, ReactNative: RN } = U.react;
        const F = U.modules.finders, S = U.discord.flux.Stores;
        const paths = U.discord.utils?.modules?.finders;
        const session = { active: true, removers: [], settings: settingsOf(api.jsonStorage?.cache), pending: null, lastEdit: null };
        current = session;
        const live = () => current === session && session.active;
        const account = () => optional(() => S.UserStore.getCurrentUser()?.id);
        const selected = () => optional(() => S.SelectedChannelStore.getChannelId());
        session.cancel = () => {
            if (session.pending) clearTimeout(session.pending.timer);
            session.pending = null;
        };
        api.cleanup(() => stop(session));
        const byProps = (...keys) => optional(() => F.lookupModule(F.filters.withProps(...keys), { initialize: false })[0]);
        function watchProps(keys, accept) {
            const seen = new WeakSet();
            const callback = value => {
                if (!live() || !value || !['function', 'object'].includes(typeof value) || seen.has(value)) return;
                seen.add(value); accept(value);
            };
            callback(byProps(...keys));
            const remove = optional(() => F.getModules(F.filters.withProps(...keys), callback));
            if (typeof remove === 'function') session.removers.push(remove);
        }
        function watchPath(path, accept) {
            const remove = optional(() => paths?.getModuleWithImportedPath(path, value => { if (live()) accept(value); }));
            if (typeof remove === 'function') session.removers.push(remove);
        }
        let actions, inputUtils, legacyInput;
        const composers = new Map();
        watchProps(['openSystemKeyboard', 'insertText'], value => { legacyInput = value; });
        const acceptActions = value => {
            const candidate = value?.default?.startEditMessage ? value.default : value;
            if (typeof candidate?.startEditMessage === 'function') actions = candidate;
        };
        watchPath('actions/MessageActionCreators.tsx', acceptActions);
        watchProps(['startEditMessage'], acceptActions);
        const acceptInput = value => {
            const candidate = value?.default?.getBestActiveInputForChannelId ? value.default : value;
            if (typeof candidate?.getBestActiveInputForChannelId === 'function') inputUtils = candidate;
        };
        watchPath('utils/native/ChatInputUtils.tsx', acceptInput);
        watchProps(['getBestActiveInputForChannelId'], acceptInput);
        function resolve(ref) {
            if (!live() || !session.settings.enabled || !ref || !validId(ref.accountId)
                || ref.accountId !== account() || selected() && ref.channelId !== selected()) return;
            const message = optional(() => S.MessageStore.getMessage(ref.channelId, ref.messageId));
            if (!message || message.id !== ref.messageId || message.author?.id !== ref.accountId
                || (message.channel_id ?? message.channelId ?? ref.channelId) !== ref.channelId
                || message.deleted || message.webhook_id || message.webhookId || message.author?.bot
                || ![0, 19].includes(message.type ?? 0)
                || ['SENDING', 'SEND_FAILED', 'sending', 'send_failed'].includes(message.state)
                || typeof message.content !== 'string' || !message.content.length) return;
            return message;
        }
        function eventRef(event) {
            const data = event?.nativeEvent ?? event;
            if (!data || data.touches?.length > 1 || data.numberOfPointers > 1) return;
            const ref = { accountId: account(), channelId: data.channelId ?? data.channel_id ?? selected(),
                messageId: data.messageId ?? data.message_id };
            return validId(ref.channelId) && validId(ref.messageId) && resolve(ref) ? ref : undefined;
        }
        function edit(ref, handler) {
            const message = resolve(ref);
            if (!message) return;
            try {
                if (typeof actions?.startEditMessage !== 'function') throw Error('unavailable');
                // Open Discord's editor; the normal Send button saves the edit.
                actions.startEditMessage(ref.channelId, ref.messageId, message.content, 'action_sheet');
                session.lastEdit = { ...ref, at: Date.now() };
                const input = optional(() => inputUtils?.getBestActiveInputForChannelId(ref.channelId))
                    ?? optional(() => handler?.params?.chatInputRef)
                    ?? composers.get(ref.channelId)
                    ?? optional(() => legacyInput?.refs?.find(value => (value?.current?.props?.channel?.id ?? value?.current?.props?.channelId) === ref.channelId));
                if (input) optional(() => (input.current ?? input).openSystemKeyboard?.());
                else optional(() => legacyInput?.openSystemKeyboard());
            } catch {
                optional(() => RN.ToastAndroid?.show('Could not open the editor. Reopen this chat and try again.', 0));
            }
        }
        const keyOf = ref => [ref.accountId, ref.channelId, ref.messageId].join(':');
        const bridge = {
            forwarding: 0,
            forward(fn) { this.forwarding++; try { return fn(); } finally { this.forwarding--; } },
            handle(event, handler, forward) {
                return !live() || this.forwarding ? forward() : tap(event, handler, () => this.forward(forward));
            },
            cancel: () => session.cancel(),
        };
        U[GESTURE] = bridge;
        session.removers.push(() => { if (U[GESTURE] === bridge) delete U[GESTURE]; composers.clear(); });
        function tap(event, handler, forward) {
            if (optional(() => handler?.isModalOrActionsheetObstructing?.())) { session.cancel(); return forward(); }
            const ref = eventRef(event);
            if (!ref) { session.cancel(); return forward(); }
            optional(() => event?.persist?.());
            const key = keyOf(ref), now = Date.now();
            if (session.lastEdit && keyOf(session.lastEdit) === key && now - session.lastEdit.at < session.settings.interval) return;
            const previous = session.pending;
            if (previous && previous.key === key && now - previous.at <= session.settings.interval) {
                session.cancel(); edit(ref, handler); return;
            }
            if (previous) {
                session.cancel();
                if (resolve(previous.ref)) previous.forward();
            }
            const pending = { key, ref, at: now, forward };
            pending.timer = setTimeout(() => {
                if (session.pending !== pending) return;
                session.pending = null;
                if (resolve(ref)) forward();
            }, session.settings.interval);
            session.pending = pending;
        }
        const wrappers = new WeakMap();
        function wrapTap(original) {
            if (wrappers.has(original)) return wrappers.get(original);
            const wrapped = function(...args) {
                const forward = () => Reflect.apply(original, this, args);
                return bridge.handle(args[0], undefined, forward);
            };
            wrappers.set(original, wrapped); wrappers.set(wrapped, wrapped);
            return wrapped;
        }
        const cancelWrappers = new WeakMap();
        function wrapCancel(original) {
            if (cancelWrappers.has(original)) return cancelWrappers.get(original);
            const wrapped = function(...args) { if (live()) session.cancel(); return Reflect.apply(original, this, args); };
            cancelWrappers.set(original, wrapped); cancelWrappers.set(wrapped, wrapped);
            return wrapped;
        }
        function wrapElement(element) {
            const props = element?.props;
            if (live() && props?.chatInputRef) {
                const channelId = props.channel?.id ?? props.channelId;
                if (validId(channelId)) { composers.set(channelId, props.chatInputRef); if (composers.size > 8) composers.delete(composers.keys().next().value); }
            }
            if (!live() || typeof props?.onTapMessage !== 'function' || typeof props.onLongPressMessage !== 'function') return element;
            const next = { onTapMessage: wrapTap(props.onTapMessage) };
            for (const key of ['onLongPressMessage', 'onInitiateReply', 'onTapLink', 'onTapImage', 'onScrollBeginDrag'])
                if (typeof props[key] === 'function') next[key] = wrapCancel(props[key]);
            return React.cloneElement(element, next);
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
        watchProps(['createElement', 'cloneElement'], value => patchFactories(value, ['createElement']));
        patchFactories(U.react.ReactJSXRuntime, ['jsx', 'jsxs', 'jsxDEV']);
        watchProps(['jsx', 'jsxs'], value => patchFactories(value, ['jsx', 'jsxs', 'jsxDEV']));
        // Native chat callbacks can be bound before React creates the view.
        const patchedHandlers = new WeakSet(), patchedClasses = new WeakSet(), patchedExports = new WeakMap();
        function patchHandler(handler) {
            if (!live() || !handler || patchedHandlers.has(handler) || typeof handler.handleTapMessage !== 'function') return;
            patchedHandlers.add(handler);
            if (typeof handler.handleTapMessage === 'function') session.removers.push(U.patcher.instead(handler, 'handleTapMessage', function(args, original) {
                const context = this && handler === Object.getPrototypeOf(this) ? this : handler;
                return bridge.handle(args[0], context, () => Reflect.apply(original, this, args));
            }));
            for (const key of ['handleLongPressMessage', 'handleInitiateReply', 'handleTapLink', 'handleTapImage'])
                if (typeof handler[key] === 'function') session.removers.push(U.patcher.instead(handler, key, function(args, original) {
                    if (live()) session.cancel();
                    return Reflect.apply(original, this, args);
                }));
        }
        function attachHandlers(value) {
            const holder = value?.MessagesHandlers ? value : value?.default;
            const Type = holder?.MessagesHandlers;
            if (typeof Type !== 'function' || !Type.prototype) return;
            if (patchedExports.get(holder) === Type) return;
            if (!patchedClasses.has(Type)) {
                patchedClasses.add(Type);
                patchHandler(Type.prototype);
                const descriptor = Object.getOwnPropertyDescriptor(Type.prototype, 'params');
                if (descriptor?.get && descriptor.configurable) {
                    const get = function() { patchHandler(this); return Reflect.apply(descriptor.get, this, []); };
                    const marker = Symbol.for('dev.fluttershy2008.message-params.v1');
                    get[marker] = { descriptor, live };
                    Object.defineProperty(Type.prototype, 'params', { ...descriptor, get });
                    session.removers.push(() => {
                        if (Object.getOwnPropertyDescriptor(Type.prototype, 'params')?.get === get) {
                            let restore = descriptor;
                            while (restore.get?.[marker] && !restore.get[marker].live()) restore = restore.get[marker].descriptor;
                            Object.defineProperty(Type.prototype, 'params', restore);
                        }
                    });
                }
            }
            session.removers.push(U.patcher.instead(holder, 'MessagesHandlers', function(args, original) {
                const result = new.target ? Reflect.construct(original, args, new.target) : Reflect.apply(original, this, args);
                patchHandler(result ?? this);
                return result;
            }));
            patchedExports.set(holder, holder.MessagesHandlers);
        }
        watchPath('modules/messages/native/MessagesHandlers.tsx', attachHandlers);
        watchProps(['MessagesHandlers'], attachHandlers);
        for (const store of [S.UserStore, S.SelectedChannelStore]) optional(() => {
            const reset = () => { session.cancel(); session.lastEdit = null; composers.clear(); };
            store.addChangeListener(reset);
            session.removers.push(() => store.removeChangeListener(reset));
        });
        const subscription = optional(() => RN.AppState?.addEventListener('change', state => { if (state !== 'active') session.cancel(); }));
        if (subscription?.remove) session.removers.push(() => subscription.remove());
        try {
            const value = api.jsonStorage.loaded ? api.jsonStorage.cache : await api.jsonStorage.get();
            if (live()) session.settings = settingsOf(value);
        } catch {}
    }
    function SettingsComponent({ api }) {
        const { React, ReactNative: RN } = api.unscoped.react, h = React.createElement;
        const [values, setValues] = React.useState(() => current?.settings ?? settingsOf(api.jsonStorage?.cache));
        const light = optional(() => api.unscoped.discord.flux.Stores.ThemeStore.theme) === 'light';
        const color = light ? '#18191C' : '#F2F3F5';
        function save(update) {
            const next = settingsOf({ ...values, ...update });
            setValues(next);
            if (current?.active) { current.cancel(); current.settings = next; }
            void api.jsonStorage.set(next, true).catch(() => optional(() => RN.ToastAndroid?.show('Could not save Double Tap Edit settings.', 0)));
        }
        return h(RN.ScrollView, { contentContainerStyle: { padding: 20, gap: 16 } },
            h(RN.Text, { style: { color, fontSize: 24, fontWeight: '700' } }, 'Double Tap Edit'),
            h(RN.Text, { style: { color, lineHeight: 21 } }, 'Double-tap the text of your own message to edit it. Tap Send when finished. Works in servers and DMs.'),
            h(RN.Switch, { accessibilityLabel: 'Enable double-tap editing', value: values.enabled, onValueChange: enabled => save({ enabled }) }),
            h(RN.Text, { style: { color } }, 'Double-tap speed'),
            ...[250, 350, 500].map(interval => h(RN.Pressable, { key: interval, accessibilityRole: 'radio', accessibilityState: { checked: interval === values.interval },
                onPress: () => save({ interval }), style: { padding: 14, borderWidth: 1, borderColor: color, borderRadius: 8 } },
                h(RN.Text, { style: { color } }, ({ 250: 'Fast', 350: 'Normal', 500: 'Relaxed' })[interval] + (interval === values.interval ? ' ✓' : '')))),
            h(RN.Text, { style: { color, lineHeight: 21 } }, 'Works with Quick Delete 1.2.2 or newer: keep “Tap for quick actions” enabled. A single tap opens Quick Actions after the double-tap interval; a double-tap opens the editor. Update both plugins and fully restart Discord.'));
    }
    return { default: { jsonStorage: { load: true, default: { enabled: true, interval: 350 } }, start,
        stop() { stop(current); }, SettingsComponent } };
})()

