'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, GUILD, CHANNEL, FRIEND } = require('../../revenge-next/tests/next-harness.cjs');
const h = React.createElement, KEEP = '400000000000000002', OTHER = '300000000000000002', DM = '300000000000000003', THREAD = '300000000000000004';
function fixture(w, late = false) {
  w.channels[OTHER] = { id: OTHER, guild_id: KEEP }; w.channels[DM] = { id: DM, type: 1 };
  w.channels[THREAD] = { id: THREAD, parent_id: CHANNEL };
  const hidden = Object.freeze({ id: 'one', guild_id: GUILD, message_channel_id: CHANNEL, message: Object.freeze({ id: 'm1', channel_id: CHANNEL, content: 'role announcement' }) });
  const visible = Object.freeze({ id: 'two', guild_id: KEEP, message_channel_id: OTHER, message: Object.freeze({ id: 'm2', channel_id: OTHER }) });
  const dm = Object.freeze({ id: 'three', message: Object.freeze({ id: 'm3', channel_id: DM, author: { id: FRIEND }, referenced_message: { guild_id: GUILD } }) });
  let mentions = Object.freeze([hidden, visible, dm]);
  const allItems = Object.freeze([hidden, visible, dm, Object.freeze({ id: 'friend', type: 'incoming_friend_request' })]);
  const local = Object.freeze([{ id: 'request', type: 'incoming_friend_request' }]);
  const persisted = Object.freeze({ notifCenterItems: allItems, staleNotifCenterItems: allItems, cursor: 'native-cursor', hasMore: true });
  const listeners = new Set(); let emits = 0;
  class Items {
    get items() { return allItems; } get localItems() { return local; }
    getState() { return persisted; } getName() { return 'NotificationCenterItemsStore'; }
    emitChange() { emits++; for (const fn of listeners) fn(); }
    addChangeListener(fn) { listeners.add(fn); } removeChangeListener(fn) { listeners.delete(fn); }
  }
  const items = new Items(), itemGetter = Object.getOwnPropertyDescriptor(Items.prototype, 'items').get;
  const recent = { getName: () => 'RecentMentionsStore', getMentions: () => mentions, getSettingsFilteredMentions: () => mentions,
    hasMention: () => true, getMentionCountForChannel: id => id === CHANNEL ? 5 : 3, emitChange() {} };
  const states = Object.freeze({
    [GUILD]: Object.freeze({ highImportanceMentionCount: 5, lowImportanceMentionCount: 7, ncMentionCount: 11 }),
    [KEEP]: Object.freeze({ highImportanceMentionCount: 3, lowImportanceMentionCount: 2, ncMentionCount: 6 }),
    '@me': Object.freeze({ highImportanceMentionCount: 2, lowImportanceMentionCount: 0, ncMentionCount: 2 }),
  });
  const guild = { getName: () => 'GuildReadStateStore', getMutableGuildStates: () => states,
    getMentionCount: id => (states[id]?.highImportanceMentionCount ?? 0) + (states[id]?.lowImportanceMentionCount ?? 0),
    getTotalMentionCount: () => 10, getTotalNotificationsMentionCount: () => 19, emitChange() {} };
  const read = w.stores.ReadStateStore;
  read.getMentionCount = id => ({ [CHANNEL]: 5, [OTHER]: 3, [DM]: 2, [THREAD]: 1 })[id] ?? 0;
  read.getMentionChannelIds = () => [CHANNEL, OTHER, DM, THREAD];
  const center = { getName: () => 'NotificationCenterStore', hasNewMentions: () => true, emitChange() {} };
  const banner = { getName: () => 'InAppNotificationStore', getCurrentNotification: () => hidden, emitChange() {} };
  const policy = { shouldNotify: () => true, shouldNotifyBase: () => true, shouldNotifyForReaction: () => true };
  let queued = 0, sounded = 0;
  const enqueue = { enqueueNotification() { queued++; return 'queued'; }, clearNotification() {} };
  const sound = { playInAppMessageSound() { sounded++; return 'sound'; } };
  const loader = { useNotificationCenterItemsLoader: () => ({ items: allItems, cursor: 'native-cursor', hasMore: true }) };
  const old = { read: read.getMentionCount, guild: guild.getMentionCount, total: guild.getTotalMentionCount, policy: policy.shouldNotify, enqueue: enqueue.enqueueNotification };
  function attach() {
    for (const [name, store, path] of [
      ['NotificationCenterItemsStore', items, 'modules/notification_center/NotificationCenterItemsStore.tsx'],
      ['RecentMentionsStore', recent, 'modules/inbox/RecentMentionsStore.tsx'],
      ['GuildReadStateStore', guild, 'stores/GuildReadStateStore.tsx'],
      ['NotificationCenterStore', center, 'modules/notification_center/NotificationCenterStore.tsx'],
      ['InAppNotificationStore', banner, 'stores/native/InAppNotificationStore.tsx'],
    ]) { w.stores[name] = store; w.addModule(store, path); }
    w.addModule(policy, 'modules/notifications/NotificationTextUtils.tsx');
    w.addModule(enqueue, 'actions/native/InAppNotificationActionCreators.tsx');
    w.addModule(sound, 'modules/notifications/native/playInAppMessageSound.tsx');
    w.addModule(loader, 'modules/notification_center/useNotificationCenterItemsLoader.tsx');
  }
  if (!late) attach();
  return { items, recent, guild, read, center, banner, policy, enqueue, sound, loader, allItems, local, persisted, states, hidden, visible, dm, itemGetter, old, attach,
    counts: () => ({ queued, sounded, emits }), onlyHidden() { mentions = Object.freeze([hidden]); } };
}

