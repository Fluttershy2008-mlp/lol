'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLegacyAdapter } = require('../runtime.cjs');
const { createWorld, React, Renderer, ACCOUNT, FRIEND, BLOCKED, IGNORED, CHANNEL, GUILD } = require('./next-harness.cjs');
const { installNavigationHost } = require('./navigation-fixture.cjs');
const h = React.createElement;

function text(node) {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(text).join('');
    return node?.children ? text(node.children) : '';
}
function button(renderer, label) {
    const found = renderer.root.findAll(n => typeof n.type === 'string' && typeof n.props.onPress === 'function' &&
        [n.props.accessibilityLabel, n.props.label, n.props.title, n.props.text, text(n)].includes(label));
    assert.ok(found.length, 'button exists: ' + label);
    assert.notEqual(found[0].props.disabled, true, 'button enabled: ' + label);
    return found[0];
}
async function press(renderer, label) { await Renderer.act(async () => { await button(renderer, label).props.onPress(); }); }
async function change(renderer, label, value) {
    const field = renderer.root.findAll(n => n.type === 'TextInput' && [n.props.accessibilityLabel, n.props.placeholder].includes(label))[0];
    assert.ok(field, 'field exists: ' + label);
    await Renderer.act(async () => field.props.onChangeText(value));
}
function command(world, name) {
    const found = world.commands.getBuiltInCommands(1).find(c => c.name === name);
    assert.ok(found, 'command is available before opening settings: /' + name); return found;
}
function scenario(t, options = {}) {
    const world = createWorld(options), renderers = [];
    t.after(async () => {
        for (const renderer of renderers.reverse()) await Renderer.act(async () => renderer.unmount());
        for (const item of [...world.loaded.values()].reverse()) await world.stop(item);
        assert.equal(world.timers.size, 0, 'all timers were released');
        assert.equal(world.registeredScreens.size, 0, 'temporary native routes were released');
        assert.deepEqual(world.errors, [], 'no unexpected plugin error');
    });
    world.mount = async element => {
        let renderer; await Renderer.act(async () => { renderer = Renderer.create(element); });
        renderers.push(renderer); return renderer;
    };
    world.settings = item => world.mount(h(item.options.SettingsComponent, { api: item.api }));
    world.tick = ms => Renderer.act(() => world.advance(ms));
    world.menu = async (name, props = {}) => {
        const Row = world.U.discord.design.Design.ActionSheetRow;
        function Sheet() { return h(world.RN.View, null, [h(Row, { key: 'original', label: 'Original item', onPress() {} })]); }
        const module = await world.sheets.openLazy(Promise.resolve({ default: Sheet }), name, props);
        return world.mount(h(module.default, props));
    };
    world.picker = async () => {
        const panel = world.alerts.at(-1);
        if (panel && /Picker\.panel\./.test(panel[0])) return world.mount(panel[1]);
        const module = await world.openedSheets.at(-1).promise; return world.mount(h(module.default, world.openedSheets.at(-1).context));
    };
    return world;
}

test('Addon List copies native installed metadata without posting it', async t => {
    const w = scenario(t), item = await w.start('addon-list'); await w.start('view-icons');
    await command(w, 'plugin-list').execute([{ name: 'copy', value: true }, { name: 'detailed', value: true }], { channel: { id: CHANNEL } });
    assert.match(w.clipboard[0], (process.env.PLUGIN_TEST_TARGET === 'valenced' ? /ViewIcons.*Valenced/ : /ViewIcons.*Next preview/));
    assert.match(w.clipboard[0], /Installed/);
    assert.equal(w.calls.some(c => c[0] === 'sendMessage'), false);
    assert.equal(item.writes.length, 0, 'read-only listing does not change settings');
});

test('AutoText saves a phrase, expands it in the practice editor and copies the draft', async t => {
    const w = scenario(t), item = await w.start('auto-text'), ui = await w.settings(item);
    await press(ui, '+ Add phrase'); await change(ui, 'Shortcut', ';next');
    await change(ui, 'Phrase text — bullet points are supported', 'Hello from Next'); await press(ui, 'Save phrase');
    await change(ui, 'Practice draft', ';next'); await change(ui, 'Practice draft', ';next ');
    await press(ui, 'Copy draft'); assert.match(w.clipboard[0], /Hello from Next/);
    assert.ok(item.writes.at(-1).phrases.some(p => p.shortcut === ';next'));
});

