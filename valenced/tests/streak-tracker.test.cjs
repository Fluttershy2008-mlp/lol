'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
process.env.TZ = 'Asia/Singapore';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, ACCOUNT, FRIEND, BLOCKED, CHANNEL, GUILD } = require('../../revenge-next/tests/next-harness.cjs');
const { installChatButtonsHost } = require('./chat-buttons-fixture.cjs');
const { installSettingsSection } = require('./settings-fixture.cjs');

const slug = 'streak-tracker';
const route = 'dev.fluttershy2008.streak-tracker.valenced-settings';
const previewPath = 'modules/main_tabs_v2/native/shared_components/ChannelRowPreview.tsx';
const dm = '300000000000000019', group = '300000000000000020';
const dayMS = 86400000;
const h = React.createElement;
const time = new Date('2027-01-15T23:59:59+08:00').getTime();
const day = Date.UTC(2027, 0, 15) / dayMS;
const snowflake = time => ((BigInt(time) - 1420070400000n) << 22n).toString();
const text = ui => ui.root.findAllByType('Text').map(node => node.props.children);
const fire = ui => text(ui).filter(value => typeof value === 'string' && value.startsWith('🔥 '));

async function setup(t, initial = {}, { hideFirst, hideLast, nested, reduceMotion } = {}) {
    const w = createWorld();
    const host = installChatButtonsHost(w);
    const settings = installSettingsSection(w);
    const jsx = w.U.react.ReactJSXRuntime.jsx;
    const animations = [], motionListeners = new Set();
    if (reduceMotion != null) {
        w.RN.AccessibilityInfo = {
            isReduceMotionEnabled: async () => reduceMotion,
            addEventListener(event, listener) {
                assert.equal(event, 'reduceMotionChanged');
                motionListeners.add(listener);
                return { remove: () => motionListeners.delete(listener) };
            },
        };
        w.RN.Animated.View = w.RN.View;
        w.RN.Animated.timing = (_value, config) => {
            const animation = { config, stopped: false,
                start(finish) { this.finish = finish; }, stop() { this.stopped = true; } };
            animations.push(animation);
            return animation;
        };
    }
    w.channels[dm] = { id: dm, type: 1, recipients: [FRIEND] };
    w.channels[group] = { id: group, type: 3, recipients: [FRIEND, BLOCKED] };
    await w.advance(time - 1800000000000);
    if (hideFirst) await w.start('hide-blocked-and-ignored-messages');
    const item = await w.start(slug, initial);
    if (hideLast) await w.start('hide-blocked-and-ignored-messages');
    const Plain = ({ message }) => h(w.RN.Text, null, message.content);
    const Native = React.memo(props => nested ? jsx(Plain, props) : h(w.RN.Text, null, props.message.content));
    w.addModule({ ChannelRowPreview: Plain, NativeMessageChannelRowPreview: Native }, previewPath);
    const views = [];
    const mount = async element => {
        let ui;
        await Renderer.act(async () => { ui = Renderer.create(element); });
        views.push(ui);
        return ui;
    };
    t.after(async () => {
        for (const ui of views.reverse()) await Renderer.act(async () => ui.unmount());
        for (const plugin of [...w.loaded.values()].reverse()) await w.stop(plugin);
        assert.equal(w.subscriptions.get('MESSAGE_CREATE')?.size ?? 0, 0);
        assert.equal(w.appListeners.size, 0);
        assert.equal(w.pathWaiters.size, 0);
        assert.equal(host.patches.size, 0);
        assert.equal(motionListeners.size, 0);
        assert.deepEqual(w.errors, []);
    });
    const send = opts => {
        const { channel = dm, sender = w.accountId(), at = time, optimistic, ...fields } = opts ?? {};
        const message = Object.freeze({ id: snowflake(at), channel_id: channel, author: w.users[sender],
            content: 'private text that must not be saved', type: 0, ...fields });
        return Renderer.act(async () => w.dispatcher.dispatch({ type: 'MESSAGE_CREATE', optimistic, message }));
    };
    const preview = (type, channel, author = FRIEND) => jsx(type, {
        message: { channel_id: channel, author: w.users[author], content: 'A native preview' },
    });
    return { w, item, settings, send, mount, Plain, Native, preview, animations, motionListeners };
}

