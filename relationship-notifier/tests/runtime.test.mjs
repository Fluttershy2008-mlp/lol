import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { createPlugin } from '../src/plugin.js';
import { SHORTCUT_KEY } from '../src/shortcut.js';

function fakeClock() {
  let time = 1000, next = 0;
  const jobs = new Map();
  const clock = {
    now: () => time,
    setTimeout(fn, delay) { const id = ++next; jobs.set(id, { fn, at: time + delay }); return id; },
    clearTimeout: id => jobs.delete(id),
    setInterval(fn, delay) { const id = ++next; jobs.set(id, { fn, at: time + delay, every: delay }); return id; },
    clearInterval: id => jobs.delete(id),
    tick(delta) {
      const target = time + delta;
      for (;;) {
        const job = [...jobs].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!job) break;
        time = job[1].at;
        if (job[1].every) job[1].at += job[1].every; else jobs.delete(job[0]);
        job[1].fn();
      }
      time = target;
    },
    jobs,
  };
  return clock;
}

function setup({ storage = {}, map = false, connected = true, host = {} } = {}) {
  const clock = fakeClock();
  const subscriptions = new Map(), toasts = [], alerts = [], errors = [], patches = new Set();
  const state = { user: 'me', connected, relationships: { '101': 1, '102': 3 }, guilds: { '201': { id: '201', name: 'Cloudsdale' } }, channels: { '301': { id: '301', type: 3, name: 'Pony chat' }, '302': { id: '302', type: 1 } }, unavailable: new Set() };
  const dispatch = (type, payload = {}) => { for (const fn of subscriptions.get(type) ?? []) fn({ type, ...payload }); };
  const stores = {
    UserStore: { getCurrentUser: () => state.user ? { id: state.user } : null, getUser: id => ({ id, username: id === '101' ? 'Alice' : 'Bob', discriminator: '0' }) },
    RelationshipStore: map ? { getMutableRelationships: () => new Map(Object.entries(state.relationships)) } : { getRelationships: () => state.relationships },
    GuildStore: { getGuilds: () => state.guilds },
    ChannelStore: { getPrivateChannels: () => Object.keys(state.channels), getChannel: id => state.channels[id] },
    GuildAvailabilityStore: { isUnavailable: id => state.unavailable.has(id) },
    ConnectionStore: { isConnected: () => state.connected },
    ThemeStore: { theme: 'light' },
  };
  let failAction = false;
  const actions = {
    removeRelationship(id) { if (failAction) return Promise.reject(new Error('Request failed')); delete state.relationships[id]; dispatch('RELATIONSHIP_REMOVE', { relationship: { id, type: 1 } }); return Promise.resolve('removed'); },
    addRelationship(id, type) { state.relationships[id] = type; dispatch('RELATIONSHIP_UPDATE'); return Promise.resolve('added'); },
    leaveGuild(id) { delete state.guilds[id]; dispatch('GUILD_DELETE', { guild: { id } }); return Promise.resolve('left'); },
    closePrivateChannel(id) { delete state.channels[id]; dispatch('CHANNEL_DELETE', { channel: { id, type: 3 } }); return Promise.resolve('closed'); },
  };
  const api = { getAPIBaseURL() {}, get() {}, del: () => Promise.resolve('deleted'), put: () => Promise.resolve('updated') };
  const dispatcher = { subscribe(type, fn) { if (!subscriptions.has(type)) subscriptions.set(type, new Set()); subscriptions.get(type).add(fn); }, unsubscribe(type, fn) { subscriptions.get(type)?.delete(fn); } };
  let appStateHandler;
  const RN = {
    View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', Switch: 'Switch',
    useColorScheme: () => 'dark', Alert: { alert: (...args) => alerts.push(args) },
    AppState: { addEventListener(_, fn) { appStateHandler = fn; return { remove() { appStateHandler = null; } }; } },
  };
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect() {} };
  const V = {
    plugin: { storage }, logger: { warn: (...args) => errors.push(args) },
    metro: { findByStoreName: name => stores[name], findByProps: (...keys) => [actions, api, dispatcher].find(value => keys.every(key => key in value)), common: { React, ReactNative: RN, FluxDispatcher: dispatcher } },
    ui: { toasts: { showToast: text => toasts.push(text) }, assets: { getAssetIDByName: () => 1 } },
    patcher: { instead(key, target, callback) {
      const original = target[key];
      target[key] = function (...args) { return callback(args, original.bind(this)); };
      const unpatch = () => { target[key] = original; patches.delete(unpatch); };
      patches.add(unpatch); return unpatch;
    } },
  };
  const plugin = createPlugin(V, clock, host);
  return { plugin, V, clock, dispatch, stores, state, actions, api, storage, toasts, alerts, errors, patches, subscriptions, failAction: () => { failAction = true; }, appState: () => appStateHandler };
}

