/* SPDX-License-Identifier: CC0-1.0 */
import { isDiscordUserId, normalizeWhitelist } from './whitelist.js';
// Server snowflakes use the same string format as user IDs. Do not accept user mentions.
export const normalizeServerIds = normalizeWhitelist;
export function parseServerIds(value) {
  const tokens = String(value ?? '').trim().split(/[\s,;]+/).filter(Boolean);
  return { ids: [...new Set(tokens.filter(isDiscordUserId))], invalid: tokens.filter(id => !isDiscordUserId(id)) };
}
export function createServerFilter(storage, getChannel = () => undefined) {
  let source, sourceLength = -1, ids = [], selected = new Set();
  let channels = new Map(), channelRevision = 0, revision, revisionIds, revisionEnabled, revisionChannels;
  function selectedIds() {
    const next = storage.hiddenServerIds;
    if (source !== next || sourceLength !== next?.length) {
      source = next; sourceLength = next?.length;
      ids = normalizeServerIds(next); selected = new Set(ids);
    }
    return ids;
  }
  function clearChannels() { channels = new Map(); channelRevision++; }
  function pingRevision() {
    const current = selectedIds(), enabled = storage.hideServerPings !== false;
    if (!revision || revisionIds !== current || revisionEnabled !== enabled || revisionChannels !== channelRevision) {
      revisionIds = current; revisionEnabled = enabled; revisionChannels = channelRevision; revision = {};
    }
    return revision;
  }
  function guildForChannel(id) {
    if (channels.has(id)) return channels.get(id);
    const start = id;
    const seen = new Set();
    while (typeof id === 'string' && id && !seen.has(id) && seen.size < 8) {
      seen.add(id);
      let channel;
      try { channel = getChannel(id); } catch { return undefined; }
      if (!channel) return undefined;
      let guild;
      try { guild = channel.guild_id ?? channel.guildId ?? (typeof channel.getGuildId === 'function' ? channel.getGuildId() : undefined); }
      catch { return undefined; }
      if (typeof guild === 'string' && guild) {
        if (channels.size >= 4096) channels.delete(channels.keys().next().value);
        channels.set(start, guild); return guild;
      }
      id = channel.parent_id ?? channel.parentId;
      if (!id) {
        if (channels.size >= 4096) channels.delete(channels.keys().next().value);
        channels.set(start, undefined); return undefined;
      }
    }
  }
  function selectedGuild(id) {
    selectedIds(); return selected.has(id);
  }
  function hiddenGuild(id) { return storage.hideServers !== false && selectedGuild(id); }
  function isChannelHidden(id) { return storage.hideServers !== false && selectedIds().length > 0 && selectedGuild(guildForChannel(id)); }
  function isServerMessageHidden(message) {
    if (!message || storage.hideServers === false || !storage.hiddenServerIds?.length) return false;
    // Never use the selected server or a reply's server: DMs and crossposts must
    // be classified by the message's own channel, not somebody else's location.
    const guild = message.guild_id ?? message.guildId;
    return hiddenGuild(typeof guild === 'string' && guild ? guild
      : guildForChannel(message.channel_id ?? message.channelId));
  }
  return { isChannelHidden, isServerMessageHidden, clearChannels, pingRevision,
    pingsEnabled: () => storage.hideServerPings !== false && selectedIds().length > 0,
    iconsEnabled: () => storage.hideServerIcons !== false && selectedIds().length > 0,
    isGuildPingHidden: id => storage.hideServerPings !== false && selectedGuild(id),
    isChannelPingHidden: id => storage.hideServerPings !== false && selectedIds().length > 0 && selectedGuild(guildForChannel(id)),
    pingGuildIds: () => storage.hideServerPings === false ? [] : selectedIds(),
    isGuildIconHidden: id => storage.hideServerIcons !== false && selectedGuild(id),
    isGuildChannelListHidden: id => storage.hideServerChannels !== false && hiddenGuild(id) };
}
