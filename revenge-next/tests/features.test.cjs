'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLegacyAdapter } = require('../runtime.cjs');
const { createWorld, React, Renderer, ACCOUNT, FRIEND, BLOCKED, IGNORED, CHANNEL, GUILD } = require('./next-harness.cjs');
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
    world.picker = async () => { const module = await world.openedSheets.at(-1).promise; return world.mount(h(module.default, world.openedSheets.at(-1).context)); };
    return world;
}

test('Addon List copies native installed metadata without posting it', async t => {
    const w = scenario(t), item = await w.start('addon-list'); await w.start('view-icons');
    await command(w, 'plugin-list').execute([{ name: 'copy', value: true }, { name: 'detailed', value: true }], { channel: { id: CHANNEL } });
    assert.match(w.clipboard[0], /ViewIcons.*Next preview/);
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
    assert.equal(w.calls.find(c => c[0] === 'showProfile')?.[1].userId, FRIEND);
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
    const attachment = { id: '800000000000000001', filename: 'pony.png', content_type: 'image/png', width: 320, height: 320, url: 'https://cdn.discordapp.com/attachments/1/2/pony.png' };
    const ui = await w.menu('MessageLongPressActionSheet', { message: { attachments: [attachment] } });
    await press(ui, 'Save as Sticker'); const picker = await w.picker();
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
    const sources = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'sources.json'), 'utf8')).plugins;
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
