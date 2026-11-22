'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, BLOCKED, IGNORED, FRIEND, CHANNEL } = require('../../revenge-next/tests/next-harness.cjs');

const makeManager = () => class ChatManager {
  constructor() { this.rows = []; this.rowIndex = 0; }
  // ChatManager owns row indexing. The plugin must use this method for every
  // unwrapped child, not push to native arrays or overwrite grouping input.
  createRow(row, extra) { row.index = ++this.rowIndex; this.rows.push(row); this.extra = extra; return row; }
};
const message = (id, authorId) => Object.freeze({ type: 1, changeType: 0,
  message: Object.freeze({ id, channelId: CHANNEL, authorId, content: [{ type: 'text', content: 'hi horse' }] }) });
const group = content => Object.freeze({ type: 2, text: '2 blocked messages', revealed: false, content: Object.freeze(content) });
const path = 'modules/messages/native/renderer/ChatManager.tsx';

test('Valenced native ChatManager emits ordinary whitelisted messages with consecutive indices and no blocked bar', async t => {
  const w = createWorld(), ChatManager = makeManager(), original = ChatManager.prototype.createRow;
  w.addModule({ default: ChatManager });
  const item = await w.start('hide-blocked-and-ignored-messages', { whitelistEnabled: true, whitelistedIds: [BLOCKED] });
  t.after(async () => {
    await w.stop(item); assert.equal(ChatManager.prototype.createRow, original);
    assert.deepEqual(w.errors, []); assert.equal(w.timers.size, 0); assert.equal(w.pathWaiters.size, 0);
  });
  const manager = new ChatManager(), first = message('one', BLOCKED), second = message('two', BLOCKED);
  const blocked = group([first, message('hidden', IGNORED), second]);
  const returned = manager.createRow(blocked, 'native-extra');
  assert.deepEqual(manager.rows.map(row => [row.type, row.message.id, row.index]), [[1, 'one', 1], [1, 'two', 2]]);
  assert.equal(returned, manager.rows[1]); assert.equal(manager.extra, 'native-extra');
  assert.ok(manager.rows.every(row => !('text' in row)));
  assert.equal(first.changeType, 0); assert.equal(blocked.content.length, 3);
  assert.equal(w.stores.RelationshipStore.isBlocked(BLOCKED), true);
  assert.equal(w.stores.RelationshipStore.isIgnored(IGNORED), true);
  assert.equal(w.calls.some(call => call[0] === 'unblock'), false);
});

test('native row hook supports late ChatManager loading and removes both hooks and pending loaders on stop', async t => {
  const w = createWorld(), ChatManager = makeManager(), original = ChatManager.prototype.createRow;
  const item = await w.start('hide-blocked-and-ignored-messages', { whitelistEnabled: true, whitelistedIds: [BLOCKED] });
  w.addModule({ default: ChatManager }, path);
  const manager = new ChatManager();
  manager.createRow(group([message('one', BLOCKED)]));
  assert.equal(manager.rows[0].type, 1);
  await w.stop(item);
  assert.equal(ChatManager.prototype.createRow, original);
  assert.equal(w.pathWaiters.size, 0); assert.equal(w.timers.size, 0); assert.deepEqual(w.errors, []);
  const second = createWorld(), neverLoaded = makeManager();
  const pending = await second.start('hide-blocked-and-ignored-messages');
  await second.stop(pending);
  second.addModule({ default: neverLoaded }, path);
  assert.equal(second.pathWaiters.size, 0);
  const rows = new neverLoaded(), nativeGroup = { type: 2, content: [] };
  rows.createRow(nativeGroup); assert.equal(rows.rows[0], nativeGroup);
  assert.deepEqual(second.errors, []);
});

