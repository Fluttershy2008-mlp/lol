(() => {
/*! RelationshipNotifier for Revenge 1.0.0
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

function createSettings({ React, RN, tracker, getStatus, subscribe, testNotification, getTheme }) {
  const h = React.createElement;
  const Pressable = RN.Pressable ?? RN.TouchableOpacity;
  const choices = [
    ['friends', 'Lost friends', 'Notify when someone is no longer on your friends list.'],
    ['friendRequestCancels', 'Cancelled friend requests', 'Watch incoming friend requests that disappear.'],
    ['servers', 'Server removals', 'Notify when you are no longer in a server.'],
    ['groups', 'Group chat removals', 'Notify when you are no longer in a group DM.'],
    ['offlineRemovals', 'Check after reconnecting', 'Compare with your last saved list after Discord connects.'],
    ['notices', 'Keep an alert on screen', 'Also show a popup that stays until you dismiss it.'],
  ];

  return function RelationshipNotifierSettings() {
    const [, refresh] = React.useState(0);
    React.useEffect(() => subscribe(() => refresh(value => value + 1)), []);
    const scheme = typeof RN.useColorScheme === 'function' ? RN.useColorScheme() : 'dark';
    const dark = (getTheme() ?? scheme) !== 'light';
    const colors = dark
      ? { bg: '#18191c', card: '#27292e', text: '#f3f4f6', muted: '#b6bcc7', accent: '#8992ff', border: '#4e535c' }
      : { bg: '#f2f3f5', card: '#ffffff', text: '#202227', muted: '#5b626f', accent: '#4752c4', border: '#c3c7cf' };
    const text = (value, style = {}) => h(RN.Text, { style: { color: colors.text, fontSize: 15, lineHeight: 21, ...style } }, value);
    const note = value => text(value, { color: colors.muted, marginTop: 6 });
    const action = (label, onPress) => h(Pressable, {
      accessibilityRole: 'button', onPress,
      style: { padding: 14, marginTop: 12, backgroundColor: colors.card, borderRadius: 10, borderColor: colors.border, borderWidth: 1 },
    }, text(label, { color: colors.accent, fontWeight: '700', textAlign: 'center' }));
    const status = getStatus();
    const options = tracker.options();
    const history = tracker.history();
    const counts = tracker.counts();
    return h(RN.ScrollView, { style: { flex: 1, backgroundColor: colors.bg }, contentContainerStyle: { padding: 16, paddingBottom: 60 } },
      text('RelationshipNotifier', { fontSize: 24, lineHeight: 30, fontWeight: '800' }),
      note('See changes to your friends, requests, servers and group chats.'),
      h(RN.View, { style: { padding: 16, marginVertical: 16, borderRadius: 12, backgroundColor: colors.card } },
        text(status.message, { fontWeight: '700' }),
        note(`${counts.friends} friends · ${counts.requests} requests · ${counts.guilds} servers · ${counts.groups} groups`),
        ...status.warnings.map((warning, i) => h(RN.Text, { key: i, style: { color: colors.muted, marginTop: 8, lineHeight: 20 } }, warning)),
      ),
      ...choices.map(([key, title, detail]) => h(RN.View, { key, style: { padding: 14, marginBottom: 8, borderRadius: 10, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center' } },
        h(RN.View, { style: { flex: 1, paddingRight: 12 } }, text(title, { fontWeight: '700' }), note(detail)),
        h(RN.Switch, { accessibilityLabel: title, value: Boolean(options[key]), onValueChange: value => tracker.setOption(key, value), trackColor: { true: '#5865f2', false: colors.border } }),
      )),
      action('Test notification', testNotification),
      text('Recent notifications', { fontSize: 20, fontWeight: '700', marginTop: 24, marginBottom: 8 }),
      note('Saved on this device for the current account. The latest 100 are kept.'),
      history.length ? null : note('No changes detected yet. The first check saves your starting list.'),
      ...history.map((entry, index) => h(RN.View, { key: `${entry.at}:${index}`, style: { padding: 14, marginTop: 10, borderRadius: 10, backgroundColor: colors.card } },
        text(entry.text), note(`${new Date(entry.at).toLocaleString()}${entry.offline ? ' · Detected after reconnecting' : ''}`),
      )),
      history.length ? action('Clear notification history', () => RN.Alert.alert('Clear history?', 'This removes the saved notifications for this account.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => tracker.clearHistory() },
      ])) : null,
      note('Alerts appear inside Discord. Android may pause the plugin when the app is closed. Changes made on another device can also appear here; Discord does not reveal whether a server removal was a kick, ban or deletion.'),
      text('1.0.0 · Adapted from Vencord by nick and contributors · GPL-3.0-or-later', { color: colors.muted, fontSize: 12, marginTop: 24 }),
    );
  };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */

function createPlugin(V, clock = { now: Date.now, setTimeout, clearTimeout, setInterval, clearInterval }) {
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
    const body = events.length === 1 ? events[0].text : `${events.length} relationship changes detected. Open RelationshipNotifier settings to see them.`;
    let shown = false;
    try {
      if (typeof V.ui?.toasts?.showToast === 'function') {
        V.ui.toasts.showToast(body, icon);
        shown = true;
      }
    } catch (error) { log(error); }
    if (options.notices || !shown) {
      try {
        const detail = events.slice(0, 5).map(item => item.text).join('\n\n') + (events.length > 5 ? `\n\nAnd ${events.length - 5} more. See notification history.` : '');
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
    return { name: user?.username ? `${user.username}${suffix}` : user?.globalName ?? user?.global_name ?? id };
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
        result.guilds[id] = { id, name: guild.name || id };
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
        result.groups[id] = { id, name: channel.name || names.join(', ') || 'Unnamed group' };
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

  const settings = createSettings({
    React, RN, tracker, getStatus: () => status,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getTheme: () => { try { return byStore('ThemeStore')?.theme; } catch { return undefined; } },
    testNotification: () => deliver([{ text: 'RelationshipNotifier is ready! Removal alerts will appear here.' }], tracker.options()),
  });
  return { onLoad: load, onUnload: unload, settings };
}

return createPlugin(vendetta);
})()