test('Blocked User List shows a real blocked user and confirms before unblocking', async t => {
    const w = scenario(t), item = await w.start('blocked-user-list'), ui = await w.settings(item);
    assert.match(text(ui.toJSON()), /Blocked User/);
    await press(ui, 'Profile');
    assert.equal(w.calls.find(c => c[0] === 'showProfileSheet')?.[1].userId, BLOCKED);
    assert.equal(w.relationships[BLOCKED], 2);
    await press(ui, 'Unblock'); assert.equal(w.calls.some(c => c[0] === 'unblock'), false);
    await Renderer.act(async () => { w.alerts.at(-1)[2].find(b => b.text === 'Unblock').onPress(); });
    assert.equal(w.calls.find(c => c[0] === 'unblock')?.[1], BLOCKED);
});

test('Copy User ID extends a lazy Next menu using curated modules', async t => {
    const w = scenario(t, { curatedOnly: true }); await w.start('copy-user-id');
    const ui = await w.menu('MessageLongPressActionSheet', { message: { id: '900000000000000001', author: { id: FRIEND } } });
    await press(ui, 'Copy user ID ' + FRIEND); assert.deepEqual(w.clipboard, ['<@' + FRIEND + '>']);
});

test('CustomRPC applies an edited activity through the native dispatcher', async t => {
    const w = scenario(t), item = await w.start('custom-rpc'), ui = await w.settings(item);
    await change(ui, 'Application name', 'Testing Next'); await press(ui, 'Save & apply');
    const event = w.calls.find(c => c[0] === 'dispatch' && c[1].type === 'LOCAL_ACTIVITY_UPDATE')?.[1];
    assert.equal(event?.activity?.name, 'Testing Next');
    await press(ui, 'Stop activity');
    assert.ok(w.calls.some(c => c[0] === 'dispatch' && c[1].type === 'LOCAL_ACTIVITY_UPDATE' && c[1].activity === null));
});

test('ExpressionCloner opens and renders its sticker server picker on Next', async t => {
    const w = scenario(t, { curatedOnly: true }); await w.start('expression-cloner');
    const ui = await w.menu('MessageLongPressActionSheet', { message: { stickerItems: [{ id: '800000000000000001', name: 'pony', format_type: 1 }] } });
    await press(ui, 'Clone Sticker');
    assert.equal(w.openedSheets.at(-1).key, 'ExpressionClonerServerPicker');
    const picker = await w.picker(); assert.ok(button(picker, 'Test Guild'));
    assert.equal(picker.root.findAll(n => n.type === 'TableRow' && n.props.label === 'Test Guild')[0].props.icon != null, true);
});

test('Friends List opens a cached profile and supports searching', async t => {
    const w = scenario(t), item = await w.start('friends-list'), ui = await w.settings(item);
    await press(ui, 'Open Test Friend’s profile');
    assert.equal(w.calls.find(c => c[0] === 'showProfileSheet')?.[1].userId, FRIEND);
    await change(ui, 'Search friends by name, username or user ID', 'no-such-friend');
    assert.equal(ui.root.findAll(n => n.type === 'Pressable' && n.props.accessibilityLabel === 'Open Test Friend’s profile').length, 0);
});

test('Hide Blocked and Ignored filters a view without deleting the underlying messages', async t => {
    const w = scenario(t);
    for (const id of [BLOCKED, IGNORED]) w.messages.push({ id: id + '0', channel_id: CHANNEL, author: w.users[id], content: 'hidden' });
    const item = await w.start('hide-blocked-and-ignored-messages');
    assert.equal(w.stores.MessageStore.getMessages(CHANNEL).length, 1);
    assert.equal(w.messages.length, 3);
    await w.stop(item); assert.equal(w.stores.MessageStore.getMessages(CHANNEL).length, 3);
});

test('InfoCommands normal and ephemeral output remains local with the split HTTP API', async t => {
    const w = scenario(t, { splitHTTP: true }); await w.start('info-commands');
    const cmd = command(w, 'userinfo');
    await cmd.execute([{ name: 'user_id', value: FRIEND }], { channel: { id: CHANNEL } });
    await cmd.execute([{ name: 'user_id', value: FRIEND }, { name: 'ephemeral', value: true }], { channel: { id: CHANNEL } });
    const local = w.calls.filter(c => c[0] === 'receiveMessage');
    assert.equal(local.length, 2); assert.equal(local[0][2].embeds[0].author.name, 'friend');
    assert.equal(w.calls.some(c => c[0] === 'sendMessage'), false);
});