test('confirmed outgoing DMs count once per calendar day and expire only after a missed day', async t => {
    const { w, send, item, mount, Plain, Native, preview } = await setup(t, {}, { nested: true });
    const rows = await mount(h(React.Fragment, null, preview(Native, dm), preview(Plain, group), preview(Plain, CHANNEL)));
    await send({ sender: FRIEND });
    await send({ channel: CHANNEL });
    await send({ channel: group });
    await send({ optimistic: true });
    await send({ state: 'SENDING' });
    await send({ state: 'SEND_FAILED' });
    await send({ type: 6 });
    assert.equal(item.writes.length, 0);
    assert.deepEqual(fire(rows), []);

    await send();
    await send({ at: time - 1000, type: 19 });
    assert.deepEqual(fire(rows), ['🔥 1']);
    assert.equal(item.writes.length, 1);
    assert.equal(item.writes[0].accounts[ACCOUNT][dm].lastDay, day);
    assert.equal(JSON.stringify(item.writes[0]).includes('private text'), false);

    await Renderer.act(async () => w.advance(2000));
    await send({ at: time + 2000, type: 19 });
    assert.deepEqual(fire(rows), ['🔥 2']);
    await Renderer.act(async () => w.advance(dayMS));
    assert.deepEqual(fire(rows), ['🔥 2']);
    await Renderer.act(async () => w.advance(dayMS));
    assert.deepEqual(fire(rows), []);
    await send({ at: time + 2 * dayMS + 2000 });
    assert.deepEqual(fire(rows), ['🔥 1']);
    assert.equal(item.writes.at(-1).accounts[ACCOUNT][dm].best, 2);
});

test('native settings show saved stats, scope account changes and clear only the active account', async t => {
    const initial = { accounts: {
        [ACCOUNT]: { [dm]: { recipientId: FRIEND, lastDay: day - 1, days: 9, best: 9 } },
        [FRIEND]: { [dm]: { recipientId: ACCOUNT, lastDay: day, days: 2, best: 2 } },
    } };
    const { w, item, settings, mount, send, Plain, preview } = await setup(t, initial);
    assert.ok(settings.section.settings.includes(route));
    const page = w.registeredScreens.get(route).screen.getComponent();
    const ui = await mount(h(page));
    const row = await mount(preview(Plain, dm));
    const toggle = label => ui.root.findAllByType('Switch').find(node => node.props.accessibilityLabel === label);
    const clear = () => ui.root.findAllByType('Button').find(node => node.props.title === 'Clear streak history').props.onPress();
    assert.ok(text(ui).includes('Test Friend'));
    await send();
    await send();
    assert.deepEqual(w.toasts, ['🔥 10-day DM streak!']);
    assert.deepEqual(fire(ui), ['🔥 10']);
    await Renderer.act(async () => toggle('Show streak badges').props.onValueChange(false));
    assert.deepEqual(fire(row), []);
    assert.deepEqual(fire(ui), ['🔥 10']);
    await Renderer.act(async () => toggle('Show streak badges').props.onValueChange(true));
    assert.deepEqual(fire(row), ['🔥 10']);

    clear();
    const staleConfirm = w.alerts.at(-1)[2][1].onPress;
    await Renderer.act(async () => w.setAccount(FRIEND));
    await Renderer.act(async () => staleConfirm());
    assert.ok(text(ui).includes('Test Owner'));
    assert.deepEqual(fire(row), ['🔥 2']);
    clear();
    await Renderer.act(async () => w.alerts.at(-1)[2][1].onPress());
    assert.deepEqual(fire(row), []);
    assert.equal(item.writes.at(-1).accounts[ACCOUNT][dm].days, 10);
    assert.equal(item.writes.at(-1).accounts[FRIEND], undefined);

    const saved = item.writes.at(-1);
    await Renderer.act(async () => w.stop(item));
    assert.equal(settings.section.settings.includes(route), false);
    assert.equal(w.timers.size, 0);
    const restarted = await w.start(slug, saved);
    await Renderer.act(async () => w.setAccount(ACCOUNT));
    const reopened = await mount(h(restarted.options.SettingsComponent, { api: restarted.api }));
    assert.deepEqual(fire(reopened), ['🔥 10']);
});

