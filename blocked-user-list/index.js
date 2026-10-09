(() => {
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
  let userStore, relationshipStore, themeStore, profileActions, relationshipActions;

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

  function snapshot() {
    resolveStores();
    const value = token();
    try {
      if (!active) throw new Error('Enable Blocked User List from the Plugins page to use it.');
      if (!validID(value.account)) throw new Error('Discord is still loading your account. Tap Refresh to try again.');
      return { token: value, rows: makeRows(blockedIDs(relationshipStore), id => userStore?.getUser?.(id)), error: null };
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
    RN.Alert.alert('Unblock this user?', `${row.name}\n${row.tag}\n${row.id}\n\nThis removes them from your blocked-user list.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unblock', onPress: () => { void unblock(row.id, value); } },
    ]);
  }

  function Settings() {
    const [query, setQuery] = React.useState('');
    const [revision, update] = React.useState(0);
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
    const header = h(RN.View, { style: { paddingBottom: 14 } },
      text('Blocked User List', { fontSize: 25, lineHeight: 32, fontWeight: '800' }),
      text('Tap a user to view their profile, or unblock them below.', { color: c.muted, marginTop: 6 }),
      h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 } },
        text(data.error ? 'List unavailable' : `${data.rows.length} blocked ${data.rows.length === 1 ? 'user' : 'users'}`, { flex: 1, fontWeight: '700' }),
        button('Refresh', refresh)),
      h(RN.TextInput, {
        accessibilityLabel: 'Search blocked users by name, username or user ID', value: query, onChangeText: setQuery,
        placeholder: 'Search name, username or ID', placeholderTextColor: c.muted,
        autoCorrect: false, autoCapitalize: 'none', returnKeyType: 'search',
        style: { color: c.text, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 46 },
      }),
      query.trim() && !data.error ? text(`${rows.length} matching ${rows.length === 1 ? 'user' : 'users'}`, { color: c.muted, marginTop: 10 }) : null,
    );
    return h(RN.FlatList, {
      style: { flex: 1, backgroundColor: c.bg }, contentContainerStyle: { padding: 16, paddingBottom: 60 },
      data: rows, keyExtractor: row => row.id, extraData: `${revision}:${query}:${data.token.account}:${generation}`,
      keyboardShouldPersistTaps: 'handled', keyboardDismissMode: 'on-drag',
      initialNumToRender: 12, maxToRenderPerBatch: 12, windowSize: 7,
      ListHeaderComponent: header,
      ListEmptyComponent: text(data.error ?? (query.trim() ? 'No blocked users match your search.' : 'You have no blocked users.'), { color: c.muted, paddingVertical: 20 }),
      renderItem: ({ item: row }) => {
        const busy = pending.has(key(row.id, data.token));
        return h(RN.View, { style: { backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 12 } },
          h(Pressable, { accessibilityRole: 'button', accessibilityLabel: `Open ${row.name}’s profile`,
            onPress: () => { void openProfile(row.id, data.token); }, style: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12 } },
            row.avatar ? h(RN.Image, { source: { uri: row.avatar }, style: { width: 46, height: 46, borderRadius: 23, marginRight: 12 } })
              : h(RN.View, { style: { width: 46, height: 46, borderRadius: 23, marginRight: 12, backgroundColor: c.button, alignItems: 'center', justifyContent: 'center' } },
                text(row.name === 'Unknown user' ? '?' : row.name.slice(0, 1).toUpperCase(), { fontSize: 22, fontWeight: '700' })),
            h(RN.View, { style: { flex: 1 } },
              text(row.name, { fontWeight: '700' }, { numberOfLines: 2 }),
              text(row.tag, { color: c.muted, fontSize: 13 }, { numberOfLines: 1 }),
              text(row.id, { color: c.muted, fontSize: 12 }, { selectable: true }))),
          h(RN.View, { style: { flexDirection: 'row' } },
            button('Profile', () => { void openProfile(row.id, data.token); }, false, { flex: 1, marginRight: 10 }),
            button(busy ? 'Unblocking…' : 'Unblock', () => requestUnblock(row, data.token), busy, { flex: 1 })),
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
      optional(() => removeShortcut?.()); removeShortcut = undefined;
      for (const dispose of [...subscriptions]) dispose();
      listeners.clear(); pending.clear();
      userStore = relationshipStore = themeStore = profileActions = relationshipActions = undefined;
    },
    settings: Settings,
    // Kept internal to the evaluated plugin object; Revenge only uses lifecycle/settings.
    controller: { snapshot, subscribe, openProfile, requestUnblock, unblock, isPending: (id, value) => pending.has(key(id, value)) },
  };
}

return createPlugin(vendetta);
})()
