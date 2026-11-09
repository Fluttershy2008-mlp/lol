/* SPDX-License-Identifier: CC0-1.0 */
import { isDiscordUserId, normalizeWhitelist } from './whitelist.js';
// Server snowflakes use the same string format as user IDs. Do not accept user mentions.
export const normalizeServerIds = normalizeWhitelist;
export function parseServerIds(value) {
  const tokens = String(value ?? '').trim().split(/[\s,;]+/).filter(Boolean);
  return { ids: [...new Set(tokens.filter(isDiscordUserId))], invalid: tokens.filter(id => !isDiscordUserId(id)) };
}
export function createServerFilter(storage, getChannel = () => undefined) {
  function guildForChannel(id) {
    const seen = new Set();
    while (typeof id === 'string' && id && !seen.has(id) && seen.size < 8) {
      seen.add(id);
      let channel;
      try { channel = getChannel(id); } catch { return undefined; }
      if (!channel) return undefined;
      const guild = channel.guild_id ?? channel.guildId;
      if (typeof guild === 'string' && guild) return guild;
      id = channel.parent_id ?? channel.parentId;
    }
  }
  function selectedGuild(id) {
    return isDiscordUserId(id)
      && Array.isArray(storage.hiddenServerIds) && storage.hiddenServerIds.includes(id);
  }
  function hiddenGuild(id) { return storage.hideServers !== false && selectedGuild(id); }
  function isChannelHidden(id) { return hiddenGuild(guildForChannel(id)); }
  function isServerMessageHidden(message) {
    if (!message || storage.hideServers === false || !storage.hiddenServerIds?.length) return false;
    // Never use the selected server or a reply's server: DMs and crossposts must
    // be classified by the message's own channel, not somebody else's location.
    const guild = message.guild_id ?? message.guildId;
    return hiddenGuild(typeof guild === 'string' && guild ? guild
      : guildForChannel(message.channel_id ?? message.channelId));
  }
  return { isChannelHidden, isServerMessageHidden,
    isGuildIconHidden: id => storage.hideServerIcons !== false && selectedGuild(id),
    isGuildChannelListHidden: id => storage.hideServerChannels !== false && hiddenGuild(id) };
}
