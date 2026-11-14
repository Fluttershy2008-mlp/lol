'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, BLOCKED, IGNORED, FRIEND, GUILD, CHANNEL } = require('../../revenge-next/tests/next-harness.cjs');
const { installChatButtonsHost } = require('./chat-buttons-fixture.cjs');
const h = React.createElement;
const plugin = 'hide-blocked-and-ignored-messages';
const forumPath = 'modules/forums/native/posts/ForumPostMessageContent.tsx';
const channelPath = 'modules/main_tabs_v2/native/shared_components/ChannelRowPreview.tsx';
const threadPath = 'modules/threads/native/components/ThreadBrowserRowSubtext.tsx';
const starterPath = 'modules/threads/native/components/ThreadParentMessage.tsx';
const threadStorePath = 'modules/threads/ThreadMessageStore.tsx';
const referencedStorePath = 'modules/replies/ReferencedMessageStore.tsx';
const DM = '300000000000000007', GROUP = '300000000000000008', THREAD = '300000000000000009';

async function scene(t, options) {
  const w = createWorld(), fixture = installChatButtonsHost(w);
  const item = await w.start(plugin, options);
  const views = [];
  const mount = async element => {
    let ui;
    await Renderer.act(async () => { ui = Renderer.create(element); });
    views.push(ui);
    return ui;
  };
  const stop = () => Renderer.act(async () => w.stop(item));
  t.after(async () => {
    for (const ui of views.reverse()) await Renderer.act(async () => ui.unmount());
    if (w.loaded.has(plugin)) await stop();
    assert.equal(fixture.patches.size, 0);
    assert.equal(w.pathWaiters.size, 0);
    assert.deepEqual(w.errors, []);
  });
  const message = (author, channel_id = CHANNEL) => Object.freeze({ id: '900000000000000002', channel_id,
    author: w.users[author], content: 'ordinary snippet' });
  const jsx = w.U.react.ReactJSXRuntime.jsx;
  return { w, fixture, item, mount, stop, message, jsx };
}

const text = ui => ui.root.findAllByType('Text').map(node => node.props.children);
const change = (ui, label, value) => Renderer.act(async () => {
  const toggle = ui.root.findAllByType('Switch').find(node => node.props.accessibilityLabel === label);
  assert.ok(toggle, label);
  toggle.props.onValueChange(value);
});

function observableStore(methods) {
  const listeners = new Set();
  return { ...methods, listeners, addChangeListener: fn => listeners.add(fn),
    removeChangeListener: fn => listeners.delete(fn), emitChange: () => { for (const fn of listeners) fn(); } };
}