test('InfoCommands attaches to a guild menu initialized after startup and opens the selected server', async t => {
    const w = scenario(t, { curatedOnly: true, splitHTTP: true });
    await w.start('info-commands');
    const original = Object.freeze([{ label: 'Notifications' }]);
    const menu = { default: function getGuildsBarGuildMenuItems() { return original; } };
    w.addModule(menu);
    const items = menu.default(GUILD), info = items.find(row => row.label === 'Server Info');
    assert.ok(info, 'late guild menu contains Server Info');
    assert.equal(original.length, 1, 'existing menu data was not mutated');
    info.action(); await w.tick(0);
    assert.equal(w.openedSheets.at(-1)?.context.guildId, GUILD);
    const ui = await w.picker();
    assert.match(text(ui.toJSON()), /Test Guild/);
    assert.match(text(ui.toJSON()), /Test Owner/);
    assert.ok(ui.root.findByType('BottomSheetScrollView'), 'sheet uses Next native scrolling');
    await press(ui, 'ID'); assert.equal(w.clipboard.at(-1), GUILD);
    await press(ui, 'Close');
    assert.ok(w.calls.some(c => c[0] === 'hideSheet' && c[1] === 'info-commands-server-info-' + GUILD));
});

test('InfoCommands extends a frozen lazy guild-menu export and frozen React item props', async t => {
    const w = scenario(t, { curatedOnly: true, splitHTTP: true }); await w.start('info-commands');
    const originalItems = Object.freeze([{ label: 'Notifications' }]);
    const module = Object.freeze({ default: function GuildMenu() { return h('ContextMenu', { items: originalItems }); } });
    const opened = await w.sheets.openLazy(Promise.resolve(module), 'GuildContextMenu', { guildId: GUILD });
    const ui = await w.mount(h(opened.default));
    const items = ui.root.findByType('ContextMenu').props.items;
    assert.equal(items.filter(row => row.label === 'Server Info').length, 1);
    assert.equal(originalItems.length, 1);
    items.find(row => row.label === 'Server Info').action(); await w.tick(0);
    assert.equal(w.openedSheets.at(-1).context.guildId, GUILD);
});

test('InfoCommands keeps each lazy memo/forwardRef guild sheet bound to its own server', async t => {
    const w = scenario(t, { curatedOnly: true }); await w.start('info-commands');
    const Row = w.U.discord.design.Design.ActionSheetRow;
    const Inner = React.forwardRef(function GuildRows(_props, ref) {
        return h(w.RN.View, { ref }, h(Row, { label: 'Notifications', onPress() {} }));
    });
    const module = Object.freeze({ default: React.memo(Inner) });
    const other = '400000000000000002'; w.guilds[other] = { id: other, name: 'Other Guild' };
    const first = await w.sheets.openLazy(Promise.resolve(module), 'GuildHeaderActionSheet', { guildId: GUILD });
    const second = await w.sheets.openLazy(Promise.resolve(module), 'GuildHeaderActionSheet', { guildId: other });
    const firstUI = await w.mount(h(first.default)), secondUI = await w.mount(h(second.default));
    await press(firstUI, 'Server Info'); await w.tick(0);
    assert.equal(w.openedSheets.at(-1).context.guildId, GUILD);
    await press(secondUI, 'Server Info'); await w.tick(0);
    assert.equal(w.openedSheets.at(-1).context.guildId, other);
});

test('InfoCommands handles immutable native context menus and ignores user/channel targets', async t => {
    const w = scenario(t); await w.start('info-commands');
    const context = { showContextMenu: value => value, hideContextMenu() {} }; w.addModule(context);
    const original = Object.freeze({ key: GUILD, items: Object.freeze([{ label: 'Notifications' }]) });
    const menu = context.showContextMenu(original);
    assert.equal(menu.items.filter(item => item.label === 'Server Info').length, 1);
    assert.equal(original.items.length, 1);
    for (const extra of [{ userId: FRIEND }, { channelId: CHANNEL }, { message: w.messages[0] }]) {
        const target = Object.freeze({ ...original, ...extra });
        assert.equal(context.showContextMenu(target), target);
    }
});

test('InfoCommands finds rows rendered by a nested class component without changing existing rows', async t => {
    const w = scenario(t, { curatedOnly: true }); await w.start('info-commands');
    const Row = w.U.discord.design.Design.ActionSheetRow;
    let notifications = 0;
    class GuildRows extends React.Component {
        render() { return h(w.RN.View, null, Object.freeze([
            h(Row, { key: 'notifications', label: 'Notifications', onPress: () => notifications++ }),
        ])); }
    }
    function GuildMenu() { return h(w.RN.View, null, h(GuildRows)); }
    const module = Object.freeze({ default: GuildMenu });
    const opened = await w.sheets.openLazy(Promise.resolve(module), 'GuildContextMenu', { guild: w.guilds[GUILD] });
    const ui = await w.mount(h(opened.default));
    await press(ui, 'Notifications'); assert.equal(notifications, 1);
    await press(ui, 'Server Info'); await w.tick(0);
    assert.equal(w.openedSheets.at(-1).context.guildId, GUILD);
    assert.equal(module.default, GuildMenu);
});

