'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createWorld, React, Renderer, CHANNEL, FRIEND, GUILD } = require('../../revenge-next/tests/next-harness.cjs');
const { createLegacyAdapter } = require('../runtime.cjs');
const { installColdProfileModule } = require('./profile-fixture.cjs');
const { installServerPanelHost } = require('./server-info-fixture.cjs');
const ROOT = path.resolve(__dirname, '..');
const h = React.createElement;

function scenario(t, options) {
    const world = createWorld(options), renders = [];
    t.after(async () => {
        for (const ui of renders.reverse()) await Renderer.act(async () => ui.unmount());
        for (const item of [...world.loaded.values()].reverse()) await world.stop(item);
        assert.equal(world.timers.size, 0);
        assert.equal(world.moduleWaiters.size, 0);
        assert.equal(world.pathWaiters.size, 0);
        assert.deepEqual(world.errors, []);
    });
    world.mount = async element => {
        let ui; await Renderer.act(async () => { ui = Renderer.create(element); });
        renders.push(ui); return ui;
    };
    return world;
}
function button(ui, title) {
    const found = ui.root.findAll(n => typeof n.type === 'string' && typeof n.props.onPress === 'function'
        && [n.props.accessibilityLabel, n.props.title, n.props.text].includes(title));
    assert.ok(found.length, title);
    return found[0];
}

test('every package evaluates through the actual lexical Valenced loader contract', () => {
    for (const slug of fs.readdirSync(path.join(ROOT, '.build/plugins'))) {
        const script = fs.readFileSync(path.join(ROOT, '.build/plugins', slug, 'index.js'), 'utf8');
        const sandbox = {};
        const factory = vm.runInNewContext('(function(valenced, plugin) { return ' + script + '\n})', sandbox);
        const options = factory({}, value => value)?.default;
        assert.ok(options && typeof options === 'object', slug);
        assert.ok(typeof options.start === 'function' || typeof options.preInit === 'function', slug);
        assert.equal(sandbox.valenced, undefined);
        assert.equal(sandbox.vendetta, undefined);
        assert.equal(sandbox.revenge, undefined);
    }
});

test('Only More Alts embeds its Valenced QR native-module bridge', () => {
    const read = slug => fs.readFileSync(path.join(ROOT, '.build/plugins', slug, 'index.js'), 'utf8');
    assert.match(read('more-alts'), /getQrRuntimeClient:/);
    assert.doesNotMatch(read('info-commands'), /getQrRuntimeClient:/);
});

test('Addon List requests the Valenced native registry and recognises native themes', async t => {
    const w = scenario(t), item = await w.start('addon-list');
    w.U.modules.native.callNativeMethod = async (name, args) => {
        assert.equal(name, 'valenced.plugins.list'); assert.deepEqual(args, []);
        return { result: [{ manifest: { id: 'test.theme', name: 'Test theme', author: 'Tester',
            dependencies: { 'valenced.api.themes': { version: '*' } } }, source: { repo: 'https://example.test/themes.json' } }] };
    };
    const bridge = createLegacyAdapter(item.api, { id: 'test', legacyManifest: {}, host: 'valenced' }, w.host);
    t.after(() => bridge.dispose());
    const themes = await bridge.adapter.storage.awaitSyncWrapper(bridge.adapter.themes.themes);
    assert.equal(themes['test.theme'].data.name, 'Test theme');
    assert.equal(themes['test.theme'].id, 'https://example.test/themes.json');
    assert.equal(Object.keys(bridge.adapter.plugins.plugins).length, 0);
});

