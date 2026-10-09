import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { blockedIDs, makeRows, searchRows } from '../src/model.mjs';

const bundle = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const A = '100000000000000001';
const B = '100000000000000002';
const C = '100000000000000003';
const ACCOUNT = '200000000000000001';
const OTHER = '200000000000000002';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(options = {}) {
  let account = ACCOUNT;
  const relationships = { [A]: 2, [B]: 1, [C]: 5 };
  const users = { [A]: { id: A, username: 'berry', globalName: 'Berry', discriminator: '0', avatar: 'a_abc123' } };
  const calls = [], alerts = [], toasts = [], errors = [], effects = [];
  const makeStore = methods => {
    const listeners = new Set();
    return { ...methods, listeners, addChangeListener: fn => listeners.add(fn),
      removeChangeListener: fn => listeners.delete(fn), emit: () => { for (const fn of listeners) fn(); } };
  };
  const userStore = makeStore({ getCurrentUser: () => ({ id: account }), getUser: id => users[id] });
  const relationshipStore = makeStore({ getRelationships: () => relationships, isBlocked: id => relationships[id] === 2 });
  const themeStore = makeStore({ theme: 'dark' });
  const stores = { UserStore: userStore, RelationshipStore: relationshipStore, ThemeStore: themeStore };
  const eventListeners = new Map();
  const appListeners = new Set();
  const modules = {};
  if (!options.noProfiles) {
    modules[options.profileMethod ?? 'showUserProfile'] = {
      [options.profileMethod ?? 'showUserProfile'](value) { calls.push(['profile', value]); return options.profile?.(value); },
    };
  }
  if (!options.noActions) modules.removeRelationship = {
    removeRelationship(id, context) {
      calls.push(['remove', id, context]);
      if (options.remove) return options.remove(id, relationships);
      delete relationships[id]; relationshipStore.emit();
      return Promise.resolve({ ok: true });
    },
    addRelationship() { throw new Error('Should never add relationships'); },
  };
  let stateIndex = 0;
  const states = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
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
      findByProps: (...keys) => Object.values(modules).find(module => keys.every(key => key in module)),
    },
    ui: { toasts: { showToast: message => toasts.push(message) } },
    logger: { error: (...args) => errors.push(args) },
  };
  // Same expression and vendetta injection used by Revenge's compatibility loader.
  const plugin = new Function('vendetta', `return ${bundle}`)(V);
  if (!options.disabled) plugin.onLoad();
  const render = () => { stateIndex = 0; return plugin.settings(); };
  return { plugin, controller: plugin.controller, relationships, users, calls, alerts, toasts, errors,
    userStore, relationshipStore, themeStore, eventListeners, appListeners, effects, render,
    switchAccount: value => { account = value; userStore.emit(); }, stores };
}

test('bundle is installable and manifest hash matches its exact bytes', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.main, 'index.js');
  assert.equal(manifest.hash, createHash('sha256').update(bundle).digest('hex'));
  const s = setup();
  assert.equal(typeof s.plugin.settings, 'function');
  assert.equal(s.calls.length, 0, 'loading must not fetch profiles or change relationships');
});

test('list only includes blocked users, preserving snowflake strings', () => {
  const s = setup();
  s.relationships[C] = { type: 2 };
  s.relationships.invalid = 2;
  const rows = s.controller.snapshot().rows;
  assert.deepEqual(rows.map(row => row.id).sort(), [A, C]);
  assert.equal(rows.find(row => row.id === A).tag, '@berry');
  assert.equal(rows.find(row => row.id === C).name, 'Unknown user');
});

test('relationship readers support map, array and blocked-ID fallback shapes', () => {
  assert.deepEqual(blockedIDs({ getRelationships: () => new Map([[A, 2], [B, 1], [C, 5]]) }), [A]);
  assert.deepEqual(blockedIDs({ getRelationships: () => [{ user: { id: A }, type: 2 }, { id: B, type: 3 }] }), [A]);
  assert.deepEqual(blockedIDs({ getBlockedIDs: () => new Set([A, '123', B]) }), [A, B]);
  assert.throws(() => blockedIDs({}), /does not expose/);
});

test('search covers case-insensitive display names, usernames and exact ID text', () => {
  const rows = makeRows([A, B], id => id === A ? { username: 'berry', globalName: 'Strawberry Whirl' } : undefined);
  assert.equal(searchRows(rows, 'WHIRL')[0].id, A);
  assert.equal(searchRows(rows, '@Berry')[0].id, A);
  assert.equal(searchRows(rows, B)[0].id, B);
  assert.equal(searchRows(rows, 'does not exist').length, 0);
  assert.equal(searchRows(rows, ' ').length, 2);
});

test('profile actions use a string userId and never unblock', async () => {
  for (const profileMethod of ['showUserProfile', 'openUserProfile', 'openUserProfileModal']) {
    const s = setup({ profileMethod });
    await s.controller.openProfile(A, s.controller.snapshot().token);
    assert.deepEqual(s.calls, [['profile', { userId: A }]]);
    assert.equal(s.relationships[A], 2);
  }
});

