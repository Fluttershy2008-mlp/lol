/*
 * Adapted from Vencord ReadAllNotificationsButton by kemo.
 * Copyright (c) 2022 Vendicated and contributors.
 * Mobile adaptation Copyright (c) 2026 Fluttershy2008-mlp.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const snowflake = value => typeof value === 'string' && /^[1-9]\d*$/.test(value);
const threadTypes = new Set([10, 11, 12]);
const messageTypes = new Set([0, 2, 5, 10, 11, 12, 13]);

function values(value) {
  if (value instanceof Map) return Array.from(value.values());
  return value && typeof value === 'object' ? Object.values(value) : [];
}

// A snapshot: never invent a message ID or advance beyond the last known message.
export function collectUnread(stores) {
  const { GuildStore, GuildChannelStore, ChannelStore, ReadStateStore, ActiveJoinedThreadsStore } = stores;
  if (typeof GuildStore?.getGuilds !== 'function' || typeof ReadStateStore?.hasUnread !== 'function'
    || typeof ReadStateStore?.lastMessageId !== 'function') {
    throw new Error('Discord read states are not ready. Reopen a server and try again.');
  }
  const guilds = GuildStore.getGuilds();
  if (!guilds || typeof guilds !== 'object') throw new Error('Discord servers are still loading.');
  const channels = new Map();
  const warnings = new Set();
  let skipped = 0, availableGuilds = 0;

  function add(raw, guildId, joined = false) {
    let channel = raw?.channel ?? raw;
    if (typeof channel === 'string') channel = ChannelStore?.getChannel?.(channel);
    if (!channel || typeof channel !== 'object' || !snowflake(channel.id)) return;
    const id = channel.id;
    // Even a malformed guild index must never clear DMs or another server.
    const owner = channel.guild_id ?? channel.guildId;
    if (owner != null && owner !== guildId) return;
    const type = channel.type == null ? null : Number(channel.type);
    if (type != null && (!messageTypes.has(type) || threadTypes.has(type) && !joined)) return;
    if (channels.has(id)) return;
    try {
      const unread = ReadStateStore.hasUnread(id);
      const mentions = typeof ReadStateStore.getMentionCount === 'function' ? ReadStateStore.getMentionCount(id) : 0;
      if (!unread && !(mentions > 0)) return;
      const messageId = ReadStateStore.lastMessageId(id);
      if (!snowflake(messageId)) { skipped++; return; }
      channels.set(id, { channelId: id, messageId, readStateType: 0 });
    } catch { skipped++; }
  }

  function joinedThreads(value, guildId, seen = new Set(), depth = 0) {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 5) return;
    seen.add(value);
    if (value.channel || snowflake(value.id)) { add(value, guildId, true); return; }
    for (const child of values(value)) joinedThreads(child, guildId, seen, depth + 1);
  }

  for (const [key, guild] of guilds instanceof Map ? guilds.entries() : Object.entries(guilds)) {
    const guildId = guild?.id ?? key;
    if (!snowflake(guildId)) continue;
    if (guild?.unavailable || guild?.isMember === false) {
      warnings.add('Some servers are unavailable and were skipped.');
      continue;
    }
    let listed = false;
    try {
      const index = GuildChannelStore?.getChannels?.(guildId);
      if (index && (index.SELECTABLE != null || index.VOCAL != null)) {
        for (const group of [index.SELECTABLE, index.VOCAL]) for (const item of values(group)) add(item, guildId);
        listed = true;
      }
    } catch {}
    // Older/newer mobile builds may expose only the channel store's guild index.
    if (!listed) {
      try {
        const index = ChannelStore?.getMutableGuildChannelsForGuild?.(guildId);
        if (index && typeof index === 'object') {
          for (const item of values(index)) add(item, guildId);
          listed = true;
        }
      } catch {}
    }
    if (listed) availableGuilds++;
    else warnings.add('Some server channel lists could not be loaded.');
    try {
      if (typeof ActiveJoinedThreadsStore?.getActiveJoinedThreadsForGuild === 'function') {
        joinedThreads(ActiveJoinedThreadsStore.getActiveJoinedThreadsForGuild(guildId), guildId);
      } else {
        warnings.add('Joined-thread tracking is unavailable on this Discord version.');
      }
    } catch { warnings.add('Some joined threads could not be loaded.'); }
  }
  if (!availableGuilds && values(guilds).some(guild => !guild?.unavailable && guild?.isMember !== false)) {
    throw new Error('Discord server channels are not ready. Reopen a server and try again.');
  }
  if (skipped) warnings.add(`${skipped} unread channel${skipped === 1 ? '' : 's'} could not be checked and were skipped.`);
  return { channels: Array.from(channels.values()), warnings: Array.from(warnings) };
}

export function bulkReadEvent(channels) {
  // This is the same native action and payload as the supplied Vencord plugin.
  return { type: 'BULK_ACK', context: 'APP', channels };
}