for (const order of ['hideFirst', 'hideLast']) {
    test('works alongside Hide Blocked & Ignored Messages when it starts ' + order, async t => {
        const { send, mount, Plain, preview } = await setup(t, {}, { [order]: true });
        await send();
        const visible = await mount(preview(Plain, dm));
        const hidden = await mount(preview(Plain, dm, BLOCKED));
        assert.deepEqual(text(visible), ['A native preview', '🔥 1']);
        assert.equal(text(hidden).includes('A native preview'), false);
    });
}

test('a missed streak plays one cancellable native smoke animation and remembers that it played', async t => {
    const initial = { accounts: { [ACCOUNT]: { [dm]: { recipientId: FRIEND, lastDay: day - 1, days: 52, best: 52 } } } };
    const { w, item, mount, Native, preview, animations } = await setup(t, initial, { reduceMotion: false, nested: true });
    const row = await mount(preview(Native, dm));
    assert.deepEqual(fire(row), ['🔥 52']);
    await Renderer.act(async () => w.advance(2000));
    assert.equal(animations.length, 1);
    assert.equal(animations[0].config.useNativeDriver, true);
    assert.ok(text(row).includes('💨'));
    assert.equal(item.writes.at(-1).accounts[ACCOUNT][dm].lossShown, true);
    await Renderer.act(async () => animations[0].finish());
    assert.deepEqual(fire(row), []);
    assert.equal(text(row).includes('💨'), false);

    const otherRow = await mount(preview(Native, dm));
    assert.equal(text(otherRow).includes('💨'), false);
    assert.equal(animations.length, 1);
    await Renderer.act(async () => w.stop(item));
    await w.start(slug, item.writes.at(-1));
    const restartedRow = await mount(preview(Native, dm));
    assert.equal(text(restartedRow).includes('💨'), false);
    assert.equal(animations.length, 1);
});

test('reduce motion and the smoke switch gate playback, and switching accounts cancels a running effect', async t => {
    const initial = { accounts: { [ACCOUNT]: { [dm]: { recipientId: FRIEND, lastDay: day - 2, days: 5, best: 5 } } } };
    const { w, item, mount, Native, preview, animations, motionListeners } = await setup(t, initial, { reduceMotion: true });
    const row = await mount(preview(Native, dm));
    const ui = await mount(h(item.options.SettingsComponent, { api: item.api }));
    const toggle = value => Renderer.act(async () => ui.root.findAllByType('Switch')
        .find(node => node.props.accessibilityLabel === 'Animate expired streaks').props.onValueChange(value));
    const setMotion = value => Renderer.act(async () => motionListeners.forEach(listener => listener(value)));
    assert.equal(animations.length, 0);
    await toggle(false);
    await setMotion(false);
    assert.equal(text(row).includes('💨'), false);
    await toggle(true);
    assert.equal(animations.length, 1);
    assert.ok(text(row).includes('💨'));
    await Renderer.act(async () => w.setAccount(FRIEND));
    assert.equal(animations[0].stopped, true);
    assert.equal(text(row).includes('💨'), false);
    await Renderer.act(async () => w.setAccount(ACCOUNT));
    assert.equal(animations.length, 1);
});