for (const shape of ['plain', 'memo', 'forward', 'nested']) test('AutoText live composer supports ' + shape + ' exports on Valenced', async t => {
    const w = scenario(t);
    let draft = '';
    const target = { getText: () => draft,
        handleTextChanged(value) { draft = value; },
        insertText(text, start, _space, _nodes, end) {
            draft = draft.slice(0, start) + text + draft.slice(end);
            this.handleTextChanged(draft);
        } };
    const inputRef = { current: target };
    function UnnamedInput() {
        return h(w.RN.View, { collapsable: false, onStartShouldSetResponder() {}, onResponderRelease() {} },
            h(w.RN.View, null,
                h(w.RN.TextInput, { onSelectionOrTextChange() {} }),
                h(w.RN.View, { chatInputRef: inputRef })));
    }
    function Guard({ children }) { return children; }
    let component = UnnamedInput;
    if (shape === 'memo') component = React.memo(component);
    if (shape === 'forward' || shape === 'nested') component = React.forwardRef(UnnamedInput);
    if (shape === 'nested') component = React.memo(component);
    const namespace = { default: component };
    w.addModule(namespace, 'modules/chat_input/native/ChatInput.tsx');
    const item = await w.start('auto-text');
    const ui = await w.mount(h(Guard, null, h(namespace.default, { channelId: CHANNEL })));
    assert.ok(button(ui, 'AutoType'));
    assert.ok(button(ui, 'Phrases'));
    for (const value of [';', ';b', ';br', ';brb'])
        await Renderer.act(async () => { target.handleTextChanged(value); await w.advance(0); });
    assert.equal(draft, 'Be right back!');
    await Renderer.act(async () => w.stop(item));
    assert.equal(namespace.default, component);
    let inner = namespace.default;
    while (typeof inner !== 'function') inner = inner.type ?? inner.render;
    assert.equal(inner, UnnamedInput);
});

for (const body of ['raw', 'string', 'wrapped']) test('Valid User resolves uncached ' + body + ' responses on Valenced', async t => {
    const id = '1332879948079431743';
    const user = { id, username: 'resolved-valenced-user' };
    const w = scenario(t, { splitHTTP: true, http(method, input) {
        assert.equal(method, 'get'); assert.equal(input.url, '/users/' + id);
        return { status: 200, body: body === 'raw' ? user : body === 'string' ? JSON.stringify(user) : { user } };
    } });
    w.messages.push({ id: '900000000000000002', channel_id: CHANNEL, content: '<@' + id + '>' });
    await w.start('valid-user');
    await w.advance(0);
    for (let n = 0; n < 10; n++) await Promise.resolve();
    const updates = w.calls.filter(call => call[0] === 'dispatch' && call[1].type === 'USER_UPDATE');
    assert.equal(updates.length, 1);
    assert.equal(updates[0][1].user.id, id);
    assert.equal(w.calls.some(call => call[0] === 'dispatch' && call[1].type === 'MESSAGE_UPDATE'), false);
});

test('Valid User exposes unavailable and missing accounts without a success claim', async t => {
    for (const status of [403, 404]) {
        const w = scenario(t, { splitHTTP: true, http: () => ({ status, body: { code: status === 404 ? 10013 : 50001 } }) });
        const item = await w.start('valid-user');
        const ui = await w.mount(h(item.options.SettingsComponent, { api: item.api }));
        const input = ui.root.findAll(n => n.type === 'TextInput')[0];
        await Renderer.act(async () => input.props.onChangeText('1562254712479162509'));
        await Renderer.act(async () => button(ui, 'Resolve user').props.onPress());
        const text = JSON.stringify(ui.toJSON());
        assert.match(text, status === 403 ? /refused this lookup/ : /could not find this user/);
        assert.equal(w.calls.some(call => call[0] === 'dispatch' && call[1].type === 'USER_UPDATE'), false);
    }
});

test('HTTP lookups select HTTPUtils before the tracked get/post/delete wrapper', async t => {
    const w = scenario(t, { splitHTTP: true });
    let trackedRequests = 0;
    const tracked = { get() { trackedRequests++; throw new TypeError('Missing trackedActionData'); }, post() {}, del() {} };
    w.modules.unshift({ default: tracked });
    const item = await w.start('valid-user');
    const bridge = createLegacyAdapter(item.api, { id: 'http-test', legacyManifest: {} }, w.host);
    t.after(() => bridge.dispose());
    const http = bridge.adapter.metro.findByProps('get', 'post');
    const response = await http.get({ url: '/users/' + FRIEND });
    assert.equal(response.body.id, FRIEND);
    assert.equal(trackedRequests, 0);
});

