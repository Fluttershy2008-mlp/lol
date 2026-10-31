'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, ACCOUNT, FRIEND, CHANNEL } = require('../../revenge-next/tests/next-harness.cjs');
const ID = '900000000000000001';
const HANDLERS = 'modules/messages/native/MessagesHandlers.tsx';
const ACTIONS = 'actions/MessageActionCreators.tsx';
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function fixture(t, opts = {}) {
    const w = createWorld(), renderers = [];
    const createElement = React.createElement;
    w.messages[0].author = w.users[ACCOUNT];
    w.messages[0].type = 0; w.messages[0].embeds = [{ type: 'link' }];
    w.stores.PermissionStore.can = () => opts.permission ?? false;
    w.actions = { sendMessage() {},
        async deleteMessage(...args) { assert.equal(this, w.actions); w.calls.push(['delete', ...args]); return opts.remove ? opts.remove() : { status: 204 }; },
        async suppressEmbeds(...args) { assert.equal(this, w.actions); w.calls.push(['embeds', ...args]); return { status: 200 }; } };
    if (!opts.coldActions) w.addModule({ default: w.actions }, ACTIONS);
    w.alertsModule = { openLazy() {}, show(value) { w.calls.push(['nativePrompt', value]); return 'prompt'; } };
    w.addModule(w.alertsModule);
    const text = { MWMcg7: 'Borrar mensaje', xwMqD7: 'Eliminar mensaje', AMvpS4: '¿Eliminar este mensaje?',
        VL1KOk: 'Quitar enlaces integrados', 'vXZ+Fo': '¿Quitar las vistas previas?' };
    w.addModule({ intl: { string: value => value }, t: text }); w.labels = text;
    w.event = { nativeEvent: { messageId: ID, channelId: CHANNEL } };
    w.nativeTap = event => { w.calls.push(['tap', event]); return 'native tap'; };
    w.longPress = event => w.calls.push(['hold', event]);
    w.element = (extra = {}) => React.createElement('NativeChat', { onTapMessage: w.nativeTap, onLongPressMessage: w.longPress, ...extra });
    w.tap = event => w.element().props.onTapMessage(event ?? w.event);
    w.sheet = async () => {
        const entry = w.openedSheets.at(-1); assert.ok(entry, 'a native sheet opened');
        const { default: Sheet } = await entry.promise;
        let ui; await Renderer.act(async () => { ui = Renderer.create(React.createElement(Sheet, entry.context)); });
        renderers.push(ui); return ui;
    };
    w.rows = ui => ui.root.findAllByType('ActionSheetRow');
    w.choose = async (ui, label) => {
        const row = w.rows(ui).find(row => row.props.label === label); assert.ok(row, label);
        await Renderer.act(async () => { row.props.onPress(); await settle(); });
    };
    w.prompt = (kind, onConfirm = () => w.calls.push(['confirmed', kind])) => ({
        title: text[kind === 'delete' ? 'MWMcg7' : 'VL1KOk'],
        body: text[kind === 'delete' ? 'AMvpS4' : 'vXZ+Fo'],
        ...(kind === 'delete' ? { children: React.createElement('MessagePreview', { message: w.messages[0] }) } : {}), onConfirm,
    });
    t.after(async () => {
        for (const ui of renderers.reverse()) await Renderer.act(async () => ui.unmount());
        for (const item of [...w.loaded.values()].reverse()) await w.stop(item);
        assert.equal(React.createElement, createElement, 'React factory restored');
        assert.equal(w.pathWaiters.size, 0); assert.equal(w.moduleWaiters.size, 0);
        assert.equal(w.stores.UserStore.listeners.size, 0);
        assert.equal(w.stores.SelectedChannelStore.listeners.size, 0);
        assert.equal(w.timers.size, 0); assert.deepEqual(w.errors, []);
    });
    w.sends = () => w.calls.filter(call => ['delete', 'embeds'].includes(call[0]));
    return w;
}

test('tap opens native actions and Delete sends exactly the selected message without a prompt', async t => {
    const w = fixture(t); await w.start('quick-delete');
    assert.deepEqual(w.toasts, [], 'no startup popup');
    w.tap(); const ui = await w.sheet();
    assert.deepEqual(w.rows(ui).map(row => row.props.label), ['Delete Message', 'Remove Embeds', 'Cancel']);
    assert.equal(w.sends().length, 0, 'a normal tap opens actions without deleting');
    await w.choose(ui, 'Delete Message');
    assert.deepEqual(w.sends(), [['delete', CHANNEL, ID, false]]);
    assert.equal(w.calls.some(call => call[0] === 'nativePrompt'), false);
    assert.ok(w.toasts.includes('Message deleted'));
});

