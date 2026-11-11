(() => {
// SPDX-License-Identifier: CC0-1.0
// Shared by the separately installable Revenge bundles; no global API changes.
function withRevengeCompatibility(api, factory, pluginName) {
    var active = true;
    var generation = 0;
    var disposers = new Set();
    var warnings = new Set();
    var delayKey = Symbol.for('bunny.api.patcher.delay');
    var raw = api.patcher;
    function warn(message, error) {
        if (warnings.has(message)) return;
        warnings.add(message);
        try { api.logger?.warn?.('[' + pluginName + '] ' + message, error); } catch (_) {}
    }
    function clear() {
        active = false;
        generation++;
        Array.from(disposers).reverse().forEach(function (dispose) { dispose(); });
    }
    function patchKind(kind) {
        function patch(method, parent, callback, once) {
            var epoch = generation;
            var cancelled = false;
            var unpatch;
            var unsubscribe;
            var uiPatch = method === 'render' || method === 'type' || method === 'default';
            function dispose() {
                if (cancelled) return;
                cancelled = true;
                disposers.delete(dispose);
                try { unsubscribe?.(); } catch (error) { warn('Could not cancel a module subscription.', error); }
                try { unpatch?.(); } catch (error) { warn('Could not remove a ' + method + ' patch.', error); }
            }
            if (!active) return dispose;
            disposers.add(dispose);
            function install(target) {
                if (cancelled || !active || epoch !== generation) return;
                try {
                    var owner = target;
                    var key = method;
                    // React memo/forwardRef exports are objects, not functions.
                    // Inspect the resolved module, not just the lazy proxy.
                    for (var depth = 0; uiPatch && depth < 8; depth++) {
                        var value = owner?.[key];
                        if (value?.$$typeof === Symbol.for('react.memo')) {
                            owner = value; key = 'type';
                        } else if (value?.$$typeof === Symbol.for('react.forward_ref')) {
                            owner = value; key = 'render';
                        } else break;
                    }
                    if (uiPatch && typeof owner?.[key] !== 'function') {
                        warn('Skipped unavailable Discord component method: ' + method);
                        dispose();
                        return;
                    }
                    var remove = raw[kind](key, owner, function () {
                        if (!active || cancelled || epoch !== generation) {
                            if (kind === 'after') return arguments[1];
                            if (kind === 'instead') return arguments[1].apply(this, arguments[0]);
                            return;
                        }
                        try { return callback.apply(this, arguments); }
                        finally { if (once) dispose(); }
                    });
                    // A module can synchronously unload the plugin while installing.
                    if (cancelled || !active || epoch !== generation) remove?.();
                    else unpatch = remove;
                } catch (error) {
                    dispose();
                    // Required data/action patches must still fail visibly.
                    // Only optional UI methods can safely be skipped.
                    if (!uiPatch) throw error;
                    warn('Skipped incompatible Discord component patch: ' + method, error);
                }
            }
            try {
                var delay = parent?.[delayKey];
                if (typeof delay === 'function') {
                    var cancel = delay.call(parent, function (target) {
                        try { install(target); }
                        catch (error) {
                            // The caller is now Discord's module loader, outside
                            // the plugin loader's onLoad error boundary.
                            warn('Deferred Discord method is unavailable: ' + method, error);
                        }
                    });
                    if (typeof cancel === 'function') {
                        if (cancelled) cancel();
                        else unsubscribe = cancel;
                    }
                } else install(parent);
            } catch (error) {
                dispose();
                if (!uiPatch) throw error;
                warn('Could not resolve Discord component: ' + method, error);
            }
            return dispose;
        }
        patch.await = function (method, promise, callback, once) {
            var epoch = generation;
            var cancelled = false;
            var remove;
            function dispose() {
                if (cancelled) return;
                cancelled = true;
                disposers.delete(dispose);
                remove?.();
            }
            if (!active) return dispose;
            disposers.add(dispose);
            Promise.resolve(promise).then(function (target) {
                if (!cancelled && active && epoch === generation) remove = patch(method, target, callback, once);
            }).catch(function (error) {
                warn('Deferred patch failed: ' + method, error);
                dispose();
            });
            return dispose;
        };
        return patch;
    }
    var guardedPatcher;
    function currentPatcher() {
        if (!guardedPatcher || raw !== api.patcher) {
            raw = api.patcher;
            guardedPatcher = Object.create(raw || null);
            ['before', 'after', 'instead'].forEach(function (kind) {
                if (typeof raw?.[kind] === 'function') Object.defineProperty(guardedPatcher, kind, { value: patchKind(kind), enumerable: true });
            });
        }
        return guardedPatcher;
    }
    var localAPI = Object.create(api);
    Object.defineProperty(localAPI, 'patcher', { get: currentPatcher, enumerable: true });
    // Discord's legacy JS toast bridge can queue a broken ToastContainer on
    // newer Android builds (useToastContainer reads .position of undefined).
    // Keep this adapter per-plugin. Never change api.ui or Discord's global UI.
    function safeToast(message) {
        var label = typeof message === 'string' || typeof message === 'number'
            ? String(message)
            : String(message?.message ?? message?.text ?? '');
        if (!label) return;
        try {
            var nativeToast = api.metro?.common?.ReactNative?.ToastAndroid;
            if (typeof nativeToast?.show === 'function') {
                return nativeToast.show(label, nativeToast.SHORT ?? 0);
            }
        } catch (error) {
            warn('Native Android notification failed.', error);
        }
        warn('Notification logged because the Discord toast bridge is unsafe: ' + label);
    }
    var lastUI, lastToasts, adaptedUI;
    function currentUI() {
        var ui = api.ui;
        if (!ui?.toasts) return ui;
        if (ui !== lastUI || ui.toasts !== lastToasts) {
            lastUI = ui;
            lastToasts = ui.toasts;
            adaptedUI = Object.create(ui);
            var toasts = Object.create(ui.toasts);
            Object.defineProperty(toasts, 'showToast', { value: safeToast, enumerable: true });
            Object.defineProperty(adaptedUI, 'toasts', { value: toasts, enumerable: true });
        }
        return adaptedUI;
    }
    Object.defineProperty(localAPI, 'ui', { get: currentUI, enumerable: true });
    var plugin;
    try { plugin = factory(localAPI); }
    catch (error) { clear(); throw error; }
    if (!plugin || typeof plugin !== 'object') { clear(); throw new Error(pluginName + ': invalid plugin exports'); }
    var result = Object.assign({}, plugin);
    result.onLoad = function () {
        active = true;
        var epoch = generation;
        function failed(error) {
            if (active && epoch === generation) {
                try { result.onUnload(); } catch (cleanupError) { warn('Startup cleanup failed.', cleanupError); }
            }
            throw error;
        }
        try {
            var pending = plugin.onLoad?.apply(this, arguments);
            if (pending && typeof pending.then === 'function') return Promise.resolve(pending).catch(failed);
            return pending;
        } catch (error) {
            return failed(error);
        }
    };
    result.onUnload = function () {
        clear();
        return plugin.onUnload?.apply(this, arguments);
    };
    return result;
}

return withRevengeCompatibility(vendetta, function(vendetta) {
return (() => {
/*! HideBlockedAndIgnoredMessages 1.5.7, CC0-1.0.
 * Adapted from shipwr3ckd/revengeplugin; original authors Zykrah and シグマ siguma.
 * https://github.com/Fluttershy2008-mlp/lol/tree/main/hide-blocked-and-ignored-messages
 */
'use strict';
/* SPDX-License-Identifier: CC0-1.0 */
// IDs remain strings: Discord snowflakes exceed JavaScript's safe integer range.
const isDiscordUserId = value => typeof value === 'string' && /^[1-9]\d{16,19}$/.test(value);

function normalizeWhitelist(value) {
  return Array.isArray(value) ? [...new Set(value.filter(isDiscordUserId))] : [];
}

function parseWhitelistInput(value) {
  const tokens = String(value ?? '').trim().split(/[\s,;]+/).filter(Boolean);
  const ids = [], invalid = [];
  for (const token of tokens) {
    const id = token.replace(/^<@!?(\d+)>$/, '$1');
    (isDiscordUserId(id) ? ids : invalid).push(id);
  }
  return { ids: [...new Set(ids)], invalid };
}

function isUserWhitelisted(storage, id) {
  return storage.whitelistEnabled === true && isDiscordUserId(id)
    && Array.isArray(storage.whitelistedIds) && storage.whitelistedIds.includes(id);
}

/* SPDX-License-Identifier: CC0-1.0 */
// Server snowflakes use the same string format as user IDs. Do not accept user mentions.
const normalizeServerIds = normalizeWhitelist;
function parseServerIds(value) {
  const tokens = String(value ?? '').trim().split(/[\s,;]+/).filter(Boolean);
  return { ids: [...new Set(tokens.filter(isDiscordUserId))], invalid: tokens.filter(id => !isDiscordUserId(id)) };
}
function createServerFilter(storage, getChannel = () => undefined) {
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

/* SPDX-License-Identifier: CC0-1.0 */
function createPingProjection(servers) {
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

function installHiddenPings(V, servers) {
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

/* SPDX-License-Identifier: CC0-1.0 */
// Some mobile bars hold their own list snapshot instead of reading the patched
// store getters. Filter that snapshot at its render boundary as well.
function installGuildBarRenderer(V, servers, filter, runUnfiltered = fn => fn()) {
  const React = V.metro.common.React;
  if (!React?.createElement || !React?.cloneElement) return { refresh() {}, stop() {} };
  let stopped = false, rawRenderDepth = 0;
  function rawRender(fn) {
    rawRenderDepth++;
    try { return runUnfiltered(fn); } finally { rawRenderDepth--; }
  }
  const listeners = new Set(), cleanups = [], patched = new WeakMap();
  const names = ['GuildsBar', 'GuildsBarGuild', 'GuildsBarGuildItem', 'GuildsBarItem',
    'GuildsBarFolder', 'GuildsBarAnimatedItemWrapper', 'GuildIcon'];
  function hidden(value) {
    if (stopped || servers.iconsEnabled?.() === false || !value || typeof value !== 'object') return false;
    for (const id of [value.guildId, value.guild_id, value.guild?.id, value.id,
      value.item?.guildId, value.item?.guild_id, value.item?.guild?.id, value.item?.id,
      value.node?.guildId, value.node?.id]) {
      if (typeof id === 'string' && servers.isGuildIconHidden(id)) return true;
    }
    return false;
  }
  const callbacks = new WeakMap();
  function wrapCallback(fn) {
    if (!callbacks.has(fn)) callbacks.set(fn, function (...args) {
      return projectElement(rawRender(() => fn.apply(this, args)));
    });
    return callbacks.get(fn);
  }
  function projectProps(props) {
    if (!props || typeof props !== 'object' || stopped || rawRenderDepth || servers.iconsEnabled?.() === false) return props;
    const next = {};
    for (const key of ['data', 'items', 'guilds', 'guildFolders', 'fastListGuildFolders', 'guildIds', 'guild_ids']) {
      if (Array.isArray(props[key])) {
        const value = filter.projectList(props[key]);
        if (value !== props[key]) next[key] = value;
      }
    }
    for (const key of ['tree', 'guildTree', 'guildsTree']) {
      if (props[key]?.root) {
        const value = filter.projectTree(props[key]);
        if (value !== props[key]) next[key] = value;
      }
    }
    for (const key of ['item', 'node', 'folder']) {
      if (props[key] && typeof props[key] === 'object') {
        const value = filter.projectFolder(props[key]);
        if (value !== props[key]) next[key] = value;
      }
    }
    return Object.keys(next).length ? { ...props, ...next } : props;
  }
  function projectElement(element, depth = 0, seen = new Set()) {
    if (stopped || servers.iconsEnabled?.() === false || depth > 16 || element == null || typeof element !== 'object') return element;
    if (seen.has(element)) return element;
    if (Array.isArray(element)) {
      seen.add(element);
      const result = element.map(child => projectElement(child, depth + 1, seen));
      seen.delete(element);
      return result.some((child, i) => child !== element[i]) ? result.filter(child => child !== null) : element;
    }
    if (!React.isValidElement(element)) return element;
    if (hidden(element.props)) return null;
    seen.add(element);
    const projected = projectProps(element.props);
    const next = projected === element.props ? {} : { ...projected };
    for (const key of ['renderItem', 'renderSectionHeader', 'renderSectionFooter']) {
      if (typeof element.props[key] === 'function') next[key] = wrapCallback(element.props[key]);
    }
    if (element.props.children != null && typeof element.props.children !== 'function') {
      const children = projectElement(element.props.children, depth + 1, seen);
      if (children !== element.props.children) next.children = children;
    }
    seen.delete(element);
    return Object.keys(next).length ? React.cloneElement(element, next) : element;
  }
  function VisibilityGate({ source, rowProps }) {
    const [, redraw] = React.useState(0);
    React.useEffect(() => {
      const update = () => redraw(n => n + 1);
      listeners.add(update);
      return () => listeners.delete(update);
    }, []);
    return hidden(rowProps) ? null : projectElement(source);
  }
  function patch(owner, key, callback) {
    if (!owner || typeof owner[key] !== 'function') return;
    const keys = patched.get(owner) ?? new Set();
    if (keys.has(key)) return;
    cleanups.push(V.patcher.instead(key, owner, callback));
    keys.add(key); patched.set(owner, keys);
  }
  function attachComponent(module) {
    if (stopped || !module) return;
    const component = module.default ?? module;
    let owner, key;
    if (typeof component.type === 'function') { owner = component; key = 'type'; }
    else if (typeof component.render === 'function') { owner = component; key = 'render'; }
    else if (typeof component.prototype?.render === 'function') { owner = component.prototype; key = 'render'; }
    else if (typeof module.default === 'function') { owner = module; key = 'default'; }
    if (!owner) return;
    patch(owner, key, function (args, original) {
      // Always call the original so its React hook order stays unchanged.
      // VisibilityGate owns our hooks as a separate component.
      // Preserve a complete source snapshot, even if native code memoizes it.
      // VisibilityGate projects it at display time so OFF can always restore it.
      const source = rawRender(() => original.apply(this, args));
      return stopped ? source : React.createElement(VisibilityGate, { source, rowProps: this?.props ?? args[0] });
    });
  }
  function attachSelector(module) {
    if (stopped || !module) return;
    const key = typeof module.useGuildsBarProps === 'function' ? 'useGuildsBarProps' : 'default';
    patch(module, key, function (args, original) {
      return projectProps(original.apply(this, args));
    });
  }
  function watch(path, callback) {
    if (typeof V.metro.getModuleWithImportedPath !== 'function') return;
    const remove = V.metro.getModuleWithImportedPath(path, callback);
    if (typeof remove === 'function') cleanups.push(remove);
  }
  function refresh() { for (const update of listeners) update(); }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const remove of cleanups.splice(0).reverse()) { try { remove(); } catch {} }
    refresh(); listeners.clear();
  }
  try {
    // Memo wrappers retain their object identity even when callers captured the export.
    // Exact imported paths also support minified functions and modules loaded later.
    for (const name of names) {
      try { attachComponent(V.metro.findByTypeName?.(name)); } catch {}
      try { attachComponent(V.metro.findByName?.(name, false)); } catch {}
      try { attachComponent(V.metro.findByDisplayName?.(name, false)); } catch {}
      watch('modules/guilds_bar/native/' + name + '.tsx', attachComponent);
      if (name !== 'GuildsBar') watch('modules/guilds_bar/native/components/' + name + '.tsx', attachComponent);
    }
    try { attachSelector(V.metro.findByProps?.('useGuildsBarProps')); } catch {}
    watch('modules/guilds_bar/native/useGuildsBarProps.tsx', attachSelector);
    watch('modules/guilds_bar/native/hooks/useGuildsBarProps.tsx', attachSelector);
  } catch (error) { stop(); throw error; }
  return { refresh, stop };
}

/* SPDX-License-Identifier: CC0-1.0 */
// Display-only SortedGuildStore APIs. Never filter getGuildFolders or
// getCompatibleGuildFolders: Discord uses those to save account-wide ordering.
function createGuildIconFilter(isHidden) {
  function replaceFields(source, fields) {
    const descriptors = Object.getOwnPropertyDescriptors(source);
    for (const [key, value] of Object.entries(fields)) {
      descriptors[key] = { value, enumerable: descriptors[key]?.enumerable ?? true, configurable: true, writable: true };
    }
    return Object.create(Object.getPrototypeOf(source), descriptors);
  }
  function projectList(value, seen = new Set(), depth = 0) {
    if (!Array.isArray(value) || depth > 12 || seen.has(value)) return value;
    seen.add(value);
    const items = []; let changed = false;
    for (const entry of value) {
      if (typeof entry === 'string') {
        if (isHidden(entry)) { changed = true; continue; }
        items.push(entry); continue;
      }
      if (!entry || typeof entry !== 'object') { items.push(entry); continue; }
      const guildId = entry.guildId ?? entry.guild_id ?? entry.guild?.id
        ?? (entry.type !== 'folder' && entry.type !== 'root' && entry.folderId == null ? entry.id : undefined);
      if (typeof guildId === 'string' && isHidden(guildId)) { changed = true; continue; }
      const next = projectFolder(entry, seen, depth + 1);
      // Native standalone servers can be folder-shaped rows without a folder ID.
      const ids = entry.guildIds ?? entry.guild_ids;
      const remaining = next.guildIds ?? next.guild_ids;
      if (entry.type !== 'folder' && entry.folderId == null && entry.id == null
        && Array.isArray(ids) && ids.length > 0 && Array.isArray(remaining) && !remaining.length) {
        changed = true; continue;
      }
      changed ||= next !== entry;
      items.push(next);
    }
    seen.delete(value);
    return changed ? items : value;
  }
  function projectFolder(value, seen = new Set(), depth = 0) {
    if (!value || typeof value !== 'object' || depth > 12 || seen.has(value)) return value;
    seen.add(value);
    const fields = {};
    for (const key of ['guildIds', 'guild_ids', 'children', 'data', 'items']) {
      if (!Array.isArray(value[key])) continue;
      const next = projectList(value[key], seen, depth + 1);
      if (next !== value[key]) fields[key] = next;
    }
    seen.delete(value);
    // Keep empty folder shells and lookup nodes so parent references stay valid.
    return Object.keys(fields).length ? replaceFields(value, fields) : value;
  }
  function projectTree(value) {
    if (!value?.root || !Array.isArray(value.root.children)) return value;
    const root = projectFolder(value.root);
    if (root === value.root) return value;
    const fields = { root };
    if (value.nodes && typeof value.nodes === 'object' && !Array.isArray(value.nodes)) {
      const replacements = {};
      const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (node.id != null && Object.prototype.hasOwnProperty.call(value.nodes, node.id)) replacements[node.id] = node;
        // Only traverse the already bounded projection, protecting cyclic input.
      };
      const queue = [root], seen = new Set();
      while (queue.length && seen.size < 2000) {
        const node = queue.shift();
        if (!node || seen.has(node)) continue;
        seen.add(node); visit(node);
        if (Array.isArray(node.children)) queue.push(...node.children);
      }
      fields.nodes = replaceFields(value.nodes, replacements);
    }
    return replaceFields(value, fields);
  }
  return { projectList, projectFolder, projectTree };
}

function installGuildIcons(V, servers) {
  let stopped = false, renderer, unfilteredDepth = 0;
  function runUnfiltered(fn) {
    unfilteredDepth++;
    try { return fn(); } finally { unfilteredDepth--; }
  }
  const stores = new Set(), cleanups = [], patched = new WeakSet();
  const filter = createGuildIconFilter(id => !stopped && servers.isGuildIconHidden(id));
  function refresh() {
    renderer?.refresh();
    for (const store of stores) {
      try {
        if (typeof store.doEmitChanges === 'function') store.doEmitChanges();
        else store.emitChange?.();
      } catch {}
    }
  }
  function attach(module) {
    if (stopped) return;
    const store = module?.default ?? module;
    if (!store || (typeof store !== 'object' && typeof store !== 'function') || patched.has(store)) return;
    patched.add(store); stores.add(store);
    for (const [key, project] of [
      ['getGuildsTree', filter.projectTree],
      ['getFastListGuildFolders', filter.projectList],
      ['getFlattenedGuildFolderList', filter.projectList],
      ['getFlattenedGuildIds', filter.projectList],
      ['getGuildFolderById', filter.projectFolder],
    ]) {
      if (typeof store[key] !== 'function') continue;
      cleanups.push(V.patcher.instead(key, store, function (args, original) {
        const result = original.apply(this, args);
        if (stopped || unfilteredDepth || servers.iconsEnabled?.() === false) return result;
        try { return project(result); } catch { return result; }
      }));
    }
    refresh();
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const remove of cleanups.splice(0).reverse()) { try { remove(); } catch {} }
    refresh(); stores.clear();
  }
  try {
    try { attach(V.metro.findByStoreName?.('SortedGuildStore')); } catch {}
    try { attach(V.metro.findByProps?.('getGuildsTree', 'getFastListGuildFolders')); } catch {}
    renderer = installGuildBarRenderer(V, servers, filter, runUnfiltered);
    cleanups.push(renderer.stop);
    if (typeof V.metro.getModuleWithImportedPath === 'function') {
      const cancel = V.metro.getModuleWithImportedPath('stores/SortedGuildStore.tsx', attach);
      if (typeof cancel === 'function') cleanups.push(cancel);
    }
  } catch (error) { stop(); throw error; }
  return { refresh, stop };
}

/* SPDX-License-Identifier: CC0-1.0 */
// Project the sidebar's display model; ChannelStore and permission data stay real.
// Hide the final renderer too, so ShowHiddenChannels cannot reintroduce locked rows.
function installChannelLists(V, servers) {
  let stopped = false;
  const cleanups = [], stores = new Set(), models = new Set();
  const patched = new WeakMap(), proxies = new WeakMap(), projected = new WeakSet();
  const hidden = id => !stopped && servers.isGuildChannelListHidden(id);
  function patch(object, key, callback) {
    if (!object || typeof object[key] !== 'function') return;
    const keys = patched.get(object) ?? new Set();
    if (keys.has(key)) return;
    cleanups.push(V.patcher.instead(key, object, callback));
    keys.add(key); patched.set(object, keys);
  }
  function modelView(model) {
    if (!model || typeof model !== 'object' || typeof model.getSections !== 'function') return model;
    if (projected.has(model)) return model;
    if (proxies.has(model)) return proxies.get(model);
    models.add(model);
    const methods = new Map();
    const view = new Proxy(model, { get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (!methods.has(key) || methods.get(key).source !== value) {
        const wrapper = function (...args) {
          const result = Reflect.apply(value, target, args);
          if (!hidden(target.id) || !Array.isArray(result)) return result;
          if (key === 'getSections' && result.every(count => typeof count === 'number')) return result.map(() => 0);
          if (key === 'getRows' && result.every(Array.isArray)) return result.map(() => []);
          return result;
        };
        methods.set(key, { source: value, wrapper });
      }
      return methods.get(key).wrapper;
    } });
    proxies.set(model, view); projected.add(view);
    return view;
  }
  function attachStore(module) {
    if (stopped) return;
    const store = module?.default ?? module;
    for (const key of ['getGuild', 'getGuildWithoutChangingGuildActionRows']) {
      patch(store, key, function (args, original) {
        const result = original.apply(this, args);
        if (stopped) return result;
        if (result?.guildChannels) return { ...result, guildChannels: modelView(result.guildChannels) };
        return modelView(result);
      });
    }
    if (store) stores.add(store);
  }
  function attachLegacyStore(module) {
    if (stopped) return;
    const store = module?.default ?? module;
    patch(store, 'getChannels', function (args, original) {
      const result = original.apply(this, args);
      if (!hidden(args[0]) || !result || typeof result !== 'object' || Array.isArray(result)) return result;
      const descriptors = Object.getOwnPropertyDescriptors(result);
      for (const key of Object.keys(result)) {
        if (Array.isArray(result[key])) descriptors[key] = { value: [], enumerable: descriptors[key].enumerable, configurable: true, writable: true };
      }
      return Object.create(Object.getPrototypeOf(result), descriptors);
    });
    if (store) stores.add(store);
  }
  function attachRenderer(module) {
    if (stopped) return;
    const renderer = module?.default ?? module;
    const guild = options => options?.guildChannels?.id;
    patch(renderer, 'renderChannelListItem', function (args, original) {
      return hidden(guild(args[0])) ? null : original.apply(this, args);
    });
    patch(renderer, 'getChannelListItemSize', function (args, original) {
      return hidden(guild(args[0])) ? 0 : original.apply(this, args);
    });
  }
  function watch(path, callback) {
    if (typeof V.metro.getModuleWithImportedPath !== 'function') return;
    const remove = V.metro.getModuleWithImportedPath(path, callback);
    if (typeof remove === 'function') cleanups.push(remove);
  }
  function refresh() {
    for (const model of models) { try { model.invalidate?.(); } catch {} }
    for (const store of stores) { try { store.emitChange?.(); } catch {} }
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const remove of cleanups.splice(0).reverse()) { try { remove(); } catch {} }
    refresh(); models.clear(); stores.clear();
  }
  try {
    try { attachStore(V.metro.findByStoreName?.('ChannelListStore')); } catch {}
    try { attachLegacyStore(V.metro.findByStoreName?.('GuildChannelStore')); } catch {}
    try { attachRenderer(V.metro.findByProps?.('renderChannelListItem', 'getChannelListItemSize')); } catch {}
    watch('modules/guild_sidebar/ChannelListStore.tsx', attachStore);
    watch('stores/GuildChannelStore.tsx', attachLegacyStore);
    watch('modules/channel_list_v2/native/renderRedesignChannelListItem.tsx', attachRenderer);
  } catch (error) { stop(); throw error; }
  return { refresh, stop };
}

/* SPDX-License-Identifier: CC0-1.0 */

// Discord's GuildChannelUserList feeds UsersFastList with section lengths
// and a (sectionIndex, rowIndex) getter. ChannelMemberStore's sparse rows
// include group headers, so a group's first member is at group.index + 1.
function projectChannelMemberList(props, data, isFilteredUser, rowHeight, sectionHeight) {
  const { sections, getItemProps, getSectionProps, onScroll } = props;
  const { groups, rows } = data ?? {};
  if (!Array.isArray(groups) || groups.length !== sections.length || !rows
    || !groups.every((group, i) => Number.isSafeInteger(group?.index) && group.count === sections[i])) return props;

  const hidden = Object.keys(rows).map(Number).filter(index => {
    const row = rows[index];
    return Number.isSafeInteger(index) && row?.type === 'MEMBER' && isFilteredUser(row.user?.id);
  }).sort((a, b) => a - b);
  if (!hidden.length) return props;

  const visible = [], scrollGaps = [];
  let cursor = 0, changed = false, y = props.listHeaderSize ?? 0;
  for (const [index, group] of groups.entries()) {
    const start = group.index + 1, end = start + group.count, removed = [];
    while (hidden[cursor] < end) {
      const rowIndex = hidden[cursor++] - start;
      if (rowIndex < 0) continue;
      // The React snapshot and store can differ during a native list update.
      if (getItemProps(index, rowIndex)?.props?.user?.id === rows[start + rowIndex]?.user?.id) {
        removed.push(rowIndex);
      }
    }
    const count = group.count - removed.length;
    changed ||= removed.length > 0;
    if (count === 0 && removed.length) {
      scrollGaps.push([y, sectionHeight + group.count * rowHeight]);
      continue;
    }
    if (group.count > 0 && group.title != null) y += sectionHeight;
    for (const [offset, rowIndex] of removed.entries()) {
      scrollGaps.push([y + (rowIndex - offset) * rowHeight, rowHeight]);
    }
    y += count * rowHeight;
    visible.push({ index, count, removed });
  }
  if (!changed) return props;

  return {
    ...props,
    sections: visible.map(section => section.count),
    getItemProps(sectionIndex, rowIndex) {
      const section = visible[sectionIndex];
      if (!section) return undefined;
      let originalIndex = rowIndex;
      for (const hiddenIndex of section.removed) {
        if (hiddenIndex > originalIndex) break;
        originalIndex++;
      }
      const row = getItemProps(section.index, originalIndex);
      if (!section.removed.length || !row?.props) return row;
      return { ...row, props: { ...row.props, start: rowIndex === 0, end: rowIndex === section.count - 1 } };
    },
    getSectionProps(sectionIndex) {
      const section = visible[sectionIndex];
      if (!section) return undefined;
      const header = getSectionProps(section.index);
      const title = header?.props?.title;
      const suffix = ' — ' + groups[section.index].count;
      if (!section.removed.length || typeof title !== 'string' || !title.endsWith(suffix)) return header;
      return { ...header, props: { ...header.props, title: title.slice(0, -suffix.length) + ' — ' + section.count } };
    },
    onScroll(event) {
      const native = event?.nativeEvent;
      const offset = native?.contentOffset;
      if (typeof onScroll !== 'function' || !rowHeight || !Number.isFinite(offset?.y)) return onScroll?.(event);
      // Discord requests member pages using the original, unfiltered scroll offset.
      let extra = 0;
      for (const [position, height] of scrollGaps) {
        if (position > offset.y) break;
        extra += height;
      }
      return onScroll(extra ? { ...event, nativeEvent: { ...native, contentOffset: { ...offset, y: offset.y + extra } } } : event);
    },
  };
}

function installChannelMemberList(V, getChannel, isFilteredUser) {
  const metro = V.metro, React = metro.common.React;
  const base = 'modules/main_tabs_v2/native/shared_components/user_list/';
  const listeners = new Set(), cleanups = [];
  let stopped = false, revision = 0;
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const snapshot = () => revision;
  const refresh = () => { revision++; for (const listener of listeners) listener(); };
  const unavailable = { refresh() {}, stop() {} };
  if (typeof metro.getModuleWithImportedPath !== 'function' || !React?.useSyncExternalStore) return unavailable;

  function MembersList({ list, channelId, guildId, rowHeight = 0, sectionHeight = 0 }) {
    const version = React.useSyncExternalStore(subscribe, snapshot);
    return React.useMemo(() => {
      if (stopped) return list;
      try {
        const store = metro.findByImportedPath?.('stores/ChannelMemberStore.tsx')?.default
          ?? metro.findByStoreName?.('ChannelMemberStore');
        const data = store?.getProps?.(guildId, channelId);
        const props = projectChannelMemberList(list.props, data, isFilteredUser, rowHeight, sectionHeight);
        return props === list.props ? list : React.cloneElement(list, props);
      } catch { return list; }
    }, [list, channelId, guildId, version, rowHeight, sectionHeight]);
  }

  function ScaledMembersList({ useRowHeight, useSectionHeight, ...props }) {
    return React.createElement(MembersList, { ...props, rowHeight: useRowHeight(), sectionHeight: useSectionHeight() });
  }
  function wrapList(source, guildId, channelId) {
    const children = source?.props?.children;
    if (!Array.isArray(children)) return source;
    const index = children.findIndex(child => child?.key === 'guild-channel-user-list'
      && Array.isArray(child.props?.sections)
      && typeof child.props.getItemProps === 'function' && typeof child.props.getSectionProps === 'function');
    if (index < 0) return source;
    const next = children.slice();
    const useRowHeight = metro.findByImportedPath?.(base + 'useScaledRowHeight.tsx')?.default;
    const useSectionHeight = metro.findByImportedPath?.(base + 'useScaledSectionHeight.tsx')?.default;
    const List = typeof useRowHeight === 'function' && typeof useSectionHeight === 'function' ? ScaledMembersList : MembersList;
    next[index] = React.createElement(List, { key: next[index].key, list: next[index], guildId, channelId, useRowHeight, useSectionHeight });
    return React.cloneElement(source, undefined, next);
  }

  function attach(module) {
    if (stopped) return;
    const component = module?.default;
    const memo = typeof component?.type === 'function';
    const owner = memo ? component : module, key = memo ? 'type' : 'default';
    if (typeof owner?.[key] !== 'function') return;
    cleanups.push(V.patcher.after(key, owner, ([props], result) => {
      const { channelId, guildId, roleId } = props ?? {};
      if (stopped || !channelId || !guildId || roleId) return;
      try {
        const type = getChannel(channelId)?.type;
        if (type === 0 || type === 5) return wrapList(result, guildId, channelId);
      } catch {}
    }));
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const cleanup of cleanups.splice(0).reverse()) { try { cleanup(); } catch {} }
    refresh();
    listeners.clear();
  }
  try {
    const cancel = metro.getModuleWithImportedPath(base + 'GuildChannelUserList.tsx', attach);
    if (typeof cancel === 'function') cleanups.push(cancel);
  } catch (error) { stop(); throw error; }
  return { refresh, stop };
}

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

function createMessageFilter({ storage, blockedStore, ignoredStore, getMessage, isServerMessageHidden = () => false }) {
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
    if (isUserWhitelisted(storage, id)) return false;
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
    } else if (event.type === 'SEARCH_FINISH' || event.type === 'SEARCH_MESSAGES_SUCCESS') {
      const batches = event.type === 'SEARCH_MESSAGES_SUCCESS' ? event.data : [event];
      if (Array.isArray(batches)) for (const batch of batches) {
        if (!Array.isArray(batch?.messages)) continue;
        for (const entry of batch.messages) {
          const group = Array.isArray(entry) ? entry : [entry];
          for (const value of group) observeMessage(value?.message ?? value,
            batch.channelId ?? batch.channel_id ?? event.channelId ?? event.channel_id);
        }
      }
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
    if (isUserWhitelisted(storage, message?.author?.id)) return false;
    return Boolean(message && (isFilteredUser(message.author?.id)
      || (enabled('removeBotCommands') && botResponseHidden(message))));
  }

  function shouldHide(message) {
    if (!message || typeof message !== 'object') return false;
    try {
      if (isServerMessageHidden(message)) return true;
      // An explicit author exception also applies when they reply to another
      // hidden user. This does not reveal that other user's own messages.
      if (isUserWhitelisted(storage, message.author?.id)) return false;
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

  return { shouldHide, isFilteredUser, observe, clear: () => metadata.clear() };
}

/* SPDX-License-Identifier: CC0-1.0 */
// Display-only MessageRecord copies. Never edit the gateway payload or cache.
function createMentionFilter(isFilteredUser, storage) {
  let cache = new WeakMap();
  const same = (a, b) => a === b || (Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((item, i) => item === b[i]));

  function project(message) {
    if (!message || typeof message !== 'object' || storage.removeMentions === false) return message;
    const original = message.content;
    // Both normal and legacy nickname mentions; role/channel mentions stay intact.
    const content = typeof original === 'string'
      ? original.replace(/<@!?(\d+)>/g, (token, id) => isFilteredUser(id) ? '' : token) : original;
    const mentions = Array.isArray(message.mentions)
      ? message.mentions.filter(user => !isFilteredUser(typeof user === 'string' ? user : user?.id))
      : message.mentions;
    if (content === original && same(mentions, message.mentions)) return message;
    const descriptors = Object.getOwnPropertyDescriptors(message);
    const keys = Reflect.ownKeys(descriptors);
    const previous = cache.get(message);
    if (previous && previous.content === content && same(previous.mentions, mentions)
      && keys.length === previous.keys.length && keys.every(key => {
        const a = descriptors[key], b = previous.descriptors[key];
        return b && a.value === b.value && a.get === b.get && a.set === b.set;
      })) return previous.view;
    const sourceDescriptors = { ...descriptors };
    descriptors.content = { value: content, writable: true, enumerable: true, configurable: true };
    if (Array.isArray(mentions)) {
      descriptors.mentions = { value: mentions, writable: true, enumerable: true, configurable: true };
    }
    const view = Object.create(Object.getPrototypeOf(message), descriptors);
    cache.set(message, { content, mentions, view, keys, descriptors: sourceDescriptors });
    return view;
  }
  return { project, clear: () => { cache = new WeakMap(); } };
}

/* SPDX-License-Identifier: CC0-1.0 */
const sameItems = (a, b) => a.length === b.length && a.every((item, i) => item === b[i]);

// Project the list BEFORE Discord groups blocked messages or generates native
// rows. Leave the real channel cache untouched.
// Pagination/loading flags and the ChannelMessages prototype are preserved.
function createCollectionFilter(shouldHide, reportUnsupported = () => {}, projectMessage = message => message) {
  let cache = new WeakMap();

  function project(collection) {
    if (!collection || typeof collection !== 'object') return collection;
    const raw = Array.isArray(collection) ? collection : collection._array;
    if (!Array.isArray(raw)) {
      reportUnsupported();
      return collection;
    }
    const visible = raw.filter(message => !shouldHide(message)).map(projectMessage);
    if (sameItems(visible, raw)) return collection;
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
      projected._map = { value: new Map(visible.map(message => [message?.id, message])),
        writable: true, enumerable: true, configurable: true };
    } else if (collection._map && typeof collection._map === 'object') {
      const map = Object.create(Object.getPrototypeOf(collection._map));
      for (const message of visible) {
        if (message?.id && Object.prototype.hasOwnProperty.call(collection._map, message.id)) {
          Object.defineProperty(map, message.id, { value: message,
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
const historyRows = value => Array.isArray(value) ? value : value?._array;
const snowflake = id => typeof id === 'string' && /^[1-9]\d*$/.test(id);
const compareIds = (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

// Rendering sees a projection; history actions need the real collection to
// choose cursors. Otherwise an empty projected page has no pagination cursor.
function createPagination({ getMessages, shouldHide, selectedChannel, fetchMessages,
  isChannelHidden = () => false, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let nativeDepth = 0, stopped = false, timer, epoch = 0;
  let channel, attempted = new Set(), pages = 0, busy = false, failed = false;
  let requestedBefore = false, hiddenPage = false;
  const maxPages = 5;

  function runNative(fn) {
    nativeDepth++;
    try { return fn(); } finally { nativeDepth--; }
  }
  function runDisplay(fn) {
    const depth = nativeDepth;
    nativeDepth = 0;
    try { return fn(); } finally { nativeDepth = depth; }
  }
  function currentChannel() {
    try { return selectedChannel?.(); } catch { return undefined; }
  }
  function reset() {
    epoch++;
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    channel = undefined; attempted = new Set(); pages = 0; busy = failed = false;
    requestedBefore = hiddenPage = false;
  }
  function inspect(id) {
    const collection = getMessages(id), rows = historyRows(collection);
    if (!Array.isArray(rows) || !rows.length) return;
    const ids = rows.map(row => row?.id).filter(snowflake).sort(compareIds);
    if (!ids.length) return;
    return { collection, rows, oldest: ids[0], newest: ids[ids.length - 1] };
  }
  function canContinue(info) {
    const c = info?.collection;
    // Unknown flags/array-only builds have no proven history boundary. Leave
    // their native Load more control alone rather than guessing end-of-history.
    return c && c.hasMoreBefore === true && c.hasMoreAfter === false
      && c.ready !== false && !c.loadingMore && !c.loadingMoreBefore && !c.loadingMoreAfter
      && !c.loading && !c.isLoading && (hiddenPage || info.rows.every(shouldHide));
  }
  function consider(id) {
    if (stopped || nativeDepth || !fetchMessages || !id || isChannelHidden(id) || currentChannel() !== id) return;
    if (channel !== id) { reset(); channel = id; }
    if (timer !== undefined || busy || failed || pages >= maxPages) return;
    const info = inspect(id);
    if (!canContinue(info) || attempted.has(info.oldest)) return;
    const session = epoch;
    // Schedule outside getMessages/render and Flux dispatch. Never recursively
    // dispatch or fetch while Discord is constructing a native message row.
    timer = setTimer(() => {
      timer = undefined;
      if (stopped || session !== epoch || currentChannel() !== id) return;
      const latest = inspect(id);
      if (!canContinue(latest) || attempted.has(latest.oldest)) return;
      attempted.add(latest.oldest); pages++; busy = true;
      requestedBefore = true;
      let result;
      try {
        result = runNative(() => fetchMessages({ channelId: id, before: latest.oldest, limit: 50 }));
      } catch { busy = false; failed = true; return; }
      // Native success/failure dispatches handle actions that return void. A
      // rejected promise must never produce retries or an unhandled rejection.
      Promise.resolve(result).then(() => {
        if (stopped || session !== epoch) return;
        busy = false;
        consider(id);
      }, () => {
        if (stopped || session !== epoch) return;
        busy = false; failed = true;
      });
    }, 250);
  }
  function observe(event) {
    const type = event?.type;
    if (['LOGOUT', 'CONNECTION_OPEN', 'CHANNEL_SELECT'].includes(type)) { reset(); return; }
    const id = event?.channelId ?? event?.channel_id;
    if (!id || id !== channel) return;
    if (type === 'LOAD_MESSAGES_FAILURE') { busy = false; failed = true; }
    if (type === 'LOAD_MESSAGES_SUCCESS') {
      busy = false;
      hiddenPage = requestedBefore && Array.isArray(event.messages)
        && event.messages.length > 0 && event.messages.every(shouldHide);
      consider(id);
    }
  }
  function repairOptions(options) {
    if (!options || typeof options !== 'object' || options.jump || options.around
      || options.messageId || options.jumpToMessageId || options.isSearch) return options;
    const id = options.channelId ?? options.channel_id;
    if (!id || Boolean(options.before) === Boolean(options.after)) return options;
    const info = inspect(id);
    if (!info) return options;
    const visible = info.rows.filter(row => !shouldHide(row)).map(row => row?.id).filter(snowflake).sort(compareIds);
    if (!visible.length) return options;
    // Only move an actual display-boundary cursor; explicit jumps and arbitrary
    // anchors must retain exactly the range Discord requested.
    if (options.before === visible[0] && options.before !== info.oldest)
      return { ...options, before: info.oldest };
    if (options.after === visible[visible.length - 1] && options.after !== info.newest)
      return { ...options, after: info.newest };
    return options;
  }
  function manualRequest(options) {
    if (nativeDepth) return;
    const id = options?.channelId ?? options?.channel_id;
    if (!id || isChannelHidden(id) || currentChannel() !== id) return;
    reset(); channel = id;
    busy = true;
    requestedBefore = Boolean(options.before) && !options.after && !options.jump && !options.around
      && !options.messageId && !options.jumpToMessageId && !options.isSearch;
    return epoch;
  }
  function finishRequest(ticket, error = false) {
    if (stopped || ticket === undefined || ticket !== epoch) return;
    busy = false;
    if (error) failed = true;
    else consider(channel);
  }
  return { runNative, runDisplay, consider, observe, repairOptions, manualRequest, finishRequest, reset,
    isNative: () => nativeDepth > 0,
    stop() { stopped = true; reset(); } };
}

/* SPDX-License-Identifier: CC0-1.0 */

// Native schema used by Valenced's own hide-blocked-messages plugin:
// ChatManager.createRow receives type 1 messages or type 2/6 groups containing
// generated message rows in `content`. Unwrap at this boundary, after native
// grouping, without changing RelationshipStore or mutating message records.
function projectNativeRows(row, storage, isFilteredUser, isServerMessageHidden = () => false) {
  if (row?.type === 1 && isServerMessageHidden(row.message)) return [];
  if (!row || (row.type !== 2 && row.type !== 6)) return [row];
  const children = [], seen = new Set();
  function collect(value, depth) {
    if (!value || depth > 8 || seen.has(value)) return false;
    seen.add(value);
    if (value.type === 1 && typeof value.message?.authorId === 'string') {
      children.push(value); return true;
    }
    if ((value.type !== 2 && value.type !== 6) || !Array.isArray(value.content)) return false;
    return value.content.every(child => collect(child, depth + 1));
  }
  // Unknown native layouts pass through rather than inventing row fields.
  if (!collect(row, 0) || !children.length) return [row];
  const filtered = children.map(child => isServerMessageHidden(child.message) || isFilteredUser(child.message.authorId));
  const whitelisted = children.some(child => isUserWhitelisted(storage, child.message.authorId));
  if (!whitelisted && !filtered.some(Boolean)) return [row];
  // Native createRow will assign a consecutive index to each top-level child.
  // Force a native rebind when the prior cached row was a blocked group.
  return children.filter((_child, index) => !filtered[index])
    .map(child => ({ ...child, changeType: 2 }));
}

function installNativeRows(V, storage, isFilteredUser, isServerMessageHidden) {
  let stopped = false;
  const patched = new WeakSet(), cleanups = [];
  function attach(module) {
    if (stopped) return;
    const ChatManager = module?.default ?? module?.ChatManager ?? module;
    const prototype = ChatManager?.prototype;
    if (!prototype || typeof prototype.createRow !== 'function' || patched.has(prototype)) return;
    const unpatch = V.patcher.instead('createRow', prototype, function (args, original) {
      if (stopped) return original.apply(this, args);
      let rows;
      try { rows = projectNativeRows(args[0], storage, isFilteredUser, isServerMessageHidden); }
      catch { return original.apply(this, args); }
      if (rows.length === 1 && rows[0] === args[0]) return original.apply(this, args);
      let result;
      for (const row of rows) result = original.apply(this, [row, ...args.slice(1)]);
      return result;
    });
    patched.add(prototype); cleanups.push(unpatch);
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const cleanup of cleanups.splice(0).reverse()) { try { cleanup(); } catch {} }
  }
  try {
    try { attach(V.metro.findByName?.('ChatManager')); } catch {}
    if (typeof V.metro.getModuleWithImportedPath === 'function') {
      // Handles ChatManager being loaded after the plugin starts. Registration
      // is owned by the adapter and also removed explicitly on plugin unload.
      const cancel = V.metro.getModuleWithImportedPath(
        'modules/messages/native/renderer/ChatManager.tsx', attach);
      if (typeof cancel === 'function') cleanups.push(cancel);
    }
  } catch (error) { stop(); throw error; }
  return stop;
}

/* SPDX-License-Identifier: CC0-1.0 */
// Explicit message search and author suggestions can include blocked users.
function createSearchScope() {
  let depth = 0;
  function run(fn) {
    depth++;
    try { return fn(); } finally { depth--; }
  }
  function dispatch(event, fn) {
    const previous = depth;
    const type = event?.type;
    // Native SearchMessageStore discards records using the combined relationship
    // check during SEARCH_MESSAGES_SUCCESS, before any result getter runs.
    depth = type === 'SEARCH_MESSAGES_SUCCESS' || type === 'SEARCH_FINISH'
      || (typeof type === 'string' && type.startsWith('SEARCH_AUTOCOMPLETE_')) ? previous + 1 : 0;
    try { return fn(); } finally { depth = previous; }
  }
  return { run, dispatch, active: () => depth > 0 };
}

function installSearch(V, notify, getChannel, isFilteredUser) {
  const scope = createSearchScope();
  const cleanups = [], stores = new Set(), patched = new WeakMap();
  const memberSearchChannels = new Map();
  let memberResults = new WeakMap(), stopped = false;
  function isChannelMemberSearch(id) {
    const channelId = memberSearchChannels.get(id) ?? id;
    if (typeof channelId !== 'string') return false;
    try {
      const type = getChannel(channelId)?.type;
      return type === 0 || type === 5;
    } catch { return false; }
  }
  function visibleMembers(results) {
    if (!Array.isArray(results) || !results.length) return results;
    if (memberResults.has(results)) return memberResults.get(results);
    const filtered = results.filter(result => !isFilteredUser(result?.record?.id));
    const visible = filtered.length === results.length ? results : filtered;
    memberResults.set(results, visible);
    return visible;
  }
  function attachMemberSearch(module) {
    const store = module?.default ?? module;
    if (typeof store?.getResults !== 'function' || patched.get(store)?.has('getResults')) return;
    const getRawResults = store.getResults;
    patch(store, 'getResults', (object, key) => V.patcher.after(key, object, ([id], results) =>
      isChannelMemberSearch(id) ? visibleMembers(results) : results));
    patch(store, 'getCount', (object, key) => V.patcher.after(key, object, function ([id], count) {
      if (!Number.isFinite(count) || count <= 0 || !isChannelMemberSearch(id)) return count;
      const results = getRawResults.call(this, id);
      if (!Array.isArray(results)) return count;
      return Math.max(0, count - (results.length - visibleMembers(results).length));
    }));
    stores.add(store);
    notify();
  }
  function observeMemberSearch(event) {
    const { type, id, channelId } = event ?? {};
    if (type === 'SEARCH_GUILD_MEMBER_TAB_SEARCH' && typeof id === 'string') {
      // Channel contexts use the channel ID directly. An in: filter can also
      // scope a guild context, and Discord supplies that channel in the action.
      if (typeof channelId === 'string') memberSearchChannels.set(id, channelId);
      else memberSearchChannels.delete(id);
    } else if (type === 'SEARCH_GUILD_MEMBER_TAB_CLEANUP') {
      memberSearchChannels.delete(id);
    } else if (type === 'LOGOUT') {
      memberSearchChannels.clear();
    }
  }
  function patch(object, method, callback) {
    if (stopped || !object || typeof object[method] !== 'function') return;
    const methods = patched.get(object) ?? new Set();
    if (methods.has(method)) return;
    const remove = callback(object, method);
    methods.add(method); patched.set(object, methods); cleanups.push(remove);
  }
  function attachRelationships(module) {
    const store = module?.default ?? module;
    for (const method of ['isBlockedOrIgnored', 'isBlockedOrIgnoredForMessage']) {
      patch(store, method, (object, key) => V.patcher.after(key, object, (_args, result) =>
        !stopped && scope.active() ? false : result));
    }
    // isBlocked/isIgnored and the relationship map are never patched. All checks
    // outside synchronous search work retain Discord's actual relationship.
  }
  function attachStore(module, method) {
    const store = module?.default ?? module;
    patch(store, method, (object, key) => V.patcher.instead(key, object, function (args, original) {
      return stopped ? original.apply(this, args) : scope.run(() => original.apply(this, args));
    }));
    if (store && typeof store[method] === 'function') { stores.add(store); notify(); }
  }
  function attachScreen(module) {
    const component = module?.default ?? module;
    let parent, key;
    // Current AutocompleteScreen is React.memo(function AutocompleteScreen()).
    if (typeof component?.type === 'function') { parent = component; key = 'type'; }
    else if (typeof component?.render === 'function') { parent = component; key = 'render'; }
    else if (typeof module?.default === 'function') { parent = module; key = 'default'; }
    if (parent) patch(parent, key, (object, method) => V.patcher.instead(method, object, function (args, original) {
      // useMemo's author exclusion checks execute synchronously in this render.
      // Event handlers and effects run later, after the exception is removed.
      return stopped ? original.apply(this, args) : scope.run(() => original.apply(this, args));
    }));
  }
  function watch(path, callback) {
    if (typeof V.metro.getModuleWithImportedPath !== 'function') return;
    const remove = V.metro.getModuleWithImportedPath(path, module => { if (!stopped) callback(module); });
    if (typeof remove === 'function') cleanups.push(remove);
  }
  function refresh() {
    for (const store of stores) { try { store.emitChange?.(); } catch {} }
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const cleanup of cleanups.splice(0).reverse()) { try { cleanup(); } catch {} }
    refresh(); stores.clear(); memberSearchChannels.clear();
  }
  try {
    try { attachRelationships(V.metro.findByStoreName?.('RelationshipStore')); } catch {}
    try { attachRelationships(V.metro.findByProps?.('isBlockedOrIgnoredForMessage')); } catch {}
    watch('stores/RelationshipStore.tsx', attachRelationships);
    for (const [name, path, method] of [
      ['SearchMessageStore', 'modules/search/SearchMessageStore.tsx', 'getMessages'],
      ['SearchStore', 'stores/SearchStore.tsx', 'getSearchResults'],
      ['SearchAutocompleteStore', 'modules/search/SearchAutocompleteStore.tsx', 'getState'],
    ]) {
      let store;
      try { store = V.metro.findByStoreName?.(name); } catch {}
      attachStore(store, method);
      watch(path, module => attachStore(module, method));
    }
    if (typeof V.metro.getModuleWithImportedPath === 'function') {
      try { attachMemberSearch(V.metro.findByStoreName?.('SearchGuildMemberTabStore')); } catch {}
      watch('modules/search/native/stores/SearchMemberTabStore.tsx', attachMemberSearch);
    }
    try { attachScreen(V.metro.findByTypeName?.('AutocompleteScreen')); } catch {}
    try { attachScreen(V.metro.findByName?.('AutocompleteScreen', false)); } catch {}
    watch('modules/search/native/components/layout/autocomplete/AutocompleteScreen.tsx', attachScreen);
  } catch (error) { stop(); throw error; }
  return { refresh, clear() { memberResults = new WeakMap(); }, stop,
    dispatch(event, fn) {
      if (stopped) return fn();
      observeMemberSearch(event);
      return scope.dispatch(event, fn);
    } };
}

/* SPDX-License-Identifier: CC0-1.0 */
function createSettings(V, refresh) {
  return function HideBlockedSettings() {
    const { React, ReactNative: RN } = V.metro.common;
    const storage = V.plugin.storage;
    const [, redraw] = React.useState(0);
    const [manageServers, setManageServers] = React.useState(false);
    const [serverInput, setServerInput] = React.useState('');
    const [serverFeedback, setServerFeedback] = React.useState('');
    const [manageIds, setManageIds] = React.useState(false);
    const [input, setInput] = React.useState('');
    const [feedback, setFeedback] = React.useState('');
    const dark = (RN.useColorScheme?.() ?? 'dark') !== 'light';
    const text = dark ? '#f2f3f5' : '#202225';
    const muted = dark ? '#b9bec9' : '#505663';
    const memberListNote = typeof V.metro.getModuleWithImportedPath === 'function' ? ' Hide them in the text channel Members tab and its search results.' : '';
    const rows = [
      ['hideServerPings', 'Hide pings from selected servers', 'Hide their Recent Activity/mentions, mention badges and in-app notification banners. Uses your saved server IDs. OFF restores displayed mentions. Android push notifications while Discord is closed still depend on Discord’s notification settings.'],
      ['hideServerIcons', 'Hide selected server icons', 'ON hides the icons; OFF shows them again immediately. Uses your saved server IDs, including folder previews. This switch works independently of message and channel hiding.'],
      ['hideServerChannels', 'Hide channel lists in selected servers', 'Also hide their text channels, forums, media channels, categories, voice channels and threads from the sidebar. Uses the same server ID list below.'],
      ['hideServers', 'Hide messages from selected servers', 'Hide all chat messages in servers on your server ID list, including threads. Your user whitelist does not override this.'],
      ['blocked', 'Hide blocked users', 'Remove their messages from chat.' + memberListNote + ''],
      ['ignored', 'Hide ignored users', 'Remove their messages from chat.' + memberListNote + ''],
      ['removeMentions', 'Hide mentions of them', 'Remove their @mentions from other people’s messages. The rest of the message stays visible.'],
      ['removeReplies', 'Hide replies to them', 'Also hide messages replying to a blocked or ignored user.'],
      ['removeBotCommands', 'Hide their bot commands', 'Hide bot responses to slash commands and interactions they trigger.'],
      ['whitelistEnabled', 'Show whitelisted users', 'Show selected blocked or ignored users as normal chat messages, without the blocked-message bar. Add their Discord user IDs below.'],
    ];
    const h = React.createElement;
    const serverIds = normalizeServerIds(storage.hiddenServerIds);
    const ids = normalizeWhitelist(storage.whitelistedIds);
    const border = dark ? '#34363c' : '#d5d8df';
    const button = (label, action, props = {}) => h(RN.Pressable, {
      accessibilityRole: 'button', accessibilityLabel: label, onPress: action,
      style: { minHeight: 44, justifyContent: 'center', padding: 12,
        borderWidth: 1, borderColor: border, borderRadius: 8, marginTop: 10 }, ...props,
    }, h(RN.Text, { style: { color: text, fontSize: 15, fontWeight: '600' } }, label));
    function addServers() {
      const parsed = parseServerIds(serverInput);
      if (parsed.invalid.length) { setServerFeedback('Enter valid server IDs (17–20 digits). Nothing was added.'); return; }
      if (!parsed.ids.length) { setServerFeedback('Paste at least one server ID first.'); return; }
      storage.hiddenServerIds = [...new Set([...serverIds, ...parsed.ids])];
      storage.hideServers = true;
      setServerInput(''); setServerFeedback('Server list saved. Messages from these servers are now hidden.');
      redraw(n => n + 1); refresh();
    }
    function removeServer(id) {
      storage.hiddenServerIds = serverIds.filter(value => value !== id);
      setServerFeedback('Server removed. Its messages follow your user hide settings again.');
      redraw(n => n + 1); refresh();
    }
    function addIds() {
      const parsed = parseWhitelistInput(input);
      if (parsed.invalid.length) {
        setFeedback('Enter valid Discord user IDs (17–20 digits) or user mentions. Nothing was added.');
        return;
      }
      if (!parsed.ids.length) { setFeedback('Paste at least one Discord user ID first.'); return; }
      const next = [...new Set([...ids, ...parsed.ids])];
      storage.whitelistedIds = next;
      storage.whitelistEnabled = true;
      setInput(''); setFeedback('Whitelist saved and enabled.');
      redraw(n => n + 1); refresh();
    }
    function removeId(id) {
      storage.whitelistedIds = ids.filter(value => value !== id);
      setFeedback('ID removed. Their messages follow your hide settings again.');
      redraw(n => n + 1); refresh();
    }
    return h(RN.ScrollView, { style: { flex: 1, backgroundColor: dark ? '#18191c' : '#f2f3f5' },
      contentContainerStyle: { padding: 18, paddingBottom: 40 } },
    h(RN.Text, { style: { color: text, fontSize: 22, fontWeight: '700', marginBottom: 10 } }, 'Hide blocked and ignored messages'),
    ...rows.map(([key, label, note]) => h(RN.View, { key, style: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: dark ? '#34363c' : '#d5d8df' } },
    h(RN.View, { style: { flex: 1, paddingRight: 14 } },
      h(RN.Text, { style: { color: text, fontSize: 16, fontWeight: '600' } }, label),
      h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 4 } }, note)),
    h(RN.Switch, { value: key === 'whitelistEnabled' ? storage[key] === true : storage[key] !== false, accessibilityLabel: label,
      onValueChange(value) { storage[key] = value; redraw(n => n + 1); refresh(); } }))),
    button(`Manage hidden server IDs (${serverIds.length})`, () => setManageServers(value => !value),
      { accessibilityState: { expanded: manageServers } }),
    manageServers ? h(RN.View, { style: { marginTop: 12, padding: 14, borderWidth: 1, borderColor: border, borderRadius: 10 } },
      h(RN.Text, { style: { color: text, fontSize: 17, fontWeight: '700' } }, 'Hidden server IDs'),
      h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 6 } },
        'Enable Developer Mode in Discord, then open a server’s menu and copy its server ID. Paste IDs separated by spaces, commas or new lines. This hides messages in that server, not DMs from its members. Channel list hiding uses the switch above. It does not mute notifications or leave the server. Explicit search stays available.'),
      h(RN.TextInput, { value: serverInput, onChangeText: value => { setServerInput(value); setServerFeedback(''); },
        accessibilityLabel: 'Server IDs to hide', placeholder: 'Paste Discord server IDs',
        placeholderTextColor: muted, multiline: true, autoCorrect: false, autoCapitalize: 'none',
        style: { color: text, minHeight: 80, padding: 12, marginTop: 12, textAlignVertical: 'top', borderWidth: 1, borderColor: border, borderRadius: 8 } }),
      button('Add and hide servers', addServers),
      serverFeedback ? h(RN.Text, { accessibilityLiveRegion: 'polite', style: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 10 } }, serverFeedback) : null,
      ...serverIds.map(id => h(RN.View, { key: id, style: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: border } },
        h(RN.Text, { selectable: true, style: { color: text, fontSize: 14 } }, id),
        button('Remove server', () => removeServer(id), { accessibilityLabel: `Remove hidden server ${id}` }))),
      !serverIds.length ? h(RN.Text, { style: { color: muted, fontSize: 13, marginTop: 14 } }, 'No hidden servers. Add a server ID to hide its chat messages.') : null
    ) : null,
    button(`Manage whitelisted IDs (${ids.length})`, () => setManageIds(value => !value),
      { accessibilityState: { expanded: manageIds } }),
    manageIds ? h(RN.View, { style: { marginTop: 12, padding: 14, borderWidth: 1,
      borderColor: border, borderRadius: 10 } },
      h(RN.Text, { style: { color: text, fontSize: 17, fontWeight: '700' } }, 'Whitelisted user IDs'),
      h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 6 } },
        'Paste one or more IDs, separated by spaces, commas or new lines. Add and show enables the whitelist. These users remain blocked or ignored in Discord.'),
      h(RN.TextInput, { value: input, onChangeText: value => { setInput(value); setFeedback(''); },
        accessibilityLabel: 'User IDs to whitelist', placeholder: 'Paste Discord user IDs',
        placeholderTextColor: muted, multiline: true, autoCorrect: false, autoCapitalize: 'none',
        style: { color: text, minHeight: 80, padding: 12, marginTop: 12, textAlignVertical: 'top',
          borderWidth: 1, borderColor: border, borderRadius: 8 } }),
      button('Add and show', addIds),
      feedback ? h(RN.Text, { accessibilityLiveRegion: 'polite', style: {
        color: muted, fontSize: 13, lineHeight: 19, marginTop: 10 } }, feedback) : null,
      ids.length ? ids.map(id => h(RN.View, { key: id, style: { marginTop: 12, paddingTop: 12,
        borderTopWidth: 1, borderTopColor: border } },
        h(RN.Text, { selectable: true, style: { color: text, fontSize: 14 } }, id),
        button('Remove ID', () => removeId(id), { accessibilityLabel: `Remove whitelisted user ${id}` })))
        : h(RN.Text, { style: { color: muted, fontSize: 13, marginTop: 14 } }, 'No whitelisted IDs. All blocked and ignored users follow your hide settings.'),
      h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 14 } },
        'Whitelisted users appear as normal messages, without a blocked-message bar. Keep Hide blocked users and Hide ignored users enabled to hide everyone else.')
    ) : null,
    h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 20, marginTop: 18 } },
      'Message search and from: suggestions can show blocked and ignored users.'),
    h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 20, marginTop: 18 } },
      'Hidden messages leave no replacement text. If an open chat does not refresh, switch channels and return.'),
    h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 20, marginTop: 10 } },
      'Bot filtering needs Discord to identify who triggered the response. Ordinary bot posts without that information stay visible.'),
    h(RN.Text, { style: { color: muted, fontSize: 12, marginTop: 18 } }, `Version ${V.plugin.manifest?.version ?? '1.5.6'}`));
  };
}

