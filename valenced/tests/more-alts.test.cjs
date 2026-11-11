'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, ACCOUNT, FRIEND } = require('../../revenge-next/tests/next-harness.cjs');
const { installSettingsSection } = require('./settings-fixture.cjs');

const id = 'dev.fluttershy2008.more-alts';
const saved = { id: FRIEND, username: 'friend', displayName: 'Test Friend', token: 'fixture-session-token', updatedAt: 1234 };
const initial = () => ({ accounts: { [FRIEND]: saved }, accountOrder: [FRIEND], settings: { enableNativeSwitcher: false } });

function find(ui, type, key, value) {
    return ui.root.findAll(node => node.type === type && node.props[key] === value)[0];
}

async function openTab(ui, name) {
    const tab = find(ui, 'Pressable', 'accessibilityLabel', name);
    await Renderer.act(() => tab.props.onPress());
    assert.equal(find(ui, 'Pressable', 'accessibilityLabel', name).props.accessibilityState.selected, true);
}

function fixture(t, options = {}) {
    const w = createWorld(options), section = installSettingsSection(w), native = [], renderers = [];
    const callNative = w.U.modules.native.callNativeMethod;
    w.U.modules.native.callNativeMethod = async (method, args) => {
        if (!method.startsWith(`${id}.`)) return callNative(method, args);
        native.push([method.slice(id.length + 1), args]);
        if (method.endsWith('loadAccounts')) return JSON.stringify(options.vault ?? []);
        return options.handleNative?.(method.slice(id.length + 1), args) ?? true;
    };
    w.mount = async Component => {
        let ui;
        await Renderer.act(async () => { ui = Renderer.create(React.createElement(Component)); });
        renderers.push(ui);
        return ui;
    };
    w.open = async (storage = initial()) => {
        const item = await w.start('more-alts', storage);
        const key = `${id}.valenced-settings`;
        assert.ok(section.section.settings.includes(key));
        const route = w.registeredScreens.get(key);
        assert.equal(route.useTitle(), 'More Alts!');
        const ui = await w.mount(route.screen.getComponent());
        return { ui, item };
    };
    w.sheet = async key => {
        const entry = w.openedSheets.at(-1);
        assert.equal(entry.key, key);
        return w.mount((await entry.promise).default);
    };
    t.after(async () => {
        for (const ui of renderers.reverse()) await Renderer.act(() => ui.unmount());
        for (const item of [...w.loaded.values()]) await w.stop(item);
        assert.deepEqual(section.section.settings, section.core);
        assert.equal(w.registeredScreens.size, 0);
        assert.equal(w.stores.UserStore.listeners.size, 0);
        assert.deepEqual(w.errors, []);
    });
    return { w, native };
}

function installInboxStorage(w, summaries = {}) {
    const listeners = new Set();
    const file = {
        cache: { summaries },
        async get() { return this.cache; },
        async set(data, replace) {
            assert.equal(replace, true);
            this.cache = structuredClone(data);
            for (const listener of listeners) listener();
        },
        use() {
            return React.useSyncExternalStore(listener => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            }, () => this.cache);
        },
    };
    w.U.jsonStorage = {
        pluginStoragePathFor: (pluginId, name) => `${pluginId}/${name}`,
        getJsonStorage(path) {
            assert.equal(path, `${id}/inbox.json`);
            return file;
        },
    };
    return file;
}

