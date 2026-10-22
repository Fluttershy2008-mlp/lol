(() => {
// SPDX-License-Identifier: CC0-1.0
// Shared by the separately installable Revenge bundles; no global API changes.
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
'use strict';
const validID = value => typeof value === 'string' && /^[1-9]\d{16,19}$/.test(value);

function parseIDs(text) {
  if (typeof text !== 'string') throw new Error('Protected IDs must be text.');
  const tokens = text.trim() ? text.trim().split(/[\s,;]+/) : [];
  const invalid = tokens.filter(id => !validID(id));
  if (invalid.length) throw new Error(`Invalid server ID: ${invalid[0]}. Paste full server IDs, separated by spaces, commas or new lines.`);
  return [...new Set(tokens)];
}

function guildRows(store) {
  if (typeof store?.getGuilds !== 'function') throw new Error('Your server list is not ready. Tap Refresh.');
  const raw = store.getGuilds();
  if (!raw || typeof raw !== 'object') throw new Error('Your server list is still loading.');
  const entries = raw instanceof Map ? [...raw.entries()] : Object.entries(raw);
  const rows = entries.map(([key, guild]) => {
    const id = guild?.id ?? key;
    if (!validID(id) || !guild || typeof guild !== 'object') throw new Error('Discord returned an incomplete server list. Tap Refresh.');
    return { id, name: String(guild.name || id), owner: guild.ownerId ?? guild.owner_id,
      unavailable: guild.unavailable === true };
  });
  return [...new Map(rows.map(row => [row.id, row])).values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function keepReason(row, account, protectedIDs) {
  if (protectedIDs.has(row.id)) return 'Protected';
  if (row.owner === account) return 'You own this server';
  if (row.unavailable) return 'Server unavailable';
  if (!validID(row.owner)) return 'Ownership unavailable';
  return null;
}

function makePlan(rows, account, text) {
  if (!validID(account)) throw new Error('Your Discord account is still loading.');
  const ids = parseIDs(text), protectedIDs = new Set(ids);
  const joined = new Set(rows.map(row => row.id));
  const missing = ids.filter(id => !joined.has(id));
  // A mistyped but well-formed ID must never silently leave the intended server.
  if (missing.length) throw new Error(`Protected ID ${missing[0]} is not in your server list. Check the ID or remove it before continuing.`);
  const kept = [], targets = [];
  for (const row of rows) {
    const reason = keepReason(row, account, protectedIDs);
    if (reason) kept.push({ ...row, reason }); else targets.push({ ...row });
  }
  return { account, ids, targets, kept };
}

function samePlan(a, b) {
  const signature = plan => JSON.stringify([plan.account, [...plan.ids].sort(),
    plan.targets.map(row => row.id).sort(), plan.kept.map(row => [row.id, row.reason]).sort()]);
  return signature(a) === signature(b);
}

// Requests are serial. Any uncertain result stops the queue; no automatic retries.
async function runQueue({ plan, alive, getRows, getIDs, leave, wait, update }) {
  const result = { left: [], skipped: [], failed: [], stopped: null };
  const publish = () => update({ ...result, left: [...result.left], skipped: [...result.skipped], failed: [...result.failed] });
  for (const original of plan.targets) {
    if (!alive()) { result.stopped = 'Stopped. No more leave requests will be sent.'; break; }
    let row;
    try {
      row = getRows().find(item => item.id === original.id);
      // Retain all IDs protected at confirmation even if saved settings later change.
      const ids = new Set([...plan.ids, ...parseIDs(getIDs())]);
      if (!row || keepReason(row, plan.account, ids)) {
        result.skipped.push(original); publish(); continue;
      }
    } catch (error) { result.stopped = error.message; break; }
    // Recheck immediately before dispatch, after consulting live stores/settings.
    if (!alive()) { result.stopped = 'Stopped. No more leave requests will be sent.'; break; }
    try {
      const response = await leave(row.id);
      const status = Number(response?.status ?? response?.statusCode);
      if (status !== 204) throw new Error(`Leave was not confirmed (HTTP ${Number.isFinite(status) ? status : 'unknown'}). Refresh your server list before trying again.`);
      result.left.push(original);
    } catch (error) {
      result.failed.push({ ...original, error: error?.message ?? 'Leave failed.' });
      result.stopped = 'Stopped after an error. Refresh before trying again.';
      publish(); break;
    }
    publish();
    if (!alive()) { result.stopped = 'Stopped. No more leave requests will be sent.'; break; }
    await wait();
  }
  publish();
  return result;
}

const SHORTCUT_KEY = 'FLUTTERSHY_SERVER_LEAVER';
const SETTINGS_CONFIG = 'SETTING_RENDERER_CONFIG';
const SHORTCUT_LAYER = Symbol.for('server-leaver.settings-layer.v1');

// Settings screens can retain an old list of row keys after a plugin is disabled.
// A hidden renderer keeps those keys valid until Discord recreates the screen.
function hiddenShortcut() {
  return { type: 'pressable', parent: null, title: () => 'Server Leaver',
    useTitle: () => 'Server Leaver', usePredicate: () => false, onPress: () => {}, withArrow: true };
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

function attachSettingsShortcut({ api, constants, Settings, open, useTrailing, getAsset, renderIcon,
  patcher, tree, log = () => {} }) {
  const sections = api?.registeredSections;
  const rows = sections && Object.values(sections).find(items => Array.isArray(items)
    && items.some(row => row?.key === 'BUNNY_PLUGINS'));
  if (!rows || !constants) {
    log('Server Leaver shortcut is unavailable; the plugin settings page is still accessible.');
    return () => {};
  }

  let enabled = true, removeGuard, layer, row;
  let icon;
  for (const name of ['ic_leave', 'WrenchIcon']) {
    try { icon = getAsset?.(name); if (icon != null) break; } catch {}
  }
  const record = { type: 'pressable', parent: null, title: () => 'Server Leaver',
    useTitle: () => 'Server Leaver', usePredicate: () => enabled,
    icon, useTrailing, IconComponent: icon != null && renderIcon ? () => renderIcon(icon) : undefined,
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
      useTrailing, rawTabsConfig: record, onPress: record.onPress, render: async () => ({ default: Settings }) };
    const previous = rows.findIndex(item => item?.key === SHORTCUT_KEY);
    if (previous >= 0) rows.splice(previous, 1);
    const blocked = rows.findIndex(item => item?.key === 'FLUTTERSHY_FRIENDS_LIST');
    const anchor = blocked >= 0 ? blocked : rows.findIndex(item => item?.key === 'BUNNY_PLUGINS');
    rows.splice(anchor + 1, 0, row);
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
  const h = React.createElement, storage = V.plugin.storage;
  const safe = fn => { try { return fn(); } catch { return undefined; } };
  const byProps = (...keys) => safe(() => V.metro.findByProps(...keys));
  const byStore = name => safe(() => V.metro.findByStoreName?.(name));
  const log = error => safe(() => V.logger?.error?.('Server Leaver', error));
  const listeners = new Set();
  let active = false, epoch = 0, job = null, report = null, disposeShortcut, appSubscription, removeAccountListener;
  let guildStore, userStore, themeStore;
  function resolve() {
    guildStore = byStore('GuildStore') ?? byProps('getGuilds', 'getGuild');
    userStore = byStore('UserStore') ?? byProps('getCurrentUser', 'getUser');
    themeStore = byStore('ThemeStore');
  }
  function account() { resolve(); return safe(() => userStore?.getCurrentUser?.()?.id); }
  function idsFor(id) {
    if (!validID(id)) return '';
    const value = storage.accounts?.[id];
    if (value == null) return '';
    if (!Array.isArray(value) || value.some(item => !validID(item))) throw new Error('Protected IDs could not be loaded. Save them again before continuing.');
    return value.join('\n');
  }
  function save(id, text) {
    if (!active || account() !== id) throw new Error('Your account changed. Reopen this page.');
    if (job) throw new Error('Stop the current leave operation before changing protected IDs.');
    const ids = parseIDs(text);
    storage.accounts = { ...(storage.accounts ?? {}), [id]: ids };
    emit(); return ids.join('\n');
  }
  function emit() { for (const listener of listeners) safe(listener); }
  function freshPlan(id) {
    if (!active || !validID(id) || account() !== id) throw new Error('Your account changed or the plugin was disabled. Reopen this page.');
    return makePlan(guildRows(guildStore), id, idsFor(id));
  }
  function stop() { if (job) { job.cancelled = true; emit(); } }
  function http() {
    const wrapper = byProps('HTTP');
    const api = wrapper?.HTTP ?? V.metro.common.RestAPI ?? V.metro.common.restAPI ?? byProps('get', 'post', 'del');
    if (typeof api?.del !== 'function') throw new Error('Discord’s leave request API is unavailable on this version.');
    return api;
  }
  async function execute(plan, confirmedEpoch) {
    if (job) throw new Error('A leave operation is already running.');
    if (confirmedEpoch !== epoch || !samePlan(plan, freshPlan(plan.account))) throw new Error('Your server list or protected IDs changed. Preview again before leaving.');
    const api = http();
    const token = { account: plan.account, epoch, cancelled: false };
    job = token; report = null; emit();
    const alive = () => active && job === token && !token.cancelled && epoch === token.epoch
      && account() === token.account && (RN.AppState?.currentState == null || RN.AppState.currentState === 'active');
    try {
      await runQueue({ plan, alive, getRows: () => { resolve(); return guildRows(guildStore); },
        getIDs: () => idsFor(token.account),
        leave: async id => {
          // Native HTTP manages authentication. Never read or store account tokens.
          const request = api.del({ url: `/users/@me/guilds/${id}`, body: { lurking: false } });
          let timeout;
          try {
            return await Promise.race([request, new Promise((_, reject) => {
              timeout = setTimeout(() => reject(new Error('Leave request timed out. It may still complete; refresh before trying again.')), 45000);
            })]);
          } finally { clearTimeout(timeout); }
        },
        wait: () => new Promise(done => setTimeout(done, 1500)),
        update: value => { if (active && job === token && account() === token.account) { report = { ...value, account: token.account }; emit(); } },
      });
    } finally { if (job === token) { job = null; emit(); } }
  }
  function showError(error) { log(error); RN.Alert.alert('Server Leaver', error?.message ?? String(error)); }
  function confirm(plan) {
    if (!plan.targets.length) return RN.Alert.alert('Nothing to leave', 'All listed servers will be kept.');
    if (job) return;
    const confirmedEpoch = epoch;
    RN.Alert.alert('Leave these servers?',
      `Leave ${plan.targets.length} servers and keep ${plan.kept.length}?\n\n${plan.ids.length ? `${plan.ids.length} server IDs are protected.` : 'You have no protected IDs.'}\n\nThis cannot be undone. You may need new invites to rejoin. Tap a server’s Protect button before continuing if you want to keep it.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: `Leave ${plan.targets.length} servers`, style: 'destructive',
        onPress: () => { void execute(plan, confirmedEpoch).catch(showError); } }], { cancelable: true });
  }

  function Settings() {
    const [, rerender] = React.useState(0);
    const refresh = React.useCallback(() => rerender(n => n + 1), []);
    const id = account();
    const saved = safe(() => idsFor(id)) ?? '';
    const [draft, setDraft] = React.useState(saved);
    const [boundAccount, setBoundAccount] = React.useState(id);
    const [query, setQuery] = React.useState('');
    React.useEffect(() => { setBoundAccount(id); setDraft(safe(() => idsFor(id)) ?? ''); setQuery(''); }, [id]);
    React.useEffect(() => {
      listeners.add(refresh);
      const timer = setInterval(refresh, 1200);
      return () => { listeners.delete(refresh); clearInterval(timer); };
    }, [refresh]);
    let plan, error;
    try { plan = freshPlan(id); } catch (e) { error = e.message; }
    const busy = !!job, dirty = draft !== saved || boundAccount !== id;
    const scheme = typeof RN.useColorScheme === 'function' ? RN.useColorScheme() : 'dark';
    const dark = (safe(() => themeStore?.theme) ?? scheme) !== 'light';
    const c = dark ? { bg: '#111214', card: '#202226', text: '#f2f3f5', muted: '#b5bac1', border: '#383a40', accent: '#a7afff', green: '#91deb7', danger: '#ff949b' }
      : { bg: '#f2f3f5', card: '#fff', text: '#1e1f22', muted: '#5c6068', border: '#d4d7dc', accent: '#4752c4', green: '#146b43', danger: '#b52c39' };
    const Pressable = RN.Pressable ?? RN.TouchableOpacity;
    const text = (value, style = {}, props = {}) => h(RN.Text, { style: { color: c.text, fontSize: 15, lineHeight: 22, ...style }, ...props }, value);
    const button = (label, action, disabled = false, danger = false) => h(Pressable, {
      accessibilityRole: 'button', accessibilityLabel: label, accessibilityState: { disabled }, disabled,
      onPress: action, style: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 11,
        borderRadius: 9, borderWidth: 1, borderColor: danger ? c.danger : c.border, opacity: disabled ? 0.4 : 1, marginTop: 10 },
    }, text(label, { color: danger ? c.danger : c.accent, fontWeight: '700' }));
    function saveDraft() { try { setDraft(save(id, draft)); refresh(); } catch (e) { showError(e); } }
    function toggle(serverID) {
      try {
        if (busy || dirty) throw new Error('Save your ID changes first.');
        const ids = new Set(parseIDs(saved));
        if (ids.has(serverID)) ids.delete(serverID); else ids.add(serverID);
        setDraft(save(id, [...ids].join('\n'))); refresh();
      } catch (e) { showError(e); }
    }
    const visibleReport = report?.account === id ? report : null;
    const rows = plan ? [...plan.kept, ...plan.targets.map(row => ({ ...row, reason: null }))]
      .filter(row => `${row.name}\n${row.id}`.toLowerCase().includes(query.trim().toLowerCase())) : [];
    const inputStyle = { color: c.text, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, marginTop: 10 };
    const header = h(RN.View, { style: { paddingBottom: 14 } },
      text('Server Leaver', { fontSize: 26, lineHeight: 34, fontWeight: '800' }),
      text('Keep the servers you choose. Leave the rest after confirming.', { color: c.muted, marginTop: 5 }),
      text('Protected server IDs', { fontWeight: '700', marginTop: 18 }),
      text('Paste server IDs below, or tap Protect beside a server. Spaces, commas and new lines work.', { color: c.muted }),
      h(RN.TextInput, { accessibilityLabel: 'Protected server IDs', value: draft, onChangeText: setDraft, editable: !busy,
        multiline: true, autoCorrect: false, autoCapitalize: 'none', placeholder: 'Paste the server IDs you want to keep',
        placeholderTextColor: c.muted, style: { ...inputStyle, minHeight: 105, textAlignVertical: 'top' } }),
      button(dirty ? 'Save protected IDs' : 'Protected IDs saved', saveDraft, busy || !validID(id) || boundAccount !== id),
      dirty ? text('Save your changes before leaving any servers.', { color: c.danger, marginTop: 8 }) : null,
      error ? text(error, { color: c.danger, marginTop: 12 }) : null,
      plan ? h(RN.View, { style: { padding: 16, backgroundColor: c.card, borderRadius: 12, marginTop: 18 } },
        text(`Keep ${plan.kept.length} · Leave ${plan.targets.length}`, { fontSize: 20, fontWeight: '800', lineHeight: 28 }),
        text('Owned, unavailable and incomplete servers are also kept. Only the servers listed below are included.', { color: c.muted, marginTop: 5 }),
        button(busy ? 'Leaving servers…' : `Leave ${plan.targets.length} unprotected servers`, () => confirm(plan),
          busy || dirty || !plan.targets.length, true)) : null,
      busy ? button(job.cancelled ? 'Stopping after current request…' : 'Stop leaving', stop, job.cancelled, true) : null,
      busy ? text('Keep Discord open. Stop prevents the next request; a request already sent may finish.', { color: c.muted, marginTop: 8 }) : null,
      visibleReport ? h(RN.View, { style: { marginTop: 16 } },
        text(`Left ${visibleReport.left.length} · Skipped ${visibleReport.skipped.length} · Failed ${visibleReport.failed.length}`, { fontWeight: '700' }),
        visibleReport.stopped ? text(visibleReport.stopped, { color: c.danger }) : (!busy ? text('Finished.', { color: c.green }) : null),
        ...visibleReport.failed.map(row => text(`${row.name}: ${row.error}`, { color: c.danger }, { key: row.id }))) : null,
      button('Refresh server list', refresh, busy),
      h(RN.TextInput, { accessibilityLabel: 'Search servers', value: query, onChangeText: setQuery, autoCorrect: false,
        autoCapitalize: 'none', placeholder: 'Search server name or ID', placeholderTextColor: c.muted, style: inputStyle }),
      text('Preview — green servers stay, red servers will be left.', { color: c.muted, marginTop: 12 }));
    return h(RN.FlatList, { style: { flex: 1, backgroundColor: c.bg }, contentContainerStyle: { padding: 16, paddingBottom: 60 },
      data: rows, keyExtractor: row => row.id, ListHeaderComponent: header, keyboardShouldPersistTaps: 'handled',
      initialNumToRender: 12, ListEmptyComponent: text(error ? 'Fix the issue above to see your server preview.' : 'No matching servers.', { color: c.muted }),
      renderItem: ({ item: row }) => h(RN.View, { style: { backgroundColor: c.card, padding: 14, borderRadius: 12, marginBottom: 10 } },
        text(row.name, { fontWeight: '700' }), text(row.id, { color: c.muted, fontSize: 12 }, { selectable: true }),
        text(row.reason ? `KEEP · ${row.reason}` : 'LEAVE', { color: row.reason ? c.green : c.danger, fontWeight: '700', marginTop: 5 }),
        button(plan.ids.includes(row.id) ? 'Remove protection' : 'Protect', () => toggle(row.id), busy || dirty)),
    });
  }
  function open() {
    if (!active) return;
    try {
      const nav = byProps('getRootNavigationRef')?.getRootNavigationRef?.();
      if (typeof nav?.navigate !== 'function') throw new Error('Open Server Leaver’s settings button on the Plugins page.');
      nav.navigate('BUNNY_CUSTOM_PAGE', { title: 'Server Leaver', render: Settings });
    } catch (e) { showError(e); }
  }
  return {
    onLoad() {
      if (active) return;
      active = true; epoch++; resolve();
      appSubscription = RN.AppState?.addEventListener?.('change', state => { if (state !== 'active') stop(); });
      if (typeof userStore?.addChangeListener === 'function' && typeof userStore?.removeChangeListener === 'function') {
        const store = userStore;
        const changed = () => { if (job && account() !== job.account) stop(); emit(); };
        store.addChangeListener(changed);
        removeAccountListener = () => store.removeChangeListener(changed);
      }
      try { disposeShortcut = attachSettingsShortcut({ api: host.bunny?.ui?.settings ?? host.window?.bunny?.ui?.settings,
        constants: byProps('SETTING_RENDERER_CONFIG'), Settings, open, getAsset: name => V.ui?.assets?.getAssetIDByName?.(name),
        patcher: V.patcher, tree: byProps('getAncestors', 'isBlocked'), log }); } catch (e) { log(e); }
      emit();
    },
    onUnload() { stop(); active = false; epoch++; safe(() => disposeShortcut?.()); safe(() => appSubscription?.remove());
      safe(() => removeAccountListener?.()); disposeShortcut = appSubscription = removeAccountListener = undefined; emit(); listeners.clear(); },
    settings: Settings,
    controller: { freshPlan, save, execute, stop, getEpoch: () => epoch, isRunning: () => !!job },
  };
}

return createPlugin(vendetta);
})()
}, "Server Leaver");
})()
