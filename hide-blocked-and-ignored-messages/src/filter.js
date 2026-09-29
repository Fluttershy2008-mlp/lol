/* SPDX-License-Identifier: CC0-1.0 */
// Only interaction initiators count. target_user, mentions and installation
// owners are NOT the user who ran a command.
export function interactionInfo(message) {
  const ids = new Set();
  const originals = new Set();
  const seen = new Set();
  function visit(value, depth) {
    if (!value || typeof value !== 'object' || depth > 8 || seen.has(value)) return;
    seen.add(value);
    const id = value.user?.id ?? value.user_id ?? value.userId ?? value.member?.user?.id;
    if (typeof id === 'string' && id) ids.add(id);
    const original = value.original_response_message_id ?? value.originalResponseMessageId;
    if (typeof original === 'string' && original) originals.add(original);
    visit(value.triggering_interaction_metadata, depth + 1);
    visit(value.triggeringInteractionMetadata, depth + 1);
  }
  visit(message?.interaction_metadata, 0);
  visit(message?.interactionMetadata, 0);
  visit(message?.interaction, 0);
  return { ids: [...ids], originals: [...originals] };
}

export function createMessageFilter({ storage, blockedStore, ignoredStore, getMessage }) {
  // Keep only IDs, never message contents. Some mobile MessageRecord versions
  // discard interaction metadata while converting gateway messages.
  const metadata = new Map();
  const maxMetadata = 2000;
  const messageKey = message => {
    const channel = message?.channel_id ?? message?.channelId;
    return channel && message?.id ? channel + ':' + message.id : null;
  };
  const enabled = name => storage[name] !== false;

  function isFilteredUser(id) {
    if (typeof id !== 'string' || !id) return false;
    try { if (enabled('blocked') && blockedStore?.isBlocked?.(id)) return true; } catch {}
    try { if (enabled('ignored') && ignoredStore?.isIgnored?.(id)) return true; } catch {}
    return false;
  }

  function observeMessage(message, channelId) {
    if (!message || typeof message !== 'object') return;
    const key = messageKey(message) ?? (channelId && message.id ? channelId + ':' + message.id : null);
    if (!key) return;
    if (['interaction', 'interaction_metadata', 'interactionMetadata'].some(name => name in message)) {
      metadata.delete(key);
      const info = interactionInfo(message);
      if (info.ids.length || info.originals.length) metadata.set(key, info);
      while (metadata.size > maxMetadata) metadata.delete(metadata.keys().next().value);
    }
  }

  function observe(event) {
    if (!event || typeof event !== 'object') return;
    if (event.type === 'LOGOUT' || event.type === 'CONNECTION_OPEN') { metadata.clear(); return; }
    if (event.type === 'LOAD_MESSAGES_SUCCESS' && Array.isArray(event.messages)) {
      for (const message of event.messages) observeMessage(message, event.channelId ?? event.channel_id);
    } else if (event.type === 'MESSAGE_CREATE' || event.type === 'MESSAGE_UPDATE') {
      observeMessage(event.message, event.channelId ?? event.channel_id);
    }
  }

  function lookup(channel, id) {
    if (!channel || !id) return undefined;
    try { return getMessage(channel, id); } catch { return undefined; }
  }

  function botResponseHidden(message, visited = new Set(), depth = 0) {
    if (!message || depth > 8 || visited.has(message)) return false;
    visited.add(message);
    const direct = interactionInfo(message);
    const info = direct.ids.length || direct.originals.length ? direct : metadata.get(messageKey(message));
    if (!info) return false;
    if (info.ids.some(isFilteredUser)) return true;
    // When this response has its own initiator, do not attribute it to a
    // different person who originally created the bot's message.
    if (info.ids.length) return false;
    const channel = message.channel_id ?? message.channelId;
    return info.originals.some(id => botResponseHidden(lookup(channel, id), visited, depth + 1));
  }

  function identityHidden(message) {
    return Boolean(message && (isFilteredUser(message.author?.id)
      || (enabled('removeBotCommands') && botResponseHidden(message))));
  }

  function shouldHide(message) {
    if (!message || typeof message !== 'object') return false;
    try {
      if (identityHidden(message)) return true;
      if (!enabled('removeReplies')) return false;
      const embedded = message.referenced_message ?? message.referencedMessage;
      if (identityHidden(embedded)) return true;
      const reference = message.message_reference ?? message.messageReference;
      // A forward/crosspost is not a reply. Discord reply messages have type 19;
      // older clients omit the type but still supply a DEFAULT reference.
      const referenceType = reference?.type;
      if (referenceType === 1 || referenceType === 'FORWARD') return false;
      if (message.type != null && message.type !== 19 && message.type !== 'REPLY') return false;
      const channel = reference?.channel_id ?? reference?.channelId ?? message.channel_id ?? message.channelId;
      const id = reference?.message_id ?? reference?.messageId;
      return identityHidden(lookup(channel, id));
    } catch { return false; }
  }

  return { shouldHide, observe, clear: () => metadata.clear() };
}