test('InfoCommands adds only one action when guild builder and lazy grouped menu both apply', async t => {
    const w = scenario(t); await w.start('info-commands');
    const menu = { getGuildsBarGuildMenuItems: () => Object.freeze([Object.freeze([{ label: 'Notifications' }])]) };
    w.addModule(menu);
    const module = { default: () => h('ContextMenu', { items: menu.getGuildsBarGuildMenuItems(GUILD) }) };
    const opened = await w.sheets.openLazy(Promise.resolve(module), 'GuildContextMenu', { guildId: GUILD });
    const ui = await w.mount(h(opened.default));
    const items = ui.root.findByType('ContextMenu').props.items.flat();
    assert.equal(items.filter(item => item.label === 'Server Info').length, 1);
    assert.equal(items.filter(item => item.label === 'Notifications').length, 1);
});

test('InfoCommands cancels pending menu subscriptions and keeps old actions inactive after restart', async t => {
    const w = scenario(t), item = await w.start('info-commands');
    const menu = { default: function getGuildsBarGuildMenuItems() { return []; } }; w.addModule(menu);
    const row = menu.default(GUILD).find(item => item.label === 'Server Info'); assert.ok(row);
    let resolve; const pending = new Promise(done => resolve = done);
    const originalModule = { default: () => h('ContextMenu', { items: [] }) };
    const opened = w.sheets.openLazy(pending, 'GuildContextMenu', { guildId: GUILD });
    await w.stop(item); resolve(originalModule);
    assert.equal(await opened, originalModule, 'no stale wrapper is installed');
    assert.equal(w.moduleWaiters.size, 0, 'all late-module subscriptions removed');
    await w.start('info-commands');
    const count = w.openedSheets.length;
    row.action(); await w.tick(0);
    assert.equal(w.openedSheets.length, count, 'old actions cannot reopen a sheet');
});

async function serverInfoButton(w) {
    if (!w.guildMenu) {
        w.guildMenu = { default: function getGuildsBarGuildMenuItems() { return []; } };
        w.addModule(w.guildMenu);
    }
    return w.guildMenu.default(GUILD).find(item => item.label === 'Server Info');
}

test('InfoCommands uses native Next actions when another module exports the same sheet methods', async t => {
    const w = scenario(t, { curatedOnly: true });
    let wrongPopup = 0;
    w.addModule({ openLazy() { wrongPopup++; }, hideActionSheet() {} });
    w.addModule({ ActionSheet: () => null });
    await w.start('info-commands');
    (await serverInfoButton(w)).action();
    assert.equal(w.openedSheets.length, 0, 'let the context-menu handler finish dismissing first');
    await w.tick(0);
    assert.equal(wrongPopup, 0, 'ignore unrelated legacy lookups');
    assert.equal(w.openedSheets.at(-1)?.context.guildId, GUILD);
    const ui = await w.picker();
    assert.ok(ui.root.findByType('ActionSheet'));
    assert.match(text(ui.toJSON()), /Test Guild/);
});

test('InfoCommands shows cached native details when void openLazy never mounts a popup, and can retry', async t => {
    const w = scenario(t, { curatedOnly: true });
    // Real Discord openLazy returns void. Successful invocation is not proof of presentation.
    const record = w.sheets.openLazy;
    w.sheets.openLazy = (...args) => { record(...args); };
    await w.start('info-commands');
    const info = await serverInfoButton(w);
    info.action(); await w.tick(0); await w.tick(2000);
    assert.equal(w.alerts.length, 1, 'a blank popup must not leave the user with nothing');
    assert.match(w.alerts[0][0], /Test Guild/);
    assert.match(w.alerts[0][1], new RegExp(GUILD));
    assert.equal(w.calls.some(c => c[0] === 'http'), false, 'cached fallback does not wait for a guild request');
    w.alerts[0][2].find(button => button.text === 'Copy Server ID').onPress();
    assert.equal(w.clipboard.at(-1), GUILD);
    const late = await w.picker();
    assert.equal(late.toJSON(), null, 'a late resolution cannot open over the fallback');
    info.action(); await w.tick(0); await w.tick(2000);
    assert.equal(w.alerts.length, 2, 'failed opening must not latch the button closed');
});

test('InfoCommands cancels the fallback only after a visible sheet layout, and on Close', async t => {
    const w = scenario(t, { curatedOnly: true }); await w.start('info-commands');
    const info = await serverInfoButton(w);
    info.action(); await w.tick(0);
    const ui = await w.picker();
    const body = ui.root.findAll(n => n.type === 'View' && typeof n.props.onLayout === 'function')[0];
    await Renderer.act(async () => body.props.onLayout({ nativeEvent: { layout: { width: 480, height: 600 } } }));
    await w.tick(2000);
    assert.equal(w.alerts.length, 0, 'no duplicate alert after successful presentation');
    await press(ui, 'Close');
    info.action(); await w.tick(0);
    const second = await w.picker(); await press(second, 'Close'); await w.tick(2000);
    assert.equal(w.alerts.length, 0, 'intentional dismissal must not trigger a fallback');
});

