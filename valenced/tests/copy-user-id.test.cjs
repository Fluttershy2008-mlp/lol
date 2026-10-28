'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, FRIEND, ACCOUNT } = require('../../revenge-next/tests/next-harness.cjs');
const PATH = 'modules/user_profile/native/UserProfileOverflowMenu.tsx';
const KEY = 'copy-user-id:author';
const h = React.createElement;

function scenario(t) {
    const w = createWorld(), renders = [];
    t.after(async () => {
        for (const ui of renders.reverse()) await Renderer.act(async () => ui.unmount());
        for (const item of [...w.loaded.values()].reverse()) await w.stop(item);
        assert.equal(w.timers.size, 0);
        assert.equal(w.pathWaiters.size, 0);
        assert.deepEqual(w.errors, []);
    });
    w.profile = async (ns, props) => {
        let ui;
        await Renderer.act(async () => { ui = Renderer.create(h(ns.default, props)); });
        renders.push(ui); return ui;
    };
    return w;
}
function profileModule(w, shape = 'plain', nativeCopy = false) {
    const originalAction = () => w.calls.push(['nativeCopy']);
    const main = Object.freeze([
        Object.freeze({ label: 'Add Friend Nickname', action() {} }),
        Object.freeze({ label: 'Copy Username', action() {} }),
        ...(nativeCopy ? [Object.freeze({ label: 'Copy User ID', action: originalAction })] : []),
        Object.freeze({ label: 'Apps', action() {} }),
    ]);
    const danger = Object.freeze([Object.freeze({ label: 'Block', variant: 'destructive', action() {} })]);
    const items = Object.freeze([main, danger]);
    const tree = () => h(React.Fragment, null, h(w.RN.View, null,
        h('ContextMenu', { items, children: () => h(w.RN.View) })));
    let component = function a() { return tree(); };
    if (shape === 'memo') component = React.memo(component);
    if (shape === 'forward') component = React.forwardRef(component);
    if (shape === 'nested') component = React.memo(React.forwardRef(component));
    if (shape === 'class') component = class extends React.Component { render() { return tree(); } };
    return { ns: { default: component }, component, items, danger, originalAction };
}
function menuItems(ui) {
    return ui.root.findByType('ContextMenu').props.items;
}
function copyItems(items) { return Array.from(items.flat()).filter(item => item?.id === KEY); }

for (const shape of ['plain', 'memo', 'forward', 'nested', 'class'])
    test('Copy User ID attaches to an unnamed imported ' + shape + ' profile menu', async t => {
        const w = scenario(t), { ns, component, items, danger } = profileModule(w, shape);
        w.addModule(ns, PATH);
        const item = await w.start('copy-user-id');
        const ui = await w.profile(ns, { user: { id: FRIEND } });
        const injected = menuItems(ui), copies = copyItems(injected);
        assert.equal(copies.length, 1);
        assert.equal(copies[0].label, 'Copy User ID\n' + FRIEND);
        assert.equal(injected[0][2], copies[0], 'inserted beside Copy Username');
        assert.equal(injected[1], danger, 'destructive options are preserved');
        assert.equal(items[0].length, 3, 'original frozen menu is unchanged');
        await copies[0].action();
        assert.deepEqual(w.clipboard, ['<@' + FRIEND + '>']);
        assert.equal(w.calls.some(c => c[0] === 'sendMessage'), false);
        await Renderer.act(async () => w.stop(item));
        assert.equal(ns.default, component);
        await copies[0].action();
        assert.equal(w.clipboard.length, 1, 'an old menu cannot copy after stop');
    });

test('Copy User ID attaches when the profile first loads after more than a minute', async t => {
    const w = scenario(t), { ns } = profileModule(w);
    await w.start('copy-user-id');
    await w.advance(120000);
    w.addModule(ns, PATH);
    const ui = await w.profile(ns, { userId: FRIEND });
    const copies = copyItems(menuItems(ui));
    assert.equal(copies.length, 1);
    await copies[0].action();
    assert.deepEqual(w.clipboard, ['<@' + FRIEND + '>']);
});

test('Copy User ID upgrades the existing native row without a second copy-ID entry', async t => {
    const w = scenario(t), { ns, items, originalAction } = profileModule(w, 'plain', true);
    w.addModule(ns, PATH);
    await w.start('copy-user-id');
    const ui = await w.profile(ns, { user: { id: FRIEND } });
    const injected = menuItems(ui);
    assert.equal(injected[0].length, items[0].length);
    assert.equal(injected[0].filter(item => /Copy User ID/.test(item.label)).length, 1);
    assert.equal(items[0][2].action, originalAction);
    await copyItems(injected)[0].action();
    assert.deepEqual(w.clipboard, ['<@' + FRIEND + '>']);
    assert.equal(w.calls.some(c => c[0] === 'nativeCopy'), false);
});

test('Copy User ID keeps each user and bot profile distinct and ignores unrelated IDs', async t => {
    const w = scenario(t), { ns } = profileModule(w);
    w.addModule(ns, PATH);
    await w.start('copy-user-id');
    const first = await w.profile(ns, { user: { id: FRIEND } });
    const bot = await w.profile(ns, { user: { id: ACCOUNT, bot: true } });
    await copyItems(menuItems(first))[0].action();
    await copyItems(menuItems(bot))[0].action();
    assert.deepEqual(w.clipboard, ['<@' + FRIEND + '>', '<@' + ACCOUNT + '>']);
    for (const props of [{ guildId: FRIEND }, { channelId: FRIEND }, { userId: Number(FRIEND) }]) {
        const ui = await w.profile(ns, props);
        assert.equal(copyItems(menuItems(ui)).length, 0);
    }
});

test('Copy User ID cancels profile subscriptions on stop and reconnects once on restart', async t => {
    const w = scenario(t), { ns, component } = profileModule(w);
    const first = await w.start('copy-user-id');
    assert.ok(w.pathWaiters.size > 0);
    await w.stop(first);
    assert.equal(w.pathWaiters.size, 0);
    w.addModule(ns, PATH);
    assert.equal(ns.default, component);
    const second = await w.start('copy-user-id');
    const ui = await w.profile(ns, { user: { id: FRIEND } });
    assert.equal(copyItems(menuItems(ui)).length, 1);
    await Renderer.act(async () => w.stop(second));
    assert.equal(ns.default, component);
});

test('Copy User ID ignores a queued profile-module callback after stop', async t => {
    const w = scenario(t), callbacks = [], { ns, component } = profileModule(w);
    w.U.discord.utils.modules.finders.getModuleWithImportedPath = (_path, callback) => { callbacks.push(callback); return () => {}; };
    const item = await w.start('copy-user-id');
    assert.equal(callbacks.length, 2);
    await w.stop(item);
    for (const callback of callbacks) callback(ns, 12345);
    assert.equal(ns.default, component);
    const ui = await w.profile(ns, { user: { id: FRIEND } });
    assert.equal(copyItems(menuItems(ui)).length, 0);
});
