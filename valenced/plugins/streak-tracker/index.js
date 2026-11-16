// SPDX-License-Identifier: MIT
(() => {
    const dayMS = 86400000;
    const discordEpoch = 1420070400000n;
    const previewPath = 'modules/main_tabs_v2/native/shared_components/ChannelRowPreview.tsx';
    const previewExports = ['ChannelRowPreview', 'NativeChannelRowPreview', 'NativeMessageChannelRowPreview'];
    const defaults = { showBadges: true, milestoneToasts: true, accounts: {} };
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
            }
            accounts[accountId] = streaks;
        }
        return { showBadges: value?.showBadges !== false, milestoneToasts: value?.milestoneToasts !== false, accounts };
    }

    function activeDays(record, day) {
        return record && (record.lastDay === day || record.lastDay === day - 1) ? record.days : 0;
    }

    function streakColor(days, light) {
        if (days >= 100) return light ? '#A21D30' : '#FFA4AD';
        if (days >= 50) return light ? '#6937A8' : '#D6B0FF';
        return light ? '#934500' : '#FFC083';
    }

    function changed() {
        revision++;
        listeners.forEach(listener => listener());
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
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

    function getRecipient(channel) {
        const first = channel.recipients?.[0];
        const id = channel.getRecipientId?.() ?? first?.id ?? first;
        return isId(id) ? id : null;
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
        if (channel?.type !== 1) return;

        // Confirmed Discord message IDs encode the send time, including across midnight.
        const day = localDay(Number((BigInt(message.id) >> 22n) + discordEpoch));
        refreshClock(session);
        if (session.account !== sender || (day !== session.day && day !== session.day - 1)) return;

        const { accounts } = session.data;
        const streaks = accounts[sender] ?? {};
        const previous = streaks[channelId];
        if (previous && previous.lastDay >= day) return;
        const days = previous?.lastDay === day - 1 ? previous.days + 1 : 1;
        const record = {
            lastDay: day, days, best: Math.max(days, previous?.best ?? 0),
            recipientId: getRecipient(channel) ?? previous?.recipientId ?? null,
        };
        persist(session, { ...session.data, accounts: {
            ...accounts, [sender]: { ...streaks, [channelId]: record },
        } });
        if (session.data.milestoneToasts && [10, 50, 100].includes(days) && day === session.day) {
            const text = '🔥 ' + days + '-day DM streak!';
            try {
                if (session.RN.ToastAndroid) session.RN.ToastAndroid.show(text, session.RN.ToastAndroid.SHORT);
                else session.U.discord.actions.ToastActionCreators.open('streak-tracker-' + channelId, { text });
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
        function PreviewWithStreak({ streakElement, streakChannelId }) {
            const inherited = React.useContext(ParentBadge);
            const read = () => live(session) && session.data?.showBadges
                ? activeDays(session.data.accounts[session.account]?.[streakChannelId], session.day) : 0;
            const days = React.useSyncExternalStore(subscribe, read, read);
            if (!days || inherited === streakChannelId) return streakElement;
            const light = session.stores.ThemeStore?.theme === 'light';
            return h(ParentBadge.Provider, { value: streakChannelId },
                h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 } },
                    h(RN.View, { style: { flexShrink: 1, minWidth: 0 } }, streakElement),
                    h(RN.Text, {
                        accessibilityLabel: days + '-day DM streak',
                        numberOfLines: 1,
                        style: { flexShrink: 0, marginStart: 6, fontSize: 12, fontWeight: '700', color: streakColor(days, light) },
                    }, '🔥 ' + days)));
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
                    if (type != null && type !== 1) return element;
                    // Preserve the native element, key and callbacks. A recorded ID
                    // is always a confirmed DM even when the store is evicted.
                    return h(PreviewWithStreak, { ...props, key: element.key, streakElement: element, streakChannelId: id });
                }));
            });
        });
        session.api.cleanup(removeFinder);
    }

    async function start(api) {
        const U = api.unscoped;
        const session = {
            api, U, React: U.react.React, RN: U.react.ReactNative, stores: U.discord.flux.Stores,
            active: true, day: localDay(Date.now()), account: null, data: null, error: null,
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
        if (userStore?.addChangeListener && userStore?.removeChangeListener) {
            userStore.addChangeListener(onUserChange);
            api.cleanup(() => userStore.removeChangeListener(onUserChange));
        }
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
            if (state === 'active') checkClock();
        });
        if (appState) api.cleanup(() => appState.remove());
        try { installBadges(session); }
        catch (error) { api.logger?.warn?.('Could not attach DM streak badges', error); }
        checkClock();
        changed();
    }

    function SettingsComponent({ api }) {
        const { React, ReactNative: RN } = api.unscoped.react;
        const h = React.createElement;
        React.useSyncExternalStore(subscribe, snapshot, snapshot);
        const session = current;
        const data = session?.data;
        const signedIn = session?.account;
        const light = api.unscoped.discord.flux.Stores.ThemeStore?.theme === 'light';
        const fg = light ? '#17171B' : '#F2F3F5';
        const muted = light ? '#505460' : '#B7BBC5';
        const card = light ? '#F0F1F4' : '#282B32';
        const text = (label, style, props) => h(RN.Text, { ...props, style: { color: fg, ...style } }, label);
        const heading = label => text(label, { fontWeight: '700', fontSize: 17, marginBottom: 8 });
        const paragraph = label => text(label, { color: muted, lineHeight: 20, marginBottom: 12 });
        const panel = { backgroundColor: card, padding: 14, borderRadius: 12, marginBottom: 16 };

        const records = Object.entries(data?.accounts[signedIn] ?? {});
        const stats = records.reduce((totals, [id, record]) => {
            const days = activeDays(record, session.day);
            if (days) totals.active.push({ id, record, days });
            totals.best = Math.max(totals.best, record.best);
            totals.total += days;
            return totals;
        }, { active: [], best: 0, total: 0 });
        const leaderboard = stats.active.sort((a, b) => b.days - a.days || a.id.localeCompare(b.id)).slice(0, 5);
        const stat = (value, label) => h(RN.View, { style: { flex: 1, marginEnd: 4 } },
            text(String(value), { fontSize: 23, fontWeight: '700' }),
            text(label, { color: muted, fontSize: 12 }));
        const toggle = (key, label) => h(RN.View,
            { style: { flexDirection: 'row', alignItems: 'center', minHeight: 48 } },
            text(label, { flex: 1, fontSize: 15, marginEnd: 8 }),
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

        return h(RN.ScrollView, { contentContainerStyle: { padding: 16, paddingBottom: 32 } },
            paragraph('Send a message in a one-to-one DM to count today. Keep messaging daily to extend the streak. Days follow your phone’s local time.'),
            session?.error ? paragraph(session.error) : null,
            h(RN.View, { style: { ...panel, flexDirection: 'row' } },
                stat(stats.active.length, 'Active streaks'), stat(stats.best, 'Personal best'), stat(stats.total, 'Active days')),
            h(RN.View, { style: panel }, heading('Top DM streaks'),
                leaderboard.length ? leaderboard.map(({ id, record, days }, index) => {
                    const channel = session.stores.ChannelStore?.getChannel?.(id);
                    const recipientId = record.recipientId ?? getRecipient(channel ?? {});
                    const user = recipientId && session.stores.UserStore?.getUser?.(recipientId);
                    const name = user?.globalName ?? user?.global_name ?? user?.username ?? 'Direct message';
                    return h(RN.View, { key: id, style: { flexDirection: 'row', alignItems: 'center', minHeight: 35 } },
                        text(String(index + 1), { color: muted, width: 24 }),
                        text(name, { flex: 1, marginEnd: 8 }, { numberOfLines: 1 }),
                        text('🔥 ' + days, { color: streakColor(days, light), fontWeight: '700' }));
                }) : paragraph(!data && !session?.error ? 'Loading streaks…'
                    : signedIn ? 'No active streaks yet.' : 'Sign in to see your streaks.')),
            h(RN.View, { style: panel }, toggle('showBadges', 'Show badges in Messages'),
                toggle('milestoneToasts', 'Notify at 10, 50 and 100 days')),
            h(RN.Button, { title: 'Clear streak history', color: light ? '#A21D30' : '#F4697C',
                disabled: !records.length, onPress: clear }));
    }

    return { default: { jsonStorage: { default: defaults }, start, SettingsComponent } };
})()