test('ungrouped native rows from blocked and ignored authors are hidden in threads and private chats', async t => {
  const w = createWorld(), ChatManager = makeManager();
  w.addModule({ default: ChatManager }, path);
  const item = await w.start('hide-blocked-and-ignored-messages', { whitelistEnabled: true, whitelistedIds: [IGNORED] });
  t.after(async () => { await w.stop(item); assert.deepEqual(w.errors, []); });
  const manager = new ChatManager();
  for (const channelId of ['300000000000000005', '300000000000000006']) {
    const first = message('one', BLOCKED), second = message('two', IGNORED);
    manager.createRow({ ...first, message: { ...first.message, channelId } });
    manager.createRow({ ...second, message: { ...second.message, channelId } });
  }
  assert.deepEqual(manager.rows.map(row => [row.message.authorId, row.index]), [[IGNORED, 1], [IGNORED, 2]]);
});

test('native reply rows lose only the blocked or ignored preview and update when it becomes visible again', async t => {
  const w = createWorld(), ChatManager = makeManager();
  w.addModule({ default: ChatManager }, path);
  const item = await w.start('hide-blocked-and-ignored-messages', { removeReplies: false });
  t.after(async () => { await w.stop(item); assert.deepEqual(w.errors, []); });
  const manager = new ChatManager();
  let previous = [];
  manager.getPreviousRows = () => previous;
  const targets = new Map([['blocked', BLOCKED], ['ignored', IGNORED], ['friend', FRIEND]]);
  w.addModule({ default: { getMessage(channelId, id) {
    assert.equal(channelId, CHANNEL);
    if (targets.has(id)) return { state: 0, message: { author: w.users[targets.get(id)] } };
    return { state: 2 };
  } } }, 'modules/replies/ReferencedMessageStore.tsx');

  function render() {
    manager.rows = [];
    manager.rowIndex = 0;
    for (const [target, label] of [['blocked', 'Blocked message'], ['ignored', 'Ignored message'],
      ['friend', 'Ordinary preview'], ['deleted', 'Original message was deleted']]) {
      const id = `reply-${target}`;
      if (!w.messages.some(message => message.id === id)) {
        w.messages.push({ id, author: w.users[FRIEND], channel_id: CHANNEL, type: 19,
          messageReference: { channel_id: CHANNEL, message_id: target } });
      }
      const row = message(id, FRIEND);
      const referencedMessage = Object.freeze({ state: target === 'friend' ? 0 : 1, content: label });
      manager.createRow({ ...row, message: Object.freeze({ ...row.message, referencedMessage }) });
      assert.equal(referencedMessage.content, label);
    }
    previous = manager.rows;
    assert.equal(previous.length, 4);
    assert.ok(previous.every(row => row.message.content[0].content === 'hi horse'));
    return previous.map(row => [row.message.referencedMessage?.content ?? null, row.changeType]);
  }

  assert.deepEqual(render(), [[null, 2], [null, 2], ['Ordinary preview', 0], ['Original message was deleted', 0]]);
  assert.deepEqual(render(), [[null, 0], [null, 0], ['Ordinary preview', 0], ['Original message was deleted', 0]]);
  w.relationships[BLOCKED] = 1;
  w.stores.RelationshipStore.emitChange();
  assert.deepEqual(render(), [['Blocked message', 2], [null, 0], ['Ordinary preview', 0], ['Original message was deleted', 0]]);
});

test('native changesets rebind a shifted row and give unwrapped messages their own author header', async t => {
  const w = createWorld(), ChatManager = makeManager();
  w.addModule({ default: ChatManager }, path);
  const item = await w.start('hide-blocked-and-ignored-messages', { whitelistEnabled: true, whitelistedIds: [BLOCKED] });
  t.after(async () => { await w.stop(item); assert.deepEqual(w.errors, []); });
  const manager = new ChatManager();
  const previous = [message('previous', FRIEND)];
  manager.getPreviousRows = () => previous;
  const shifted = message('shifted', BLOCKED);
  manager.createRow({ ...shifted });
  assert.deepEqual(manager.rows.map(row => [row.message.id, row.message.authorId, row.changeType]),
    [['shifted', BLOCKED, 2]]);
  const child = { ...message('child', BLOCKED), message: { ...message('child', BLOCKED).message, isFirst: false } };
  manager.createRow(group([child]));
  assert.equal(manager.rows[1].message.isFirst, true);
  assert.equal(child.message.isFirst, false);
});
