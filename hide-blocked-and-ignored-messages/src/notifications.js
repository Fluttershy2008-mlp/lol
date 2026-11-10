/* SPDX-License-Identifier: CC0-1.0 */
export function createPingProjection(servers) {
  let arrays = new WeakMap(), entries = new WeakMap(), revision;
  function clear() { arrays = new WeakMap(); entries = new WeakMap(); }
  function enabled() {
    const next = servers.pingRevision?.();
    if (revision !== next) { revision = next; clear(); }
    return servers.pingsEnabled?.() !== false;
  }
  function hidden(entry) {
    if (!enabled() || !entry || typeof entry !== 'object') return false;
    if (entries.has(entry)) return entries.get(entry);
    const result = classify(entry, new Set(), 0);
    entries.set(entry, result); return result;
  }
  function classify(entry, seen, depth) {
    if (!entry || typeof entry !== 'object' || depth > 6 || seen.has(entry)) return false;
    seen.add(entry);
    // A notification's own message/channel determines its server. Never follow
    // referenced messages, mentions, usernames or quoted/forwarded content.
    let message;
    try { message = entry.message; } catch { return false; }
    const own = message && typeof message === 'object' ? message : entry;
    let channelId, guildId;
    try {
      channelId = own.channel_id ?? own.channelId ?? own.message_channel_id ?? own.messageChannelId ?? own.channel?.id ?? own.getChannelId?.();
      guildId = own.guild_id ?? own.guildId ?? own.guild?.id ?? own.getGuildId?.();
      if (typeof guildId === 'string' && guildId) return servers.isGuildPingHidden(guildId);
      if (typeof channelId === 'string' && channelId) return servers.isChannelPingHidden(channelId);
      if (own !== entry) {
        channelId = entry.message_channel_id ?? entry.messageChannelId ?? entry.channel_id ?? entry.channelId ?? entry.channel?.id;
        guildId = entry.guild_id ?? entry.guildId ?? entry.guild?.id;
        if (typeof guildId === 'string' && guildId) return servers.isGuildPingHidden(guildId);
        if (typeof channelId === 'string' && channelId) return servers.isChannelPingHidden(channelId);
      }
      const link = entry.deeplink ?? entry.deep_link;
      if (typeof link === 'string') {
        const match = /^(?:https?:\/\/(?:(?:canary|ptb|www)\.)?discord(?:app)?\.com\/|discord:\/\/(?:-\/)?)channels\/([^/?#]+)\//.exec(link);
        if (match) return servers.isGuildPingHidden(match[1]);
      }
      for (const key of ['notification', 'item', 'data', 'metadata']) {
        if (classify(entry[key], seen, depth + 1)) return true;
      }
    } catch {}
    return false;
  }
  // Native store change signals invalidate trusted snapshots. For callers without
  // change signals, compare row references too (including in-place appends).
  function snapshot(value, trusted) {
    let cached = arrays.get(value);
    if (cached && cached.length === value.length
      && (trusted || value.every((row, i) => row === cached.source[i]))) return cached;
    cached = { length: value.length, source: value.slice(), view: undefined, ids: undefined };
    arrays.set(value, cached); return cached;
  }
  function list(value, trusted = false) {
    if (!enabled() || !Array.isArray(value) || !value.length) return value;
    const cached = snapshot(value, trusted);
    if (cached.view) return cached.view;
    const next = value.filter(item => !hidden(item));
    cached.view = next.length === value.length ? value : next;
    return cached.view;
  }
  function hasHiddenId(value, id, trusted = false) {
    if (!enabled() || !Array.isArray(value)) return false;
    const cached = snapshot(value, trusted);
    if (!cached.ids) cached.ids = new Map(value.map(row => [row?.id, row]));
    return hidden(cached.ids.get(id));
  }
  return { hidden, list, hasHiddenId, clear };
}

export function installHiddenPings(V, servers) {
  let active = true, totalsDepth = 0;
  const observed = new Map();
  const projection = createPingProjection(servers), disposers = [], stores = new Set(), patched = new WeakMap();
  let recentRaw, recentTrusted = false;
  function method(object, key, callback) {
    if (!object || typeof object[key] !== 'function') return;
    const keys = patched.get(object) ?? new Set();
    if (keys.has(key)) return;
    disposers.push(V.patcher.instead(key, object, callback));
    keys.add(key); patched.set(object, keys);
  }
  // Project display accessors, leaving persisted getState() and pagination raw.
  function getter(store, key, project) {
    let descriptor, owner = store;
    while (owner && !(descriptor = Object.getOwnPropertyDescriptor(owner, key))) owner = Object.getPrototypeOf(owner);
    if (typeof descriptor?.get !== 'function') return;
    const old = Object.getOwnPropertyDescriptor(store, key);
    if (old?.configurable === false) return;
    const projectedGet = function () { const result = descriptor.get.call(this); return active ? project(result) : result; };
    Object.defineProperty(store, key, { configurable: true, enumerable: descriptor.enumerable, get: projectedGet, set: descriptor.set });
    disposers.push(() => {
      if (Object.getOwnPropertyDescriptor(store, key)?.get !== projectedGet) return;
      if (old) Object.defineProperty(store, key, old); else delete store[key];
    });
  }
  const safeRawMentions = () => { try { return recentRaw?.(); } catch {} };
  function attachStore(name, module) {
    if (!active) return;
    const store = module?.default ?? module;
    if (!store || stores.has(store)) return;
    stores.add(store);
    const trusted = ['RecentMentionsStore', 'NotificationsInboxStore', 'NotificationCenterItemsStore'].includes(name)
      && typeof store.addChangeListener === 'function' && typeof store.removeChangeListener === 'function';
    if (trusted) {
      const changed = () => projection.clear();
      store.addChangeListener(changed);
      disposers.push(() => store.removeChangeListener(changed));
    }
    const projectRows = rows => projection.list(rows, trusted);
    if (name === 'RecentMentionsStore' && typeof store.getMentions === 'function') { recentRaw = store.getMentions.bind(store); recentTrusted = trusted; }
    if (['RecentMentionsStore', 'NotificationsInboxStore'].includes(name)) {
      for (const key of ['getMentions', 'getSettingsFilteredMentions', 'getInboxMessages']) {
        method(store, key, function (args, original) { const result = original.apply(this, args); return active ? projectRows(result) : result; });
      }
      for (const key of ['getMentionCountForChannel']) {
        method(store, key, function (args, original) { return active && !totalsDepth && servers.isChannelPingHidden(args[0]) ? 0 : original.apply(this, args); });
      }
      method(store, 'hasMention', function (args, original) {
        const result = original.apply(this, args);
        if (!active || !result) return result;
        const known = observed.get(args[0]);
        if (known) return projection.hidden(known) ? false : result;
        return projection.hasHiddenId(safeRawMentions(), args[0], recentTrusted) ? false : result;
      });
      method(store, 'getNotifyingChannelIds', function (args, original) {
        const ids = original.apply(this, args);
        return active && Array.isArray(ids) ? ids.filter(id => !servers.isChannelPingHidden(id)) : ids;
      });
    }
    if (name === 'NotificationCenterItemsStore') {
      getter(store, 'items', projectRows); getter(store, 'localItems', projectRows);
      for (const key of ['getItems', 'getLocalItems']) method(store, key, function (args, original) {
        const rows = original.apply(this, args); return active ? projectRows(rows) : rows;
      });
    }
    if (name === 'NotificationCenterStore') method(store, 'hasNewMentions', function (args, original) {
      const result = original.apply(this, args), rows = safeRawMentions();
      return active && result && Array.isArray(rows) && rows.length && !projection.list(rows, recentTrusted).length ? false : result;
    });
    if (name === 'ReadStateStore') {
      method(store, 'getMentionCount', function (args, original) { return active && !totalsDepth && servers.isChannelPingHidden(args[0]) ? 0 : original.apply(this, args); });
      method(store, 'getMentionChannelIds', function (args, original) {
        const ids = original.apply(this, args); return active && Array.isArray(ids) ? ids.filter(id => !servers.isChannelPingHidden(id)) : ids;
      });
    }
    if (name === 'GuildReadStateStore') {
      const rawStates = typeof store.getMutableGuildStates === 'function' ? store.getMutableGuildStates.bind(store) : undefined;
      method(store, 'getMentionCount', function (args, original) { return active && !totalsDepth && servers.isGuildPingHidden(args[0]) ? 0 : original.apply(this, args); });
      for (const [key, field] of [['getTotalMentionCount', 'highImportanceMentionCount'], ['getTotalNotificationsMentionCount', 'ncMentionCount']]) {
        method(store, key, function (args, original) {
          let result;
          totalsDepth++;
          try { result = original.apply(this, args); } finally { totalsDepth--; }
          if (!active || totalsDepth || typeof result !== 'number' || !rawStates) return result;
          try {
            const states = rawStates(); let removed = 0;
            for (const id of servers.pingGuildIds()) {
              const value = states?.[id]?.[field];
              if (typeof value === 'number' && Number.isFinite(value) && value > 0) removed += value;
            }
            return Math.max(0, result - removed);
          } catch { return result; }
        });
      }
    }
    if (name === 'InAppNotificationStore') method(store, 'getCurrentNotification', function (args, original) {
      const result = original.apply(this, args); return active && projection.hidden(result) ? null : result;
    });
  }
  function attachPolicy(module) {
    const host = module?.default ?? module;
    for (const key of ['shouldNotify', 'shouldNotifyBase', 'shouldNotifyForReaction']) method(host, key, function (args, original) {
      return active && (projection.hidden(args[0]) || servers.isChannelPingHidden(args[1])) ? false : original.apply(this, args);
    });
  }
  function attachEnqueue(module) {
    const host = module?.default ?? module;
    method(host, 'enqueueNotification', function (args, original) {
      return active && projection.hidden(args[0]) ? undefined : original.apply(this, args);
    });
  }
  function attachSound(module) {
    method(module, 'playInAppMessageSound', function (args, original) {
      return active && projection.hidden(args[0]) ? undefined : original.apply(this, args);
    });
  }
  function attachLoader(module) {
    method(module, 'useNotificationCenterItemsLoader', function (args, original) {
      const result = original.apply(this, args), items = active ? projection.list(result?.items) : result?.items;
      return result && items !== result.items ? { ...result, items } : result;
    });
  }
  function watch(path, callback) {
    if (typeof V.metro.getModuleWithImportedPath !== 'function') return;
    const remove = V.metro.getModuleWithImportedPath(path, module => { if (active) callback(module); });
    if (typeof remove === 'function') disposers.push(remove);
  }
  function refresh() {
    projection.clear();
    for (const store of stores) {
      try {
        if (typeof store.emitChange === 'function') store.emitChange();
        else store.doEmitChanges?.();
      } catch {}
    }
  }
  function observe(event) {
    if (event?.type === 'LOGOUT' || event?.type === 'CONNECTION_OPEN') { observed.clear(); projection.clear(); return; }
    if (servers.pingsEnabled?.() === false) return;
    if (!['MESSAGE_CREATE', 'MESSAGE_UPDATE'].includes(event?.type) || typeof event.message?.id !== 'string') return;
    const message = event.message, before = observed.get(message.id) ?? {};
    observed.delete(message.id);
    observed.set(message.id, { ...before,
      ...(message.guild_id ?? message.guildId ? { guild_id: message.guild_id ?? message.guildId } : {}),
      ...(message.channel_id ?? message.channelId ?? event.channelId ?? event.channel_id
        ? { channel_id: message.channel_id ?? message.channelId ?? event.channelId ?? event.channel_id } : {}) });
    while (observed.size > 2000) observed.delete(observed.keys().next().value);
  }
  function stop() {
    if (!active) return;
    active = false;
    for (const remove of disposers.splice(0).reverse()) { try { remove(); } catch {} }
    refresh(); stores.clear(); recentRaw = undefined; observed.clear();
  }
  try {
    for (const [name, path] of [
      ['RecentMentionsStore', 'modules/inbox/RecentMentionsStore.tsx'],
      ['NotificationsInboxStore', 'modules/notifications/NotificationsInboxStore.tsx'],
      ['NotificationCenterItemsStore', 'modules/notification_center/NotificationCenterItemsStore.tsx'],
      ['NotificationCenterStore', 'modules/notification_center/NotificationCenterStore.tsx'],
      ['ReadStateStore', 'stores/ReadStateStore.tsx'], ['GuildReadStateStore', 'stores/GuildReadStateStore.tsx'],
      ['InAppNotificationStore', 'stores/native/InAppNotificationStore.tsx'],
    ]) {
      try { attachStore(name, V.metro.findByStoreName?.(name)); } catch {}
      watch(path, module => attachStore(name, module));
    }
    try { attachPolicy(V.metro.findByProps?.('shouldNotify', 'shouldNotifyBase')); } catch {}
    try { attachEnqueue(V.metro.findByProps?.('enqueueNotification', 'clearNotification')); } catch {}
    watch('modules/notifications/NotificationTextUtils.tsx', attachPolicy);
    watch('actions/native/InAppNotificationActionCreators.tsx', attachEnqueue);
    watch('modules/notifications/native/playInAppMessageSound.tsx', attachSound);
    watch('modules/notification_center/useNotificationCenterItemsLoader.tsx', attachLoader);
  } catch (error) { stop(); throw error; }
  return { refresh, invalidate: projection.clear, observe, stop };
}
