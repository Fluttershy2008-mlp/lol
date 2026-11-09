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
/*! RelationshipNotifier for Revenge 1.2.0
 * Adapted from Vencord RelationshipNotifier by nick, Vendicated and contributors.
 * Mobile adaptation Copyright (c) 2026 Fluttershy2008-mlp.
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Source and license: https://github.com/Fluttershy2008-mlp/lol/tree/main/relationship-notifier
 */
'use strict';
/*
 * RelationshipNotifier for Revenge, adapted from Vencord RelationshipNotifier.
 * Copyright (c) 2023 Vendicated and contributors; original plugin by nick.
 * Mobile adaptation Copyright (c) 2026 Fluttershy2008-mlp.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const DEFAULTS = Object.freeze({
  friends: true, friendRequestCancels: true, servers: true,
  groups: true, offlineRemovals: true, notices: false,
});

const CATEGORIES = ['friends', 'requests', 'guilds', 'groups'];
const OPTIONS = { friends: 'friends', requests: 'friendRequestCancels', guilds: 'servers', groups: 'groups' };

// Format at display time so notifications saved by older versions gain IDs too.
function userMention(entry) {
  const isUser = entry.category === 'friends' || entry.category === 'requests';
  return isUser && typeof entry.id === 'string' && entry.id.length
    ? `<@${entry.id}>` : null;
}

function formatNotification(entry) {
  const mention = userMention(entry);
  return mention ? `${entry.text}\nUser ID: ${mention}` : entry.text;
}

function createTracker({ storage, notify, changed = () => {}, now = Date.now }) {
  let accountId = null;
  if (!storage.options || typeof storage.options !== 'object') storage.options = { ...DEFAULTS };
  if (!storage.accounts || typeof storage.accounts !== 'object') storage.accounts = {};
  const options = () => ({ ...DEFAULTS, ...storage.options });
  const account = id => storage.accounts[id] ?? { snapshots: {}, history: [], manual: {} };
  const save = (id, value) => { storage.accounts = { ...storage.accounts, [id]: value }; };

  function select(id) { accountId = id ? String(id) : null; }
  function markManual(category, id, owner = accountId) {
    if (!owner || !id) return null;
    const key = `${category}:${id}`;
    const data = account(owner);
    const stamp = now();
    // Account-scoped and persisted so a quick reload cannot turn a local action
    // into a removal alert. Failed requests undo their own marker below.
    const token = `${stamp}:${Math.random()}`;
    save(owner, { ...data, manual: { ...data.manual, [key]: { expires: stamp + 120000, token } } });
    return { owner, key, token };
  }

  function cancelManual(marker) {
    if (!marker) return;
    const data = account(marker.owner);
    if (data.manual?.[marker.key]?.token !== marker.token) return;
    const manual = { ...data.manual };
    delete manual[marker.key];
    save(marker.owner, { ...data, manual });
  }

  function completeManual(marker) {
    if (!marker) return;
    const data = account(marker.owner);
    if (data.manual?.[marker.key]?.token !== marker.token) return;
    const [category, id] = marker.key.split(':');
    const snapshots = { ...data.snapshots };
    const categories = category === 'relationships' ? ['friends', 'requests'] : [category];
    for (const key of categories) {
      if (!snapshots[key]) continue;
      snapshots[key] = { ...snapshots[key] };
      delete snapshots[key][id];
    }
    save(marker.owner, { ...data, snapshots });
  }

  function reconcile(snapshot, { offline = false } = {}) {
    if (!snapshot?.accountId) return [];
    select(snapshot.accountId);
    const data = account(accountId);
    const settings = options();
    const old = data.snapshots ?? {};
    const next = { ...old };
    const manual = Object.fromEntries(Object.entries(data.manual ?? {}).filter(([, value]) => value.expires > now()));
    const events = [];
    const unavailable = new Set(snapshot.unavailableIds ?? []);
    for (const category of CATEGORIES) {
      const isOffline = offline === true || Array.isArray(offline) && offline.includes(category);
      // null means unsupported/not ready, never an empty list of memberships.
      if (snapshot[category] == null) continue;
      const current = { ...snapshot[category] };
      if (category === 'guilds') {
        for (const id of unavailable) if (old.guilds?.[id]) current[id] = old.guilds[id];
      }
      if (old[category] && (!isOffline || settings.offlineRemovals) && settings[OPTIONS[category]]) {
        for (const [id, item] of Object.entries(old[category])) {
          if (current[id]) continue;
          const markerKey = `${category === 'friends' || category === 'requests' ? 'relationships' : category}:${id}`;
          if (manual[markerKey]) continue;
          // Accepting a request and blocking are state transitions, not a
          // cancelled request. Blocks never produce an unfriend alert.
          const relation = snapshot.relationshipTypes?.[id];
          if (category === 'requests' && relation && relation !== 3) continue;
          if (category === 'friends' && relation === 2) continue;
          const name = item.name || id;
          const text = category === 'friends' ? `You are no longer friends with ${name}.`
            : category === 'requests' ? `The friend request from ${name} is no longer pending.`
            : category === 'guilds' ? `You are no longer in the server ${name}.`
            : `You are no longer in the group ${name}.`;
          events.push({ id, category, name, text, at: now(), offline: isOffline, icon: item.icon ?? null });
        }
      }
      next[category] = current;
    }
    // Save before delivering alerts. A UI failure or reload must not replay the
    // same event, and history remains available when Android suspends the app.
    const history = [...events].reverse().concat(Array.isArray(data.history) ? data.history : []).slice(0, 100);
    save(accountId, { snapshots: next, history, manual, updatedAt: now() });
    changed();
    if (events.length) notify(events, settings);
    return events;
  }

  return {
    select, options, reconcile, markManual, cancelManual, completeManual,
    getAccountId: () => accountId,
    history: () => accountId ? (account(accountId).history ?? []) : [],
    counts: () => Object.fromEntries(CATEGORIES.map(key => [key, Object.keys(accountId ? account(accountId).snapshots?.[key] ?? {} : {}).length])),
    setOption(key, value) {
      if (!(key in DEFAULTS)) return;
      storage.options = { ...options(), [key]: Boolean(value) };
      changed();
    },
    clearHistory() {
      if (!accountId) return;
      save(accountId, { ...account(accountId), history: [] });
      changed();
    },
  };
}


/* SPDX-License-Identifier: GPL-3.0-or-later */

