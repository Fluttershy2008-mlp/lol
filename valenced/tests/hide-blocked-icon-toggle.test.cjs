'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, GUILD, CHANNEL } = require('../../revenge-next/tests/next-harness.cjs');
const KEEP = '400000000000000002';
const h = React.createElement;
const contents = ui => ui.root.findAll(n => n.type === 'Text').map(n => n.props.children).flat().join(' ');

async function scene(w, initial) {
  const fullList = Object.freeze([{ type: 'guild', id: GUILD }, { type: 'guild', id: KEEP }]);
  const store = { getName: () => 'SortedGuildStore', getFastListGuildFolders: () => fullList, emitChange() {} };
  w.stores.SortedGuildStore = store; w.addModule(store);
  const selector = { useGuildsBarProps: () => ({ guildFolders: store.getFastListGuildFolders() }) };
  w.addModule(selector, 'modules/guilds_bar/native/hooks/useGuildsBarProps.tsx');
  let snapshots = 0;
  const GuildsBar = React.memo(function GuildsBar() {
    const props = React.useMemo(() => { snapshots++; return selector.useGuildsBarProps(); }, []);
    const [nativeState] = React.useState('native state retained');
    return h(w.RN.View, null, h(w.RN.Text, { key: 'state' }, nativeState),
      h(w.RN.FlatList, { key: 'list', data: props.guildFolders, renderItem: ({ item }) => h(w.RN.Text, { key: item.id }, item.id) }));
  });
  w.addModule({ default: GuildsBar }, 'modules/guilds_bar/native/GuildsBar.tsx');
  const item = await w.start('hide-blocked-and-ignored-messages', initial);
  let bar, settings;
  await Renderer.act(async () => {
    bar = Renderer.create(h(GuildsBar));
    settings = Renderer.create(h(item.options.SettingsComponent, { api: item.api }));
  });
  const toggle = async (label, value) => Renderer.act(async () => {
    settings.root.findAll(n => n.type === 'Switch' && n.props.accessibilityLabel === label)[0].props.onValueChange(value);
  });
  const close = async () => { await Renderer.act(async () => { bar.unmount(); settings.unmount(); }); await w.stop(item); };
  return { item, bar, settings, toggle, close, fullList, snapshots: () => snapshots };
}

test('OFF immediately restores and ON immediately hides icons even when the native bar cached its list once while hidden', async t => {
  const w = createWorld(), s = await scene(w, { hiddenServerIds: [GUILD], hideServerIcons: true });
  t.after(async () => { await s.close(); assert.deepEqual(w.errors, []); assert.equal(w.pathWaiters.size, 0); assert.equal(w.timers.size, 0); });
  assert.ok(!contents(s.bar).includes(GUILD));
  for (let i = 0; i < 3; i++) {
    await s.toggle('Hide selected server icons', false);
    assert.ok(contents(s.bar).includes(GUILD), 'OFF must restore the cached native icon immediately');
    await s.toggle('Hide selected server icons', true);
    assert.ok(!contents(s.bar).includes(GUILD), 'ON must hide it again immediately');
    assert.ok(contents(s.bar).includes(KEEP)); assert.ok(contents(s.bar).includes('native state retained'));
  }
  assert.equal(s.snapshots(), 1, 'do not remount the native bar or reset its state to refresh the icons');
  assert.equal(s.fullList.length, 2);
});

test('icon switch controls only icons and works with message and channel hiding disabled', async t => {
  const w = createWorld(), s = await scene(w, { hiddenServerIds: [GUILD], hideServerIcons: false, hideServers: false, hideServerChannels: false });
  t.after(async () => { await s.close(); assert.deepEqual(w.errors, []); });
  assert.ok(contents(s.bar).includes(GUILD));
  await s.toggle('Hide selected server icons', true); assert.ok(!contents(s.bar).includes(GUILD));
  assert.equal(w.stores.MessageStore.getMessages(CHANNEL).length, 1);
  assert.equal(s.item.api.jsonStorage.cache.hideServers, false); assert.equal(s.item.api.jsonStorage.cache.hideServerChannels, false);
  await s.toggle('Hide selected server icons', false); assert.ok(contents(s.bar).includes(GUILD));
  assert.equal(w.stores.MessageStore.getMessages(CHANNEL).length, 1);
});