test('More Alts opens account actions and keeps preferences on their own tab', async t => {
    const { w, native } = fixture(t);
    const { ui, item } = await w.open();
    assert.equal(item.manifest.dist.android.class, 'rosie.morealts.MoreAltsPlugin');
    assert.equal(item.api.jsonStorage.cache.accounts[FRIEND].addedAt, 1234);
    assert.equal(item.api.jsonStorage.cache.accounts[FRIEND].token, saved.token);
    assert.equal(item.api.jsonStorage.cache.enableNativeSwitcher, false);
    assert.equal(item.api.jsonStorage.cache.settings, undefined);
    assert.ok(native.some(([name]) => name === 'loadAccounts'));
    assert.ok(find(ui, 'Text', 'children', 'Other accounts'));
    assert.equal(find(ui, 'TableRowGroup', 'title', 'Switching'), undefined);
    await openTab(ui, 'Preferences');
    assert.ok(find(ui, 'TableRowGroup', 'title', 'Switching'));
    assert.ok(find(ui, 'TableRowGroup', 'title', 'Storage & backup'));
    assert.equal(find(ui, 'TableRow', 'label', 'Export Accounts'), undefined);
    await Renderer.act(() => find(ui, 'TableSwitchRow', 'label', 'Enable Account Export').props.onValueChange(true));
    assert.ok(find(ui, 'TableRow', 'label', 'Export Accounts'));

    await openTab(ui, 'Accounts');
    await Renderer.act(() => find(ui, 'Pressable', 'accessibilityLabel', 'Switch account').props.onPress());
    const switcher = await w.sheet('more-alts-quick-switcher');
    await Renderer.act(() => find(switcher, 'Button', 'text', 'Add account').props.onPress());
    const add = await w.sheet('more-alts-add-account');
    await Renderer.act(async () => find(add, 'TableRow', 'label', 'Save Currently Logged-in Account').props.onPress());
    assert.ok(item.api.jsonStorage.cache.accounts[ACCOUNT]);
    assert.equal(item.api.jsonStorage.cache.accounts[FRIEND].token, saved.token);
    assert.ok(native.some(([name, args]) => name === 'saveAccounts' && JSON.parse(args[0]).some(account => account.id === ACCOUNT)));
});

test('native account switching uses the account ID and vault preferences stop local copies', async t => {
    const { w, native } = fixture(t);
    const switches = [];
    w.stores.MultiAccountStore = { getUsers: () => ({ [FRIEND]: { ...w.users[FRIEND], pushSyncToken: 'fixture-push-value' } }) };
    w.modules.push({ switchAccount(userId) { switches.push(userId); w.setAccount(userId); } });
    const { ui, item } = await w.open();
    const row = find(ui, 'Pressable', 'accessibilityLabel', 'Test Friend, @friend, Account actions');
    await Renderer.act(() => row.props.onPress());
    await Renderer.act(async () => w.alerts.at(-1)[2][0].onPress());
    assert.deepEqual(switches, [FRIEND]);
    assert.equal(w.accountId(), FRIEND);
    assert.ok(native.some(([name, args]) => name === 'setActiveUser' && args[0] === FRIEND));
    assert.equal(find(ui, 'Text', 'children', 'Test Friend').props.style.color, '#fff6fc');
    assert.equal(find(ui, 'Pressable', 'accessibilityLabel', 'Test Friend, @friend, Account actions'), undefined);
    await openTab(ui, 'Preferences');
    await Renderer.act(() => find(ui, 'TableSwitchRow', 'label', 'Persistent Storage Vault').props.onValueChange(false));
    assert.equal(item.api.jsonStorage.cache.persistentStorageVault, false);
    assert.equal(item.api.jsonStorage.cache.accounts[FRIEND].token, saved.token);
    assert.ok(native.filter(([name]) => name === 'setActiveUser').every(([, args]) => [ACCOUNT, FRIEND].includes(args[0])));
    const writes = native.filter(([name]) => name === 'saveAccounts').length;
    w.stores.AuthenticationStore.getToken = () => 'fixture-renewed-session';
    await openTab(ui, 'Accounts');
    await Renderer.act(() => find(ui, 'Pressable', 'accessibilityLabel', 'Add account').props.onPress());
    const add = await w.sheet('more-alts-add-account');
    await Renderer.act(async () => find(add, 'TableRow', 'label', 'Save Currently Logged-in Account').props.onPress());
    assert.equal(item.api.jsonStorage.cache.accounts[FRIEND].token, 'fixture-renewed-session');
    assert.equal(native.filter(([name]) => name === 'saveAccounts').length, writes);
});

test('account names use Discord’s theme text color in the dashboard and switcher', async t => {
    const { w } = fixture(t);
    w.RN.useColorScheme = () => 'light';
    w.U.discord.common.tokens = { Tokens: { default: { colors: { TEXT_DEFAULT: '#4b3046', BACKGROUND_SURFACE_HIGHEST: '#fff7fb' } } } };
    const { ui } = await w.open();
    assert.equal(find(ui, 'Text', 'children', 'Test Friend').props.style.color, '#4b3046');
    assert.equal(find(ui, 'Text', 'children', 'Test Owner').props.style.color, '#fff6fc');
    await Renderer.act(() => find(ui, 'Pressable', 'accessibilityLabel', 'Switch account').props.onPress());
    const switcher = await w.sheet('more-alts-quick-switcher');
    assert.equal(find(switcher, 'Text', 'children', 'Test Friend').props.style.color, '#4b3046');
});

