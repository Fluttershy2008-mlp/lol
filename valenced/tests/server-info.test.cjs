'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, GUILD, FRIEND, ACCOUNT } = require('../../revenge-next/tests/next-harness.cjs');
const { installServerPanelHost } = require('./server-info-fixture.cjs');
const { installColdProfileModule } = require('./profile-fixture.cjs');
const h = React.createElement;

async function scenario(t, options = {}) {
    const w = createWorld(options), renders = [], host = installServerPanelHost(w);
    w.hostRoot = await mount(h(host.Root));
    w.panelNodes = host.nodes;
    async function mount(element) {
        let ui; await Renderer.act(async () => { ui = Renderer.create(element); });
        renders.push(ui); return ui;
    }
    w.openPanel = async () => {
        const item = w.loaded.get('info-commands') ?? await w.start('info-commands');
        const settings = await mount(h(item.options.SettingsComponent, { api: item.api }));
        await Renderer.act(async () => button(settings, 'Open current server info').props.onPress());
        const modal = w.hostRoot.root.findByType('Modal');
        await Renderer.act(async () => modal.props.onShow());
        return w.hostRoot;
    };
    t.after(async () => {
        for (const item of [...w.loaded.values()].reverse()) await Renderer.act(async () => w.stop(item));
        assert.equal(host.nodes.size, 0, 'no custom panel remains mounted');
        for (const ui of renders.reverse()) await Renderer.act(async () => ui.unmount());
        assert.equal(w.timers.size, 0);
        assert.equal(w.pathWaiters.size, 0);
        assert.equal(Object.values(w.stores).reduce((n, store) => n + store.listeners.size, 0), 0);
        assert.deepEqual(w.errors, []);
    });
    return w;
}
function button(ui, label) {
    const nodes = ui.root.findAll(node => typeof node.type === 'string' && typeof node.props.onPress === 'function'
        && [node.props.accessibilityLabel, node.props.label, node.props.text, node.props.title].includes(label));
    assert.ok(nodes.length, label); return nodes[0];
}
const contents = ui => JSON.stringify(ui.toJSON());
const nativeDialogs = w => w.alerts.filter(alert => typeof alert[1] === 'string');

test('InfoCommands shows the requested banner, icon and grouped server rows before a stalled request completes', async t => {
    const w = await scenario(t, { curatedOnly: true, http: () => new Promise(() => {}) });
    // The old lazy-sheet path cannot present anything on this device.
    w.sheets.openLazy = () => {};
    // Discord's own table rows require contexts that a new Android Modal root
    // need not provide. The panel must use its own RN rows instead.
    function NativeRow() { throw new Error('Missing Discord gesture root'); }
    NativeRow.TrailingText = () => null;
    w.U.discord.design.Design.TableRow = NativeRow;
    w.U.discord.design.Design.TableRowGroup = () => { throw new Error('Missing Discord sheet context'); };
    Object.assign(w.guilds[GUILD], { icon: 'server-icon', banner: 'a_server-banner', memberCount: 1264,
        onlineCount: 125, roles: { one: {}, two: {} }, premiumTier: 3, premiumSubscriptionCount: 24 });
    const ui = await w.openPanel(), text = contents(ui);
    for (const label of ['Test Guild', 'Overview', 'Members', 'Online', 'Roles', 'Channels', 'Boost Level', 'Server', 'Owner', 'Created', 'ID', 'Friends in Server'])
        assert.ok(text.includes(label), label);
    for (const value of ['1,264', '125', 'Level 3', '24 boosts', GUILD]) assert.ok(text.includes(value), value);
    const images = ui.root.findAll(node => node.type === 'Image').map(node => node.props.source.uri);
    assert.ok(images.some(uri => uri.includes('banners/' + GUILD + '/a_server-banner.gif')));
    assert.ok(images.some(uri => uri.includes('icons/' + GUILD + '/server-icon.png')));
    const panel = ui.root.findAll(node => node.type === 'View' && node.props.testID === 'info-commands-server-panel')[0];
    assert.ok(panel.props.style.height > 500 && panel.props.style.height < 900);
    assert.equal(panel.props.style.borderTopLeftRadius, 24);
    assert.equal(ui.root.findByType('ScrollView').props.style.flex, 1);
    assert.equal(nativeDialogs(w).length, 0, 'no white Android details dialog');
    await Renderer.act(async () => button(ui, 'ID').props.onPress());
    assert.equal(w.clipboard.at(-1), GUILD);
    await Renderer.act(async () => button(ui, 'Close server info').props.onPress());
    assert.equal(w.panelNodes.size, 0);
});

