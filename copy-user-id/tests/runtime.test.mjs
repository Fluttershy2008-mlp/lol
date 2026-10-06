import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { createPlugin } from '../src/plugin.mjs';

const AUTHOR = '753962426407452713', OTHER = '890228870559698955';
const MESSAGE = '1425205000123456789';
const KEY = 'copy-user-id:author', SHEET = 'MessageLongPressActionSheet';

function harness(factory = createPlugin, { ready = true, clipboardError = false } = {}) {
  const copies = [], toasts = [], hidden = [], timers = new Map();
  const React = {
    createElement(type, props, ...children) {
      const next = { ...props };
      if (children.length) next.children = children.length === 1 ? children[0] : children;
      return Object.freeze({ type, key: props?.key ?? null, props: Object.freeze(next) });
    },
    cloneElement(element, props) { return React.createElement(element.type, { ...element.props, key: element.key, ...props }); },
    memo(type, compare) { return { $$typeof: Symbol.for('react.memo'), type, compare }; },
    forwardRef(render) { return { $$typeof: Symbol.for('react.forward_ref'), render }; },
  };
  const RN = { View: 'View', ScrollView: 'ScrollView', Text: 'Text', Image: 'Image', Pressable: 'Pressable' };
  const Row = function ActionSheetRow() {};
  Row.Icon = function Icon() {};
  const host = { openLazy(...args) { return args; }, hideActionSheet(key) { hidden.push(key); } };
  const clipboard = { setString(id) { if (clipboardError) throw new Error('Native clipboard failed'); copies.push(id); } };
  let available = ready, patches = 0, removed = 0, timerID = 0, resumeHandler;
  RN.AppState = { addEventListener(event, callback) { resumeHandler = callback; return { remove() { removed++; } }; } };
  const V = {
    metro: {
      common: { React, ReactNative: RN, clipboard },
      findByProps(...props) {
        if (!available) return undefined;
        if (props.includes('openLazy')) return host;
        if (props.includes('ActionSheetRow')) return { ActionSheetRow: Row };
        if (props.includes('setString')) return clipboard;
      },
      findByStoreName(name) { return name === 'MessageStore' ? {
        getMessage(channel, message) { return channel === '123456789012345678' && message === MESSAGE ? { author: { id: AUTHOR } } : null; },
      } : undefined; },
    },
    patcher: { before(method, object, callback) {
      const original = object[method]; patches++;
      object[method] = function(...args) { callback(args); return original.apply(this, args); };
      return () => { object[method] = original; patches--; };
    } },
    ui: { toasts: { showToast(message) { toasts.push(message); } }, assets: { getAssetIDByName() { return 4; } } },
    logger: { error() {} },
  };
  const env = { setTimeout(fn) { timers.set(++timerID, fn); return timerID; }, clearTimeout(id) { timers.delete(id); } };
  const plugin = factory(V, env);
  const tree = () => React.createElement(RN.View, null,
    React.createElement('Group', null, Object.freeze([
      React.createElement(Row, { label: 'Reply', onPress() {} }),
    ])), React.createElement('Group', null, Object.freeze([
      React.createElement(Row, { label: 'Copy Text', onPress() {} }),
      React.createElement(Row, { label: 'Mark Unread', onPress() {} }),
    ])));
  async function open(context, component = () => tree(), key = SHEET, lazy) {
    const module = { default: component };
    const args = host.openLazy(lazy ?? Promise.resolve(module), key, context);
    return { module, wrapped: await args[0] };
  }
  function render(type, props = {}) {
    if (typeof type === 'function') {
      return type.prototype?.isReactComponent ? new type(props).render() : type(props);
    }
    if (type?.$$typeof === Symbol.for('react.memo')) return render(type.type, props);
    if (type?.$$typeof === Symbol.for('react.forward_ref')) return type.render(props, null);
    return type;
  }
  function rows(node, expand = false) {
    if (!node) return [];
    if (Array.isArray(node)) return node.flatMap(child => rows(child, expand));
    if (node.key === KEY) return [node];
    if (expand && typeof node.type === 'function' && node.type !== Row) return rows(render(node.type, node.props), expand);
    return rows(node.props?.children, expand);
  }
  return { plugin, copies, toasts, hidden, React, RN, Row, tree, open, render, rows, host, timers,
    get patches() { return patches; }, get removed() { return removed; },
    makeAvailable() { available = true; }, resume() { resumeHandler('active'); } };
}
const context = id => ({ message: { id: MESSAGE, author: { id } } });

test('adds one author ID action to a frozen copy-text group and copies only that ID', async () => {
  const h = harness(); h.plugin.onLoad();
  const original = h.tree();
  const { module, wrapped } = await h.open(context(AUTHOR), () => original);
  assert.notEqual(wrapped, module);
  const output = h.render(wrapped.default);
  const [row] = h.rows(output);
  assert.equal(h.rows(output).length, 1);
  assert.equal(row.props.label, `Copy User ID\n${AUTHOR}`);
  assert.equal(output.props.children[1].props.children[1], row);
  assert.equal(h.rows(original).length, 0);
  await row.props.onPress();
  assert.deepEqual(h.copies, [AUTHOR]);
  assert.deepEqual(h.hidden, [SHEET]);
  assert.deepEqual(h.toasts, ['Copied user ID']);
  h.plugin.onUnload();
});

