import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createPlugin } from '../src/plugin.mjs';

const id = '123456789012345678';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness({ late = false } = {}) {
  let current, hooks = [], count = 0, permitted = true;
  const effects = [], cleanups = [], timers = new Map(), toasts = [], uploads = [], opens = [];
  const React = {
    createElement: (type, props = {}, ...children) => Object.freeze({ type, key: props?.key ?? null,
      props: Object.freeze({ ...props, ...(children.length ? { children: children.length === 1 ? children[0] : Object.freeze(children) } : {}) }) }),
    cloneElement: (node, props) => Object.freeze({ ...node, props: Object.freeze({ ...node.props, ...props }) }),
    memo: (type, compare) => ({ $$typeof: Symbol.for('react.memo'), type, compare }),
    forwardRef: render => ({ $$typeof: Symbol.for('react.forward_ref'), render }),
    useState(value) { const i = count++; if (!(i in hooks)) hooks[i] = typeof value === 'function' ? value() : value;
      return [hooks[i], update => { hooks[i] = typeof update === 'function' ? update(hooks[i]) : update; }]; },
    useRef(value) { const i = count++; return hooks[i] ?? (hooks[i] = { current: value }); },
    useEffect(fn) { const i = count++; if (!(i in hooks)) { hooks[i] = true; effects.push(fn); } },
  };
  const RN = Object.fromEntries(['View','Text','Image','ScrollView','TextInput','Pressable','Switch','TouchableOpacity'].map(x => [x, x]));
  let resumeFn, resumeRemoved = 0;
  RN.Platform = { OS: 'android' }; RN.Appearance = { getColorScheme: () => 'dark' };
  RN.AppState = { addEventListener(_, fn) { resumeFn = fn; return { remove() { resumeRemoved++; } }; } };
  const host = { openLazy(...args) { opens.push(args); return args[0]; }, hideActionSheet() {} };
  const originalOpen = host.openLazy;
  const guild = { id: 'guild', name: 'Test server', getMaxEmojiSlots: () => 50 };
  const stores = {
    GuildStore: { getGuilds: () => ({ guild }), getGuild: () => guild },
    UserStore: { getCurrentUser: () => ({ id: 'user' }) },
    PermissionStore: { can: () => permitted }, EmojiStore: { getGuilds: () => ({ guild: { emojis: [] } }) },
  };
  let listeners = 0;
  for (const store of Object.values(stores)) { store.addChangeListener = () => listeners++; store.removeChangeListener = () => listeners--; }
  const uploadActions = { uploadEmoji: async args => { uploads.push(args); return { id: 'created' }; } };
  const modules = [uploadActions]; if (!late) modules.push(host);
  const V = {
    metro: { common: { React, ReactNative: RN, constants: { Permissions: { CREATE_GUILD_EXPRESSIONS: 'create' } }, clipboard: { setString() {} } },
      findByProps: (...keys) => modules.find(m => keys.every(k => k in m)), findByStoreName: name => stores[name], find: () => undefined },
    patcher: { before(key, obj, callback) { const original = obj[key]; obj[key] = function (...args) { callback(args); return original.apply(this, args); };
      return () => { obj[key] = original; }; } },
    ui: { components: {}, toasts: { showToast: message => toasts.push(message) } },
  };
  const env = { setTimeout: fn => { const token = {}; timers.set(token, fn); return token; }, clearTimeout: token => timers.delete(token),
    fetch: async () => ({ ok: true, headers: { get: () => null }, blob: async () => ({ size: 24, type: 'image/png' }) }),
    FileReader: class { readAsDataURL() { this.result = 'data:image/png;base64,' + png; queueMicrotask(() => this.onload()); } } };
  const plugin = createPlugin(V, env);
  function mount(element) { current = element; return render(); }
  function render() { count = 0; const tree = current.type(current.props); effects.splice(0).forEach(fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); }); return tree; }
  function nodes(tree, out = []) { if (Array.isArray(tree)) tree.forEach(item => nodes(item, out)); else if (tree?.props) { out.push(tree); nodes(tree.props.children, out); } return out; }
  function press(label) { const button = nodes(render()).find(n => n.props.accessibilityLabel === label && n.props.onPress);
    assert.ok(button, 'Missing button ' + label); assert.ok(!button.props.disabled, 'Disabled button ' + label); return button.props.onPress(); }
  function change(label, value) { const input = nodes(render()).find(n => n.props.placeholder === label); assert.ok(input); input.props.onChangeText(value); }
  function chooseServer() { mount(plugin.settings()); change('<:emoji:123456789012345678>', `<:test:${id}>`); press('Use emoji'); press('Test server · 50 slots free'); }
  return { plugin, V, React, RN, env, host, originalOpen, modules, timers, uploads, uploadActions, toasts, stores,
    mount, render, press, change, nodes, chooseServer, setPermission: p => permitted = p,
    resume: () => resumeFn('active'), resumeRemoved: () => resumeRemoved, listeners: () => listeners,
    unmount: () => cleanups.splice(0).forEach(fn => fn()) };
}

