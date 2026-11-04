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
/*! HideBlockedAndIgnoredMessages 1.3.1, CC0-1.0.
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
  setTimer = setTimeout, clearTimer = clearTimeout }) {
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
    if (stopped || nativeDepth || !fetchMessages || !id || currentChannel() !== id) return;
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
    if (!id || currentChannel() !== id) return;
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
function projectNativeRows(row, storage, isFilteredUser) {
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
  const filtered = children.map(child => isFilteredUser(child.message.authorId));
  const whitelisted = children.some(child => isUserWhitelisted(storage, child.message.authorId));
  if (!whitelisted && !filtered.some(Boolean)) return [row];
  // Native createRow will assign a consecutive index to each top-level child.
  // Force a native rebind when the prior cached row was a blocked group.
  return children.filter((_child, index) => !filtered[index])
    .map(child => ({ ...child, changeType: 2 }));
}

function installNativeRows(V, storage, isFilteredUser) {
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
      try { rows = projectNativeRows(args[0], storage, isFilteredUser); }
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
function createSettings(V, refresh) {
  return function HideBlockedSettings() {
    const { React, ReactNative: RN } = V.metro.common;
    const storage = V.plugin.storage;
    const [, redraw] = React.useState(0);
    const [manageIds, setManageIds] = React.useState(false);
    const [input, setInput] = React.useState('');
    const [feedback, setFeedback] = React.useState('');
    const dark = (RN.useColorScheme?.() ?? 'dark') !== 'light';
    const text = dark ? '#f2f3f5' : '#202225';
    const muted = dark ? '#b9bec9' : '#505663';
    const rows = [
      ['blocked', 'Hide blocked users', 'Remove their messages from chat.'],
      ['ignored', 'Hide ignored users', 'Remove their messages from chat.'],
      ['removeMentions', 'Hide mentions of them', 'Remove their @mentions from other people’s messages. The rest of the message stays visible.'],
      ['removeReplies', 'Hide replies to them', 'Also hide messages replying to a blocked or ignored user.'],
      ['removeBotCommands', 'Hide their bot commands', 'Hide bot responses to slash commands and interactions they trigger.'],
      ['whitelistEnabled', 'Show whitelisted users', 'Show selected blocked or ignored users as normal chat messages, without the blocked-message bar. Add their Discord user IDs below.'],
    ];
    const h = React.createElement;
    const ids = normalizeWhitelist(storage.whitelistedIds);
    const border = dark ? '#34363c' : '#d5d8df';
    const button = (label, action, props = {}) => h(RN.Pressable, {
      accessibilityRole: 'button', accessibilityLabel: label, onPress: action,
      style: { minHeight: 44, justifyContent: 'center', padding: 12,
        borderWidth: 1, borderColor: border, borderRadius: 8, marginTop: 10 }, ...props,
    }, h(RN.Text, { style: { color: text, fontSize: 15, fontWeight: '600' } }, label));
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
      'Hidden messages leave no replacement text. If an open chat does not refresh, switch channels and return.'),
    h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 20, marginTop: 10 } },
      'Bot filtering needs Discord to identify who triggered the response. Ordinary bot posts without that information stay visible.'),
    h(RN.Text, { style: { color: muted, fontSize: 12, marginTop: 18 } }, `Version ${V.plugin.manifest?.version ?? '1.3.1'}`));
  };
}

/* SPDX-License-Identifier: CC0-1.0 */

function createPlugin(V) {
  let active = false;
  let filter, lists, mentions, pagination, messageStore, refreshTimer;
  let warned = false;
  const cleanup = [];
  const byProps = (...props) => { try { return V.metro.findByProps(...props); } catch {} };
  const byStore = name => { try { return V.metro.findByStoreName?.(name); } catch {} };
  const method = (object, name) => { try { return typeof object?.[name] === 'function'; } catch { return false; } };

  function refresh() {
    lists?.clear();
    mentions?.clear();
    pagination?.reset();
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
    for (const key of ['blocked', 'ignored', 'removeReplies', 'removeBotCommands', 'removeMentions']) {
      if (typeof storage[key] !== 'boolean') storage[key] = true;
    }
    if (typeof storage.whitelistEnabled !== 'boolean') storage.whitelistEnabled = false;
    storage.whitelistedIds = normalizeWhitelist(storage.whitelistedIds);
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
    const originalGetMessage = messageStore.getMessage.bind(messageStore);
    filter = createMessageFilter({ storage, blockedStore, ignoredStore,
      getMessage: originalGetMessage });
    const originalGetMessages = messageStore.getMessages.bind(messageStore);
    const selectedStore = byStore('SelectedChannelStore') ?? byProps('getChannelId', 'getVoiceChannelId');
    const actions = byProps('fetchMessages', 'sendMessage') ?? byProps('fetchMessages');
    pagination = createPagination({ getMessages: originalGetMessages, shouldHide: filter.shouldHide,
      selectedChannel: method(selectedStore, 'getChannelId') ? () => selectedStore.getChannelId() : undefined,
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
      cleanup.push(installNativeRows(V, storage, filter.isFilteredUser));
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
          try { filter.observe(args[0]); } catch {}
          const result = pagination.runDisplay(() => original.apply(this, args));
          try { pagination.observe(args[0]); } catch {}
          return result;
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
    pagination?.stop();
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    refreshTimer = undefined;
    for (const remove of cleanup.splice(0).reverse()) { try { remove(); } catch {} }
    filter?.clear(); lists?.clear(); mentions?.clear();
    filter = lists = mentions = pagination = undefined;
    if (wasActive) { try { messageStore?.emitChange?.(); } catch {} }
    messageStore = undefined;
  }
  return { onLoad, onUnload, settings: createSettings(V, refresh) };
}

return createPlugin(vendetta);
})()
}, "HideBlockedAndIgnoredMessages");
})()
