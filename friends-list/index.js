(() => {
const FRIEND = 1;
const validID = value => typeof value === 'string' && /^\d{17,20}$/.test(value);

function relationshipEntries(value) {
  if (value && typeof value.entries === 'function' && !Array.isArray(value)) return [...value.entries()];
  if (Array.isArray(value)) return value.map(item => Array.isArray(item)
    ? item : [item?.id ?? item?.user?.id, item?.type]);
  if (value && typeof value === 'object') return Object.entries(value);
  return null;
}

// Count relationships, not cached profiles or presence. Offline and uncached friends count too.
function friendIDs(store) {
  if (!store) throw new Error('Discord’s friends list is not ready. Tap Refresh to try again.');
  for (const method of ['getFriendIDs', 'getFriendIds']) {
    if (typeof store[method] !== 'function') continue;
    const ids = store[method]();
    if (Array.isArray(ids) || ids instanceof Set) return [...new Set([...ids].filter(validID))];
  }
  for (const method of ['getRelationships', 'getMutableRelationships']) {
    if (typeof store[method] !== 'function') continue;
    const pairs = relationshipEntries(store[method]());
    if (pairs) return [...new Set(pairs.filter(([id, value]) => validID(id)
      && Number(value?.type ?? value) === FRIEND).map(([id]) => id))];
  }
  throw new Error('This Discord version does not expose its friends list.');
}

function makeRows(ids, getUser) {
  return ids.map(id => {
    let user;
    try { user = getUser?.(id); } catch {}
    const username = typeof user?.username === 'string' ? user.username : '';
    const name = user?.globalName || user?.global_name || username || 'Unknown friend';
    const discriminator = String(user?.discriminator ?? '0');
    const tag = username ? (discriminator !== '0' && discriminator
      ? `${username}#${discriminator}` : `@${username}`) : 'Tap to load their profile';
    const avatar = typeof user?.avatar === 'string' && /^[a-zA-Z0-9_]+$/.test(user.avatar)
      ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.png?size=128` : null;
    return { id, name: String(name), tag, avatar };
  }).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id));
}

function searchRows(rows, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  return needle ? rows.filter(row => `${row.name}\n${row.tag}\n${row.id}`.toLowerCase().includes(needle)) : rows;
}

const SHORTCUT_KEY = 'FLUTTERSHY_FRIENDS_LIST';
const SETTINGS_CONFIG = 'SETTING_RENDERER_CONFIG';
const SHORTCUT_LAYER = Symbol.for('friends-list.settings-layer.v1');

// Settings screens can retain an old list of row keys after a plugin is disabled.
// A hidden renderer keeps those keys valid until Discord recreates the screen.
function hiddenShortcut() {
  return { type: 'pressable', parent: null, title: () => 'Friends List',
    useTitle: () => 'Friends List', usePredicate: () => false, onPress: () => {}, withArrow: true };
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
    log('Friends List shortcut is unavailable; the plugin settings page is still accessible.');
    return () => {};
  }

  let enabled = true, removeGuard, layer, row;
  let icon;
  for (const name of ['FriendsIcon', 'PeopleIcon', 'WrenchIcon']) {
    try { icon = getAsset?.(name); if (icon != null) break; } catch {}
  }
  const record = { type: 'pressable', parent: null, title: () => 'Friends List',
    useTitle: () => 'Friends List', usePredicate: () => enabled,
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
    const blocked = rows.findIndex(item => item?.key === 'FLUTTERSHY_BLOCKED_USERS');
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
  const h = React.createElement;
  const optional = fn => { try { return fn(); } catch { return undefined; } };
  const byProps = (...keys) => optional(() => V.metro.findByProps(...keys));
  const byStore = name => optional(() => V.metro.findByStoreName?.(name));
  const log = error => optional(() => V.logger?.error?.('Friends List', error));
  const listeners = new Set();
  const subscriptions = new Set();
  let active = false, generation = 0;
  let removeShortcut, userStore, relationshipStore, themeStore, profileActions;

  function resolveStores() {
    userStore = byStore('UserStore') ?? byProps('getUser', 'getCurrentUser');
    relationshipStore = byStore('RelationshipStore') ?? byProps('getFriendIDs', 'isFriend')
      ?? byProps('getRelationships', 'isFriend') ?? byProps('getRelationships', 'isBlocked')
      ?? byProps('getFriendIDs') ?? byProps('getRelationships');
    themeStore = byStore('ThemeStore');
  }
  function currentAccount() { return optional(() => userStore?.getCurrentUser?.()?.id); }
  function live(value) { return active && value.generation === generation && validID(value.account)
    && currentAccount() === value.account; }
  function emit() { for (const listener of listeners) optional(listener); }

  function readFriends() {
    resolveStores();
    const token = { generation, account: currentAccount() };
    try {
      if (!active) throw new Error('Enable Friends List from the Plugins page to use it.');
      if (!validID(token.account)) throw new Error('Discord is still loading your account. Tap Refresh to try again.');
      return { token, ids: friendIDs(relationshipStore), error: null };
    } catch (error) { return { token, ids: [], error: error?.message ?? String(error) }; }
  }
  function snapshot() {
    const data = readFriends();
    return { token: data.token, total: data.error ? null : data.ids.length,
      rows: makeRows(data.ids, id => userStore?.getUser?.(id)), error: data.error };
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
      listeners.delete(listener); subscriptions.delete(dispose);
      for (const fn of cleanup.reverse()) optional(fn);
    };
    subscriptions.add(dispose);
    return dispose;
  }

  function useRefresh() {
    const [revision, update] = React.useState(0);
    const refresh = React.useCallback(() => update(value => value + 1), []);
    resolveStores();
    const account = currentAccount();
    React.useEffect(() => subscribe(refresh), [refresh, account, generation, userStore, relationshipStore, themeStore]);
    return [revision, refresh];
  }
  function useTotalLabel() {
    useRefresh();
    const data = readFriends();
    return data.error ? 'Unavailable' : `${data.ids.length} ${data.ids.length === 1 ? 'friend' : 'friends'}`;
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
      await profileActions.module[profileActions.method]({ userId: id });
    } catch (error) {
      log(error);
      if (live(value)) RN.Alert.alert('Could not open profile', error?.message ?? 'Please try again.');
    }
  }

  function Settings() {
    const [query, setQuery] = React.useState('');
    const [revision, refresh] = useRefresh();
    const data = snapshot();
    const scheme = typeof RN.useColorScheme === 'function' ? RN.useColorScheme() : 'dark';
    const dark = (optional(() => themeStore?.theme) ?? scheme) !== 'light';
    const c = dark
      ? { bg: '#111214', card: '#202226', text: '#f2f3f5', muted: '#b5bac1', border: '#383a40', accent: '#a7afff', button: '#323743' }
      : { bg: '#f2f3f5', card: '#fff', text: '#1e1f22', muted: '#5c6068', border: '#d4d7dc', accent: '#4752c4', button: '#eef0ff' };
    const Pressable = RN.Pressable ?? RN.TouchableOpacity;
    const text = (value, style = {}, props = {}) => h(RN.Text,
      { style: { color: c.text, fontSize: 15, lineHeight: 21, ...style }, ...props }, value);
    const rows = searchRows(data.rows, query);
    const header = h(RN.View, { style: { paddingBottom: 14 } },
      text('Friends List', { fontSize: 25, lineHeight: 32, fontWeight: '800' }),
      text('All your Discord friends, in one place. Tap a friend to view their profile.', { color: c.muted, marginTop: 6 }),
      h(RN.View, { style: { backgroundColor: c.card, borderRadius: 12, padding: 18, marginVertical: 16 } },
        text('Total friends', { color: c.muted, fontWeight: '600' }),
        text(data.total === null ? 'Unavailable' : String(data.total),
          { fontSize: data.total === null ? 22 : 40, lineHeight: 48, fontWeight: '800', color: c.accent, marginTop: 4 },
          { accessibilityLabel: data.total === null ? 'Friends list unavailable' : `${data.total} total friends`, accessibilityLiveRegion: 'polite' }),
        text('Includes online and offline friends.', { color: c.muted, fontSize: 13, marginTop: 4 })),
      h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 } },
        text('Your friends', { flex: 1, fontWeight: '700' }),
        h(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Refresh friends list', onPress: refresh,
          style: { minHeight: 44, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 8, backgroundColor: c.button } },
          text('Refresh', { color: c.accent, fontWeight: '700' }))),
      h(RN.TextInput, {
        accessibilityLabel: 'Search friends by name, username or user ID', value: query, onChangeText: setQuery,
        placeholder: 'Search name, username or ID', placeholderTextColor: c.muted,
        autoCorrect: false, autoCapitalize: 'none', returnKeyType: 'search',
        style: { color: c.text, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 46 },
      }),
      query.trim() && !data.error ? text(`${rows.length} matching ${rows.length === 1 ? 'friend' : 'friends'}`,
        { color: c.muted, marginTop: 10 }) : null);
    return h(RN.FlatList, {
      style: { flex: 1, backgroundColor: c.bg }, contentContainerStyle: { padding: 16, paddingBottom: 60 },
      data: rows, keyExtractor: row => row.id, extraData: `${revision}:${query}:${data.token.account}:${generation}`,
      keyboardShouldPersistTaps: 'handled', keyboardDismissMode: 'on-drag',
      initialNumToRender: 12, maxToRenderPerBatch: 12, windowSize: 7,
      ListHeaderComponent: header,
      ListEmptyComponent: text(data.error ?? (query.trim() ? 'No friends match your search.' : 'You have no Discord friends yet.'),
        { color: c.muted, paddingVertical: 20 }),
      renderItem: ({ item: row }) => h(Pressable, {
        accessibilityRole: 'button', accessibilityLabel: `Open ${row.name}’s profile`,
        onPress: () => { void openProfile(row.id, data.token); },
        style: { backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
      },
      row.avatar ? h(RN.Image, { source: { uri: row.avatar }, style: { width: 46, height: 46, borderRadius: 23, marginRight: 12 } })
        : h(RN.View, { style: { width: 46, height: 46, borderRadius: 23, marginRight: 12, backgroundColor: c.button,
          alignItems: 'center', justifyContent: 'center' } },
          text(row.name === 'Unknown friend' ? '?' : row.name.slice(0, 1).toUpperCase(), { fontSize: 22, fontWeight: '700' })),
      h(RN.View, { style: { flex: 1 } },
        text(row.name, { fontWeight: '700' }, { numberOfLines: 2 }),
        text(row.tag, { color: c.muted, fontSize: 13 }, { numberOfLines: 1 }),
        text(row.id, { color: c.muted, fontSize: 12 }, { selectable: true })),
      text('›', { color: c.muted, fontSize: 26, lineHeight: 30, marginLeft: 10 })),
    });
  }

  function openSettings() {
    if (!active) return;
    try {
      const navigation = byProps('getRootNavigationRef')?.getRootNavigationRef?.();
      if (typeof navigation?.navigate !== 'function') throw new Error('Please open Friends List’s Configure button on the Plugins page.');
      navigation.navigate('BUNNY_CUSTOM_PAGE', { title: 'Friends List', render: Settings });
    } catch (error) { log(error); RN.Alert.alert('Friends List', error?.message ?? 'Could not open the list.'); }
  }

  return {
    onLoad() {
      if (active) return;
      active = true; generation++; emit();
      try {
        removeShortcut = attachSettingsShortcut({
          api: host.bunny?.ui?.settings ?? host.window?.bunny?.ui?.settings,
          constants: byProps('SETTING_RENDERER_CONFIG'), Settings, open: openSettings, useTrailing: useTotalLabel,
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
      optional(() => removeShortcut?.()); removeShortcut = undefined;
      for (const dispose of [...subscriptions]) dispose();
      listeners.clear();
      userStore = relationshipStore = themeStore = profileActions = undefined;
    },
    settings: Settings,
    // Internal helpers for integration tests; Revenge uses lifecycle and settings.
    controller: { snapshot, subscribe, openProfile },
  };
}

return createPlugin(vendetta);
})()
