'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createWorld, React, Renderer, CHANNEL, FRIEND } = require('../../revenge-next/tests/next-harness.cjs');
const { createLegacyAdapter } = require('../runtime.cjs');
const ROOT = path.resolve(__dirname, '..');
const h = React.createElement;

function scenario(t, options) {
    const world = createWorld(options), renders = [];
    t.after(async () => {
        for (const ui of renders.reverse()) await Renderer.act(async () => ui.unmount());
        for (const item of [...world.loaded.values()].reverse()) await world.stop(item);
        assert.equal(world.timers.size, 0);
        assert.equal(world.moduleWaiters.size, 0);
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
    function ChatInputGuardWrapper() {
        return h(w.RN.View, { collapsable: false, onStartShouldSetResponder() {}, onResponderRelease() {} },
            h(w.RN.TextInput, { onSelectionOrTextChange() {} }));
    }
    let component = ChatInputGuardWrapper;
    if (shape === 'memo') component = React.memo(component);
    if (shape === 'forward' || shape === 'nested') component = React.forwardRef(ChatInputGuardWrapper);
    if (shape === 'nested') component = React.memo(component);
    const namespace = { default: component };
    w.addModule(namespace);
    const item = await w.start('auto-text');
    const ui = await w.mount(h(namespace.default, { chatInputRef: inputRef, channelId: CHANNEL }));
    assert.ok(button(ui, 'AutoType'));
    assert.ok(button(ui, 'Phrases'));
    for (const value of [';', ';b', ';br', ';brb'])
        await Renderer.act(async () => { target.handleTextChanged(value); await w.advance(0); });
    assert.equal(draft, 'Be right back!');
    await Renderer.act(async () => w.stop(item));
    assert.equal(namespace.default, component);
    let inner = namespace.default;
    while (typeof inner !== 'function') inner = inner.type ?? inner.render;
    assert.equal(inner, ChatInputGuardWrapper);
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