test('object and Map relationship stores both detect all supported removals', () => {
  for (const map of [false, true]) {
    const h = setup({ map }); h.plugin.onLoad(); h.clock.tick(5000);
    assert.equal(h.toasts.length, 0);
    h.state.relationships = {}; h.state.guilds = {}; h.state.channels = {};
    h.dispatch('RELATIONSHIP_REMOVE'); h.dispatch('GUILD_DELETE'); h.dispatch('CHANNEL_DELETE'); h.clock.tick(1000);
    assert.equal(h.toasts.length, 1); assert.match(h.toasts[0], /4 relationship changes/);
    assert.equal(h.storage.accounts.me.history.length, 4);
    h.clock.tick(60000); assert.equal(h.toasts.length, 1);
    h.plugin.onUnload();
  }
});

test('self initiated actions are ignored, promises preserved and rejection is reversible', async () => {
  const h = setup(); h.plugin.onLoad(); h.clock.tick(5000);
  assert.equal(await h.actions.removeRelationship('101'), 'removed');
  assert.equal(await h.actions.removeRelationship('102'), 'removed');
  assert.equal(await h.actions.leaveGuild('201'), 'left');
  assert.equal(await h.actions.closePrivateChannel('301'), 'closed');
  h.clock.tick(1000); assert.equal(h.toasts.length, 0);
  h.state.relationships = { '101': 1 }; h.dispatch('RELATIONSHIP_ADD'); h.clock.tick(1000);
  // Wait out earlier successful suppression before simulating a new failed action.
  h.clock.tick(120001); h.failAction();
  await assert.rejects(h.actions.removeRelationship('101'), /Request failed/);
  delete h.state.relationships['101']; h.dispatch('RELATIONSHIP_REMOVE'); h.clock.tick(1000);
  assert.equal(h.toasts.length, 1);
  h.plugin.onUnload();
});

test('REST fallback suppresses a manual removal if action exports are absent', async () => {
  const h = setup();
  h.V.metro.findByProps = (...keys) => keys.every(key => key in h.api) ? h.api : undefined;
  h.plugin.onLoad(); h.clock.tick(5000);
  await h.api.del({ url: '/users/@me/relationships/101' });
  delete h.state.relationships['101']; h.dispatch('RELATIONSHIP_REMOVE'); h.clock.tick(1000);
  assert.equal(h.toasts.length, 0);
  h.plugin.onUnload();
});

test('incoming request acceptance and local blocks do not generate removal alerts', async () => {
  const h = setup(); h.plugin.onLoad(); h.clock.tick(5000);
  await h.actions.addRelationship('102', 1);
  await h.actions.addRelationship('101', 2);
  h.clock.tick(1000); assert.equal(h.toasts.length, 0);
  h.plugin.onUnload();
});

test('offline snapshots survive disconnected and empty startup stores; reconnection compares once', () => {
  const first = setup(); first.plugin.onLoad(); first.clock.tick(5000); first.plugin.onUnload();
  const h = setup({ storage: JSON.parse(JSON.stringify(first.storage)), connected: false });
  h.state.relationships = {}; h.state.guilds = {}; h.state.channels = {};
  h.plugin.onLoad(); h.clock.tick(60000); assert.equal(h.toasts.length, 0);
  assert.equal(Object.keys(h.storage.accounts.me.snapshots.friends).length, 1);
  h.state.connected = true; h.state.guilds = first.state.guilds; h.state.channels = first.state.channels;
  h.dispatch('CONNECTION_OPEN', { user: { id: 'me' } }); h.clock.tick(4999); assert.equal(h.toasts.length, 0);
  h.state.relationships = { '102': 3 }; h.clock.tick(1);
  assert.equal(h.toasts.length, 1); assert.match(h.toasts[0], /Alice/);
  h.dispatch('CONNECTION_OPEN'); h.clock.tick(5000); assert.equal(h.toasts.length, 1);
  h.plugin.onUnload();
});

