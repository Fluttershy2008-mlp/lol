'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, ACCOUNT, FRIEND, CHANNEL } = require('../../revenge-next/tests/next-harness.cjs');
const { installSettingsSection } = require('./settings-fixture.cjs');
const ID = '900000000000000001';
const HANDLERS = 'modules/messages/native/MessagesHandlers.tsx';
const ACTIONS = 'actions/MessageActionCreators.tsx';
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function fixture(t, opts = {}) {
    const w = createWorld(), renderers = [];
    if (opts.idleBlocked) {
        w.idleWork = new Set();
        w.RN.InteractionManager.runAfterInteractions = fn => {
            w.calls.push(['idleWait']); w.idleWork.add(fn);
            return { cancel: () => w.idleWork.delete(fn) };
        };
    }
    const createElement = React.createElement;
    w.messages[0].author = w.users[ACCOUNT];
    w.messages[0].type = 0; w.messages[0].embeds = [{ type: 'link' }];
    w.stores.PermissionStore.can = () => opts.permission ?? false;
    w.selected = CHANNEL; w.stores.SelectedChannelStore.getChannelId = () => w.selected;
    w.actions = { sendMessage() {},
        async deleteMessage(...args) { assert.equal(this, w.actions); w.calls.push(['delete', ...args]); return opts.remove ? opts.remove() : { status: 204 }; },
        async suppressEmbeds(...args) { assert.equal(this, w.actions); w.calls.push(['embeds', ...args]); return { status: 200 }; } };
    if (!opts.coldActions) w.addModule({ default: w.actions }, ACTIONS);
    if (opts.reply) {
        w.draft = 'Keep my draft';
        w.replyAllowed = true;
        w.input = { openSystemKeyboard() { w.calls.push(['keyboard']); } };
        w.pendingReply = { createPendingReply(value) { w.calls.push(['pendingReply', value]); }, deletePendingReply() {} };
        if (!opts.coldReplies) w.addModule(w.pendingReply, 'modules/replies/PendingReplyActionCreators.tsx');
        if (!opts.noInputUtils) w.addModule({ getBestActiveInputForChannelId(id) { w.calls.push(['findInput', id]); return id === CHANNEL ? w.input : undefined; } }, 'utils/native/ChatInputUtils.tsx');
        w.addModule({ canReplyToMessage: () => w.replyAllowed, useCanReplyToMessage() { throw Error('Do not call a React hook from a click'); } }, 'modules/replies/canReplyToMessage.tsx');
        w.actions.endEditMessage = id => w.calls.push(['endEdit', id]);
        if (opts.reply === 'native' && !opts.coldReplies) w.addModule({ default: function a(value) {
            w.calls.push(['nativeReply', value]);
            if (opts.replyError) throw Error('Reply failed');
            w.pendingReply.createPendingReply(value);
            value.chatInputRef?.current?.openSystemKeyboard();
        } }, 'modules/replies/native/replyToMessage.tsx');
    }
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
        await Renderer.act(async () => { row.props.onPress(); await w.advance(0); await settle(); });
    };
    w.prompt = (kind, onConfirm = () => w.calls.push(['confirmed', kind])) => ({
        title: text[kind === 'delete' ? 'MWMcg7' : 'VL1KOk'],
        body: text[kind === 'delete' ? 'AMvpS4' : 'vXZ+Fo'],
        ...(kind === 'delete' ? { children: React.createElement('MessagePreview', { message: w.messages[0] }) } : {}), onConfirm,
    });
    t.after(async () => {
        for (const ui of renderers.reverse()) await Renderer.act(async () => ui.unmount());
        for (const item of [...w.loaded.values()].reverse()) await Renderer.act(async () => w.stop(item));
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
    w.messages[0].author = w.users[FRIEND]; w.tap();
    assert.deepEqual(w.rows(await w.sheet()).map(row => row.props.label), ['Reply', 'Cancel']);
    w.messages[0].author = w.users[ACCOUNT]; w.tap();
    assert.ok(w.rows(await w.sheet()).some(row => row.props.label === 'Delete Message'));
});

