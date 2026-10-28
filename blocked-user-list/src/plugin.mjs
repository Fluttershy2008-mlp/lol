import { openUserProfile } from '../../compatibility/user-profile.mjs';

export function createPlugin(V, host = globalThis) {
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
  let userStore, relationshipStore, themeStore, relationshipActions, blockActions;
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
      // Use Discord’s native profile UI, which loads the current profile itself.
      const opened = await openUserProfile(V, { userId: id }, () => live(value));
      if (!opened && live(value)) throw new Error('Profile buttons are unavailable on this Discord version.');
    } catch (error) {
      if (!live(value)) return;
      log(error);
      RN.Alert.alert('Could not open profile', error?.message ?? 'Please try again.');
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
      userStore = relationshipStore = themeStore = relationshipActions = blockActions = undefined;
    },
    settings: Settings,
    // Kept internal to the evaluated plugin object; Revenge only uses lifecycle/settings.
    controller: { snapshot, subscribe, openProfile, requestUnblock, unblock, block, blockApp, unblockApp, isPending: (id, value) => pending.has(key(id, value)) },
  };
}
