import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

function runtime({ missing = false } = {}) {
  let hooks = null, index = 0, jobs = [], timerId = 0;
  const timers = new Map(), intervals = new Map(), storage = {}, patches = new Set();
  const React = {
    Fragment: 'Fragment', Component: class { constructor(props) { this.props = props; } },
    createElement(type, props, ...children) { return { type, props: { ...props, children: children.length === 1 ? children[0] : children } }; },
    cloneElement(element, props) { return { ...element, props: { ...element.props, ...props } }; },
    useState(initial) {
      const slot = index++, owner = hooks;
      if (!(slot in owner)) owner[slot] = typeof initial === 'function' ? initial() : initial;
      return [owner[slot], next => { owner[slot] = typeof next === 'function' ? next(owner[slot]) : next; }];
    },
    useRef(initial) { const [ref] = React.useState(() => ({ current: initial })); return ref; },
    useEffect(fn, deps) {
      const slot = index++, owner = hooks, old = owner[slot];
      if (!old || deps.some((value, n) => value !== old.deps[n])) {
        jobs.push(() => { old?.cleanup?.(); owner[slot] = { deps, cleanup: fn() }; });
      }
    },
  };
  function host(component, props = {}) {
    const state = [];
    return { render() { hooks = state; index = 0; const ret = component(props); const effects = jobs; jobs = []; effects.forEach(fn => fn()); return ret; } };
  }
  let draft = '', account = 'user1', channel = 'channel1';
  let liveTree;
  const emitNative = (text, start = text.length, end = start) => {
    const field = nodes(liveTree, n => typeof n.props?.onSelectionOrTextChange === 'function')[0];
    assert(field, 'native field present');
    field.props.onSelectionOrTextChange({ nativeEvent: { text, start, end } });
  };
  const input = {
    getText: () => draft,
    handleTextChanged() {},
    insertText(text, start, space, nodes, end) { emitNative(draft.slice(0, start) + text + draft.slice(end)); },
  };
  const inputRef = { current: input };
  // A floating composer under the guard, including an absolutely positioned
  // accessories area. Native changes deliberately bypass handleTextChanged.
  const holder = { default: () => React.createElement('View', { testID: 'composer-root', chatInputRef: inputRef },
    React.createElement('View', { testID: 'accessories', style: { position: 'absolute', bottom: '100%' } }),
    React.createElement('View', { testID: 'measured-container', onLayout: function handleLayoutOfInputContainer() {} },
      React.createElement('View', { testID: 'floating-box', collapsable: false,
        onStartShouldSetResponder() {}, onResponderRelease() {}, style: { flexDirection: 'column', overflow: 'hidden' } },
        React.createElement('View', { testID: 'input-row', style: { flexDirection: 'row' } },
          React.createElement('NativeInput', { onSelectionOrTextChange(event) { draft = event.nativeEvent.text; } }))))),
  };
  const original = holder.default;
  const api = {
    plugin: { storage },
    metro: {
      common: { React, ReactNative: Object.fromEntries(['Text', 'View', 'TextInput', 'ScrollView', 'TouchableOpacity', 'Switch', 'Modal', 'SafeAreaView', 'KeyboardAvoidingView'].map(name => [name, name])), clipboard: { setString() {} } },
      findByName: () => missing ? undefined : holder,
      findByTypeName: () => undefined,
      findByProps: () => ({ getMaxMessageLength: () => 2000 }),
      findByStoreName: name => name === 'SelectedChannelStore' ? { getChannelId: () => channel } : name === 'UserStore' ? { getCurrentUser: () => ({ id: account }) } : null,
    },
    patcher: { after(key, obj, fn) {
      const original = obj[key];
      obj[key] = (...args) => { const ret = original(...args); const patched = fn(args, ret); return patched === undefined ? ret : patched; };
      const stop = () => { obj[key] = original; patches.delete(stop); }; patches.add(stop); return stop;
    } },
    ui: { toasts: { showToast() {} } },
  };
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const plugin = vm.runInNewContext('(' + source + ')', {
    vendetta: api,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    setInterval: fn => { intervals.set(++timerId, fn); return timerId; }, clearInterval: id => intervals.delete(id),
  });
  return { plugin, holder, original, patches, storage, host, timers, intervals, read: () => draft,
    open() { liveTree = holder.default({ channel: { id: channel } }); return liveTree; },
    type: emitNative,
    flush() { const pending = [...timers]; timers.clear(); pending.forEach(([, fn]) => fn()); },
    switchAccount() { account = 'user2'; },
  };
}
function nodes(root, filter) {
  if (!root || typeof root !== 'object') return [];
  if (Array.isArray(root)) return root.flatMap(child => nodes(child, filter));
  return [...(filter(root) ? [root] : []), ...nodes(root.props?.children, filter)];
}
test('installable bundle is an expression with a matching manifest hash', () => {
  const code = readFileSync(new URL('../index.js', import.meta.url));
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  assert.equal(createHash('sha256').update(code).digest('hex'), manifest.hash);
  const r = runtime();
  assert.equal(typeof r.plugin.onLoad, 'function'); assert.equal(typeof r.plugin.settings, 'function');
});
test('real bundle patches only the composer, mounts a bar, edits native text and fully unloads', () => {
  const r = runtime(); r.plugin.onLoad(); r.plugin.onLoad();
  assert.equal(r.patches.size, 1);
  const tree = r.open();
  assert.equal(tree.props.testID, 'composer-root');
  const box = nodes(tree, n => n.props?.testID === 'floating-box')[0];
  const bar = box.props.children[0].props.children;
  const host = r.host(bar.type, bar.props);
  host.render();
  assert.equal(r.patches.size, 2); assert.equal(r.intervals.size, 1);
  r.type('- test'); r.type('- test\n'); r.flush();
  assert.equal(r.read(), '- test\n- ');
  const rendered = host.render();
  assert(nodes(rendered, n => n.props?.accessibilityLabel === 'Undo').length);
  for (const strip of nodes(rendered, n => n.type === 'ScrollView')) {
    assert.equal(strip.props.style.height, 44);
    assert.equal(strip.props.style.flexGrow, 0);
  }
  r.plugin.onUnload();
  assert.equal(r.patches.size, 0); assert.equal(r.intervals.size, 0); assert.equal(r.timers.size, 0);
  assert.equal(r.holder.default, r.original);
  assert.equal(host.render(), null);
});
test('a complete ;brb expands via native events without a trailing space', () => {
  const r = runtime(); r.plugin.onLoad();
  const tree = r.open();
  const box = nodes(tree, n => n.props?.testID === 'floating-box')[0];
  const bar = box.props.children[0].props.children;
  const host = r.host(bar.type, bar.props); host.render();
  for (const value of [';', ';b', ';br', ';brb']) { r.type(value); r.flush(); }
  assert.equal(r.read(), 'Be right back!');
  r.plugin.onUnload();
});
test('native selection movement cancels an automatic change before it runs', () => {
  const r = runtime(); r.plugin.onLoad();
  const tree = r.open();
  const box = nodes(tree, n => n.props?.testID === 'floating-box')[0];
  const bar = box.props.children[0].props.children;
  r.host(bar.type, bar.props).render();
  r.type(';br'); r.type(';brb'); r.type(';brb', 1); r.flush();
  assert.equal(r.read(), ';brb');
  r.plugin.onUnload();
});
test('missing composer support leaves settings usable and cancels retries on unload', () => {
  const r = runtime({ missing: true }); r.plugin.onLoad();
  assert.equal(r.patches.size, 0); assert.equal(r.timers.size, 1);
  const view = r.host(r.plugin.settings).render();
  assert(nodes(view, n => n.type === 'TextInput' && n.props.accessibilityLabel === 'Practice draft').length);
  r.plugin.onUnload(); assert.equal(r.timers.size, 0);
});
test('settings can add a multiline phrase without a network or Discord send API', () => {
  const r = runtime(); r.plugin.onLoad();
  const host = r.host(r.plugin.settings);
  let view = host.render();
  nodes(view, n => n.props?.accessibilityLabel === '+ Add phrase')[0].props.onPress();
  view = host.render();
  nodes(view, n => n.props?.accessibilityLabel === 'Shortcut')[0].props.onChangeText(';test');
  view = host.render();
  nodes(view, n => n.props?.accessibilityLabel === 'Phrase text — bullet points are supported')[0].props.onChangeText('- One\n- Two');
  view = host.render();
  nodes(view, n => n.props?.accessibilityLabel === 'Save phrase')[0].props.onPress();
  assert.equal(r.storage.phrases.find(p => p.shortcut === ';test').text, '- One\n- Two');
  r.plugin.onUnload();
});
