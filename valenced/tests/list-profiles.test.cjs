'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, FRIEND, BLOCKED } = require('../../revenge-next/tests/next-harness.cjs');
const { installColdProfileModule } = require('./profile-fixture.cjs');
const { installSettingsSection } = require('./settings-fixture.cjs');
const h = React.createElement;
const PATH = 'modules/user_profile/native/showUserProfileActionSheet.tsx';
const OTHER = '200000000000000099';
const lists = [
    { slug: 'friends-list', title: 'Friends List', id: FRIEND, label: 'Open Test Friend’s profile' },
    { slug: 'blocked-user-list', title: 'Blocked User List', id: BLOCKED, label: 'Open Blocked User’s profile' },
];

function text(node) {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(text).join('');
    return node?.children ? text(node.children) : '';
}
function button(ui, label) {
    const node = ui.root.findAll(n => typeof n.type === 'string' && typeof n.props.onPress === 'function'
        && (n.props.accessibilityLabel === label || text(n) === label))[0];
    assert.ok(node, 'profile control exists: ' + label);
    return node.props.onPress;
}
async function press(callback) { await Renderer.act(async () => { callback(); }); }
function scenario(t) {
    const w = createWorld(), settings = installSettingsSection(w), renders = [];
    const relationships = { ...w.relationships };
    w.mount = async element => {
        let ui; await Renderer.act(async () => { ui = Renderer.create(element); });
        renders.push(ui); return ui;
    };
    w.openList = async slug => {
        const item = await w.start(slug);
        const key = 'dev.fluttershy2008.' + slug + '.valenced-settings';
        assert.ok(settings.section.settings.includes(key));
        const Page = w.registeredScreens.get(key).screen.getComponent();
        return { item, ui: await w.mount(h(Page)) };
    };
    t.after(async () => {
        for (const ui of renders.reverse()) await Renderer.act(async () => ui.unmount());
        for (const item of [...w.loaded.values()].reverse()) await w.stop(item);
        assert.deepEqual(settings.section.settings, settings.core);
        assert.deepEqual(w.relationships, relationships, 'profile controls do not change relationships');
        assert.equal(w.registeredScreens.size, 0);
        assert.equal(w.timers.size, 0);
        assert.equal(w.moduleWaiters.size, 0);
        assert.equal(w.pathWaiters.size, 0);
        assert.deepEqual(w.errors, []);
    });
    return w;
}

for (const list of lists) {
    for (const mode of ['cold', 'imported', 'namespace']) test(list.title + ' opens a profile through the ' + mode + ' anonymous native opener', async t => {
        const w = scenario(t), cold = installColdProfileModule(w);
        if (mode !== 'cold') w.addModule(cold.namespace, mode === 'imported' ? PATH : undefined);
        const { ui } = await w.openList(list.slug);
        assert.equal(cold.initializedFactories(), 0, 'startup does not initialize the profile module');
        assert.equal(w.calls.some(c => c[0] === 'profileOpened'), false);
        const labels = list.slug === 'blocked-user-list' ? [list.label, 'Profile'] : [list.label];
        for (const label of labels) await press(button(ui, label));
        const opened = w.calls.filter(c => c[0] === 'profileOpened');
        assert.equal(opened.length, labels.length);
        for (const call of opened) {
            assert.equal(call[1].userId, list.id);
            assert.equal(typeof call[1].userId, 'string');
            assert.equal(call[2], 'stack');
        }
        assert.equal(cold.initializedFactories(), mode === 'cold' ? 1 : 0);
        assert.equal(cold.unrelatedFactories(), 0);
        assert.equal(w.alerts.length, 0);
    });

    for (const reason of ['stop/restart', 'account switch']) test(list.title + ' invalidates saved profile callbacks after ' + reason, async t => {
        const w = scenario(t), cold = installColdProfileModule(w);
        const { item, ui } = await w.openList(list.slug);
        const callbacks = [button(ui, list.label)];
        if (list.slug === 'blocked-user-list') callbacks.push(button(ui, 'Profile'));
        if (reason === 'stop/restart') {
            await Renderer.act(async () => w.stop(item));
            await w.start(list.slug);
        } else await Renderer.act(async () => w.setAccount(OTHER));
        for (const callback of callbacks) await press(callback);
        assert.equal(cold.initializedFactories(), 0);
        assert.equal(cold.unrelatedFactories(), 0);
        assert.equal(w.calls.some(c => c[0] === 'profileOpened'), false);
        assert.equal(w.alerts.length, 0);
    });

    for (const reason of ['stop', 'account switch']) test(list.title + ' suppresses a late profile rejection after ' + reason, async t => {
        const w = scenario(t), cold = installColdProfileModule(w);
        let reject;
        const request = new Promise((_resolve, fail) => { reject = fail; });
        cold.namespace.default = (options, stack) => { w.calls.push(['profileOpened', options, stack]); return request; };
        const { item, ui } = await w.openList(list.slug);
        await press(button(ui, list.label));
        assert.equal(w.calls.filter(c => c[0] === 'profileOpened').length, 1);
        if (reason === 'stop') await Renderer.act(async () => w.stop(item));
        else await Renderer.act(async () => w.setAccount(OTHER));
        await Renderer.act(async () => { reject(new Error('Profile request failed after leaving the session')); });
        assert.equal(w.alerts.length, 0);
        assert.equal(cold.unrelatedFactories(), 0);
    });
}