const HISTORY_FILTERS = [['all', 'All'], ['friends', 'Friends'], ['requests', 'Requests'], ['guilds', 'Servers'], ['groups', 'Groups']];
const HISTORY_LABELS = { friends: 'Lost friend', requests: 'Request cancelled', guilds: 'Server removal', groups: 'Group removal' };

function createSettings({ React, RN, tracker, getStatus, subscribe, testNotification, getTheme, copyMention, openProfile }) {
  const h = React.createElement;
  const Pressable = RN.Pressable ?? RN.TouchableOpacity;
  const choices = [
    ['friends', 'Lost friends', 'When someone leaves your friends list.'],
    ['friendRequestCancels', 'Cancelled requests', 'When an incoming request disappears.'],
    ['servers', 'Server removals', 'When you are no longer in a server.'],
    ['groups', 'Group removals', 'When you are no longer in a group DM.'],
    ['offlineRemovals', 'Check after reconnecting', 'Include changes made while Discord was offline.'],
    ['notices', 'Persistent popup', 'Keep an alert visible until you dismiss it.'],
  ];

  return function RelationshipNotifierSettings() {
    const [, refresh] = React.useState(0);
    const [view, setView] = React.useState({ owner: tracker.getAccountId(), filter: 'all', query: '', limit: 20 });
    React.useEffect(() => subscribe(() => refresh(value => value + 1)), []);
    const scheme = typeof RN.useColorScheme === 'function' ? RN.useColorScheme() : 'dark';
    const dark = (getTheme() ?? scheme) !== 'light';
    const colors = dark
      ? { bg: '#15161b', card: '#22242c', inset: '#1b1d24', text: '#f3f4fa', muted: '#adb3c4', accent: '#a7afff', selected: '#343c69', border: '#353947', green: '#88dfb0', danger: '#ffb0b9' }
      : { bg: '#f2f3f8', card: '#ffffff', inset: '#e9ecf5', text: '#202332', muted: '#596277', accent: '#454fbd', selected: '#e4e7ff', border: '#d7dce8', green: '#206d48', danger: '#b12d46' };
    const text = (value, style = {}, props = {}) => h(RN.Text, { ...props, style: { color: colors.text, fontSize: 15, lineHeight: 21, ...style } }, value);
    const note = (value, style = {}) => text(value, { color: colors.muted, fontSize: 13, lineHeight: 19, ...style });
    const card = { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' };
    const button = (label, onPress, props = {}) => h(Pressable, {
      accessibilityRole: 'button', accessibilityLabel: label, onPress,
      ...props, style: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, backgroundColor: colors.inset, ...props.style },
    }, text(label, { color: colors.accent, fontWeight: '700', textAlign: 'center', fontSize: 13 }));
    const heading = (title, detail) => h(RN.View, { style: { marginTop: 24, marginBottom: 10 } },
      text(title, { fontSize: 18, lineHeight: 24, fontWeight: '800' }), detail ? note(detail, { marginTop: 3 }) : null);
    const status = getStatus();
    const options = tracker.options();
    const history = tracker.history();
    const counts = tracker.counts();
    const owner = tracker.getAccountId();
    // Account changes must never keep a previous account's search or pagination.
    const activeQuery = view.owner === owner ? view.query : '';
    const activeFilter = view.owner === owner ? view.filter : 'all';
    const updateSearch = (nextFilter, nextQuery) => {
      setView({ owner, filter: nextFilter, query: nextQuery, limit: 20 });
    };
    const term = activeQuery.trim().toLocaleLowerCase();
    const filtered = history.filter(entry => (activeFilter === 'all' || entry.category === activeFilter)
      && (!term || [entry.name, entry.id, entry.text, HISTORY_LABELS[entry.category]].some(value => String(value ?? '').toLocaleLowerCase().includes(term))));
    const limit = view.owner === owner ? view.limit : 20;
    const visible = filtered.slice(0, limit);
    const colorFor = category => category === 'friends' ? colors.danger : category === 'requests' ? colors.accent : colors.green;
    let lastDay = null;
    const historyNodes = visible.map((entry, index) => {
      const date = new Date(entry.at);
      const day = Number.isNaN(date.getTime()) ? 'Earlier' : date.toLocaleDateString();
      const dayHeading = day !== lastDay ? note(day, { fontWeight: '700', marginTop: 14, marginBottom: 8 }) : null;
      lastDay = day;
      const mention = userMention(entry);
      return h(RN.View, { key: `${entry.at}:${entry.category}:${entry.id}:${index}` }, dayHeading,
        h(RN.View, { style: { ...card, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: colorFor(entry.category) } },
          h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 } },
            entry.icon && RN.Image ? h(RN.Image, { source: { uri: entry.icon }, accessibilityIgnoresInvertColors: true, style: { width: 36, height: 36, borderRadius: 12, marginRight: 10 } })
              : h(RN.View, { style: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.inset, alignItems: 'center', justifyContent: 'center', marginRight: 10 } }, text((entry.name || '?').slice(0, 1).toUpperCase(), { color: colorFor(entry.category), fontWeight: '800' })),
            h(RN.View, { style: { flex: 1 } }, text(entry.name || HISTORY_LABELS[entry.category] || 'Relationship change', { fontWeight: '700' }),
              note(HISTORY_LABELS[entry.category] || 'Relationship change', { color: colorFor(entry.category), fontSize: 12 }))),
          text(entry.text),
          mention ? h(Pressable, {
            accessibilityRole: 'button', accessibilityLabel: `Open profile for ${entry.name || entry.id}`,
            accessibilityHint: 'Opens the Discord profile. Long-press to copy the user mention.',
            onPress: () => openProfile(entry.id), onLongPress: () => copyMention(mention), style: { paddingVertical: 10, minHeight: 44 },
          }, text(`User ID: ${mention}`, { color: colors.accent, fontSize: 13 }, { selectable: true }), text('View profile ›', { color: colors.accent, fontWeight: '700', fontSize: 13 })) : null,
          mention ? button('Copy mention', () => copyMention(mention), { accessibilityLabel: `Copy ${mention}`, style: { alignSelf: 'flex-start', marginBottom: 10 } }) : null,
          note(`${Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${entry.offline ? ' · After reconnecting' : ' · While connected'}`, { fontSize: 12 }),
        ));
    });
    const rows = list => h(RN.View, { style: card }, ...list.map(([key, title, detail], index) => h(RN.View, {
      key, style: { paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: index ? 1 : 0, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center' },
    }, h(RN.View, { style: { flex: 1, paddingRight: 12 } }, text(title, { fontWeight: '700' }), note(detail, { marginTop: 3 })),
    h(RN.Switch, { accessibilityLabel: title, value: Boolean(options[key]), onValueChange: value => tracker.setOption(key, value), trackColor: { true: '#5865f2', false: colors.border } }))));

    return h(RN.ScrollView, { style: { flex: 1, backgroundColor: colors.bg }, keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: 16, paddingBottom: 80 } },
      text('Relationship Notifier', { fontSize: 26, lineHeight: 32, fontWeight: '800' }),
      note('Your friends, requests and communities — in one place.', { marginTop: 4 }),
      h(RN.View, { style: { ...card, padding: 16, marginTop: 16 } },
        h(RN.View, { style: { flexDirection: 'row', alignItems: 'center' } },
          h(RN.View, { style: { width: 8, height: 8, borderRadius: 4, backgroundColor: status.message.startsWith('Monitoring') ? colors.green : colors.muted, marginRight: 8 } }),
          text(status.message, { fontWeight: '700', fontSize: 13, flex: 1 }, { accessibilityLiveRegion: 'polite' })),
        h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 } },
          ...[['friends', 'Friends'], ['requests', 'Requests'], ['guilds', 'Servers'], ['groups', 'Groups']].map(([key, label]) => h(RN.View, { key, style: { width: '50%', padding: 8 } },
            text(String(counts[key]), { fontSize: 24, lineHeight: 30, fontWeight: '800' }), note(label)))),
        ...status.warnings.map((warning, i) => h(RN.View, { key: i, style: { marginTop: 8 } }, note(warning, { color: colors.danger }))),
      ),
      heading('What to watch', 'Choose which changes send you an alert.'), rows(choices.slice(0, 4)),
      heading('How to notify'), rows(choices.slice(4)),
      button('Test notification', testNotification, { style: { backgroundColor: colors.selected, marginTop: 12 } }),
      heading('Recent notifications', `${history.length} / 100 saved · Current account only`),
      RN.TextInput ? h(RN.TextInput, {
        accessibilityLabel: 'Search notification history', placeholder: 'Search names, IDs or notifications', placeholderTextColor: colors.muted,
        value: activeQuery, onChangeText: value => updateSearch(activeFilter, value), autoCorrect: false, autoCapitalize: 'none', clearButtonMode: 'while-editing',
        style: { color: colors.text, backgroundColor: colors.card, borderRadius: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
      }) : null,
      h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 } }, ...HISTORY_FILTERS.map(([key, label]) => button(label, () => updateSearch(key, activeQuery), {
        key, accessibilityLabel: `Filter ${label.toLowerCase()} notifications`, accessibilityState: { selected: activeFilter === key },
        style: { backgroundColor: activeFilter === key ? colors.selected : colors.card, marginRight: 6, marginBottom: 6 },
      }))),
      activeQuery ? button('Clear search', () => updateSearch(activeFilter, '')) : null,
      filtered.length ? note(`Showing ${Math.min(limit, filtered.length)} of ${filtered.length}`, { marginTop: 8 }) : h(RN.View, { style: { ...card, padding: 20, marginTop: 12 } },
        text(history.length ? 'No matching notifications' : 'All quiet for now', { fontWeight: '700', textAlign: 'center' }),
        note(history.length ? 'Try another search or category.' : 'Your first check saves a starting list. Future changes appear here.', { textAlign: 'center', marginTop: 6 })),
      ...historyNodes,
      filtered.length > limit ? button('Show more notifications', () => setView({ owner, filter: activeFilter, query: activeQuery, limit: limit + 20 }), { style: { marginTop: 8 } }) : null,
      history.length ? button('Clear notification history', () => RN.Alert.alert('Clear history?', 'This removes the saved notifications for this account.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => { if (tracker.getAccountId() === owner) tracker.clearHistory(); } },
      ]), { style: { marginTop: 16 } }) : null,
      note('Alerts appear inside Discord. Reconnect checks catch changes while you were away. Discord does not reveal whether a server removal was a kick, ban or deletion.', { marginTop: 20 }),
      note('Version 1.2.0 · Adapted from Vencord by nick and contributors · GPL-3.0-or-later', { fontSize: 11, marginTop: 16 }),
    );
  };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */

