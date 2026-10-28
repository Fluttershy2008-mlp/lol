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
function button(ui, label) {
    const node = ui.root.findAll(n => typeof n.type === 'string' && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
    assert.ok(node, label); assert.notEqual(node.props.disabled, true, label + ' is enabled'); return node.props.onPress;
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
    assert.deepEqual(field(ui).props.value.split('\n'), [...MAIN, EXTRA]);
    const locked = ui.root.findAll(n => typeof n.type === 'string' && n.props.accessibilityLabel === 'Main protected');
    assert.equal(locked.length, 22); assert.ok(locked.every(n => n.props.disabled));
    await act(() => field(ui).props.onChangeText(EXTRA)); await act(button(ui, 'Save protected IDs'));
    assert.deepEqual(field(ui).props.value.split('\n'), [...MAIN, EXTRA]);
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
    assert.deepEqual(field(ui).props.value.split('\n'), MAIN);
    assert.ok(button(ui, 'Leave 1 unprotected servers'));
    assert.equal(w.calls.some(c => c[0] === 'http' && c[1] === 'del'), false);
});

test('Server Leaver keeps main IDs across account changes without sharing extra protected IDs', async t => {
    const w = scenario(t); w.guilds[EXTRA] = { id: EXTRA, name: 'Additional protected', ownerId: FRIEND };
    const item = await w.start('server-leaver', { accounts: { [ACCOUNT]: [EXTRA] } }), ui = await w.mount(item);
    assert.deepEqual(field(ui).props.value.split('\n'), [...MAIN, EXTRA]);
    await act(() => w.setAccount(FRIEND)); assert.deepEqual(field(ui).props.value.split('\n'), MAIN);
    await act(() => w.setAccount(ACCOUNT)); assert.deepEqual(field(ui).props.value.split('\n'), [...MAIN, EXTRA]);
    assert.equal(w.calls.some(c => c[0] === 'http' && c[1] === 'del'), false);
});
