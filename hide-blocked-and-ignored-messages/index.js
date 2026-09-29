(() => {
/*! HideBlockedAndIgnoredMessages 1.1.0, CC0-1.0.
 * Adapted from shipwr3ckd/revengeplugin; original authors Zykrah and シグマ siguma.
 * https://github.com/Fluttershy2008-mlp/lol/tree/main/hide-blocked-and-ignored-messages
 */
'use strict';
/* SPDX-License-Identifier: CC0-1.0 */
// Only interaction initiators count. target_user, mentions and installation
// owners are NOT the user who ran a command.
function interactionInfo(message) {
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

function createMessageFilter({ storage, blockedStore, ignoredStore, getMessage }) {
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

/* SPDX-License-Identifier: CC0-1.0 */
const sameItems = (a, b) => a.length === b.length && a.every((item, i) => item === b[i]);

// Project the list BEFORE Discord groups blocked messages or generates native
// rows. Leave MessageStore.getMessage and the real channel cache untouched.
// Pagination/loading flags and the ChannelMessages prototype are preserved.
function createCollectionFilter(shouldHide, reportUnsupported = () => {}) {
  let cache = new WeakMap();

  function project(collection) {
    if (!collection || typeof collection !== 'object') return collection;
    const raw = Array.isArray(collection) ? collection : collection._array;
    if (!Array.isArray(raw)) {
      reportUnsupported();
      return collection;
    }
    const visible = raw.filter(message => !shouldHide(message));
    if (visible.length === raw.length) return collection;
    if (Array.isArray(collection)) {
      const previous = cache.get(collection);
      if (previous && sameItems(previous.visible, visible)) return previous.view;
      cache.set(collection, { visible, view: visible });
      return visible;
    }

    const descriptors = Object.getOwnPropertyDescriptors(collection);
    const keys = Reflect.ownKeys(descriptors);
    const previous = cache.get(collection);
    // Discord usually replaces a ChannelMessages instance on changes, but some
    // builds mutate it. Compare visible rows and descriptor values on each read.
    if (previous && sameItems(previous.visible, visible)
      && keys.length === previous.keys.length
      && keys.every(key => {
        const a = descriptors[key], b = previous.descriptors[key];
        return b && a.value === b.value && a.get === b.get && a.set === b.set;
      })) return previous.view;

    const projected = { ...descriptors };
    projected._array = { value: visible, writable: true, enumerable: true, configurable: true };
    // Keep indexed lookups consistent with the displayed collection. Native
    // MessageStore.getMessage still uses the complete original map for replies.
    if (collection._map instanceof Map) {
      const visibleIds = new Set(visible.map(message => message?.id));
      projected._map = { value: new Map([...collection._map].filter(([id]) => visibleIds.has(id))),
        writable: true, enumerable: true, configurable: true };
    } else if (collection._map && typeof collection._map === 'object') {
      const map = Object.create(Object.getPrototypeOf(collection._map));
      for (const message of visible) {
        if (message?.id && Object.prototype.hasOwnProperty.call(collection._map, message.id)) {
          Object.defineProperty(map, message.id, { value: collection._map[message.id],
            writable: true, enumerable: true, configurable: true });
        }
      }
      projected._map = { value: map, writable: true, enumerable: true, configurable: true };
    }
    const view = Object.create(Object.getPrototypeOf(collection), projected);
    cache.set(collection, { visible, view, descriptors, keys });
    return view;
  }
  return { project, clear: () => { cache = new WeakMap(); } };
}

/* SPDX-License-Identifier: CC0-1.0 */
function createSettings(V, refresh) {
  return function HideBlockedSettings() {
    const { React, ReactNative: RN } = V.metro.common;
    const storage = V.plugin.storage;
    const [, redraw] = React.useState(0);
    const dark = (RN.useColorScheme?.() ?? 'dark') !== 'light';
    const text = dark ? '#f2f3f5' : '#202225';
    const muted = dark ? '#b9bec9' : '#505663';
    const rows = [
      ['blocked', 'Hide blocked users', 'Remove their messages from chat.'],
      ['ignored', 'Hide ignored users', 'Remove their messages from chat.'],
      ['removeReplies', 'Hide replies to them', 'Also hide messages replying to a blocked or ignored user.'],
      ['removeBotCommands', 'Hide their bot commands', 'Hide bot responses to slash commands and interactions they trigger.'],
    ];
    const h = React.createElement;
    return h(RN.ScrollView, { style: { flex: 1, backgroundColor: dark ? '#18191c' : '#f2f3f5' },
      contentContainerStyle: { padding: 18, paddingBottom: 40 } },
    h(RN.Text, { style: { color: text, fontSize: 22, fontWeight: '700', marginBottom: 10 } }, 'Hide blocked and ignored messages'),
    ...rows.map(([key, label, note]) => h(RN.View, { key, style: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: dark ? '#34363c' : '#d5d8df' } },
    h(RN.View, { style: { flex: 1, paddingRight: 14 } },
      h(RN.Text, { style: { color: text, fontSize: 16, fontWeight: '600' } }, label),
      h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 4 } }, note)),
    h(RN.Switch, { value: storage[key] !== false, accessibilityLabel: label,
      onValueChange(value) { storage[key] = value; redraw(n => n + 1); refresh(); } }))),
    h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 20, marginTop: 18 } },
      'Hidden messages leave no replacement text. If an open chat does not refresh, switch channels and return.'),
    h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 20, marginTop: 10 } },
      'Bot filtering needs Discord to identify who triggered the response. Ordinary bot posts without that information stay visible.'),
    h(RN.Text, { style: { color: muted, fontSize: 12, marginTop: 18 } }, 'Version 1.1.0'));
  };
}