test('Valid User resolves the screenshot ID even when TrackedHTTPUtils is the first match', async t => {
    const id = '1562254712479162509';
    const w = scenario(t, { splitHTTP: true, http(method, input) {
        assert.equal(method, 'get'); assert.equal(input.url, '/users/' + id);
        assert.equal(input.oldFormErrors, true);
        assert.equal(input.failImmediatelyWhenRateLimited, true);
        return { status: 200, body: { id, username: 'visible-user' } };
    } });
    let trackedRequests = 0;
    w.modules.unshift({ default: { get() { trackedRequests++; throw new TypeError('Missing trackedActionData'); }, post() {}, del() {} } });
    w.messages.push({ channel_id: CHANNEL, content: '<@' + id + '>' });
    await w.start('valid-user'); await w.advance(0);
    for (let n = 0; n < 12; n++) await Promise.resolve();
    assert.equal(w.calls.filter(c => c[0] === 'dispatch' && c[1].type === 'USER_UPDATE' && c[1].user.id === id).length, 1);
    assert.equal(trackedRequests, 0);
});

test('AutoText can find an unnamed composer after more than thirty seconds', async t => {
    const w = scenario(t), item = await w.start('auto-text');
    await w.advance(60000);
    let draft = '';
    const target = { getText: () => draft, handleTextChanged(value) { draft = value; },
        insertText(text, start, _space, _nodes, end) { draft = draft.slice(0, start) + text + draft.slice(end); this.handleTextChanged(draft); } };
    const inputRef = { current: target };
    const component = React.memo(function a() {
        return h(w.RN.View, { collapsable: false, onStartShouldSetResponder() {}, onResponderRelease() {} },
            h(w.RN.TextInput, { onSelectionOrTextChange() {} }), h(w.RN.View, { chatInputRef: inputRef }));
    });
    const ns = { default: component };
    w.addModule(ns, 'modules/chat_input/native/ChatInput.tsx');
    const ui = await w.mount(h(ns.default, { channelId: CHANNEL }));
    assert.ok(button(ui, 'AutoType'));
    assert.ok(button(ui, 'Start bullet list'));
    await Renderer.act(async () => button(ui, 'Start bullet list').props.onPress());
    assert.equal(draft, '- ');
    await Renderer.act(async () => w.stop(item));
    assert.equal(w.pathWaiters.size, 0);
    assert.equal(component.type.name, 'a');
});

test('AutoText types a full prepared multiline message through the imported composer', async t => {
    const w = scenario(t);
    let draft = '', sends = 0;
    const target = { getText: () => draft, handleTextChanged(value) { draft = value; },
        insertText(text, start, _space, _nodes, end) { draft = draft.slice(0, start) + text + draft.slice(end); this.handleTextChanged(draft); },
        handleSend() { sends++; } };
    const inputRef = { current: target };
    const ns = { default: React.memo(function a() {
        return h(w.RN.View, { collapsable: false, onStartShouldSetResponder() {}, onResponderRelease() {} },
            h(w.RN.TextInput, { onSelectionOrTextChange() {} }), h(w.RN.View, { chatInputRef: inputRef }));
    }) };
    w.addModule(ns, 'modules/chat_input/native/ChatInput.tsx');
    await w.start('auto-text');
    const ui = await w.mount(h(ns.default, { channelId: CHANNEL }));
    await Renderer.act(async () => button(ui, 'AutoType').props.onPress());
    const field = ui.root.findAll(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'Message to type')[0];
    await Renderer.act(async () => field.props.onChangeText('- One\n- Two'));
    await Renderer.act(async () => button(ui, 'Start typing').props.onPress());
    await Renderer.act(async () => w.advance(5000));
    assert.equal(draft, '- One\n- Two');
    assert.equal(sends, 0);
});

