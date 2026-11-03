'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, ACCOUNT, FRIEND, CHANNEL } = require('../../revenge-next/tests/next-harness.cjs');
const ID = '900000000000000001';
function fixture(t, options = {}) {
    const w = createWorld(), original = React.createElement;
    w.messages[0].author = w.users[ACCOUNT]; w.messages[0].type = 0;
    w.selected = CHANNEL; w.stores.SelectedChannelStore.getChannelId = () => w.selected;
    w.actions = { startEditMessage(...args) { assert.equal(this, w.actions); w.calls.push(['edit', ...args]); }, editMessage() {}, sendMessage() {},
        deleteMessage(...args) { w.calls.push(['delete', ...args]); return Promise.resolve({ status: 204 }); }, suppressEmbeds() {} };
    if (!options.cold) w.addModule({ default: w.actions }, 'actions/MessageActionCreators.tsx');
    w.addModule({ getBestActiveInputForChannelId: id => id === CHANNEL ? { openSystemKeyboard: () => w.calls.push(['keyboard']) } : null }, 'utils/native/ChatInputUtils.tsx');
    w.nativeTap = (...args) => { w.calls.push(['tap', ...args]); return 'native'; };
    w.hold = () => w.calls.push(['hold']); w.swipe = () => w.calls.push(['swipe']);
    w.element = () => React.createElement('NativeChat', { onTapMessage: w.nativeTap, onLongPressMessage: w.hold, onInitiateReply: w.swipe });
    w.event = { nativeEvent: { messageId: ID, channelId: CHANNEL } };
    w.tap = event => w.element().props.onTapMessage(event ?? w.event);
    w.edits = () => w.calls.filter(c => c[0] === 'edit');
    t.after(async () => {
        for (const item of [...w.loaded.values()].reverse()) await w.stop(item);
        assert.equal(React.createElement, original);
        assert.equal(w.timers.size, 0); assert.equal(w.moduleWaiters.size, 0); assert.equal(w.pathWaiters.size, 0);
        assert.equal(w.stores.UserStore.listeners.size, 0); assert.equal(w.stores.SelectedChannelStore.listeners.size, 0);
        assert.equal(w.appListeners.size, 0); assert.deepEqual(w.errors, []);
        assert.equal(w.U[Symbol.for('dev.fluttershy2008.message-taps.v1')], undefined);
    });
    return w;
}
test('one tap immediately opens Editing Message with current content and keyboard without sending', async t => {
    const w = fixture(t); await w.start('double-tap-edit'); w.messages[0].content = 'Latest content'; w.tap();
    assert.deepEqual(w.edits(), [['edit', CHANNEL, ID, 'Latest content', 'action_sheet']]);
    assert.ok(w.calls.some(c => c[0] === 'keyboard')); assert.equal(w.timers.size, 0);
    assert.equal(w.calls.some(c => ['sendMessage', 'http', 'delete', 'tap'].includes(c[0])), false);
    assert.deepEqual(w.toasts, []);
});
test('rapid duplicate callbacks open only one editor and a later tap can reopen it', async t => {
    const w = fixture(t); await w.start('double-tap-edit'); w.tap(); w.tap(); w.tap();
    assert.equal(w.edits().length, 1); await w.advance(351); w.tap(); assert.equal(w.edits().length, 2);
});
test('other people, system, webhook, bot, pending, deleted and empty messages stay native', async t => {
    const w = fixture(t); await w.start('double-tap-edit'); const original = { ...w.messages[0] };
    for (const update of [{ author: w.users[FRIEND] }, { type: 7 }, { type: 20 }, { state: 'SENDING' }, { state: 'SEND_FAILED' },
        { deleted: true }, { webhook_id: '1' }, { author: { ...w.users[ACCOUNT], bot: true } }, { content: '' }]) {
        w.messages[0] = { ...original, ...update }; assert.equal(w.tap(), 'native');
    }
    assert.equal(w.edits().length, 0);
});
test('tapping a different own message edits the selected message without waiting', async t => {
    const w = fixture(t); await w.start('double-tap-edit'); w.messages.push({ ...w.messages[0], id: '900000000000000002', content: 'Second' });
    w.tap(); w.tap({ nativeEvent: { channelId: CHANNEL, messageId: w.messages[1].id } });
    assert.equal(w.edits().length, 2); assert.equal(w.edits()[1][2], w.messages[1].id); assert.equal(w.edits()[1][3], 'Second');
});
test('account changes, wrong channels and stopped callbacks cannot edit', async t => {
    const w = fixture(t); const item = await w.start('double-tap-edit'); const callback = w.element().props.onTapMessage;
    w.setAccount(FRIEND); assert.equal(callback(w.event), 'native'); w.setAccount(ACCOUNT);
    w.selected = '300000000000000002'; assert.equal(callback(w.event), 'native');
    w.selected = CHANNEL; await w.stop(item); assert.equal(callback(w.event), 'native'); assert.equal(w.edits().length, 0);
});
test('long presses and swipes retain their native actions', async t => {
    const w = fixture(t); await w.start('double-tap-edit'); const node = w.element();
    node.props.onLongPressMessage(w.event); node.props.onInitiateReply(w.event);
    assert.ok(w.calls.some(c => c[0] === 'hold')); assert.ok(w.calls.some(c => c[0] === 'swipe')); assert.equal(w.edits().length, 0);
});
test('malformed, numeric, multitouch and wrong-channel events do not edit', async t => {
    const w = fixture(t); await w.start('double-tap-edit');
    for (const data of [{}, { messageId: Number(ID) }, { messageId: ID, numberOfPointers: 2 },
        { messageId: ID, touches: [1, 2] }, { messageId: ID, channelId: '123' }]) assert.equal(w.tap({ nativeEvent: data }), 'native');
    assert.equal(w.edits().length, 0);
});
test('own DM replies support one-tap editing', async t => {
    const w = fixture(t); w.channels[CHANNEL].type = 1; w.messages[0].type = 19; await w.start('double-tap-edit');
    w.tap(); assert.equal(w.edits().length, 1);
});
test('native channel IDs work before the selected-channel store has initialized', async t => {
    const w = fixture(t); w.stores.SelectedChannelStore.getChannelId = () => undefined;
    await w.start('double-tap-edit'); w.tap(); assert.equal(w.edits().length, 1);
});
test('late-loaded actions connect and errors do not send edits through a network fallback', async t => {
    const w = fixture(t, { cold: true }); await w.start('double-tap-edit'); w.tap(); assert.equal(w.toasts.length, 1);
    w.addModule({ default: w.actions }, 'actions/MessageActionCreators.tsx'); w.tap(); assert.equal(w.edits().length, 1);
    assert.equal(w.calls.some(c => ['sendMessage', 'http'].includes(c[0])), false);
});
test('old timing settings migrate to immediate editing and the enabled switch still saves', async t => {
    const w = fixture(t); const item = await w.start('double-tap-edit', { interval: 500 });
    w.tap(); assert.equal(w.edits().length, 1);
    const ui = await w.render(item);
    try {
        assert.equal(ui.root.findAllByType('Pressable').length, 0, 'obsolete timing controls removed');
        await w.Renderer.act(async () => ui.root.findByType('Switch').props.onValueChange(false));
        assert.equal(item.api.jsonStorage.cache.enabled, false); assert.equal(w.tap(), 'native');
        assert.equal('interval' in item.api.jsonStorage.cache, false);
    } finally { await w.Renderer.act(async () => ui.unmount()); }
});
for (const order of [['double-tap-edit', 'quick-delete'], ['quick-delete', 'double-tap-edit']]) {
    test('own tap edits and other messages keep immediate Quick Actions, ' + order.join(' then '), async t => {
        const w = fixture(t); for (const slug of order) await w.start(slug);
        w.tap(); assert.equal(w.edits().length, 1); assert.equal(w.openedSheets.length, 0);
        w.messages[0].author = w.users[FRIEND]; w.tap(); assert.equal(w.openedSheets.length, 1);
        assert.equal(w.edits().length, 1); assert.equal(w.timers.size, 0);
    });
    test('native captured callbacks edit on one tap and restore in either stop order, ' + order.join(' then '), async t => {
        const w = fixture(t);
        class MessagesHandlers {
            constructor() { this.handleTapMessage = w.nativeTap; this.handleLongPressMessage = w.hold; }
            get params() { return { channelId: CHANNEL }; }
            getMessageData() { return { message: w.messages[0], messageChannel: w.channels[CHANNEL] }; }
        }
        const namespace = { MessagesHandlers }, descriptor = Object.getOwnPropertyDescriptor(MessagesHandlers.prototype, 'params');
        w.addModule(namespace, 'modules/messages/native/MessagesHandlers.tsx'); const items = [];
        for (const slug of order) items.push(await w.start(slug));
        const handler = new namespace.MessagesHandlers(); void handler.params; const callback = handler.handleTapMessage;
        callback(w.event); assert.equal(w.edits().length, 1); assert.equal(w.openedSheets.length, 0);
        for (const item of items) await w.stop(item);
        assert.equal(namespace.MessagesHandlers, MessagesHandlers); assert.equal(handler.handleTapMessage, w.nativeTap);
        assert.equal(Object.getOwnPropertyDescriptor(MessagesHandlers.prototype, 'params').get, descriptor.get);
    });
    test('own editing overrides one-tap delete and disabling it restores the selected action, ' + order.join(' then '), async t => {
        const w = fixture(t); let edit;
        for (const slug of order) { const item = await w.start(slug, slug === 'quick-delete' ? { directDelete: true } : {}); if (slug === 'double-tap-edit') edit = item; }
        w.tap(); assert.equal(w.edits().length, 1); assert.equal(w.calls.filter(c => c[0] === 'delete').length, 0);
        await w.stop(edit); w.tap(); assert.equal(w.calls.filter(c => c[0] === 'delete').length, 1);
    });
}
test('native arrow callbacks work with non-configurable own params', async t => {
    const w = fixture(t);
    class MessagesHandlers { constructor() { Object.defineProperty(this, 'params', { value: {} }); this.handleTapMessage = w.nativeTap; } }
    const namespace = { MessagesHandlers }; w.addModule(namespace, 'modules/messages/native/MessagesHandlers.tsx');
    await w.start('double-tap-edit'); new namespace.MessagesHandlers().handleTapMessage(w.event); assert.equal(w.edits().length, 1);
});
test('cached constructor and React fallback do not duplicate a single edit', async t => {
    const w = fixture(t);
    class MessagesHandlers { constructor() { this.handleTapMessage = w.nativeTap; } get params() { return {}; } }
    const instance = new MessagesHandlers(); w.addModule({ MessagesHandlers }, 'modules/messages/native/MessagesHandlers.tsx');
    await w.start('double-tap-edit'); void instance.params;
    React.createElement('NativeChat', { onTapMessage: instance.handleTapMessage, onLongPressMessage: w.hold }).props.onTapMessage(w.event);
    assert.equal(w.edits().length, 1); assert.equal(w.calls.filter(c => c[0] === 'tap').length, 0);
});
