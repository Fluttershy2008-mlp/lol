'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, GUILD } = require('../../revenge-next/tests/next-harness.cjs');
const KEEP = '400000000000000002';
function setup(w, lazy = false, emitter = 'emitChange') {
  const folder = Object.freeze({ folderId: 7, guildIds: Object.freeze([GUILD, KEEP]) });
  const folders = Object.freeze([Object.freeze({ folderId: undefined, guildIds: Object.freeze([GUILD]) }), folder]), ids = Object.freeze([GUILD, KEEP]);
  const tree = Object.freeze({ root: Object.freeze({ type: 'root', children: Object.freeze([
    Object.freeze({ type: 'guild', id: GUILD }), Object.freeze({ type: 'folder', id: 7, children: Object.freeze([{ type: 'guild', id: GUILD }, { type: 'guild', id: KEEP }]) })
  ]) }), nodes: {} });
  let emits = 0;
  const store = { getName: () => 'SortedGuildStore',
    getGuildsTree: () => tree, getFastListGuildFolders: () => folders, getFlattenedGuildFolderList: () => folders,
    getFlattenedGuildIds: () => ids, getGuildFolderById: () => folder,
    // Persistence getters deliberately remain full, even during folder rename/reorder.
    getGuildFolders: () => folders, getCompatibleGuildFolders: () => folders,
    [emitter]() { emits++; } };
  const original = store.getFastListGuildFolders;
  const attach = () => { w.stores.SortedGuildStore = store; w.addModule(store, 'stores/SortedGuildStore.tsx'); };
  if (!lazy) attach();
  return { store, folders, ids, tree, attach, original, emits: () => emits };
}
test('beta11 hides server slots and folder previews, keeps membership/order intact, and restores with the settings switch', async t => {
  const w = createWorld(), f = setup(w);
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] }); let ui;
  t.after(async () => { if (ui) await Renderer.act(async () => ui.unmount()); await w.stop(item); assert.deepEqual(w.errors, []); assert.equal(w.pathWaiters.size, 0); assert.equal(w.timers.size, 0); });
  assert.equal(item.api.jsonStorage.cache.hideServerIcons, true);
  assert.deepEqual(Array.from(f.store.getFlattenedGuildIds()), [KEEP]);
  assert.deepEqual(Array.from(f.store.getFastListGuildFolders()[0].guildIds), [KEEP]);
  assert.deepEqual(Array.from(f.store.getGuildFolderById(7).guildIds), [KEEP]);
  assert.equal(f.store.getGuildsTree().root.children.length, 1);
  assert.equal(f.store.getGuildsTree().root.children[0].children.length, 1);
  assert.equal(f.store.getGuildFolders(), f.folders); assert.equal(f.store.getCompatibleGuildFolders(), f.folders);
  assert.equal(w.stores.GuildStore.getGuild(GUILD), w.guilds[GUILD]); assert.ok(w.stores.GuildStore.getGuilds()[GUILD]);
  await Renderer.act(async () => { ui = Renderer.create(React.createElement(item.options.SettingsComponent, { api: item.api })); });
  const toggle = label => ui.root.findAll(n => n.type === 'Switch' && n.props.accessibilityLabel === label)[0];
  await Renderer.act(async () => toggle('Hide selected server icons').props.onValueChange(false));
  assert.equal(f.store.getFlattenedGuildIds(), f.ids); assert.equal(f.store.getGuildsTree(), f.tree);
  await Renderer.act(async () => toggle('Hide selected server icons').props.onValueChange(true));
  assert.equal(f.store.getFlattenedGuildIds().length, 1);
  await Renderer.act(async () => toggle('Hide messages from selected servers').props.onValueChange(false));
  assert.equal(f.store.getFlattenedGuildIds(), f.ids); assert.ok(f.emits() > 0);
  await w.stop(item); assert.equal(f.store.getFastListGuildFolders, f.original); assert.equal(f.store.getGuildsTree(), f.tree);
});
test('late server bar stores attach correctly, support doEmitChanges and clean up on stop', async () => {
  const w = createWorld(), f = setup(w, true, 'doEmitChanges');
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  f.attach(); assert.equal(f.store.getFlattenedGuildIds().length, 1); assert.ok(f.emits() > 0);
  await w.stop(item); assert.equal(f.store.getFastListGuildFolders, f.original); assert.equal(w.pathWaiters.size, 0); assert.deepEqual(w.errors, []);
});
test('saved icon visibility survives plugin restart and an empty server list leaves the native bar untouched', async () => {
  const w = createWorld(), f = setup(w);
  let item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD], hideServerIcons: false });
  assert.equal(f.store.getFlattenedGuildIds(), f.ids);
  const saved = structuredClone(item.api.jsonStorage.cache); await w.stop(item);
  item = await w.start('hide-blocked-and-ignored-messages', saved); assert.equal(f.store.getFlattenedGuildIds(), f.ids); await w.stop(item);
  item = await w.start('hide-blocked-and-ignored-messages'); assert.equal(f.store.getGuildsTree(), f.tree); await w.stop(item);
  assert.deepEqual(w.errors, []); assert.equal(w.pathWaiters.size, 0);
});
