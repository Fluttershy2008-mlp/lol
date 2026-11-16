// SPDX-License-Identifier: MIT
(() => {
    const dayMS = 86400000;
    const discordEpoch = 1420070400000n;
    const previewPath = 'modules/main_tabs_v2/native/shared_components/ChannelRowPreview.tsx';
    const previewExports = ['ChannelRowPreview', 'NativeChannelRowPreview', 'NativeMessageChannelRowPreview'];
    const guildMenuPath = 'modules/guilds_bar/native/utils/getGuildsBarGuildMenuItems.tsx';
    const defaults = { showBadges: true, milestoneToasts: true, lossAnimations: true, accounts: {}, selections: {} };
    const defaultSelection = { onlySelected: false, userIds: [], allGroups: false, groupIds: [], allGuilds: false, guildIds: [] };
    const scopes = {
        dm: { title: 'DMs', label: 'DM', ids: 'userIds', flag: 'onlySelected', toggle: 'Only selected users', input: 'user IDs',
            placeholder: 'Paste user IDs or mentions', all: 'Tracking all one-to-one DMs.', selected: 'Only the users below can earn new streak days.' },
        group: { title: 'Group DMs', label: 'group DM', ids: 'groupIds', flag: 'allGroups', toggle: 'Track all group DMs', input: 'group DM IDs',
            placeholder: 'Paste group DM channel IDs', all: 'Tracking all group DMs.', selected: 'Only the group DMs below can earn new streak days.' },
        guild: { title: 'Servers', label: 'server', ids: 'guildIds', flag: 'allGuilds', toggle: 'Track all servers', input: 'server IDs',
            placeholder: 'Paste server IDs', all: 'Tracking all servers.', selected: 'Only the servers below can earn new streak days.' },
    };
    const tiers = [
        { min: 100, range: '100+ days', name: 'Red', light: ['#9A243B', '#FCE1E5'], dark: ['#FFACB9', '#462131'] },
        { min: 50, range: '50–99 days', name: 'Purple', light: ['#653399', '#EEE3FC'], dark: ['#E1BDFF', '#392750'] },
        { min: 1, range: '1–49 days', name: 'Orange', light: ['#844000', '#FFE9D4'], dark: ['#FFBE80', '#422D23'] },
    ];
    const listeners = new Set();
    let current;
    let revision = 0;
    let writes = Promise.resolve();

    function isId(value) {
        return typeof value === 'string' && /^\d{15,22}$/.test(value);
    }

    function localDay(time) {
        const date = new Date(time);
        return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / dayMS;
    }

    function normalise(value) {
        const accounts = {};
        const selections = {};
        for (const [accountId, selection] of Object.entries(value?.selections ?? {})) {
            if (!isId(accountId) || !selection || typeof selection !== 'object') continue;
            selections[accountId] = {
                allGroups: selection.allGroups === true,
                allGuilds: selection.allGuilds === true,
                onlySelected: selection.onlySelected === true,
            };
            Object.values(scopes).forEach(({ ids }) => {
                const list = Array.isArray(selection[ids]) ? selection[ids] : [];
                selections[accountId][ids] = [...new Set(list.filter(id => isId(id) && id !== accountId))];
            });
        }
        for (const [accountId, records] of Object.entries(value?.accounts ?? {})) {
            if (!isId(accountId)) continue;
            const streaks = {};
            for (const [channelId, record] of Object.entries(records ?? {})) {
                if (!isId(channelId) || !Number.isSafeInteger(record?.lastDay) ||
                    !Number.isSafeInteger(record.days) || record.days < 1 ||
                    !Number.isSafeInteger(record.best) || record.best < record.days) continue;
                streaks[channelId] = {
                    lastDay: record.lastDay, days: record.days, best: record.best,
                    recipientId: isId(record.recipientId) ? record.recipientId : null,
                };
                if (record.recipientUsername) streaks[channelId].recipientUsername = validName(record.recipientUsername);
                if (record.lossShown === true) streaks[channelId].lossShown = true;
                if (record.kind === 'group' || record.kind === 'guild') {
                    streaks[channelId].kind = record.kind;
                    if (validName(record.name)) streaks[channelId].name = validName(record.name);
                }
            }
            accounts[accountId] = streaks;
        }
        return { showBadges: value?.showBadges !== false, milestoneToasts: value?.milestoneToasts !== false,
            lossAnimations: value?.lossAnimations !== false, accounts, selections };
    }

    function selectionFor(data, account) {
        return data?.selections?.[account] ?? defaultSelection;
    }

    function tracksAll(selection, kind) {
        const flag = selection[scopes[kind].flag];
        return kind === 'dm' ? !flag : flag;
    }

    function allowsTarget(data, account, kind, id) {
        const selection = selectionFor(data, account);
        return tracksAll(selection, kind) || selection[scopes[kind].ids].includes(id);
    }

    function activeDays(record, day) {
        return record && (record.lastDay === day || record.lastDay === day - 1) ? record.days : 0;
    }

    function tierColors(days, light) {
        const tier = tiers.find(tier => days >= tier.min) ?? tiers[2];
        return light ? tier.light : tier.dark;
    }

    function validName(value) {
        return typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : null;
    }

    function paintBadge(h, RN, days, light, kind = 'dm') {
        const [color, backgroundColor] = tierColors(days, light);
        const count = days > 999 ? '999+' : String(days);
        return h(RN.View, {
            accessible: true, accessibilityLabel: days + '-day ' + scopes[kind].label + ' streak',
            pointerEvents: 'none',
            style: { alignSelf: 'center', flexShrink: 1, maxWidth: 74, minWidth: 0, overflow: 'hidden',
                backgroundColor, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2, marginStart: 6 },
        }, h(RN.Text, {
            numberOfLines: 1, ellipsizeMode: 'tail', maxFontSizeMultiplier: 1.4,
            style: { color, fontSize: 12, fontWeight: '700' },
        }, '🔥 ' + count));
    }

    function changed() {
        revision++;
        listeners.forEach(listener => listener());
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    function watchStore(store, listener) {
        if (!store?.addChangeListener || !store?.removeChangeListener) return () => {};
        store.addChangeListener(listener);
        return () => store.removeChangeListener(listener);
    }

    const snapshot = () => revision;
    const live = session => current === session && session.active;

    function accountId(stores) {
        const id = stores.UserStore?.getCurrentUser?.()?.id;
        return isId(id) ? id : null;
    }

    function refreshClock(session) {
        const account = accountId(session.stores);
        const day = localDay(Date.now());
        if (account === session.account && day === session.day) return;
        session.account = account;
        session.day = day;
        changed();
    }

    function persist(session, next) {
        session.data = next;
        writes = writes.then(async () => {
            await session.api.jsonStorage.set(next, true);
            if (live(session) && session.error) {
                session.error = null;
                changed();
            }
        }).catch(error => {
            session.api.logger?.warn?.('Could not save streaks', error);
            if (live(session)) {
                session.error = 'Streaks could not be saved. Your next change will retry.';
                changed();
            }
        });
        changed();
    }

    function recipientIdentity(channel, record, account) {
        const recipients = [channel?.rawRecipients, channel?.recipients].filter(Array.isArray).flat();
        const ids = [channel?.getRecipientId?.(), ...recipients.map(user => user?.id ?? user), record?.recipientId];
        const id = ids.find(id => isId(id) && id !== account) ?? null;
        return { id, recipients };
    }

    function allowedRecord(session, channelId, record) {
        if (record.kind) return allowsTarget(session.data, session.account, record.kind, channelId);
        if (!selectionFor(session.data, session.account).onlySelected) return true;
        const id = record.recipientId ?? recipientIdentity(
            session.stores.ChannelStore?.getChannel?.(channelId), record, session.account).id;
        return allowsTarget(session.data, session.account, 'dm', id);
    }

    function getRecipient(stores, channel, record, account) {
        const { id, recipients } = recipientIdentity(channel, record, account);
        const embedded = recipients.find(user => user?.id === id);
        const user = id && stores.UserStore?.getUser?.(id);
        const lastUsername = record?.recipientId === id ? record.recipientUsername : null;
        const username = validName(user?.username) ?? validName(embedded?.username) ?? lastUsername ?? null;
        const nickname = id && validName(stores.RelationshipStore?.getNickname?.(id));
        const name = nickname || validName(user?.globalName) || validName(user?.global_name)
            || validName(embedded?.globalName) || validName(embedded?.global_name) || username;
        return { id, name, username };
    }

    function targetName(stores, kind, id) {
        if (kind === 'guild') return validName(stores.GuildStore?.getGuild?.(id)?.name);
        const channel = stores.ChannelStore?.getChannel?.(id);
        return channel?.type === 3 ? validName(channel.name) : null;
    }

    function trackMessage(session, event) {
        if (!live(session) || !session.data || event.optimistic) return;
        const { message } = event;
        const sender = accountId(session.stores);
        const channelId = message?.channel_id ?? message?.channelId ?? event.channelId ?? event.channel_id;
        if (!sender || message?.author?.id !== sender || !isId(channelId) ||
            !isId(message.id) || message.state === 'SENDING' || message.state === 'SEND_FAILED' ||
            (message.type != null && message.type !== 0 && message.type !== 19)) return;
        const channel = session.stores.ChannelStore?.getChannel?.(channelId);
        if (!channel) return;
        const guildId = channel.guild_id ?? channel.guildId ?? channel.getGuildId?.();
        const kind = channel.type === 1 ? 'dm' : channel.type === 3 ? 'group' : isId(guildId) ? 'guild' : null;
        if (!kind) return;
        const streakId = kind === 'guild' ? guildId : channelId;

        // Confirmed Discord message IDs encode the send time, including across midnight.
        const day = localDay(Number((BigInt(message.id) >> 22n) + discordEpoch));
        refreshClock(session);
        if (session.account !== sender || (day !== session.day && day !== session.day - 1)) return;

        const { accounts } = session.data;
        const streaks = accounts[sender] ?? {};
        const previous = streaks[streakId];
        if (previous && previous.lastDay >= day) return;
        const days = previous?.lastDay === day - 1 ? previous.days + 1 : 1;
        const recipient = kind === 'dm' ? getRecipient(session.stores, channel, previous, sender) : null;
        if (!allowsTarget(session.data, sender, kind, recipient ? recipient.id : streakId)) return;
        const name = recipient ? null : targetName(session.stores, kind, streakId) ?? previous?.name;
        const record = {
            lastDay: day, days, best: Math.max(days, previous?.best ?? 0),
            recipientId: recipient?.id ?? null,
            ...(recipient?.username ? { recipientUsername: recipient.username } : {}),
            ...(kind !== 'dm' ? { kind, ...(name ? { name } : {}) } : {}),
        };
        persist(session, { ...session.data, accounts: {
            ...accounts, [sender]: { ...streaks, [streakId]: record },
        } });
        if (session.data.milestoneToasts && [10, 50, 100].includes(days) && day === session.day) {
            const text = '🔥 ' + days + '-day ' + scopes[kind].label + ' streak!';
            try {
                if (session.RN.ToastAndroid) session.RN.ToastAndroid.show(text, session.RN.ToastAndroid.SHORT);
                else session.U.discord.actions.ToastActionCreators.open('streak-tracker-' + streakId, { text });
            } catch (error) { session.api.logger?.warn?.('Could not show streak milestone', error); }
        }
    }

    function installBadges(session) {
        const { React, RN, U } = session;
        const finders = U.discord.utils?.modules?.finders;
        const jsxRuntime = U.react.jsxRuntime;
        if (!finders?.getModuleWithImportedPath || !jsxRuntime?.afterJSX) return;

        const h = React.createElement;
        const ParentBadge = React.createContext(null);
        const types = new Set();
        const isLight = () => session.stores.ThemeStore?.theme === 'light';
        const animated = RN.Animated;

        function useSmoke(channelId, lossKey, light) {
            const [motion, setMotion] = React.useState(null);
            React.useEffect(() => {
                if (!lossKey) { setMotion(null); return; }
                if (!live(session) || !session.foreground || session.reduceMotion || !session.data?.showBadges ||
                    !session.data.lossAnimations) return;
                const { account, data } = session;
                const streaks = data.accounts[account];
                const record = streaks?.[channelId];
                if (!record || !allowedRecord(session, channelId, record) || record.lossShown || record.lastDay + 2 !== session.day ||
                    session.account !== accountId(session.stores) || localDay(Date.now()) !== session.day) return;
                const progress = new animated.Value(0);
                setMotion({ key: lossKey, progress, days: record.days, kind: record.kind });
                persist(session, { ...data, accounts: {
                    ...data.accounts, [account]: { ...streaks, [channelId]: { ...record, lossShown: true } },
                } });
            }, [channelId, lossKey]);

            React.useEffect(() => {
                if (!motion || motion.key !== lossKey) return;
                let mounted = true;
                const animation = animated.timing(motion.progress, {
                    toValue: 1, duration: 850, useNativeDriver: true, isInteraction: false,
                });
                animation.start(() => { if (mounted) setMotion(null); });
                return () => { mounted = false; animation.stop(); };
            }, [motion, lossKey]);

            if (!motion || motion.key !== lossKey) return null;
            const progressStyle = (inputRange, outputRange) =>
                motion.progress.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
            return h(RN.View, {
                pointerEvents: 'none', accessible: false, importantForAccessibility: 'no-hide-descendants',
                accessibilityElementsHidden: true, style: { flexShrink: 1, minWidth: 0, maxWidth: 74 },
            }, h(animated.View, { style: { opacity: progressStyle([0, 0.55], [1, 0]) } },
                paintBadge(h, RN, motion.days, light, motion.kind)),
            h(animated.View, {
                style: { position: 'absolute', end: 8, bottom: 0,
                    opacity: progressStyle([0, 0.35, 1], [0, 0.86, 0]),
                    transform: [{ translateY: progressStyle([0, 1], [3, -5]) }] },
            }, h(RN.Text, { style: { fontSize: 13 }, maxFontSizeMultiplier: 1.2 }, '💨')));
        }

        function PreviewWithStreak({ streakElement, streakChannelId }) {
            const inherited = React.useContext(ParentBadge) === streakChannelId;
            const read = () => {
                if (!live(session) || !session.data?.showBadges) return 0;
                const record = session.data.accounts[session.account]?.[streakChannelId];
                return record && record.kind !== 'guild' && allowedRecord(session, streakChannelId, record)
                    ? activeDays(record, session.day) : 0;
            };
            const readLoss = () => {
                if (inherited || !animated?.View || !animated.Value || !animated.timing || !live(session) ||
                    !session.foreground || session.reduceMotion || !session.data?.showBadges ||
                    !session.data.lossAnimations || !session.account) return null;
                const record = session.data.accounts[session.account]?.[streakChannelId];
                return record && record.kind !== 'guild' && record.lastDay + 2 === session.day && allowedRecord(session, streakChannelId, record)
                    ? session.account + ':' + streakChannelId + ':' + record.lastDay : null;
            };
            const days = React.useSyncExternalStore(subscribe, read, read);
            const lossKey = React.useSyncExternalStore(subscribe, readLoss, readLoss);
            const light = React.useSyncExternalStore(subscribe, isLight, isLight);
            const smoke = useSmoke(streakChannelId, lossKey, light);
            if (inherited || (!days && !lossKey)) return streakElement;
            const kind = session.data?.accounts[session.account]?.[streakChannelId]?.kind;
            const badge = days ? paintBadge(h, RN, days, light, kind) : smoke;
            return h(ParentBadge.Provider, { value: streakChannelId }, badge
                ? h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0, maxWidth: '100%' } },
                    h(RN.View, { style: { flexShrink: 1, minWidth: 0 } }, streakElement), badge)
                : streakElement);
        }

        const removeFinder = finders.getModuleWithImportedPath(previewPath, module => {
            if (!live(session)) return;
            previewExports.forEach(name => {
                const type = module?.[name];
                if (!type || types.has(type)) return;
                types.add(type);
                session.api.cleanup(jsxRuntime.afterJSX(type, element => {
                    if (!live(session) || !element) return element;
                    // Hide Blocked & Ignored Messages can wrap this preview before us.
                    const props = element.props.element?.props ?? element.props;
                    const id = props.channel?.id ?? props.channelId ?? props.message?.channel_id ?? props.message?.channelId;
                    if (!isId(id)) return element;
                    const type = props.channel?.type ?? session.stores.ChannelStore?.getChannel?.(id)?.type;
                    if (type != null && type !== 1 && type !== 3) return element;
                    // Preserve the native preview, key and callbacks when decorating it.
                    return h(PreviewWithStreak, { ...props, key: element.key ?? undefined, streakElement: element, streakChannelId: id });
                }));
            });
        });
        session.api.cleanup(removeFinder);
    }

    function installServerMenu(session) {
        const { api, U, RN, stores } = session;
        const finders = U.discord.utils?.modules?.finders;
        if (!finders?.getModuleWithImportedPath || !U.patcher?.instead) return;
        const read = (account, id) => {
            if (!live(session) || !session.data?.showBadges || accountId(stores) !== account) return null;
            const record = session.data.accounts[account]?.[id];
            return record?.kind === 'guild' && allowsTarget(session.data, account, 'guild', id) ? record : null;
        };
        const remove = finders.getModuleWithImportedPath(guildMenuPath, module => {
            if (!live(session)) return;
            const method = typeof module?.getGuildsBarGuildMenuItems === 'function' ? 'getGuildsBarGuildMenuItems' : 'default';
            if (typeof module?.[method] !== 'function') return;
            api.cleanup(U.patcher.instead(module, method, function (args, original) {
                const items = Reflect.apply(original, this, args);
                const value = args[0];
                const id = typeof value === 'string' ? value : value?.guildId ?? value?.guild?.id ?? value?.id;
                const account = session.account;
                if (!isId(id) || !Array.isArray(items)) return items;
                const day = localDay(Date.now());
                const days = activeDays(read(account, id), day);
                if (!days) return items;
                const item = { label: '🔥 ' + days + '-day server streak', action: () => {
                    const record = read(account, id);
                    const count = activeDays(record, localDay(Date.now()));
                    if (count) RN.Alert.alert(targetName(stores, 'guild', id) ?? 'Server streak',
                        count + '-day streak · Personal best ' + record.best);
                } };
                const group = items.findIndex(Array.isArray);
                return group < 0 ? [...items, item] : items.map((row, index) => index === group ? [...row, item] : row);
            }));
        });
        api.cleanup(remove);
    }

    async function start(api) {
        const U = api.unscoped;
        const session = {
            api, U, React: U.react.React, RN: U.react.ReactNative, stores: U.discord.flux.Stores,
            active: true, day: localDay(Date.now()), account: null, data: null, error: null,
            foreground: (U.react.ReactNative.AppState?.currentState ?? 'active') === 'active', reduceMotion: false,
        };
        current = session;
        api.cleanup(() => {
            session.active = false;
            if (current === session) current = undefined;
            changed();
        });
        try {
            await writes;
            if (!live(session)) return;
            const storage = api.jsonStorage;
            const value = storage.loaded ? storage.cache : await storage.get();
            if (!live(session)) return;
            if (!value || typeof value !== 'object') throw new Error('Invalid streak storage');
            session.data = normalise(value);
        } catch (error) {
            api.logger?.warn?.('Could not load streaks', error);
            if (live(session)) {
                session.error = 'Streak data could not be loaded. Reload Discord to try again.';
                changed();
            }
            return;
        }

        const userStore = session.stores.UserStore;
        const onUserChange = () => { if (live(session)) refreshClock(session); };
        api.cleanup(watchStore(userStore, onUserChange));
        api.cleanup(watchStore(session.stores.ThemeStore, changed));
        api.cleanup(watchStore(session.stores.ChannelStore, () => {
            if (selectionFor(session.data, session.account).onlySelected) changed();
        }));
        const dispatcher = U.discord.common.flux.Dispatcher;
        const onMessage = event => {
            try { trackMessage(session, event); }
            catch (error) { api.logger?.warn?.('Could not process a DM streak', error); }
        };
        dispatcher.subscribe('MESSAGE_CREATE', onMessage);
        api.cleanup(() => dispatcher.unsubscribe('MESSAGE_CREATE', onMessage));

        let clockTimer;
        function checkClock() {
            if (!live(session)) return;
            clearTimeout(clockTimer);
            onUserChange();
            const now = new Date();
            const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            clockTimer = setTimeout(checkClock, Math.min(midnight - now, 3600000));
        }
        api.cleanup(() => clearTimeout(clockTimer));
        const appState = session.RN.AppState?.addEventListener('change', state => {
            const foreground = state === 'active';
            const toggled = foreground !== session.foreground;
            session.foreground = foreground;
            if (state === 'active') checkClock();
            if (toggled) changed();
        });
        if (appState) api.cleanup(() => appState.remove());

        const accessibility = session.RN.AccessibilityInfo;
        let receivedMotionEvent = false;
        const setReduceMotion = enabled => {
            if (!live(session) || session.reduceMotion === enabled) return;
            session.reduceMotion = enabled;
            changed();
        };
        const motionSetting = accessibility?.addEventListener?.('reduceMotionChanged', enabled => {
            receivedMotionEvent = true;
            setReduceMotion(enabled);
        });
        if (motionSetting) api.cleanup(() => motionSetting.remove());
        if (accessibility?.isReduceMotionEnabled) {
            session.reduceMotion = true;
            Promise.resolve().then(() => accessibility.isReduceMotionEnabled()).then(enabled => {
                if (!receivedMotionEvent) setReduceMotion(enabled);
            }).catch(error => api.logger?.warn?.('Could not read reduce motion setting', error));
        }
        try { installBadges(session); }
        catch (error) { api.logger?.warn?.('Could not attach DM streak badges', error); }
        try { installServerMenu(session); }
        catch (error) { api.logger?.warn?.('Could not attach server streak menu', error); }
        checkClock();
        changed();
    }

    function TrackingSettings(props) {
        const { session, panel, heading, text, light } = props;
        const { React, RN } = session;
        const h = React.createElement;
        const [kind, setKind] = React.useState('dm');
        return h(RN.View, { style: panel }, heading('Who to track'),
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 } },
                Object.entries(scopes).map(([key, scope]) => h(RN.Pressable, {
                    key, accessibilityRole: 'tab', accessibilityLabel: scope.title, accessibilityState: { selected: key === kind },
                    style: { borderRadius: 6, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10,
                        backgroundColor: key === kind ? (light ? '#DADFFB' : '#373E5D') : undefined },
                    onPress: () => setKind(key),
                }, text(scope.title, { fontWeight: key === kind ? '700' : '500' })))),
            h(TrackingList, { ...props, key: kind, kind }));
    }

    function TrackingList({ session, account, kind, light, text, muted, fg }) {
        const { React, RN } = session;
        const h = React.createElement;
        const [input, setInput] = React.useState('');
        const [status, setStatus] = React.useState('');
        const selection = selectionFor(session.data, account);
        const scope = scopes[kind];
        const selectedIds = selection[scope.ids];
        const update = transform => {
            if (!live(session) || account !== accountId(session.stores)) return false;
            const { selections } = session.data;
            const next = transform(selectionFor(session.data, account));
            persist(session, { ...session.data, selections: { ...selections, [account]: next } });
            return true;
        };

        function addIds() {
            const ids = input.split(/[\s,]+/).filter(Boolean)
                .map(token => kind === 'dm' ? token.replace(/^<@!?(\d+)>$/, '$1') : token);
            if (!ids.length || ids.some(id => !isId(id))) {
                setStatus(kind === 'dm' ? 'Paste Discord user IDs or mentions, separated by commas or new lines.'
                    : 'Paste ' + scope.input + ', separated by commas or new lines.');
                return;
            }
            if (ids.includes(account)) {
                setStatus(kind === 'dm' ? 'Remove your own user ID before adding the list.'
                    : 'Use a ' + scope.label + ' ID here.');
                return;
            }
            if (ids.every(id => selectedIds.includes(id))) {
                setStatus('Those IDs are already on your list.');
                return;
            }
            if (update(previous => ({ ...previous, [scope.ids]: [...new Set([...previous[scope.ids], ...ids])] }))) {
                setInput('');
                setStatus('');
                RN.Keyboard?.dismiss();
            }
        }

        const all = tracksAll(selection, kind);
        return h(RN.View, null,
            h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 } },
                text(scope.toggle, { flex: 1, fontSize: 15, fontWeight: '600' }),
                h(RN.Switch, { accessibilityLabel: scope.toggle, value: selection[scope.flag],
                    onValueChange: enabled => update(previous => ({ ...previous, [scope.flag]: enabled })) })),
            text(all ? scope.all : scope.selected, { color: muted, marginBottom: 10 }),
            h(RN.TextInput, {
                accessibilityLabel: 'Discord ' + scope.input, placeholder: scope.placeholder, placeholderTextColor: muted,
                value: input, onChangeText: value => { setInput(value); setStatus(''); }, multiline: true,
                autoCapitalize: 'none', autoCorrect: false,
                style: { color: fg, backgroundColor: light ? '#FFFFFF' : '#191C23', borderRadius: 8,
                    minHeight: 42, maxHeight: 100, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
            }),
            h(RN.Button, { title: 'Add ' + scope.input, disabled: !input.trim(), onPress: addIds }),
            status ? text(status, { color: muted, marginTop: 8 }, { accessibilityLiveRegion: 'polite' }) : null,
            selectedIds.length ? selectedIds.map(id => {
                const user = kind === 'dm' ? session.stores.UserStore?.getUser?.(id) : null;
                const name = kind === 'dm' ? validName(user?.globalName) ?? validName(user?.global_name) ?? validName(user?.username)
                    : targetName(session.stores, kind, id);
                return h(RN.View, { key: id, style: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 } },
                    h(RN.View, { style: { flex: 1, minWidth: 0 } },
                        name ? text(name, { fontWeight: '600' }, { numberOfLines: 1 }) : null,
                        text(id, { color: name ? muted : fg, fontSize: 13 }, { selectable: true })),
                    h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Remove ' + id,
                        style: { paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' },
                        onPress: () => update(previous => ({ ...previous, [scope.ids]: previous[scope.ids].filter(savedId => savedId !== id) })) },
                    text('Remove', { color: light ? '#A21D30' : '#FFA4AD', fontWeight: '600' })));
            }) : !all ? text('Add ' + scope.input + ' to start tracking.', { color: muted, marginTop: 8 }) : null);
    }

    function SettingsComponent({ api }) {
        const { React, ReactNative: RN } = api.unscoped.react;
        const h = React.createElement;
        React.useSyncExternalStore(subscribe, snapshot, snapshot);
        const stores = api.unscoped.discord.flux.Stores;
        const [, refreshNames] = React.useReducer(value => value + 1, 0);
        React.useEffect(() => {
            const removers = [stores.UserStore, stores.ChannelStore, stores.RelationshipStore, stores.GuildStore]
                .map(store => watchStore(store, refreshNames));
            return () => removers.forEach(remove => remove());
        }, [stores]);
        const session = current;
        const data = session?.data;
        const signedIn = session?.account;
        const light = stores.ThemeStore?.theme === 'light';
        const fg = light ? '#17171B' : '#F2F3F5';
        const muted = light ? '#505460' : '#B7BBC5';
        const card = light ? '#F0F1F4' : '#282B32';
        const text = (label, style, props) => h(RN.Text, { ...props, style: { color: fg, ...style } }, label);
        const heading = label => text(label, { fontWeight: '700', fontSize: 17, marginBottom: 8 });
        const paragraph = label => text(label, { color: muted, lineHeight: 20, marginBottom: 12 });
        const panel = { backgroundColor: card, padding: 14, borderRadius: 12, marginBottom: 16 };

        const records = Object.entries(data?.accounts[signedIn] ?? {});
        const stats = records.reduce((totals, [id, record]) => {
            if (!allowedRecord(session, id, record)) return totals;
            const days = activeDays(record, session.day);
            if (days) {
                totals.active.push({ id, record, days });
                if (record.lastDay === session.day - 1) totals.due++;
            }
            totals.best = Math.max(totals.best, record.best);
            totals.total += days;
            return totals;
        }, { active: [], best: 0, total: 0, due: 0 });
        const leaderboard = stats.active.sort((a, b) => b.days - a.days || a.id.localeCompare(b.id)).slice(0, 5);
        const stat = (value, label) => h(RN.View, { style: { flex: 1, marginEnd: 4 } },
            text(String(value), { fontSize: 23, fontWeight: '700' }),
            text(label, { color: muted, fontSize: 12 }));
        const toggle = (key, label, detail) => h(RN.View,
            { style: { flexDirection: 'row', alignItems: 'center', minHeight: 48 } },
            h(RN.View, { style: { flex: 1, marginEnd: 8, paddingVertical: 5 } },
                text(label, { fontSize: 15, fontWeight: '600' }),
                text(detail, { color: muted, fontSize: 13, marginTop: 2 })),
            h(RN.Switch, { accessibilityLabel: label, value: data?.[key] ?? defaults[key], disabled: !data,
                onValueChange: value => {
                    if (session && live(session) && session.data) persist(session, { ...session.data, [key]: value });
                },
            }));
        function clear() {
            if (!session || !live(session) || !signedIn || accountId(session.stores) !== signedIn) return;
            RN.Alert.alert('Clear your streak history?', 'This resets all current streaks and records for this account on this device.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear history', style: 'destructive', onPress: () => {
                    if (!live(session) || accountId(session.stores) !== signedIn) return;
                    const accounts = { ...session.data.accounts };
                    delete accounts[signedIn];
                    persist(session, { ...session.data, accounts });
                } },
            ]);
        }

        return h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: 16, paddingBottom: 32 } },
            session?.error ? paragraph(session.error) : null,
            data && signedIn ? h(TrackingSettings, { key: signedIn, session, account: signedIn, light, panel, heading, text, muted, fg }) : null,
            h(RN.View, { style: panel }, heading('Statistics'),
                h(RN.View, { style: { flexDirection: 'row' } },
                    stat(stats.active.length, 'Active streaks'), stat(stats.best, 'Personal best'), stat(stats.total, 'Active days')),
                stats.due ? text(stats.due === 1 ? '1 streak needs a message today' : stats.due + ' streaks need a message today',
                    { color: muted, marginTop: 10 }) : null),
            h(RN.View, { style: panel }, heading('Top 5 streaks'),
                leaderboard.length ? leaderboard.map(({ id, record, days }, index) => {
                    const kind = record.kind ?? 'dm';
                    const recipient = kind === 'dm' ? getRecipient(stores, stores.ChannelStore?.getChannel?.(id), record, signedIn) : null;
                    const name = recipient ? recipient.name : targetName(stores, kind, id) ?? record.name;
                    const detail = recipient ? (recipient.username && name !== recipient.username ? '@' + recipient.username : null)
                        : kind === 'guild' ? 'Server' : 'Group DM';
                    const fallback = (detail ?? 'DM') + ' · …' + (recipient?.id ?? id).slice(-4);
                    return h(RN.View, { key: id, style: { flexDirection: 'row', alignItems: 'center', minHeight: 44 } },
                        text(String(index + 1), { color: muted, width: 24, fontVariant: ['tabular-nums'] }),
                        h(RN.View, { style: { flex: 1, minWidth: 0 } },
                            text(name ?? fallback, { fontWeight: '600' }, { numberOfLines: 1 }),
                            detail ? text(detail, { color: muted, fontSize: 12, marginTop: 2 }, { numberOfLines: 1 }) : null),
                        paintBadge(h, RN, days, light, kind));
                }) : paragraph(!data && !session?.error ? 'Loading streaks…'
                    : signedIn ? 'No active streaks yet.' : 'Sign in to see your streaks.')),
            h(RN.View, { style: panel }, heading('Preferences'),
                toggle('showBadges', 'Show streak badges', 'Show counts on DM previews and in the server menu.'),
                toggle('lossAnimations', 'Animate expired streaks', 'Fade the badge out with smoke when you miss a day.'),
                toggle('milestoneToasts', 'Notify at 10, 50 and 100 days', 'Show a short notification when you reach a milestone.')),
            h(RN.View, { style: panel }, heading('How streaks work'),
                paragraph('Send a message in a tracked DM, group DM, or server to count today. All channels in a server share one streak. You have until your phone’s midnight to extend yesterday’s streak.'),
                h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 } },
                    [...tiers].reverse().map(tier => {
                        const [color, backgroundColor] = tierColors(tier.min, light);
                        return text(tier.range, { color, backgroundColor, borderRadius: 6,
                            overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 4, fontWeight: '600' },
                        { key: tier.min, accessibilityLabel: tier.name + ', ' + tier.range });
                    }))),
            h(RN.Button, { title: 'Clear streak history', color: light ? '#A21D30' : '#F4697C',
                disabled: !records.length, onPress: clear }));
    }

    return { default: { jsonStorage: { default: defaults }, start, SettingsComponent } };
})()