/* SPDX-License-Identifier: CC0-1.0 */

function createPlugin(V) {
  let active = false;
  let filter, lists, messageStore, refreshTimer;
  let warned = false;
  const cleanup = [];
  const byProps = (...props) => { try { return V.metro.findByProps(...props); } catch {} };
  const byStore = name => { try { return V.metro.findByStoreName?.(name); } catch {} };
  const method = (object, name) => { try { return typeof object?.[name] === 'function'; } catch { return false; } };

  function refresh() {
    lists?.clear();
    if (!active || refreshTimer !== undefined) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      if (!active) return;
      try { messageStore?.emitChange?.(); } catch {}
    }, 0);
  }

  function onLoad() {
    if (active) return;
    const storage = V.plugin.storage;
    for (const key of ['blocked', 'ignored', 'removeReplies', 'removeBotCommands']) {
      if (typeof storage[key] !== 'boolean') storage[key] = true;
    }
    messageStore = byStore('MessageStore');
    if (!method(messageStore, 'getMessages') || !method(messageStore, 'getMessage')) {
      messageStore = byProps('getMessages', 'getMessage');
    }
    const relationshipStore = byStore('RelationshipStore');
    const blockedStore = method(relationshipStore, 'isBlocked') ? relationshipStore : byProps('isBlocked');
    const ignoredStore = method(relationshipStore, 'isIgnored') ? relationshipStore : byProps('isIgnored');
    if (!method(messageStore, 'getMessages') || !method(messageStore, 'getMessage')
      || (!method(blockedStore, 'isBlocked') && !method(ignoredStore, 'isIgnored'))) {
      throw new Error('HideBlockedAndIgnoredMessages: message or relationship modules are unavailable on this Discord build.');
    }
    filter = createMessageFilter({ storage, blockedStore, ignoredStore,
      getMessage: (channel, id) => messageStore.getMessage(channel, id) });
    warned = false;
    lists = createCollectionFilter(filter.shouldHide, () => {
      if (warned) return;
      warned = true;
      try { V.logger?.warn?.('HideBlockedAndIgnoredMessages: unsupported message-list format; please report your Discord version.'); } catch {}
    });
    active = true;
    try {
      cleanup.push(V.patcher.after('getMessages', messageStore, (_args, result) => {
        if (!active) return;
        try { return lists.project(result); } catch {
          // Preserve Discord's return value on unsupported collection shapes.
          return result;
        }
      }));
      const dispatcher = V.metro.common.FluxDispatcher;
      if (method(dispatcher, 'dispatch')) {
        // Observe IDs before native normalization. Never drop, rewrite, redirect
        // or synthesize gateway events; pagination receives the full history.
        cleanup.push(V.patcher.before('dispatch', dispatcher, ([event]) => {
          if (active) { try { filter.observe(event); } catch {} }
        }));
      }
      for (const store of new Set([blockedStore, ignoredStore])) {
        if (method(store, 'addChangeListener') && method(store, 'removeChangeListener')) {
          store.addChangeListener(refresh);
          cleanup.push(() => store.removeChangeListener(refresh));
        }
      }
      refresh();
    } catch (error) { onUnload(); throw error; }
  }

  function onUnload() {
    const wasActive = active;
    active = false;
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    refreshTimer = undefined;
    for (const remove of cleanup.splice(0).reverse()) { try { remove(); } catch {} }
    filter?.clear(); lists?.clear();
    filter = lists = undefined;
    if (wasActive) { try { messageStore?.emitChange?.(); } catch {} }
    messageStore = undefined;
  }
  return { onLoad, onUnload, settings: createSettings(V, refresh) };
}

return createPlugin(vendetta);
})()