test('Remove Embeds preserves text and attachments and uses the native suppress action', async t => {
    const w = fixture(t); const before = structuredClone(w.messages[0]);
    await w.start('quick-delete'); w.tap(); await w.choose(await w.sheet(), 'Remove Embeds');
    assert.deepEqual(w.sends(), [['embeds', CHANNEL, ID]]);
    assert.equal(w.messages[0].content, before.content);
    assert.deepEqual(w.messages[0].attachments, before.attachments);
});

test('own DM messages work without server moderation permission', async t => {
    const w = fixture(t); delete w.channels[CHANNEL].guild_id; delete w.channels[CHANNEL].guildId;
    w.channels[CHANNEL].type = 1; w.channels[CHANNEL].isDM = () => true;
    await w.start('quick-delete'); w.tap(); await w.choose(await w.sheet(), 'Delete Message');
    assert.equal(w.sends().length, 1);
});

test('server moderation requires current Manage Messages permission', async t => {
    const w = fixture(t); w.messages[0].author = w.users[FRIEND];
    await w.start('quick-delete'); assert.equal(w.tap(), 'native tap');
    assert.equal(w.openedSheets.length, 0);
    w.stores.PermissionStore.can = () => true; w.tap(); const ui = await w.sheet();
    w.stores.PermissionStore.can = () => false; await w.choose(ui, 'Delete Message');
    assert.equal(w.sends().length, 0, 'permission rechecked when the action is pressed');
});

test('moderation can be disabled while own-message actions remain available', async t => {
    const w = fixture(t, { permission: true }); await w.start('quick-delete', { moderation: false });
    w.messages[0].author = w.users[FRIEND]; assert.equal(w.tap(), 'native tap');
    w.messages[0].author = w.users[ACCOUNT]; w.tap(); assert.equal(w.openedSheets.length, 1);
});

test('other people’s DMs stay native even when the permission store is permissive', async t => {
    const w = fixture(t, { permission: true }); delete w.channels[CHANNEL].guild_id; delete w.channels[CHANNEL].guildId;
    w.channels[CHANNEL].type = 1; w.channels[CHANNEL].isDM = () => true;
    w.messages[0].author = w.users[FRIEND]; await w.start('quick-delete');
    assert.equal(w.tap(), 'native tap'); assert.equal(w.openedSheets.length, 0);
});

test('one-tap mode deletes directly, without opening either sheet or confirmation', async t => {
    const w = fixture(t); await w.start('quick-delete', { directDelete: true });
    w.tap(); await settle(); assert.deepEqual(w.sends(), [['delete', CHANNEL, ID, false]]);
    assert.equal(w.openedSheets.length, 0);
});

test('rapid duplicate taps remain one deletion, including while the request is pending', async t => {
    let finish; const pending = new Promise(resolve => { finish = resolve; });
    const w = fixture(t, { remove: () => pending }); await w.start('quick-delete', { directDelete: true });
    w.tap(); w.tap(); w.tap(); assert.equal(w.sends().length, 1);
    finish({ status: 204 }); await settle(); w.tap(); assert.equal(w.sends().length, 1);
});

test('failed deletes report errors, never retry, and keep success feedback quiet when disabled', async t => {
    const w = fixture(t, { remove: () => Promise.reject(new Error('denied')) });
    await w.start('quick-delete', { directDelete: true, feedback: false }); w.tap(); await settle();
    assert.equal(w.sends().length, 1); assert.ok(w.toasts.includes('Could not delete this message. Try again.'));
    assert.equal(w.toasts.includes('Message deleted'), false); await w.advance(10000);
    assert.equal(w.sends().length, 1, 'no queued retries');
});

test('HTTP error-shaped action results are not reported as success', async t => {
    const w = fixture(t, { remove: () => ({ status: 403, ok: false }) });
    await w.start('quick-delete', { directDelete: true }); w.tap(); await settle();
    assert.equal(w.toasts.includes('Message deleted'), false);
    assert.ok(w.toasts.includes('Could not delete this message. Try again.'));
});

test('old quick-action buttons cannot act after account switching, stop or a deleted message', async t => {
    const w = fixture(t); const item = await w.start('quick-delete'); w.tap(); const ui = await w.sheet();
    w.setAccount(FRIEND); await w.choose(ui, 'Delete Message'); assert.equal(w.sends().length, 0);
    w.setAccount(ACCOUNT); w.messages.splice(0); await w.choose(ui, 'Delete Message'); assert.equal(w.sends().length, 0);
    await w.stop(item); await w.choose(ui, 'Delete Message'); assert.equal(w.sends().length, 0);
});

