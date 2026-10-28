'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, ACCOUNT, FRIEND } = require('./next-harness.cjs');
const { installSettingsSection } = require('../../valenced/tests/settings-fixture.cjs');
const MAIN = require('../../server-leaver/tests/main-ids.json');
const TARGET = '400000000000000002', EXTRA = '400000000000000003';
const h = React.createElement, isValenced = process.env.PLUGIN_TEST_TARGET === 'valenced';
async function act(fn = () => {}) { await Renderer.act(async () => { await fn(); for (let n = 0; n < 5; n++) await Promise.resolve(); }); }
function field(ui) { return ui.root.findAll(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'Protected server IDs')[0]; }
async function edit(ui) { await act(button(ui,'Edit protected IDs')); return field(ui); }
function button(ui, label) {
    const node = ui.root.findAll(n => typeof n.type === 'string' && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
    assert.ok(node, label); assert.notEqual(node.props.disabled, true, label + ' is enabled'); return node.props.onPress;
}
function preview(w, ui) { return ui.root.findByType(w.RN.FlatList).props; }
function protectButton(w, ui, id) {
    const index = preview(w, ui).data.findIndex(row => row.id === id);
    const buttons = ui.root.findAll(n => typeof n.type === 'string' &&
        ['Protect', 'Remove protection', 'Main protected'].includes(n.props.accessibilityLabel));
    assert.ok(index >= 0, 'server is visible in the preview');
    assert.notEqual(buttons[index].props.disabled, true); return buttons[index].props.onPress;
}
function scenario(t) {
    const w = createWorld({ splitHTTP: true }), registry = installSettingsSection(w), renders = [];
    w.guilds[TARGET] = { id: TARGET, name: 'Optional target', ownerId: FRIEND };
    w.mount = async item => {
        const Page = isValenced ? w.registeredScreens.get('dev.fluttershy2008.server-leaver.valenced-settings').screen.getComponent() : item.options.SettingsComponent;
        let ui; await act(() => { ui = Renderer.create(h(Page, { api: item.api })); }); renders.push(ui); return ui;
    };
    t.after(async () => {
        for (const ui of renders.reverse()) await act(() => ui.unmount());
        for (const item of [...w.loaded.values()].reverse()) await act(() => w.stop(item));
        assert.deepEqual(registry.section.settings, registry.core); assert.equal(w.registeredScreens.size, 0);
        assert.equal(w.timers.size, 0); assert.deepEqual(w.errors, []);
    });
    return w;
}

test('Server Leaver keeps all 22 main IDs and existing account protections through its native page', async t => {
    const w = scenario(t);
    for (const [n, id] of MAIN.entries()) w.guilds[id] = { id, name: 'Main ' + n, ownerId: FRIEND };
    w.guilds[EXTRA] = { id: EXTRA, name: 'Additional protected', ownerId: FRIEND };
    const item = await w.start('server-leaver', { accounts: { [ACCOUNT]: [EXTRA] } }), ui = await w.mount(item);
    await edit(ui);
    assert.deepEqual(field(ui).props.value.split('\n'), [...MAIN, EXTRA]);
    const locked = ui.root.findAll(n => typeof n.type === 'string' && n.props.accessibilityLabel === 'Main protected');
    assert.equal(locked.length, 22); assert.ok(locked.every(n => n.props.disabled));
    await act(() => field(ui).props.onChangeText(EXTRA)); await act(button(ui, 'Save protected IDs'));
    assert.equal(field(ui),undefined,'saving removes the editor from the preview'); await edit(ui);
    assert.deepEqual(field(ui).props.value.split('\n'), [...MAIN, EXTRA]);
    await act(button(ui,'Cancel editing'));
    assert.equal(w.calls.some(c => c[0] === 'http' && c[1] === 'del'), false);
    await act(button(ui, 'Leave 1 unprotected servers'));
    assert.equal(w.calls.some(c => c[0] === 'http' && c[1] === 'del'), false, 'preview still requires confirmation');
    await act(() => w.alerts.at(-1)[2].find(action => action.style === 'destructive').onPress());
    await act(() => w.advance(1500));
    const requests = w.calls.filter(c => c[0] === 'http' && c[1] === 'del');
    assert.deepEqual(requests.map(c => c[2].url), ['/users/@me/guilds/' + TARGET]);
});

test('Server Leaver main IDs absent from the joined guilds still allow a valid native preview', async t => {
    const w = scenario(t), item = await w.start('server-leaver'), ui = await w.mount(item);
    await edit(ui);
    assert.deepEqual(field(ui).props.value.split('\n'), MAIN);
    await act(button(ui,'Cancel editing'));
    assert.ok(button(ui, 'Leave 1 unprotected servers'));
    assert.equal(w.calls.some(c => c[0] === 'http' && c[1] === 'del'), false);
});

test('Server Leaver keeps main IDs across account changes without sharing extra protected IDs', async t => {
    const w = scenario(t); w.guilds[EXTRA] = { id: EXTRA, name: 'Additional protected', ownerId: FRIEND };
    const item = await w.start('server-leaver', { accounts: { [ACCOUNT]: [EXTRA] } }), ui = await w.mount(item);
    await edit(ui);
    assert.deepEqual(field(ui).props.value.split('\n'), [...MAIN, EXTRA]);
    const previousBack = ui.root.findByType('Modal').props.onRequestClose;
    await act(() => w.setAccount(FRIEND)); assert.equal(field(ui),undefined); await edit(ui); assert.deepEqual(field(ui).props.value.split('\n'), MAIN);
    await act(previousBack); assert.deepEqual(field(ui).props.value.split('\n'), MAIN,'an old account’s Back callback cannot change the new editor');
    await act(() => w.setAccount(ACCOUNT)); assert.equal(field(ui),undefined); await edit(ui); assert.deepEqual(field(ui).props.value.split('\n'), [...MAIN, EXTRA]);
    assert.equal(w.calls.some(c => c[0] === 'http' && c[1] === 'del'), false);
});

test('Server Leaver leaves rows in place when protecting and unprotecting servers in a long preview', async t => {
    const w = scenario(t);
    for (let i = 0; i < 195; i++) {
        const id = String(500000000000000000n + BigInt(i));
        w.guilds[id] = { id, name: 'Server ' + String(i).padStart(3, '0'), ownerId: FRIEND };
    }
    const item = await w.start('server-leaver'), ui = await w.mount(item);
    const original = preview(w, ui).data.map(row => row.id), list = ui.root.findByType(w.RN.FlatList);
    assert.equal(field(ui),undefined,'there is no editable text field in the scrolling preview');
    for (const index of [170, 80, 190]) {
        const id = original[index];
        await act(protectButton(w, ui, id));
        assert.deepEqual(preview(w, ui).data.map(row => row.id), original, 'Protect must not move the tapped row');
        assert.equal(preview(w, ui).data[index].reason, 'Protected');
        assert.equal(ui.root.findByType(w.RN.FlatList),list,'updating protection must not remount the list');
        assert.equal(field(ui),undefined,'Protect never mounts or focuses an ID editor');
        await act(button(ui, 'Refresh server list'));
        assert.deepEqual(preview(w, ui).data.map(row => row.id), original);
        await act(protectButton(w, ui, id));
        assert.deepEqual(preview(w, ui).data.map(row => row.id), original, 'removing protection must not move it either');
        assert.equal(preview(w, ui).data[index].reason, null);
    }
    assert.equal(w.calls.some(c => c[0] === 'http' && c[1] === 'del'), false);
});

test('Server Leaver edits IDs in a separate bounded dialog and restores the preview after save/cancel/back', async t => {
    const w = scenario(t), item = await w.start('server-leaver'), ui = await w.mount(item);
    let dismissals = 0; w.RN.Keyboard.dismiss = () => dismissals++;
    await act(protectButton(w, ui, TARGET));
    assert.equal(field(ui),undefined);
    await edit(ui);
    const height = w.RN.StyleSheet.flatten(field(ui).props.style).height;
    assert.ok(Number.isFinite(height) && height >= 100 && height <= 240, 'the ID editor must have a bounded height');
    assert.equal(ui.root.findAllByType('Modal').length,1);
    assert.ok(field(ui).props.value.split('\n').includes(TARGET));
    assert.equal(dismissals, 1, 'Protect must release a focused editor before replacing its text');
    await act(() => field(ui).props.onChangeText([...MAIN, TARGET].join('\n\n')));
    await act(button(ui, 'Save protected IDs'));
    assert.equal(field(ui),undefined); await edit(ui);
    assert.equal(w.RN.StyleSheet.flatten(field(ui).props.style).height,height);
    assert.equal(dismissals, 2);
    await act(() => field(ui).props.onChangeText(EXTRA));
    await act(ui.root.findByType('Modal').props.onRequestClose);
    assert.equal(field(ui),undefined); await edit(ui);
    assert.deepEqual(field(ui).props.value.split('\n'),[...MAIN,TARGET],'Android Back discards unsaved changes');
    await act(button(ui,'Cancel editing')); assert.equal(field(ui),undefined);
    assert.equal(preview(w,ui).data.find(row => row.id === TARGET).reason,'Protected');
});

test('Server Leaver stays idle while scrolling, updates from stores and removes its subscriptions', async t => {
    const w = scenario(t), OriginalList = w.RN.FlatList;
    let renders = 0;
    w.RN.FlatList = function ObservedList(props) { renders++; return h(OriginalList, props); };
    const beforeGuild = w.stores.GuildStore.listeners.size, beforeTheme = w.stores.ThemeStore.listeners.size;
    const item = await w.start('server-leaver'), ui = await w.mount(item);
    await act(protectButton(w, ui, TARGET));
    const afterProtect = renders;
    await act(() => w.advance(12000));
    assert.equal(renders, afterProtect, 'idle time must not repeatedly rebuild the scrolling preview');
    assert.equal([...w.timers.values()].some(timer => timer.interval), false);
    w.guilds[EXTRA] = { id: EXTRA, name: 'A new joined server', ownerId: FRIEND };
    await act(() => w.stores.GuildStore.emitChange());
    assert.ok(preview(w, ui).data.some(row => row.id === EXTRA), 'real server changes still update the preview');
    await act(() => { w.stores.ThemeStore.theme = 'light'; w.stores.ThemeStore.emitChange(); });
    assert.equal(preview(w, ui).style.backgroundColor, '#f2f3f5');
    await act(() => w.stop(item));
    assert.equal(w.stores.GuildStore.listeners.size, beforeGuild);
    assert.equal(w.stores.ThemeStore.listeners.size, beforeTheme);
});