test('Other account push uses Discord registration and clears the profile dot when its account becomes active', async t => {
    let recipients = [], registrations = 0;
    const pending = new Set();
    const { w, native } = fixture(t, {
        handleNative(method, args) {
            if (method === 'configureOtherAccountPush') {
                recipients = JSON.parse(args[0]);
                for (const account of pending) if (!recipients.includes(account)) pending.delete(account);
            }
            if (method === 'hasOtherAccountPush') return pending.size > 0;
        },
    });
    const accountStore = {
        getValidUsers: () => [{ id: ACCOUNT }, { id: FRIEND }],
        getUsers: () => [],
    };
    w.addModule({ default: accountStore }, 'modules/multi_account/MultiAccountStore.tsx');
    w.addModule({ default: {
        canSync: true,
        registerToken() { registrations++; },
    } }, 'modules/notifications/native/NotificationTokenManager.tsx');
    const avatar = React.memo(() => React.createElement('View', { testID: 'discord-avatar' }));
    const originalAvatar = avatar.type;
    w.addModule({ default: avatar }, 'modules/main_tabs_v2/native/you_bar/YouBarAvatar.tsx');
    const { ui, item } = await w.open({ ...initial(), settings: { enableNativeSwitcher: true } });
    const profile = await w.mount(avatar);
    assert.ok(find(profile, 'View', 'testID', 'discord-avatar'));
    const dot = () => find(profile, 'View', 'accessibilityLabel', 'New notifications on another account');
    assert.equal(dot(), undefined);
    assert.equal(registrations, 0);
    await openTab(ui, 'Preferences');
    const pushSwitch = () => find(ui, 'TableSwitchRow', 'label', 'Other Account Push Notifications');
    assert.equal(pushSwitch().props.value, false);
    await Renderer.act(() => pushSwitch().props.onValueChange(true));
    assert.equal(accountStore.canUseMultiAccountNotifications, true);
    assert.equal(registrations, 1);
    assert.deepEqual(recipients, [FRIEND]);
    assert.ok(native.some(([method, args]) => method === 'setBlockNotifications' && args[0] === false));

    pending.add(FRIEND);
    await Renderer.act(() => w.advance(3000));
    assert.equal(dot().props.pointerEvents, 'none');
    await Renderer.act(() => w.setAccount(FRIEND));
    assert.equal(dot(), undefined);
    assert.deepEqual(recipients, [ACCOUNT]);

    await Renderer.act(() => pushSwitch().props.onValueChange(false));
    assert.equal(registrations, 2);
    assert.equal(accountStore.canUseMultiAccountNotifications, false);
    assert.deepEqual(recipients, []);
    await Renderer.act(() => w.stop(item));
    assert.equal(avatar.type, originalAvatar);
    assert.equal(accountStore.canUseMultiAccountNotifications, undefined);
    assert.equal(w.appListeners.size, 0);
});