/* SPDX-License-Identifier: CC0-1.0 */

// The button and panel belong to this plugin, so Chat Buttons can replay its
// onPress directly. No cross-plugin settings API or navigation route is needed.
function installChatSettings(V, refresh) {
  const { React, ReactNative: RN } = V.metro.common;
  if (!React?.createElement || !RN?.Modal || typeof V.metro.getModuleWithImportedPath !== 'function') return () => {};
  const h = React.createElement, Settings = createSettings(V, refresh);
  const key = 'hide-blocked-and-ignored-messages.settings-button';
  const listeners = new Set(), disposers = [];
  let active = true, attached = false;
  function SettingsIcon(props = {}) {
    let source;
    try { source = V.ui.assets.getAssetIDByName('WrenchIcon'); } catch {}
    return source != null ? h(RN.Image, { source, style: [{ width: 24, height: 24 }, props.style] })
      : h(RN.Text, { style: { fontSize: 22, color: '#b9bec9' } }, '⚙');
  }
  function HiddenSettingsButton() {
    const [open, setOpen] = React.useState(false);
    const [, redraw] = React.useState(0);
    React.useEffect(() => {
      const update = () => redraw(n => n + 1);
      listeners.add(update); return () => listeners.delete(update);
    }, []);
    if (!active) return null;
    const close = () => setOpen(false);
    return h(React.Fragment, null,
      h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Hidden users & servers',
        chatButtonsId: 'dev.fluttershy2008.hide-blocked-and-ignored-messages',
        chatButtonsLabel: 'Hidden users & servers', IconComponent: SettingsIcon,
        onPress() { if (active) setOpen(true); }, testID: 'hide-blocked.settings-button',
        style: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' }, hitSlop: 4 }, h(SettingsIcon)),
      open ? h(RN.Modal, { visible: true, transparent: false, animationType: 'slide',
        presentationStyle: 'fullScreen', onRequestClose: close, testID: 'hide-blocked.settings-panel' },
        h(RN.SafeAreaView ?? RN.View, { style: { flex: 1, backgroundColor: '#18191c' } },
          h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', padding: 16 } },
            h(RN.Text, { style: { color: '#f2f3f5', fontSize: 19, fontWeight: '700', flex: 1 } }, 'Hidden users & servers'),
            h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Close Hidden users & servers',
              onPress: close, hitSlop: 10, style: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' } },
              h(RN.Text, { style: { color: '#f2f3f5', fontSize: 28 } }, '×'))),
          h(Settings))) : null);
  }
  function addButton(tree) {
    if (!React.isValidElement(tree)) return tree;
    const children = React.Children.toArray(tree.props.children);
    if (children.some(child => child?.key === key || String(child?.key ?? '').includes(key))) return tree;
    return React.cloneElement(tree, { children: [...children, h(HiddenSettingsButton, { key })] });
  }
  function attach(module) {
    if (!active || attached || !module?.default) return;
    let owner = module, name = 'default';
    for (let i = 0; i < 8; i++) {
      const component = owner[name];
      if (component?.type) { owner = component; name = 'type'; }
      else if (typeof component?.render === 'function') { owner = component; name = 'render'; break; }
      else if (typeof component?.prototype?.render === 'function') { owner = component.prototype; name = 'render'; break; }
      else break;
    }
    if (typeof owner[name] !== 'function') return;
    disposers.push(V.patcher.after(name, owner, (_args, result) => active ? addButton(result) : result));
    attached = true;
  }
  try {
    const remove = V.metro.getModuleWithImportedPath('modules/chat_input/native/action_buttons/ChatInputRightActions.tsx', attach);
    if (typeof remove === 'function') disposers.push(remove);
  } catch (error) { stop(); throw error; }
  function stop() {
    if (!active) return;
    active = false;
    for (const remove of disposers.splice(0).reverse()) { try { remove(); } catch {} }
    for (const update of listeners) update();
    listeners.clear();
  }
  return stop;
}

