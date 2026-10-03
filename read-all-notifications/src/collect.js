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
export function collectUnread(stores) {
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

export function bulkReadEvent(channels) {
  // This is the same native action and payload as the supplied Vencord plugin.
  return { type: 'BULK_ACK', context: 'APP', channels };
}