for (const source of ['mobile store name', 'mobile module path', 'legacy store name']) test(`Shared inbox uses the ${source} to save each added account’s connected session`, async t => {
    const { w } = fixture(t);
    const gateway = w.stores.ConnectionStore;
    let connected = true;
    gateway.isConnected = () => connected;
    if (source !== 'legacy store name') {
        delete w.stores.ConnectionStore;
        if (source === 'mobile store name') w.stores.GatewayConnectionStore = gateway;
        else w.U.discord.utils.modules.finders.lookupModuleWithImportedPath = path =>
            path === 'modules/gateway/GatewayConnectionStore.tsx' ? [{ default: gateway }, 1] : [];
    }
    const dm = '550000000000000001', group = '550000000000000002';
    const file = installInboxStorage(w);
    let unread = new Set([dm, group]), mentions = 5;
    w.stores.ChannelStore.getMutablePrivateChannels = () => new Map([
        ['dm', { id: dm, type: 1 }], ['duplicate', { channel: { id: dm, type: 1 } }], ['group', { id: group, type: 3 }],
    ]);
    w.stores.ReadStateStore.hasUnread = channelId => unread.has(channelId);
    w.stores.GuildReadStateStore = { getTotalMentionCount: () => mentions };
    const owner = { id: ACCOUNT, username: 'test-owner', displayName: 'Test Owner', token: 'owner-session' };
    const { ui, item } = await w.open({ accounts: { [ACCOUNT]: owner, [FRIEND]: saved }, accountOrder: [ACCOUNT, FRIEND] });
    assert.equal(find(ui, 'Text', 'children', 'Preferences').props.numberOfLines, 1);
    await openTab(ui, 'Inbox');
    await Renderer.act(async () => { await w.advance(1000); });
    assert.deepEqual(file.cache.summaries, {});
    const optIn = find(ui, 'TableSwitchRow', 'label', 'Save inbox summaries');
    assert.equal(optIn.props.value, false);
    await Renderer.act(() => optIn.props.onValueChange(true));
    await Renderer.act(async () => { await w.advance(1000); });
    const first = file.cache.summaries[ACCOUNT];
    assert.equal(first.unreadDms, 2);
    assert.equal(first.mentions, 5);
    assert.equal(file.cache.summaries[FRIEND], undefined);
    assert.match(find(ui, 'TableRow', 'label', 'Test Owner · Active').props.subLabel, /2 unread DM chats · 5 server mentions/);
    const refresh = () => Renderer.act(() => find(ui, 'TableRow', 'label', 'Refresh active account').props.onPress());
    await refresh();
    assert.ok(find(ui, 'Text', 'children', 'Inbox summary updated.'));
    const ownerSummary = file.cache.summaries[ACCOUNT];

    // A user change alone can precede replacement of Discord's old read states.
    await Renderer.act(async () => { w.setAccount(FRIEND); w.stores.ReadStateStore.emitChange(); await w.advance(1000); });
    assert.equal(file.cache.summaries[FRIEND], undefined);
    await refresh();
    assert.ok(find(ui, 'Text', 'children', 'Waiting for this account to finish switching.'));
    unread = new Set([group]); mentions = 1;
    await Renderer.act(async () => { await w.dispatcher.dispatch({ type: 'CONNECTION_OPEN' }); await w.advance(1000); });
    assert.equal(file.cache.summaries[FRIEND].unreadDms, 1);
    assert.equal(file.cache.summaries[FRIEND].mentions, 1);
    assert.deepEqual(file.cache.summaries[ACCOUNT], ownerSummary);
    assert.match(find(ui, 'TableRow', 'label', 'Test Owner').props.subLabel, /Checked/);
    assert.deepEqual(Object.keys(file.cache.summaries[FRIEND]).sort(), ['checkedAt', 'mentions', 'unreadDms']);
    assert.equal(item.api.jsonStorage.cache.accounts[FRIEND].token, saved.token);
    assert.equal(w.calls.some(([kind]) => kind === 'http' || kind === 'fetch'), false);

    unread = new Set(); mentions = 0;
    connected = false;
    await Renderer.act(() => w.dispatcher.dispatch({ type: 'CONNECTION_CLOSED' }));
    await refresh();
    assert.ok(find(ui, 'Text', 'children', 'Waiting for Discord to reconnect.'));
    assert.equal(file.cache.summaries[FRIEND].unreadDms, 1);
    connected = true;
    await Renderer.act(() => w.dispatcher.dispatch({ type: 'CONNECTION_RESUMED' }));
    await Renderer.act(async () => { w.stores.ReadStateStore.emitChange(); await w.advance(1000); });
    assert.equal(file.cache.summaries[FRIEND].unreadDms, 0);
    assert.equal(file.cache.summaries[FRIEND].mentions, 0);
    assert.equal(find(ui, 'Text', 'children', 'Waiting for Discord to reconnect.'), undefined);
    await Renderer.act(() => find(ui, 'TableSwitchRow', 'label', 'Save inbox summaries').props.onValueChange(false));
    assert.deepEqual(file.cache.summaries, {});
    assert.equal(w.timers.size, 0);
    assert.equal(w.alerts.length, 0);
});


