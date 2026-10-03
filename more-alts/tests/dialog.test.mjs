import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlugin } from '../src/plugin.mjs';

function harness(fetcher, withWebView = false) {
    const hooks = [], cleanups = [];
    let cursor = 0;
    const opened = [], alerts = [];
    const React = {
        createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
        useState(initial) { const key = cursor++; if (!(key in hooks)) hooks[key] = initial; return [hooks[key], value => { hooks[key] = typeof value === 'function' ? value(hooks[key]) : value; }]; },
        useRef(initial) { const key = cursor++; if (!(key in hooks)) hooks[key] = { current: initial }; return hooks[key]; },
        useEffect(effect) { const key = cursor++; if (!(key in hooks)) { hooks[key] = true; cleanups.push(effect()); } }
    };
    const RN = Object.fromEntries(['Text', 'View', 'ScrollView', 'Modal', 'KeyboardAvoidingView', 'TextInput', 'TouchableOpacity', 'ActivityIndicator', 'Switch', 'Image'].map(name => [name, name]));
    Object.assign(RN, { Platform: { OS: 'android' }, useColorScheme: () => 'dark', Alert: { alert: (...args) => alerts.push(args) }, Linking: { openURL: async url => opened.push(url) } });
    const V = { plugin: { storage: {} }, metro: { common: { React, ReactNative: RN }, findByProps: key => key === 'WebView' && withWebView ? { WebView: 'WebView' } : undefined, findByStoreName: () => undefined } };
    const plugin = createPlugin(V, { fetch: fetcher }); plugin.onLoad();
    function expand(tree) {
        if (Array.isArray(tree)) return tree.map(expand);
        if (!tree || typeof tree !== 'object') return tree;
        if (typeof tree.type === 'function') return expand(tree.type(tree.props));
        return { ...tree, props: { ...tree.props, children: expand(tree.props.children) } };
    }
    function walk(tree, predicate) {
        if (!tree) return;
        if (Array.isArray(tree)) { for (const item of tree) { const found = walk(item, predicate); if (found) return found; } return; }
        if (predicate(tree)) return tree;
        return walk(tree.props?.children, predicate);
    }
    const render = () => { cursor = 0; return expand(plugin.settings()); };
    const find = (label, type) => walk(render(), n => n.props?.accessibilityLabel === label && (!type || n.type === type));
    return { V, find, opened, alerts,
        modal: () => walk(render(), n => n.type === 'Modal'),
        webview: () => walk(render(), n => n.type === 'WebView'),
        press(label) { const node = find(label, 'TouchableOpacity'); assert.ok(node, label); assert.ok(!node.props.disabled, `${label} enabled`); node.props.onPress(); },
        type(label, value) { const node = find(label, 'TextInput'); assert.ok(node, label); node.props.onChangeText(value); },
        close() { cleanups.forEach(fn => fn?.()); plugin.onUnload(); }
    };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const user = { id: '100000000000000009', username: 'fixture-user' };
const token = 'fixture-dialog-session-not-a-real-token';
const response = data => ({ ok: true, status: 200, json: async () => data });

test('Add Account dialog submits the entered password and returns to the saved list', async t => {
    const requests = [];
    const h = harness(async (url, init) => { requests.push([url, init]); return response(url.endsWith('/auth/login') ? { token } : user); });
    t.after(h.close);
    h.press('Add another account'); assert.ok(h.modal());
    assert.equal(h.find('Continue').props.disabled, true);
    h.type('Email or Phone Number', 'fixture@example.invalid'); h.type('Password', ' password ');
    h.press('Continue'); await flush();
    assert.equal(h.modal(), undefined);
    assert.equal(h.V.plugin.storage.accounts[user.id].token, token);
    assert.equal(JSON.parse(requests[0][1].body).password, ' password ');
    h.press('Add another account'); assert.equal(h.find('Password', 'TextInput').props.value, '');
});
test('MFA opens inside the dialog and Back cancels the challenge while preserving the email', async t => {
    const h = harness(async () => response({ mfa: true, totp: true, ticket: 'fixture-ticket' })); t.after(h.close);
    h.press('Add another account'); h.type('Email or Phone Number', 'fixture@example.invalid'); h.type('Password', 'password');
    h.press('Continue'); await flush(); assert.ok(h.find('Verification Code', 'TextInput'));
    h.press('Back'); assert.equal(h.find('Email or Phone Number', 'TextInput').props.value, 'fixture@example.invalid');
    assert.equal(h.find('Password', 'TextInput').props.value, ''); assert.deepEqual(h.V.plugin.storage.accounts, {});
});
test('Android back cancels a pending login and clears fields even if the request responds later', async t => {
    let resolve;
    const h = harness(() => new Promise(r => { resolve = r; })); t.after(h.close);
    h.press('Add another account'); h.type('Email or Phone Number', 'fixture@example.invalid'); h.type('Password', 'password');
    h.press('Continue'); await Promise.resolve(); h.modal().props.onRequestClose();
    resolve(response({ token })); await flush();
    assert.equal(h.modal(), undefined); assert.deepEqual(h.V.plugin.storage.accounts, {});
    h.press('Add another account'); assert.equal(h.find('Email or Phone Number', 'TextInput').props.value, '');
});
test('password reset opens only Discord’s official login page on the user’s action', async t => {
    const h = harness(() => { throw new Error('should not authenticate'); }); t.after(h.close);
    h.press('Add another account'); h.press('Forgot your password?');
    assert.deepEqual(h.opened, []);
    const action = h.alerts[0][2].find(button => button.text === 'Open Discord'); action.onPress(); await flush();
    assert.deepEqual(h.opened, ['https://discord.com/login']);
});

const qrEvent = (view, token, userId) => ({ nativeEvent: { url: 'https://discord.com/', data: JSON.stringify({
    provider: 'more-alts-qr', session: view.props.source.html.match(/session:'([^']+)'/)[1], type: 'complete', token, userId
}) } });
test('QR approval bridge saves the verified account through the new mobile dialog', async t => {
    const h = harness(async () => response(user), true); t.after(h.close);
    h.press('Add another account'); h.press('Log in with QR Code');
    const view = h.webview(); assert.ok(view); assert.ok(h.find('Refresh QR code'));
    view.props.onMessage(qrEvent(view, token, user.id)); await flush();
    assert.equal(h.V.plugin.storage.accounts[user.id].token, token); assert.equal(h.modal(), undefined);
});
test('QR cannot add an account after the user dismisses the dialog', async t => {
    let requests = 0, stopped = 0;
    const h = harness(async () => { requests++; return response(user); }, true); t.after(h.close);
    h.press('Add another account'); h.press('Log in with QR Code');
    const old = h.webview(); old.props.ref({ injectJavaScript: () => stopped++ });
    h.modal().props.onRequestClose(); old.props.onMessage(qrEvent(old, token, user.id)); await flush();
    assert.equal(stopped, 1); assert.equal(requests, 0); assert.deepEqual(h.V.plugin.storage.accounts, {});
});
test('plugin unload explicitly stops a QR session even if the settings screen remains mounted', () => {
    const h = harness(() => { throw new Error('must not authenticate'); }, true);
    h.press('Add another account'); h.press('Log in with QR Code');
    let stopped = 0; h.webview().props.ref({ injectJavaScript: () => stopped++ }); h.close(); assert.equal(stopped, 1);
});