test('InfoCommands opens the themed panel from an unnamed late-loaded server menu', async t => {
    const w = scenario(t, { curatedOnly: true, http: () => new Promise(() => {}) });
    const host = installServerPanelHost(w), panel = await w.mount(h(host.Root));
    // A successful openLazy invocation can still leave no visible sheet on a device.
    w.sheets.openLazy = () => {};
    await w.start('info-commands');
    const original = Object.freeze([{ label: 'Notifications', action() {} }]);
    const menu = { default: function a() { return original; } };
    w.addModule(menu, 'modules/guilds_bar/native/utils/getGuildsBarGuildMenuItems.tsx');
    const items = menu.default(GUILD);
    const info = items.find(item => item.label === 'Server Info');
    assert.ok(info);
    assert.equal(original.length, 1);
    await Renderer.act(async () => { info.action(); await w.advance(180); });
    await Renderer.act(async () => panel.root.findByType('Modal').props.onShow());
    assert.match(JSON.stringify(panel.toJSON()), /Test Guild/);
    assert.match(JSON.stringify(panel.toJSON()), new RegExp(GUILD));
    assert.equal(w.alerts.some(alert => typeof alert[1] === 'string'), false);
    await Renderer.act(async () => button(panel, 'ID').props.onPress());
    assert.equal(w.clipboard.at(-1), GUILD);
    await Renderer.act(async () => button(panel, 'Close server info').props.onPress());
    await Renderer.act(async () => { info.action(); await w.advance(180); });
    assert.equal(host.nodes.size, 1);
});

test('InfoCommands settings offer a working current-server details button', async t => {
    const w = scenario(t), item = await w.start('info-commands');
    const host = installServerPanelHost(w), panel = await w.mount(h(host.Root));
    const ui = await w.mount(h(item.options.SettingsComponent, { api: item.api }));
    await Renderer.act(async () => button(ui, 'Open current server info').props.onPress());
    assert.match(JSON.stringify(panel.toJSON()), /Test Guild/);
    assert.ok(button(panel, 'ID'));
    assert.ok(button(panel, 'Close server info'));
    assert.ok(JSON.stringify(ui.toJSON()).includes(item.manifest.version));
});

test('InfoCommands local user-info output remains local on Valenced', async t => {
    const w = scenario(t, { splitHTTP: true });
    await w.start('info-commands');
    const cmd = w.commands.getBuiltInCommands(1).find(c => c.name === 'userinfo');
    assert.ok(cmd);
    for (const ephemeral of [false, true]) await cmd.execute([
        { name: 'user_id', value: FRIEND }, { name: 'ephemeral', value: ephemeral },
    ], { channel: { id: CHANNEL } });
    assert.equal(w.calls.filter(c => c[0] === 'receiveMessage').length, 2);
    assert.equal(w.calls.some(c => c[0] === 'sendMessage'), false);
});

test('stopping InfoCommands cancels pending path subscriptions and button actions', async t => {
    const w = scenario(t), item = await w.start('info-commands');
    const menu = { default: function a() { return []; } };
    w.addModule(menu, 'modules/guilds_bar/native/utils/getGuildsBarGuildMenuItems.tsx');
    const info = menu.default(GUILD).find(item => item.label === 'Server Info');
    info.action(); await w.stop(item); await w.advance(2000);
    assert.equal(w.alerts.length, 0);
    assert.equal(w.pathWaiters.size, 0);
    const restarted = await w.start('info-commands');
    info.action(); await w.advance(2000);
    assert.equal(w.alerts.length, 0);
    await w.stop(restarted);
});

test('the Owner row loads an anonymous default profile opener on the first tap', async t => {
    const w = scenario(t), cold = installColdProfileModule(w);
    const host = installServerPanelHost(w), panel = await w.mount(h(host.Root));
    const item = await w.start('info-commands');
    const ui = await w.mount(h(item.options.SettingsComponent, { api: item.api }));
    await Renderer.act(async () => button(ui, 'Open current server info').props.onPress());
    const owner = button(panel, 'Owner');
    assert.ok(owner);
    assert.equal(cold.initializedFactories(), 0);
    await Renderer.act(async () => { owner.props.onPress(); await w.advance(180); });
    const opened = w.calls.filter(c => c[0] === 'profileOpened');
    assert.equal(opened.length, 1);
    assert.equal(opened[0][1].userId, w.accountId());
    assert.equal(opened[0][1].guildId, GUILD);
    assert.equal(opened[0][2], 'stack');
    assert.equal(cold.initializedFactories(), 1);
    assert.equal(cold.unrelatedFactories(), 0);
    assert.equal(w.toasts.some(text => /unavailable/i.test(text)), false);
});

