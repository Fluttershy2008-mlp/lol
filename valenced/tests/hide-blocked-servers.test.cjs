'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, CHANNEL, GUILD, BLOCKED, FRIEND } = require('../../revenge-next/tests/next-harness.cjs');

test('server ID settings validate, persist, toggle and remove; server rule overrides user whitelist without touching native history', async t => {
  const w = createWorld();
  w.messages.push({ id: 'blocked', channel_id: CHANNEL, author: w.users[BLOCKED], content: 'hi' });
  let item = await w.start('hide-blocked-and-ignored-messages', { whitelistEnabled: true, whitelistedIds: [BLOCKED] }), ui;
  t.after(async () => { if (ui) await Renderer.act(async () => ui.unmount()); for (const plugin of [...w.loaded.values()]) await w.stop(plugin); assert.deepEqual(w.errors, []); assert.equal(w.timers.size, 0); });
  const shown = () => w.stores.MessageStore.getMessages(CHANNEL).map(m => m.id);
  assert.equal(shown().length, 2);
  await Renderer.act(async () => { ui = Renderer.create(React.createElement(item.options.SettingsComponent, { api: item.api })); });
  const node = (type, label) => ui.root.findAll(n => n.type === type && n.props.accessibilityLabel === label)[0];
  const press = label => Renderer.act(async () => node('Pressable', label).props.onPress());
  const input = text => Renderer.act(async () => node('TextInput', 'Server IDs to hide').props.onChangeText(text));
  await press('Manage hidden server IDs (0)');
  await input(`${GUILD}, invalid`); await press('Add and hide servers');
  assert.equal(shown().length, 2); assert.deepEqual(Array.from(item.api.jsonStorage.cache.hiddenServerIds), []);
  await input(`${GUILD}, ${GUILD}`); await press('Add and hide servers');
  assert.deepEqual(Array.from(item.api.jsonStorage.cache.hiddenServerIds), [GUILD]);
  assert.equal(shown().length, 0); assert.equal(w.messages.length, 2);
  await Renderer.act(async () => node('Switch', 'Hide messages from selected servers').props.onValueChange(false));
  assert.equal(shown().length, 2);
  await Renderer.act(async () => node('Switch', 'Hide messages from selected servers').props.onValueChange(true));
  assert.equal(shown().length, 0);
  const saved = structuredClone(item.api.jsonStorage.cache);
  await Renderer.act(async () => ui.unmount()); ui = undefined;
  await w.stop(item); assert.equal(shown().length, 2);
  item = await w.start('hide-blocked-and-ignored-messages', saved); assert.equal(shown().length, 0);
  await Renderer.act(async () => { ui = Renderer.create(React.createElement(item.options.SettingsComponent, { api: item.api })); });
  await press('Manage hidden server IDs (1)'); await press(`Remove hidden server ${GUILD}`);
  assert.equal(shown().length, 2); assert.equal(w.relationships[BLOCKED], 2);
});

test('server hiding covers native ordinary/grouped/thread rows and preserves DMs, other servers, explicit search and unload', async t => {
  const w = createWorld(), THREAD = '300000000000000002', DM = '300000000000000003', OTHER = '300000000000000004';
  w.channels[THREAD] = { id: THREAD, parent_id: CHANNEL };
  w.channels[DM] = { id: DM, type: 1 };
  w.channels[OTHER] = { id: OTHER, guildId: '400000000000000002' };
  class ChatManager { constructor() { this.rows = []; } createRow(row) { this.rows.push(row); return row; } }
  w.addModule({ default: ChatManager });
  const search = { getName: () => 'SearchMessageStore', getMessages: () => w.messages };
  w.addModule(search);
  const original = ChatManager.prototype.createRow;
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  t.after(async () => { await w.stop(item); assert.equal(ChatManager.prototype.createRow, original); assert.deepEqual(w.errors, []); assert.equal(w.pathWaiters.size, 0); });
  const row = (id, channelId) => Object.freeze({ type: 1, message: Object.freeze({ id, channelId, authorId: FRIEND }) });
  const manager = new ChatManager();
  manager.createRow(row('server', CHANNEL)); manager.createRow(row('thread', THREAD));
  manager.createRow({ type: 6, content: [row('hidden', THREAD), row('dm', DM), row('other', OTHER)] });
  assert.deepEqual(manager.rows.map(r => r.message.id), ['dm', 'other']);
  assert.equal(search.getMessages(), w.messages); assert.equal(search.getMessages().length, 1);
  assert.equal(w.stores.MessageStore.getMessages(CHANNEL).length, 0);
  await w.stop(item);
  const normal = row('restored', CHANNEL); manager.createRow(normal); assert.equal(manager.rows.at(-1), normal);
});

test('a wholly hidden server never automatically fetches additional history', async t => {
  const w = createWorld();
  const collection = { _array: w.messages, hasMoreBefore: true, hasMoreAfter: false, ready: true };
  w.stores.MessageStore.getMessages = () => collection;
  let requests = 0;
  w.addModule({ fetchMessages() { requests++; } });
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  t.after(async () => { await w.stop(item); assert.deepEqual(w.errors, []); });
  w.stores.MessageStore.getMessages(CHANNEL);
  await w.advance(2000);
  assert.equal(requests, 0);
});