test('leaderboard ranks five DMs, resolves changing names and keeps large badges compact', async t => {
    const second = '300000000000000021';
    const third = '300000000000000022';
    const initial = { accounts: { [ACCOUNT]: {
        [dm]: { lastDay: day, days: 1234, best: 1234, recipientId: FRIEND },
        [second]: { lastDay: day, days: 51, best: 51 },
        [third]: { lastDay: day, days: 10, best: 10, recipientId: BLOCKED, recipientUsername: 'cached-handle' },
        '300000000000000023': { lastDay: day, days: 4, best: 4 },
        '300000000000000024': { lastDay: day, days: 3, best: 3 },
        '300000000000000025': { lastDay: day, days: 2, best: 2 },
    } } };
    const { w, item, mount, Plain, preview } = await setup(t, initial);
    let nickname = 'Friend’s nickname';
    w.stores.RelationshipStore.getNickname = id => id === FRIEND ? nickname : null;
    w.channels[second] = { id: second, type: 1, rawRecipients: [w.users[ACCOUNT],
        { id: '100000000000000004', global_name: 'From channel', username: 'channel-handle' }] };
    delete w.users[BLOCKED];
    const ui = await mount(h(item.options.SettingsComponent, { api: item.api }));
    assert.deepEqual(fire(ui), ['🔥 999+', '🔥 51', '🔥 10', '🔥 4', '🔥 3']);
    for (const name of ['Friend’s nickname', '@friend', 'From channel', '@channel-handle', 'cached-handle', 'DM · …0023']) {
        assert.ok(text(ui).includes(name), name);
    }
    await Renderer.act(async () => {
        nickname = null;
        w.stores.RelationshipStore.emitChange();
    });
    assert.ok(text(ui).includes('Test Friend'));

    const row = await mount(preview(Plain, dm));
    const badge = () => row.root.findAllByType('View').find(node => node.props.accessibilityLabel === '1234-day DM streak');
    assert.equal(badge().props.style.maxWidth, 74);
    const red = badge().props.style.backgroundColor;
    await Renderer.act(async () => {
        w.stores.ThemeStore.theme = 'light';
        w.stores.ThemeStore.emitChange();
    });
    assert.notEqual(badge().props.style.backgroundColor, red);
    assert.equal(row.root.findAllByType('Text').find(node => node.props.children === '🔥 999+').props.numberOfLines, 1);
    assert.ok(text(row).includes('A native preview'));
});

test('selected user IDs gate tracking, notifications, badges and dashboard while preserving history', async t => {
    const otherDm = '300000000000000026';
    const initial = { accounts: { [ACCOUNT]: {
        [dm]: { lastDay: day - 1, days: 9, best: 9, recipientId: null },
        [otherDm]: { lastDay: day - 1, days: 9, best: 9, recipientId: BLOCKED },
    } } };
    const { w, item, mount, send, Plain, preview } = await setup(t, initial, { reduceMotion: false });
    w.channels[otherDm] = { id: otherDm, type: 1, recipients: [BLOCKED] };
    const row = await mount(preview(Plain, dm));
    const otherRow = await mount(preview(Plain, otherDm));
    const ui = await mount(h(item.options.SettingsComponent, { api: item.api }));
    const mode = () => ui.root.findAllByType('Switch').find(node => node.props.accessibilityLabel === 'Only selected users');
    const select = value => Renderer.act(async () => mode().props.onValueChange(value));
    const enter = value => Renderer.act(async () => ui.root.findByType('TextInput').props.onChangeText(value));
    const add = () => Renderer.act(async () => ui.root.findAllByType('Button').find(node => node.props.title === 'Add user IDs').props.onPress());
    assert.deepEqual(fire(row), ['🔥 9']);
    assert.deepEqual(fire(otherRow), ['🔥 9']);
    assert.equal(mode().props.value, false);

    await select(true);
    assert.deepEqual(fire(row), []);
    assert.deepEqual(fire(ui), []);
    await enter('not-a-user');
    await add();
    assert.ok(text(ui).includes('Paste Discord user IDs or mentions, separated by commas or new lines.'));
    await enter(ACCOUNT);
    await add();
    assert.ok(text(ui).includes('Remove your own user ID before adding the list.'));
    await enter(FRIEND + ',\n<@!' + FRIEND + '>,' + otherDm + ',');
    await add();
    assert.deepEqual(item.writes.at(-1).selections[ACCOUNT].userIds, [FRIEND, otherDm]);
    assert.deepEqual(fire(row), ['🔥 9']);
    assert.deepEqual(fire(ui), ['🔥 9']);
    assert.deepEqual(fire(otherRow), []);

    await send({ channel: otherDm });
    await send({ sender: FRIEND });
    assert.deepEqual(w.toasts, []);
    assert.equal(item.writes.at(-1).accounts[ACCOUNT][otherDm].lastDay, day - 1);
    await send();
    await send();
    assert.deepEqual(fire(row), ['🔥 10']);
    assert.deepEqual(w.toasts, ['🔥 10-day DM streak!']);
    assert.equal(item.writes.at(-1).accounts[ACCOUNT][dm].recipientId, FRIEND);

    await Renderer.act(async () => ui.root.findAllByType('Pressable')
        .find(node => node.props.accessibilityLabel === 'Remove ' + FRIEND).props.onPress());
    assert.deepEqual(fire(row), []);
    assert.equal(item.writes.at(-1).accounts[ACCOUNT][dm].days, 10);
    await select(false);
    assert.deepEqual(fire(row), ['🔥 10']);
    assert.deepEqual(fire(otherRow), ['🔥 9']);
});