test('disconnect events pause comparisons even while ConnectionStore is briefly stale', () => {
  const h = setup(); h.plugin.onLoad(); h.clock.tick(5000);
  h.dispatch('CONNECTION_CLOSED'); h.state.relationships = {};
  h.clock.tick(60000); assert.equal(h.toasts.length, 0);
  h.state.relationships = { '101': 1, '102': 3 };
  h.dispatch('CONNECTION_OPEN'); h.clock.tick(5000); assert.equal(h.toasts.length, 0);
  h.plugin.onUnload();
});

test('unavailable server deletion and recovery do not notify', () => {
  const h = setup(); h.plugin.onLoad(); h.clock.tick(5000);
  const guild = h.state.guilds['201']; delete h.state.guilds['201'];
  h.dispatch('GUILD_DELETE', { guild: { id: '201', unavailable: true } }); h.clock.tick(1000);
  assert.equal(h.toasts.length, 0);
  h.state.guilds['201'] = guild; h.dispatch('GUILD_CREATE', { guild }); h.clock.tick(1000);
  delete h.state.guilds['201']; h.dispatch('GUILD_DELETE', { guild: { id: '201' } }); h.clock.tick(1000);
  assert.equal(h.toasts.length, 1);
  h.plugin.onUnload();
});

test('account switches and logout do not compare memberships across accounts', () => {
  const h = setup(); h.plugin.onLoad(); h.clock.tick(5000);
  h.state.user = 'second'; h.state.relationships = {};
  h.dispatch('CONNECTION_OPEN', { user: { id: 'second' } }); h.clock.tick(5000);
  assert.equal(h.toasts.length, 0);
  h.dispatch('LOGOUT'); h.state.user = null; h.clock.tick(60000);
  assert.equal(h.toasts.length, 0);
  h.state.user = 'me'; h.dispatch('CONNECTION_OPEN', { user: { id: 'me' } }); h.clock.tick(5000);
  assert.equal(h.storage.accounts.me.history.length, 2);
  assert.equal(h.storage.accounts.second.history.length, 0);
  h.plugin.onUnload();
});

test('missing lists remain intact and late hydration honors disabled offline checks', () => {
  const first = setup(); first.plugin.onLoad(); first.clock.tick(5000); first.plugin.onUnload();
  const h = setup({ storage: JSON.parse(JSON.stringify(first.storage)) });
  h.storage.options.offlineRemovals = false;
  h.stores.RelationshipStore.getRelationships = () => undefined;
  h.plugin.onLoad(); h.clock.tick(5000);
  assert.equal(Object.keys(h.storage.accounts.me.snapshots.friends).length, 1);
  h.state.relationships = {}; h.stores.RelationshipStore.getRelationships = () => h.state.relationships;
  h.clock.tick(30000); assert.equal(h.toasts.length, 0);
  h.plugin.onUnload();
});

test('all hooks, subscriptions and scheduled callbacks are cleaned on unload and re-enable', () => {
  const h = setup();
  const original = h.actions.removeRelationship;
  h.plugin.onLoad(); h.plugin.onLoad(); h.clock.tick(5000);
  assert.ok(h.patches.size > 0); assert.ok(h.appState());
  h.dispatch('RELATIONSHIP_REMOVE');
  h.plugin.onUnload(); h.plugin.onUnload();
  assert.equal(h.patches.size, 0); assert.equal(h.clock.jobs.size, 0); assert.equal(h.appState(), null);
  assert.equal(h.actions.removeRelationship, original);
  assert.ok([...h.subscriptions.values()].every(set => set.size === 0));
  h.clock.tick(60000); assert.equal(h.toasts.length, 0);
  h.plugin.onLoad(); h.clock.tick(5000); assert.ok(h.patches.size > 0); h.plugin.onUnload();
});