test('InfoCommands falls back when the sheet mounts with no visible height', async t => {
    const w = scenario(t, { curatedOnly: true }); await w.start('info-commands');
    (await serverInfoButton(w)).action(); await w.tick(0);
    const ui = await w.picker();
    const body = ui.root.findAll(n => n.type === 'View' && typeof n.props.onLayout === 'function')[0];
    await Renderer.act(async () => body.props.onLayout({ nativeEvent: { layout: { width: 480, height: 0 } } }));
    await w.tick(2000);
    assert.equal(w.alerts.length, 1);
});

test('InfoCommands converts a sheet rendering failure into a usable native popup', async t => {
    const w = scenario(t, { curatedOnly: true });
    w.U.discord.design.Design.ActionSheet = function BrokenSheet() { throw new Error('native sheet unavailable'); };
    await w.start('info-commands'); (await serverInfoButton(w)).action(); await w.tick(0);
    await w.picker(); await w.tick(0);
    assert.equal(w.alerts.length, 1);
    assert.match(w.alerts[0][0], /Test Guild/);
    await w.tick(2000); assert.equal(w.alerts.length, 1, 'render failure and timeout share one fallback');
});

test('InfoCommands still presents the fallback after native sheet dismissal callbacks', async t => {
    const w = scenario(t, { curatedOnly: true });
    const hide = w.sheets.hideActionSheet;
    w.sheets.hideActionSheet = key => {
        hide(key);
        const sheet = w.openedSheets.findLast(sheet => sheet.key === key);
        sheet?.context.onDismiss?.();
    };
    await w.start('info-commands');
    (await serverInfoButton(w)).action(); await w.tick(0); await w.tick(2000);
    assert.equal(w.alerts.length, 1, 'programmatic dismissal must not cancel the replacement popup');
    assert.match(w.alerts[0][0], /Test Guild/);
});

test('InfoCommands recovers when the native popup disappears before its first layout', async t => {
    const w = scenario(t, { curatedOnly: true }); await w.start('info-commands');
    (await serverInfoButton(w)).action(); await w.tick(0);
    w.openedSheets.at(-1).context.onDismiss(); await w.tick(0);
    assert.equal(w.alerts.length, 1);
    assert.match(w.alerts[0][0], /Test Guild/);
    await w.tick(2000); assert.equal(w.alerts.length, 1);
});

test('InfoCommands cancels both queued opening and presentation fallback when disabled', async t => {
    const w = scenario(t, { curatedOnly: true });
    let item = await w.start('info-commands');
    (await serverInfoButton(w)).action(); await w.stop(item); await w.tick(2000);
    assert.equal(w.openedSheets.length, 0); assert.equal(w.alerts.length, 0);
    item = await w.start('info-commands');
    (await serverInfoButton(w)).action(); await w.tick(0);
    assert.equal(w.openedSheets.length, 1);
    await w.stop(item); await w.tick(2000);
    assert.equal(w.alerts.length, 0); assert.equal(w.timers.size, 0);
});

for (const failure of ['throw', 'reject']) test(`InfoCommands recovers from an opener that can ${failure}`, async t => {
    const w = scenario(t, { curatedOnly: true });
    w.sheets.openLazy = () => {
        const error = new Error('Cannot present sheet');
        if (failure === 'throw') throw error;
        return Promise.reject(error);
    };
    await w.start('info-commands');
    (await serverInfoButton(w)).action(); await w.tick(0);
    assert.equal(w.alerts.length, 1); assert.match(w.alerts[0][0], /Test Guild/);
    await w.tick(2000); assert.equal(w.alerts.length, 1);
});

test('InfoCommands gives a visible error when a failed sheet has no cached or fetched server', async t => {
    const w = scenario(t, { curatedOnly: true, http: async () => ({ body: null }) });
    delete w.guilds[GUILD];
    await w.start('info-commands');
    (await serverInfoButton(w)).action(); await w.tick(0); await w.tick(2000);
    assert.equal(w.alerts.length, 1);
    assert.equal(w.alerts[0][0], 'Server Info');
    assert.match(w.alerts[0][1], /unavailable/);
});

