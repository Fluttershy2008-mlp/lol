(() => {
    // SPDX-License-Identifier: MIT
    "use strict";
    const HOUR = 60 * 60 * 1000;
    const DAY = HOUR * 24;
    const BADGE_KEY = 'dev.fluttershy2008.birthday-badge';
    const EDITOR_KEY = BADGE_KEY + '.editor';
    const EMPTY = { accounts: {} };
    const idPattern = /^\d{15,22}$/;

    let current;
    let revision = 0;
    let pendingWrite = Promise.resolve();
    const listeners = new Set();

    function publish() {
        revision++;
        for (const notify of listeners) notify();
    }

    function subscribe(notify) {
        listeners.add(notify);
        return () => listeners.delete(notify);
    }

    const snapshot = () => revision;
    const isCurrent = session => current === session;

    function validDate(month, day) {
        return Number.isInteger(month) && month >= 1 && month <= 12 &&
            Number.isInteger(day) && day >= 1 && day <= new Date(2000, month, 0).getDate();
    }

    function normalize(data) {
        const accounts = {};
        for (const [accountId, records] of Object.entries(data?.accounts ?? {})) {
            if (!idPattern.test(accountId)) continue;
            const dates = {};
            for (const [userId, date] of Object.entries(records ?? {})) {
                if (idPattern.test(userId) && validDate(date?.month, date?.day)) {
                    dates[userId] = { month: date.month, day: date.day };
                }
            }
            accounts[accountId] = dates;
        }
        return { accounts };
    }

    function birthdayIn(year, { month, day }) {
        // Observe February 29 on February 28 in common years.
        const dayInYear = Math.min(day, new Date(year, month, 0).getDate());
        return new Date(year, month - 1, dayInYear);
    }

    function countdown(date, now) {
        const local = new Date(now);
        const year = local.getFullYear();
        let birthday = birthdayIn(year, date);
        const end = new Date(year, birthday.getMonth(), birthday.getDate() + 1).getTime();
        if (birthday.getTime() <= now && now < end) {
            return { badge: 'Today', label: 'Birthday today', next: end };
        }
        if (end <= now) birthday = birthdayIn(year + 1, date);
        const remaining = birthday.getTime() - now;
        const hours = remaining <= DAY;
        const unit = hours ? HOUR : DAY;
        const count = Math.ceil(remaining / unit);
        const label = hours ? 'hour' : 'day';
        return {
            badge: count + (hours ? 'h' : 'd'),
            label: count + ' ' + label + (count === 1 ? '' : 's') + ' until birthday',
            next: birthday.getTime() - (count - 1) * unit,
        };
    }

    function dateLabel({ month, day }) {
        return new Date(2000, month - 1, day).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    }

    function currentAccount(session) {
        const id = session.stores.UserStore?.getCurrentUser()?.id;
        return typeof id === 'string' && idPattern.test(id) ? id : null;
    }

    function targetId(props) {
        const id = props?.user?.id ?? props?.userId ?? props?.displayProfile?.userId ??
            props?.profile?.userId ?? props?.userProfile?.userId;
        return typeof id === 'string' && idPattern.test(id) ? id : null;
    }

    function person(session, userId) {
        const user = session.stores.UserStore?.getUser?.(userId);
        return user?.globalName || user?.username || userId;
    }

    function saveDate(session, account, userId, date) {
        const write = pendingWrite.then(async () => {
            if (!isCurrent(session) || currentAccount(session) !== account || !session.data) {
                throw new Error('Reopen Birthday Badge to make changes.');
            }
            const records = { ...session.data.accounts[account] };
            if (date) records[userId] = date;
            else delete records[userId];
            const next = { accounts: { ...session.data.accounts, [account]: records } };
            await session.api.jsonStorage.set(next, true);
            if (!isCurrent(session)) return;
            session.data = next;
            publish();
        });
        pendingWrite = write.catch(() => {});
        return write;
    }

    function closeEditor(session, editor) {
        if (session.editor !== editor || !editor) return;
        session.editor = null;
        session.alerts.dismissAlert(EDITOR_KEY);
    }

    function openEditor(session, userId) {
        const account = currentAccount(session);
        if (!isCurrent(session) || !session.data || !account) return;
        if (typeof session.alerts?.openAlert !== 'function') return;
        const editor = { account, userId };
        session.editor = editor;
        session.alerts.openAlert(EDITOR_KEY, session.React.createElement(
            BirthdayEditor, { key: ++session.editorKey, session, editor },
        ));
    }

    function BirthdayEditor({ session, editor }) {
        const { React, RN, Design, stores } = session;
        const h = React.createElement;
        const [userInput, setUserInput] = React.useState(editor.userId ?? '');
        const userId = editor.userId ?? userInput.trim();
        const saved = idPattern.test(userId) ? session.data?.accounts?.[editor.account]?.[userId] : undefined;
        const [month, setMonth] = React.useState(saved ? String(saved.month) : '');
        const [day, setDay] = React.useState(saved ? String(saved.day) : '');
        const [busy, setBusy] = React.useState(false);
        const [error, setError] = React.useState('');
        const saving = React.useRef(false);
        const light = stores.ThemeStore?.theme === 'light';
        React.useSyncExternalStore(subscribe, snapshot, snapshot);
        if (!isCurrent(session) || currentAccount(session) !== editor.account || session.editor !== editor) return null;

        const field = (label, value, setValue, length, placeholder) => h(RN.View, { style: { flex: 1, minWidth: 0 } },
            h(Design.Text, { color: 'text-default', variant: 'text-sm/semibold' }, label),
            h(RN.TextInput, {
                accessibilityLabel: label, value, onChangeText: setValue, editable: !busy,
                placeholder, maxLength: length, keyboardType: 'number-pad',
                placeholderTextColor: light ? '#5A5D68' : '#A8AAB3',
                style: {
                    backgroundColor: light ? '#E7E9EF' : '#24252B',
                    color: light ? '#202127' : '#F2F3F5', fontSize: 16,
                    borderRadius: 8, paddingHorizontal: 10, minHeight: 44, marginTop: 4,
                },
            }));
        async function submit(remove) {
            if (saving.current || session.editor !== editor || !isCurrent(session)) return;
            if (!idPattern.test(userId)) return setError('Enter a valid Discord user ID.');
            const date = { month: Number(month), day: Number(day) };
            if (!remove && (!/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day) || !validDate(date.month, date.day))) {
                return setError('Enter a valid month and day.');
            }
            setError('');
            saving.current = true;
            setBusy(true);
            try {
                await saveDate(session, editor.account, userId, remove ? null : date);
                closeEditor(session, editor);
            } catch (error) {
                session.api.logger?.warn?.('Could not save a birthday', error);
                if (session.editor === editor) {
                    setError('Could not save the change. Try again.');
                    setBusy(false);
                }
            } finally {
                saving.current = false;
            }
        }

        return h(Design.AlertModal, {
            title: saved ? 'Edit birthday' : 'Set birthday',
            content: editor.userId
                ? h(Design.Text, { color: 'text-default' }, person(session, editor.userId))
                : null,
            extraContent: h(RN.View, { style: { gap: 10 } },
                editor.userId ? null : field('Discord user ID', userInput, setUserInput, 22, 'Paste user ID'),
                h(RN.View, { style: { flexDirection: 'row', gap: 8 } },
                    field('Month', month, setMonth, 2, '1–12'),
                    field('Day', day, setDay, 2, '1–31')),
                error ? h(Design.Text, { accessibilityLiveRegion: 'polite', color: 'text-feedback-critical' }, error) : null),
            actions: h(React.Fragment, null,
                h(Design.Button, { text: 'Save', variant: 'primary', loading: busy, disabled: busy, onPress: () => submit(false) }),
                saved ? h(Design.Button, { text: 'Remove birthday', variant: 'destructive', disabled: busy, onPress: () => submit(true) }) : null,
                h(Design.Button, { text: 'Cancel', variant: 'secondary', disabled: busy, onPress: () => closeEditor(session, editor) })),
        });
    }

    function CakeBadge({ session, userId, date }) {
        const { React, RN } = session;
        const h = React.createElement;
        const [, refresh] = React.useReducer(value => value + 1, 0);
        const { badge, label, next } = countdown(date, Date.now());
        React.useEffect(() => {
            const timer = setTimeout(refresh, Math.max(1, next - Date.now()));
            const appState = RN.AppState?.addEventListener('change', state => {
                if (state === 'active') refresh();
            });
            return () => {
                clearTimeout(timer);
                appState?.remove();
            };
        }, [next, RN]);

        return h(RN.Pressable, {
            accessibilityRole: 'button',
            accessibilityLabel: label + '. ' + dateLabel(date),
            accessibilityHint: 'Opens birthday settings',
            onPress: () => openEditor(session, userId),
            hitSlop: 4,
            style: { alignSelf: 'center', backgroundColor: '#713B64', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
        }, h(RN.Text, {
            numberOfLines: 1, maxFontSizeMultiplier: 1.4,
            style: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
        }, '🎂 ' + badge));
    }

    function ProfileBadgeRow({ session, original, userId }) {
        const { React, RN } = session;
        React.useSyncExternalStore(subscribe, snapshot, snapshot);
        const date = isCurrent(session) ? session.data?.accounts?.[session.account]?.[userId] : null;
        if (!date) return original;
        const h = React.createElement;
        return h(RN.View, {
            style: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 4, rowGap: 4, minWidth: 0, flexShrink: 1 },
        }, original, h(CakeBadge, { session, userId, date }));
    }

    function addMenuItem(React, tree, item) {
        if (Array.isArray(tree)) {
            for (let i = 0; i < tree.length; i++) {
                const child = addMenuItem(React, tree[i], item);
                if (child !== tree[i]) {
                    const next = tree.slice();
                    next[i] = child;
                    return next;
                }
            }
        }
        if (!React.isValidElement(tree)) return tree;
        const { items, children } = tree.props;
        if (Array.isArray(items)) {
            if (items.flat().some(entry => entry?.label === item.label)) return tree;
            const group = items.findIndex(Array.isArray);
            const next = group < 0 ? [...items, item] : items.map((entry, i) => i === group ? [...entry, item] : entry);
            return React.cloneElement(tree, { items: next });
        }
        const mapped = addMenuItem(React, children, item);
        return mapped === children ? tree : React.cloneElement(tree, { children: mapped });
    }

    function patchProfileMenu(session, module) {
        const { api, React } = session;
        let holder = module, method = 'default', classComponent = false;
        for (let i = 0; i < 5; i++) {
            const component = holder?.[method];
            if (component?.$$typeof === Symbol.for('react.memo')) {
                holder = component;
                method = 'type';
            } else if (component?.$$typeof === Symbol.for('react.forward_ref')) {
                holder = component;
                method = 'render';
            } else if (component?.prototype?.isReactComponent) {
                holder = component.prototype;
                method = 'render';
                classComponent = true;
                break;
            } else break;
        }
        if (typeof holder?.[method] !== 'function') return;
        api.cleanup(api.unscoped.patcher.instead(holder, method, function (args, original) {
            const tree = Reflect.apply(original, this, args);
            if (!isCurrent(session) || !session.data || !currentAccount(session)) return tree;
            const userId = targetId(classComponent ? this.props : args[0]);
            if (!userId) return tree;
            const hasDate = session.data.accounts[session.account]?.[userId];
            return addMenuItem(React, tree, {
                label: hasDate ? 'Edit birthday' : 'Set birthday',
                action: () => openEditor(session, userId),
            });
        }));
    }

    async function start(api) {
        const { react, discord, modules } = api.unscoped;
        const session = {
            api,
            React: react.React,
            RN: react.ReactNative,
            Design: discord.design.Design,
            alerts: discord.actions.AlertActionCreators,
            stores: discord.flux.Stores,
            editorKey: 0,
        };
        current = session;
        session.account = currentAccount(session);
        api.cleanup(() => {
            if (!isCurrent(session)) return;
            current = undefined;
            try { closeEditor(session, session.editor); }
            finally { publish(); }
        });

        const userStore = session.stores.UserStore;
        if (userStore?.addChangeListener) {
            const onUserChange = () => {
                const account = currentAccount(session);
                if (!isCurrent(session) || session.account === account) return;
                session.account = account;
                try { closeEditor(session, session.editor); }
                finally { publish(); }
            };
            userStore.addChangeListener(onUserChange);
            api.cleanup(() => userStore.removeChangeListener(onUserChange));
        }

        const finders = modules.finders;
        api.cleanup(finders.getModules(finders.filters.withProps('ProfileBadgeRows'), ({ ProfileBadgeRows }) => {
            if (!isCurrent(session) || !ProfileBadgeRows) return;
            // After JSX lets Valenced's own contributor badge hook compose with this one.
            api.cleanup(react.jsxRuntime.afterJSX(ProfileBadgeRows, original => {
                const id = targetId(original?.props);
                return id ? session.React.createElement(ProfileBadgeRow, { key: original.key, session, original, userId: id }) : original;
            }));
        }, { max: 1 }));

        const imported = discord.utils.modules.finders;
        for (const name of ['UserProfileOverflowMenu', 'BotUserProfileOverflowMenu']) {
            api.cleanup(imported.getModuleWithImportedPath('modules/user_profile/native/' + name + '.tsx', module => {
                if (!isCurrent(session)) return;
                try { patchProfileMenu(session, module); }
                catch (error) { api.logger?.warn?.('Could not add the birthday profile action', error); }
            }));
        }

        try {
            await pendingWrite;
            if (!isCurrent(session)) return;
            const stored = await api.jsonStorage.get();
            if (!isCurrent(session)) return;
            if (!stored || typeof stored !== 'object') throw new Error('Birthday storage could not be read.');
            session.data = normalize(stored);
        } catch (error) {
            api.logger?.warn?.('Could not load birthdays', error);
            session.storageError = true;
        }
        if (isCurrent(session)) publish();
    }

    function SettingsComponent({ api }) {
        const { React, ReactNative: RN } = api.unscoped.react;
        const { Design } = api.unscoped.discord.design;
        const h = React.createElement;
        React.useSyncExternalStore(subscribe, snapshot, snapshot);
        const session = current;
        const records = Object.entries(session?.data?.accounts?.[session.account] ?? {});
        const ready = Boolean(session?.data && session.account);
        return h(RN.ScrollView, { contentContainerStyle: { padding: 16, gap: 12 }, keyboardShouldPersistTaps: 'handled' },
            h(Design.Text, { color: 'text-default' }, 'Set a date from someone’s profile menu or add it by user ID. Birthdays are stored on this device.'),
            h(Design.Button, { text: 'Add birthday by user ID', variant: 'primary', disabled: !ready, onPress: () => openEditor(session) }),
            session?.storageError ? h(Design.Text, { color: 'text-feedback-critical' }, 'Saved birthdays could not be loaded. Reopen Discord to try again.') : null,
            ready && records.length ? h(Design.TableRowGroup, { title: 'Saved birthdays' },
                records.map(([userId, date]) => h(Design.TableRow, {
                    key: userId, label: person(session, userId), subLabel: dateLabel(date),
                    onPress: () => openEditor(session, userId),
                }))) : null,
        );
    }

    return { default: { jsonStorage: { default: EMPTY }, start, SettingsComponent } };
})();