test('toast failures fall back to native alerts without losing history', () => {
  const h = setup(); h.V.ui.toasts.showToast = () => { throw new Error('Toast unavailable'); };
  h.plugin.onLoad(); h.clock.tick(5000);
  delete h.state.relationships['101']; h.dispatch('RELATIONSHIP_REMOVE'); h.clock.tick(1000);
  assert.equal(h.alerts.length, 1); assert.equal(h.storage.accounts.me.history.length, 1);
  h.plugin.onUnload();
});

test('settings render with only native React components and every switch is actionable', () => {
  const h = setup(); h.plugin.onLoad(); h.clock.tick(5000);
  const tree = h.plugin.settings();
  const nodes = [];
  const walk = value => { if (!value || typeof value !== 'object') return; if (Array.isArray(value)) return value.forEach(walk); nodes.push(value); walk(value.props?.children); };
  walk(tree);
  const switches = nodes.filter(node => node.type === 'Switch');
  assert.equal(switches.length, 6);
  switches[0].props.onValueChange(false); assert.equal(h.storage.options.friends, false);
  const buttons = nodes.filter(node => node.type === 'Pressable');
  buttons[0].props.onPress(); assert.equal(h.toasts.length, 1);
  assert.equal(h.storage.accounts.me.history.length, 0);
  h.plugin.onUnload();
});

test('install bundle evaluates with the actual Revenge loader wrapper and matches manifest hash', () => {
  const bundle = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.main, 'index.js');
  assert.equal(manifest.hash, createHash('sha256').update(bundle).digest('hex'));
  const h = setup();
  const rows = [{ key: 'BUNNY_PLUGINS' }, { key: 'CUSTOMRPC_FLUTTERSHY_SETTINGS' }, { key: 'BUNNY_THEMES' }];
  const settingsAPI = { registeredSections: { Revenge: rows } };
  const constants = { SETTING_RENDERER_CONFIG: Object.fromEntries(rows.map(row => [row.key, { parent: null }])) };
  const opened = [];
  const navigation = { getRootNavigationRef: () => ({ navigate: (...args) => opened.push(args) }) };
  const previousFind = h.V.metro.findByProps;
  h.V.metro.findByProps = (...keys) => [constants, navigation].find(value => keys.every(key => key in value)) ?? previousFind(...keys);
  const context = { setTimeout: h.clock.setTimeout, clearTimeout: h.clock.clearTimeout, setInterval: h.clock.setInterval, clearInterval: h.clock.clearInterval, Date, Map, Set, WeakMap, bunny: { ui: { settings: settingsAPI } } };
  const plugin = vm.runInNewContext(`vendetta => { return ${bundle} }`, context)(h.V);
  assert.equal(typeof plugin.onLoad, 'function'); assert.equal(typeof plugin.onUnload, 'function'); assert.equal(typeof plugin.settings, 'function');
  plugin.onLoad(); plugin.settings();
  assert.equal(rows[2].key, SHORTCUT_KEY);
  constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].onPress();
  assert.equal(opened.length, 1);
  assert.equal(opened[0][0], 'BUNNY_CUSTOM_PAGE');
  assert.equal(opened[0][1].title, 'RelationshipNotifier');
  assert.equal(opened[0][1].render().type, plugin.settings);
  plugin.onUnload();
  assert.equal(rows.some(row => row.key === SHORTCUT_KEY), false);
  assert.equal(constants.SETTING_RENDERER_CONFIG[SHORTCUT_KEY].usePredicate(), false);
  assert.equal(h.patches.size, 0); assert.equal(h.clock.jobs.size, 0);
});

test('shortcut registration failures do not stop relationship alerts', () => {
  const host = { bunny: { ui: {} } };
  Object.defineProperty(host.bunny.ui, 'settings', { get() { throw new Error('Settings unavailable'); } });
  const h = setup({ host }); h.plugin.onLoad(); h.clock.tick(5000);
  delete h.state.relationships['101']; h.dispatch('RELATIONSHIP_REMOVE'); h.clock.tick(1000);
  assert.equal(h.toasts.length, 1); assert.match(h.toasts[0], /Alice/);
  h.plugin.onUnload(); assert.equal(h.patches.size, 0); assert.equal(h.clock.jobs.size, 0);
});