test('Message Logger retains a deletion and opens the channel history using a native Next route', async t => {
    const w = scenario(t); await w.start('message-logger', { keepDeletedInChat: true });
    await w.dispatcher.dispatch({ type: 'MESSAGE_DELETE', id: w.messages[0].id, channelId: CHANNEL });
    assert.equal(w.calls.some(c => c[0] === 'dispatch' && c[1].type === 'MESSAGE_DELETE' && !c[1].__vml_cleanup), false);
    await w.advance(20);
    await command(w, 'messagelogger').execute([], { channel: { id: CHANNEL } }); await w.advance(0);
    const route = w.calls.find(c => c[0] === 'navigate');
    assert.equal(route?.[1], 'dev.fluttershy2008.message-logger.legacy-page');
    const Page = w.registeredScreens.get(route[1]).screen.getComponent();
    const ui = await w.mount(h(Page, { route: { params: route[2] } }));
    assert.match(text(ui.toJSON()), /A test message/);
});

test('More Alts initializes its command before settings and saves the current test session', async t => {
    const w = scenario(t, { fetch: async (url, init) => {
        assert.equal(url, 'https://discord.com/api/v9/users/@me');
        assert.equal(init.headers.Authorization, 'fake-test-session-token-only');
        return Response.json({ id: ACCOUNT, username: 'test-owner' });
    } }), item = await w.start('more-alts');
    await w.advance(1600); await w.advance(0);
    await command(w, 'morealts').execute(); await w.advance(0);
    assert.equal(w.calls.find(c => c[0] === 'navigate')?.[1], 'dev.fluttershy2008.more-alts.legacy-page');
    const ui = await w.settings(item); await press(ui, 'Save current account');
    assert.deepEqual(item.writes.at(-1).accountOrder, [ACCOUNT]);
    assert.equal(w.calls.filter(c => c[0] === 'fetch').length, 1, 'saving verifies the test session once');
});

test('Nitro Auto Claim uses split HTTP and deduplicates the same simulated gift', async t => {
    const w = scenario(t, { splitHTTP: true }), item = await w.start('nitro-auto-claim');
    const event = { type: 'MESSAGE_CREATE', message: { ...w.messages[0], content: 'https://discord.gift/abcdefghijklmnop' } };
    await w.dispatcher.dispatch(event); await w.advance(0);
    await w.dispatcher.dispatch(event); await w.advance(2000);
    const requests = w.calls.filter(c => c[0] === 'http' && c[1] === 'post');
    assert.equal(requests.length, 1); assert.match(requests[0][2].url, /gift-codes\/abcdefghijklmnop\/redeem/);
    assert.equal(item.writes.at(-1).accounts[ACCOUNT].history.length, 1);
});

test('PingJumper fetches recent mentions and opens the matching message', async t => {
    const w = scenario(t, { splitHTTP: true }); await w.start('ping-jumper');
    await command(w, 'lastping').execute([], { channel: { id: CHANNEL } });
    assert.equal(w.calls.find(c => c[0] === 'jumpURL')?.[1], `https://discord.com/channels/${GUILD}/${CHANNEL}/${w.messages[0].id}`);
});

test('Profile Status Presets saves and applies a preset, and its shortcut uses a Next route', async t => {
    const w = scenario(t, { splitHTTP: true }), item = await w.start('profile-status-presets'), ui = await w.settings(item);
    await press(ui, '+ New preset'); await change(ui, 'Preset name', 'Gaming'); await change(ui, 'Status text', 'Testing Next');
    await press(ui, 'Save preset'); await press(ui, 'Apply Gaming');
    assert.equal(w.calls.find(c => c[0] === 'http' && c[1] === 'patch')?.[2].body.custom_status.text, 'Testing Next');
    await command(w, 'statuspresets').execute(); await w.tick(0);
    assert.equal(w.calls.find(c => c[0] === 'navigate')?.[1], 'dev.fluttershy2008.profile-status-presets.legacy-page');
});

test('Read All Notifications acknowledges unread channels through native Flux', async t => {
    const w = scenario(t); await w.start('read-all-notifications');
    await command(w, 'readall').execute();
    const event = w.calls.find(c => c[0] === 'dispatch' && c[1].type === 'BULK_ACK')?.[1];
    assert.ok(event); assert.ok(JSON.stringify(event).includes(CHANNEL));
    assert.equal(w.calls.some(c => c[0] === 'http'), false);
});

test('Relationship Notifier detects a removal after its initial baseline', async t => {
    const w = scenario(t), item = await w.start('relationship-notifier');
    await w.advance(6000); delete w.relationships[FRIEND];
    await w.dispatcher.dispatch({ type: 'RELATIONSHIP_REMOVE', id: FRIEND }); await w.advance(1000);
    assert.ok(w.toasts.some(value => /friend|removed/i.test(value)));
    assert.ok(item.writes.at(-1).accounts[ACCOUNT]);
});

