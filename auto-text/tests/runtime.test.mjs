import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

function runtime({ missing = false, missingSend = false, sendBehavior = 'clear', silentNative = false,
  staleCache = false, delayFlush = false, delayInitial = false, dropInsert = false } = {}) {
  let hooks = null, index = 0, jobs = [], timerId = 0, clock = 0;
  const timers = new Map(), intervals = new Map(), storage = {}, patches = new Set(), appListeners = new Set();
  const appState = { currentState: 'active', addEventListener(event, callback) {
    appListeners.add(callback); return { remove: () => appListeners.delete(callback) };
  } };
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
  let draft = '', cached = '', editId = '0', cachedEditId = '0', account = 'user1', channel = 'channel1', sendCount = 0;
  const inserted = [], pendingFlushes = [], nativeHandle = {};
  let originalRefValue = null, originalFlushCount = 0;
  const sentContents = [];
  let liveTree;
  const emitNative = (text, start = text.length, end = start) => {
    const field = nodes(liveTree, n => typeof n.props?.onSelectionOrTextChange === 'function')[0];
    assert(field, 'native field present');
    draft = text; editId = String(Number(editId) + 1);
    field.props.onSelectionOrTextChange({ nativeEvent: { text, start, end, editId } });
  };
  const replace = (text, start, end, revision) => {
    if (dropInsert || (revision != null && revision !== editId)) return;
    const next = draft.slice(0, start) + text + draft.slice(end);
    inserted.push(text);
    if (silentNative) { draft = next; editId = String(Number(editId) + 1); }
    else emitNative(next);
  };
  const nativeCommands = {
    getText() {}, replaceRange() {},
    flushText(ref, requestId) {
      assert.equal(ref, nativeHandle, 'flush targets the mounted native field');
      const text = draft;
      const deliver = () => nodes(liveTree, n => typeof n.props?.onTextFlushed === 'function')[0]
        .props.onTextFlushed({ nativeEvent: { text, requestId } });
      if ((delayFlush && inserted.length) || (delayInitial && !inserted.length)) pendingFlushes.push(deliver); else deliver();
    },
  };
  const input = {
    getText: () => cached,
    handleTextChanged() {},
    handleSend() {
      sendCount++; sentContents.push(draft);
      if (sendBehavior === 'throw') throw new Error('Discord rejected send');
      if (sendBehavior === 'clear') emitNative('');
    },
    insertText(text, start, space, nodes, end) { replace(text, start, end, cachedEditId); },
    replaceRange({ location, length, text, editId }) { replace(text, location, location + length, editId); },
  };
  if (missingSend) delete input.handleSend;
  const inputRef = { current: input };
  // A floating composer under the guard, including an absolutely positioned
  // accessories area. Native changes deliberately bypass handleTextChanged.
  const holder = { default: () => React.createElement('View', { testID: 'composer-root', chatInputRef: inputRef },
    React.createElement('View', { testID: 'accessories', style: { position: 'absolute', bottom: '100%' } }),
    React.createElement('View', { testID: 'measured-container', onLayout: function handleLayoutOfInputContainer() {} },
      React.createElement('View', { testID: 'floating-box', collapsable: false,
        onStartShouldSetResponder() {}, onResponderRelease() {}, style: { flexDirection: 'column', overflow: 'hidden' } },
        React.createElement('View', { testID: 'input-row', style: { flexDirection: 'row' } },
          React.createElement('NativeInput', {
            ref(value) { originalRefValue = value; },
            onTextFlushed() { originalFlushCount++; },
            onSelectionOrTextChange(event) {
              if (!staleCache) { cached = event.nativeEvent.text; cachedEditId = event.nativeEvent.editId; }
            },
          }))))),
  };
  const original = holder.default;
  const api = {
    plugin: { storage },
    metro: {
      common: { React, ReactNative: { ...Object.fromEntries(['Text', 'View', 'TextInput', 'ScrollView', 'TouchableOpacity', 'Switch', 'Modal', 'SafeAreaView', 'KeyboardAvoidingView'].map(name => [name, name])), AppState: appState }, clipboard: { setString() {} } },
      findByName: () => missing ? undefined : holder,
      findByTypeName: () => undefined,
      findByProps: (...props) => props.includes('flushText') ? nativeCommands : { getMaxMessageLength: () => 2000 },
      findByStoreName: name => name === 'SelectedChannelStore' ? { getChannelId: () => channel } : name === 'UserStore' ? { getCurrentUser: () => ({ id: account }) } : null,
    },
    patcher: { before(key, obj, fn) {
      const original = obj[key];
      obj[key] = (...args) => { fn(args); return original(...args); };
      const stop = () => { obj[key] = original; patches.delete(stop); }; patches.add(stop); return stop;
    }, after(key, obj, fn) {
      const original = obj[key];
      obj[key] = (...args) => { const ret = original(...args); const patched = fn(args, ret); return patched === undefined ? ret : patched; };
      const stop = () => { obj[key] = original; patches.delete(stop); }; patches.add(stop); return stop;
    } },
    ui: { toasts: { showToast() {} } },
  };
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const plugin = vm.runInNewContext('(' + source + ')', {
    vendetta: api,
    Date: class extends Date { static now() { return clock; } },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, at: clock + delay }); return timerId; }, clearTimeout: id => timers.delete(id),
    setInterval: fn => { intervals.set(++timerId, fn); return timerId; }, clearInterval: id => intervals.delete(id),
  });
  return { plugin, holder, original, patches, storage, host, timers, intervals, read: () => draft,
    open() {
      liveTree = holder.default({ channel: { id: channel } });
      const field = nodes(liveTree, n => n.type === 'NativeInput')[0];
      field.props.ref(nativeHandle);
      assert.equal(originalRefValue, nativeHandle, 'Discord still receives its native ref');
      return liveTree;
    },
    type: emitNative,
    flush() {
      if (!timers.size) return;
      clock = Math.min(...[...timers.values()].map(item => item.at));
      for (const [id, item] of [...timers]) if (item.at <= clock) { timers.delete(id); item.fn(); }
    },
    pendingFlushes, inserted, originalFlushCount: () => originalFlushCount,
    switchAccount() { account = 'user2'; },
    switchChannel() { channel = 'channel2'; },
    background() { appState.currentState = 'background'; for (const fn of appListeners) fn('background'); },
    appListeners,
    userSend() { input.handleSend(); },
    sent: () => sendCount,
    sentTexts: () => [...sentContents],
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
  assert.equal(r.patches.size, 3); assert.equal(r.intervals.size, 1);
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
function openAutoType(r, source, autoSend = false) {
  r.plugin.onLoad();
  const tree = r.open();
  const box = nodes(tree, n => n.props?.testID === 'floating-box')[0];
  const bar = box.props.children[0].props.children;
  const host = r.host(bar.type, bar.props);
  host.render();
  let view = host.render();
  nodes(view, n => n.props?.accessibilityLabel === 'AutoType')[0].props.onPress();
  view = host.render();
  nodes(view, n => n.props?.accessibilityLabel === 'Message to type')[0].props.onChangeText(source);
  view = host.render();
  if (autoSend) {
    nodes(view, n => n.props?.accessibilityLabel === 'Auto-send when finished')[0].props.onValueChange(true);
    view = host.render();
  }
  nodes(view, n => n.props?.accessibilityLabel === (autoSend ? 'Start typing & send' : 'Start typing'))[0].props.onPress();
  return host;
}
test('AutoType screen runs a multiline message without shortcut expansion or extra bullets', () => {
  const r = runtime(); const source = '- One\n- Two\n;brb 🍓';
  const host = openAutoType(r, source);
  assert.equal(r.read(), '');
  r.flush(); assert.equal(r.read(), '-');
  assert(nodes(host.render(), n => n.props?.accessibilityLabel === 'Stop automatic typing').length);
  for (let i = 0; i < 60; i++) r.flush();
  assert.equal(r.read(), source);
  assert.equal(nodes(host.render(), n => n.props?.accessibilityLabel === 'Stop automatic typing').length, 0);
  assert.equal(r.storage.typingInterval, 70);
  assert.equal(r.sent(), 0, 'AutoType never sends the prepared message');
  assert(!Object.values(r.storage).includes(source), 'prepared message is not persisted');
  r.plugin.onUnload(); assert.equal(r.appListeners.size, 0); assert.equal(r.timers.size, 0);
});
test('native text confirmation recovers missing echoes and stale cached text at Very slow speed', () => {
  for (const autoSend of [false, true]) {
    const r = runtime({ silentNative: true, staleCache: true });
    r.storage.typingInterval = 500;
    const source = '- A\n- B 🍓';
    const host = openAutoType(r, source, autoSend);
    for (let i = 0; i < 400; i++) r.flush();
    assert.equal(r.inserted.join(''), source, 'each character is inserted exactly once');
    assert.equal(r.read(), autoSend ? '' : source);
    assert.equal(r.sent(), autoSend ? 1 : 0);
    if (autoSend) assert.deepEqual(r.sentTexts(), [source]);
    assert(r.originalFlushCount() > 0, 'native probes still pass through Discord\'s flush handler');
    assert.equal(nodes(host.render(), n => n.props?.accessibilityLabel === 'Stop automatic typing').length, 0);
    r.plugin.onUnload(); assert.equal(r.timers.size, 0);
  }
});
test('native event revisions take precedence over a stale composer cache', () => {
  const r = runtime({ staleCache: true });
  const source = 'abc 🍓'; openAutoType(r, source, true);
  for (let i = 0; i < 100; i++) r.flush();
  assert.deepEqual(r.sentTexts(), [source]); assert.equal(r.inserted.join(''), source);
  r.plugin.onUnload();
});
test('a late native text reply cannot continue typing or auto-send after cancellation', () => {
  for (const action of ['stop', 'unload', 'background', 'edit', 'channel']) {
    const r = runtime({ silentNative: true, staleCache: true, delayFlush: true });
    const host = openAutoType(r, 'ab', true);
    for (let i = 0; i < 20 && !r.pendingFlushes.length; i++) r.flush();
    assert.equal(r.pendingFlushes.length, 1);
    if (action === 'stop') nodes(host.render(), n => n.props?.accessibilityLabel === 'Stop automatic typing')[0].props.onPress();
    if (action === 'unload') r.plugin.onUnload();
    if (action === 'background') r.background();
    if (action === 'edit') r.type('manual');
    if (action === 'channel') r.switchChannel();
    r.pendingFlushes.shift()();
    for (let i = 0; i < 250; i++) r.flush();
    assert.equal(r.read(), action === 'edit' ? 'manual' : 'a', action);
    assert.equal(r.inserted.join(''), 'a', action); assert.equal(r.sent(), 0, action);
    r.plugin.onUnload(); assert.equal(r.timers.size, 0);
  }
});
test('an ignored native insert times out without retrying or sending an unfinished draft', () => {
  const r = runtime({ dropInsert: true }); const host = openAutoType(r, 'abc', true);
  for (let i = 0; i < 300; i++) r.flush();
  assert.equal(r.read(), ''); assert.equal(r.sent(), 0);
  assert(nodes(host.render(), n => n.type === 'Text' && /message box did not respond/.test(n.props.children)).length);
  r.plugin.onUnload(); assert.equal(r.timers.size, 0);
});
test('leaving the chat while the initial native read is pending cancels the run', () => {
  const r = runtime({ delayInitial: true }); const host = openAutoType(r, 'abc', true);
  r.flush(); assert.equal(r.pendingFlushes.length, 1); assert.equal(r.read(), '');
  r.switchChannel(); r.pendingFlushes.shift()();
  for (let i = 0; i < 20; i++) r.flush();
  assert.equal(r.read(), ''); assert.equal(r.sent(), 0);
  assert.equal(nodes(host.render(), n => n.props?.accessibilityLabel === 'Stop automatic typing').length, 0);
  r.plugin.onUnload(); assert.equal(r.timers.size, 0);
});
test('Stop button preserves the partial draft and prevents remaining letters', () => {
  const r = runtime(); const host = openAutoType(r, 'abcdef'); r.flush(); r.flush();
  nodes(host.render(), n => n.props?.accessibilityLabel === 'Stop automatic typing')[0].props.onPress();
  for (let i = 0; i < 10; i++) r.flush();
  assert.equal(r.read(), 'ab'); r.plugin.onUnload();
});
test('a user Send stops the run before the message action and never restarts the next draft', () => {
  const r = runtime(); openAutoType(r, 'abcdef'); r.flush(); r.flush();
  assert.equal(r.read(), 'ab'); assert.equal(r.sent(), 0);
  r.userSend();
  for (let i = 0; i < 10; i++) r.flush();
  assert.equal(r.sent(), 1); assert.equal(r.read(), '');
  r.plugin.onUnload();
});
test('channel/account changes, backgrounding, manual edits and unload stop automatic typing', () => {
  for (const action of ['channel', 'account', 'background', 'manual', 'unload']) {
    const r = runtime(); openAutoType(r, 'abcdef'); r.flush();
    if (action === 'channel') r.switchChannel();
    if (action === 'account') r.switchAccount();
    if (action === 'background') r.background();
    if (action === 'manual') r.type('ax');
    if (action === 'unload') r.plugin.onUnload();
    for (let i = 0; i < 10; i++) r.flush();
    assert.equal(r.read(), action === 'manual' ? 'ax' : 'a', action);
    r.plugin.onUnload(); assert.equal(r.timers.size, 0);
  }
});
test('Auto-send switch submits the whole prepared message once through the composer', () => {
  const r = runtime(); const source = 'Hi. All done!\n- First\n- Second 🍓';
  const host = openAutoType(r, source, true);
  assert.equal(r.sent(), 0);
  for (let i = 0; i < 100; i++) r.flush();
  assert.deepEqual(r.sentTexts(), [source]); assert.equal(r.read(), '');
  assert.equal(r.storage.autoSend, true);
  assert.equal(nodes(host.render(), n => n.props?.accessibilityLabel === 'Stop automatic typing').length, 0);
  r.plugin.onUnload(); assert.equal(r.timers.size, 0);
});
test('stopping, leaving, editing or manually sending after the last letter prevents automatic submission', () => {
  for (const action of ['stop', 'channel', 'account', 'background', 'manualEdit', 'manualSend', 'unload']) {
    const r = runtime(); const host = openAutoType(r, 'a', true); r.flush();
    assert.equal(r.read(), 'a'); assert.equal(r.sent(), 0);
    if (action === 'stop') nodes(host.render(), n => n.props?.accessibilityLabel === 'Stop automatic typing')[0].props.onPress();
    if (action === 'channel') r.switchChannel();
    if (action === 'account') r.switchAccount();
    if (action === 'background') r.background();
    if (action === 'manualEdit') r.type('changed');
    if (action === 'manualSend') r.userSend();
    if (action === 'unload') r.plugin.onUnload();
    for (let i = 0; i < 10; i++) r.flush();
    assert.equal(r.sent(), action === 'manualSend' ? 1 : 0, action);
    r.plugin.onUnload();
  }
});
test('a native send exception leaves the full draft and never attempts another send', () => {
  const r = runtime({ sendBehavior: 'throw' }); const host = openAutoType(r, 'hello', true);
  for (let i = 0; i < 30; i++) r.flush();
  assert.deepEqual(r.sentTexts(), ['hello']); assert.equal(r.read(), 'hello');
  assert(nodes(host.render(), n => typeof n.props?.children === 'string' && n.props.children.includes('could not be confirmed')).length);
  r.plugin.onUnload();
});
test('unsupported auto-send shows a clear error before any typing or send', () => {
  const r = runtime({ missingSend: true }); const host = openAutoType(r, 'hello', true);
  for (let i = 0; i < 10; i++) r.flush();
  assert.equal(r.read(), ''); assert.equal(r.sent(), 0);
  assert(nodes(host.render(), n => typeof n.props?.children === 'string' && n.props.children.includes('unavailable')).length);
  r.plugin.onUnload();
});