test('other people’s DMs expose Reply without deletion even when the permission store is permissive', async t => {
    const w = fixture(t, { permission: true }); delete w.channels[CHANNEL].guild_id; delete w.channels[CHANNEL].guildId;
    w.channels[CHANNEL].type = 1; w.channels[CHANNEL].isDM = () => true;
    w.messages[0].author = w.users[FRIEND]; await w.start('quick-delete');
    w.tap(); assert.deepEqual(w.rows(await w.sheet()).map(row => row.props.label), ['Reply', 'Cancel']);
    assert.deepEqual(w.sends(), []);
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

for (const reply of ['native', 'pending']) test(reply + ' Reply opens Discord’s reply bar and current keyboard without sending or changing the draft', async t => {
    const w = fixture(t, { reply }); w.messages[0].author = w.users[FRIEND];
    await w.start('quick-delete'); w.tap(); const ui = await w.sheet();
    assert.deepEqual(w.rows(ui).map(row => row.props.label), ['Reply', 'Cancel'], 'no deletion permission is needed to reply');
    await w.choose(ui, 'Reply');
    const replies = w.calls.filter(call => call[0] === 'pendingReply');
    assert.equal(replies.length, 1);
    const options = replies[0][1];
    assert.equal(options.message, w.messages[0]); assert.equal(options.channel, w.channels[CHANNEL]);
    assert.equal(w.calls.filter(call => call[0] === 'keyboard').length, 1);
    assert.deepEqual(w.calls.find(call => call[0] === 'findInput'), ['findInput', CHANNEL]);
    assert.equal(w.draft, 'Keep my draft'); assert.deepEqual(w.sends(), []);
    assert.equal(w.calls.some(call => ['sendMessage', 'http'].includes(call[0])), false);
    if (reply === 'native') {
        const native = w.calls.find(call => call[0] === 'nativeReply')[1];
        assert.equal(native.actionSource, 'action_sheet'); assert.equal(native.invertible, false);
        assert.equal(native.chatInputRef.current, w.input);
    } else {
        assert.equal(options.source, 'action_sheet'); assert.equal(options.shouldMention, true);
        assert.deepEqual(w.calls.find(call => call[0] === 'endEdit'), ['endEdit', CHANNEL]);
    }
});

test('own-message menu includes Reply, Delete and Remove Embeds; the quick-reply switch hides only Reply', async t => {
    const w = fixture(t, { reply: 'native' }); let item = await w.start('quick-delete');
    w.tap(); assert.deepEqual(w.rows(await w.sheet()).map(row => row.props.label), ['Reply', 'Delete Message', 'Remove Embeds', 'Cancel']);
    await w.stop(item); item = await w.start('quick-delete', { quickReply: false });
    w.tap(); assert.deepEqual(w.rows(await w.sheet()).map(row => row.props.label), ['Delete Message', 'Remove Embeds', 'Cancel']);
    w.messages[0].author = w.users[FRIEND]; assert.equal(w.tap(), 'native tap');
});

test('pending Reply uses Discord’s no-mention default for DMs and your own messages', async t => {
    const w = fixture(t, { reply: 'pending' }); await w.start('quick-delete');
    w.tap(); await w.choose(await w.sheet(), 'Reply');
    assert.equal(w.calls.filter(call => call[0] === 'pendingReply').at(-1)[1].shouldMention, false);
    w.messages[0].author = w.users[FRIEND]; w.channels[CHANNEL].type = 1; w.channels[CHANNEL].isDM = () => true;
    w.tap(); await w.choose(await w.sheet(), 'Reply');
    assert.equal(w.calls.filter(call => call[0] === 'pendingReply').at(-1)[1].shouldMention, false);
});

test('one-tap delete retains permission checks while other people’s messages can open Reply', async t => {
    const w = fixture(t, { reply: 'native' }); await w.start('quick-delete', { directDelete: true });
    w.messages[0].author = w.users[FRIEND]; w.tap();
    await w.choose(await w.sheet(), 'Reply'); assert.equal(w.sends().length, 0);
    w.messages[0].author = w.users[ACCOUNT]; w.tap(); await settle(); assert.equal(w.sends().length, 1);
});

test('native Reply eligibility is checked again after opening the sheet', async t => {
    const w = fixture(t, { reply: 'native' }); w.messages[0].author = w.users[FRIEND];
    await w.start('quick-delete'); w.tap(); const ui = await w.sheet();
    w.replyAllowed = false; await w.choose(ui, 'Reply');
    assert.equal(w.calls.some(call => call[0] === 'nativeReply'), false);
    assert.ok(w.toasts.includes('You cannot reply to this message right now.'));
    assert.equal(w.tap(), 'native tap');
});

test('ephemeral messages never gain Reply even when the native eligibility helper is permissive', async t => {
    const w = fixture(t, { reply: 'native' }); w.messages[0].author = w.users[FRIEND]; w.messages[0].flags = 64;
    await w.start('quick-delete'); assert.equal(w.tap(), 'native tap');
});

for (const change of ['account', 'channel', 'stop', 'missing message']) test('queued Reply is cancelled after ' + change, async t => {
    const w = fixture(t, { reply: 'native' }); const item = await w.start('quick-delete');
    w.tap(); const ui = await w.sheet(), row = w.rows(ui).find(row => row.props.label === 'Reply');
    row.props.onPress();
    if (change === 'account') w.setAccount(FRIEND);
    if (change === 'channel') w.selected = '300000000000000002';
    if (change === 'stop') await w.stop(item);
    if (change === 'missing message') w.messages.splice(0);
    await w.advance(0); await settle();
    assert.equal(w.calls.some(call => call[0] === 'nativeReply' || call[0] === 'keyboard'), false);
    assert.deepEqual(w.sends(), []);
    if (change !== 'missing message') assert.deepEqual(w.toasts, []);
});

test('duplicate Reply presses enqueue only one native action and native errors are not retried through the fallback', async t => {
    const w = fixture(t, { reply: 'native', replyError: true }); await w.start('quick-delete');
    w.tap(); const row = w.rows(await w.sheet()).find(row => row.props.label === 'Reply');
    row.props.onPress(); row.props.onPress(); await w.advance(0); await settle();
    assert.equal(w.calls.filter(call => call[0] === 'nativeReply').length, 1);
    assert.equal(w.calls.filter(call => call[0] === 'pendingReply').length, 0);
    assert.ok(w.toasts.includes('Could not open Reply. Try again.'));
});

test('pending-reply-only modules can enable Reply after startup without initializing a destructive action module', async t => {
    const w = fixture(t, { coldActions: true }); w.messages[0].author = w.users[FRIEND];
    await w.start('quick-delete'); assert.equal(w.tap(), 'native tap');
    w.stores.PermissionStore.can = () => true;
    w.addModule({ createPendingReply: value => w.calls.push(['pendingReply', value]), deletePendingReply() {} }, 'modules/replies/PendingReplyActionCreators.tsx');
    w.tap(); const ui = await w.sheet(); assert.deepEqual(w.rows(ui).map(row => row.props.label), ['Reply', 'Cancel']);
    await w.choose(ui, 'Reply'); assert.equal(w.calls.filter(call => call[0] === 'pendingReply').length, 1);
    assert.deepEqual(w.sends(), []);
});

test('fallback Reply rejects server channels without Send Messages and Read Message History permission', async t => {
    const w = fixture(t); w.messages[0].author = w.users[FRIEND];
    w.addModule({ createPendingReply() { throw Error('No permission'); }, deletePendingReply() {} });
    await w.start('quick-delete'); assert.equal(w.tap(), 'native tap');
    w.stores.PermissionStore.can = flag => flag === 2048n; assert.equal(w.tap(), 'native tap');
    w.stores.PermissionStore.can = flag => flag === 65536n; assert.equal(w.tap(), 'native tap');
});

test('Quick Delete registers directly under Valenced, renders the same settings, and removes only its own entry', async t => {
    const w = fixture(t), registry = installSettingsSection(w);
    const item = await w.start('quick-delete', { directDelete: false, feedback: false });
    const key = 'dev.fluttershy2008.quick-delete.valenced-settings';
    assert.ok(registry.section.settings.includes(key));
    const route = w.registeredScreens.get(key), Page = route.screen.getComponent();
    let ui; await Renderer.act(async () => { ui = Renderer.create(React.createElement(Page)); });
    t.after(async () => Renderer.act(async () => ui.unmount()));
    assert.match(JSON.stringify(ui.toJSON()), /One-tap reply/);
    const toggle = ui.root.findAllByType('Switch').find(node => node.props.accessibilityLabel === 'Reply in tap menu');
    await Renderer.act(async () => { toggle.props.onValueChange(false); await settle(); });
    assert.equal(item.writes.at(-1).quickReply, false); assert.equal(item.writes.at(-1).feedback, false);
    await Renderer.act(async () => w.stop(item));
    assert.deepEqual(registry.section.settings, registry.core); assert.equal(w.registeredScreens.has(key), false);
    assert.match(JSON.stringify(ui.toJSON()), /Reopen Quick Delete from Valenced settings/);
});

test('Quick Delete waits for native Settings and cancels late registration after stopping', async t => {
    const w = fixture(t), registry = installSettingsSection(w); w.setSettingsLoaded(false);
    const item = await w.start('quick-delete'); assert.deepEqual(registry.section.settings, registry.core);
    await w.stop(item); w.setSettingsLoaded(true); await settle();
    assert.deepEqual(registry.section.settings, registry.core); assert.equal(w.registeredScreens.size, 0);
    const restarted = await w.start('quick-delete');
    assert.equal(registry.section.settings.filter(x => x.includes('quick-delete')).length, 1);
    await w.stop(restarted); assert.deepEqual(registry.section.settings, registry.core);
});

for (const reply of ['native', 'pending']) test('one-tap reply opens ' + reply + ' Reply and keyboard directly without any menu or deletion', async t => {
    const w = fixture(t, { reply });
    await w.start('quick-delete', { directReply: true });
    w.tap(); assert.equal(w.openedSheets.length, 0);
    await w.advance(0); await settle();
    assert.equal(w.calls.filter(call => call[0] === 'pendingReply').length, 1);
    assert.equal(w.calls.filter(call => call[0] === 'keyboard').length, 1);
    assert.equal(w.draft, 'Keep my draft'); assert.deepEqual(w.sends(), []);
});

test('one-tap reply works on other people’s messages without moderation permission and when the menu Reply row is off', async t => {
    const w = fixture(t, { reply: 'native' }); w.messages[0].author = w.users[FRIEND];
    await w.start('quick-delete', { directReply: true, quickReply: false, moderation: false });
    w.tap(); await w.advance(0);
    assert.equal(w.calls.filter(call => call[0] === 'nativeReply').length, 1);
    assert.equal(w.openedSheets.length, 0); assert.deepEqual(w.sends(), []);
});

test('one-tap reply never falls through to delete when replying is unavailable', async t => {
    const w = fixture(t, { reply: 'native' }); w.replyAllowed = false;
    await w.start('quick-delete', { directReply: true, directDelete: true });
    assert.equal(w.tap(), 'native tap'); await w.advance(0);
    assert.equal(w.openedSheets.length, 0); assert.deepEqual(w.sends(), []);
    assert.equal(w.calls.filter(call => call[0] === 'nativeReply').length, 0);
});

test('conflicting saved one-tap modes resolve to reply and the UI shows deletion off', async t => {
    const w = fixture(t, { reply: 'native' }); const item = await w.start('quick-delete', { directReply: true, directDelete: true });
    const ui = await w.render(item); t.after(async () => Renderer.act(async () => ui.unmount()));
    const controls = () => ui.root.findAllByType('Switch');
    assert.equal(controls().find(n => n.props.accessibilityLabel === 'One-tap reply').props.value, true);
    assert.equal(controls().find(n => n.props.accessibilityLabel === 'One-tap delete').props.value, false);
    await Renderer.act(async () => { w.tap(); await w.advance(0); });
    assert.equal(w.calls.filter(call => call[0] === 'nativeReply').length, 1); assert.deepEqual(w.sends(), []);
});

test('One-tap reply and One-tap delete switches save mutually exclusive modes and enable message taps', async t => {
    const w = fixture(t, { reply: 'native' }); const item = await w.start('quick-delete', { directDelete: true, tapActions: false, feedback: false });
    const ui = await w.render(item); t.after(async () => Renderer.act(async () => ui.unmount()));
    const control = label => ui.root.findAllByType('Switch').find(n => n.props.accessibilityLabel === label);
    await Renderer.act(async () => { control('One-tap reply').props.onValueChange(true); await settle(); });
    assert.equal(control('One-tap delete').props.value, false);
    assert.equal(control('One-tap reply').props.value, true);
    assert.equal(control('Tap for quick actions').props.value, true);
    assert.equal(item.writes.at(-1).directReply, true); assert.equal(item.writes.at(-1).directDelete, false);
    assert.equal(item.writes.at(-1).feedback, false);
    await Renderer.act(async () => { w.tap(); await w.advance(0); });
    assert.equal(w.calls.filter(call => call[0] === 'nativeReply').length, 1); assert.deepEqual(w.sends(), []);
    await Renderer.act(async () => { control('One-tap delete').props.onValueChange(true); await settle(); });
    assert.equal(control('One-tap reply').props.value, false);
    assert.equal(item.writes.at(-1).directReply, false); assert.equal(item.writes.at(-1).directDelete, true);
    await Renderer.act(async () => { w.tap(); await settle(); });
    assert.equal(w.sends().length, 1);
});

test('turning one-tap reply off restores the quick menu and the saved choice survives restart', async t => {
    const w = fixture(t, { reply: 'native' }); let item = await w.start('quick-delete', { directReply: true });
    const ui = await w.render(item); t.after(async () => Renderer.act(async () => ui.unmount()));
    const toggle = ui.root.findAllByType('Switch').find(n => n.props.accessibilityLabel === 'One-tap reply');
    await Renderer.act(async () => { toggle.props.onValueChange(false); await settle(); });
    const saved = item.writes.at(-1);
    assert.equal(saved.directReply, false); assert.equal(saved.directDelete, false);
    await Renderer.act(async () => { w.tap(); }); assert.equal(w.openedSheets.length, 1);
    await Renderer.act(async () => w.stop(item));
    item = await w.start('quick-delete', saved); w.tap(); assert.equal(w.openedSheets.length, 2);
});

test('a disabled tap switch preserves Discord’s normal tap even with one-tap reply saved', async t => {
    const w = fixture(t, { reply: 'native' }); await w.start('quick-delete', { directReply: true, tapActions: false });
    assert.equal(w.tap(), 'native tap'); await w.advance(0);
    assert.equal(w.calls.some(c => c[0] === 'nativeReply'), false); assert.deepEqual(w.sends(), []);
});

test('rapid repeated one-tap replies queue one action and stop cancels pending keyboard focus', async t => {
    const w = fixture(t, { reply: 'native' }); const item = await w.start('quick-delete', { directReply: true });
    w.tap(); w.tap(); w.tap(); await w.advance(0);
    assert.equal(w.calls.filter(c => c[0] === 'nativeReply').length, 1);
    w.tap(); await w.stop(item); await w.advance(0);
    assert.equal(w.calls.filter(c => c[0] === 'nativeReply').length, 1);
    assert.equal(w.calls.filter(c => c[0] === 'keyboard').length, 1); assert.deepEqual(w.sends(), []);
});

test('switching from one-tap reply to delete cancels an already queued direct reply', async t => {
    const w = fixture(t, { reply: 'native' }); const item = await w.start('quick-delete', { directReply: true });
    const ui = await w.render(item); t.after(async () => Renderer.act(async () => ui.unmount()));
    await Renderer.act(async () => {
        w.tap();
        ui.root.findAllByType('Switch').find(n => n.props.accessibilityLabel === 'One-tap delete').props.onValueChange(true);
        await w.advance(0); await settle();
    });
    assert.equal(w.calls.some(c => c[0] === 'nativeReply'), false); assert.deepEqual(w.sends(), []);
});

test('regression: one-tap reply works while Android never releases InteractionManager', async t => {
    const w = fixture(t, { reply: 'native', idleBlocked: true });
    await w.start('quick-delete', { directReply: true }); w.tap(); await w.advance(0);
    assert.equal(w.calls.filter(c => c[0] === 'nativeReply').length, 1);
    assert.equal(w.calls.filter(c => c[0] === 'keyboard').length, 1);
    assert.equal(w.calls.filter(c => c[0] === 'idleWait').length, 0, 'direct taps do not depend on an idle callback');
    assert.deepEqual(w.sends(), []);
});

test('regression: first reply opens with both native reply helpers still unloaded', async t => {
    const w = fixture(t, { reply: 'pending', coldReplies: true, coldActions: true });
    await w.start('quick-delete', { directReply: true }); w.tap(); await w.advance(0);
    const events = w.calls.filter(c => c[0] === 'dispatch').map(c => c[1]);
    const replies = events.filter(e => e.type === 'CREATE_PENDING_REPLY');
    assert.equal(replies.length, 1);
    assert.equal(replies[0].channel, w.channels[CHANNEL]); assert.equal(replies[0].message, w.messages[0]);
    assert.equal(replies[0].shouldMention, false);
    assert.ok(events.some(e => e.type === 'MESSAGE_END_EDIT' && e.channelId === CHANNEL));
    assert.equal(w.calls.filter(c => c[0] === 'keyboard').length, 1);
    assert.equal(w.draft, 'Keep my draft'); assert.deepEqual(w.sends(), []);
    assert.equal(w.openedSheets.length, 0);
});

test('regression: menu Reply has a bounded fallback when Android keeps the idle queue blocked', async t => {
    const w = fixture(t, { reply: 'native', idleBlocked: true });
    await w.start('quick-delete'); w.tap(); const ui = await w.sheet(); await w.choose(ui, 'Reply');
    await w.advance(150);
    assert.equal(w.calls.filter(c => c[0] === 'nativeReply').length, 1);
    assert.equal(w.idleWork.size, 0, 'the stalled work is released after the fallback runs');
    assert.equal(w.timers.size, 0);
});

test('Reply focuses the channel’s captured native composer when the lookup utility is still unloaded', async t => {
    const w = fixture(t, { reply: 'pending', coldReplies: true, noInputUtils: true });
    await w.start('quick-delete', { directReply: true });
    const inputRef = { current: w.input };
    const composer = React.createElement('NativeComposer', { channel: w.channels[CHANNEL], chatInputRef: inputRef });
    assert.equal(composer.props.chatInputRef, inputRef, 'the composer reference is preserved');
    w.tap(); await w.advance(0);
    assert.equal(w.calls.filter(c => c[0] === 'keyboard').length, 1);
    assert.equal(w.calls.filter(c => c[0] === 'dispatch' && c[1].type === 'CREATE_PENDING_REPLY').length, 1);
    assert.deepEqual(w.sends(), []);
});

test('a late idle callback cannot repeat a reply already opened by the bounded fallback', async t => {
    const w = fixture(t, { reply: 'native', idleBlocked: true });
    await w.start('quick-delete'); w.tap(); await w.choose(await w.sheet(), 'Reply');
    const late = [...w.idleWork]; await w.advance(150);
    for (const fn of late) fn();
    assert.equal(w.calls.filter(c => c[0] === 'nativeReply').length, 1);
    assert.equal(w.calls.filter(c => c[0] === 'keyboard').length, 1);
});

test('stopping before a menu fallback timer fires removes both the timer and idle work', async t => {
    const w = fixture(t, { reply: 'native', idleBlocked: true });
    const item = await w.start('quick-delete'); w.tap(); await w.choose(await w.sheet(), 'Reply');
    await w.stop(item); await w.advance(150);
    assert.equal(w.idleWork.size, 0); assert.equal(w.timers.size, 0);
    assert.equal(w.calls.some(c => c[0] === 'nativeReply'), false);
});

test('late-loaded native helpers replace the cold-start fallback without issuing a second reply', async t => {
    const w = fixture(t, { reply: 'pending', coldReplies: true });
    await w.start('quick-delete', { directReply: true }); w.tap(); await w.advance(0);
    assert.equal(w.calls.filter(c => c[0] === 'dispatch' && c[1].type === 'CREATE_PENDING_REPLY').length, 1);
    w.addModule(w.pendingReply, 'modules/replies/PendingReplyActionCreators.tsx');
    assert.equal(w.calls.filter(c => c[0] === 'pendingReply').length, 0);
    w.tap(); await w.advance(0);
    assert.equal(w.calls.filter(c => c[0] === 'pendingReply').length, 1);
    assert.equal(w.calls.filter(c => c[0] === 'dispatch' && c[1].type === 'CREATE_PENDING_REPLY').length, 1);
});

test('the cold-start fallback still respects reply permissions and cannot delete instead', async t => {
    const w = fixture(t, { reply: 'pending', coldReplies: true }); w.replyAllowed = false;
    await w.start('quick-delete', { directReply: true }); w.tap(); await w.advance(0);
    assert.equal(w.calls.some(c => c[0] === 'dispatch' && c[1].type === 'CREATE_PENDING_REPLY'), false);
    assert.ok(w.toasts.includes('Reply is unavailable for this message.'));
    assert.deepEqual(w.sends(), []);
});

test('Reply also focuses a composer lookup that returns a ref object instead of the input instance', async t => {
    const w = fixture(t, { reply: 'native' });
    const utility = w.modules.find(m => m?.getBestActiveInputForChannelId);
    utility.getBestActiveInputForChannelId = () => ({ current: w.input });
    await w.start('quick-delete', { directReply: true }); w.tap(); await w.advance(0);
    assert.equal(w.calls.filter(c => c[0] === 'nativeReply').length, 1);
    assert.equal(w.calls.filter(c => c[0] === 'keyboard').length, 1);
});
