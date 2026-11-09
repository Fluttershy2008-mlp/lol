'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, Renderer, ACCOUNT, FRIEND } = require('../../revenge-next/tests/next-harness.cjs');
const { installSettingsSection } = require('./settings-fixture.cjs');

const categories = ['friends', 'requests', 'guilds', 'groups'];
function seed() {
    return Array.from({ length: 47 }, (_, i) => ({ id: String(BigInt(FRIEND) + BigInt(i)),
        category: categories[i % 4], name: `Pony ${i}`, text: `Saved change for Pony ${i}`,
        at: 1800000000000 - i * 1000, offline: i % 2 === 0 }));
}
const nodes = ui => ui.root.findAll(node => typeof node.type === 'string');
const button = (ui, label) => {
    const node = nodes(ui).find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
    assert.ok(node, label); return node;
};
const profiles = ui => nodes(ui).filter(node => node.props.accessibilityLabel?.startsWith('Open profile for'));
const search = ui => nodes(ui).find(node => node.type === 'TextInput');
async function press(ui, label) { await Renderer.act(async () => button(ui, label).props.onPress()); }
async function scenario(t, history = seed()) {
    const w = createWorld();
    const registry = installSettingsSection(w);
    const initial = { options: { notices: false }, accounts: { [ACCOUNT]: { snapshots: {}, manual: {}, history } } };
    const item = await w.start('relationship-notifier', initial);
    await w.advance(5000);
    const route = 'dev.fluttershy2008.relationship-notifier.valenced-settings';
    assert.ok(registry.section.settings.includes(route), 'Relationship Notifier is under Valenced settings');
    const Page = w.registeredScreens.get(route).screen.getComponent();
    let ui;
    await Renderer.act(async () => { ui = Renderer.create(w.React.createElement(Page)); });
    t.after(async () => {
        await Renderer.act(async () => ui.unmount()); await w.stop(item);
        assert.equal(w.timers.size, 0); assert.deepEqual(w.errors, []);
    });
    return { w, item, ui, history };
}

test('installed package filters and searches saved history, paginates, and retains exact profile/copy IDs', async t => {
    const { w, ui, item } = await scenario(t);
    assert.equal(profiles(ui).length, 10, 'only the first twenty changes are rendered');
    await press(ui, 'Show more notifications');
    assert.equal(profiles(ui).length, 20);
    await press(ui, 'Filter requests notifications');
    assert.equal(profiles(ui).length, 12);
    assert.ok(profiles(ui).every(node => Number(node.props.accessibilityLabel.split(' ').at(-1)) % 4 === 1));
    await Renderer.act(async () => search(ui).props.onChangeText('Pony 13'));
    assert.equal(profiles(ui).length, 1);
    const id = String(BigInt(FRIEND) + 13n);
    await press(ui, `Copy <@${id}>`);
    assert.deepEqual(w.clipboard, [`<@${id}>`]);
    await press(ui, 'Filter all notifications');
    await Renderer.act(async () => search(ui).props.onChangeText(id));
    assert.equal(profiles(ui).length, 1);
    await press(ui, 'Clear search');
    assert.equal(profiles(ui).length, 10, 'changing search resets pagination');
    assert.equal(item.api.jsonStorage.cache.accounts[ACCOUNT].history.length, 47);
    await Renderer.act(async () => search(ui).props.onChangeText('not a match'));
    assert.equal(profiles(ui).length, 0);
    assert.match(JSON.stringify(ui.toJSON()), /No matching notifications/);
});

test('all six Vencord options persist, test alerts do not pollute history, and clearing requires confirmation', async t => {
    const { w, ui, item } = await scenario(t);
    const switches = nodes(ui).filter(node => node.type === 'Switch');
    assert.equal(switches.length, 6);
    for (const node of switches) await Renderer.act(async () => node.props.onValueChange(!node.props.value));
    assert.deepEqual(item.api.jsonStorage.cache.options, {
        friends: false, friendRequestCancels: false, servers: false, groups: false, offlineRemovals: false, notices: true,
    });
    await press(ui, 'Test notification');
    assert.equal(item.api.jsonStorage.cache.accounts[ACCOUNT].history.length, 47);
    assert.ok(w.alerts.some(alert => alert[0] === 'RelationshipNotifier'));
    await press(ui, 'Clear notification history');
    assert.equal(item.api.jsonStorage.cache.accounts[ACCOUNT].history.length, 47);
    const confirm = w.alerts.at(-1)[2].find(action => action.text === 'Clear');
    await Renderer.act(async () => confirm.onPress());
    assert.equal(item.api.jsonStorage.cache.accounts[ACCOUNT].history.length, 0);
    assert.match(JSON.stringify(ui.toJSON()), /All quiet for now/);
    assert.equal(Object.keys(item.api.jsonStorage.cache.accounts[ACCOUNT].snapshots.friends).length, 1);
});

test('switching accounts shows that account history and resets search; old clear confirmation cannot delete it', async t => {
    const { w, ui, item } = await scenario(t);
    await Renderer.act(async () => search(ui).props.onChangeText('Pony 13'));
    await press(ui, 'Clear notification history');
    const oldConfirm = w.alerts.at(-1)[2].find(action => action.text === 'Clear');
    const other = '200000000000000099'; w.users[other] = { id: other, username: 'Other' };
    await Renderer.act(async () => { w.setAccount(other); await w.advance(6000); });
    assert.equal(search(ui).props.value, '');
    assert.equal(profiles(ui).length, 0);
    await Renderer.act(async () => oldConfirm.onPress());
    assert.equal(item.api.jsonStorage.cache.accounts[ACCOUNT].history.length, 47);
    assert.equal(item.api.jsonStorage.cache.accounts[other].history.length, 0);
});

test('new removals update an open history screen and preserve Vencord avatar information', async t => {
    const { w, ui, item } = await scenario(t, []);
    // Refresh the starting snapshot with an avatar before the removal.
    w.users[FRIEND].avatar = 'sample-avatar';
    await Renderer.act(async () => { await w.dispatcher.dispatch({ type: 'RELATIONSHIP_UPDATE' }); await w.advance(1000); });
    await Renderer.act(async () => { delete w.relationships[FRIEND]; await w.dispatcher.dispatch({ type: 'RELATIONSHIP_REMOVE' }); await w.advance(1000); });
    assert.equal(profiles(ui).length, 1);
    const entry = item.api.jsonStorage.cache.accounts[ACCOUNT].history[0];
    assert.equal(entry.id, FRIEND);
    assert.equal(entry.icon, `https://cdn.discordapp.com/avatars/${FRIEND}/sample-avatar.png?size=64`);
    assert.ok(nodes(ui).some(node => node.type === 'Image' && node.props.source.uri === entry.icon));
});