/* SPDX-License-Identifier: CC0-1.0 */

function createPlugin(V) {
  let active = false;
  let filter, lists, mentions, pagination, search, channelLists, channelMembers, guildIcons, hiddenPings, messageStore, refreshTimer;
  let warned = false;
  const cleanup = [];
  const byProps = (...props) => { try { return V.metro.findByProps(...props); } catch {} };
  const byStore = name => { try { return V.metro.findByStoreName?.(name); } catch {} };
  const method = (object, name) => { try { return typeof object?.[name] === 'function'; } catch { return false; } };

  function refreshMessages() {
    lists?.clear();
    mentions?.clear();
    search?.clear();
    pagination?.reset();
    if (!active || refreshTimer !== undefined) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      if (!active) return;
      try { messageStore?.emitChange?.(); } catch {}
      search?.refresh();
    }, 0);
  }

  function refresh() {
    refreshMessages();
    channelLists?.refresh();
    channelMembers?.refresh();
    guildIcons?.refresh();
    hiddenPings?.refresh();
  }

  function onLoad() {
    if (active) return;
    const storage = V.plugin.storage;
    for (const key of ['blocked', 'ignored', 'removeReplies', 'removeBotCommands', 'removeMentions']) {
      if (typeof storage[key] !== 'boolean') storage[key] = true;
    }
    if (typeof storage.whitelistEnabled !== 'boolean') storage.whitelistEnabled = false;
    storage.whitelistedIds = normalizeWhitelist(storage.whitelistedIds);
    if (typeof storage.hideServers !== 'boolean') storage.hideServers = true;
    storage.hiddenServerIds = normalizeServerIds(storage.hiddenServerIds);
    if (typeof storage.hideServerPings !== 'boolean') storage.hideServerPings = true;
    if (typeof storage.hideServerIcons !== 'boolean') storage.hideServerIcons = true;
    if (typeof storage.hideServerChannels !== 'boolean') storage.hideServerChannels = true;
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
    const channelStore = byStore('ChannelStore') ?? byProps('getChannel', 'getChannels');
    const getChannel = id => channelStore?.getChannel?.(id);
    const servers = createServerFilter(storage, getChannel);
    const originalGetMessage = messageStore.getMessage.bind(messageStore);
    filter = createMessageFilter({ storage, blockedStore, ignoredStore,
      getMessage: originalGetMessage, isServerMessageHidden: servers.isServerMessageHidden });
    const originalGetMessages = messageStore.getMessages.bind(messageStore);
    const selectedStore = byStore('SelectedChannelStore') ?? byProps('getChannelId', 'getVoiceChannelId');
    const actions = byProps('fetchMessages', 'sendMessage') ?? byProps('fetchMessages');
    pagination = createPagination({ getMessages: originalGetMessages, shouldHide: filter.shouldHide,
      selectedChannel: method(selectedStore, 'getChannelId') ? () => selectedStore.getChannelId() : undefined,
      isChannelHidden: servers.isChannelHidden,
      fetchMessages: method(actions, 'fetchMessages') ? options => actions.fetchMessages(options) : undefined });
    mentions = createMentionFilter(filter.isFilteredUser, storage);
    warned = false;
    lists = createCollectionFilter(filter.shouldHide, () => {
      if (warned) return;
      warned = true;
      try { V.logger?.warn?.('HideBlockedAndIgnoredMessages: unsupported message-list format; please report your Discord version.'); } catch {}
    }, mentions.project);
    active = true;
    try {
      hiddenPings = installHiddenPings(V, servers);
      cleanup.push(hiddenPings.stop);
      cleanup.push(installChatSettings(V, refresh));
      guildIcons = installGuildIcons(V, servers);
      cleanup.push(guildIcons.stop);
      channelLists = installChannelLists(V, servers);
      cleanup.push(channelLists.stop);
      channelMembers = installChannelMemberList(V, getChannel, filter.isFilteredUser);
      cleanup.push(channelMembers.stop);
      cleanup.push(installNativeRows(V, storage, filter.isFilteredUser, servers.isServerMessageHidden));
      search = installSearch(V, refreshMessages, getChannel, filter.isFilteredUser);
      cleanup.push(search.stop);
      // Native rows can resolve content by ID instead of using the list record.
      cleanup.push(V.patcher.after('getMessage', messageStore, (_args, result) => {
        if (!active || pagination.isNative()) return;
        try { return mentions.project(result); } catch { return result; }
      }));
      cleanup.push(V.patcher.after('getMessages', messageStore, ([channelId], result) => {
        if (!active || pagination.isNative()) return;
        try { pagination.consider(channelId); } catch {}
        try {
          return lists.project(result);
        } catch {
          // Preserve Discord's return value on unsupported collection shapes.
          return result;
        }
      }));
      if (method(actions, 'fetchMessages')) {
        cleanup.push(V.patcher.instead('fetchMessages', actions, function (args, original) {
          if (!active) return original.apply(this, args);
          // Keep the original receiver, remaining arguments and return value.
          const next = [...args];
          const paging = pagination;
          let ticket;
          try {
            ticket = paging.manualRequest(args[0]);
            next[0] = paging.repairOptions(args[0]);
          } catch {}
          let result;
          try { result = paging.runNative(() => original.apply(this, next)); }
          catch (error) { paging.finishRequest(ticket, true); throw error; }
          if (result && typeof result.then === 'function') {
            Promise.resolve(result).then(() => paging.finishRequest(ticket), () => paging.finishRequest(ticket, true));
          }
          return result;
        }));
      }
      const dispatcher = V.metro.common.FluxDispatcher;
      if (method(dispatcher, 'dispatch')) {
        // Observe IDs before normalization. Native events stay untouched. Flux
        // subscriptions can read the display list synchronously during dispatch,
        // including when a history action dispatches its loading/success event.
        cleanup.push(V.patcher.instead('dispatch', dispatcher, function (args, original) {
          if (!active) return original.apply(this, args);
          try { filter.observe(args[0]); hiddenPings?.observe(args[0]); } catch {}
          const result = pagination.runDisplay(() => search.dispatch(args[0], () => original.apply(this, args)));
          try { pagination.observe(args[0]); } catch {}
          return result;
        }));
      }
      const relationshipsChanged = () => { refreshMessages(); channelMembers?.refresh(); };
      for (const store of new Set([blockedStore, ignoredStore])) {
        if (method(store, 'addChangeListener') && method(store, 'removeChangeListener')) {
          store.addChangeListener(relationshipsChanged);
          cleanup.push(() => store.removeChangeListener(relationshipsChanged));
        }
      }
      if (method(channelStore, 'addChangeListener') && method(channelStore, 'removeChangeListener')) {
        const changed = () => {
          servers.clearChannels();
          hiddenPings?.invalidate();
          refreshMessages();
        };
        channelStore.addChangeListener(changed);
        cleanup.push(() => channelStore.removeChangeListener(changed));
      }
      refresh();
    } catch (error) { onUnload(); throw error; }
  }

  function onUnload() {
    const wasActive = active;
    active = false;
    pagination?.stop();
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    refreshTimer = undefined;
    for (const remove of cleanup.splice(0).reverse()) { try { remove(); } catch {} }
    filter?.clear(); lists?.clear(); mentions?.clear();
    filter = lists = mentions = pagination = search = channelLists = channelMembers = guildIcons = hiddenPings = undefined;
    if (wasActive) { try { messageStore?.emitChange?.(); } catch {} }
    messageStore = undefined;
  }
  return { onLoad, onUnload, settings: createSettings(V, refresh) };
}

return createPlugin(vendetta);
})()
}, "HideBlockedAndIgnoredMessages");
})()