test('Save as Sticker extends image menus and renders eligible server rows', async t => {
    const w = scenario(t, { curatedOnly: true }); await w.start('save-as-sticker');
    const page = process.env.PLUGIN_TEST_TARGET === 'valenced' ? installNavigationHost(w) : undefined;
    const pageRoot = page ? await w.mount(h(page.Root)) : undefined;
    const attachment = { id: '800000000000000001', filename: 'pony.png', content_type: 'image/png', width: 320, height: 320, url: 'https://cdn.discordapp.com/attachments/1/2/pony.png' };
    const ui = await w.menu('MessageLongPressActionSheet', { message: { attachments: [attachment] } });
    await press(ui, 'Save as Sticker');
    if (page) await w.tick(350);
    const picker = pageRoot ?? await w.picker();
    assert.ok(button(picker, 'Test Guild'));
    assert.equal(w.calls.some(c => c[0] === 'fetch'), false, 'opening a picker does not download or upload');
});

test('Server Leaver keeps owned servers and confirms before leaving a simulated unprotected server', async t => {
    const w = scenario(t, { splitHTTP: true }), target = '400000000000000002';
    w.guilds[target] = { id: target, name: 'Optional Guild', ownerId: FRIEND };
    const item = await w.start('server-leaver'), ui = await w.settings(item);
    await press(ui, 'Leave 1 unprotected servers');
    assert.equal(w.calls.some(c => c[0] === 'http' && c[1] === 'del'), false);
    await Renderer.act(async () => { w.alerts.at(-1)[2].find(b => b.style === 'destructive').onPress(); });
    const requests = w.calls.filter(c => c[0] === 'http' && c[1] === 'del');
    assert.equal(requests.length, 1); assert.ok(requests[0][2].url.endsWith(target));
    assert.ok(!requests[0][2].url.endsWith(GUILD));
});

test('Stealmoji adds its cloning action to a message emoji sheet', async t => {
    const w = scenario(t, { curatedOnly: true }); await w.start('stealmoji');
    const ui = await w.menu('MessageLongPressActionSheet', { message: { content: '<:pony:800000000000000001>' } });
    const labels = ui.root.findAll(n => typeof n.type === 'string' && n.props.onPress).map(n => n.props.label ?? n.props.text ?? n.props.accessibilityLabel ?? text(n));
    assert.ok(labels.some(label => /steal|clone/i.test(label)), JSON.stringify(labels));
});

test('ValidUser resolves a cached mention and opens its profile', async t => {
    const w = scenario(t, { splitHTTP: true }), item = await w.start('valid-user'), ui = await w.settings(item);
    await change(ui, 'Paste a user ID or <@mention>', '<@' + FRIEND + '>'); await press(ui, 'Resolve user');
    await press(ui, 'Open profile'); assert.equal(w.calls.find(c => c[0] === 'showProfileSheet')?.[1].userId, FRIEND);
});

test('ViewIcons extends a profile menu and opens the avatar in native media', async t => {
    const w = scenario(t, { curatedOnly: true }); w.users[FRIEND].avatar = 'ponyhash'; await w.start('view-icons');
    const ui = await w.menu('UserProfileActionSheet', { user: w.users[FRIEND], userId: FRIEND });
    await press(ui, 'View Avatar'); assert.ok(w.calls.find(c => c[0] === 'openMedia'));
});

test('shared native menus and command hooks survive independent plugin shutdown', async t => {
    const w = scenario(t, { curatedOnly: true, splitHTTP: true });
    const first = await w.start('copy-user-id'); await w.start('ping-jumper'); await w.start('save-as-sticker'); await w.start('view-icons');
    await w.stop(first);
    const ui = await w.menu('MessageLongPressActionSheet', { message: { id: w.messages[0].id, author: w.users[FRIEND] } });
    assert.equal(ui.root.findAll(n => n.type === 'ActionSheetRow' && n.props.label === 'Copy User ID').length, 0);
    assert.ok(button(ui, 'Jump to Latest Ping')); assert.ok(command(w, 'lastping'));
});

test('finder bridge keeps the correct NavigationNative namespace and HTTP receiver', async t => {
    const w = scenario(t, { splitHTTP: true }), item = await w.start('copy-user-id');
    const source = w.modules.find(m => m.HTTP); source.HTTP.marker = 42;
    source.HTTP.get = function () { return this.marker; };
    const bridge = createLegacyAdapter(item.api, { id: 'dev.fluttershy2008.test', legacyManifest: { name: 'Test' } }, w.host);
    t.after(() => bridge.dispose());
    assert.equal(bridge.adapter.metro.findByProps('getAPIBaseURL', 'get').get(), 42);
    assert.equal(bridge.adapter.metro.common.NavigationNative.useNavigation(), w.navigation);
    assert.equal(bridge.adapter.metro.findByProps('aMadeUpExport'), undefined);
});

