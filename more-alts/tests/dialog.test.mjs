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
    function WebView(props) { return { type: 'WebView', props }; }
    const V = { plugin: { storage: {} }, metro: { common: { React, ReactNative: RN }, findByProps: key => key === 'WebView' && withWebView ? { WebView, default: WebView } : undefined, findByStoreName: () => undefined } };
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

test('stable12 opens the compact Add Account dialog with no QR control or web login UI', t => {
    const h = harness(() => { throw new Error('must not authenticate'); }); t.after(h.close);
    h.press('Add another account');
    const modal = JSON.stringify(h.modal());
    assert.match(modal, /Add Account/);
    assert.doesNotMatch(modal, /Welcome back!|QR code|Log in with QR Code|MA-QR-/i);
    assert.equal(h.find('Log in with QR Code'), undefined);
    assert.equal(h.webview(), undefined);
    assert.ok(h.find('Email or Phone Number', 'TextInput'));
    assert.ok(h.find('Password', 'TextInput'));
    assert.ok(h.find('Use Discord’s normal sign-in', 'TouchableOpacity'));
});

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

test('MFA can request an SMS, display only its masked destination, and save after SMS verification', async t => {
    const requests = [];
    const h = harness(async (url, init) => {
        requests.push([url, init]);
        return response(url.endsWith('/auth/login') ? { mfa: true, sms: true, ticket: 'fixture-dialog-sms-ticket' }
            : url.endsWith('/sms/send') ? { phone: '+6587654321' }
            : url.endsWith('/sms') ? { token } : user);
    }); t.after(h.close);
    h.press('Add another account'); h.type('Email or Phone Number', '+6599990000'); h.type('Password', 'fixture-password');
    h.press('Continue'); await flush();
    assert.equal(requests.length, 1);
    assert.ok(h.find('Send SMS code'));
    h.press('Send SMS code'); await flush();
    assert.ok(h.find('SMS Code', 'TextInput'));
    assert.equal(h.find('SMS Code', 'TextInput').props.keyboardType, 'number-pad');
    assert.equal(h.find('Resend SMS code').props.disabled, true);
    assert.match(JSON.stringify(h.modal()), /•••• 4321/);
    assert.doesNotMatch(JSON.stringify(h.modal()), /6587654321/);
    h.press('Use authenticator or backup code'); await flush();
    assert.ok(h.find('Verification Code', 'TextInput'));
    h.press('Use SMS code'); await flush();
    assert.equal(requests.length, 2, 'method changes do not resend an SMS');
    h.type('SMS Code', '001234'); h.press('Verify'); await flush();
    assert.equal(h.modal(), undefined);
    assert.equal(h.V.plugin.storage.accounts[user.id].token, token);
    assert.ok(requests[2][0].endsWith('/auth/mfa/sms'));
    assert.doesNotMatch(JSON.stringify(h.V.plugin.storage), /fixture-dialog-sms-ticket|001234|6587654321/);
});

test('MFA explains unavailable SMS and never sends a request for an unenrolled account', async t => {
    let requests = 0;
    const h = harness(async () => { requests++; return response({ mfa: true, sms: false, ticket: 'fixture-dialog-no-sms' }); });
    t.after(h.close);
    h.press('Add another account'); h.type('Email or Phone Number', 'fixture@example.invalid'); h.type('Password', 'fixture-password');
    h.press('Continue'); await flush();
    assert.equal(h.find('Send SMS code'), undefined);
    assert.match(JSON.stringify(h.modal()), /SMS authentication is not enabled/);
    assert.ok(h.find('Use Discord’s normal sign-in'));
    assert.equal(requests, 1);
});

test('closing during SMS delivery discards the challenge and ignores a late send response', async t => {
    let finish;
    const h = harness(async url => url.endsWith('/auth/login')
        ? response({ mfa: true, sms: true, ticket: 'fixture-pending-dialog-sms' })
        : new Promise(resolve => { finish = resolve; })); t.after(h.close);
    h.press('Add another account'); h.type('Email or Phone Number', 'fixture@example.invalid'); h.type('Password', 'fixture-password');
    h.press('Continue'); await flush(); h.press('Send SMS code'); await Promise.resolve();
    h.modal().props.onRequestClose(); finish(response({ phone: '+*******4321' })); await flush();
    assert.equal(h.modal(), undefined); assert.deepEqual(h.V.plugin.storage.accounts, {});
    h.press('Add another account'); assert.equal(h.find('SMS Code'), undefined);
    assert.equal(h.find('Email or Phone Number', 'TextInput').props.value, '');
});
