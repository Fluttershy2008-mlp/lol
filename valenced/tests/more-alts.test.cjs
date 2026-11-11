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
        return method.endsWith('loadAccounts') ? JSON.stringify(options.vault ?? []) : true;
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