test('separate menu openings keep their own author, including own and bot messages', async () => {
  const h = harness(); h.plugin.onLoad();
  const first = await h.open(context(AUTHOR));
  const second = await h.open(context(OTHER));
  await h.rows(h.render(first.wrapped.default))[0].props.onPress();
  await h.rows(h.render(second.wrapped.default))[0].props.onPress();
  assert.deepEqual(h.copies, [AUTHOR, OTHER]); h.plugin.onUnload();
});

test('never substitutes a message ID, a reply author, or an imprecise number', async () => {
  const h = harness(); h.plugin.onLoad();
  for (const message of [{ id: MESSAGE }, { id: MESSAGE, author: { id: Number(AUTHOR) } },
    { id: MESSAGE, referencedMessage: { author: { id: OTHER } } }]) {
    const { wrapped } = await h.open({ message });
    assert.equal(h.rows(h.render(wrapped.default)).length, 0);
  }
  h.plugin.onUnload();
});

test('resolves author from render props and from MessageStore when opening has IDs', async () => {
  const h = harness(); h.plugin.onLoad();
  const direct = await h.open({}, props => h.tree());
  assert.equal(h.rows(h.render(direct.wrapped.default, context(AUTHOR)))[0].props.label, `Copy User ID\n${AUTHOR}`);
  const stored = await h.open({ channelId: '123456789012345678', messageId: MESSAGE });
  assert.equal(h.rows(h.render(stored.wrapped.default))[0].props.label, `Copy User ID\n${AUTHOR}`);
  h.plugin.onUnload();
});

test('memo, forward-ref, class, and nested sheets keep the selected author', async () => {
  const h = harness(); h.plugin.onLoad();
  class ClassSheet {
    constructor(props) { this.props = props; }
    render() { return h.tree(); }
  }
  ClassSheet.prototype.isReactComponent = {};
  const Nested = () => h.tree();
  const wrappers = [h.React.memo(() => h.tree()), h.React.forwardRef(() => h.tree()), ClassSheet,
    () => h.React.createElement(Nested, context(OTHER))];
  for (const component of wrappers) {
    const { wrapped } = await h.open(context(AUTHOR), component);
    const rows = h.rows(h.render(wrapped.default), true);
    assert.equal(rows.length, 1); assert.ok(rows[0].props.label.endsWith(AUTHOR));
  }
  h.plugin.onUnload();
});

test('other menus and already-injected output remain unchanged', async () => {
  const h = harness(); h.plugin.onLoad();
  const other = await h.open(context(AUTHOR), undefined, 'UserProfileActionSheet');
  assert.equal(other.module, other.wrapped);
  const first = await h.open(context(AUTHOR));
  const injected = h.render(first.wrapped.default);
  const again = await h.open(context(AUTHOR), () => injected);
  assert.equal(h.render(again.wrapped.default), injected);
  assert.equal(h.rows(injected).length, 1); h.plugin.onUnload();
});

test('unload restores menu hook and blocks existing rows and pending lazy promises', async () => {
  const h = harness(); const original = h.host.openLazy; h.plugin.onLoad(); h.plugin.onLoad();
  assert.equal(h.patches, 1);
  const opened = await h.open(context(AUTHOR));
  const [row] = h.rows(h.render(opened.wrapped.default));
  let resolve;
  const deferred = new Promise(r => { resolve = r; });
  const pending = h.open(context(OTHER), undefined, SHEET, deferred);
  h.plugin.onUnload();
  await row.props.onPress();
  const module = { default: () => h.tree() }; resolve(module);
  assert.equal((await pending).wrapped, module);
  assert.deepEqual(h.copies, []); assert.equal(h.host.openLazy, original);
  assert.equal(h.patches, 0); assert.equal(h.removed, 1);
  h.plugin.onLoad();
  assert.equal(h.rows(h.render(opened.wrapped.default)).length, 0);
  await row.props.onPress(); assert.deepEqual(h.copies, []); h.plugin.onUnload();
});

test('clipboard failure reports failure and leaves the sheet open', async () => {
  const h = harness(createPlugin, { clipboardError: true }); h.plugin.onLoad();
  const { wrapped } = await h.open(context(AUTHOR));
  await h.rows(h.render(wrapped.default))[0].props.onPress();
  assert.deepEqual(h.copies, []); assert.deepEqual(h.hidden, []);
  assert.deepEqual(h.toasts, ['Could not copy user ID']); h.plugin.onUnload();
});

test('modules that load late connect on resume and retry timer is cleaned up', () => {
  const h = harness(createPlugin, { ready: false }); h.plugin.onLoad();
  assert.equal(h.patches, 0); assert.equal(h.timers.size, 1);
  h.makeAvailable(); h.resume(); assert.equal(h.patches, 1);
  h.plugin.onUnload(); assert.equal(h.timers.size, 0); assert.equal(h.patches, 0);
});

test('published bundle evaluates in Revenge expression loader and manifest matches hash', async () => {
  const bundle = await readFile(new URL('../index.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.hash, createHash('sha256').update(bundle).digest('hex'));
  assert.equal(manifest.main, 'index.js');
  const h = harness(V => vm.runInNewContext(`vendetta => { return ${bundle} }`, { setTimeout, clearTimeout })(V));
  h.plugin.onLoad(); const { wrapped } = await h.open(context(AUTHOR));
  await h.rows(h.render(wrapped.default))[0].props.onPress();
  assert.deepEqual(h.copies, [AUTHOR]); h.plugin.onUnload();
});
