import { validID, parseIDs, guildRows, makePlan, samePlan, runQueue } from './model.mjs';
import { attachSettingsShortcut } from './settings-shortcut.mjs';
import { MAIN_PROTECTED_IDS, isMainProtected, withMainProtection } from './main-protection.mjs';

export function createPlugin(V, host = globalThis) {
  const { React, ReactNative: RN } = V.metro.common;
  const h = React.createElement, storage = V.plugin.storage;
  const safe = fn => { try { return fn(); } catch { return undefined; } };
  const byProps = (...keys) => safe(() => V.metro.findByProps(...keys));
  const byStore = name => safe(() => V.metro.findByStoreName?.(name));
  const log = error => safe(() => V.logger?.error?.('Server Leaver', error));
  const listeners = new Set();
  const removeStoreListeners = [];
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
    if (value == null) return MAIN_PROTECTED_IDS.join('\n');
    if (!Array.isArray(value) || value.some(item => !validID(item))) throw new Error('Protected IDs could not be loaded. Save them again before continuing.');
    return withMainProtection(value).join('\n');
  }
  function save(id, text) {
    if (!active || account() !== id) throw new Error('Your account changed. Reopen this page.');
    if (job) throw new Error('Stop the current leave operation before changing protected IDs.');
    const ids = withMainProtection(parseIDs(text));
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
      return () => { listeners.delete(refresh); };
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
    function saveDraft() {
      try { safe(() => RN.Keyboard?.dismiss?.()); setDraft(save(id, draft)); } catch (e) { showError(e); }
    }
    function toggle(serverID) {
      try {
        if (busy || dirty) throw new Error('Save your ID changes first.');
        if (isMainProtected(serverID)) return;
        const ids = new Set(parseIDs(saved));
        if (ids.has(serverID)) ids.delete(serverID); else ids.add(serverID);
        // Do not let a focused offscreen editor pull the list back to the header.
        safe(() => RN.Keyboard?.dismiss?.());
        setDraft(save(id, [...ids].join('\n')));
      } catch (e) { showError(e); }
    }
    const visibleReport = report?.account === id ? report : null;
    const rows = plan ? [...plan.kept, ...plan.targets.map(row => ({ ...row, reason: null }))]
      // Changing protection updates this row in place, not its scroll position.
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .filter(row => `${row.name}\n${row.id}`.toLowerCase().includes(query.trim().toLowerCase())) : [];
    const inputStyle = { color: c.text, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, marginTop: 10 };
    const header = h(RN.View, { style: { paddingBottom: 14 } },
      text('Server Leaver', { fontSize: 26, lineHeight: 34, fontWeight: '800' }),
      text('Keep the servers you choose. Leave the rest after confirming.', { color: c.muted, marginTop: 5 }),
      text('Protected server IDs', { fontWeight: '700', marginTop: 18 }),
      text(`${MAIN_PROTECTED_IDS.length} main server IDs are always protected. Saving restores them if removed from this field.`, { color: c.muted }),
      text('Paste server IDs below, or tap Protect beside a server. Spaces, commas and new lines work.', { color: c.muted }),
      h(RN.TextInput, { accessibilityLabel: 'Protected server IDs', value: draft, onChangeText: setDraft, editable: !busy,
        multiline: true, autoCorrect: false, autoCapitalize: 'none', placeholder: 'Paste the server IDs you want to keep',
        scrollEnabled: true, placeholderTextColor: c.muted,
        style: { ...inputStyle, height: 160, textAlignVertical: 'top' } }),
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
      keyboardDismissMode: 'on-drag', removeClippedSubviews: false,
      initialNumToRender: 12, ListEmptyComponent: text(error ? 'Fix the issue above to see your server preview.' : 'No matching servers.', { color: c.muted }),
      renderItem: ({ item: row }) => h(RN.View, { style: { backgroundColor: c.card, padding: 14, borderRadius: 12, marginBottom: 10 } },
        text(row.name, { fontWeight: '700' }), text(row.id, { color: c.muted, fontSize: 12 }, { selectable: true }),
        text(row.reason ? `KEEP · ${row.reason}` : 'LEAVE', { color: row.reason ? c.green : c.danger, fontWeight: '700', marginTop: 5 }),
        button(isMainProtected(row.id) ? 'Main protected' : plan.ids.includes(row.id) ? 'Remove protection' : 'Protect',
          () => toggle(row.id), isMainProtected(row.id) || busy || dirty)),
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
      // Refresh on real changes instead of rebuilding the list during every scroll.
      for (const store of [guildStore, themeStore]) {
        if (typeof store?.addChangeListener !== 'function' || typeof store?.removeChangeListener !== 'function') continue;
        store.addChangeListener(emit);
        removeStoreListeners.push(() => store.removeChangeListener(emit));
      }
      try { disposeShortcut = attachSettingsShortcut({ api: host.bunny?.ui?.settings ?? host.window?.bunny?.ui?.settings,
        constants: byProps('SETTING_RENDERER_CONFIG'), Settings, open, getAsset: name => V.ui?.assets?.getAssetIDByName?.(name),
        patcher: V.patcher, tree: byProps('getAncestors', 'isBlocked'), log }); } catch (e) { log(e); }
      emit();
    },
    onUnload() { stop(); active = false; epoch++; safe(() => disposeShortcut?.()); safe(() => appSubscription?.remove());
      for (const remove of removeStoreListeners.splice(0)) safe(remove);
      safe(() => removeAccountListener?.()); disposeShortcut = appSubscription = removeAccountListener = undefined; emit(); listeners.clear(); },
    settings: Settings,
    controller: { freshPlan, save, execute, stop, getEpoch: () => epoch, isRunning: () => !!job },
  };
}
