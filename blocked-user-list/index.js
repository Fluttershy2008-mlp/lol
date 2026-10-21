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
const BLOCKED = 2;
const validID = value => typeof value === 'string' && /^\d{17,20}$/.test(value);

function entries(value) {
  if (value instanceof Map || (value && typeof value.entries === 'function' && !Array.isArray(value))) {
    return Array.from(value.entries());
  }
  if (Array.isArray(value)) return value.map(item => [item?.id ?? item?.user?.id, item?.type]);
  if (value && typeof value === 'object') return Object.entries(value);
  return null;
}

function blockedIDs(store) {
  if (!store) throw new Error('Discord’s blocked-user list is not ready. Tap Refresh to try again.');
  for (const method of ['getRelationships', 'getMutableRelationships']) {
    if (typeof store[method] !== 'function') continue;
    const pairs = entries(store[method]());
    if (pairs) return [...new Set(pairs.filter(([id, value]) => validID(id)
      && Number(value?.type ?? value) === BLOCKED).map(([id]) => id))];
  }
  for (const method of ['getBlockedIDs', 'getBlockedIds']) {
    if (typeof store[method] !== 'function') continue;
    const ids = store[method]();
    if (Array.isArray(ids) || ids instanceof Set) return [...new Set([...ids].filter(validID))];
  }
  throw new Error('This Discord version does not expose its blocked-user list.');
}

function isBlocked(store, id) {
  if (!validID(id)) return false;
  if (typeof store?.isBlocked === 'function') return Boolean(store.isBlocked(id));
  if (typeof store?.getRelationshipType === 'function') return Number(store.getRelationshipType(id)) === BLOCKED;
  return blockedIDs(store).includes(id);
}

