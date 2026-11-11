'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, GUILD, CHANNEL, BLOCKED, IGNORED, FRIEND } = require('../../revenge-next/tests/next-harness.cjs');

const path = 'modules/main_tabs_v2/native/shared_components/user_list/';
const h = React.createElement;
const other = '300000000000000002';
const findSwitch = (settings, name) => settings.root.findAllByType('Switch').find(node => node.props.accessibilityLabel === name);
const visible = ui => ui.root.findAllByType('Text').map(node => node.props.children);
const row = (id, username) => Object.freeze({ type: 'MEMBER', user: Object.freeze({ id, username }) });

test('the installed Valenced package filters the text Members tab and restores rows live', async t => {
  const w = createWorld(), scrolls = [];
  w.channels[other] = { type: 2 };
  const groups = Object.freeze([
    Object.freeze({ index: 0, count: 1, title: 'First role' }),
    Object.freeze({ index: 2, count: 3, title: 'Second role' }),
  ]);
  const rows = [];
  rows[1] = row(BLOCKED, 'Blocked member');
  rows[3] = row(IGNORED, 'Ignored member');
  rows[4] = row(FRIEND, 'Visible member');
  Object.freeze(rows);
  const data = Object.freeze({ groups, rows });
  w.addModule({ default: { getProps(guildId, channelId) {
    assert.equal(guildId, GUILD);
    assert.equal(channelId, CHANNEL);
    return data;
  } } }, 'stores/ChannelMemberStore.tsx');
  w.addModule({ default: () => React.useState(50)[0] }, path + 'useScaledRowHeight.tsx');
  w.addModule({ default: () => React.useState(20)[0] }, path + 'useScaledSectionHeight.tsx');

  function UsersFastList(props) {
    return h('Members', props, props.sections.map((count, section) =>
      h(React.Fragment, { key: section },
        h('Text', null, props.getSectionProps(section).props.title),
        Array.from({ length: count }, (_, index) => {
          const item = props.getItemProps(section, index);
          return h('Text', { key: index, start: item.props.start, end: item.props.end }, item.props.user?.username ?? 'Loading member');
        }))));
  }
  const original = function a({ searching }) {
    const [header] = React.useState('Channel details');
    return h(React.Fragment, null, h('Text', null, header), h(UsersFastList, {
      key: searching ? 'guild-channel-user-list-search-results' : 'guild-channel-user-list',
      sections: [1, 3],
      getSectionProps(index) { return { type: 'section', props: { title: groups[index].title + ' — ' + groups[index].count } }; },
      getItemProps(section, index) {
        const group = groups[section], user = rows[group.index + 1 + index]?.user;
        return { type: user ? 'user' : 'placeholder', props: { user, start: index === 0, end: index === group.count - 1 } };
      },
      onScroll: event => scrolls.push(event.nativeEvent.contentOffset.y),
    }));
  };
  const list = React.memo(original);
  const item = await w.start('hide-blocked-and-ignored-messages', { whitelistedIds: [BLOCKED] });
  w.addModule({ default: list }, path + 'GuildChannelUserList.tsx');
  let ui, settings;
  const element = (props = {}) => h(list, { channelId: CHANNEL, guildId: GUILD, ...props });
  t.after(async () => {
    await Renderer.act(async () => { ui?.unmount(); settings?.unmount(); });
    await w.stop(item);
    assert.equal(list.type, original);
    assert.equal(w.pathWaiters.size, 0);
    assert.deepEqual(w.errors, []);
  });
  await Renderer.act(async () => { ui = Renderer.create(element()); });
  settings = await w.render(item);
  assert.deepEqual(visible(ui), ['Channel details', 'Second role — 2', 'Visible member', 'Loading member']);
  const members = ui.root.findByType('Members');
  assert.deepEqual(Array.from(members.props.sections), [2]);
  assert.equal(members.props.getItemProps(0, 0).props.start, true);
  assert.equal(members.props.getItemProps(0, 1).props.end, true);
  members.props.onScroll({ nativeEvent: { contentOffset: { y: 25 } } });
  assert.deepEqual(scrolls, [145]);

  await Renderer.act(async () => findSwitch(settings, 'Show whitelisted users').props.onValueChange(true));
  assert.ok(visible(ui).includes('Blocked member'));
  assert.equal(w.stores.RelationshipStore.isBlocked(BLOCKED), true);
  await Renderer.act(async () => findSwitch(settings, 'Show whitelisted users').props.onValueChange(false));
  assert.ok(!visible(ui).includes('Blocked member'));
  await Renderer.act(async () => findSwitch(settings, 'Hide blocked users').props.onValueChange(false));
  assert.ok(visible(ui).includes('Blocked member'));
  assert.ok(!visible(ui).includes('Ignored member'));
  await Renderer.act(async () => findSwitch(settings, 'Hide blocked users').props.onValueChange(true));
  assert.ok(!visible(ui).includes('Blocked member'));
  await Renderer.act(async () => {
    w.relationships[FRIEND] = 2;
    w.stores.RelationshipStore.emitChange();
  });
  assert.deepEqual(visible(ui), ['Channel details', 'Second role — 1', 'Loading member']);
  await Renderer.act(async () => {
    w.relationships[FRIEND] = 1;
    w.stores.RelationshipStore.emitChange();
  });
  assert.ok(visible(ui).includes('Visible member'));

  for (const props of [{ searching: true }, { channelId: other }, { roleId: 'role' }]) {
    await Renderer.act(async () => ui.update(element(props)));
    assert.ok(visible(ui).includes('Blocked member'));
    assert.ok(visible(ui).includes('Ignored member'));
  }
  await Renderer.act(async () => ui.update(element()));
  assert.ok(!visible(ui).includes('Blocked member'));
  await Renderer.act(async () => w.stop(item));
  assert.ok(visible(ui).includes('Blocked member'));
  assert.ok(visible(ui).includes('Ignored member'));
  assert.equal(rows[1].user.id, BLOCKED);
  assert.equal(groups[1].count, 3);
});

test('member list projection preserves whitelisted users and unloaded slots in sparse pages', async () => {
  const { projectChannelMemberList } = await import('../../hide-blocked-and-ignored-messages/src/member-list.js');
  const groups = [{ index: 0, count: 50000, title: 'Online' }];
  const rows = { 1: row(BLOCKED, 'Whitelisted'), 45001: row(IGNORED, 'Ignored') };
  const reads = [];
  const props = {
    sections: [50000],
    getItemProps(section, index) {
      reads.push([section, index]);
      return { props: { user: rows[index + 1]?.user } };
    },
    getSectionProps: () => ({ props: { title: 'Online — 50000' } }),
  };
  const projected = projectChannelMemberList(props, { groups, rows }, id => id === IGNORED, 50, 20);
  assert.deepEqual(reads, [[0, 45000]]);
  assert.deepEqual(projected.sections, [49999]);
  assert.equal(projected.getItemProps(0, 0).props.user.id, BLOCKED);
  assert.equal(projected.getItemProps(0, 44999).props.user, undefined);
  assert.equal(projected.getItemProps(0, 45000).props.user, undefined);
  assert.deepEqual(reads.at(-1), [0, 45001]);
  assert.equal(projected.getSectionProps(0).props.title, 'Online — 49999');
  assert.equal(projectChannelMemberList(props, { groups, rows }, () => false, 50, 20), props);
});