test('confirmation cancel leaves the block intact; confirm removes only that user', async () => {
  const s = setup();
  const data = s.controller.snapshot();
  s.controller.requestUnblock(data.rows[0], data.token);
  assert.equal(s.calls.length, 0);
  assert.equal(s.alerts[0][2][0].style, 'cancel');
  s.alerts[0][2][1].onPress();
  await Promise.resolve();
  assert.equal(s.relationships[A], undefined);
  assert.equal(s.relationships[B], 1);
  assert.equal(s.relationships[C], 5);
  assert.equal(s.calls.filter(call => call[0] === 'remove').length, 1);
  assert.equal(s.controller.snapshot().rows.length, 0);
});

test('stale confirmation after account switching cannot unblock', async () => {
  const s = setup();
  const data = s.controller.snapshot();
  s.controller.requestUnblock(data.rows[0], data.token);
  s.switchAccount(OTHER);
  s.alerts[0][2][1].onPress();
  await Promise.resolve();
  assert.equal(s.calls.length, 0);
  assert.equal(s.relationships[A], 2);
  await s.controller.openProfile(A, data.token);
  assert.equal(s.calls.length, 0);
});

test('stale relationship is rechecked before removal, preventing friend deletion', async () => {
  const s = setup();
  const data = s.controller.snapshot();
  s.controller.requestUnblock(data.rows[0], data.token);
  s.relationships[A] = 1;
  s.alerts[0][2][1].onPress();
  await Promise.resolve();
  assert.equal(s.calls.length, 0);
  assert.equal(s.relationships[A], 1);
});

test('duplicate taps during a request send one unblock action', async () => {
  const request = deferred();
  const s = setup({ remove: () => request.promise });
  const value = s.controller.snapshot().token;
  const first = s.controller.unblock(A, value);
  assert.equal(s.controller.isPending(A, value), true);
  assert.equal(await s.controller.unblock(A, value), false);
  assert.equal(s.calls.length, 1);
  delete s.relationships[A]; request.resolve({ ok: true });
  assert.equal(await first, true);
  assert.equal(s.controller.isPending(A, value), false);
});

test('network errors and failure responses keep blocked users visible', async () => {
  for (const remove of [() => Promise.reject(new Error('Network offline')), () => Promise.resolve({ ok: false, status: 403 }), () => false]) {
    const s = setup({ remove });
    const value = s.controller.snapshot().token;
    assert.equal(await s.controller.unblock(A, value), false);
    assert.equal(s.controller.snapshot().rows[0].id, A);
    assert.equal(s.alerts[0][0], 'Could not unblock user');
    assert.equal(s.controller.isPending(A, value), false);
  }
});

test('pending completion after account change emits no success alert to the new account', async () => {
  const request = deferred();
  const s = setup({ remove: () => request.promise });
  const work = s.controller.unblock(A, s.controller.snapshot().token);
  s.switchAccount(OTHER); request.resolve({ ok: true });
  await work;
  assert.equal(s.toasts.length, 0);
});

test('missing modules produce useful errors and do not invent an empty list', async () => {
  const s = setup({ noProfiles: true, noActions: true });
  const value = s.controller.snapshot().token;
  await s.controller.openProfile(A, value);
  assert.match(s.alerts[0][1], /unavailable/);
  assert.equal(await s.controller.unblock(A, value), false);
  assert.equal(s.relationships[A], 2);
  delete s.stores.RelationshipStore;
  assert.match(s.controller.snapshot().error, /not ready/);
});

test('list rendering uses virtualized rows and live search, and exposes profile/unblock buttons', () => {
  const s = setup();
  const tree = s.render();
  assert.equal(tree.type, 'FlatList');
  assert.equal(tree.props.data.length, 1);
  const all = root => !root || typeof root !== 'object' ? [] : [root, ...(root.props?.children ?? []).flatMap(all)];
  const header = all(tree.props.ListHeaderComponent);
  const search = header.find(node => node.type === 'TextInput');
  search.props.onChangeText('not found');
  assert.equal(s.render().props.data.length, 0);
  search.props.onChangeText('BERRY');
  const filtered = s.render();
  const row = filtered.props.renderItem({ item: filtered.props.data[0] });
  const buttons = all(row).filter(node => node.type === 'Pressable');
  assert.ok(buttons.some(button => button.props.accessibilityLabel === 'Profile'));
  assert.ok(buttons.some(button => button.props.accessibilityLabel === 'Unblock'));
});

test('screen subscriptions clean up on close and disable; stale actions cannot run after re-enable', async () => {
  const s = setup();
  let changes = 0;
  const value = s.controller.snapshot().token;
  const close = s.controller.subscribe(() => changes++);
  s.relationshipStore.emit(); assert.equal(changes, 1);
  close(); s.relationshipStore.emit(); assert.equal(changes, 1);
  assert.equal(s.appListeners.size, 0);
  s.controller.subscribe(() => changes++);
  s.plugin.onUnload();
  assert.equal(s.relationshipStore.listeners.size, 0);
  assert.equal(s.userStore.listeners.size, 0);
  assert.equal(s.themeStore.listeners.size, 0);
  assert.equal([...s.eventListeners.values()].reduce((sum, items) => sum + items.size, 0), 0);
  assert.equal(s.appListeners.size, 0);
  assert.match(s.controller.snapshot().error, /Enable/);
  s.plugin.onLoad();
  assert.equal(await s.controller.unblock(A, value), false);
  assert.equal(s.calls.length, 0);
});