test('forum cards and both DM list renderers omit blocked previews without hiding card titles or chat rows', async t => {
  const s = await scene(t, { whitelistEnabled: true, whitelistedIds: [IGNORED] });
  const { w, message, mount, jsx } = s;
  const NativeText = w.RN.Text;
  const blocked = value => w.stores.RelationshipStore.isBlocked(value?.author?.id);
  const forum = React.memo(({ message, senderModifier }) => h(NativeText, null,
    senderModifier === 'blocked' || blocked(message) ? 'Post contains a blocked message' : message.content));
  const ChannelRowPreview = ({ message }) => h(NativeText, null, blocked(message) ? 'Blocked message' : message.content);
  const NativeMessageChannelRowPreview = React.memo(ChannelRowPreview);
  w.addModule({ default: forum }, forumPath);
  w.addModule({ ChannelRowPreview, NativeMessageChannelRowPreview }, channelPath);
  const row = (title, type, props) => h(w.RN.View, null, h(NativeText, null, title), jsx(type, props));
  const ui = await mount(h(React.Fragment, null,
    row('Forum title', forum, { message: message(BLOCKED, THREAD), senderModifier: 'blocked' }),
    row('One-to-one DM', ChannelRowPreview, { message: message(BLOCKED, DM), channel: { id: DM, type: 1 } }),
    row('Group DM', NativeMessageChannelRowPreview, { message: message(BLOCKED, GROUP), channel: { id: GROUP, type: 3 } }),
    row('Whitelisted preview', ChannelRowPreview, { message: message(IGNORED, GROUP) }),
    row('Friends’ preview', forum, { message: message(FRIEND, THREAD) }),
    h(NativeText, null, 'Blocked message')));
  assert.deepEqual(text(ui), ['Forum title', 'One-to-one DM', 'Group DM', 'Whitelisted preview', 'ordinary snippet',
    'Friends’ preview', 'ordinary snippet', 'Blocked message']);
  const settings = await mount(h(s.item.options.SettingsComponent, { api: s.item.api }));
  await change(settings, 'Show whitelisted users', false);
  assert.equal(text(ui).filter(value => value === 'ordinary snippet').length, 1);
  await change(settings, 'Hide blocked users', false);
  assert.equal(text(ui).includes('Post contains a blocked message'), true);
  assert.equal(text(ui).filter(value => value === 'Blocked message').length, 3);
  await change(settings, 'Hide blocked users', true);
  assert.equal(text(ui).includes('Post contains a blocked message'), false);
  await Renderer.act(async () => { w.relationships[BLOCKED] = 1; w.stores.RelationshipStore.emitChange(); });
  assert.equal(text(ui).filter(value => value === 'ordinary snippet').length, 3);
  await Renderer.act(async () => { w.relationships[BLOCKED] = 2; w.stores.RelationshipStore.emitChange(); });
  assert.equal(text(ui).filter(value => value === 'ordinary snippet').length, 1);
  await s.stop();
  assert.equal(text(ui).includes('Post contains a blocked message'), true);
  assert.equal(text(ui).filter(value => value === 'Blocked message').length, 3);
});

test('late thread stores suppress a hidden last message and parent message, then restore a visible update', async t => {
  const s = await scene(t), { w, message, mount, jsx } = s;
  let last, referenced;
  const latest = observableStore({ getMostRecentMessage: () => last });
  const replies = observableStore({ getMessage: () => ({ message: referenced }) });
  const subtext = () => h(w.RN.Text, null, last?.content ?? 'thread information');
  const starter = () => h(w.RN.Text, null, referenced?.content ?? 'parent information');
  w.addModule({ ThreadSubtext: subtext }, threadPath);
  w.addModule({ ThreadChannelStarterMessage: starter }, starterPath);
  const thread = { id: THREAD, parent_id: CHANNEL, type: 11, guild_id: GUILD };
  w.channels[THREAD] = thread;
  const ui = await mount(h(React.Fragment, null, h(w.RN.Text, null, 'Thread title'),
    jsx(subtext, { thread }), jsx(starter, { channelId: CHANNEL, messageId: '900000000000000002' })));
  assert.deepEqual(text(ui), ['Thread title', 'thread information', 'parent information']);
  await Renderer.act(async () => {
    last = message(IGNORED, THREAD);
    referenced = message(BLOCKED);
    w.addModule({ default: latest }, threadStorePath);
    w.addModule({ default: replies }, referencedStorePath);
  });
  assert.deepEqual(text(ui), ['Thread title']);
  await Renderer.act(async () => {
    last = message(FRIEND, THREAD);
    referenced = message(FRIEND);
    latest.emitChange(); replies.emitChange();
  });
  assert.deepEqual(text(ui), ['Thread title', 'ordinary snippet', 'ordinary snippet']);
  await s.stop();
  assert.equal(latest.listeners.size, 0);
  assert.equal(replies.listeners.size, 0);
});

test('forum sender markers without a loaded author and server rules hide only their preview', async t => {
  const { w, message, mount, jsx } = await scene(t, { hiddenServerIds: [GUILD] });
  const forum = ({ message, senderModifier }) => h(w.RN.Text, null, message?.content ?? senderModifier);
  w.addModule({ default: forum }, forumPath);
  w.channels[THREAD] = { id: THREAD, parent_id: CHANNEL, type: 11 };
  const ui = await mount(h(React.Fragment, null,
    jsx(forum, { senderModifier: 'ignored' }),
    jsx(forum, { message: message(FRIEND, THREAD) }),
    jsx(forum, { message: message(FRIEND, DM) })));
  assert.deepEqual(text(ui), ['ordinary snippet']);
});
