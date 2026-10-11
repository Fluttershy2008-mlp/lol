import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { friendIDs, makeRows, searchRows } from '../src/model.mjs';

const bundle = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const A = '100000000000000001', B = '100000000000000002', C = '100000000000000003';
const D = '100000000000000004', E = '100000000000000005', F = '100000000000000006';
const ACCOUNT = '200000000000000001', OTHER = '200000000000000002';

function setup(options = {}) {
  let account = ACCOUNT;
  const relationships = { [A]: 1, [B]: 1, [C]: 2, [D]: 3, [E]: 4, [F]: 5 };
  const users = { [A]: { id: A, username: 'berry', globalName: 'Strawberry Whirl', discriminator: '0', avatar: 'a_abc123' } };
  const calls = [], alerts = [], errors = [], effects = [];
  const makeStore = methods => {
    const listeners = new Set();
    return { ...methods, listeners, addChangeListener: fn => listeners.add(fn),
      removeChangeListener: fn => listeners.delete(fn), emit: () => { for (const fn of [...listeners]) fn(); } };
  };
  const userStore = makeStore({ getCurrentUser: () => account ? { id: account } : undefined, getUser: id => users[id] });
  const relationshipStore = makeStore({ getRelationships: () => relationships, isFriend: id => relationships[id] === 1 });
  const themeStore = makeStore({ theme: 'dark' });
  const stores = { UserStore: userStore, RelationshipStore: relationshipStore, ThemeStore: themeStore };
  const eventListeners = new Map(), appListeners = new Set();
  const modules = { ...(options.modules ?? {}) };
  if (!options.noProfiles) {
    const method = options.profileMethod ?? 'showUserProfile';
    modules[method] = { [method](value) { calls.push(['profile', value]); return options.profile?.(value); } };
  }
  modules.removeRelationship = {
    removeRelationship() { throw new Error('Friends List must not remove a friendship'); },
    addRelationship() { throw new Error('Friends List must not add a friendship'); },
    fetchProfile() { throw new Error('Friends List must not bulk-fetch profiles'); },
  };
  let stateIndex = 0, updates = 0;
  const states = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; updates++; }];
    },
    useCallback: fn => fn,
    useEffect: fn => effects.push(fn),
  };
  const RN = {
    Text: 'Text', View: 'View', Image: 'Image', TextInput: 'TextInput', FlatList: 'FlatList', Pressable: 'Pressable',
    Alert: { alert: (...args) => alerts.push(args) }, useColorScheme: () => 'dark',
    AppState: { addEventListener: (_event, fn) => { appListeners.add(fn); return { remove: () => appListeners.delete(fn) }; } },
  };
  const V = {
    metro: {
      common: { React, ReactNative: RN, FluxDispatcher: {
        subscribe: (type, fn) => { if (!eventListeners.has(type)) eventListeners.set(type, new Set()); eventListeners.get(type).add(fn); },
        unsubscribe: (type, fn) => eventListeners.get(type)?.delete(fn),
      } },
      findByStoreName: name => stores[name],
      findByProps: (...keys) => Object.values({ ...stores, ...modules }).find(module => keys.every(key => key in module)),
    },
    ui: { assets: { getAssetIDByName: name => name === 'FriendsIcon' ? 123 : undefined } },
    logger: { error: (...args) => errors.push(args) },
  };
  const plugin = new Function('vendetta', 'globalThis', `return ${bundle}`)(V, options.host ?? {});
  if (!options.disabled) plugin.onLoad();
  const render = () => { stateIndex = 0; return plugin.settings(); };
  const renderHook = fn => { stateIndex = 0; return fn(); };
  return { plugin, controller: plugin.controller, relationships, users, calls, alerts, errors,
    userStore, relationshipStore, themeStore, eventListeners, appListeners, effects, render, renderHook, stores, V,
    updateCount: () => updates, switchAccount: value => { account = value; userStore.emit(); } };
}

const descendants = node => !node || typeof node !== 'object' ? []
  : [node, ...(node.props?.children ?? []).flatMap(descendants)];

test('installable bundle and manifest hash match; loading sends no profile or relationship actions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.main, 'index.js');
  assert.equal(manifest.hash, createHash('sha256').update(bundle).digest('hex'));
  assert.deepEqual(manifest.authors, [{ name: 'fluttershy_simper' }]);
  const s = setup();
  assert.equal(typeof s.plugin.settings, 'function');
  assert.equal(s.controller.snapshot().total, 2);
  assert.deepEqual(s.calls, []);
});

