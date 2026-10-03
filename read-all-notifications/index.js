(() => {
/*! ReadAllNotificationsButton for Revenge 1.2.0
 * Vencord original by kemo, Vendicated and contributors.
 * Mobile adaptation Copyright (c) 2026 Fluttershy2008-mlp.
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Source: https://github.com/Fluttershy2008-mlp/lol/tree/main/read-all-notifications
 */
'use strict';
/*
 * Adapted from Vencord ReadAllNotificationsButton by kemo.
 * Copyright (c) 2022 Vendicated and contributors.
 * Mobile adaptation Copyright (c) 2026 Fluttershy2008-mlp.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const snowflake = value => typeof value === 'string' && /^[1-9]\d*$/.test(value);
const threadTypes = new Set([10, 11, 12]);
const forumTypes = new Set([15, 16]);
const messageTypes = new Set([0, 2, 5, 10, 11, 12, 13, 15, 16]);
const attempt = getter => { try { return getter(); } catch { return undefined; } };

function values(value) {
  if (value instanceof Map) return Array.from(value.values());
  return value && typeof value === 'object' ? Object.values(value) : [];
}

// Snowflakes exceed Number's precision on real accounts. Compare decimal strings.
function latestId(...ids) {
  return ids.filter(snowflake).reduce((latest, id) => !latest || id.length > latest.length
    || id.length === latest.length && id > latest ? id : latest, undefined);
}

// A snapshot: never invent a message ID or advance beyond a known message/post.
function collectUnread(stores) {
  const { GuildStore, GuildChannelStore, ChannelStore, ReadStateStore,
    ActiveJoinedThreadsStore, ActiveThreadsStore } = stores;
  if (typeof GuildStore?.getGuilds !== 'function' || typeof ReadStateStore?.hasUnread !== 'function'
    || typeof ReadStateStore?.lastMessageId !== 'function') {
    throw new Error('Discord read states are not ready. Reopen a chat and try again.');
  }
  const guilds = GuildStore.getGuilds();
  if (!guilds || typeof guilds !== 'object') throw new Error('Discord servers are still loading.');
  const candidates = new Map(), forumPosts = new Map(), warnings = new Set(), skipped = new Set();
  const available = new Set();
  let availableGuilds = 0;

  function add(raw, guildId) {
    let channel = raw?.channel ?? raw;
    if (typeof channel === 'string') {
      const id = channel;
      channel = attempt(() => ChannelStore?.getChannel?.(id));
      if (!channel) { skipped.add(id); return; }
    }
    if (!channel || typeof channel !== 'object' || !snowflake(channel.id)) return;
    const id = channel.id;
    // Keep guild/private indexes separate, even if an index contains bad entries.
    const owner = channel.guild_id ?? channel.guildId;
    const type = channel.type == null ? null : Number(channel.type);
    if (guildId == null) {
      if (owner != null || type !== 1 && type !== 3) return;
    } else {
      if (owner != null && owner !== guildId) return;
      if (type != null && !messageTypes.has(type)) return;
    }
    const previous = candidates.get(id);
    candidates.set(id, { channel: { id, type: type ?? previous?.channel.type,
      parent_id: channel.parent_id ?? channel.parentId ?? previous?.channel.parent_id }, guildId,
      lastId: latestId(previous?.lastId, channel.lastMessageId, channel.last_message_id) });
    skipped.delete(id);
    if (threadTypes.has(type)) {
      const parentId = channel.parent_id ?? channel.parentId;
      if (snowflake(parentId)) {
        // A forum parent's last_message_id is a *thread ID*, not a reply ID.
        const key = `${guildId}:${parentId}`;
        forumPosts.set(key, latestId(forumPosts.get(key), id));
      }
    }
  }

  function walk(value, guildId, seen = new Set(), depth = 0) {
    if (snowflake(value)) { add(value, guildId); return; }
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 6) return;
    seen.add(value);
    if (value.channel || snowflake(value.id)) { add(value, guildId); return; }
    for (const child of values(value)) walk(child, guildId, seen, depth + 1);
  }

  function readIndex(store, getter, guildId) {
    try {
      if (typeof store?.[getter] !== 'function') return false;
      const index = store[getter](guildId);
      if (!index || typeof index !== 'object') return false;
      walk(index, guildId);
      return true;
    } catch { return false; }
  }

  for (const [key, guild] of guilds instanceof Map ? guilds.entries() : Object.entries(guilds)) {
    const guildId = guild?.id ?? key;
    if (!snowflake(guildId)) continue;
    if (guild?.unavailable || guild?.isMember === false) {
      warnings.add('Some servers are unavailable and were skipped.');
      continue;
    }
    available.add(guildId);
    let listed = false;
    try {
      const index = GuildChannelStore?.getChannels?.(guildId);
      if (index && (index.SELECTABLE != null || index.VOCAL != null)) {
        for (const group of [index.SELECTABLE, index.VOCAL]) walk(group, guildId);
        listed = true;
      }
    } catch {}
    // Merge the full cached index even when SELECTABLE exists: forums and
    // collapsed/muted channels may be absent from the visible channel list.
    if (readIndex(ChannelStore, 'getMutableGuildChannelsForGuild', guildId)) listed = true;
    if (listed) availableGuilds++;
    else warnings.add('Some server channel lists could not be loaded.');

    const joined = readIndex(ActiveJoinedThreadsStore, 'getActiveJoinedThreadsForGuild', guildId);
    const unjoined = readIndex(ActiveJoinedThreadsStore, 'getActiveUnjoinedThreadsForGuild', guildId);
    const active = readIndex(ActiveThreadsStore, 'getThreadsForGuild', guildId);
    const cached = readIndex(ChannelStore, 'getAllThreadsForGuild', guildId);
    if (!joined && !unjoined && !active && !cached) {
      warnings.add('Thread tracking is unavailable on this Discord version; some posts may be skipped.');
    } else if (!unjoined && !active && !cached) {
      warnings.add('Only joined-thread tracking is available; some unfollowed forum posts may be skipped.');
    }
  }

  // Include cached archived/hidden threads with a read state, even when absent
  // from active-thread indexes. Resolve actual channels; never trust state IDs
  // as channel records or include departed/unavailable guilds.
  if (typeof ReadStateStore.getAllReadStates === 'function') {
    const states = attempt(() => ReadStateStore.getAllReadStates(true));
    if (states && typeof states === 'object') {
      for (const state of values(states)) {
        if (state?.type != null && Number(state.type) !== 0) continue;
        const id = state?.channelId;
        if (!snowflake(id)) continue;
        const channel = attempt(() => ChannelStore?.getChannel?.(id));
        if (!channel) continue;
        const guildId = channel.guild_id ?? channel.guildId ?? null;
        if (guildId == null || available.has(guildId)) add(channel, guildId);
      }
    }
  }

  // Resolve forum parents reached only through a thread index.
  for (const { channel, guildId } of Array.from(candidates.values())) {
    if (!threadTypes.has(Number(channel.type))) continue;
    const parentId = channel.parent_id ?? channel.parentId;
    if (!snowflake(parentId) || candidates.has(parentId)) continue;
    const parent = attempt(() => ChannelStore?.getChannel?.(parentId));
    if (parent && forumTypes.has(Number(parent.type))) add(parent, guildId);
  }

  let privateListed = false;
  for (const getter of ['getMutablePrivateChannels', 'getSortedPrivateChannels', 'getPrivateChannels']) {
    if (readIndex(ChannelStore, getter, null)) privateListed = true;
  }
  if (!privateListed) warnings.add('DM and group DM lists could not be loaded; they were skipped.');
  if (!availableGuilds && !privateListed && available.size) {
    throw new Error('Discord server channels are not ready. Reopen a server and try again.');
  }

  const channels = [];
  for (const [id, { channel, guildId, lastId }] of candidates) {
    const type = Number(channel.type), forum = forumTypes.has(type), thread = threadTypes.has(type);
    const parentId = channel.parent_id ?? channel.parentId;
    const messageId = latestId(attempt(() => ReadStateStore.lastMessageId(id)), lastId,
      forum ? forumPosts.get(`${guildId}:${id}`) : undefined);
    const unread = attempt(() => ReadStateStore.hasUnread(id));
    const mentions = attempt(() => ReadStateStore.getMentionCount?.(id)) > 0;
    const postUnread = thread && (attempt(() => ReadStateStore.isForumPostUnread?.(id)) === true
      || snowflake(parentId) && attempt(() => ReadStateStore.isNewForumThread?.(id, parentId, guildId)) === true);
    // Forum "new posts" can be highlighted even when hasUnread(parent) is false.
    // Ack the last known post, also covering posts outside the rendered page.
    const ackId = forum ? attempt(() => ReadStateStore.ackMessageId?.(id)) : undefined;
    const newPosts = forum && snowflake(messageId) && (!snowflake(ackId)
      || messageId !== ackId && latestId(messageId, ackId) === messageId);
    const newPostCount = forum && attempt(() => ActiveJoinedThreadsStore?.getNewThreadCount?.(guildId, id)) > 0;
    if (!unread && !mentions && !postUnread && !newPosts && !newPostCount) {
      if (unread === undefined) skipped.add(id);
      continue;
    }
    if (!snowflake(messageId)) { skipped.add(id); continue; }
    // Do not move an existing read marker backwards if channel metadata lags.
    channels.push({ channelId: id, messageId: latestId(messageId, ackId), readStateType: 0 });
  }
  if (skipped.size) warnings.add(`${skipped.size} channel${skipped.size === 1 ? '' : 's'} could not be checked and were skipped.`);
  return { channels, warnings: Array.from(warnings) };
}

function bulkReadEvent(channels) {
  // This is the same native action and payload as the supplied Vencord plugin.
  return { type: 'BULK_ACK', context: 'APP', channels };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */

function createUI({ React, RN, getState, subscribe, updateOptions, requestReadAll, refresh, getTheme }) {
  const h = React.createElement;
  const Pressable = RN.Pressable ?? RN.TouchableOpacity;
  function useState() {
    const [, redraw] = React.useState(0);
    React.useEffect(() => subscribe(() => redraw(value => value + 1)), []);
    return getState();
  }

  function ReadAllOverlay() {
    const state = useState();
    const [keyboard, setKeyboard] = React.useState(false);
    React.useEffect(() => {
      const show = RN.Keyboard?.addListener?.('keyboardDidShow', () => setKeyboard(true));
      const hide = RN.Keyboard?.addListener?.('keyboardDidHide', () => setKeyboard(false));
      return () => { show?.remove?.(); hide?.remove?.(); };
    }, []);
    if (!state.active || !state.options.showButton || keyboard) return null;
    return h(RN.View, {
      pointerEvents: 'box-none',
      style: { position: 'absolute', [state.options.side]: 12, bottom: 145, zIndex: 9999 },
    }, h(Pressable, {
      accessibilityRole: 'button', accessibilityLabel: 'Mark all server and DM notifications as read',
      accessibilityState: { disabled: state.busy, busy: state.busy },
      onPress: requestReadAll, disabled: state.busy,
      style: { minHeight: 44, minWidth: 92, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 22,
        backgroundColor: '#4752c4', opacity: state.busy ? 0.6 : 1, elevation: 6,
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
    }, h(RN.Text, { style: { color: '#fff', fontSize: 14, lineHeight: 22, fontWeight: '700', textAlign: 'center' } },
      state.busy ? 'Reading…' : '✓ Read All')));
  }

  function Settings() {
    const state = useState();
    const scheme = typeof RN.useColorScheme === 'function' ? RN.useColorScheme() : 'dark';
    const dark = (getTheme() ?? scheme) !== 'light';
    const colors = dark
      ? { bg: '#18191c', card: '#27292e', text: '#f3f4f6', muted: '#b6bcc7', border: '#4e535c' }
      : { bg: '#f2f3f5', card: '#fff', text: '#202227', muted: '#5b626f', border: '#c3c7cf' };
    const text = (value, style = {}) => h(RN.Text, { style: { color: colors.text, fontSize: 15, lineHeight: 22, ...style } }, value);
    const button = (label, onPress, primary = false) => h(Pressable, {
      accessibilityRole: 'button', onPress, disabled: state.busy || !state.active,
      accessibilityState: { disabled: state.busy || !state.active },
      style: { padding: 14, marginTop: 12, borderRadius: 10, backgroundColor: primary ? '#4752c4' : colors.card,
        borderColor: colors.border, borderWidth: primary ? 0 : 1, opacity: state.busy ? 0.6 : 1 },
    }, text(label, { color: primary ? '#fff' : colors.text, textAlign: 'center', fontWeight: '700' }));
    const toggle = (key, title, detail) => h(RN.View, { key,
      style: { flexDirection: 'row', alignItems: 'center', marginTop: 12, padding: 14, backgroundColor: colors.card, borderRadius: 10 },
    }, h(RN.View, { style: { flex: 1, marginRight: 12 } }, text(title, { fontWeight: '600' }), text(detail, { color: colors.muted, fontSize: 13 })),
    h(RN.Switch, { value: state.options[key], accessibilityLabel: title, onValueChange: value => updateOptions({ [key]: value }) }));
    return h(RN.ScrollView, { style: { flex: 1, backgroundColor: colors.bg }, contentContainerStyle: { padding: 16, paddingBottom: 60 } },
      text('Read All Notifications', { fontSize: 24, lineHeight: 30, fontWeight: '700' }),
      text('Mark unread server channels, forums, media channels, posts, threads, DMs and group DMs as read in one tap.', { color: colors.muted, marginTop: 8 }),
      text('Includes unfollowed forum posts and cached archived threads. Posts Discord has not loaded cannot be checked individually.',
        { color: colors.muted, marginTop: 8, fontSize: 13 }),
      text('This does not delete messages, mention history or Android notifications.',
        { color: colors.muted, marginTop: 8, fontSize: 13 }),
      button(state.busy ? 'Reading…' : '✓ Read all notifications', requestReadAll, true),
      button('Check unread channels', refresh),
      text(state.message, { marginTop: 14 }),
      ...state.warnings.map((warning, index) => h(RN.Text, { key: index, style: { color: colors.muted, marginTop: 8, fontSize: 13 } }, warning)),
      toggle('showButton', 'Show floating button', 'Display Read All in the chat view. It hides while typing.'),
      toggle('confirm', 'Confirm before reading', 'Ask before marking your current unread servers and DMs as read.'),
      button(`Button position: ${state.options.side === 'left' ? 'Left' : 'Right'} — tap to change`,
        () => updateOptions({ side: state.options.side === 'left' ? 'right' : 'left' })),
      text(state.overlay ? 'Floating button is ready. Reopen a chat if it is not visible yet.'
        : 'The floating button is unavailable in this layout. Use the button above or /readall.', { color: colors.muted, marginTop: 18, fontSize: 13 }),
      text('Based on Vencord ReadAllNotificationsButton by kemo, Vendicated and contributors. GPL-3.0-or-later.',
        { color: colors.muted, marginTop: 22, fontSize: 12 }),
    );
  }
  return { ReadAllOverlay, Settings };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */

function createPlugin(V) {
  const { React, ReactNative: RN } = V.metro.common;
  const storage = V.plugin.storage;
  const listeners = new Set();
  const cleanup = [];
  let active = false, busy = false, generation = 0, overlay = false, pending = null;
  let message = 'Ready. Tap Read All to mark your unread channels, forums, posts, threads, DMs and group DMs as read.';
  let warnings = [];
  const log = error => { try { V.logger?.warn?.('[ReadAllNotificationsButton]', error?.message ?? String(error)); } catch {} };
  const safe = getter => { try { return getter(); } catch { return undefined; } };
  const byProps = (...keys) => safe(() => V.metro.findByProps(...keys));
  const byStore = name => safe(() => V.metro.findByStoreName(name));
  const options = () => ({ showButton: storage.showButton !== false, confirm: storage.confirm === true,
    side: storage.side === 'right' ? 'right' : 'left' });
  const changed = () => { for (const listener of listeners) { try { listener(); } catch {} } };
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const getState = () => ({ active, busy, overlay, message, warnings: [...warnings], options: options() });
  function notify(text, error = false) {
    message = text;
    changed();
    try {
      if (typeof V.ui?.toasts?.showToast === 'function') {
        const icon = safe(() => V.ui.assets.getAssetIDByName(error ? 'CircleXIcon-primary' : 'Check'));
        V.ui.toasts.showToast(text, icon);
      } else RN.Alert.alert('Read All Notifications', text);
    } catch (err) { log(err); }
  }

  function snapshot() {
    const UserStore = byStore('UserStore');
    const accountId = safe(() => UserStore.getCurrentUser()?.id);
    if (!accountId) throw new Error('Sign in to Discord and wait for your chats to load.');
    const connection = byStore('ConnectionStore');
    if (safe(() => connection.isConnected()) === false) throw new Error('Discord is offline. Reconnect and try again.');
    const ReadStateStore = byStore('ReadStateStore') ?? byProps('hasUnread', 'lastMessageId');
    const result = collectUnread({
      GuildStore: byStore('GuildStore'), GuildChannelStore: byStore('GuildChannelStore'),
      ChannelStore: byStore('ChannelStore'), ReadStateStore,
      ActiveJoinedThreadsStore: byStore('ActiveJoinedThreadsStore'),
      ActiveThreadsStore: byStore('ActiveThreadsStore'),
    });
    return { ...result, accountId, UserStore, ReadStateStore };
  }

  async function readSnapshot(data, run) {
    if (!active || generation !== run || busy) return;
    if (safe(() => data.UserStore.getCurrentUser()?.id) !== data.accountId) {
      notify('Your account changed. Tap Read All again.', true);
      return;
    }
    if (safe(() => byStore('ConnectionStore').isConnected()) === false) {
      notify('Discord is offline. Reconnect and try again.', true);
      return;
    }
    busy = true;
    changed();
    try {
      const dispatcher = safe(() => V.metro.common.FluxDispatcher)
        ?? byProps('dispatch', 'subscribe', 'unsubscribe');
      if (typeof dispatcher?.dispatch !== 'function') throw new Error('Discord notification actions are unavailable on this version.');
      // Discord owns the acknowledgement queue and network synchronization, just
      // as in Vencord. No separate REST call, token access or double ack.
      await dispatcher.dispatch(bulkReadEvent(data.channels));
      if (!active || run !== generation) return;
      notify(`Marked ${data.channels.length} channel${data.channels.length === 1 ? '' : 's'} as read.${warnings.length ? ' Some items were skipped; see plugin settings.' : ''}`);
    } catch (error) {
      log(error);
      if (active && run === generation) notify(`Could not mark notifications as read: ${error?.message ?? 'Unknown error'}`, true);
    } finally {
      if (run === generation) { busy = false; changed(); }
    }
  }

  function requestReadAll() {
    if (!active || busy || pending) return;
    try {
      const data = snapshot();
      warnings = data.warnings;
      if (!data.channels.length) {
        notify(warnings.length ? 'No unread channels could be marked. Check the notes in plugin settings.' : 'All server and DM notifications are already read.');
        return;
      }
      const run = generation;
      if (options().confirm) {
        const token = {};
        pending = token;
        const release = () => { if (pending === token) pending = null; };
        RN.Alert.alert('Read all notifications?', `Mark ${data.channels.length} channels as read? This includes server channels, forums and media channels, loaded posts and threads (including unfollowed posts), DMs and group DMs.`, [
          { text: 'Cancel', style: 'cancel', onPress: release },
          { text: 'Read All', onPress: () => {
            if (pending !== token) return;
            release();
            void readSnapshot(data, run);
          } },
        ], { cancelable: true, onDismiss: release });
      } else return readSnapshot(data, run);
    } catch (error) {
      pending = null;
      log(error);
      notify(error?.message ?? 'Unable to check unread channels.', true);
    }
  }

  function refresh() {
    if (!active || busy) return;
    try {
      const data = snapshot();
      warnings = data.warnings;
      message = `${data.channels.length} unread channel${data.channels.length === 1 ? '' : 's'} ready to mark as read, including DMs and group DMs.`;
      changed();
    } catch (error) { notify(error?.message ?? 'Unable to check unread channels.', true); }
  }

  const { Settings, ReadAllOverlay } = createUI({ React, RN, getState, subscribe, requestReadAll, refresh,
    getTheme: () => safe(() => byStore('ThemeStore').theme),
    updateOptions: value => {
      if (typeof value.showButton === 'boolean') storage.showButton = value.showButton;
      if (typeof value.confirm === 'boolean') storage.confirm = value.confirm;
      if (value.side === 'left' || value.side === 'right') storage.side = value.side;
      changed();
    },
  });

  function mountOverlay() {
    try {
      const ChatView = V.metro.findByTypeName?.('ChatView');
      // Guard all proxy property reads: missing lazy modules can throw here.
      if (typeof ChatView?.type !== 'function' || typeof V.patcher?.after !== 'function') return;
      const unpatch = V.patcher.after('type', ChatView, (_, rendered) => {
        if (!active) return rendered;
        try {
          return React.createElement(React.Fragment, null, rendered,
            React.createElement(ReadAllOverlay, { key: 'read-all-notifications-button' }));
        } catch (error) { log(error); return rendered; }
      });
      if (typeof unpatch === 'function') { cleanup.push(unpatch); overlay = true; }
    } catch (error) { log(error); }
  }

  function onLoad() {
    if (active) return;
    active = true;
    generation++;
    mountOverlay();
    try {
      const unregister = V.commands?.registerCommand?.({
        name: 'readall', displayName: 'readall',
        description: 'Mark all server and DM notifications as read', displayDescription: 'Mark all server and DM notifications as read',
        options: [], applicationId: '-1', inputType: 1, type: 1,
        execute: async () => { await requestReadAll(); return null; },
      });
      if (typeof unregister === 'function') cleanup.push(unregister);
    } catch (error) { log(error); }
    changed();
  }

  function onUnload() {
    active = false;
    generation++;
    busy = false;
    pending = null;
    overlay = false;
    changed();
    for (const dispose of cleanup.splice(0).reverse()) { try { dispose(); } catch (error) { log(error); } }
    listeners.clear();
  }
  return { onLoad, onUnload, settings: Settings };
}

return createPlugin(vendetta);
})()
