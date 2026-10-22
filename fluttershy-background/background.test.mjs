import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(new URL('index.js', import.meta.url), 'utf8');
const ELEMENT = Symbol.for('react.test.element');
const makeElement = (type, props, ...children) => ({
    $$typeof: ELEMENT, type,
    props: { ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) },
});
function harness(module, options = {}) {
    const toasts = [], warnings = [], stateUpdates = [], effects = [], patches = [];
    const RN = { View: 'View', Image: 'Image', ScrollView: 'ScrollView', FlatList: 'FlatList' };
    const React = {
        createElement: makeElement,
        isValidElement: value => value?.$$typeof === ELEMENT,
        cloneElement: (element, props, ...children) => makeElement(element.type, { ...element.props, ...props }, ...children),
        useState: initial => [options.enabled ?? initial, value => stateUpdates.push(value)],
        useEffect: fn => effects.push(fn),
    };
    const after = (key, owner, callback) => {
        const descriptor = Object.getOwnPropertyDescriptor(owner, key);
        if (descriptor && descriptor.writable === false) throw new Error('Readonly export');
        const original = owner[key];
        if (typeof original !== 'function') throw new Error('Not callable');
        function patched(...args) {
            const result = original.apply(this, args);
            const replacement = callback(args, result);
            return replacement === undefined ? result : replacement;
        }
        owner[key] = patched;
        const patch = { owner, key, original };
        patches.push(patch);
        return () => { owner[key] = original; };
    };
    const lookup = name => name === (options.name ?? 'MessagesConnected') ? module : undefined;
    const api = {
        metro: {
            common: { React, ReactNative: RN },
            findByProps: lookup, findByDisplayName: lookup,
            findByName: lookup, findByTypeName: lookup,
        },
        patcher: { after },
        ui: { toasts: { showToast: text => toasts.push(text) } },
        logger: { warn: (...args) => warnings.push(args) },
    };
    const factory = runInNewContext('vendetta => { return ' + source + '\n; }');
    const plugin = factory(api);
    return { plugin, api, RN, React, toasts, warnings, patches, effects, stateUpdates };
}

function flatStyle(style) {
    return Array.isArray(style) ? Object.assign({}, ...style.map(flatStyle)) : style ?? {};
}

test('loader evaluates the bundle as a single returned expression', () => {
    assert.equal(source[0], '(');
    const h = harness({ default: () => null });
    assert.equal(typeof h.plugin.onLoad, 'function');
    assert.equal(typeof h.plugin.onUnload, 'function');
});

test('patches a default function instead of its unrelated .render property', () => {
    const tree = makeElement('View', { style: { backgroundColor: '#111111' } });
    const renderer = () => tree;
    const stray = () => { throw new Error('Wrong renderer'); };
    renderer.render = stray;
    const mod = { default: renderer };
    const h = harness(mod); h.plugin.onLoad();
    assert.equal(h.patches.length, 1);
    assert.equal(h.patches[0].key, 'default');
    assert.equal(renderer.render, stray);
    const wrapper = mod.default();
    assert.equal(wrapper.props.children, tree);
    const result = wrapper.type(wrapper.props);
    assert.equal(result.props.children[0].type, 'Image');
    assert.match(result.props.children[0].props.source.uri, /fluttershy-pastel\.jpg/);
    assert.equal(result.props.children[0].props.pointerEvents, 'none');
    assert.equal(flatStyle(result.props.children[1].props.style).backgroundColor, 'transparent');
    h.plugin.onUnload();
    assert.equal(mod.default, renderer);
});

test('unwraps nested React memo and forwardRef exports', () => {
    const forward = { $$typeof: Symbol.for('react.forward_ref'), render: () => makeElement('View', {}) };
    const memo = { $$typeof: Symbol.for('react.memo'), type: { $$typeof: Symbol.for('react.memo'), type: forward } };
    const h = harness({ default: memo }); h.plugin.onLoad();
    assert.equal(h.patches[0].owner, forward);
    assert.equal(h.patches[0].key, 'render');
    assert.equal(forward.render().props.children.type, 'View');
    h.plugin.onUnload();
});

test('supports a direct forwardRef export', () => {
    const mod = { $$typeof: Symbol.for('react.forward_ref'), render: () => makeElement('View', {}) };
    const h = harness(mod);h.plugin.onLoad();
    assert.equal(h.patches[0].owner, mod);
    assert.equal(h.patches[0].key, 'render');
    h.plugin.onUnload();
});

test('patches class render while preserving this and constructor identity', () => {
    class Messages { render() { return makeElement('View', { testValue: this.value }); } }
    const mod = { default: Messages }, h = harness(mod);
    h.plugin.onLoad();
    const instance = new Messages(); instance.value = 42;
    assert.equal(mod.default, Messages);
    assert.equal(instance.render().props.children.props.testValue, 42);
    h.plugin.onUnload();
    assert.equal(instance.render().type, 'View');
});

test('falls back to a modern named ChatView export', () => {
    const mod = { ChatView: () => makeElement('View', {}) }, h = harness(mod, { name: 'ChatView' });
    h.plugin.onLoad();
    assert.equal(h.patches[0].key, 'ChatView');
    assert.ok(mod.ChatView().props.children);
    h.plugin.onUnload();
});

test('read-only or unsupported exports fail visibly without changing global APIs', () => {
    const mod = Object.freeze({ default: () => null }), h = harness(mod);
    const patcher = h.api.patcher.after;
    assert.throws(() => h.plugin.onLoad(), /no compatible chat renderer/);
    assert.equal(h.patches.length, 0);
    assert.equal(h.api.patcher.after, patcher);
    h.plugin.onUnload();
});

