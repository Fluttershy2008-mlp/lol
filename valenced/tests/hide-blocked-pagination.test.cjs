'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, CHANNEL, FRIEND, BLOCKED } = require('../../revenge-next/tests/next-harness.cjs');

function historyWorld() {
  const w = createWorld();
  const row = (id, user = BLOCKED) => Object.freeze({ id, channel_id: CHANNEL,
    content: 'original', author: w.users[user] });
  w.messages.splice(0, w.messages.length, row('300'));
  class Collection {
    constructor() { this._array = w.messages; this.hasMoreBefore = true; this.hasMoreAfter = false; this.ready = true; }
    toArray() { return this._array; }
  }
  const collection = new Collection();
  w.stores.MessageStore.getMessages = () => collection;
  return { w, collection, row };
}

test('Valenced package gets past a hidden cached page and another hidden history batch using native actions', async t => {
  const { w, collection, row } = historyWorld();
  const requests = [], displayed = [];
  const actions = { fetchMessages(options) {
    assert.equal(this, actions);
    assert.equal(w.stores.MessageStore.getMessages(CHANNEL), collection);
    requests.push(options);
    const messages = Object.freeze([options.before === '300' ? row('200') : row('100', FRIEND)]);
    return w.dispatcher.dispatch(Object.freeze({ type: 'LOAD_MESSAGES_SUCCESS', channelId: CHANNEL, messages }));
  } };
  w.addModule(actions);
  w.dispatcher.subscribe('LOAD_MESSAGES_SUCCESS', event => {
    w.messages.unshift(...event.messages);
    // Simulate a synchronous subscription during the native loading dispatch.
    displayed.push(w.stores.MessageStore.getMessages(CHANNEL).toArray().map(m => m.id));
  });
  const item = await w.start('hide-blocked-and-ignored-messages');
  t.after(async () => {
    if (w.loaded.has(item.slug)) await w.stop(item);
    assert.deepEqual(w.errors, []); assert.equal(w.timers.size, 0);
  });
  await w.advance(0);
  assert.equal(w.stores.MessageStore.getMessages(CHANNEL).toArray().length, 0);
  await w.advance(1000);
  assert.deepEqual(requests.map(options => options.before), ['300', '200']);
  assert.deepEqual(displayed, [[], ['100']]);
  assert.deepEqual(w.stores.MessageStore.getMessages(CHANNEL).toArray().map(m => m.id), ['100']);
  assert.deepEqual(w.messages.map(m => m.id), ['100', '200', '300']);
  await w.stop(item);
  assert.equal(w.stores.MessageStore.getMessages(CHANNEL), collection);
});

test('Valenced Load more cursor repair preserves native arguments, return values, jumps and stop cleanup', async t => {
  const { w, collection, row } = historyWorld();
  w.messages.unshift(row('200', FRIEND), row('100'));
  const requests = [];
  const actions = { fetchMessages(options, extra) {
    assert.equal(this, actions);
    assert.equal(w.stores.MessageStore.getMessages(CHANNEL), collection);
    requests.push([options, extra]);
    return 'loaded';
  } };
  const original = actions.fetchMessages;
  w.addModule(actions);
  const item = await w.start('hide-blocked-and-ignored-messages');
  t.after(async () => {
    if (w.loaded.has(item.slug)) await w.stop(item);
    assert.deepEqual(w.errors, []); assert.equal(w.timers.size, 0);
  });
  await w.advance(0);
  const options = Object.freeze({ channelId: CHANNEL, before: '200', limit: 25 });
  assert.equal(actions.fetchMessages(options, 'extra'), 'loaded');
  assert.equal(options.before, '200'); assert.equal(requests[0][0].before, '100');
  assert.equal(requests[0][1], 'extra');
  const jump = Object.freeze({ ...options, jump: { messageId: '200' } });
  actions.fetchMessages(jump);
  assert.equal(requests[1][0], jump);
  assert.deepEqual(w.stores.MessageStore.getMessages(CHANNEL).toArray().map(m => m.id), ['200']);
  await w.stop(item);
  assert.equal(actions.fetchMessages, original);
});
