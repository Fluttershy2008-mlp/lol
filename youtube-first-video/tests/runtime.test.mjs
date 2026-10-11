import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { transport, IDS } from './fixtures.mjs';

const bundle = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

function harness(fetchFn = transport()) {
  const opened = [], navigated = [], copied = [], commands = [], alerts = [], patches = [];
  const React = { createElement: (type, props, ...children) => ({ type, key: props?.key, props: { ...props, children } }),
    cloneElement: (node, props) => ({ ...node, props: { ...node.props, ...props } }),
    useState: initial => [initial, () => {}], useEffect() {},
    memo: (type, compare) => ({ $$typeof: Symbol.for('react.memo'), type, compare }),
    forwardRef: render => ({ $$typeof: Symbol.for('react.forward_ref'), render }),
  };
  const RN = { Linking: { openURL: async url => { opened.push(url); } }, Alert: { alert: (...args) => alerts.push(args) },
    View: 'View', Text: 'Text', ScrollView: 'ScrollView', TextInput: 'TextInput', Pressable: 'Pressable',
    Image: 'Image', ActivityIndicator: 'ActivityIndicator', Switch: 'Switch', useColorScheme: () => 'dark' };
  const url = { openURL: value => RN.Linking.openURL(value), handleSupportedURL: value => RN.Linking.openURL(value) };
  const Row = function ActionSheetRow() {};
  const sheets = { openLazy: async module => module, hideActionSheet() {} };
  const nav = { getRootNavigationRef: () => ({ navigate: (...args) => navigated.push(args) }) };
  const modules = [sheets, { ActionSheetRow: Row }, nav, url];
  const storage = {};
  function patch(kind, method, module, callback) {
    const original = module[method];
    const wrapped = function (...args) {
      if (kind === 'before') { callback(args); return original.apply(this, args); }
      return callback.call(this, args, original);
    };
    module[method] = wrapped;
    const dispose = () => { if (module[method] === wrapped) module[method] = original; };
    patches.push(dispose); return dispose;
  }
  const V = { metro: { common: { React, ReactNative: RN, clipboard: { setString: value => copied.push(value), getString: () => 'https://youtube.com/@Foo' }, url },
    findByProps: (...keys) => modules.find(module => keys.every(key => key in module)), findByStoreName: () => undefined },
    patcher: { instead: (method, module, cb) => patch('instead', method, module, cb), before: (method, module, cb) => patch('before', method, module, cb) },
    plugin: { storage }, ui: { toasts: { showToast() {} }, alerts: { showInputAlert() {} } },
    commands: { registerCommand: command => { commands.push(command); return () => commands.splice(commands.indexOf(command), 1); } },
  };
  const originalOpen = RN.Linking.openURL, originalSheet = sheets.openLazy;
  const plugin = vm.runInNewContext(bundle, { vendetta: V, fetch: fetchFn, AbortController, setTimeout, clearTimeout });
  return { plugin, V, RN, React, Row, sheets, url, opened, navigated, copied, commands, alerts, storage, originalOpen, originalSheet };
}