test('Valid User Open profile loads its default opener when no profile was opened before', async t => {
    const w = scenario(t), cold = installColdProfileModule(w);
    const item = await w.start('valid-user');
    const ui = await w.mount(h(item.options.SettingsComponent, { api: item.api }));
    const input = ui.root.findAll(n => n.type === 'TextInput')[0];
    await Renderer.act(async () => input.props.onChangeText(FRIEND));
    await Renderer.act(async () => button(ui, 'Resolve user').props.onPress());
    assert.equal(cold.initializedFactories(), 0);
    await Renderer.act(async () => button(ui, 'Open profile').props.onPress());
    const opened = w.calls.filter(c => c[0] === 'profileOpened');
    assert.equal(opened.length, 1);
    assert.equal(opened[0][1].userId, FRIEND);
    assert.equal(opened[0][2], 'stack');
    assert.equal(cold.initializedFactories(), 1);
    assert.equal(cold.unrelatedFactories(), 0);
    assert.equal(w.toasts.some(text => /unavailable/i.test(text)), false);
});

test('Valid User native result dialog opens a profile through the same resolver', async t => {
    const w = scenario(t), cold = installColdProfileModule(w);
    await w.start('valid-user');
    const Row = w.U.discord.design.Design.ActionSheetRow;
    const context = { message: { content: '<@' + FRIEND + '>', channel_id: CHANNEL } };
    const module = await w.sheets.openLazy(Promise.resolve({ default: () => h(w.RN.View, null,
        [h(Row, { key: 'original', label: 'Reply', onPress() {} })]) }), 'MessageLongPressActionSheet', context);
    const ui = await w.mount(h(module.default, context));
    const row = ui.root.findAll(n => n.type === 'ActionSheetRow' && n.props.label === 'Resolve mentions / Open profile')[0];
    assert.ok(row);
    await Renderer.act(async () => { row.props.onPress(); await w.advance(150); });
    const open = w.alerts.at(-1)?.[2].find(button => button.text === 'Open profile');
    assert.ok(open);
    await Renderer.act(async () => open.onPress());
    assert.equal(w.calls.filter(c => c[0] === 'profileOpened' && c[1].userId === FRIEND).length, 1);
    assert.equal(cold.initializedFactories(), 1);
    assert.equal(cold.unrelatedFactories(), 0);
});

test('a loaded default profile module opens even when its function has an unrelated name', async t => {
    const w = scenario(t), cold = installColdProfileModule(w);
    const host = installServerPanelHost(w), panel = await w.mount(h(host.Root));
    w.addModule(cold.namespace, 'modules/user_profile/native/showUserProfileActionSheet.tsx');
    const item = await w.start('info-commands');
    const ui = await w.mount(h(item.options.SettingsComponent, { api: item.api }));
    await Renderer.act(async () => button(ui, 'Open current server info').props.onPress());
    await Renderer.act(async () => { button(panel, 'Owner').props.onPress(); await w.advance(180); });
    assert.equal(w.calls.filter(c => c[0] === 'profileOpened').length, 1);
    assert.equal(cold.initializedFactories(), 0);
});

test('an owner-profile action from a stopped plugin cannot initialize or open a profile', async t => {
    const w = scenario(t), cold = installColdProfileModule(w);
    const host = installServerPanelHost(w), panel = await w.mount(h(host.Root));
    const item = await w.start('info-commands');
    const ui = await w.mount(h(item.options.SettingsComponent, { api: item.api }));
    await Renderer.act(async () => button(ui, 'Open current server info').props.onPress());
    const onPress = button(panel, 'Owner').props.onPress;
    await Renderer.act(async () => w.stop(item));
    await Renderer.act(async () => { onPress(); await w.advance(180); });
    assert.equal(w.calls.filter(c => c[0] === 'profileOpened').length, 0);
    assert.equal(cold.initializedFactories(), 0);
});