test('mobile Recent Activity actually omits hidden-server pings and live OFF/ON restores them without changing cached history', async t => {
  const w = createWorld(), f = fixture(w);
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  let ui, settings;
  function RecentActivity() {
    const rows = React.useSyncExternalStore(fn => { f.items.addChangeListener(fn); return () => f.items.removeChangeListener(fn); }, () => f.items.items);
    return h(w.RN.View, null, rows.map(row => h(w.RN.Text, { key: row.id }, row.id)));
  }
  const shown = () => ui.root.findAll(n => n.type === 'Text').map(n => n.props.children);
  t.after(async () => { await Renderer.act(async () => { ui?.unmount(); settings?.unmount(); }); await w.stop(item); assert.deepEqual(w.errors, []); assert.equal(w.pathWaiters.size, 0); assert.equal(w.timers.size, 0); });
  await Renderer.act(async () => { ui = Renderer.create(h(RecentActivity)); settings = Renderer.create(h(item.options.SettingsComponent, { api: item.api })); });
  assert.deepEqual(shown(), ['two', 'three', 'friend']);
  assert.deepEqual(Array.from(f.recent.getMentions()).map(row => row.id), ['two', 'three']);
  assert.equal(f.items.getState(), f.persisted); assert.equal(f.items.getState().notifCenterItems.length, 4);
  assert.equal(f.items.localItems, f.local); assert.equal(f.loader.useNotificationCenterItemsLoader().cursor, 'native-cursor');
  assert.equal(f.loader.useNotificationCenterItemsLoader().hasMore, true); assert.equal(f.loader.useNotificationCenterItemsLoader().items.length, 3);
  const toggle = () => settings.root.findAll(n => n.type === 'Switch' && n.props.accessibilityLabel === 'Hide pings from selected servers')[0];
  assert.equal(toggle().props.value, true);
  await Renderer.act(async () => toggle().props.onValueChange(false)); assert.deepEqual(shown(), ['one', 'two', 'three', 'friend']);
  assert.equal(f.recent.getMentions().length, 3); assert.equal(item.api.jsonStorage.cache.hideServers, true);
  await Renderer.act(async () => toggle().props.onValueChange(true)); assert.deepEqual(shown(), ['two', 'three', 'friend']);
  assert.deepEqual(Array.from(item.api.jsonStorage.cache.hiddenServerIds), [GUILD]);
  assert.equal(w.calls.some(c => ['http', 'ack', 'markRead'].includes(c[0])), false);
});

test('guild/channel/thread ping badges and foreground banners exclude only the configured servers and restore on unload', async () => {
  const w = createWorld(), f = fixture(w), item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  assert.equal(f.read.getMentionCount(CHANNEL), 0); assert.equal(f.read.getMentionCount(THREAD), 0);
  assert.equal(f.read.getMentionCount(OTHER), 3); assert.equal(f.read.getMentionCount(DM), 2);
  assert.deepEqual(Array.from(f.read.getMentionChannelIds()), [OTHER, DM]);
  assert.equal(f.guild.getMentionCount(GUILD), 0); assert.equal(f.guild.getMentionCount(KEEP), 5);
  assert.equal(f.guild.getTotalMentionCount(), 5); assert.equal(f.guild.getTotalNotificationsMentionCount(), 8);
  assert.equal(f.guild.getMutableGuildStates(), f.states); assert.equal(f.recent.getMentionCountForChannel(CHANNEL), 0);
  assert.equal(f.policy.shouldNotify({ channel_id: CHANNEL }, CHANNEL), false);
  assert.equal(f.policy.shouldNotifyForReaction({ message: { channel_id: THREAD } }), false);
  assert.equal(f.policy.shouldNotify({ channel_id: DM }, DM), true);
  assert.equal(f.enqueue.enqueueNotification(f.hidden), undefined); assert.equal(f.enqueue.enqueueNotification(f.visible), 'queued');
  assert.equal(f.sound.playInAppMessageSound(f.hidden), undefined); assert.equal(f.sound.playInAppMessageSound(f.dm), 'sound');
  assert.deepEqual({ queued: f.counts().queued, sounded: f.counts().sounded }, { queued: 1, sounded: 1 });
  assert.equal(f.banner.getCurrentNotification(), null); f.onlyHidden(); assert.equal(f.center.hasNewMentions(), false);
  const event = Object.freeze({ type: 'MESSAGE_CREATE', message: Object.freeze({ id: 'new', channel_id: CHANNEL, content: 'untouched' }) });
  await w.dispatcher.dispatch(event); assert.equal(w.calls.find(c => c[0] === 'dispatch' && c[1] === event)[1], event);
  assert.equal(f.recent.hasMention('new'), false); assert.equal(event.message.content, 'untouched');
  await w.stop(item);
  assert.equal(f.items.items, f.allItems); assert.equal(Object.getOwnPropertyDescriptor(f.items, 'items'), undefined);
  assert.equal(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(f.items), 'items').get, f.itemGetter);
  assert.equal(f.read.getMentionCount, f.old.read); assert.equal(f.guild.getMentionCount, f.old.guild); assert.equal(f.guild.getTotalMentionCount, f.old.total);
  assert.equal(f.policy.shouldNotify, f.old.policy); assert.equal(f.enqueue.enqueueNotification, f.old.enqueue);
  assert.equal(f.guild.getTotalMentionCount(), 10); assert.equal(f.banner.getCurrentNotification(), f.hidden);
  assert.deepEqual(w.errors, []); assert.equal(w.pathWaiters.size, 0);
});

