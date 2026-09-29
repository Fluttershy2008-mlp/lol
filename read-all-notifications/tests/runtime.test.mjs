import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const bundle = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

function harness({ confirm = false, missingChat = false, noDispatcher = false, dispatch } = {}) {
  let account = '42', connected = true, command, patched = 0, unregistered = 0;
  const events = [], toasts = [], alerts = [];
  const original = Object.freeze({ type: 'OriginalChat', props: Object.freeze({}) });
  const ChatView = { type: () => original };
  const stores = {
    UserStore: { getCurrentUser: () => ({ id: account }) },
    ConnectionStore: { isConnected: () => connected },
    GuildStore: { getGuilds: () => ({ 1: { id: '1' } }) },
    GuildChannelStore: { getChannels: () => ({ SELECTABLE: [{ channel: { id: '100', guild_id: '1', type: 0 } }] }) },
    ReadStateStore: { hasUnread: () => true, lastMessageId: () => '999' },
    ActiveJoinedThreadsStore: { getActiveJoinedThreadsForGuild: () => ({}) },
    ChannelStore: { getMutablePrivateChannels: () => ({}) }, ThemeStore: { theme: 'light' },
  };
  const effects = [];
  const React = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: value => [value, () => {}], useEffect: fn => { effects.push(fn()); },
  };
  const RN = {
    View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', Switch: 'Switch',
    useColorScheme: () => 'light', Alert: { alert: (...args) => alerts.push(args) },
    Keyboard: { addListener: () => ({ remove() {} }) },
  };
  const api = {
    plugin: { storage: { confirm } },
    metro: {
      common: { React, ReactNative: RN, FluxDispatcher: noDispatcher ? undefined : { dispatch: event => { events.push(event); return dispatch?.(event); } } },
      findByStoreName: name => stores[name], findByProps: () => undefined,
      findByTypeName: () => missingChat ? new Proxy({}, { get() { throw new Error('lazy module missing'); } }) : ChatView,
    },
    patcher: { after: (key, target, fn) => {
      const before = target[key];
      target[key] = (...args) => fn(args, before(...args)); patched++;
      return () => { target[key] = before; patched--; };
    } },
    commands: { registerCommand: value => { command = value; return () => { unregistered++; }; } },
    ui: { assets: { getAssetIDByName: () => 1 }, toasts: { showToast: text => toasts.push(text) } },
    logger: { warn() {} },
  };
  // Match Revenge's actual Vendetta evalPlugin contract.
  const factory = vm.runInNewContext(`vendetta => { return ${bundle} }`);
  const plugin = factory(api);
  return { plugin, api, stores, events, toasts, alerts, ChatView, original, effects,
    setAccount: value => { account = value; }, setConnected: value => { connected = value; },
    get command() { return command; }, get patched() { return patched; }, get unregistered() { return unregistered; } };
}
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
function children(node) {
  if (!node || typeof node !== 'object') return [];
  const nested = node.props?.children ?? [];
  return [node, ...nested.flatMap(child => Array.isArray(child) ? child.flatMap(children) : children(child))];
}

test('bundle hash and loader format match the install manifest', () => {
  assert.equal(manifest.main, 'index.js');
  assert.equal(manifest.hash, createHash('sha256').update(bundle).digest('hex'));
  const { plugin } = harness();
  assert.equal(typeof plugin.onLoad, 'function');
  assert.equal(typeof plugin.onUnload, 'function');
  assert.equal(typeof plugin.settings, 'function');
});

test('load never reads notifications; explicit /readall dispatches one captured snapshot', async () => {
  const h = harness();
  h.plugin.onLoad();
  assert.equal(h.events.length, 0);
  assert.equal(h.command.name, 'readall');
  assert.equal(await h.command.execute(), null);
  assert.deepEqual(plain(h.events), [{ type: 'BULK_ACK', context: 'APP', channels: [{ channelId: '100', messageId: '999', readStateType: 0 }] }]);
  assert.match(h.toasts.at(-1), /Marked 1 channel/);
  h.plugin.onUnload();
});

test('renders a working mobile button without mutating the existing chat tree', async () => {
  const h = harness();
  h.plugin.onLoad();
  const tree = h.ChatView.type();
  assert.equal(tree.props.children[0], h.original);
  const overlay = tree.props.children[1].type();
  const button = children(overlay).find(item => item.props?.accessibilityRole === 'button');
  assert.ok(button);
  await button.props.onPress();
  assert.equal(h.events.length, 1);
  assert.equal(overlay.props.style.left, 12);
  for (const dispose of h.effects) dispose?.();
  h.plugin.onUnload();
});

