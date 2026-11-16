'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
process.env.TZ = 'Asia/Singapore';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, ACCOUNT, FRIEND, BLOCKED } = require('../../revenge-next/tests/next-harness.cjs');
const { installChatButtonsHost } = require('./chat-buttons-fixture.cjs');
const { installSettingsSection } = require('./settings-fixture.cjs');

const h = React.createElement;
const slug = 'birthday-badge';
const ms = value => new Date(value).getTime();
const startTime = 1800000000000;
const hour = 3600000;
const day = 24 * hour;
const menuPath = 'modules/user_profile/native/UserProfileOverflowMenu.tsx';
const text = ui => ui.root.findAllByType('Text').map(node => node.props.children);
const cake = ui => text(ui).find(value => typeof value === 'string' && value.startsWith('🎂 '));
const button = (ui, name) => ui.root.findAllByType('Button').find(node => node.props.text === name);
const saved = (month, day) => ({ accounts: { [ACCOUNT]: { [FRIEND]: { month, day } } } });

async function setup(t, now, initial = {}) {
    const w = createWorld();
    const { patches } = installChatButtonsHost(w);
    const settings = installSettingsSection(w);
    const jsx = w.U.react.ReactJSXRuntime.jsx;
    w.U.discord.design.Design.AlertModal = ({ title, content, extraContent, actions }) =>
        h('AlertModal', { title }, content, extraContent, actions);
    const nativeBadges = ({ badges }) => badges.length ? h(w.RN.Text, null, badges.join(', ')) : null;
    const views = [];
    const mount = async node => {
        let ui;
        await Renderer.act(async () => { ui = Renderer.create(node); });
        views.push(ui);
        return ui;
    };
    await w.advance(ms(now) - startTime);
    const plugin = await w.start(slug, initial);
    w.addModule({ ProfileBadgeRows: nativeBadges });
    const row = (userId, badges = []) => mount(jsx(nativeBadges, { userId, badges }));
    const overflow = { default: React.memo(React.forwardRef(() =>
        h(w.RN.View, null, h('MenuFixture', { items: [[{ label: 'Copy username' }], [{ label: 'Block' }]] })))) };
    w.addModule(overflow, menuPath);
    const menu = async userId => (await mount(h(overflow.default, { displayProfile: { userId } })))
        .root.findByType('MenuFixture').props.items.flat();
    const edit = async action => {
        await Renderer.act(async () => action());
        return mount(w.alerts.at(-1)[1]);
    };
    const enter = (ui, fields) => Renderer.act(async () => {
        for (const [label, value] of Object.entries(fields)) {
            ui.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === label).props.onChangeText(value);
        }
    });
    t.after(async () => {
        for (const ui of views.reverse()) await Renderer.act(async () => ui.unmount());
        if (w.loaded.has(slug)) await w.stop(plugin);
        assert.equal(w.timers.size, 0);
        assert.equal(w.appListeners.size, 0);
        assert.equal(w.pathWaiters.size, 0);
        assert.equal(patches.size, 0);
        assert.equal(w.stores.UserStore.listeners.size, 0);
        assert.deepEqual(settings.section.settings, settings.core);
        assert.equal(w.registeredScreens.size, 0);
        assert.deepEqual(w.errors, []);
    });
    return { w, plugin, row, mount, menu, edit, enter, settingsSection: settings.section };
}

test('cake counts down in days then hours, flips at local midnight and repeats annually', async t => {
    const { w, row } = await setup(t, '2027-02-08T23:59:59+08:00', saved(2, 10));
    const ui = await row(FRIEND, ['Native Discord badge', 'Valenced badge']);
    const other = await row(BLOCKED);
    assert.equal(cake(ui), '🎂 2d');
    assert.equal(cake(other), undefined);
    assert.ok(text(ui).includes('Native Discord badge, Valenced badge'));
    await Renderer.act(async () => w.advance(1000));
    assert.equal(cake(ui), '🎂 24h');
    await Renderer.act(async () => w.advance(23 * hour));
    assert.equal(cake(ui), '🎂 1h');
    assert.match(ui.root.findByType('Pressable').props.accessibilityLabel, /^1 hour until birthday/);
    await Renderer.act(async () => w.advance(hour));
    assert.equal(cake(ui), '🎂 Today');
    await Renderer.act(async () => w.advance(day));
    assert.equal(cake(ui), '🎂 364d');
    assert.equal(w.calls.some(([name]) => name === 'fetch' || name === 'http' || name === 'dispatch'), false);
});