test('a cyclic or non-callable memo never reaches the patcher', () => {
    const memo = { $$typeof: Symbol.for('react.memo') }; memo.type = memo;
    const h = harness({ default: memo });
    assert.throws(() => h.plugin.onLoad(), /no compatible chat renderer/);
    assert.equal(h.patches.length, 0);
});

test('null output stays null and repeated load does not add patches', () => {
    const mod = { default: () => null }, h = harness(mod);
    h.plugin.onLoad();h.plugin.onLoad();
    assert.equal(mod.default(), null);
    assert.equal(h.patches.length, 1);
    h.plugin.onUnload();h.plugin.onUnload();
});

test('clears message surface ancestors without mutating messages, cards, refs or handlers', () => {
    const onPress = () => {}, ref = { current: null };
    const card = makeElement('View', { style: { backgroundColor: '#ab1234' }, children: 'attachment', onPress });
    const surface = makeElement('ScrollView', {
        HACK_fixModalInteraction: true, style: { backgroundColor: '#222222', flex: 1 },
        contentContainerStyle: { backgroundColor: '#222222', padding: 12 }, ref, children: card,
    });
    const sibling = makeElement('View', { style: { backgroundColor: '#345678' }, children: 'header' });
    const tree = makeElement('View', { style: { backgroundColor: '#111111' } }, sibling, surface);
    const mod = { default: () => tree }, h = harness(mod); h.plugin.onLoad();
    const wrapper = mod.default();const result = wrapper.type(wrapper.props);
    const cloned = result.props.children[1]; const children = cloned.props.children;
    assert.equal(children[0], sibling);
    assert.equal(children[1].props.children, card);
    assert.equal(children[1].props.ref, ref);
    assert.equal(children[1].props.children.props.onPress, onPress);
    assert.equal(flatStyle(children[1].props.style).backgroundColor, 'transparent');
    assert.equal(flatStyle(children[1].props.style).flex, 1);
    assert.equal(flatStyle(children[1].props.contentContainerStyle).padding, 12);
    assert.equal(surface.props.style.backgroundColor, '#222222');
    assert.equal(tree.props.style.backgroundColor, '#111111');
    assert.equal(card.props.style.backgroundColor, '#ab1234');
    h.plugin.onUnload();
});

test('unloading hides a mounted background and restores the exact original children', () => {
    const tree = makeElement('View', { style: { backgroundColor: '#111111' } });
    const mod = { default: () => tree }, h = harness(mod); h.plugin.onLoad();
    const wrapper = mod.default(); wrapper.type(wrapper.props);
    const cleanups = h.effects.map(fn => fn());
    h.plugin.onUnload();
    assert.equal(h.stateUpdates.at(-1), false);
    cleanups.forEach(fn => fn?.());
    const off = harness({ default: () => tree }, { enabled: false });off.plugin.onLoad();
    const offWrapper = off.patches[0].owner[off.patches[0].key]();
    assert.equal(offWrapper.type(offWrapper.props), tree);
    off.plugin.onUnload();
});

test('logs image failures once without opening a toast', () => {
    const mod = { default: () => makeElement('View', {}) }, h = harness(mod);h.plugin.onLoad();
    const wrapper = mod.default(); const image = wrapper.type(wrapper.props).props.children[0];
    image.props.onError({ nativeEvent: { error: 'network' } });
    image.props.onError({ nativeEvent: { error: 'network' } });
    assert.equal(h.warnings.filter(args => args[0].includes('Wallpaper download failed')).length, 1);
    assert.equal(h.toasts.length, 0);
    h.plugin.onUnload();
    image.props.onError({ nativeEvent: { error: 'network' } });
    assert.equal(h.warnings.filter(args => args[0].includes('Wallpaper download failed')).length, 1);
    assert.equal(h.toasts.length, 0);
});

test('does not queue toast rendering on startup or image failure', () => {
    const pendingToasts = [];
    const mod = { default: () => makeElement('View', {}) }, h = harness(mod);
    // The legacy bridge can return successfully before the newer ToastContainer
    // crashes while rendering the queued object. A synchronous try/catch cannot
    // protect the app from this delayed failure.
    h.api.ui.toasts.showToast = content => pendingToasts.push({ content });
    h.plugin.onLoad();
    const wrapper = mod.default();
    const image = wrapper.type(wrapper.props).props.children[0];
    image.props.onError({ nativeEvent: { error: 'network' } });
    h.plugin.onUnload();
    assert.equal(pendingToasts.length, 0, 'The background plugin must not enqueue legacy toast UI');
});

test('works without accessing a client toast service', () => {
    let accesses = 0;
    const mod = { default: () => makeElement('View', {}) }, h = harness(mod);
    Object.defineProperty(h.api.ui, 'toasts', {
        get() { accesses++; throw new Error('Toast service is incompatible'); },
    });
    h.plugin.onLoad();
    const wrapper = mod.default();
    wrapper.type(wrapper.props).props.children[0].props.onError({ nativeEvent: { error: 'network' } });
    h.plugin.onUnload();
    assert.equal(accesses, 0);
});

test('removes the core background wrapper while enabled to avoid duplicate wallpapers', () => {
    function ThemeBackground() {}
    const content = makeElement('View', { style: { backgroundColor: '#111111' } });
    const tree = makeElement(ThemeBackground, {}, content);
    const mod = { default: () => tree }, h = harness(mod);h.plugin.onLoad();
    const wrapper=mod.default(), result=wrapper.type(wrapper.props);
    assert.equal(result.props.children[1].type, 'View');
    assert.equal(wrapper.props.children, tree);
    h.plugin.onUnload();
});
