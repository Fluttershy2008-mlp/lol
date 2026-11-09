'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, GUILD } = require('../../revenge-next/tests/next-harness.cjs');
const KEEP = '400000000000000002';
const h = React.createElement;
const barPath = 'modules/guilds_bar/native/GuildsBar.tsx';
const rowPath = 'modules/guilds_bar/native/GuildsBarGuild.tsx';
const text = ui => ui.root.findAll(n => n.type === 'Text').map(n => n.props.children).flat().join(' ');

test('beta12 filters a captured native bar snapshot without any SortedGuildStore reads; original hooks and restore toggle work', async t => {
  const w = createWorld(), source = Object.freeze([{ id: GUILD, type: 0 }, { id: KEEP, type: 0 }]);
  let mounts = [];
  const GuildsBar = React.memo(function GuildsBar() {
    const [stamp] = React.useState('home');
    React.useEffect(() => () => {}, []);
    return h(w.RN.View, null, h(w.RN.Text, null, stamp),
      h(w.RN.FlatList, { data: source, renderItem: ({ item }) => {
        mounts.push(item.id); return h(w.RN.Text, { key: item.id }, item.id);
      } }));
  });
  const captured = GuildsBar; w.addModule({ default: GuildsBar }, barPath);
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  let ui, settings;
  t.after(async () => { await Renderer.act(async () => { ui?.unmount(); settings?.unmount(); }); await w.stop(item); assert.deepEqual(w.errors, []); assert.equal(w.pathWaiters.size, 0); });
  await Renderer.act(async () => { ui = Renderer.create(h(captured)); settings = Renderer.create(h(item.options.SettingsComponent, { api: item.api })); });
  assert.ok(text(ui).includes('home')); assert.ok(text(ui).includes(KEEP)); assert.ok(!text(ui).includes(GUILD));
  assert.ok(!mounts.includes(GUILD)); assert.equal(source.length, 2);
  const toggle = () => settings.root.findAll(n => n.type === 'Switch' && n.props.accessibilityLabel === 'Hide selected server icons')[0];
  await Renderer.act(async () => toggle().props.onValueChange(false));
  assert.ok(text(ui).includes(GUILD));
  await Renderer.act(async () => toggle().props.onValueChange(true));
  assert.ok(!text(ui).includes(GUILD)); assert.ok(text(ui).includes(KEEP));
  await Renderer.act(async () => w.stop(item));
  assert.ok(text(ui).includes(GUILD));
});

test('late minified memo row is suppressed at its render boundary, including its streaming badge, without changing React hook order', async t => {
  const w = createWorld();
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  const row = React.memo(function a(props) {
    const [label] = React.useState('stream badge');
    return h(w.RN.View, null, h(w.RN.Text, null, props.guild.id), h(w.RN.Text, null, label));
  });
  const original = row.type; w.addModule({ default: row }, rowPath);
  let ui;
  t.after(async () => { await Renderer.act(async () => ui?.unmount()); await w.stop(item); assert.equal(row.type, original); assert.deepEqual(w.errors, []); assert.equal(w.pathWaiters.size, 0); });
  await Renderer.act(async () => { ui = Renderer.create(h(row, { guild: { id: GUILD } })); });
  assert.equal(ui.toJSON(), null);
  await Renderer.act(async () => ui.update(h(row, { guild: { id: KEEP } })));
  assert.ok(text(ui).includes(KEEP)); assert.ok(text(ui).includes('stream badge'));
  await Renderer.act(async () => ui.update(h(row, { guild: { id: GUILD } })));
  assert.equal(ui.toJSON(), null);
});

test('native bar selector filters its own tree/sections data without changing persistence snapshots', async t => {
  const w = createWorld();
  const source = Object.freeze({ guildFolders: Object.freeze([{ type: 2, id: GUILD }, { id: KEEP }]),
    data: Object.freeze([{ data: Object.freeze([{ guildId: GUILD }, { guildId: KEEP }]) }]),
    guildsTree: Object.freeze({ root: Object.freeze({ children: Object.freeze([{ type: 'guild', id: GUILD }, { type: 'guild', id: KEEP }]) }) }) });
  const module = { useGuildsBarProps: () => source }, original = module.useGuildsBarProps;
  w.addModule(module, 'modules/guilds_bar/native/hooks/useGuildsBarProps.tsx');
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  t.after(async () => { await w.stop(item); assert.equal(module.useGuildsBarProps, original); assert.deepEqual(w.errors, []); });
  const result = module.useGuildsBarProps();
  assert.equal(result.guildFolders.length, 1); assert.equal(result.guildFolders[0].id, KEEP);
  assert.equal(result.data[0].data.length, 1); assert.equal(result.data[0].data[0].guildId, KEEP);
  assert.equal(result.guildsTree.root.children.length, 1); assert.equal(source.guildFolders.length, 2);
});

test('the shared class GuildIcon is a fallback when no named server bar module is available', async t => {
  const w = createWorld();
  class GuildIcon extends React.Component {
    render() { return h(w.RN.Text, null, this.props.guild.id); }
  }
  const original = GuildIcon.prototype.render; w.addModule(GuildIcon);
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  let ui;
  t.after(async () => { await Renderer.act(async () => ui?.unmount()); await w.stop(item); assert.equal(GuildIcon.prototype.render, original); assert.deepEqual(w.errors, []); });
  await Renderer.act(async () => { ui = Renderer.create(h(GuildIcon, { guild: { id: GUILD } })); });
  assert.equal(ui.toJSON(), null);
  await Renderer.act(async () => ui.update(h(GuildIcon, { guild: { id: KEEP } })));
  assert.ok(text(ui).includes(KEEP));
});