function openableInbox(t, summaries) {
    const { w } = fixture(t);
    const routes = [], order = [];
    installInboxStorage(w, summaries);
    w.addModule({
        transitionToGuild(guildId, channelId, messageId, options) {
            assert.equal(options.openChannel, true);
            assert.equal(options.navigationReplace, true);
            routes.push([w.accountId(), guildId, channelId, messageId]);
            order.push('navigate');
        },
    }, 'modules/routing/router_utils.tsx');
    w.addModule({ default: { popAll() { order.push('close settings'); } } }, 'actions/ModalActionCreators.tsx');
    const owner = { id: ACCOUNT, username: 'test-owner', displayName: 'Test Owner', token: 'owner-session' };
    const open = async () => {
        const result = await w.open({
            accounts: { [ACCOUNT]: owner, [FRIEND]: saved },
            accountOrder: [ACCOUNT, FRIEND],
            sharedInboxEnabled: true,
        });
        await openTab(result.ui, 'Inbox');
        return result;
    };
    return { w, open, routes, order };
}

test('an inactive inbox account opens its newest unread DM only after the correct session connects', async t => {
    const { w, open, routes, order } = openableInbox(t, {
        [FRIEND]: { checkedAt: 1234, unreadDms: 2, mentions: 0 },
    });
    const oldDm = '550000000000000001', firstDm = '550000000000000002', nextDm = '550000000000000003';
    const firstMessage = '780000000000000008', newestMessage = '780000000000000009';
    let loaded = false;
    w.stores.ChannelStore.getMutablePrivateChannels = () => loaded
        ? [{ id: firstDm, type: 1 }, { id: nextDm, type: 3 }]
        : [{ id: oldDm, type: 1 }];
    w.stores.ReadStateStore.hasUnread = () => true;
    w.stores.ReadStateStore.lastMessageId = id => id === firstDm ? firstMessage : newestMessage;
    w.modules.find(module => typeof module.switchAccountToken === 'function').switchAccountToken = token => {
        assert.equal(token, saved.token);
        w.setAccount(FRIEND);
    };
    const { ui } = await open();
    let press;
    await Renderer.act(async () => {
        press = find(ui, 'TableRow', 'label', 'Test Friend').props.onPress();
    });
    assert.equal(w.accountId(), FRIEND);
    assert.ok(find(ui, 'Text', 'children', 'Opening inbox…'));
    assert.deepEqual(routes, []);
    await Renderer.act(() => w.dispatcher.dispatch({ type: 'CONNECTION_OPEN', user: { id: ACCOUNT } }));
    assert.deepEqual(routes, []);
    loaded = true;
    await Renderer.act(async () => {
        await w.dispatcher.dispatch({ type: 'POST_CONNECTION_OPEN', user: { id: FRIEND } });
        await press;
    });
    assert.deepEqual(routes, [[FRIEND, '@me', nextDm, newestMessage]]);
    assert.deepEqual(order, ['close settings', 'navigate']);
    assert.equal(w.alerts.length, 0);
});

test('inbox server mentions open the exact unread message or its channel if the message is unavailable', async t => {
    const { w, open, routes, order } = openableInbox(t, {
        [ACCOUNT]: { checkedAt: 1234, unreadDms: 1, mentions: 2 },
    });
    const guildId = '410000000000000001', channelId = '550000000000000010';
    const old = '780000000000000014', ack = '780000000000000015', exact = '780000000000000016';
    let response = [{ channel_id: channelId, id: old }, { channel_id: channelId, id: exact }];
    const requests = [];
    w.stores.ChannelStore.getChannel = id => id === channelId ? { id, guild_id: guildId, type: 0 } : undefined;
    w.stores.ReadStateStore.getAllReadStates = () => [{ channelId, type: 0 }];
    w.stores.ReadStateStore.getMentionCount = id => id === channelId ? 2 : 0;
    w.stores.ReadStateStore.ackMessageId = () => ack;
    w.addModule({ HTTP: { async get(request) {
        requests.push([w.accountId(), request.url]);
        return { body: response };
    } } }, '../discord_common/js/packages/http-utils/HTTPUtils.tsx');
    const { ui } = await open();
    const click = () => find(ui, 'TableRow', 'accessibilityLabel', 'Open server mentions for Test Owner').props.onPress();
    await Renderer.act(click);
    assert.deepEqual(routes, [[ACCOUNT, guildId, channelId, exact]]);
    response = [];
    await Renderer.act(click);
    assert.deepEqual(routes.at(-1), [ACCOUNT, guildId, channelId, undefined]);
    assert.deepEqual(requests, [[ACCOUNT, '/users/@me/mentions'], [ACCOUNT, '/users/@me/mentions']]);
    w.stores.ReadStateStore.getAllReadStates = () => [];
    w.stores.GuildReadStateStore = { getTotalMentionCount: () => 2 };
    w.addModule({ setTab(tab) { order.push(tab); } }, 'modules/notification_center/NotificationCenterStoreActions.tsx');
    w.addModule({ navigateToRootTab({ screen }) { order.push(screen); } }, 'modules/main_tabs_v2/helpers/NavigationRouteUtils.native.tsx');
    await Renderer.act(click);
    assert.deepEqual(order.slice(-3), ['close settings', 'Mentions', 'notifications']);
    assert.equal(w.alerts.length, 0);
});