test('the late-loaded profile menu validates birthdays, updates an open badge-free profile, and can remove a date', async t => {
    const { w, plugin, row, menu, edit, enter } = await setup(t, '2027-02-26T23:00:00+08:00');
    const ui = await row(FRIEND);
    const items = await menu(FRIEND);
    assert.deepEqual(Array.from(items, item => item.label), ['Copy username', 'Set birthday', 'Block']);
    assert.equal(cake(ui), undefined);

    const editor = await edit(items.find(item => item.label === 'Set birthday').action);
    await enter(editor, { Month: '4', Day: '31' });
    await Renderer.act(async () => button(editor, 'Save').props.onPress());
    assert.ok(text(editor).includes('Enter a valid month and day.'));
    assert.equal(plugin.writes.length, 0);

    await enter(editor, { Month: '2', Day: '29' });
    await Renderer.act(async () => button(editor, 'Save').props.onPress());
    assert.deepEqual(plugin.writes.at(-1), saved(2, 29));
    assert.equal(cake(ui), '🎂 2d');
    await Renderer.act(async () => w.advance(hour));
    assert.equal(cake(ui), '🎂 24h');
    await Renderer.act(async () => w.advance(day));
    assert.equal(cake(ui), '🎂 Today');
    assert.ok((await menu(FRIEND)).some(item => item.label === 'Edit birthday'));

    const fromBadge = await edit(ui.root.findByType('Pressable').props.onPress);
    assert.equal(fromBadge.root.findByType('AlertModal').props.title, 'Edit birthday');
    await Renderer.act(async () => button(fromBadge, 'Remove birthday').props.onPress());
    assert.equal(cake(ui), undefined);
    assert.deepEqual(plugin.writes.at(-1), { accounts: { [ACCOUNT]: {} } });
});

test('the Valenced settings row opens saved birthdays, allows adding by ID and keeps accounts separate', async t => {
    const now = '2028-02-28T00:00:00+08:00';
    const { w, plugin, row, mount, edit, enter, settingsSection } = await setup(t, now, saved(2, 29));
    const ui = await row(FRIEND);
    const key = 'dev.fluttershy2008.birthday-badge.valenced-settings';
    assert.equal(settingsSection.settings.filter(item => item === key).length, 1);
    const route = w.registeredScreens.get(key);
    assert.equal(route.useTitle(), 'Birthday Badge');
    assert.equal(route.usePredicate(), true);
    const headers = [];
    const settings = await mount(h(route.screen.getComponent(), { navigation: { setOptions: value => headers.push(value) } }));
    assert.equal(headers.at(-1).title, 'Birthday Badge');
    const savedRows = settings.root.findAllByType('TableRow');
    assert.equal(savedRows.length, 1);
    assert.equal(savedRows[0].props.label, 'Test Friend');
    assert.equal(cake(ui), '🎂 24h');
    const editor = await edit(button(settings, 'Add birthday by user ID').props.onPress);
    await enter(editor, { 'Discord user ID': BLOCKED, Month: '3', Day: '1' });
    await Renderer.act(async () => button(editor, 'Save').props.onPress());
    assert.deepEqual(plugin.writes.at(-1).accounts[ACCOUNT], {
        [FRIEND]: { month: 2, day: 29 }, [BLOCKED]: { month: 3, day: 1 },
    });
    assert.equal(settings.root.findAllByType('TableRow').length, 2);

    await Renderer.act(async () => w.setAccount(FRIEND));
    assert.equal(cake(ui), undefined);
    assert.equal(settings.root.findAllByType('TableRow').length, 0);
    await Renderer.act(async () => w.setAccount(ACCOUNT));
    assert.equal(cake(ui), '🎂 24h');
    await Renderer.act(async () => w.advance(day));
    assert.equal(cake(ui), '🎂 Today');
    await Renderer.act(async () => w.stop(plugin));
    assert.equal(route.usePredicate(), false);
    assert.ok(!settingsSection.settings.includes(key));
    assert.equal(cake(ui), undefined);
    assert.equal(w.appListeners.size, 0);
    assert.equal(w.timers.size, 0);
});