test('settings retain the action if ChatView is absent or a lazy proxy throws', async () => {
  const h = harness({ missingChat: true });
  assert.doesNotThrow(() => h.plugin.onLoad());
  const tree = h.plugin.settings();
  const all = children(tree);
  const action = all.find(item => item.props?.accessibilityRole === 'button' && item.props.children[0]?.props?.children[0] === '✓ Read all notifications');
  assert.ok(action);
  await action.props.onPress();
  assert.equal(h.events.length, 1);
  assert.equal(h.patched, 0);
  for (const dispose of h.effects) dispose?.();
  h.plugin.onUnload();
});

test('confirmation does not acknowledge newer messages that arrive while the dialog is open', async () => {
  const h = harness({ confirm: true });
  h.plugin.onLoad();
  await h.command.execute();
  assert.equal(h.events.length, 0);
  h.stores.ReadStateStore.lastMessageId = () => '2000';
  h.alerts[0][2][1].onPress();
  await tick();
  assert.equal(h.events[0].channels[0].messageId, '999');
  h.plugin.onUnload();
});

test('cancel and account changes never apply an old account snapshot', async () => {
  const h = harness({ confirm: true });
  h.plugin.onLoad();
  await h.command.execute();
  h.alerts[0][2][0].onPress();
  assert.equal(h.events.length, 0);
  await h.command.execute();
  h.setAccount('43');
  h.alerts[1][2][1].onPress();
  await tick();
  assert.equal(h.events.length, 0);
  assert.match(h.toasts.at(-1), /account changed/);
  h.plugin.onUnload();
});

test('unloading cancels pending dialogs and removes every command and UI patch', async () => {
  const h = harness({ confirm: true });
  h.plugin.onLoad();
  h.plugin.onLoad();
  assert.equal(h.patched, 1);
  await h.command.execute();
  const dialog = h.alerts[0];
  h.plugin.onUnload();
  dialog[2][1].onPress();
  assert.equal(h.events.length, 0);
  assert.equal(h.patched, 0);
  assert.equal(h.unregistered, 1);
  assert.equal(h.ChatView.type(), h.original);
});

test('missing dispatcher and dispatch failures report errors without a success toast', async () => {
  for (const opts of [{ noDispatcher: true }, { dispatch: () => Promise.reject(new Error('unavailable')) }]) {
    const h = harness(opts);
    h.plugin.onLoad();
    await h.command.execute();
    assert.match(h.toasts.at(-1), /Could not mark/);
    assert.ok(!h.toasts.some(text => text.startsWith('Marked')));
    h.plugin.onUnload();
  }
});

test('offline and already-read states do not dispatch empty or invalid actions', async () => {
  const h = harness();
  h.plugin.onLoad();
  h.setConnected(false);
  await h.command.execute();
  assert.equal(h.events.length, 0);
  assert.match(h.toasts.at(-1), /offline/);
  h.setConnected(true);
  h.stores.ReadStateStore.hasUnread = () => false;
  await h.command.execute();
  assert.equal(h.events.length, 0);
  assert.match(h.toasts.at(-1), /already read/);
  h.plugin.onUnload();
});

test('rapid taps cannot dispatch duplicate acknowledgements while a dispatch is pending', async () => {
  let finish;
  const h = harness({ dispatch: () => new Promise(resolve => { finish = resolve; }) });
  h.plugin.onLoad();
  const first = h.command.execute();
  await h.command.execute();
  assert.equal(h.events.length, 1);
  finish();
  await first;
  h.plugin.onUnload();
});

test('Read All includes DMs and group DMs in the same confirmed native acknowledgement', async () => {
  const h = harness({ confirm: true });
  h.stores.ChannelStore.getMutablePrivateChannels = () => ({ 201: { id: '201', type: 1 }, 202: { id: '202', type: 3 } });
  h.plugin.onLoad();
  await h.command.execute();
  assert.equal(h.events.length, 0);
  assert.match(h.alerts[0][1], /DMs and group DMs/);
  h.alerts[0][2][1].onPress();
  await tick();
  assert.deepEqual(plain(h.events), [{ type: 'BULK_ACK', context: 'APP', channels: [
    { channelId: '100', messageId: '999', readStateType: 0 },
    { channelId: '201', messageId: '999', readStateType: 0 },
    { channelId: '202', messageId: '999', readStateType: 0 },
  ] }]);
  assert.match(h.toasts.at(-1), /Marked 3 channels as read/);
  h.plugin.onUnload();
});
