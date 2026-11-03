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
    w.actions = { startEditMessage(...args) { assert.equal(this, w.actions); w.calls.push(['edit', ...args]); }, editMessage() {}, sendMessage() {} };
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
    });
    return w;
}
test('double tap opens the native editor with the latest text and keyboard, without sending', async t => {
    const w = fixture(t); await w.start('double-tap-edit'); assert.deepEqual(w.toasts, []);
    w.tap(); await w.advance(100); w.messages[0].content = 'Updated text'; w.tap();
    assert.deepEqual(w.edits(), [['edit', CHANNEL, ID, 'Updated text', 'action_sheet']]);
    await w.advance(1000); assert.equal(w.calls.filter(c => c[0] === 'tap').length, 0);
    assert.ok(w.calls.some(c => c[0] === 'keyboard'));
    assert.equal(w.calls.some(c => ['sendMessage', 'http', 'delete'].includes(c[0])), false);
});
test('one tap and slow repeated taps preserve native behavior exactly once per tap', async t => {
    const w = fixture(t); await w.start('double-tap-edit'); w.tap(); await w.advance(351);
    assert.equal(w.calls.filter(c => c[0] === 'tap').length, 1);
    w.tap(); await w.advance(351); assert.equal(w.calls.filter(c => c[0] === 'tap').length, 2);
    assert.equal(w.edits().length, 0);
});
test('other people, system, webhook, pending, deleted and empty messages remain native', async t => {
    const w = fixture(t); await w.start('double-tap-edit'); const original = { ...w.messages[0] };
    for (const update of [{ author: w.users[FRIEND] }, { type: 7 }, { type: 20 }, { state: 'SENDING' }, { state: 'SEND_FAILED' },
        { deleted: true }, { webhook_id: '1' }, { content: '' }]) {
        w.messages[0] = { ...original, ...update };
        assert.equal(w.tap(), 'native'); assert.equal(w.tap(), 'native');
    }
    assert.equal(w.edits().length, 0);
});
test('different messages do not form a double tap', async t => {
    const w = fixture(t); await w.start('double-tap-edit');
    w.messages.push({ ...w.messages[0], id: '900000000000000002' });
    w.tap(); await w.advance(90); w.tap({ nativeEvent: { channelId: CHANNEL, messageId: w.messages[1].id } });
    await w.advance(351); assert.equal(w.edits().length, 0); assert.equal(w.calls.filter(c => c[0] === 'tap').length, 2);
});
test('account changes, navigation and stop cancel pending taps and stale view callbacks stay native', async t => {
    const w = fixture(t); const item = await w.start('double-tap-edit');
    w.tap(); w.setAccount(FRIEND); await w.advance(1000); assert.equal(w.edits().length, 0);
    w.setAccount(ACCOUNT); w.tap(); w.selected = '300000000000000002'; w.stores.SelectedChannelStore.emitChange();
    await w.advance(1000); assert.equal(w.calls.filter(c => c[0] === 'tap').length, 0);
    w.selected = CHANNEL; const callback = w.element().props.onTapMessage; callback(w.event); await w.stop(item);
    assert.equal(callback(w.event), 'native'); assert.equal(w.timers.size, 0);
});
test('long press and swipe cancel the candidate and still call native handlers', async t => {
    const w = fixture(t); await w.start('double-tap-edit');
    for (const key of ['onLongPressMessage', 'onInitiateReply']) {
        w.tap(); w.element().props[key](w.event); await w.advance(351);
        assert.equal(w.calls.filter(c => c[0] === 'tap').length, 0);
    }
    assert.ok(w.calls.some(c => c[0] === 'hold')); assert.ok(w.calls.some(c => c[0] === 'swipe'));
});
test('malformed, numeric, multitouch and wrong-channel events do not edit', async t => {
    const w = fixture(t); await w.start('double-tap-edit');
    for (const data of [{}, { messageId: Number(ID) }, { messageId: ID, numberOfPointers: 2 },
        { messageId: ID, touches: [1, 2] }, { messageId: ID, channelId: '123' }]) {
        assert.equal(w.tap({ nativeEvent: data }), 'native');
    }
    assert.equal(w.edits().length, 0);
});
test('DM replies are editable and triple taps open only one editor', async t => {
    const w = fixture(t); w.channels[CHANNEL].type = 1; w.messages[0].type = 19;
    await w.start('double-tap-edit'); w.tap(); await w.advance(40); w.tap(); w.tap(); await w.advance(1000);
    assert.equal(w.edits().length, 1); assert.equal(w.calls.filter(c => c[0] === 'tap').length, 0);
});
test('late-loaded native actions connect without forcing module initialization', async t => {
    const w = fixture(t, { cold: true }); await w.start('double-tap-edit');
    w.addModule({ default: w.actions }, 'actions/MessageActionCreators.tsx'); w.tap(); w.tap(); assert.equal(w.edits().length, 1);
});
test('missing actions produce a useful error and never attempt a network edit', async t => {
    const w = fixture(t, { cold: true }); await w.start('double-tap-edit'); w.tap(); w.tap();
    assert.equal(w.edits().length, 0); assert.equal(w.toasts.length, 1);
});
test('disabled setting and relaxed timing work', async t => {
    const w = fixture(t); const first = await w.start('double-tap-edit', { enabled: false });
    assert.equal(w.tap(), 'native'); await w.stop(first);
    await w.start('double-tap-edit', { interval: 500 }); w.tap(); await w.advance(420); w.tap();
    assert.equal(w.edits().length, 1);
});
test('deleting the message or changing its author between taps cancels editing', async t => {
    const w = fixture(t); await w.start('double-tap-edit'); w.tap(); w.messages[0].author = w.users[FRIEND]; w.tap();
    assert.equal(w.edits().length, 0); w.messages[0].author = w.users[ACCOUNT]; w.tap(); w.messages.splice(0); w.tap();
    assert.equal(w.edits().length, 0);
});
test('settings render and save the enabled toggle and speed', async t => {
    const w = fixture(t); const item = await w.start('double-tap-edit');
    const ui = await w.render(item);
    try {
        await w.Renderer.act(async () => ui.root.findByType('Switch').props.onValueChange(false));
        assert.equal(item.api.jsonStorage.cache.enabled, false); assert.equal(w.tap(), 'native');
        await w.Renderer.act(async () => ui.root.findAllByType('Pressable')[2].props.onPress());
        assert.equal(item.api.jsonStorage.cache.interval, 500);
    } finally { await w.Renderer.act(async () => ui.unmount()); }
});
