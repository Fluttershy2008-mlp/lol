'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, CHANNEL, BLOCKED, IGNORED, FRIEND } = require('../../revenge-next/tests/next-harness.cjs');

test('Valenced whitelist manager validates IDs, saves/removes exceptions, toggles visibility and persists across restarts without unblocking', async t => {
  const w = createWorld();
  const row = (id, user) => Object.freeze({ id, channel_id: CHANNEL, author: w.users[user], content: 'original' });
  w.messages.push(row('blocked', BLOCKED), row('ignored', IGNORED), row('friend', FRIEND));
  let item = await w.start('hide-blocked-and-ignored-messages'), ui;
  t.after(async () => {
    if (ui) await Renderer.act(async () => ui.unmount());
    for (const loaded of [...w.loaded.values()].reverse()) await w.stop(loaded);
    assert.deepEqual(w.errors, []); assert.equal(w.timers.size, 0);
  });
  const shown = id => w.stores.MessageStore.getMessages(CHANNEL).some(m => m.id === id);
  assert.equal(shown('blocked'), false); assert.equal(shown('ignored'), false);
  await Renderer.act(async () => { ui = Renderer.create(React.createElement(item.options.SettingsComponent, { api: item.api })); });
  const native = (type, label) => ui.root.findAll(n => n.type === type && n.props.accessibilityLabel === label)[0];
  const press = async label => Renderer.act(async () => native('Pressable', label).props.onPress());
  const input = async text => Renderer.act(async () => native('TextInput', 'User IDs to whitelist').props.onChangeText(text));
  const toggle = () => native('Switch', 'Show whitelisted users');
  assert.equal(toggle().props.value, false);
  await press('Manage whitelisted IDs (0)');
  await input(`${BLOCKED}, invalid`); await press('Add and show');
  assert.equal(shown('blocked'), false);
  assert.deepEqual(Array.from(item.api.jsonStorage.cache.whitelistedIds), []);
  await input(`<@${BLOCKED}>, ${BLOCKED}\n${IGNORED}`); await press('Add and show');
  assert.equal(toggle().props.value, true);
  assert.deepEqual(Array.from(item.api.jsonStorage.cache.whitelistedIds), [BLOCKED, IGNORED]);
  assert.equal(shown('blocked'), true); assert.equal(shown('ignored'), true);
  await press(`Remove whitelisted user ${BLOCKED}`);
  assert.equal(shown('blocked'), false); assert.equal(shown('ignored'), true);
  await Renderer.act(async () => toggle().props.onValueChange(false));
  assert.equal(shown('ignored'), false);
  await Renderer.act(async () => toggle().props.onValueChange(true));
  assert.equal(shown('ignored'), true);
  await Renderer.act(async () => ui.unmount()); ui = undefined;
  await w.stop(item);
  const saved = structuredClone(item.api.jsonStorage.cache);
  item = await w.start('hide-blocked-and-ignored-messages', saved);
  assert.equal(shown('blocked'), false); assert.equal(shown('ignored'), true);
  assert.equal(w.relationships[BLOCKED], 2); assert.equal(w.relationships[IGNORED], 5);
  assert.equal(w.calls.some(call => call[0] === 'unblock'), false);
});

test('Valenced upgrade defaults the whitelist off and sanitizes malformed stored ID values', async t => {
  const w = createWorld();
  const item = await w.start('hide-blocked-and-ignored-messages', {
    whitelistEnabled: 'true', whitelistedIds: [BLOCKED, BLOCKED, 'invalid', Number(IGNORED)] });
  t.after(async () => { await w.stop(item); assert.deepEqual(w.errors, []); assert.equal(w.timers.size, 0); });
  assert.equal(item.api.jsonStorage.cache.whitelistEnabled, false);
  assert.deepEqual(Array.from(item.api.jsonStorage.cache.whitelistedIds), [BLOCKED]);
});