test('safeFetch enforces its legacy timeout and cancels requests on plugin disposal', async t => {
    const w = scenario(t), item = await w.start('copy-user-id');
    w.host.fetch = (_url, init) => { assert.ok(init.signal); return new Promise(() => {}); };
    const bridge = createLegacyAdapter(item.api, { id: 'test', legacyManifest: { name: 'Test' } }, w.host);
    const timeout = assert.rejects(bridge.adapter.utils.safeFetch('https://image.test', {}, 25), /timed out/);
    await w.advance(25); await timeout;
    const stopped = assert.rejects(bridge.adapter.utils.safeFetch('https://image.test'), /stopped/);
    await bridge.dispose(); await stopped;
});

test('all 21 ports coexist with curated modules and split HTTP, then stop in a different order', async t => {
    const w = scenario(t, { curatedOnly: true, splitHTTP: true });
    const sources = JSON.parse(fs.readFileSync(path.join(__dirname, '../..', process.env.PLUGIN_TEST_TARGET === 'valenced' ? 'valenced' : 'revenge-next', 'sources.json'), 'utf8')).plugins;
    const items = [];
    for (const [id, entry] of Object.entries(sources)) if (entry.kind === 'compatibility-preview')
        items.push(await w.start(id.slice('dev.fluttershy2008.'.length)));
    assert.equal(items.length, 21);
    await w.advance(2000); await w.advance(0);
    const commands = w.commands.getBuiltInCommands(1);
    assert.equal(new Set(commands.map(c => c.id)).size, commands.length, 'local commands have unique IDs');
    await w.dispatcher.dispatch({ type: 'MESSAGE_CREATE', message: w.messages[0] });
    for (let n = 0; n < items.length; n += 2) await w.stop(items[n]);
    assert.ok(command(w, 'statuspresets'));
    for (let n = 1; n < items.length; n += 2) await w.stop(items[n]);
    assert.deepEqual(w.commands.getBuiltInCommands(1).map(c => c.name), ['existing']);
    assert.equal([...w.subscriptions.values()].reduce((count, set) => count + set.size, 0), 0);
});

test('legacy-page navigation waits for Next settings modules and unregisters on stop', async t => {
    const w = scenario(t); w.setSettingsLoaded(false);
    const item = await w.start('profile-status-presets');
    await command(w, 'statuspresets').execute(); await w.advance(0);
    assert.equal(w.calls.some(c => c[0] === 'navigate'), false);
    w.setSettingsLoaded(true); await w.advance(0);
    assert.equal(w.calls.find(c => c[0] === 'navigate')?.[1], 'dev.fluttershy2008.profile-status-presets.legacy-page');
    await w.stop(item); assert.equal(w.registeredScreens.size, 0);
});

test('an unavailable navigation module does not corrupt initialized Metro records', async t => {
    const w = scenario(t); w.modules.splice(w.modules.findIndex(value => value.getRootNavigationRef), 1);
    const item = await w.start('copy-user-id');
    const bridge = createLegacyAdapter(item.api, { id: 'test', legacyManifest: { name: 'Test' } }, w.host);
    t.after(() => bridge.dispose());
    const records = Object.values(bridge.adapter.metro.modules);
    assert.ok(records.some(record => record.publicModule.exports === w.stores.UserStore));
    assert.equal(bridge.adapter.metro.findByProps('getRootNavigationRef'), undefined);
});

test('InfoCommands counts all cached channels beneath grouped IDs and refreshes on store changes', async t => {
    const w = scenario(t, { curatedOnly: true });
    const store = w.stores.GuildChannelStore;
    const channels = {
        a: { id: '900000000000000001', type: 0, guild_id: GUILD },
        b: { id: '900000000000000002', type: 2, guild_id: GUILD },
        c: { id: '900000000000000003', type: 15, guild_id: GUILD },
    };
    store.getMutableGuildChannelsForGuild = () => channels;
    store.getChannels = () => ({ id: GUILD, SELECTABLE: [{ channel: channels.a }] });
    await w.start('info-commands');
    (await serverInfoButton(w)).action(); await w.tick(0);
    const ui = await w.picker();
    const row = () => ui.root.findAll(n => n.props.label === 'Channels')[0];
    assert.equal(row().props.trailing.props.text, '3');
    channels.d = { id: '900000000000000004', type: 13, guild_id: GUILD };
    await w.Renderer.act(async () => store.emitChange());
    assert.equal(row().props.trailing.props.text, '4');
});