test('accepted offline and uncached friends count; blocked, pending and ignored users do not', () => {
  const s = setup();
  s.relationships.invalid = 1;
  s.relationships[F] = { type: '1' };
  const data = s.controller.snapshot();
  assert.equal(data.total, 3);
  assert.deepEqual(data.rows.map(row => row.id).sort(), [A, B, F]);
  assert.equal(data.rows.find(row => row.id === B).name, 'Unknown friend');
  assert.equal(data.rows.find(row => row.id === A).tag, '@berry');
  assert.equal(s.relationships[C], 2);
});

test('supports native friend-ID methods and relationship object, map and array shapes', () => {
  assert.deepEqual(friendIDs({ getFriendIDs: () => [A, A, B, '123', Number(A)] }), [A, B]);
  assert.deepEqual(friendIDs({ getFriendIds: () => new Set([A, B]) }), [A, B]);
  assert.deepEqual(friendIDs({ getRelationships: () => ({ [A]: 1, [B]: { type: 1 }, [C]: 2 }) }), [A, B]);
  assert.deepEqual(friendIDs({ getRelationships: () => new Map([[A, 1], [B, 3], [C, 4]]) }), [A]);
  assert.deepEqual(friendIDs({ getMutableRelationships: () => [{ user: { id: A }, type: 1 }, { id: B, type: 2 }] }), [A]);
  assert.deepEqual(friendIDs({ getRelationships: () => [[A, 1], [B, 4]] }), [A]);
  assert.deepEqual(friendIDs({ getFriendIDs: () => undefined, getRelationships: () => ({ [A]: 1 }) }), [A]);
  assert.throws(() => friendIDs({}), /does not expose/);
  assert.throws(() => friendIDs(null), /not ready/);
});

test('native friend-ID list remains complete even when only one profile is cached', () => {
  const s = setup();
  s.relationshipStore.getFriendIDs = () => [A, B, F];
  delete s.relationshipStore.getRelationships;
  assert.equal(s.controller.snapshot().total, 3);
  assert.equal(s.controller.snapshot().rows.length, 3);
});

test('search and sorting support display names, old and new usernames, and exact snowflake strings', () => {
  const rows = makeRows([B, A, C], id => id === A ? { username: 'berry', globalName: 'Strawberry Whirl' }
    : id === B ? { username: 'alpha', discriminator: 1234 } : { username: 'Zebra', discriminator: 0 });
  assert.deepEqual(rows.map(row => row.id), [B, A, C]);
  assert.equal(searchRows(rows, 'WHIRL')[0].id, A);
  assert.equal(searchRows(rows, 'ALPHA#1234')[0].id, B);
  assert.equal(searchRows(rows, '@zebra')[0].id, C);
  assert.equal(searchRows(rows, C)[0].id, C);
  assert.equal(searchRows(rows, 'no result').length, 0);
  assert.equal(searchRows(rows, ' ').length, 3);
  assert.equal(makeRows([A], () => { throw new Error('not cached'); }).length, 1);
});

test('search filters the virtualized list while the total count stays unchanged', () => {
  const s = setup();
  const tree = s.render();
  assert.equal(tree.type, 'FlatList');
  assert.equal(tree.props.data.length, 2);
  const header = descendants(tree.props.ListHeaderComponent);
  const search = header.find(node => node.type === 'TextInput');
  search.props.onChangeText('WHIRL');
  const filtered = s.render();
  assert.equal(filtered.props.data.length, 1);
  assert.ok(descendants(filtered.props.ListHeaderComponent).some(node => node.props.accessibilityLabel === '2 total friends'));
  search.props.onChangeText('does not exist');
  assert.equal(s.render().props.data.length, 0);
  assert.equal(s.controller.snapshot().total, 2);
});

test('tapping cached and uncached friends opens the native profile with the string user ID', async () => {
  for (const profileMethod of ['showUserProfile', 'openUserProfile', 'openUserProfileModal']) {
    const s = setup({ profileMethod });
    const tree = s.render();
    const row = tree.props.renderItem({ item: tree.props.data.find(item => item.id === B) });
    row.props.onPress();
    await Promise.resolve();
    assert.deepEqual(s.calls, [['profile', { userId: B }]]);
    assert.equal(s.relationships[B], 1);
  }
});

test('account switches, logout and disabling invalidate stale profile buttons', async () => {
  const s = setup();
  const token = s.controller.snapshot().token;
  s.switchAccount(OTHER);
  await s.controller.openProfile(A, token);
  assert.deepEqual(s.calls, []);
  s.switchAccount(null);
  assert.equal(s.controller.snapshot().total, null);
  assert.match(s.controller.snapshot().error, /loading your account/);
  s.switchAccount(ACCOUNT);
  s.plugin.onUnload(); s.plugin.onLoad();
  await s.controller.openProfile(A, token);
  assert.deepEqual(s.calls, []);
});