test('an in-flight request failure after account switching or stop does not toast into the new session', async t => {
    let fail; const w = fixture(t, { remove: () => new Promise((_, reject) => { fail = reject; }) });
    const item = await w.start('quick-delete', { directDelete: true }); w.tap();
    w.setAccount(FRIEND); await w.stop(item); fail(new Error('late')); await settle();
    assert.deepEqual(w.toasts, []);
});

test('system, pending, malformed, multi-touch and wrong-channel events keep normal tap behavior', async t => {
    const w = fixture(t); await w.start('quick-delete', { directDelete: true });
    for (const type of [1, 7, 18, 21, 24]) { w.messages[0].type = type; assert.equal(w.tap(), 'native tap'); }
    w.messages[0].type = 0;
    for (const state of ['SENDING', 'SEND_FAILED']) { w.messages[0].state = state; assert.equal(w.tap(), 'native tap'); }
    delete w.messages[0].state;
    for (const data of [{ messageId: Number(ID) }, { messageId: ID, channelId: '123' },
        { messageId: ID, touches: [1, 2] }, { messageId: ID, numberOfPointers: 2 }])
        assert.equal(w.tap({ nativeEvent: data }), 'native tap');
    assert.equal(w.sends().length, 0);
});

test('links, media, long press and swipe callbacks keep their exact identity', async t => {
    const w = fixture(t); await w.start('quick-delete');
    const link = () => {}, image = () => {}, swipe = () => {};
    const node = w.element({ onTapLink: link, onTapImage: image, onInitiateReply: swipe });
    assert.equal(node.props.onLongPressMessage, w.longPress);
    assert.equal(node.props.onTapLink, link); assert.equal(node.props.onTapImage, image);
    assert.equal(node.props.onInitiateReply, swipe);
    node.props.onLongPressMessage(w.event); assert.equal(w.calls.at(-1)[0], 'hold');
    const unrelated = React.createElement('Other', { onTapMessage: w.nativeTap });
    assert.equal(unrelated.props.onTapMessage, w.nativeTap);
});

test('tap actions can be disabled and retained view callbacks fall back to Discord after stop', async t => {
    const w = fixture(t); const item = await w.start('quick-delete', { tapActions: false, directDelete: true });
    const callback = w.element().props.onTapMessage;
    assert.equal(callback(w.event), 'native tap'); await w.stop(item);
    assert.equal(callback(w.event), 'native tap'); assert.equal(w.sends().length, 0);
});

test('no Remove Embeds control for empty or already suppressed embeds', async t => {
    const w = fixture(t); await w.start('quick-delete');
    for (const flags of [4, 4n, '4']) {
        w.messages[0].flags = flags; w.tap(); const ui = await w.sheet();
        assert.equal(w.rows(ui).some(row => row.props.label === 'Remove Embeds'), false);
    }
    w.messages[0].flags = 0; w.messages[0].embeds = []; w.tap();
    assert.equal(w.rows(await w.sheet()).some(row => row.props.label === 'Remove Embeds'), false);
});

test('Cancel closes only Quick Delete’s own native sheet and performs no action', async t => {
    const w = fixture(t); await w.start('quick-delete'); w.tap(); await w.choose(await w.sheet(), 'Cancel');
    assert.deepEqual(w.sends(), []);
    assert.equal(w.calls.filter(call => call[0] === 'hideSheet').at(-1)[1], 'dev.fluttershy2008.quick-delete.actions');
});

test('JSX runtime discovered late wraps message taps without timed polling', async t => {
    const w = fixture(t); await w.start('quick-delete', { directDelete: true }); await w.advance(120000);
    const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    const original = jsx.jsx; w.addModule(jsx);
    jsx.jsx('NativeChat', { onTapMessage: w.nativeTap, onLongPressMessage: w.longPress }).props.onTapMessage(w.event);
    await settle(); assert.equal(w.sends().length, 1);
    await w.stop([...w.loaded.values()][0]); assert.equal(jsx.jsx, original);
});

test('missing action module leaves taps native until its exact imported module loads', async t => {
    const w = fixture(t, { coldActions: true }); await w.start('quick-delete', { directDelete: true });
    assert.equal(w.tap(), 'native tap'); w.addModule({ default: w.actions }, ACTIONS);
    w.tap(); await settle(); assert.equal(w.sends().length, 1);
});