test('an inbox tap that times out cannot open a conversation later', async t => {
    const { w, open, routes } = openableInbox(t, {});
    let connected = false;
    w.stores.ConnectionStore.isConnected = () => connected;
    const dm = '550000000000000013';
    w.stores.ChannelStore.getMutablePrivateChannels = () => [{ id: dm, type: 1 }];
    w.stores.ReadStateStore.hasUnread = () => true;
    const { ui } = await open();
    let press;
    await Renderer.act(async () => {
        press = find(ui, 'TableRow', 'label', 'Test Owner · Active').props.onPress();
        await w.advance(15000);
        await press;
    });
    assert.match(w.alerts.at(-1)[1], /still connecting/);
    connected = true;
    await Renderer.act(() => w.dispatcher.dispatch({ type: 'CONNECTION_OPEN', user: { id: ACCOUNT } }));
    assert.deepEqual(routes, []);
});

test('inbox review keeps same-channel mentions queued and advances through DMs and accounts from chat', async t => {
    const { w, open, routes } = openableInbox(t, {});
    const guildId = '410000000000000021', mentionChannel = '550000000000000021';
    const ownerDm = '550000000000000022', friendDm = '550000000000000023';
    const newestMention = '780000000000000054', nextMention = '780000000000000053';
    const ownerMessage = '780000000000000052', friendMessage = '780000000000000051';
    const unread = new Set([ownerDm, friendDm]);
    let mentions = 2, keyboardVisible = false;
    const keyboardListeners = new Map();
    w.RN.Keyboard.isVisible = () => keyboardVisible;
    w.RN.Keyboard.addListener = (event, callback) => {
        keyboardListeners.set(event, callback);
        return { remove: () => keyboardListeners.delete(event) };
    };
    const setKeyboard = visible => {
        keyboardVisible = visible;
        keyboardListeners.get(visible ? 'keyboardDidShow' : 'keyboardDidHide')();
    };
    w.stores.ChannelStore.getMutablePrivateChannels = () => [{ id: w.accountId() === ACCOUNT ? ownerDm : friendDm, type: 1 }];
    w.stores.ChannelStore.getChannel = id => id === mentionChannel ? { id, guild_id: guildId } : undefined;
    w.stores.ReadStateStore.getAllReadStates = () => w.accountId() === ACCOUNT ? [{ channelId: mentionChannel, type: 0 }] : [];
    w.stores.ReadStateStore.getMentionCount = id => id === mentionChannel && w.accountId() === ACCOUNT ? mentions : 0;
    w.stores.ReadStateStore.hasUnread = id => unread.has(id);
    w.stores.ReadStateStore.lastMessageId = id => id === ownerDm ? ownerMessage : friendMessage;
    w.stores.RecentMentionsStore = { getMentions: () => [
        { id: newestMention, channel_id: mentionChannel }, { id: nextMention, channel_id: mentionChannel },
    ] };
    w.stores.SelectedChannelStore.getCurrentlySelectedChannelId = () => routes.at(-1)?.[2];
    const switchCalls = [];
    w.modules.find(module => typeof module.switchAccountToken === 'function').switchAccountToken = async token => {
        switchCalls.push(token);
        w.setAccount(FRIEND);
        await w.dispatcher.dispatch({ type: 'POST_CONNECTION_OPEN', user: { id: FRIEND } });
    };
    const Chat = React.memo(({ channelId }) => React.createElement('View', null, React.createElement('Text', null, channelId)));
    const original = Chat.type;
    w.addModule({ default: Chat }, 'modules/chat/native/ChatView.tsx');
    const { ui, item } = await open();
    await Renderer.act(() => find(ui, 'TableRow', 'label', 'Review unread across accounts').props.onPress());
    assert.deepEqual(routes, [[ACCOUNT, guildId, mentionChannel, newestMention]]);
    const chatElement = (channelId, isActive = true) => React.createElement(Chat, { channelId, isActive });
    const chat = await w.mount(() => chatElement(mentionChannel));
    const press = name => find(chat, 'Pressable', 'accessibilityLabel', `${name} inbox review`).props.onPress();
    await Renderer.act(async () => { await w.advance(9000); });
    assert.equal(routes.length, 1);

    await Renderer.act(async () => {
        press('Pause');
        mentions = 0;
        w.stores.ReadStateStore.emitChange();
        await w.advance(9000);
    });
    assert.equal(routes.length, 1);
    await Renderer.act(async () => {
        setKeyboard(true);
        press('Resume');
        await w.advance(9000);
    });
    assert.equal(routes.length, 1);
    await Renderer.act(async () => {
        setKeyboard(false);
        await w.advance(8000);
    });
    assert.deepEqual(routes.at(-1), [ACCOUNT, guildId, mentionChannel, nextMention]);
    await Renderer.act(() => press('Next'));
    assert.deepEqual(routes.at(-1), [ACCOUNT, '@me', ownerDm, ownerMessage]);

    await Renderer.act(() => chat.update(chatElement(ownerDm, false)));
    await Renderer.act(async () => {
        unread.delete(ownerDm);
        w.stores.ReadStateStore.emitChange();
        await w.advance(9000);
    });
    assert.equal(routes.length, 3);
    await Renderer.act(() => chat.update(chatElement(ownerDm)));
    await Renderer.act(async () => {
        for (const callback of w.appListeners) callback('background');
        await w.advance(9000);
    });
    assert.equal(routes.length, 3);
    await Renderer.act(async () => {
        for (const callback of w.appListeners) callback('active');
        await w.advance(8000);
    });
    assert.deepEqual(routes.at(-1), [FRIEND, '@me', friendDm, friendMessage]);
    assert.deepEqual(switchCalls, [saved.token]);
    await Renderer.act(() => chat.update(chatElement(friendDm)));
    await Renderer.act(async () => {
        unread.delete(friendDm);
        w.stores.ReadStateStore.emitChange();
        await w.advance(8000);
    });
    assert.equal(w.toasts.at(-1), 'Inbox review complete.');
    assert.equal(routes.length, 4);
    assert.equal(find(chat, 'Pressable', 'accessibilityLabel', 'Next inbox review'), undefined);
    await Renderer.act(() => w.stop(item));
    assert.equal(Chat.type, original);
    assert.equal(keyboardListeners.size, 0);
    assert.equal(w.appListeners.size, 0);
});