test('the user selection survives restart and settings callbacks cannot mutate another account', async t => {
    const initial = { selections: { [ACCOUNT]: { onlySelected: true, userIds: [FRIEND, FRIEND, 'invalid', ACCOUNT] } } };
    const { w, item, mount, send } = await setup(t, initial);
    const ui = await mount(h(item.options.SettingsComponent, { api: item.api }));
    const toggle = () => ui.root.findAllByType('Switch').find(node => node.props.accessibilityLabel === 'Only selected users');
    assert.equal(toggle().props.value, true);
    const removals = () => ui.root.findAllByType('Pressable').filter(node => node.props.accessibilityLabel?.startsWith('Remove '));
    assert.equal(removals().length, 1);
    const stale = toggle().props.onValueChange;
    await send();
    await Renderer.act(async () => w.setAccount(FRIEND));
    assert.equal(toggle().props.value, false);
    assert.equal(removals().length, 0);
    await Renderer.act(async () => stale(false));
    await Renderer.act(async () => toggle().props.onValueChange(true));
    const saved = item.writes.at(-1);
    const rest = { allGroups: false, groupIds: [], allGuilds: false, guildIds: [] };
    assert.deepEqual(saved.selections[ACCOUNT], { ...rest, onlySelected: true, userIds: [FRIEND] });
    assert.deepEqual(saved.selections[FRIEND], { ...rest, onlySelected: true, userIds: [] });
    await Renderer.act(async () => w.stop(item));
    await Renderer.act(async () => w.setAccount(ACCOUNT));
    let restarted;
    await Renderer.act(async () => { restarted = await w.start(slug, saved); });
    const reopened = await mount(h(restarted.options.SettingsComponent, { api: restarted.api }));
    assert.equal(reopened.root.findAllByType('Switch').find(node => node.props.accessibilityLabel === 'Only selected users').props.value, true);
    assert.deepEqual(fire(reopened), ['🔥 1']);
});

