'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, GUILD, CHANNEL } = require('../../revenge-next/tests/next-harness.cjs');
const OTHER = '400000000000000002';
function fixture(w, lazy = false) {
  const records = [0, 2, 4, 5, 13, 15, 16, 11].map((type, i) => ({ id: `60000000000000000${i}`, guild_id: GUILD, type, name: `Channel ${i}`, position: i }));
  for (const record of records) w.channels[record.id] = record;
  class Category {
    constructor(guild) { this.id = 'category'; this.guild = guild; this.channels = Object.fromEntries(records.map(record => [record.id, { record }])); }
    getShownChannelIds() { return records.slice(0, -1).filter(c => w.stores.PermissionStore.can(1024n, c) !== false).map(c => c.id); }
    getRows() { return this.getShownChannelIds(); }
    shouldShowEmptyCategory() { return true; }
    invalidate() {}
  }
  class Model {
    constructor(id) { this.id = id; this.version = 1; this.noParentCategory = new Category(this); this.categories = {}; }
    getSections() { return this.getRows().map(rows => rows.length); }
    getRows() { return [this.noParentCategory.getRows()]; }
    getChannelFromSectionRow(section, row) { return { channel: this.noParentCategory.channels[this.getRows()[section][row]] }; }
    invalidate() { this.version++; }
  }
  const models = { [GUILD]: new Model(GUILD), [OTHER]: new Model(OTHER) };
  let emits = 0;
  const store = { getName: () => 'ChannelListStore', getGuild(id) { return { guildChannels: models[id], guildChannelsVersion: models[id]?.version }; },
    getGuildWithoutChangingGuildActionRows(id) { return this.getGuild(id); }, emitChange() { emits++; } };
  const renderer = { renderChannelListItem(options) { return `native:${options.row}`; }, getChannelListItemSize() { return 48; } };
  function attach() {
    w.stores.ChannelListStore = store;
    w.addModule(store, 'modules/guild_sidebar/ChannelListStore.tsx');
    w.addModule(renderer, 'modules/channel_list_v2/native/renderRedesignChannelListItem.tsx');
  }
  if (!lazy) attach();
  return { records, models, store, renderer, attach, emits: () => emits };
}

test('beta10 hides every sidebar channel type, preserves source models and restores immediately from the settings toggle', async t => {
  const w = createWorld(), f = fixture(w), original = f.renderer.renderChannelListItem;
  w.stores.GuildChannelStore.getChannels = id => Object.freeze({ SELECTABLE: Object.freeze(f.records.map(channel => ({ channel }))), marker: id });
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  let ui;
  t.after(async () => { if (ui) await Renderer.act(async () => ui.unmount()); await w.stop(item); assert.deepEqual(w.errors, []); assert.equal(w.pathWaiters.size, 0); });
  const view = () => f.store.getGuild(GUILD).guildChannels;
  assert.deepEqual(Array.from(view().getSections()), [0]);
  assert.deepEqual(Array.from(view().getRows()[0]), []);
  assert.equal(f.models[GUILD].getRows()[0].length, 7);
  assert.equal(f.store.getGuild(OTHER).guildChannels.getSections()[0], 7);
  for (let row = 0; row < f.records.length; row++) {
    const args = { guildChannels: view(), section: 0, row };
    assert.equal(f.renderer.renderChannelListItem(args), null); assert.equal(f.renderer.getChannelListItemSize(args), 0);
  }
  assert.equal(w.stores.GuildChannelStore.getChannels(GUILD).SELECTABLE.length, 0);
  assert.equal(w.stores.GuildChannelStore.getChannels(OTHER).SELECTABLE.length, 8);
  assert.equal(w.stores.ChannelStore.getChannel(f.records[5].id), f.records[5]);
  await Renderer.act(async () => { ui = Renderer.create(React.createElement(item.options.SettingsComponent, { api: item.api })); });
  const toggle = label => ui.root.findAll(n => n.type === 'Switch' && n.props.accessibilityLabel === label)[0];
  await Renderer.act(async () => toggle('Hide channel lists in selected servers').props.onValueChange(false));
  assert.equal(view().getSections()[0], 7); assert.equal(w.stores.MessageStore.getMessages(CHANNEL).length, 0);
  await Renderer.act(async () => toggle('Hide channel lists in selected servers').props.onValueChange(true));
  assert.equal(view().getSections()[0], 0);
  await Renderer.act(async () => toggle('Hide messages from selected servers').props.onValueChange(false));
  assert.equal(view().getSections()[0], 7); assert.equal(w.stores.MessageStore.getMessages(CHANNEL).length, 1);
  assert.ok(f.emits() > 0);
  await w.stop(item); assert.equal(f.renderer.renderChannelListItem, original);
  assert.equal(view().getSections()[0], 7);
});

test('channel sidebar modules loaded later are hidden and all pending loaders are removed on unload', async t => {
  const w = createWorld(), f = fixture(w, true), original = f.renderer.renderChannelListItem;
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  f.attach();
  assert.equal(f.store.getGuild(GUILD).guildChannels.getSections()[0], 0);
  assert.equal(f.renderer.renderChannelListItem({ guildChannels: f.models[GUILD] }), null);
  await w.stop(item);
  assert.equal(f.renderer.renderChannelListItem, original); assert.equal(w.pathWaiters.size, 0); assert.equal(w.timers.size, 0); assert.deepEqual(w.errors, []);
});

for (const order of [['hide-blocked-and-ignored-messages', 'show-hidden-channels'], ['show-hidden-channels', 'hide-blocked-and-ignored-messages']]) {
  test(`hidden server sidebar stays empty with actual ShowHiddenChannels package: ${order.join(' then ')}`, async t => {
    const w = createWorld(), f = fixture(w), loaded = [];
    w.stores.PermissionStore.can = (_permission, channel) => channel.type !== 15;
    t.after(async () => { for (const item of loaded.reverse()) await w.stop(item); assert.deepEqual(w.errors, []); assert.equal(w.pathWaiters.size, 0); });
    for (const slug of order) loaded.push(await w.start(slug, slug === 'hide-blocked-and-ignored-messages' ? { hiddenServerIds: [GUILD] } : {}));
    const model = f.store.getGuild(GUILD).guildChannels;
    assert.equal(model.getSections()[0], 0);
    assert.equal(model.getRows()[0].length, 0);
    assert.ok(f.models[GUILD].getRows()[0].includes(f.records.find(c => c.type === 15).id), 'ShowHiddenChannels still adds the locked forum to its real model');
  });
}