test('stopping an inbox review cancels the pending advance', async t => {
    const { w, open, routes } = openableInbox(t, {});
    const dm = '550000000000000024';
    let unread = true;
    w.stores.ChannelStore.getMutablePrivateChannels = () => [{ id: dm, type: 1 }];
    w.stores.ReadStateStore.hasUnread = () => unread;
    w.stores.SelectedChannelStore.getCurrentlySelectedChannelId = () => dm;
    const Chat = React.memo(() => React.createElement('View', null));
    w.addModule({ default: Chat }, 'modules/chat/native/ChatView.tsx');
    const { ui } = await open();
    await Renderer.act(() => find(ui, 'TableRow', 'label', 'Review unread across accounts').props.onPress());
    const chat = await w.mount(() => React.createElement(Chat, { channelId: dm }));
    await Renderer.act(() => {
        unread = false;
        w.stores.ReadStateStore.emitChange();
    });
    assert.ok(find(chat, 'Text', 'children', 'Next in 8 seconds'));
    await Renderer.act(async () => {
        find(chat, 'Pressable', 'accessibilityLabel', 'Stop inbox review').props.onPress();
        await w.advance(9000);
    });
    assert.equal(routes.length, 1);
    assert.equal(find(chat, 'Pressable', 'accessibilityLabel', 'Stop inbox review'), undefined);
    assert.equal(w.calls.some(call => call[0] === 'switchAccount'), false);
    assert.equal(w.timers.size, 0);
});
