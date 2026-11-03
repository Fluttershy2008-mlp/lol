'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, CHANNEL, FRIEND, BLOCKED, IGNORED } = require('../../revenge-next/tests/next-harness.cjs');

test('Valenced package hides blocked/ignored pings in both chat read paths and restores them on toggle, edit, unblock and stop', async t => {
  const w = createWorld();
  t.after(async () => {
    for (const item of [...w.loaded.values()].reverse()) await w.stop(item);
    assert.deepEqual(w.errors, []);
    assert.equal(w.timers.size, 0);
  });
  const original = Object.freeze({ id: 'ping', channel_id: CHANNEL, author: w.users[FRIEND],
    content: `<@${BLOCKED}> hi <@!${IGNORED}> <@${FRIEND}>`,
    mentions: [w.users[BLOCKED], w.users[IGNORED], w.users[FRIEND]], attachments: [{ id: 'image' }] });
  w.messages.push(original);
  const item = await w.start('hide-blocked-and-ignored-messages');
  const get = () => w.stores.MessageStore.getMessage(CHANNEL, 'ping');
  assert.equal(get().content, ` hi  <@${FRIEND}>`);
  assert.equal(w.stores.MessageStore.getMessages(CHANNEL).find(m => m.id === 'ping'), get());
  assert.equal(get().mentions.length, 1);
  assert.equal(w.messages.at(-1), original);
  let ui;
  await Renderer.act(async () => { ui = Renderer.create(React.createElement(item.options.SettingsComponent, { api: item.api })); });
  t.after(async () => { if (ui) await Renderer.act(async () => ui.unmount()); });
  const toggle = () => ui.root.findAll(n => n.type === 'Switch' && n.props.accessibilityLabel === 'Hide mentions of them')[0];
  assert.equal(toggle().props.value, true);
  await Renderer.act(async () => toggle().props.onValueChange(false));
  assert.equal(get(), original);
  await Renderer.act(async () => toggle().props.onValueChange(true));
  assert.equal(get().content, ` hi  <@${FRIEND}>`);
  delete w.relationships[BLOCKED]; w.stores.RelationshipStore.emitChange();
  assert.equal(get().content, `<@${BLOCKED}> hi  <@${FRIEND}>`);
  w.messages[w.messages.indexOf(original)] = { ...original, content: `edited <@${IGNORED}>` };
  assert.equal(get().content, 'edited ');
  await w.stop(item);
  assert.equal(get().content, `edited <@${IGNORED}>`);
});