const SHORTCUT_KEY = 'RELATIONSHIP_NOTIFIER_FLUTTERSHY_SETTINGS';
const CONFIG = 'SETTING_RENDERER_CONFIG';
const BRIDGE = Symbol.for('relationship-notifier.settings.renderer.v1');
const HIDDEN_ROW = Object.freeze({
  type: 'pressable', parent: null, title: () => 'RelationshipNotifier', useTitle: () => 'RelationshipNotifier',
  usePredicate: () => false, onPress: () => {}, withArrow: true,
});

// Keep the native renderer and the menu row in sync. Other sidebar plugins may
// have replaced Revenge's dynamic getter with a captured renderer map.
function connectSettingsRenderer(constants, renderer) {
  if (!constants) return undefined;
  let state;
  try {
    state = constants[BRIDGE];
    if (!state) {
      state = { row: HIDDEN_ROW, getter: undefined };
      Object.defineProperty(constants, BRIDGE, { value: state, configurable: true });
    }
  } catch { return undefined; }

  function ensure() {
    try {
      const previous = Object.getOwnPropertyDescriptor(constants, CONFIG);
      // Another plugin can wrap our getter and still preserve this entry. Do
      // not keep wrapping each other on every settings row render.
      if (constants[CONFIG]?.[SHORTCUT_KEY] === state.row) return true;
      if (previous?.configurable === false) return false;

      // Call the prior accessor on each read. Taking a snapshot here would hide
      // later rows from Revenge or other plugins, recreating this crash.
      let assigned = false, value = previous?.value ?? constants[CONFIG];
      const getter = () => ({
        ...(previous?.get && !assigned ? previous.get.call(constants) : value),
        [SHORTCUT_KEY]: state.row,
      });
      Object.defineProperty(constants, CONFIG, {
        configurable: true, enumerable: previous?.enumerable ?? true,
        get: getter,
        set(next) {
          if (previous?.set) previous.set.call(constants, next);
          else { assigned = true; value = next; }
        },
      });
      state.getter = getter;
      return constants[CONFIG][SHORTCUT_KEY] === state.row;
    } catch { return false; }
  }

  state.row = renderer;
  if (!ensure()) { state.row = HIDDEN_ROW; return undefined; }
  return {
    ensure,
    release() {
      if (state.row === renderer) state.row = HIDDEN_ROW;
      // Native settings can retain an old array of keys while the screen is
      // open. A hidden, parentless record keeps those keys valid after unload.
      // Reuse this one bridge on re-enable rather than stacking new accessors.
    },
  };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */


// Revenge exposes this registry at bunny.ui.settings.registeredSections.
// Extend the existing section; registerSection("Revenge") would replace its rows.
function registerSettingsShortcut({ settingsAPI, Settings, constants, treeManager, patcher,
  openSettings, renderIcon, getAssetID, log = () => {} }) {
  const sections = settingsAPI?.registeredSections;
  if (!sections || typeof sections !== 'object') {
    log('Settings shortcut is unavailable on this Revenge version. Use the plugin settings button.');
    return () => {};
  }
  // Match stable row keys so the shortcut also works with translated headings.
  const rows = Object.values(sections).find(items => Array.isArray(items)
    && items.some(item => item?.key === 'BUNNY_PLUGINS'));
  if (!rows || rows.some(item => item?.key === SHORTCUT_KEY)) return () => {};

  let icon;
  for (const name of ['FriendsIcon', 'BellIcon', 'WrenchIcon']) {
    try {
      const id = getAssetID?.(name);
      if (id != null) { icon = id; break; }
    } catch {}
  }
  let active = true;
  const renderer = {
    type: 'pressable', parent: null,
    title: () => 'RelationshipNotifier', useTitle: () => 'RelationshipNotifier', icon,
    IconComponent: icon != null && renderIcon ? () => renderIcon(icon) : undefined,
    usePredicate: () => active,
    onPress: () => { if (active) openSettings?.(); },
    withArrow: true,
  };
  // Do this BEFORE exposing the key in registeredSections. Otherwise Discord's
  // getAncestors reads .parent on an undefined renderer and crashes Settings.
  const bridge = connectSettingsRenderer(constants, renderer);
  if (!bridge) {
    active = false;
    log('Could not register a native settings row safely. Use the plugin settings button.');
    return () => {};
  }
  let unpatch;
  try {
    if (typeof treeManager?.getAncestors === 'function' && typeof patcher?.before === 'function') {
      unpatch = patcher.before('getAncestors', treeManager, args => {
        // Repair only our own entry if another plugin replaces the renderer
        // accessor later. Let the original tree/blocking logic run unchanged.
        if (args[0] === SHORTCUT_KEY) bridge.ensure();
      });
    }
  } catch {}
  const row = {
    key: SHORTCUT_KEY,
    title: () => 'RelationshipNotifier',
    icon,
    usePredicate: renderer.usePredicate,
    rawTabsConfig: renderer,
    // Revenge supplies the native screen header, navigation and back button.
    render: async () => ({ default: Settings }),
  };
  try {
    const customRPC = rows.findIndex(item => item?.key === 'CUSTOMRPC_FLUTTERSHY_SETTINGS');
    const anchor = customRPC >= 0 ? customRPC : rows.findIndex(item => item?.key === 'BUNNY_PLUGINS');
    rows.splice(anchor + 1, 0, row);
  } catch {
    active = false; unpatch?.(); bridge.release();
    log('Could not add the settings shortcut. Use the plugin settings button.');
    return () => {};
  }

  return () => {
    active = false;
    // Some plugins replace the section array. Remove our row wherever it moved,
    // retaining every other row (including Account Switcher from the screenshot).
    for (const items of new Set([rows, ...Object.values(sections)])) {
      if (!Array.isArray(items)) continue;
      const index = items.indexOf(row);
      if (index !== -1) {
        try { items.splice(index, 1); } catch {}
      }
    }
    unpatch?.(); unpatch = undefined;
    bridge.release();
  };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */

function createPlugin(V, clock = { now: Date.now, setTimeout, clearTimeout, setInterval, clearInterval }, host = globalThis) {
  if (!V?.metro?.common || !V?.plugin?.storage) throw new Error('RelationshipNotifier requires Revenge Vendetta plugin support.');
  const { React, ReactNative: RN } = V.metro.common;
  const byProps = (...keys) => { try { return V.metro.findByProps(...keys); } catch { return undefined; } };
  const byStore = name => { try { return V.metro.findByStoreName(name); } catch { return undefined; } };
  const log = error => { try { V.logger?.warn?.('[RelationshipNotifier]', error?.message ?? String(error)); } catch {} };
  const listeners = new Set();
  const disposers = [];
  const unavailable = new Set();
  let running = false, timer = null, interval = null, connectedByEvent = false, paused = false;
  let offlinePending = new Set(['friends', 'requests', 'guilds', 'groups']), readyAfter = 0, activeAccount = null, generation = 0;
  let status = { message: 'Waiting for Discord to connect…', warnings: [] };
  let stores = {}, dispatcher, icon;
  const changed = () => { for (const listener of listeners) { try { listener(); } catch {} } };
  const setStatus = message => { status = { ...status, message }; changed(); };
  const tracker = createTracker({ storage: V.plugin.storage, notify: deliver, changed, now: clock.now });

  function deliver(events, options) {
    if (!running || !events.length) return;
    const body = events.length === 1 ? formatNotification(events[0]) : `${events.length} relationship changes detected. Open RelationshipNotifier settings to see them.`;
    let shown = false;
    try {
      if (typeof V.ui?.toasts?.showToast === 'function') {
        V.ui.toasts.showToast(body, icon);
        shown = true;
      }
    } catch (error) { log(error); }
    if (options.notices || !shown) {
      try {
        const detail = events.slice(0, 5).map(formatNotification).join('\n\n') + (events.length > 5 ? `\n\nAnd ${events.length - 5} more. See notification history.` : '');
        RN.Alert.alert('RelationshipNotifier', detail);
      } catch (error) { log(error); }
    }
  }

  function currentUserId() {
    try { return stores.UserStore?.getCurrentUser?.()?.id || null; } catch { return null; }
  }

  function isConnected() {
    if (paused) return false;
    try {
      if (typeof stores.ConnectionStore?.isConnected === 'function') return Boolean(stores.ConnectionStore.isConnected());
    } catch { return false; }
    return connectedByEvent;
  }

  function entries(value) {
    if (value == null || typeof value !== 'object') throw new Error('Discord list is not ready.');
    if (value instanceof Map || typeof value.entries === 'function' && !Array.isArray(value)) return Array.from(value.entries());
    if (Array.isArray(value)) return value.map(item => [item?.id ?? item, item]);
    return Object.entries(value);
  }

  function readFirst(store, names) {
    for (const name of names) {
      try {
        if (typeof store?.[name] !== 'function') continue;
        const value = store[name]();
        if (value != null) return entries(value);
      } catch {}
    }
    return null;
  }

  function userInfo(id, embedded) {
    let user = embedded;
    try { user = stores.UserStore?.getUser?.(id) ?? embedded; } catch {}
    const suffix = user?.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : '';
    let icon = null;
    try {
      if (typeof user?.getAvatarURL === 'function') icon = user.getAvatarURL(undefined, 64, false);
    } catch {}
    if (typeof icon !== 'string' || !/^https:\/\//.test(icon)) {
      icon = user?.avatar ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.png?size=64` : null;
    }
    return { name: user?.username ? `${user.username}${suffix}` : user?.globalName ?? user?.global_name ?? id, icon };
  }

  function snapshot() {
    const accountId = currentUserId();
    if (!accountId) return null;
    const result = { accountId: String(accountId), friends: null, requests: null, guilds: null, groups: null, relationshipTypes: {}, unavailableIds: [] };
    const relations = readFirst(stores.RelationshipStore, ['getRelationships', 'getMutableRelationships']);
    if (relations) {
      result.friends = {}; result.requests = {};
      for (const [key, relation] of relations) {
        const id = String(relation?.id ?? relation?.user?.id ?? key);
        const type = Number(typeof relation === 'object' ? relation.type : relation);
        result.relationshipTypes[id] = type;
        if (type === 1 || type === 3) result[type === 1 ? 'friends' : 'requests'][id] = { id, ...userInfo(id, relation?.user) };
      }
    }
    const guilds = readFirst(stores.GuildStore, ['getGuilds']);
    if (guilds) {
      result.guilds = {};
      for (const [key, guild] of guilds) {
        const id = String(guild?.id ?? key);
        if (guild?.unavailable) { unavailable.add(id); continue; }
        if (!guild || typeof guild !== 'object' || guild.isMember === false) continue;
        result.guilds[id] = { id, name: guild.name || id, icon: guild.icon ? `https://cdn.discordapp.com/icons/${id}/${guild.icon}.png?size=64` : null };
      }
    }
    const privateChannels = readFirst(stores.ChannelStore, ['getPrivateChannels', 'getSortedPrivateChannels', 'getMutablePrivateChannels']);
    if (privateChannels) {
      result.groups = {};
      for (const [key, raw] of privateChannels) {
        const id = String(raw?.id ?? key);
        let channel = raw;
        try { channel = stores.ChannelStore.getChannel?.(id) ?? raw; } catch {}
        if (Number(channel?.type) !== 3) continue;
        const recipients = channel.rawRecipients ?? channel.recipients ?? [];
        const names = Array.isArray(recipients) ? recipients.map(user => userInfo(String(user?.id ?? user), typeof user === 'object' ? user : null).name) : [];
        result.groups[id] = { id, name: channel.name || names.join(', ') || 'Unnamed group', icon: channel.icon ? `https://cdn.discordapp.com/channel-icons/${id}/${channel.icon}.png?size=64` : null };
      }
    }
    // Preserve unavailable servers even when GuildStore temporarily drops them.
    const knownGuildIds = Object.keys(V.plugin.storage.accounts?.[result.accountId]?.snapshots?.guilds ?? {});
    for (const id of knownGuildIds) {
      try { if (stores.GuildAvailabilityStore?.isUnavailable?.(id)) unavailable.add(id); } catch {}
    }
    result.unavailableIds = Array.from(unavailable);
    return result;
  }

  function check() {
    if (!running) return;
    const owner = currentUserId();
    if (String(owner) !== activeAccount) {
      activeAccount = owner ? String(owner) : null;
      tracker.select(activeAccount);
      offlinePending = new Set(['friends', 'requests', 'guilds', 'groups']);
      readyAfter = Math.max(readyAfter, clock.now() + 5000);
      unavailable.clear();
      setStatus('Waiting for Discord to connect…');
    }
    if (!owner || !isConnected()) { setStatus('Waiting for Discord to connect…'); return; }
    if (clock.now() < readyAfter) { schedule(readyAfter - clock.now()); return; }
    try {
      const data = snapshot();
      if (!data || data.accountId !== activeAccount) return;
      const warnings = [];
      if (data.friends == null) warnings.push('Friend tracking is unavailable on this Discord version.');
      if (data.guilds == null) warnings.push('Server tracking is unavailable on this Discord version.');
      if (data.groups == null) warnings.push('Group tracking is unavailable on this Discord version.');
      status = { ...status, warnings: [...new Set([...hookWarnings, ...warnings])] };
      tracker.reconcile(data, { offline: Array.from(offlinePending) });
      for (const category of Array.from(offlinePending)) if (data[category] != null) offlinePending.delete(category);
      setStatus(warnings.length === 3 ? 'Waiting for Discord lists to load…' : 'Monitoring relationship changes');
    } catch (error) {
      log(error);
      setStatus('Waiting for Discord lists to load…');
    }
  }

  function schedule(delay = 750) {
    if (!running) return;
    if (timer != null) clock.clearTimeout(timer);
    const run = generation;
    timer = clock.setTimeout(() => { timer = null; if (running && run === generation) check(); }, Math.max(delay, readyAfter - clock.now()));
  }

  function subscribeEvent(type, handler) {
    const safe = event => {
      if (!running) return;
      try { handler(event ?? {}); } catch (error) { log(error); }
    };
    dispatcher.subscribe(type, safe);
    disposers.push(() => dispatcher.unsubscribe(type, safe));
  }

  function readId(args) {
    const first = args[0];
    if (typeof first === 'string') return first;
    return first?.userId ?? first?.user_id ?? first?.guildId ?? first?.guild_id ?? first?.channelId ?? first?.channel_id ?? first?.id;
  }

  const patched = new WeakMap();
  const hookWarnings = [];
  function patchAction(target, key, identify) {
    if (!target || typeof target[key] !== 'function' || typeof V.patcher?.instead !== 'function') return false;
    if (patched.get(target)?.has(key)) return true;
    try {
      const unpatch = V.patcher.instead(key, target, (args, original) => {
        let marker = null;
        const run = generation;
        try {
          const action = identify(args);
          const owner = currentUserId();
          if (running && action?.id && owner) marker = tracker.markManual(action.category, String(action.id), String(owner));
        } catch (error) { log(error); }
        const complete = () => { if (running && run === generation) { try { tracker.completeManual(marker); } catch (error) { log(error); } } };
        const cancel = () => { try { tracker.cancelManual(marker); } catch (error) { log(error); } };
        try {
          const result = original(...args);
          // Observe, but return the exact original Promise/value to Discord.
          if (result && typeof result.then === 'function') result.then(complete, cancel);
          return result;
        } catch (error) { cancel(); throw error; }
      });
      if (!patched.has(target)) patched.set(target, new Set());
      patched.get(target).add(key);
      disposers.push(() => { unpatch(); patched.get(target)?.delete(key); });
      return true;
    } catch (error) { log(error); return false; }
  }

  function patchManualActions() {
    const capabilities = { relationships: false, guilds: false, groups: false };
    for (const [key, category] of [
      ['removeRelationship', 'relationships'], ['addRelationship', 'relationships'],
      ['acceptFriendRequest', 'relationships'], ['rejectFriendRequest', 'relationships'], ['blockUser', 'relationships'],
      ['leaveGuild', 'guilds'], ['closePrivateChannel', 'groups'],
    ]) {
      const target = byProps(key);
      if (patchAction(target, key, args => ({ category, id: readId(args) }))) capabilities[category] = true;
    }
    // The normal REST client also covers Discord builds where action modules
    // have moved. This observes existing calls; the plugin sends no requests.
    const api = byProps('getAPIBaseURL', 'get');
    let hasDeleteHook = false, hasPutHook = false;
    for (const key of ['del', 'delete', 'put']) {
      const hooked = patchAction(api, key, args => {
        const request = args[0];
        const path = (typeof request === 'string' ? request : request?.url)?.split('?')[0]?.replace(/\/$/, '');
        if (!path) return null;
        const relationship = /\/users\/@me\/relationships\/([0-9]+)$/.exec(path);
        if (relationship) return { category: 'relationships', id: relationship[1] };
        if (key === 'put') return null;
        const guild = /\/users\/@me\/guilds\/([0-9]+)$/.exec(path);
        if (guild) return { category: 'guilds', id: guild[1] };
        const channel = /\/channels\/([0-9]+)$/.exec(path);
        if (channel && Number(stores.ChannelStore?.getChannel?.(channel[1])?.type) === 3) return { category: 'groups', id: channel[1] };
        return null;
      });
      if (key === 'put') hasPutHook = hooked;
      else hasDeleteHook = hasDeleteHook || hooked;
    }
    if (hasDeleteHook) capabilities.guilds = capabilities.groups = true;
    if (hasDeleteHook && hasPutHook) capabilities.relationships = true;
    hookWarnings.length = 0;
    if (Object.values(capabilities).some(value => !value)) hookWarnings.push('Some actions you take yourself may appear in history on this Discord version.');
  }

  function load() {
    if (running) return;
    stores = Object.fromEntries(['UserStore', 'RelationshipStore', 'GuildStore', 'ChannelStore', 'ConnectionStore', 'GuildAvailabilityStore'].map(name => [name, byStore(name)]));
    dispatcher = V.metro.common.FluxDispatcher ?? byProps('dispatch', 'subscribe');
    if (!dispatcher?.subscribe || !dispatcher?.unsubscribe || !stores.UserStore?.getCurrentUser) throw new Error('RelationshipNotifier: Discord account/event modules are unavailable.');
    running = true; generation++;
    connectedByEvent = false; paused = false;
    offlinePending = new Set(['friends', 'requests', 'guilds', 'groups']);
    activeAccount = currentUserId();
    if (activeAccount) activeAccount = String(activeAccount);
    tracker.select(activeAccount);
    readyAfter = clock.now() + 5000;
    try { icon = V.ui?.assets?.getAssetIDByName('FriendsIcon'); } catch {}
    try {
      patchManualActions();
      // Refresh an open history page when the account changes, before the next
      // periodic check. The five-second list hydration guard still applies.
      if (typeof stores.UserStore.addChangeListener === 'function') {
        const onUserChange = () => { if (String(currentUserId() || '') !== String(activeAccount || '')) schedule(0); };
        stores.UserStore.addChangeListener(onUserChange);
        disposers.push(() => stores.UserStore.removeChangeListener?.(onUserChange));
      }
      for (const type of ['RELATIONSHIP_ADD', 'RELATIONSHIP_UPDATE', 'RELATIONSHIP_REMOVE', 'CHANNEL_CREATE', 'CHANNEL_UPDATE', 'CHANNEL_DELETE', 'CHANNEL_RECIPIENT_ADD', 'CHANNEL_RECIPIENT_REMOVE', 'GUILD_UPDATE']) subscribeEvent(type, () => schedule());
      subscribeEvent('GUILD_DELETE', event => {
        const guild = event.guild ?? event;
        if (guild.unavailable && guild.id) unavailable.add(String(guild.id));
        schedule();
      });
      subscribeEvent('GUILD_CREATE', event => {
        const guild = event.guild ?? event;
        if (guild.id && !guild.unavailable) unavailable.delete(String(guild.id));
        schedule();
      });
      for (const type of ['CONNECTION_OPEN', 'CONNECTION_RESUMED']) subscribeEvent(type, event => {
        connectedByEvent = true;
        paused = false;
        offlinePending = new Set(['friends', 'requests', 'guilds', 'groups']);
        if (type === 'CONNECTION_OPEN') {
          unavailable.clear();
          if (event.user?.id) { activeAccount = String(event.user.id); tracker.select(activeAccount); }
          if (event.guilds) for (const [id, guild] of entries(event.guilds)) if (guild?.unavailable) unavailable.add(String(guild.id ?? id));
        }
        readyAfter = clock.now() + 5000;
        schedule(5000);
      });
      for (const type of ['CONNECTION_CLOSED', 'CONNECTION_INTERRUPTED', 'LOGOUT', 'LOGOUT_START', 'LOGIN_SUCCESS']) subscribeEvent(type, () => {
        connectedByEvent = false; paused = true;
        offlinePending = new Set(['friends', 'requests', 'guilds', 'groups']);
        if (timer != null) clock.clearTimeout(timer);
        timer = null;
        if (type.startsWith('LOGOUT')) { activeAccount = null; tracker.select(null); }
        setStatus('Waiting for Discord to connect…');
      });
      const appState = RN.AppState?.addEventListener?.('change', state => { if (state === 'active') schedule(1500); });
      if (appState?.remove) disposers.push(() => appState.remove());
      interval = clock.setInterval(() => schedule(), 30000);
      schedule(5000);
      // Keep the shortcut optional: a changed settings API must not stop alerts.
      try {
        disposers.push(registerSettingsShortcut({
          settingsAPI: host.bunny?.ui?.settings ?? host.window?.bunny?.ui?.settings,
          Settings: settings,
          constants: byProps('SETTING_RENDERER_CONFIG'),
          treeManager: byProps('getAncestors', 'isBlocked'),
          patcher: V.patcher,
          openSettings: () => {
            try {
              const navigation = byProps('getRootNavigationRef')?.getRootNavigationRef?.();
              if (!navigation?.navigate) throw new Error('Open RelationshipNotifier from the Plugins page on this Discord version.');
              navigation.navigate('BUNNY_CUSTOM_PAGE', {
                title: 'RelationshipNotifier', render: () => React.createElement(settings),
              });
            } catch (error) {
              log(error);
              try { RN.Alert.alert('RelationshipNotifier', error?.message ?? 'Could not open settings.'); } catch {}
            }
          },
          renderIcon: asset => {
            const Icon = byProps('TableRowIcon')?.TableRowIcon;
            return Icon ? React.createElement(Icon, { source: asset })
              : React.createElement(RN.Image, { source: asset, style: { width: 24, height: 24 } });
          },
          getAssetID: name => V.ui?.assets?.getAssetIDByName(name),
          log,
        }));
      } catch (error) { log(error); }
    } catch (error) { unload(); throw error; }
  }

  function unload() {
    running = false; generation++;
    if (timer != null) clock.clearTimeout(timer);
    if (interval != null) clock.clearInterval(interval);
    timer = interval = null;
    for (const dispose of disposers.splice(0).reverse()) { try { dispose(); } catch (error) { log(error); } }
    unavailable.clear();
    setStatus('Plugin is disabled');
  }

  async function openProfile(id) {
    if (!running || typeof id !== 'string' || !/^\d+$/.test(id)) return;
    let failure;
    // Prefer Discord's native mobile profile sheet; some builds expose only
    // the older profile action modules. Discord handles fetching uncached users.
    for (const method of ['showUserProfileActionSheet', 'showUserProfileActionSheetPostConnection', 'openUserProfile', 'showUserProfile', 'openUserProfileModal']) {
      const candidates = [];
      if (method.startsWith('showUserProfileActionSheet')) {
        try {
          const named = V.metro.findByName?.(method);
          const fn = typeof named === 'function' ? named : named?.default;
          if (typeof fn === 'function') candidates.push({ fn, target: named });
        } catch {}
      }
      const module = byProps(method);
      if (typeof module?.[method] === 'function') candidates.push({ fn: module[method], target: module });
      for (const { fn, target } of candidates) {
        try {
          const result = await fn.call(target, { userId: id });
          if (result === false) throw new Error('Discord could not open this profile.');
          return;
        } catch (error) { failure = error; log(error); }
        if (!running) return;
      }
    }
    try { RN.Alert.alert('Could not open profile', failure?.message ?? 'Profile opening is unavailable on this Discord version. You can still copy the mention.'); } catch {}
  }

  const settings = createSettings({
    React, RN, tracker, getStatus: () => status,
    openProfile,
    copyMention: async mention => {
      try {
        let clipboard = V.metro.common.clipboard;
        if (typeof clipboard?.setString !== 'function') clipboard = RN.Clipboard;
        if (typeof clipboard?.setString !== 'function') clipboard = byProps('setString', 'getString');
        if (typeof clipboard?.setString !== 'function') throw new Error('Clipboard unavailable. Long-press the User ID text to copy it.');
        await clipboard.setString(mention);
        try { V.ui?.toasts?.showToast?.(`Copied ${mention}`, icon); } catch {}
      } catch (error) {
        log(error);
        try { RN.Alert.alert('Copy user mention', error?.message ?? 'Could not copy. Long-press the User ID text instead.'); } catch {}
      }
    },
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getTheme: () => { try { return byStore('ThemeStore')?.theme; } catch { return undefined; } },
    testNotification: () => deliver([{ text: 'RelationshipNotifier is ready! Removal alerts will appear here.' }], tracker.options()),
  });
  return { onLoad: load, onUnload: unload, settings };
}


return createPlugin(vendetta);
})()
}, "RelationshipNotifier");
})()