function makeRows(ids, getUser) {
  return ids.map(id => {
    let user;
    try { user = getUser?.(id); } catch {}
    const username = typeof user?.username === 'string' ? user.username : '';
    const name = user?.globalName || user?.global_name || username || 'Unknown user';
    const tag = username ? (user.discriminator && user.discriminator !== '0'
      ? `${username}#${user.discriminator}` : `@${username}`) : 'Profile not cached yet';
    const avatar = typeof user?.avatar === 'string' && /^[a-zA-Z0-9_]+$/.test(user.avatar)
      ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.png?size=128` : null;
    return { id, name: String(name), tag, avatar };
  }).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id));
}

function searchRows(rows, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  return needle ? rows.filter(row => `${row.name}\n${row.tag}\n${row.id}`.toLowerCase().includes(needle)) : rows;
}

// Webhook authors are not Discord user accounts. These rules only hide local chat rows.
function normalizeID(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return validID(text) ? text : (text.match(/^<@!?(\d{17,20})>$/)?.[1] ?? '');
}

const appEntryKey = entry => `app:${entry.id}:${entry.name}`;

function appEntries(storage, account) {
  const entries = storage?.appBlocksByAccount?.[account];
  return Array.isArray(entries) ? entries.filter(entry => validID(entry?.id)
    && typeof entry.name === 'string' && entry.name.length <= 128) : [];
}

function shouldHideAppMessage(message, entries) {
  if (!message || !entries.length) return false;
  // Match only the message's own identity, never mentions, replies or command users.
  const ids = [message.author?.id, message.authorId, message.author_id,
    message.webhookId, message.webhook_id, message.applicationId, message.application_id,
    message.application?.id].filter(validID);
  const name = message.author?.username ?? message.username;
  return entries.some(entry => ids.includes(entry.id) && (!entry.name || name === entry.name));
}

// Collection projection reused from ../hide-blocked-and-ignored-messages (CC0-1.0).
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

const SHORTCUT_KEY = 'FLUTTERSHY_BLOCKED_USERS';
const SETTINGS_CONFIG = 'SETTING_RENDERER_CONFIG';
const SHORTCUT_LAYER = Symbol.for('blocked-user-list.settings-layer.v1');

// Settings screens can retain an old list of row keys after a plugin is disabled.
// A hidden renderer keeps those keys valid until Discord recreates the screen.
function hiddenShortcut() {
  return { type: 'pressable', parent: null, title: () => 'Blocked Users',
    useTitle: () => 'Blocked Users', usePredicate: () => false, onPress: () => {}, withArrow: true };
}

function publishRenderer(constants, layer) {
  if (constants[SETTINGS_CONFIG]?.[SHORTCUT_KEY] === layer.record) return true;
  const descriptor = Object.getOwnPropertyDescriptor(constants, SETTINGS_CONFIG);
  if (!descriptor || descriptor.configurable === false) return false;

  let fallback = descriptor.value, hasAssignment = false;
  const readBase = () => descriptor.get && !hasAssignment ? descriptor.get.call(constants) : fallback;
  Object.defineProperty(constants, SETTINGS_CONFIG, {
    configurable: true, enumerable: descriptor.enumerable,
    get: () => ({ ...readBase(), [SHORTCUT_KEY]: layer.record }),
    set(value) {
      if (descriptor.set) descriptor.set.call(constants, value);
      else { fallback = value; hasAssignment = true; }
    },
  });
  return constants[SETTINGS_CONFIG]?.[SHORTCUT_KEY] === layer.record;
}

function attachSettingsShortcut({ api, constants, Settings, open, getAsset, renderIcon,
  patcher, tree, log = () => {} }) {
  const sections = api?.registeredSections;
  const rows = sections && Object.values(sections).find(items => Array.isArray(items)
    && items.some(row => row?.key === 'BUNNY_PLUGINS'));
  if (!rows || !constants) {
    log('Blocked Users shortcut is unavailable; the plugin settings page is still accessible.');
    return () => {};
  }

  let enabled = true, removeGuard, layer, row;
  let icon;
  for (const name of ['UserXIcon', 'FriendsIcon', 'WrenchIcon']) {
    try { icon = getAsset?.(name); if (icon != null) break; } catch {}
  }
  const record = { type: 'pressable', parent: null, title: () => 'Blocked Users',
    useTitle: () => 'Blocked Users', usePredicate: () => enabled,
    icon, IconComponent: icon != null && renderIcon ? () => renderIcon(icon) : undefined,
    onPress: () => { if (enabled) open(); }, withArrow: true };

  try {
    layer = constants[SHORTCUT_LAYER];
    if (!layer) {
      layer = { record };
      Object.defineProperty(constants, SHORTCUT_LAYER, { value: layer, configurable: true });
    } else layer.record = record;
    // Define the native renderer before exposing its key to the settings list.
    if (!publishRenderer(constants, layer)) throw new Error('Native settings renderer cannot be extended.');
    if (typeof patcher?.before === 'function' && typeof tree?.getAncestors === 'function') {
      removeGuard = patcher.before('getAncestors', tree, args => {
        if (enabled && args[0] === SHORTCUT_KEY) {
          try { publishRenderer(constants, layer); } catch (error) { log(error); }
        }
      });
    }
    row = { key: SHORTCUT_KEY, title: record.title, icon, usePredicate: record.usePredicate,
      rawTabsConfig: record, onPress: record.onPress, render: async () => ({ default: Settings }) };
    const previous = rows.findIndex(item => item?.key === SHORTCUT_KEY);
    if (previous >= 0) rows.splice(previous, 1);
    const plugins = rows.findIndex(item => item?.key === 'BUNNY_PLUGINS');
    rows.splice(plugins + 1, 0, row);
  } catch (error) {
    enabled = false;
    if (layer?.record === record) layer.record = hiddenShortcut();
    try { removeGuard?.(); } catch {}
    log(error);
    return () => {};
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true; enabled = false;
    if (layer.record === record) layer.record = hiddenShortcut();
    for (const items of new Set([rows, ...Object.values(sections)])) {
      if (!Array.isArray(items)) continue;
      const index = items.indexOf(row);
      if (index >= 0) { try { items.splice(index, 1); } catch {} }
    }
    try { removeGuard?.(); } catch (error) { log(error); }
  };
}

function createPlugin(V, host = globalThis) {
  const { React, ReactNative: RN } = V.metro.common;
  const h = React.createElement;
  const optional = fn => { try { return fn(); } catch { return undefined; } };
  const byProps = (...keys) => optional(() => V.metro.findByProps(...keys));
  const byStore = name => optional(() => V.metro.findByStoreName?.(name));
  const log = error => optional(() => V.logger?.error?.('Blocked User List', error));
  const toast = message => optional(() => V.ui?.toasts?.showToast?.(message));
  const listeners = new Set();
  const subscriptions = new Set();
  const pending = new Set();
  let active = false, generation = 0;
  let removeShortcut;
  let userStore, relationshipStore, themeStore, profileActions, relationshipActions, blockActions;
  let messageStore, appLists, removeAppFilter, appFilterError;
  const storage = V.plugin?.storage;

  function resolveStores() {
    userStore = byStore('UserStore') ?? byProps('getUser', 'getCurrentUser');
    relationshipStore = byStore('RelationshipStore') ?? byProps('getRelationships', 'isBlocked');
    themeStore = byStore('ThemeStore');
  }
  function currentAccount() { return optional(() => userStore?.getCurrentUser?.()?.id); }
  function token() { return { generation, account: currentAccount() }; }
  function live(value) { return active && value.generation === generation && validID(value.account)
    && currentAccount() === value.account; }
  function emit() { for (const listener of listeners) optional(listener); }
  function key(id, value) { return `${value.generation}:${value.account}:${id}`; }

  function refreshAppMessages() {
    appLists?.clear();
    optional(() => messageStore?.emitChange?.());
    emit();
  }

  function ensureAppFilter() {
    if (removeAppFilter) return true;
    try {
      messageStore = byStore('MessageStore') ?? byProps('getMessages', 'getMessage');
      if (typeof messageStore?.getMessages !== 'function' || typeof V.patcher?.after !== 'function') {
        throw new Error('APP message hiding is unavailable on this Discord build.');
      }
      appLists = createCollectionFilter(message => shouldHideAppMessage(message, appEntries(storage, currentAccount())), () => {
        if (appFilterError) return;
        appFilterError = 'This Discord build uses an unsupported message-list format.';
        log(new Error(appFilterError)); emit();
      });
      const remove = V.patcher.after('getMessages', messageStore, (_args, result) => {
        if (!active) return result;
        try { return appEntries(storage, currentAccount()).length ? appLists.project(result) : result; }
        catch (error) { log(error); return result; }
      });
      if (typeof remove !== 'function') throw new Error('APP message hiding could not be installed.');
      removeAppFilter = remove;
      appFilterError = null;
      return true;
    } catch (error) {
      appFilterError = error?.message ?? String(error); log(error);
      return false;
    }
  }

  function blockApp(rawID, name, value) {
    if (!live(value)) return false;
    try {
      const id = normalizeID(rawID);
      const scopeName = typeof name === 'string' ? name.trim() : '';
      if (!id) throw new Error('Paste the copied APP/webhook user ID (17–20 digits).');
      if (id === value.account) throw new Error('You cannot block your own account.');
      if (scopeName.length > 128) throw new Error('The character name must be 128 characters or fewer.');
      if (!storage) throw new Error('Plugin storage is unavailable. Please restart Revenge.');
      if (!ensureAppFilter()) throw new Error(appFilterError);
      const entry = { id, name: scopeName };
      const entries = appEntries(storage, value.account);
      if (entries.some(item => appEntryKey(item) === appEntryKey(entry))) {
        toast('This APP/webhook is already blocked locally.'); return false;
      }
      // Assign serializable objects so Revenge persists changes across restarts.
      storage.appBlocksByAccount = { ...(storage.appBlocksByAccount ?? {}), [value.account]: [...entries, entry] };
      refreshAppMessages();
      toast('APP/webhook messages hidden on this device');
      return true;
    } catch (error) {
      log(error);
      if (live(value)) RN.Alert.alert('Could not block APP/webhook', error?.message ?? 'Please try again.');
      return false;
    }
  }

  function unblockApp(row, value) {
    if (!live(value) || row.kind !== 'app' || !storage) return false;
    const entries = appEntries(storage, value.account);
    if (!entries.some(entry => appEntryKey(entry) === row.localKey)) return false;
    storage.appBlocksByAccount = { ...(storage.appBlocksByAccount ?? {}),
      [value.account]: entries.filter(entry => appEntryKey(entry) !== row.localKey) };
    refreshAppMessages(); toast('APP/webhook unblocked locally');
    return true;
  }

  function snapshot() {
    resolveStores();
    const value = token();
    try {
      if (!active) throw new Error('Enable Blocked User List from the Plugins page to use it.');
      if (!validID(value.account)) throw new Error('Discord is still loading your account. Tap Refresh to try again.');
      const localRows = appEntries(storage, value.account).map(entry => ({
        id: entry.id, kind: 'app', localKey: appEntryKey(entry), name: entry.name || 'APP / webhook',
        tag: entry.name ? 'Local block · exact character name' : 'Local block · all messages from this ID', avatar: null,
      }));
      return { token: value, rows: [...localRows, ...makeRows(blockedIDs(relationshipStore), id => userStore?.getUser?.(id))],
        appFilterError, error: null };
    } catch (error) { return { token: value, rows: [], error: error?.message ?? String(error) }; }
  }

  function subscribe(listener) {
    if (!active) return () => {};
    resolveStores();
    listeners.add(listener);
    const cleanup = [];
    for (const store of new Set([relationshipStore, userStore, themeStore])) {
      if (typeof store?.addChangeListener !== 'function' || typeof store?.removeChangeListener !== 'function') continue;
      optional(() => {
        store.addChangeListener(listener);
        cleanup.push(() => store.removeChangeListener(listener));
      });
    }
    const dispatcher = V.metro.common.FluxDispatcher;
    if (typeof dispatcher?.subscribe === 'function' && typeof dispatcher?.unsubscribe === 'function') {
      for (const type of ['RELATIONSHIP_ADD', 'RELATIONSHIP_REMOVE', 'CONNECTION_OPEN', 'LOGOUT', 'LOGIN_SUCCESS']) {
        optional(() => {
          dispatcher.subscribe(type, listener);
          cleanup.push(() => dispatcher.unsubscribe(type, listener));
        });
      }
    }
    const app = optional(() => RN.AppState?.addEventListener?.('change', state => {
      if (state === 'active') listener();
    }));
    if (app?.remove) cleanup.push(() => app.remove());
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      listeners.delete(listener);
      subscriptions.delete(dispose);
      for (const fn of cleanup.reverse()) optional(fn);
    };
    subscriptions.add(dispose);
    return dispose;
  }

  async function openProfile(id, value) {
    if (!validID(id) || !live(value)) return;
    try {
      if (!profileActions) {
        for (const method of ['showUserProfile', 'openUserProfile', 'openUserProfileModal']) {
          const module = byProps(method);
          if (typeof module?.[method] === 'function') { profileActions = { module, method }; break; }
        }
      }
      if (!profileActions) throw new Error('Profile buttons are unavailable on this Discord version.');
      // Use Discord’s native profile UI, which loads the current profile itself.
      await profileActions.module[profileActions.method]({ userId: id });
    } catch (error) {
      log(error);
      if (live(value)) RN.Alert.alert('Could not open profile', error?.message ?? 'Please try again.');
    }
  }

  async function unblock(id, value) {
    if (!validID(id) || !live(value)) return false;
    const idKey = key(id, value);
    if (pending.has(idKey)) return false;
    try {
      // Recheck at confirmation time: the account or relationship may have changed.
      if (!isBlocked(relationshipStore, id)) { emit(); return false; }
      relationshipActions ??= byProps('removeRelationship', 'addRelationship') ?? byProps('removeRelationship');
      if (typeof relationshipActions?.removeRelationship !== 'function') {
        throw new Error('Unblocking is unavailable on this Discord version. You can still open the profile.');
      }
      pending.add(idKey); emit();
      const result = await relationshipActions.removeRelationship(id, { location: 'Blocked User List' });
      if (result === false || result?.ok === false || Number(result?.status) >= 400) throw new Error('Discord could not unblock this user. Please try again.');
      if (live(value)) {
        // Keep the row until Discord’s store actually reports the unblock.
        toast(isBlocked(relationshipStore, id) ? 'Unblock requested. Tap Refresh if the list has not updated.' : 'User unblocked');
        emit();
      }
      return true;
    } catch (error) {
      log(error);
      if (live(value)) RN.Alert.alert('Could not unblock user', error?.message ?? 'Please try again.');
      return false;
    } finally { pending.delete(idKey); if (live(value)) emit(); }
  }

  function requestUnblock(row, value) {
    if (!live(value) || !validID(row.id) || pending.has(key(row.id, value))) return;
    if (row.kind === 'app') {
      RN.Alert.alert('Unblock this APP/webhook?', `${row.name}\n${row.id}\n\nIts messages will appear again on this device.`, [
        { text: 'Cancel', style: 'cancel' }, { text: 'Unblock', onPress: () => unblockApp(row, value) },
      ]);
      return;
    }
    RN.Alert.alert('Unblock this user?', `${row.name}\n${row.tag}\n${row.id}\n\nThis removes them from your blocked-user list.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unblock', onPress: () => { void unblock(row.id, value); } },
    ]);
  }

  async function block(rawID, value) {
    if (!live(value)) return false;
    const id = normalizeID(rawID);
    const idKey = key(id, value);
    if (pending.has(idKey)) return false;
    try {
      if (!validID(id)) throw new Error('Paste a Discord user ID containing 17–20 digits.');
      if (id === value.account) throw new Error('You cannot block your own account.');
      resolveStores();
      if (isBlocked(relationshipStore, id)) {
        toast('This user is already blocked.');
        return false;
      }
      blockActions ??= byProps('addRelationship', 'removeRelationship') ?? byProps('addRelationship');
      if (typeof blockActions?.addRelationship !== 'function') {
        throw new Error('Blocking by ID is unavailable on this Discord version.');
      }
      pending.add(idKey); emit();
      // Discord mobile takes an options object. Type 2 is a block, never a friend request.
      const result = await blockActions.addRelationship({ userId: id, type: BLOCKED, location: 'Blocked User List' });
      if (result === false || result?.ok === false || Number(result?.status) >= 400) {
        throw new Error('Discord could not block this user. Check the ID and try again.');
      }
      if (live(value)) {
        // Only Discord's relationship store decides when the new row appears.
        toast(isBlocked(relationshipStore, id) ? 'User blocked' : 'Block requested. Tap Refresh if the list has not updated.');
        emit();
      }
      return true;
    } catch (error) {
      log(error);
      if (live(value)) RN.Alert.alert('Could not block user', error?.message ?? 'Please try again.');
      return false;
    } finally { pending.delete(idKey); if (live(value)) emit(); }
  }

  function Settings() {
    const [query, setQuery] = React.useState('');
    const [revision, update] = React.useState(0);
    const [blockForm, setBlockForm] = React.useState(null);
    const refresh = React.useCallback(() => update(value => value + 1), []);
    const data = snapshot();
    React.useEffect(() => subscribe(refresh), [refresh, data.token.account, generation, userStore, relationshipStore, themeStore]);
    const scheme = typeof RN.useColorScheme === 'function' ? RN.useColorScheme() : 'dark';
    const dark = (optional(() => themeStore?.theme) ?? scheme) !== 'light';
    const c = dark
      ? { bg: '#111214', card: '#202226', text: '#f2f3f5', muted: '#b5bac1', border: '#383a40', accent: '#a7afff', button: '#323743' }
      : { bg: '#f2f3f5', card: '#fff', text: '#1e1f22', muted: '#5c6068', border: '#d4d7dc', accent: '#4752c4', button: '#eef0ff' };
    const Pressable = RN.Pressable ?? RN.TouchableOpacity;
    const text = (value, style = {}, props = {}) => h(RN.Text, { style: { color: c.text, fontSize: 15, lineHeight: 21, ...style }, ...props }, value);
    const button = (label, onPress, disabled = false, extra = {}) => h(Pressable, {
      accessibilityRole: 'button', accessibilityLabel: label,
      accessibilityState: { disabled }, disabled, onPress,
      style: { minHeight: 44, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 8,
        backgroundColor: c.button, opacity: disabled ? 0.5 : 1, alignItems: 'center', justifyContent: 'center', ...extra },
    }, text(label, { color: c.accent, fontWeight: '700' }));
    const rows = searchRows(data.rows, query);
    const form = blockForm && live(blockForm.token) ? blockForm : null;
    const blocking = Boolean(form && pending.has(key(normalizeID(form.id), form.token)));
    const submitBlock = () => {
      if (!form || blocking) return;
      const work = form.mode === 'app' ? Promise.resolve(blockApp(form.id, form.name, form.token)) : block(form.id, form.token);
      void work.then(success => {
        if (success && live(form.token)) setBlockForm(current => current === form ? null : current);
      });
    };
    const header = h(RN.View, { style: { paddingBottom: 14 } },
      text('Blocked User List', { fontSize: 25, lineHeight: 32, fontWeight: '800' }),
      text('Manage blocked users and locally hidden APP/webhook messages.', { color: c.muted, marginTop: 6 }),
      data.appFilterError ? text(data.appFilterError, { color: c.muted, marginTop: 8 }) : null,
      h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 } },
        text(data.error ? 'List unavailable' : `${data.rows.length} blocked ${data.rows.length === 1 ? 'entry' : 'entries'}`, { flex: 1, fontWeight: '700' }),
        button('Refresh', () => { ensureAppFilter(); refreshAppMessages(); refresh(); })),
      h(RN.TextInput, {
        accessibilityLabel: 'Search blocked users by name, username or user ID', value: query, onChangeText: setQuery,
        placeholder: 'Search name, username or ID', placeholderTextColor: c.muted,
        autoCorrect: false, autoCapitalize: 'none', returnKeyType: 'search',
        style: { color: c.text, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 46 },
      }),
      h(RN.View, { style: { marginTop: 12 } },
        button('Block APP / Webhook ID', () => setBlockForm({ id: '', name: '', mode: 'app', token: data.token }), Boolean(data.error) || Boolean(form)),
        h(RN.View, { style: { marginTop: 8 } },
          button('Block User ID', () => setBlockForm({ id: '', mode: 'user', token: data.token }), Boolean(data.error) || Boolean(form))),
        form ? h(RN.View, { style: { backgroundColor: c.card, borderRadius: 10, padding: 12, marginTop: 10 } },
          text(form.mode === 'app' ? 'Block an APP or Tupperbox webhook' : 'Block someone by their user ID', { fontWeight: '700' }),
          text(form.mode === 'app'
            ? 'Copy User ID from the APP/proxy message and paste it here. This hides matching chat messages on this device while this plugin is enabled.'
            : 'Paste their copied Discord user ID below, then tap Block.', { color: c.muted, marginVertical: 8 }),
          h(RN.TextInput, {
            accessibilityLabel: 'User ID to block', value: form.id,
            onChangeText: id => {
              if (live(form.token) && !blocking) setBlockForm(current => current?.token === form.token ? { ...current, id } : current);
            },
            placeholder: 'Paste user ID here', placeholderTextColor: c.muted,
            autoCorrect: false, autoCapitalize: 'none', keyboardType: 'number-pad',
            editable: !blocking, maxLength: 64, returnKeyType: 'done', onSubmitEditing: submitBlock,
            style: { color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 46 },
          }),
          form.mode === 'app' ? h(RN.View, { style: { marginTop: 10 } },
            text('Optional: exact character name', { fontWeight: '700' }),
            text('Tupperbox characters can share an ID. Enter a name such as Allo to hide only that character. Leave blank to hide every message from this ID.', { color: c.muted, marginVertical: 8 }),
            h(RN.TextInput, {
              accessibilityLabel: 'Exact APP character name (optional)', value: form.name,
              onChangeText: name => {
                if (live(form.token)) setBlockForm(current => current?.token === form.token ? { ...current, name } : current);
              },
              placeholder: 'e.g. Allo', placeholderTextColor: c.muted, autoCorrect: false,
              autoCapitalize: 'none', maxLength: 128,
              style: { color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 46 },
            })) : null,
          h(RN.View, { style: { flexDirection: 'row', marginTop: 10 } },
            button('Cancel', () => setBlockForm(null), blocking, { flex: 1, marginRight: 10 }),
            button(blocking ? 'Blocking…' : 'Block', submitBlock, blocking || !form.id.trim(), { flex: 1 })),
        ) : null),
      query.trim() && !data.error ? text(`${rows.length} matching ${rows.length === 1 ? 'user' : 'users'}`, { color: c.muted, marginTop: 10 }) : null,
    );
    return h(RN.FlatList, {
      style: { flex: 1, backgroundColor: c.bg }, contentContainerStyle: { padding: 16, paddingBottom: 60 },
      data: rows, keyExtractor: row => row.localKey ?? row.id, extraData: `${revision}:${query}:${data.token.account}:${generation}`,
      keyboardShouldPersistTaps: 'handled', keyboardDismissMode: 'on-drag',
      initialNumToRender: 12, maxToRenderPerBatch: 12, windowSize: 7,
      ListHeaderComponent: header,
      ListEmptyComponent: text(data.error ?? (query.trim() ? 'No blocked users match your search.' : 'You have no blocked users.'), { color: c.muted, paddingVertical: 20 }),
      renderItem: ({ item: row }) => {
        const busy = pending.has(key(row.id, data.token));
        return h(RN.View, { style: { backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 12 } },
          h(Pressable, { accessibilityRole: 'button', accessibilityLabel: row.kind === 'app' ? `Local APP block ${row.name}` : `Open ${row.name}’s profile`,
            disabled: row.kind === 'app', onPress: () => { void openProfile(row.id, data.token); }, style: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12 } },
            row.avatar ? h(RN.Image, { source: { uri: row.avatar }, style: { width: 46, height: 46, borderRadius: 23, marginRight: 12 } })
              : h(RN.View, { style: { width: 46, height: 46, borderRadius: 23, marginRight: 12, backgroundColor: c.button, alignItems: 'center', justifyContent: 'center' } },
                text(row.name === 'Unknown user' ? '?' : row.name.slice(0, 1).toUpperCase(), { fontSize: 22, fontWeight: '700' })),
            h(RN.View, { style: { flex: 1 } },
              text(row.name, { fontWeight: '700' }, { numberOfLines: 2 }),
              text(row.tag, { color: c.muted, fontSize: 13 }, { numberOfLines: 1 }),
              text(row.id, { color: c.muted, fontSize: 12 }, { selectable: true }))),
          h(RN.View, { style: { flexDirection: 'row' } },
            row.kind !== 'app' ? button('Profile', () => { void openProfile(row.id, data.token); }, false, { flex: 1, marginRight: 10 }) : null,
            button(busy ? 'Updating…' : 'Unblock', () => requestUnblock(row, data.token), busy, { flex: 1 })),
        );
      },
    });
  }

  function openSettings() {
    if (!active) return;
    try {
      const navigation = byProps('getRootNavigationRef')?.getRootNavigationRef?.();
      if (typeof navigation?.navigate !== 'function') throw new Error('Please open Blocked User List’s Configure button on the Plugins page.');
      navigation.navigate('BUNNY_CUSTOM_PAGE', { title: 'Blocked Users', render: Settings });
    } catch (error) { log(error); RN.Alert.alert('Blocked Users', error?.message ?? 'Could not open the list.'); }
  }

  return {
    onLoad() {
      if (active) return;
      active = true; generation++; emit();
      resolveStores(); ensureAppFilter(); refreshAppMessages();
      // Revenge exposes its native settings registry on bunny.ui.settings.
      // Extend the existing section without replacing Plugins, Themes or Account Switcher.
      try {
        removeShortcut = attachSettingsShortcut({
          api: host.bunny?.ui?.settings ?? host.window?.bunny?.ui?.settings,
          constants: byProps('SETTING_RENDERER_CONFIG'), Settings, open: openSettings,
          getAsset: name => V.ui?.assets?.getAssetIDByName?.(name),
          renderIcon: source => {
            const Icon = byProps('TableRowIcon')?.TableRowIcon;
            return Icon ? h(Icon, { source }) : h(RN.Image, { source, style: { width: 24, height: 24 } });
          },
          patcher: V.patcher, tree: byProps('getAncestors', 'isBlocked'), log,
        });
      } catch (error) { log(error); }
    },
    onUnload() {
      active = false; generation++; emit();
      optional(() => removeAppFilter?.()); removeAppFilter = undefined;
      appLists?.clear(); appLists = undefined;
      optional(() => messageStore?.emitChange?.()); messageStore = undefined; appFilterError = null;
      optional(() => removeShortcut?.()); removeShortcut = undefined;
      for (const dispose of [...subscriptions]) dispose();
      listeners.clear(); pending.clear();
      userStore = relationshipStore = themeStore = profileActions = relationshipActions = blockActions = undefined;
    },
    settings: Settings,
    // Kept internal to the evaluated plugin object; Revenge only uses lifecycle/settings.
    controller: { snapshot, subscribe, openProfile, requestUnblock, unblock, block, blockApp, unblockApp, isPending: (id, value) => pending.has(key(id, value)) },
  };
}

return createPlugin(vendetta);
})()
}, "Blocked User List");
})()
