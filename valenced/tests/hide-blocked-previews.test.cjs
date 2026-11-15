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

test('Messages voice cards use the selected server IDs and a switch independent of message hiding', async t => {
  const { w, item, mount, stop, jsx } = await scene(t, { hiddenServerIds: [GUILD] });
  const otherGuild = '400000000000000002';
  const hiddenVoice = '600000000000000001';
  const otherVoice = '600000000000000002';
  w.channels[hiddenVoice] = { id: hiddenVoice, type: 2, guild_id: GUILD };
  w.channels[otherVoice] = { id: otherVoice, type: 2, guild_id: otherGuild };
  w.channels[GROUP] = { id: GROUP, type: 3 };
  const data = Object.freeze([
    { kind: 'voice', name: 'Selected voice', guildId: GUILD, voiceState: { channelId: hiddenVoice } },
    { kind: 'unified-vc', name: 'Selected unified voice', voiceState: { channelId: hiddenVoice } },
    { kind: 'embedded-activity', name: 'Selected embedded activity', voiceState: { guildId: GUILD } },
    { kind: 'live-guild-stage', name: 'Selected stage', stage: { guild_id: GUILD, channel_id: hiddenVoice } },
    { kind: 'activity', name: 'Selected stream', stream: { guildId: GUILD, channelId: hiddenVoice } },
    { kind: 'voice', name: 'Other server voice', voiceState: { channelId: otherVoice } },
    { kind: 'voice', name: 'Group call', voiceState: { channelId: GROUP } },
    { kind: 'activity', name: 'Game activity', guildId: GUILD },
    { kind: 'voice', name: 'Unknown channel', voiceState: {} },
  ].map(Object.freeze));
  const result = Object.freeze([data, false]);
  const original = function useHappeningNowData() { return React.useState(result)[0]; };
  const dataModule = { default: original };
  const carousel = React.memo(function HappeningNow({ guildId }) {
    const [cards, loading] = dataModule.default(new Set(), { guildId });
    assert.equal(loading, false);
    return cards.map(card => h(w.RN.Text, { key: card.name }, card.name));
  });
  const path = 'modules/main_tabs_v2/native/shared_components/happening_now/';
  w.addModule(dataModule, path + 'useHappeningNowData.tsx');
  w.addModule({ default: carousel }, path + 'HappeningNow.tsx');
  const messages = await mount(jsx(carousel, {}));
  const guild = await mount(jsx(carousel, { guildId: GUILD }));
  const settings = await mount(h(item.options.SettingsComponent, { api: item.api }));
  const allCards = data.map(card => card.name);
  assert.deepEqual(text(messages), allCards.slice(5));
  assert.deepEqual(text(guild), allCards);

  const messagesSetting = 'Hide messages from selected servers';
  const voiceSetting = 'Hide voice activity from selected servers';
  assert.equal(w.stores.MessageStore.getMessages(CHANNEL).length, 0);
  await change(settings, messagesSetting, false);
  assert.equal(w.stores.MessageStore.getMessages(CHANNEL).length, 1);
  assert.deepEqual(text(messages), allCards.slice(5));
  await change(settings, messagesSetting, true);

  await change(settings, voiceSetting, false);
  assert.deepEqual(text(messages), allCards);
  assert.equal(w.stores.MessageStore.getMessages(CHANNEL).length, 0);
  await change(settings, voiceSetting, true);
  assert.deepEqual(text(messages), allCards.slice(5));

  const press = label => Renderer.act(async () => {
    settings.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === label).props.onPress();
  });
  await press('Manage hidden server IDs (1)');
  await press(`Remove hidden server ${GUILD}`);
  assert.deepEqual(text(messages), allCards);
  await Renderer.act(async () => {
    settings.root.findByType('TextInput').props.onChangeText(otherGuild);
  });
  await press('Add and hide servers');
  assert.deepEqual(text(messages), allCards.filter(name => name !== 'Other server voice'));

  await stop();
  assert.equal(dataModule.default, original);
  assert.deepEqual(text(messages), allCards);
});

test('upgrading copies the previous voice behavior once and preserves an explicit voice setting', async t => {
  const { item, mount, w } = await scene(t, { hiddenServerIds: [GUILD], hideServers: false });
  const settings = await mount(h(item.options.SettingsComponent, { api: item.api }));
  const voiceSetting = 'Hide voice activity from selected servers';
  const voiceSwitch = () => settings.root.findAllByType('Switch')
    .find(node => node.props.accessibilityLabel === voiceSetting);
  assert.equal(voiceSwitch().props.value, false);
  await change(settings, 'Hide messages from selected servers', true);
  assert.equal(voiceSwitch().props.value, false);

  const previousSettings = { ...item.api.jsonStorage.cache };
  assert.equal(previousSettings.hideServerVoiceActivity, false);
  const reloadedWorld = createWorld();
  installChatButtonsHost(reloadedWorld);
  const reloaded = await reloadedWorld.start(plugin, previousSettings);
  t.after(async () => reloadedWorld.stop(reloaded));
  const reloadedSettings = await mount(h(reloaded.options.SettingsComponent, { api: reloaded.api }));
  assert.equal(reloadedSettings.root.findAllByType('Switch')
    .find(node => node.props.accessibilityLabel === voiceSetting).props.value, false);
  assert.equal(w.stores.MessageStore.getMessages(CHANNEL).length, 0);
});
