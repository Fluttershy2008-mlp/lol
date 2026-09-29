/* SPDX-License-Identifier: GPL-3.0-or-later */
import { createTracker } from './tracker.js';
import { createSettings } from './settings.js';
import { registerSettingsShortcut } from './shortcut.js';

export function createPlugin(V, clock = { now: Date.now, setTimeout, clearTimeout, setInterval, clearInterval }, host = globalThis) {
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

  const settings = createSettings({
    React, RN, tracker, getStatus: () => status,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getTheme: () => { try { return byStore('ThemeStore')?.theme; } catch { return undefined; } },
    testNotification: () => deliver([{ text: 'RelationshipNotifier is ready! Removal alerts will appear here.' }], tracker.options()),
  });
  return { onLoad: load, onUnload: unload, settings };
}
