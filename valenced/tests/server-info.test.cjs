'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, GUILD, FRIEND, ACCOUNT } = require('../../revenge-next/tests/next-harness.cjs');
const { installNavigationHost } = require('../../revenge-next/tests/navigation-fixture.cjs');
const { trackNativeWindows, installProfileSheetHost } = require('./server-info-fixture.cjs');
const { installColdProfileModule } = require('./profile-fixture.cjs');
const h = React.createElement;

async function scenario(t, options = {}) {
    const w = createWorld(options), renders = [];
    w.pageHost = installNavigationHost(w, { loadSettingsOnOpen: !!options.loadSettingsOnOpen });
    w.mount = async element => {
        let ui; await Renderer.act(async () => { ui = Renderer.create(element); });
        renders.push(ui); return ui;
    };
    w.hostRoot = await w.mount(h(w.pageHost.Root));
    w.openPage = async () => {
        const item = w.loaded.get('info-commands') ?? await w.start('info-commands');
        const settings = await w.mount(h(item.options.SettingsComponent, { api: item.api }));
        await Renderer.act(async () => { button(settings, 'Open current server info').props.onPress(); await w.advance(0); });
        return w.hostRoot;
    };
    t.after(async () => {
        for (const item of [...w.loaded.values()].reverse()) await Renderer.act(async () => w.stop(item));
        for (const ui of renders.reverse()) await Renderer.act(async () => ui.unmount());
        assert.equal(w.registeredScreens.size, 0, 'native route unregistered');
        assert.equal(w.pageHost.subscribers.size, 0, 'navigation subscriptions removed');
        assert.equal(w.timers.size, 0);
        assert.equal(w.pathWaiters.size, 0);
        assert.equal(Object.values(w.stores).reduce((n, store) => n + store.listeners.size, 0), 0);
        assert.deepEqual(w.pageHost.unhandled, []);
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
const profiles = w => w.calls.filter(call => call[0] === 'profileOpened');

test('Server Info never creates an alert host or a custom native Modal window', async t => {
    const w = await scenario(t);
    // Beta6 only removed the alert's React node; that is not proof the native
    // host released input. Forbid that presentation path altogether.
    Object.defineProperty(w.RN, 'Modal', { configurable: true, get() { throw new Error('Server Info must use its native navigator route'); } });
    w.U.discord.actions.AlertActionCreators.openAlert = () => { throw new Error('No Server Info alert host'); };
    w.RN.Alert.alert = () => { throw new Error('No Server Info OS dialog'); };
    const ui = await w.openPage();
    assert.ok(ui.root.findAll(node => node.props.testID === 'info-commands-server-page').length);
    assert.match(contents(ui), /Test Guild/);
    assert.equal(w.alerts.length, 0);
    assert.equal(w.pageHost.roots.at(-1).name, 'settings', 'route belongs to SettingsNavigator');
});

test('Server Info shows its banner, icon, counts and owner while requests stall', async t => {
    const w = await scenario(t, { curatedOnly: true, http: () => new Promise(() => {}) });
    w.sheets.openLazy = () => { throw new Error('Server Info must not use the invisible lazy-sheet path'); };
    w.U.discord.design.Design.TableRow = () => { throw new Error('No private sheet contexts'); };
    Object.assign(w.guilds[GUILD], { icon: 'server-icon', banner: 'a_server-banner', memberCount: 1264,
        onlineCount: 125, roles: { one: {}, two: {} }, premiumTier: 3, premiumSubscriptionCount: 24 });
    const ui = await w.openPage(), text = contents(ui);
    for (const label of ['Test Guild', 'Overview', 'Members', 'Online', 'Roles', 'Channels', 'Boost Level', 'Server', 'Owner', 'Created', 'ID', 'Friends in Server'])
        assert.ok(text.includes(label), label);
    for (const value of ['1,264', '125', 'Level 3', '24 boosts', GUILD]) assert.ok(text.includes(value), value);
    const images = ui.root.findAll(node => node.type === 'Image').map(node => node.props.source.uri);
    assert.ok(images.some(uri => uri.includes('banners/' + GUILD + '/a_server-banner.gif')));
    assert.ok(images.some(uri => uri.includes('icons/' + GUILD + '/server-icon.png')));
    assert.equal(ui.root.findByType('ScrollView').props.style.flex, 1);
    assert.notEqual(ui.root.findByType('ScrollView').props.scrollEnabled, false);
    await Renderer.act(async () => button(ui, 'ID').props.onPress());
    assert.equal(w.clipboard.at(-1), GUILD);
    await Renderer.act(async () => button(ui, 'Close server info').props.onPress());
    assert.equal(w.navigation.getCurrentRoute().name, 'Chat');
});

for (const theme of ['dark', 'light']) test('Server Info keeps ' + theme + ' appearance on a short native screen', async t => {
    const w = await scenario(t); w.stores.ThemeStore.theme = theme;
    w.RN.useWindowDimensions = () => ({ width: 800, height: 400 });
    const ui = await w.openPage();
    const page = ui.root.findAll(node => node.type === 'View' && node.props.testID === 'info-commands-server-page')[0];
    assert.equal(page.props.style.backgroundColor, theme === 'light' ? '#ffffff' : '#242429');
    assert.equal(page.props.style.flex, 1);
    assert.equal(ui.root.findAllByType('Modal').length, 0);
});

for (const dismiss of ['X', 'Android Back']) test('Owner profile ' + dismiss + ' returns to usable Server Info and then Discord', async t => {
    const w = await scenario(t), windows = trackNativeWindows(w), cold = installColdProfileModule(w);
    const native = installProfileSheetHost(w), profileUI = await w.mount(h(native.Root));
    const ui = await w.openPage();
    assert.equal(windows.size, 0, 'Server Info creates no native dialog window');
    await Renderer.act(async () => button(ui, 'Owner').props.onPress());
    assert.equal(profiles(w).length, 1);
    assert.equal(profiles(w)[0][1].userId, ACCOUNT);
    assert.equal(profiles(w)[0][1].guildId, GUILD);
    assert.equal(profiles(w)[0][2], 'stack');
    assert.equal(cold.initializedFactories(), 1);
    assert.equal(cold.unrelatedFactories(), 0);
    assert.equal(windows.size, 1, 'only Discord native profile is on top');
    assert.match(contents(ui), /Test Guild/, 'ordinary Server Info route stays underneath');
    await Renderer.act(async () => dismiss === 'X'
        ? button(profileUI, 'Close native profile').props.onPress()
        : profileUI.root.findByType('Modal').props.onRequestClose());
    assert.equal(native.sheets.size, 0);
    assert.equal(windows.size, 0, 'no native window remains to intercept touches');
    assert.notEqual(ui.root.findByType('ScrollView').props.scrollEnabled, false);
    await Renderer.act(async () => button(ui, 'ID').props.onPress());
    assert.equal(w.clipboard.at(-1), GUILD, 'the screen accepts a press after closing the profile');
    await Renderer.act(async () => w.navigation.goBack());
    await Renderer.act(async () => button(ui, 'Discord test control').props.onPress());
    assert.equal(w.pageHost.taps(), 1);
    assert.equal(w.alerts.length, 0);
});

test('Friend profiles use the same ordinary screen and preserve the exact user', async t => {
    const w = await scenario(t); installColdProfileModule(w);
    w.stores.GuildMemberStore.getMember = (guild, user) => guild === GUILD && user === FRIEND ? { nick: 'Server friend' } : undefined;
    const ui = await w.openPage();
    await Renderer.act(async () => button(ui, 'Server friend (Test Friend)').props.onPress());
    assert.equal(profiles(w)[0][1].userId, FRIEND);
    assert.equal(profiles(w)[0][1].guildId, GUILD);
    assert.ok(button(ui, 'Close server info'));
});

for (const exit of ['Close', 'Android Back']) test('Server Info ' + exit + ' releases data and invalidates old buttons', async t => {
    const w = await scenario(t); installColdProfileModule(w);
    const ui = await w.openPage();
    const owner = button(ui, 'Owner').props.onPress, copy = button(ui, 'ID').props.onPress;
    await Renderer.act(async () => exit === 'Close' ? button(ui, 'Close server info').props.onPress() : w.navigation.goBack());
    await Renderer.act(async () => { owner(); copy(); await w.advance(1000); });
    assert.equal(profiles(w).length, 0); assert.equal(w.clipboard.length, 0);
    assert.equal(w.timers.size, 0);
    assert.equal(Object.values(w.stores).reduce((n, store) => n + store.listeners.size, 0), 0);
    await w.openPage(); assert.ok(button(ui, 'Owner'));
});

test('Duplicate owner taps open one native profile without closing or stacking Server Info', async t => {
    const w = await scenario(t); installColdProfileModule(w);
    const ui = await w.openPage(), owner = button(ui, 'Owner').props.onPress;
    await Renderer.act(async () => { owner(); owner(); });
    assert.equal(profiles(w).length, 1);
    assert.equal(w.pageHost.stack.filter(route => route.params?.__infoCommandsPage).length, 1);
});

test('Stopping InfoCommands closes its focused native route and cancels stale controls', async t => {
    const w = await scenario(t), cold = installColdProfileModule(w), ui = await w.openPage();
    const owner = button(ui, 'Owner').props.onPress;
    await Renderer.act(async () => w.stop(w.loaded.get('info-commands')));
    await Renderer.act(async () => { owner(); await w.advance(1000); });
    assert.equal(cold.initializedFactories(), 0);
    assert.equal(w.registeredScreens.size, 0);
    assert.equal(w.navigation.getCurrentRoute().name, 'Chat');
});

test('Closing an inactive Server Info route never pops another Discord screen', async t => {
    const w = await scenario(t), ui = await w.openPage();
    const close = button(ui, 'Close server info').props.onPress;
    await Renderer.act(async () => w.navigation.navigate('UnrelatedProfile'));
    await Renderer.act(async () => { close(); await w.stop(w.loaded.get('info-commands')); });
    assert.equal(w.navigation.getCurrentRoute().name, 'UnrelatedProfile');
});

test('Changing the signed-in account closes and invalidates the Server Info screen', async t => {
    const w = await scenario(t), cold = installColdProfileModule(w), ui = await w.openPage();
    const owner = button(ui, 'Owner').props.onPress;
    await Renderer.act(async () => w.setAccount(FRIEND));
    await Renderer.act(async () => owner());
    assert.equal(cold.initializedFactories(), 0);
    assert.equal(w.navigation.getCurrentRoute().name, 'Chat');
});

test('Server Info loads the cold SettingsNavigator before navigating to its own route', async t => {
    const w = await scenario(t, { loadSettingsOnOpen: true }); w.setSettingsLoaded(false);
    const ui = await w.openPage(); assert.ok(button(ui, 'Owner'));
    assert.equal(w.pageHost.roots.at(-1).name, 'settings');
});

test('Back during cold Settings loading cancels late Server Info navigation', async t => {
    const w = await scenario(t); w.setSettingsLoaded(false);
    await w.openPage();
    assert.equal(w.navigation.getCurrentRoute().name, 'SettingsOverview');
    await Renderer.act(async () => w.navigation.goBack());
    await Renderer.act(async () => { w.setSettingsLoaded(true); await w.advance(9000); });
    assert.equal(w.navigation.getCurrentRoute().name, 'Chat');
    assert.equal(w.registeredScreens.size, 0);
    assert.equal(w.toasts.length, 0);
});

test('Unavailable native routing shows feedback without opening another popup', async t => {
    const w = await scenario(t); delete w.U.discord.modules.settings.registerSettingsItem;
    await w.openPage();
    assert.ok(w.toasts.some(text => /native screen navigation/.test(text)));
    assert.equal(w.alerts.length, 0); assert.equal(w.navigation.getCurrentRoute().name, 'Chat');
});

test('An unpresented native screen times out without a modal or a late reopen', async t => {
    const w = await scenario(t); w.navigation.navigate = () => {};
    await w.openPage();
    await Renderer.act(async () => w.advance(9000));
    assert.ok(w.toasts.some(text => /could not open/.test(text)));
    assert.equal(w.alerts.length, 0); assert.equal(w.timers.size, 0);
});

test('Unavailable guild errors stay inside the ordinary Server Info screen', async t => {
    const w = await scenario(t, { http: () => ({ body: null }) }); delete w.guilds[GUILD];
    const ui = await w.openPage();
    assert.match(contents(ui), /Server details are unavailable/);
    assert.ok(button(ui, 'Close server info')); assert.equal(w.alerts.length, 0);
});

test('Server Info waits for the root navigator and ignores repeated ready events', async t => {
    const w = await scenario(t), readyListeners = new Set(), addListener = w.navigation.addListener;
    let ready = false;
    w.navigation.isReady = () => ready;
    w.navigation.addListener = (event, callback) => event === 'ready'
        ? (readyListeners.add(callback), () => readyListeners.delete(callback)) : addListener(event, callback);
    const ui = await w.openPage();
    assert.equal(w.navigation.getCurrentRoute().name, 'Chat');
    await Renderer.act(async () => { ready = true; for (const callback of [...readyListeners]) callback(); await w.advance(0); });
    assert.ok(button(ui, 'Owner'));
    await Renderer.act(async () => { for (const callback of [...readyListeners]) callback(); await w.advance(0); });
    assert.equal(w.pageHost.stack.filter(route => route.params?.__infoCommandsPage).length, 1);
    await Renderer.act(async () => button(ui, 'Close server info').props.onPress());
    assert.equal(readyListeners.size, 0);
});

test('Stopping before native navigation is ready cancels registration and opening', async t => {
    const w = await scenario(t), readyListeners = new Set(), addListener = w.navigation.addListener;
    w.navigation.isReady = () => false;
    w.navigation.addListener = (event, callback) => event === 'ready'
        ? (readyListeners.add(callback), () => readyListeners.delete(callback)) : addListener(event, callback);
    await w.openPage();
    await Renderer.act(async () => w.stop(w.loaded.get('info-commands')));
    await Renderer.act(async () => { for (const callback of [...readyListeners]) callback(); await w.advance(9000); });
    assert.equal(readyListeners.size, 0); assert.equal(w.registeredScreens.size, 0);
    assert.equal(w.navigation.getCurrentRoute().name, 'Chat');
});

test('Native route registration failures remain visible without opening an alert', async t => {
    const w = await scenario(t);
    w.U.discord.modules.settings.registerSettingsItem = () => { throw new Error('Native settings unavailable'); };
    await w.openPage();
    assert.ok(w.toasts.some(text => /could not register/.test(text)));
    assert.equal(w.alerts.length, 0); assert.equal(w.timers.size, 0);
});

test('A rejecting native profile opener leaves the ordinary Server Info page usable', async t => {
    const w = await scenario(t), cold = installColdProfileModule(w);
    cold.namespace.default = () => { throw new Error('Native profile refused'); };
    const ui = await w.openPage();
    await Renderer.act(async () => button(ui, 'Owner').props.onPress());
    assert.ok(w.toasts.some(text => /Unable to open profile/.test(text)));
    await Renderer.act(async () => button(ui, 'ID').props.onPress());
    assert.equal(w.clipboard.at(-1), GUILD);
    assert.equal(w.alerts.length, 0); assert.equal(ui.root.findAllByType('Modal').length, 0);
});
