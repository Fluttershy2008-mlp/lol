'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, Renderer, ACCOUNT } = require('../../revenge-next/tests/next-harness.cjs');
const { installSettingsSection } = require('./settings-fixture.cjs');
const { installColdProfileModule } = require('./profile-fixture.cjs');
const ID = '858884403258064896';
const PATH = 'modules/user_profile/native/showUserProfileActionSheet.tsx';
async function scenario(t, mode = 'cold') {
    const w = createWorld(), cold = installColdProfileModule(w);
    const registry = installSettingsSection(w);
    const relationships = { ...w.relationships };
    if (mode !== 'cold') w.addModule(cold.namespace, mode === 'imported' ? PATH : undefined);
    const initial = { accounts: { [ACCOUNT]: { snapshots: {}, manual: {}, history: [
        { id: ID, category: 'friends', name: '2livelyy', text: 'You are no longer friends with 2livelyy.', at: 1800000000000, offline: true },
    ] } } };
    const item = await w.start('relationship-notifier', initial);
    await w.advance(5000);
    const route = 'dev.fluttershy2008.relationship-notifier.valenced-settings';
    assert.ok(registry.section.settings.includes(route), 'Relationship Notifier is under Valenced settings');
    const Page = w.registeredScreens.get(route).screen.getComponent();
    let ui;
    await Renderer.act(async () => { ui = Renderer.create(w.React.createElement(Page)); });
    const callback = ui.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Open profile for 2livelyy')[0]?.props.onPress;
    assert.equal(typeof callback, 'function');
    t.after(async () => {
        await Renderer.act(async () => ui.unmount());
        for (const running of [...w.loaded.values()].reverse()) await w.stop(running);
        assert.deepEqual(w.relationships, relationships);
        assert.equal(w.timers.size, 0); assert.equal(w.moduleWaiters.size, 0); assert.equal(w.pathWaiters.size, 0);
        assert.deepEqual(w.errors, []);
    });
    return { w, cold, item, initial, ui, callback };
}
for (const mode of ['cold', 'imported', 'namespace']) test('RelationshipNotifier opens an uncached removed friend using the ' + mode + ' anonymous profile module', async t => {
    const { w, cold, item, callback } = await scenario(t, mode);
    assert.equal(w.users[ID], undefined, 'removed user is not cached');
    assert.equal(cold.initializedFactories(), 0, 'opening settings does not initialize profile factories');
    await Renderer.act(async () => { await callback(); });
    const opened = w.calls.filter(call => call[0] === 'profileOpened');
    assert.equal(opened.length, 1);
    assert.equal(opened[0][1].userId, ID);
    assert.equal(typeof opened[0][1].userId, 'string');
    assert.equal(opened[0][2], 'stack');
    assert.equal(cold.initializedFactories(), mode === 'cold' ? 1 : 0);
    assert.equal(cold.unrelatedFactories(), 0);
    assert.equal(w.alerts.length, 0);
    assert.equal(item.api.jsonStorage.cache.accounts[ACCOUNT].history.length, 1);
});
for (const reason of ['stop/restart', 'account switch']) test('RelationshipNotifier ignores old profile callbacks after ' + reason, async t => {
    const { w, cold, item, initial, callback } = await scenario(t);
    if (reason === 'stop/restart') {
        await Renderer.act(async () => w.stop(item));
        await w.start('relationship-notifier', initial);
    } else await Renderer.act(async () => w.setAccount('200000000000000099'));
    await Renderer.act(async () => { await callback(); });
    assert.equal(cold.initializedFactories(), 0);
    assert.equal(w.calls.some(call => call[0] === 'profileOpened'), false);
    assert.equal(w.alerts.length, 0);
});
for (const reason of ['stop', 'account switch']) test('RelationshipNotifier suppresses a late profile error after ' + reason, async t => {
    const { w, cold, item, callback } = await scenario(t);
    let reject;
    const request = new Promise((_resolve, fail) => { reject = fail; });
    cold.namespace.default = (options, stack) => { w.calls.push(['profileOpened', options, stack]); return request; };
    let pending;
    await Renderer.act(async () => { pending = callback(); });
    assert.equal(w.calls.filter(call => call[0] === 'profileOpened').length, 1);
    if (reason === 'stop') await Renderer.act(async () => w.stop(item));
    else await Renderer.act(async () => w.setAccount('200000000000000099'));
    await Renderer.act(async () => { reject(new Error('Late profile request failure')); await pending; });
    assert.equal(w.alerts.length, 0);
    assert.equal(cold.unrelatedFactories(), 0);
});