test('group and server streaks opt in independently and use the group channel or server ID', async t => {
    const otherGroup = '300000000000000027', thread = '300000000000000028';
    const otherGuild = '400000000000000002', otherChannel = '300000000000000029';
    const { w, item, mount, send, Native, preview } = await setup(t);
    w.channels[group].name = 'Study group';
    w.channels[otherGroup] = { id: otherGroup, type: 3, name: 'Another group' };
    w.channels[thread] = { id: thread, type: 11, guildId: GUILD };
    w.channels[otherChannel] = { id: otherChannel, type: 0, guild_id: otherGuild };
    const originalMenu = Object.freeze([Object.freeze([{ label: 'Native item' }])]);
    const builder = { default: () => originalMenu };
    const original = builder.default;
    w.addModule(builder, 'modules/guilds_bar/native/utils/getGuildsBarGuildMenuItems.tsx');
    const ui = await mount(h(item.options.SettingsComponent, { api: item.api }));
    const groupRow = await mount(preview(Native, group));
    const otherRow = await mount(preview(Native, otherGroup));
    const activateTab = name => Renderer.act(async () => ui.root.findAllByType('Pressable')
        .find(node => node.props.accessibilityRole === 'tab' && node.props.accessibilityLabel === name).props.onPress());
    async function add(id, title) {
        await Renderer.act(async () => ui.root.findByType('TextInput').props.onChangeText(id));
        await Renderer.act(async () => ui.root.findAllByType('Button').find(node => node.props.title === title).props.onPress());
    }
    const toggle = (label, value) => Renderer.act(async () => ui.root.findAllByType('Switch')
        .find(node => node.props.accessibilityLabel === label).props.onValueChange(value));
    const menu = id => builder.default({ guild: { id } })[0];

    await send({ channel: group });
    await send({ channel: CHANNEL });
    assert.equal(item.writes.length, 0);
    assert.equal(menu(GUILD).length, 1);
    await activateTab('Group DMs');
    await add(group, 'Add group DM IDs');
    await send({ channel: group });
    await send({ channel: group, at: time - 1000 });
    await send({ channel: otherGroup });
    assert.deepEqual(fire(groupRow), ['🔥 1']);
    assert.deepEqual(fire(otherRow), []);
    assert.ok(text(ui).includes('Study group'));

    await activateTab('Servers');
    await add(GUILD, 'Add server IDs');
    await send({ channel: CHANNEL });
    await send({ channel: thread, type: 19 });
    await send({ channel: otherChannel });
    assert.equal(item.writes.at(-1).accounts[ACCOUNT][GUILD].days, 1);
    assert.equal(item.writes.at(-1).accounts[ACCOUNT][CHANNEL], undefined);
    assert.equal(item.writes.at(-1).accounts[ACCOUNT][thread], undefined);
    assert.equal(item.writes.at(-1).accounts[ACCOUNT][otherGuild], undefined);
    assert.equal(menu(GUILD)[1].label, '🔥 1-day server streak');
    assert.equal(menu(otherGuild).length, 1);
    assert.equal(originalMenu[0].length, 1);

    await Renderer.act(async () => w.advance(2000));
    await send({ channel: thread, at: time + 2000 });
    assert.equal(menu(GUILD)[1].label, '🔥 2-day server streak');
    const action = menu(GUILD)[1].action;
    action();
    assert.deepEqual(w.alerts.at(-1), ['Test Guild', '2-day streak · Personal best 2']);
    await Renderer.act(async () => w.setAccount(FRIEND));
    action();
    assert.equal(w.alerts.length, 1);
    assert.equal(menu(GUILD).length, 1);
    await Renderer.act(async () => w.setAccount(ACCOUNT));
    await activateTab('Servers');
    await toggle('Track all servers', true);
    await send({ channel: otherChannel, at: time + 2000 });
    assert.equal(menu(otherGuild)[1].label, '🔥 1-day server streak');
    await toggle('Track all servers', false);
    assert.equal(menu(otherGuild).length, 1);
    await Renderer.act(async () => w.stop(item));
    assert.equal(builder.default, original);
});

test('the server streak menu composes with ViewIcons and respects the badge switch', async t => {
    const initial = { selections: { [ACCOUNT]: { allGuilds: true } } };
    const { w, item, mount, send } = await setup(t, initial);
    await w.start('view-icons');
    w.guilds[GUILD].icon = 'server';
    const module = { getGuildsBarGuildMenuItems: () => [{ label: 'Native item' }] };
    w.addModule(module, 'modules/guilds_bar/native/utils/getGuildsBarGuildMenuItems.tsx');
    await send({ channel: CHANNEL });
    const labels = () => Array.from(module.getGuildsBarGuildMenuItems(GUILD), row => row.label).sort();
    assert.deepEqual(labels(), ['Native item', 'View Server Icon', '🔥 1-day server streak']);
    const ui = await mount(h(item.options.SettingsComponent, { api: item.api }));
    await Renderer.act(async () => ui.root.findAllByType('Switch')
        .find(node => node.props.accessibilityLabel === 'Show streak badges').props.onValueChange(false));
    assert.deepEqual(labels(), ['Native item', 'View Server Icon']);
});