test('lifecycle is idempotent, retries late modules, and removes timers and listeners', () => {
  const h = harness({ late: true }); h.plugin.onLoad(); h.plugin.onLoad(); assert.equal(h.timers.size, 1);
  h.modules.push(h.host); h.resume(); assert.notEqual(h.host.openLazy, h.originalOpen);
  h.mount(h.plugin.settings()); assert.equal(h.listeners(), 3); h.unmount(); assert.equal(h.listeners(), 0);
  h.plugin.onUnload(); assert.equal(h.host.openLazy, h.originalOpen); assert.equal(h.timers.size, 0); assert.equal(h.resumeRemoved(), 1);
});
test('settings works with missing menu modules and missing optional components', () => {
  const h = harness({ late: true }); h.plugin.onLoad(); h.chooseServer();
  assert.ok(h.nodes(h.render()).some(n => n.props.accessibilityLabel === 'Add emoji'));
  h.plugin.onUnload(); h.unmount();
});
test('one upload on rapid taps, successful name/data, and progress state resets', async () => {
  const h = harness(); h.plugin.onLoad(); h.chooseServer();
  h.change('Emoji name', 'renamed');
  const gate = deferred(); h.uploadActions.uploadEmoji = async args => { h.uploads.push(args); return gate.promise; };
  const callback = h.nodes(h.render()).find(n => n.props.accessibilityLabel === 'Add emoji').props.onPress;
  const first = callback(); callback(); await tick(); assert.equal(h.uploads.length, 1);
  assert.equal(h.uploads[0].name, 'renamed'); assert.match(h.uploads[0].image, /^data:image\/png/);
  gate.resolve({ id: 'new' }); await first;
  assert.ok(h.toasts.some(t => t.includes('renamed added'))); h.plugin.onUnload(); h.unmount();
});
test('upload failure has no success toast or automatic POST retry', async () => {
  const h = harness(); h.plugin.onLoad(); h.chooseServer();
  let writes = 0; h.uploadActions.uploadEmoji = async () => { writes++; throw { status: 429 }; };
  await h.press('Add emoji');
  assert.equal(writes, 1); assert.equal(h.toasts.length, 0);
  assert.ok(h.nodes(h.render()).some(n => String(n.props.children).includes('rate limiting')));
  h.plugin.onUnload(); h.unmount();
});
test('unload while downloading prevents a later upload, including disable/re-enable', async () => {
  const h = harness(); h.plugin.onLoad(); h.chooseServer();
  const gate = deferred(); h.env.fetch = () => gate.promise;
  const upload = h.press('Add emoji'); h.plugin.onUnload(); h.plugin.onLoad();
  gate.resolve({ ok: true, headers: { get: () => null }, blob: async () => ({ size: 24, type: 'image/png' }) });
  await upload; assert.equal(h.uploads.length, 0); assert.equal(h.toasts.length, 0);
  h.plugin.onUnload(); h.unmount();
});
test('permission is rechecked after download before the write', async () => {
  const h = harness(); h.plugin.onLoad(); h.chooseServer();
  const gate = deferred(); h.env.fetch = () => gate.promise;
  const upload = h.press('Add emoji'); h.setPermission(false);
  gate.resolve({ ok: true, headers: { get: () => null }, blob: async () => ({ size: 24, type: 'image/png' }) });
  await upload; assert.equal(h.uploads.length, 0);
  h.plugin.onUnload(); h.unmount();
});
test('frozen menu trees get one action on every opening without modifying the cached module', async () => {
  const t = harness(); t.plugin.onLoad(); const R = t.React;
  const tree = R.createElement('View', {}, R.createElement('Button', { text: 'Original', onPress() {} }));
  // Use an explicit frozen child array, as Discord supplies its action rows.
  const originalTree = R.cloneElement(tree, { children: Object.freeze([tree.props.children]) });
  const module = Object.freeze({ default: () => originalTree });
  for (let i = 0; i < 30; i++) {
    const wrapped = await t.host.openLazy(Promise.resolve(module), 'MessageEmojiActionSheet', { emojiNode: { id, alt: 'test' } });
    const output = wrapped.default({});
    assert.equal(t.nodes(output).filter(n => n.key === 'stealmoji-actions').length, 1);
    assert.equal(originalTree.props.children.length, 1);
  }
  t.plugin.onUnload(); assert.equal(t.host.openLazy, t.originalOpen);
});
test('deferred nested components retain emoji context and inactive wrappers return original output', async () => {
  const t = harness(); t.plugin.onLoad(); const R = t.React;
  const child = () => R.createElement('View', {}, R.createElement('Text', {}, 'Preview'), null);
  const original = () => R.createElement(child, {});
  const module = await t.host.openLazy(Promise.resolve({ default: original }), 'MessageEmojiActionSheet', {});
  const outer = module.default({ emojiNode: { id, alt: 'test' } });
  assert.notEqual(outer.type, child);
  assert.equal(t.nodes(outer.type(outer.props)).filter(n => n.key === 'stealmoji-actions').length, 1);
  t.plugin.onUnload(); assert.equal(module.default({}).type, child);
});
test('lazy resolution after unload is untouched and rejected lazy imports remain handled by caller', async () => {
  const t = harness(); t.plugin.onLoad(); const gate = deferred(), module = { default() {} };
  const waiting = t.host.openLazy(gate.promise, 'MessageEmojiActionSheet', {});
  t.plugin.onUnload(); gate.resolve(module); assert.equal(await waiting, module);
  t.plugin.onLoad(); await assert.rejects(t.host.openLazy(Promise.reject(new Error('lazy failed')), 'MessageEmojiActionSheet', {}), /lazy failed/);
  t.plugin.onUnload();
});
test('memo and forwardRef menu exports preserve refs and receive the action', async () => {
  const t = harness(); t.plugin.onLoad(); const R = t.React; let received;
  const renderer = R.forwardRef((props, ref) => { received = ref; return R.createElement('View', {}, R.createElement('Text', {}, 'Preview'), null); });
  const original = R.memo(renderer, () => false);
  const module = await t.host.openLazy(Promise.resolve({ default: original }), 'MessageEmojiActionSheet', { emojiNode: { id } });
  const ref = {}; const output = module.default.type.render({}, ref);
  assert.equal(received, ref); assert.equal(module.default.compare, original.compare);
  assert.equal(t.nodes(output).filter(n => n.key === 'stealmoji-actions').length, 1);
  t.plugin.onUnload();
});
test('message menu handles multiple custom emoji and leaves unrelated menus alone', async () => {
  const t = harness(); t.plugin.onLoad(); const R = t.React;
  const tree = R.createElement('View', {}, R.createElement('Action', { label: 'Copy', onPress() {} }), null);
  const original = { default: () => tree };
  const wrapped = await t.host.openLazy(Promise.resolve(original), 'MessageLongPressActionSheet', { message: { content: `<:test:${id}> <a:wave:223456789012345678>` } });
  assert.equal(t.nodes(wrapped.default({})).filter(n => n.key === 'stealmoji-actions').length, 1);
  assert.equal(await t.host.openLazy(Promise.resolve(original), 'OtherSheet', {}), original);
  t.plugin.onUnload();
});
test('reactions keep selection and add long-press without accumulating wrappers', async () => {
  const t = harness(); t.plugin.onLoad(); const R = t.React; let selected;
  const tab = R.createElement('Tab', { index: 3, reaction: { emoji: { id, name: 'test' } } });
  const module = await t.host.openLazy(Promise.resolve({ default: () => R.createElement('Tabs', { tabs: [tab], onSelect: index => selected = index }) }), 'MessageReactions', {});
  const output = module.default({}); output.props.tabs[0].props.onPress(); assert.equal(selected, 3);
  assert.equal(typeof output.props.tabs[0].props.onLongPress, 'function');
  assert.equal(tab.props.onLongPress, undefined); t.plugin.onUnload();
});
test('bundle evaluates without eager optional module access and its manifest hash matches', async () => {
  const code = await readFile(new URL('../index.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(createHash('sha256').update(code).digest('hex'), manifest.hash);
  assert.equal(manifest.main, 'index.js');
  const h = harness({ late: true });
  const plugin = vm.runInNewContext(code, { vendetta: h.V, ...h.env });
  assert.equal(typeof plugin.onLoad, 'function'); plugin.onLoad(); plugin.onUnload();
});