for (const theme of ['dark', 'light']) test('InfoCommands panel respects ' + theme + ' appearance and fits a short window', async t => {
    const w = await scenario(t);
    w.stores.ThemeStore.theme = theme;
    w.RN.useWindowDimensions = () => ({ width: 800, height: 400 });
    const ui = await w.openPanel();
    const panel = ui.root.findAll(node => node.type === 'View' && node.props.testID === 'info-commands-server-panel')[0];
    assert.equal(panel.props.style.backgroundColor, theme === 'light' ? '#ffffff' : '#242429');
    assert.ok(panel.props.style.height > 200 && panel.props.style.height < 400);
    assert.equal(ui.root.findByType('Modal').props.transparent, true);
});

test('InfoCommands closes the panel before opening its owner through the cold profile resolver', async t => {
    const w = await scenario(t), cold = installColdProfileModule(w);
    const ui = await w.openPanel();
    await Renderer.act(async () => button(ui, 'Owner').props.onPress());
    assert.equal(w.panelNodes.size, 0);
    assert.equal(cold.initializedFactories(), 0, 'wait for the modal to dismiss');
    await Renderer.act(async () => w.advance(180));
    const opened = w.calls.find(call => call[0] === 'profileOpened');
    assert.equal(opened[1].userId, ACCOUNT);
    assert.equal(opened[1].guildId, GUILD);
    assert.equal(opened[2], 'stack');
    assert.equal(cold.initializedFactories(), 1);
    assert.equal(cold.unrelatedFactories(), 0);
});

test('InfoCommands friend rows display cached members and open that friend, not the owner', async t => {
    const w = await scenario(t), cold = installColdProfileModule(w);
    w.stores.GuildMemberStore.getMember = (guild, user) => guild === GUILD && user === FRIEND ? { nick: 'Server friend' } : undefined;
    const ui = await w.openPanel();
    await Renderer.act(async () => button(ui, 'Server friend (Test Friend)').props.onPress());
    await Renderer.act(async () => w.advance(180));
    const opened = w.calls.find(call => call[0] === 'profileOpened');
    assert.equal(opened[1].userId, FRIEND);
    assert.equal(opened[1].guildId, GUILD);
    assert.equal(cold.unrelatedFactories(), 0);
});

for (const action of ['back', 'backdrop']) test('InfoCommands closes on ' + action + ' and can reopen without stacking panels', async t => {
    const w = await scenario(t), ui = await w.openPanel();
    await Renderer.act(async () => action === 'back'
        ? ui.root.findByType('Modal').props.onRequestClose()
        : button(ui, 'Dismiss server info').props.onPress());
    assert.equal(w.panelNodes.size, 0);
    await w.openPanel();
    assert.equal(w.panelNodes.size, 1);
    const item = w.loaded.get('info-commands');
    await Renderer.act(async () => w.stop(item));
    assert.equal(w.panelNodes.size, 0);
    assert.equal(w.timers.size, 0);
});

test('InfoCommands cancels an owner action queued before the plugin stops', async t => {
    const w = await scenario(t), cold = installColdProfileModule(w);
    const ui = await w.openPanel();
    await Renderer.act(async () => button(ui, 'Owner').props.onPress());
    await Renderer.act(async () => w.stop(w.loaded.get('info-commands')));
    await Renderer.act(async () => w.advance(1000));
    assert.equal(cold.initializedFactories(), 0);
    assert.equal(w.calls.some(call => call[0] === 'profileOpened'), false);
});

test('InfoCommands stops already-open copy and profile actions when disabled', async t => {
    const w = await scenario(t), cold = installColdProfileModule(w);
    const ui = await w.openPanel();
    const copy = button(ui, 'ID').props.onPress, owner = button(ui, 'Owner').props.onPress;
    await Renderer.act(async () => w.stop(w.loaded.get('info-commands')));
    await Renderer.act(async () => { copy(); owner(); await w.advance(1000); });
    assert.equal(w.clipboard.length, 0);
    assert.equal(cold.initializedFactories(), 0);
    assert.equal(w.panelNodes.size, 0);
});

test('InfoCommands keeps an unavailable-server error inside the themed panel', async t => {
    const w = await scenario(t, { http: () => ({ body: null }) });
    delete w.guilds[GUILD];
    const ui = await w.openPanel();
    assert.match(contents(ui), /Server details are unavailable/);
    assert.equal(nativeDialogs(w).length, 0);
    assert.ok(button(ui, 'Close server info'));
});