test('missing stores and profile failures show useful errors instead of a false zero count', async () => {
  const s = setup({ noProfiles: true });
  await s.controller.openProfile(A, s.controller.snapshot().token);
  assert.match(s.alerts[0][1], /unavailable/);
  delete s.stores.RelationshipStore;
  const data = s.controller.snapshot();
  assert.equal(data.total, null);
  assert.match(data.error, /not ready/);
  const failing = setup({ profile: () => Promise.reject(new Error('Profile could not load')) });
  await failing.controller.openProfile(A, failing.controller.snapshot().token);
  assert.equal(failing.alerts[0][1], 'Profile could not load');
});

test('friend changes, account changes, reconnect and app resume notify subscribers', () => {
  const s = setup();
  let changes = 0;
  const close = s.controller.subscribe(() => changes++);
  s.relationships[F] = 1; s.relationshipStore.emit();
  assert.equal(s.controller.snapshot().total, 3);
  delete s.relationships[A]; s.relationshipStore.emit();
  assert.equal(s.controller.snapshot().total, 2);
  for (const fn of s.eventListeners.get('CONNECTION_OPEN')) fn();
  for (const fn of s.appListeners) fn('active');
  s.switchAccount(OTHER);
  assert.equal(changes, 5);
  close(); close(); s.relationshipStore.emit();
  assert.equal(changes, 5);
  assert.equal(s.appListeners.size, 0);
});

test('mounting the list subscribes its refresh hook; disabling removes all listeners', () => {
  const s = setup();
  s.render();
  const cleanups = s.effects.map(effect => effect());
  const before = s.updateCount();
  s.relationshipStore.emit();
  assert.ok(s.updateCount() > before);
  s.plugin.onUnload();
  for (const store of [s.userStore, s.relationshipStore, s.themeStore]) assert.equal(store.listeners.size, 0);
  assert.equal([...s.eventListeners.values()].reduce((sum, values) => sum + values.size, 0), 0);
  assert.equal(s.appListeners.size, 0);
  for (const cleanup of cleanups) cleanup?.();
  assert.match(s.controller.snapshot().error, /Enable Friends List/);
});

test('bundle adds a shortcut next to Blocked Users, exposes live count, and opens its settings screen', () => {
  const keys = ['BUNNY', 'BUNNY_PLUGINS', 'FLUTTERSHY_BLOCKED_USERS', 'BUNNY_THEMES', 'BUNNY_FONTS', 'ACCOUNT_SWITCHER'];
  const rows = keys.map(key => ({ key }));
  const host = { bunny: { ui: { settings: { registeredSections: { Revenge: rows } } } } };
  const constants = { SETTING_RENDERER_CONFIG: { ACCOUNT: { parent: null }, FLUTTERSHY_BLOCKED_USERS: { parent: null } } };
  const navigations = [];
  const s = setup({ host, modules: { constants,
    navigation: { getRootNavigationRef: () => ({ navigate: (...args) => navigations.push(args) }) } } });
  const key = 'FLUTTERSHY_FRIENDS_LIST';
  assert.deepEqual(rows.map(row => row.key), [...keys.slice(0, 3), key, ...keys.slice(3)]);
  const config = constants.SETTING_RENDERER_CONFIG[key];
  assert.equal(config.icon, 123);
  assert.equal(s.renderHook(config.useTrailing), '2 friends');
  const cleanups = s.effects.map(effect => effect());
  s.relationships[F] = 1; s.relationshipStore.emit();
  assert.ok(s.updateCount() > 0);
  assert.equal(s.renderHook(config.useTrailing), '3 friends');
  config.onPress();
  assert.equal(navigations[0][0], 'BUNNY_CUSTOM_PAGE');
  assert.equal(navigations[0][1].title, 'Friends List');
  assert.equal(navigations[0][1].render, s.plugin.settings);
  s.plugin.onUnload();
  assert.deepEqual(rows.map(row => row.key), keys);
  assert.equal(constants.SETTING_RENDERER_CONFIG[key].usePredicate(), false);
  assert.ok(constants.SETTING_RENDERER_CONFIG.FLUTTERSHY_BLOCKED_USERS);
  config.onPress();
  assert.equal(navigations.length, 1);
  cleanups.forEach(cleanup => cleanup?.());
});