async function settle(plugin) {
  for (let i = 0; i < 30 && plugin.controller.snapshot().busy; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(plugin.controller.snapshot().busy, false);
}

test('installable bundle evaluates and matches its manifest hash', () => {
  assert.equal(createHash('sha256').update(bundle).digest('hex'), manifest.hash);
  assert.equal(typeof harness().plugin.settings, 'function');
  assert.equal(manifest.main, 'index.js');
});

test('tap channel links opens the local result; video links and other domains pass through', async () => {
  const env = harness(); env.plugin.onLoad();
  await env.RN.Linking.openURL('https://youtube.com/@Foo?si=share');
  assert.equal(env.navigated[0][0], 'BUNNY_CUSTOM_PAGE');
  assert.equal(env.opened.length, 0);
  await settle(env.plugin);
  assert.equal(env.plugin.controller.snapshot().result.id, IDS.video);
  await env.RN.Linking.openURL(`https://youtu.be/${IDS.video}`);
  await env.RN.Linking.openURL('https://example.com');
  assert.equal(env.opened.length, 2);
  env.plugin.onUnload();
});

test('copy/open controls and normal channel opening bypass interception', async () => {
  const env = harness(); env.plugin.onLoad();
  await env.plugin.controller.run('@Foo');
  env.plugin.controller.copy();
  assert.equal(env.copied[0], `https://www.youtube.com/watch?v=${IDS.video}`);
  const channel = env.plugin.controller.snapshot().result.channelURL;
  await env.plugin.controller.openURL(channel);
  assert.equal(env.opened[0], channel);
  assert.equal(env.navigated.length, 0);
  env.storage.interceptChannels = false;
  await env.RN.Linking.openURL('https://youtube.com/@Foo');
  assert.equal(env.opened[1], 'https://youtube.com/@Foo');
  env.plugin.onUnload();
});

test('slash command shows a local result and returns no Discord message payload', async () => {
  const env = harness(); env.plugin.onLoad();
  assert.equal(env.commands.length, 1);
  const returned = env.commands[0].execute([{ name: 'link', value: '@Foo' }], { channel: { id: '123' } });
  assert.equal(returned, undefined);
  await settle(env.plugin);
  assert.equal(env.navigated[0][0], 'BUNNY_CUSTOM_PAGE');
  env.plugin.onUnload();
  assert.equal(env.commands.length, 0);
});

test('message long-press adds an immutable action only when it contains YouTube links', async () => {
  const env = harness(); env.plugin.onLoad();
  const originalTree = env.React.createElement('View', null,
    env.React.createElement(env.Row, { label: 'Copy text', onPress() {} }),
    env.React.createElement(env.Row, { label: 'Reply', onPress() {} }));
  const module = { default: () => originalTree };
  const wrapped = await env.sheets.openLazy(Promise.resolve(module), 'MessageLongPressActionSheet', { message: { content: 'https://youtube.com/@Foo' } });
  const tree = wrapped.default({});
  assert.equal(originalTree.props.children.length, 2);
  assert.equal(tree.props.children.length, 3);
  assert.equal(tree.props.children[2].props.label, 'Find oldest YouTube video');
  tree.props.children[2].props.onPress(); await settle(env.plugin);
  assert.equal(env.plugin.controller.snapshot().result.id, IDS.video);
  const plain = await env.sheets.openLazy(Promise.resolve(module), 'MessageLongPressActionSheet', { message: { content: 'Hello' } });
  assert.equal(plain.default({}), originalTree);
  env.plugin.onUnload();
  assert.equal(wrapped.default({}), originalTree, 'previously opened menus stop injecting on unload');
});

test('unload cancels lookups and restores all link/menu hooks', async () => {
  let release;
  const env = harness(() => new Promise(resolve => { release = resolve; }));
  env.plugin.onLoad();
  const work = env.plugin.controller.run('@Foo');
  assert.equal(env.plugin.controller.snapshot().busy, true);
  env.plugin.onUnload();
  assert.equal(env.RN.Linking.openURL, env.originalOpen);
  assert.equal(env.sheets.openLazy, env.originalSheet);
  await work;
  release({ ok: true, status: 200, text: async () => 'late response' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.plugin.controller.snapshot().result, null);
  assert.equal(env.plugin.controller.snapshot().error, '');
});

test('settings render both the initial and result view using native components', async () => {
  const env = harness(); env.plugin.onLoad();
  assert.equal(env.plugin.settings().type, 'ScrollView');
  await env.plugin.controller.run('@Foo');
  const tree = env.plugin.settings();
  assert.ok(JSON.stringify(tree).includes('Open video in YouTube'));
  assert.ok(JSON.stringify(tree).includes('2017-03-29'));
  env.plugin.onUnload();
});