test('MessagesHandlers hook covers cached callbacks and restores its params getter across multiple chat instances', async t => {
    const w = fixture(t);
    class MessagesHandlers {
        constructor() { this.handleTapMessage = w.nativeTap; }
        get params() { return { selectedChannelId: CHANNEL }; }
        getMessageData() { return { message: w.messages[0], messageChannel: w.channels[CHANNEL] }; }
    }
    const old = Object.getOwnPropertyDescriptor(MessagesHandlers.prototype, 'params');
    w.addModule({ MessagesHandlers }, HANDLERS); const item = await w.start('quick-delete', { directDelete: true });
    const first = new MessagesHandlers(), second = new MessagesHandlers(); void first.params; void second.params;
    first.handleTapMessage(w.event); second.handleTapMessage(w.event); await settle();
    assert.equal(w.sends().length, 1);
    await w.stop(item);
    assert.equal(first.handleTapMessage, w.nativeTap); assert.equal(second.handleTapMessage, w.nativeTap);
    assert.equal(Object.getOwnPropertyDescriptor(MessagesHandlers.prototype, 'params').get, old.get);
});

test('non-configurable params getter stays intact and native-view fallback still works', async t => {
    const w = fixture(t); class MessagesHandlers {}
    const getter = () => ({}); Object.defineProperty(MessagesHandlers.prototype, 'params', { get: getter });
    w.addModule({ MessagesHandlers }, HANDLERS); await w.start('quick-delete', { directDelete: true });
    w.tap(); await settle(); assert.equal(w.sends().length, 1);
    assert.equal(Object.getOwnPropertyDescriptor(MessagesHandlers.prototype, 'params').get, getter);
});

test('only exact localized message and embed confirmations are skipped, once each', async t => {
    const w = fixture(t); await w.start('quick-delete');
    w.alertsModule.show(w.prompt('delete')); w.alertsModule.show(w.prompt('embed'));
    assert.deepEqual(w.calls.filter(call => call[0] === 'confirmed'), [['confirmed', 'delete'], ['confirmed', 'embed']]);
    assert.equal(w.calls.some(call => call[0] === 'nativePrompt'), false);
});

test('all unrelated, incomplete and unauthorized native confirmations stay visible', async t => {
    const w = fixture(t); await w.start('quick-delete');
    for (const options of [
        { title: 'Leave server', body: w.labels.AMvpS4, onConfirm() { throw new Error('must not confirm'); } },
        { ...w.prompt('delete'), children: null },
        { ...w.prompt('embed'), title: 'Delete account' },
        { ...w.prompt('embed'), body: 'A different operation' },
    ]) assert.equal(w.alertsModule.show(options), 'prompt');
    w.messages[0].author = w.users[FRIEND]; assert.equal(w.alertsModule.show(w.prompt('delete')), 'prompt');
    assert.equal(w.calls.filter(call => call[0] === 'nativePrompt').length, 5);
});

test('confirmation switches are independent and stop restores the original alert function', async t => {
    const w = fixture(t); const original = w.alertsModule.show;
    const item = await w.start('quick-delete', { skipDelete: false });
    assert.equal(w.alertsModule.show(w.prompt('delete')), 'prompt'); w.alertsModule.show(w.prompt('embed'));
    assert.equal(w.calls.filter(call => call[0] === 'confirmed').length, 1);
    await w.stop(item); assert.equal(w.alertsModule.show, original);
    await w.start('quick-delete', { skipEmbeds: false });
    w.alertsModule.show(w.prompt('delete')); assert.equal(w.alertsModule.show(w.prompt('embed')), 'prompt');
    assert.equal(w.calls.filter(call => call[0] === 'confirmed').length, 2);
});

test('settings render, save booleans with replacement and restart without duplicate hooks', async t => {
    const w = fixture(t); let item = await w.start('quick-delete');
    const ui = await w.render(item); t.after(async () => Renderer.act(async () => ui.unmount()));
    const setting = ui.root.findAllByType('Switch').find(node => node.props.accessibilityLabel === 'One-tap delete');
    await Renderer.act(async () => { setting.props.onValueChange(true); await settle(); });
    assert.equal(item.writes.at(-1).directDelete, true);
    await Renderer.act(async () => { w.tap(); await settle(); }); assert.equal(w.sends().length, 1);
    await Renderer.act(async () => w.stop(item));
    item = await w.start('quick-delete', item.writes.at(-1));
    w.tap(); await settle(); assert.equal(w.sends().length, 2);
});