test('notification modules loaded after the plugin starts are filtered, and disabling/removing IDs restores original getters', async () => {
  const w = createWorld(), f = fixture(w, true);
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] }); f.attach();
  assert.equal(f.items.items.length, 3); assert.equal(f.policy.shouldNotify({ guild_id: GUILD }), false);
  // Settings are private to the adapter; restart with the persisted OFF option.
  await w.stop(item);
  const next = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD], hideServerPings: false });
  assert.equal(f.items.items, f.allItems); assert.equal(f.guild.getTotalMentionCount(), 10);
  await w.stop(next); assert.deepEqual(w.errors, []); assert.equal(w.pathWaiters.size, 0);
});

test('channel and relationship updates do not redraw the notification inbox; channel ownership still invalidates', async () => {
  const w = createWorld(), f = fixture(w);
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  assert.equal(f.read.getMentionCount(CHANNEL), 0);
  const before = f.counts().emits;
  for (let i = 0; i < 50; i++) {
    w.stores.ChannelStore.emitChange(); w.stores.RelationshipStore.emitChange();
  }
  assert.equal(f.counts().emits, before, 'unrelated store changes must not fan out to the inbox');
  w.channels[CHANNEL] = { id: CHANNEL, guild_id: KEEP }; w.stores.ChannelStore.emitChange();
  assert.equal(f.read.getMentionCount(CHANNEL), 5, 'a cached channel moving guild must not remain suppressed');
  await w.stop(item); assert.deepEqual(w.errors, []); assert.equal(w.timers.size, 0);
});

test('packaged mobile inbox reuses unchanged snapshots and follows same-length in-place updates after native change signals', async () => {
  const w = createWorld(), listeners = new Set(); let reads = 0;
  const data = Array.from({ length: 2000 }, (_, i) => ({ id: String(i), guild_id: i % 2 ? KEEP : GUILD }));
  const rows = new Proxy(data, { get(target, key) { if (typeof key === 'string' && /^\d+$/.test(key)) reads++; return Reflect.get(target, key); } });
  class Items {
    get items() { return rows; }
    emitChange() { for (const fn of listeners) fn(); }
    addChangeListener(fn) { listeners.add(fn); } removeChangeListener(fn) { listeners.delete(fn); }
  }
  const inbox = new Items(); w.stores.NotificationCenterItemsStore = inbox;
  const recent = { getMentions: () => rows, hasMention: () => true,
    addChangeListener: fn => listeners.add(fn), removeChangeListener: fn => listeners.delete(fn), emitChange() { for (const fn of listeners) fn(); } };
  w.stores.RecentMentionsStore = recent;
  const item = await w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  assert.equal(inbox.items.length, 1000); assert.equal(recent.hasMention('0'), false);
  const firstReads = reads;
  for (let i = 0; i < 500; i++) { assert.equal(inbox.items.length, 1000); assert.equal(recent.hasMention('0'), false); }
  assert.equal(reads, firstReads, '500 repeated native reads do not walk the 2,000-row inbox again');
  data[0].guild_id = KEEP; inbox.emitChange();
  assert.equal(inbox.items.length, 1001); assert.equal(recent.hasMention('0'), true);
  await w.stop(item); assert.equal(listeners.size, 0); assert.equal(inbox.items, rows); assert.deepEqual(w.errors, []);
});
