'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWorld, React, Renderer } = require('../../revenge-next/tests/next-harness.cjs');
const { installChatButtonsHost } = require('./chat-buttons-fixture.cjs');
const h = React.createElement;
const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../sources.json'))).plugins;
const slugs = Object.entries(source).filter(([id]) => id !== 'mlemception.chatbuttons')
    .map(([id]) => id.replace(/^dev\.fluttershy2008\.|^fluttershy\./, ''));
function press(ui, label) {
    const nodes = ui.root.findAll(n => typeof n.type === 'string' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    assert.ok(nodes.length, 'button: ' + label); return nodes[0];
}
function scenario(t) {
    const w = createWorld(), fixture = installChatButtonsHost(w), views = [];
    const sender = { sendMessage: async (...args) => { w.calls.push(['sendMessage', ...args]); return { ok: true }; }, revealMessage() {}, deleteMessage() {} };
    w.addModule(sender);
    const start = w.start;
    w.start = async (...args) => {
        const item = await start(...args);
        if (item.slug === 'translate-message') {
            const set = item.api.jsonStorage.set.bind(item.api.jsonStorage);
            item.api.jsonStorage.set = value => set(value, true);
        }
        return item;
    };
    w.startChat = async initial => { let item; await Renderer.act(async () => { item = await w.start('chat-buttons', initial); fixture.attachStorage(item); }); return item; };
    w.mount = async el => { let ui; await Renderer.act(async () => { ui = Renderer.create(el); }); views.push(ui); return ui; };
    w.mountChat = () => w.mount(h(fixture.chatModule.default));
    w.openMenu = async ui => { await Renderer.act(async () => press(ui, 'Buttons').props.onPress()); return w.mount(fixture.popout.ContextMenuPopout({ menu: w.lastMenu, transitionState: 0, cleanUp() {} })); };
    t.after(async () => {
        for (const ui of views.reverse()) await Renderer.act(async () => ui.unmount());
        for (const item of [...w.loaded.values()].reverse()) await Renderer.act(async () => w.stop(item));
        assert.equal(w.timers.size, 0, 'timers cleaned');
        assert.equal(w.pathWaiters.size, 0, 'lazy paths cleaned');
        assert.equal(w.moduleWaiters.size, 0, 'module listeners cleaned');
        assert.equal(fixture.patches.size, 0, 'JSX hooks cleaned');
        assert.equal(fixture.backHandlers.size, 0, 'back handlers cleaned');
        assert.equal(fixture.fluxListeners.size, 0, 'Flux event listeners cleaned');
        assert.deepEqual(w.errors, []);
    });
    return { w, fixture, sender };
}

for (const order of ['first', 'last']) test('all ' + slugs.length + ' existing catalogue entries coexist with Chat Buttons loaded ' + order, async t => {
    const { w } = scenario(t);
    if (order === 'first') await w.startChat();
    for (const slug of slugs) {
        let item; await Renderer.act(async () => { item = await w.start(slug); });
        // Theme preInit is separate from the plugin start hook in the real loader.
        if (source[item.manifest.id].kind === 'native-theme' && item.options.preInit) {
            const themes = { registerGroup() {}, registerTheme() {}, registerFontPack() {}, registerFont() {}, registerFontFamily() {} };
            await item.options.preInit({ ...item.api, themes });
        }
    }
    if (order === 'last') await w.startChat();
    const composer = await w.mountChat(), menu = await w.openMenu(composer);
    assert.ok(press(menu, 'Math AI'));
    assert.ok(press(menu, 'Auto Translate'));
    assert.ok(press(composer, 'Send'));
    assert.equal(w.loaded.size, slugs.length + 1);
});

for (const order of [ ['chat-buttons', 'math-ai', 'auto-text', 'translate-message'], ['translate-message', 'auto-text', 'math-ai', 'chat-buttons'] ]) {
    test('composer gestures and stable IDs survive load order: ' + order.join(', '), async t => {
        const { w, fixture } = scenario(t); let chat;
        for (const slug of order) {
            if (slug === 'chat-buttons') chat = await w.startChat();
            else await w.start(slug);
        }
        const composer = await w.mountChat(), menu = await w.openMenu(composer);
        const ids = Object.keys(chat.api.jsonStorage.cache.seen);
        assert.ok(ids.includes('dev.fluttershy2008.math-ai'));
        assert.ok(ids.includes('dev.fluttershy2008.translate-message'));
        assert.equal(ids.some(id => id.startsWith('Auto AI solve:')), false);
        await Renderer.act(async () => press(menu, 'Math AI').props.onPress());
        assert.equal(w.loaded.get('math-ai').api.jsonStorage.cache.aiSend, true);
        assert.equal(press(menu, 'Math AI').props.accessibilityState.checked, true);
        await Renderer.act(async () => press(menu, 'Math AI').props.onLongPress());
        assert.equal(w.loaded.get('math-ai').api.jsonStorage.cache.aiSend, true, 'hold does not toggle');
        assert.ok(composer.root.findAll(n => n.type === 'Modal').length, 'Math AI settings opened');
        await Renderer.act(async () => press(menu, 'Auto Translate').props.onPress());
        assert.equal(w.loaded.get('translate-message').api.jsonStorage.cache.autoTranslate, true);
        assert.equal(press(menu, 'Auto Translate').props.accessibilityState.checked, true);
        await Renderer.act(async () => press(menu, 'Auto Translate').props.onLongPress());
        assert.equal(w.loaded.get('translate-message').api.jsonStorage.cache.autoTranslate, true);
        assert.deepEqual(Object.keys(chat.api.jsonStorage.cache.seen), ids, 'toggle does not duplicate menu entries');
        await Renderer.act(async () => press(composer, 'Send').props.onPress());
        assert.ok(w.calls.some(c => c[0] === 'send'));
        await Renderer.act(async () => w.stop(chat));
        assert.equal(composer.root.findAll(n => n.props.accessibilityLabel === 'Buttons').length, 0);
        assert.ok(press(composer, 'Auto AI solve: ON'));
        assert.ok(press(composer, 'Auto Translate'));
        const restarted = await w.startChat(chat.api.jsonStorage.cache);
        await Renderer.act(async () => composer.update(h(fixture.chatModule.default, { key: 'reopened-chat' })));
        assert.ok(press(composer, 'Buttons'));
        assert.ok(restarted);
    });
}

test('missing module exports do not crash and late module callbacks stop registering hooks', async t => {
    const { w } = scenario(t);
    const item = await w.startChat();
    const unsupported = { default: {} };
    w.addModule(unsupported, 'modules/chat_input/native/action_buttons/ChatInputActions.tsx');
    assert.deepEqual(unsupported.default, {});
    await Renderer.act(async () => w.stop(item));
    const original = () => null, mod = { default: original };
    w.addModule(mod, 'modules/chat_input/native/ChatInput.tsx');
    assert.equal(mod.default, original);
});

test('pinning and nicknames use persistent stable IDs', async t => {
    const { w } = scenario(t);
    const chat = await w.startChat({ names: { 'dev.fluttershy2008.math-ai': 'Calculator' } });
    await w.start('math-ai'); await w.start('translate-message');
    const composer = await w.mountChat(), menu = await w.openMenu(composer);
    assert.ok(press(menu, 'Calculator'));
    await Renderer.act(async () => chat.api.jsonStorage.set({ kept: { 'dev.fluttershy2008.math-ai': true } }));
    assert.equal(menu.root.findAll(n => n.props.accessibilityLabel === 'Calculator').length, 0);
    assert.ok(press(composer, 'Auto AI solve: OFF'));
    assert.ok(press(menu, 'Auto Translate'));
    assert.equal(chat.api.jsonStorage.cache.names['dev.fluttershy2008.math-ai'], 'Calculator');
});

test('an unavailable native button leaves the composer buttons visible', async t => {
    const { w, fixture } = scenario(t);
    fixture.buttonModule.default = undefined;
    await w.startChat(); await w.start('math-ai');
    const composer = await w.mountChat();
    assert.ok(press(composer, 'Auto AI solve: OFF'));
    assert.ok(press(composer, 'Send'));
    assert.equal(composer.root.findAll(n => n.props.accessibilityLabel === 'Buttons').length, 0);
});
