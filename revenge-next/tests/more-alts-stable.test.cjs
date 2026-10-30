'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createWorld, React, Renderer } = require('./next-harness.cjs');
const { installSettingsSection } = require('../../valenced/tests/settings-fixture.cjs');

const isValenced = process.env.PLUGIN_TEST_TARGET === 'valenced';
const target = isValenced ? 'valenced' : 'revenge-next';

function getButton(ui, title) {
    const button = ui.root.findAll(n => typeof n.type === 'string' &&
        n.props?.accessibilityLabel === title && typeof n.props.onPress === 'function')[0];
    assert.ok(button, 'missing button: ' + title);
    return button;
}

async function act(action) {
    await Renderer.act(async () => { await action(); for (let i = 0; i < 8; i++) await Promise.resolve(); });
}

function scenario(t, options = {}) {
    const w = createWorld(options), section = installSettingsSection(w), renders = [];
    t.after(async () => {
        for (const ui of renders.reverse()) await Renderer.act(async () => ui.unmount());
        for (const item of [...w.loaded.values()].reverse()) await w.stop(item);
        assert.equal(w.timers.size, 0);
        assert.equal(w.registeredScreens.size, 0);
        assert.deepEqual(section.section.settings, section.core);
        assert.deepEqual(w.errors, []);
    });
    w.openManager = async (initial = options.initial ?? {}) => {
        const item = await w.start('more-alts', initial);
        const Page = isValenced
            ? w.registeredScreens.get('dev.fluttershy2008.more-alts.valenced-settings').screen.getComponent()
            : item.options.SettingsComponent;
        let ui;
        await Renderer.act(async () => { ui = Renderer.create(React.createElement(Page, { api: item.api })); });
        renders.push(ui);
        return { ui, item };
    };
    return w;
}

test('More Alts stable12 has no bundled QR login or WebView runtime', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', '..', target, '.build', 'plugins', 'more-alts', 'index.js'), 'utf8');
    assert.doesNotMatch(source, /startRemoteAuth|createNativeWebView|Log in with QR Code|Refresh QR code|qrSession|Welcome back!/);
    assert.match(source, /Add Account/);
});

test('More Alts stable12 offers only account credentials and native sign-in', async t => {
    const w = scenario(t);
    const { ui } = await w.openManager();
    await act(() => getButton(ui, 'Add another account').props.onPress());
    const text = JSON.stringify(ui.toJSON());
    assert.match(text, /Add Account/);
    assert.doesNotMatch(text, /QR code|Log in with QR Code|Welcome back!|MA-QR-/i);
    assert.ok(ui.root.findAll(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'Email or Phone Number').length);
    assert.ok(ui.root.findAll(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'Password').length);
    assert.ok(getButton(ui, 'Use Discord’s normal sign-in'));
    await act(() => getButton(ui, 'Close add account').props.onPress());
    assert.equal(ui.root.findAll(n => n.type === 'Modal').length, 0);
    assert.equal(w.calls.some(x => x[0] === 'fetch'), false);
});

test('More Alts stable12 retains password login and saves an account', async t => {
    const id = '100000000000000099', token = 'fixture-stable12-session-no-real-credentials';
    const w = scenario(t, { fetch: async url => new Response(JSON.stringify(url.endsWith('/auth/login')
        ? { token } : { id, username: 'stable-account' }), { status: 200, headers: { 'content-type': 'application/json' } }) });
    const { ui, item } = await w.openManager();
    await act(() => getButton(ui, 'Add another account').props.onPress());
    const field = label => ui.root.findAll(n => n.type === 'TextInput' && n.props.accessibilityLabel === label)[0];
    await act(() => field('Email or Phone Number').props.onChangeText('example@invalid.test'));
    await act(() => field('Password').props.onChangeText('a-fixture-password'));
    await act(() => getButton(ui, 'Continue').props.onPress());
    assert.equal(item.api.jsonStorage.cache.accounts[id].username, 'stable-account');
    assert.equal(ui.root.findAll(n => n.type === 'Modal').length, 0);
});

test('expired target offers account-specific recovery and keeps both saved accounts', async t => {
    const id = '100000000000000099';
    const oldToken = 'fixture-invalid-saved-token-for-second-account';
    const validToken = 'fixture-renewed-saved-token-for-second-account';
    const original = { id, username: 'second-account', token: oldToken };
    const w = scenario(t, {
        initial: { accounts: { [id]: original }, accountOrder: [id] },
        fetch: async (url, init) => {
            if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ token: validToken }), { status: 200 });
            if (init?.headers?.Authorization === oldToken) return new Response('{}', { status: 401 });
            if (init?.headers?.Authorization === validToken) return new Response(JSON.stringify({ id, username: 'second-account' }), { status: 200 });
            throw new Error('Unexpected credentials or URL in saved-account fixture');
        },
    });
    const { ui, item } = await w.openManager();
    await act(() => getButton(ui, 'Switch account').props.onPress());
    const account = item.api.jsonStorage.cache.accounts[id];
    assert.equal(account.token, oldToken, 'an expired attempt must never delete the old entry');
    assert.equal(w.calls.filter(x => x[0] === 'switchAccount').length, 0);
    assert.ok(getButton(ui, 'Re-sign in'));
    assert.match(JSON.stringify(ui.toJSON()), /second-account/);
    await act(() => getButton(ui, 'Re-sign in').props.onPress());
    assert.match(JSON.stringify(ui.toJSON()), /Update saved account/);
    const field = label => ui.root.findAll(n => n.type === 'TextInput' && n.props.accessibilityLabel === label)[0];
    await act(() => field('Email or Phone Number').props.onChangeText('fixture@example.invalid'));
    await act(() => field('Password').props.onChangeText('fixture-password'));
    await act(() => getButton(ui, 'Continue').props.onPress());
    assert.equal(item.api.jsonStorage.cache.accounts[id].token, validToken);
    assert.equal(ui.root.findAll(n => n.type === 'Modal').length, 0);
    assert.equal(ui.root.findAll(n => n.props?.accessibilityLabel === 'Re-sign in').length, 0);
});
test('signing into another account does not claim to renew the selected expired account', async t => {
    const id = '100000000000000099', otherId = '100000000000000098';
    const oldToken = 'fixture-old-saved-token-do-not-overwrite';
    const newToken = 'fixture-new-account-session-preserve-old-token';
    const w = scenario(t, {
        initial: { accounts: { [id]: { id, username: 'expired-target', token: oldToken } }, accountOrder: [id] },
        fetch: async (url, init) => {
            if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ token: newToken }), { status: 200 });
            if (init?.headers?.Authorization === oldToken) return new Response('{}', { status: 401 });
            if (init?.headers?.Authorization === newToken)
                return new Response(JSON.stringify({ id: otherId, username: 'different-account' }), { status: 200 });
            throw new Error('Unexpected call in session recovery test');
        },
    });
    const { ui, item } = await w.openManager();
    await act(() => getButton(ui, 'Switch account').props.onPress());
    await act(() => getButton(ui, 'Re-sign in').props.onPress());
    const field = label => ui.root.findAll(n => n.type === 'TextInput' && n.props.accessibilityLabel === label)[0];
    await act(() => field('Email or Phone Number').props.onChangeText('other@example.invalid'));
    await act(() => field('Password').props.onChangeText('fixture-password'));
    await act(() => getButton(ui, 'Continue').props.onPress());
    assert.equal(item.api.jsonStorage.cache.accounts[id].token, oldToken);
    assert.equal(item.api.jsonStorage.cache.accounts[otherId].token, newToken);
    assert.ok(getButton(ui, 'Re-sign in'));
    assert.match(JSON.stringify(ui.toJSON()), /still needs to be signed in again/);
});

test('Save current account waits for file readback, saves fresh authentication details, and survives restart', async t => {
    const token = 'fixture-fresh-authentication-store-session';
    const previousToken = 'fixture-old-saved-authentication-session';
    const otherId = '100000000000000099';
    const otherToken = 'fixture-preserved-other-account-session';
    const w = scenario(t, { fetch: async (_url, init) => {
        if (init.headers.Authorization === otherToken)
            return new Response(JSON.stringify(w.users[otherId]), { status: 200 });
        assert.equal(init.headers.Authorization, token, 'use AuthenticationStore rather than an unrelated getToken export');
        return new Response(JSON.stringify({ ...w.users[id], global_name: 'Fresh Profile', avatar: 'freshavatar' }), { status: 200 });
    } });
    const id = w.accountId();
    w.users[otherId] = { id: otherId, username: 'other-account' };
    w.stores.AuthenticationStore.getToken = () => token;
    w.modules.unshift({ getToken: () => 'fixture-stale-unrelated-token-export' });
    const { ui, item } = await w.openManager({ accounts: {
        [id]: { ...w.users[id], token: previousToken },
        [otherId]: { ...w.users[otherId], token: otherToken },
    }, accountOrder: [id, otherId] });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'more-alts-save-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'storage.json');
    fs.writeFileSync(file, JSON.stringify(item.api.jsonStorage.cache));
    let releaseRead, startedRead;
    const reading = new Promise(resolve => { startedRead = resolve; });
    item.api.jsonStorage.set = async function(value, replace) {
        assert.equal(replace, true); this.cache = structuredClone(value);
        await fs.promises.writeFile(file, JSON.stringify(value));
    };
    item.api.jsonStorage.get = async function() {
        startedRead(); await new Promise(resolve => { releaseRead = resolve; });
        return this.cache = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    };
    let pending;
    await act(async () => { pending = getButton(ui, 'Save current account').props.onPress(); await reading; });
    assert.equal(getButton(ui, 'Save current account').props.disabled, true);
    assert.doesNotMatch(JSON.stringify(ui.toJSON()), /Saved @test-owner successfully/);
    await act(async () => { releaseRead(); await pending; });
    assert.match(JSON.stringify(ui.toJSON()), /Saved @test-owner successfully/);
    assert.doesNotMatch(JSON.stringify(ui.toJSON()), /Updated test-owner/);
    assert.match(JSON.stringify(ui.toJSON()), /Last saved:/);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.accounts[id].token, token);
    assert.equal(saved.accounts[id].displayName, 'Fresh Profile');
    assert.equal(saved.accounts[id].avatar, 'freshavatar');
    assert.equal(saved.accounts[otherId].token, otherToken);
    assert.deepEqual(saved.accountOrder, [id, otherId]);
    await act(() => w.stop(item));
    const restarted = await w.openManager(JSON.parse(fs.readFileSync(file, 'utf8')));
    assert.equal(restarted.item.api.jsonStorage.cache.accounts[id].token, token);
    assert.equal(restarted.item.api.jsonStorage.cache.accounts[id].updatedAt, saved.accounts[id].updatedAt);
    assert.match(JSON.stringify(restarted.ui.toJSON()), /Fresh Profile/);
    restarted.item.api.jsonStorage.set = async function(value) {
        this.cache = structuredClone(value); await fs.promises.writeFile(file, JSON.stringify(value));
    };
    restarted.item.api.jsonStorage.get = async function() {
        return this.cache = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    };
    w.modules.find(module => typeof module?.switchAccountToken === 'function').switchAccountToken = nextToken => {
        w.stores.AuthenticationStore.getToken = () => nextToken;
        w.setAccount(nextToken === token ? id : otherId);
    };
    await act(() => getButton(restarted.ui, 'Switch account').props.onPress());
    assert.equal(w.accountId(), otherId);
    await act(() => getButton(restarted.ui, 'Switch account').props.onPress());
    assert.equal(w.accountId(), id, 'the session saved before restart remains usable for switching back');
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).accounts[id].token, token);
});

test('a silently discarded native write shows a save failure, retains accounts, and permits retry', async t => {
    const w = scenario(t, { fetch: async () => new Response(JSON.stringify(w.users[w.accountId()]), { status: 200 }) });
    const id = w.accountId();
    const { ui, item } = await w.openManager({ accounts: { [id]: { ...w.users[id], token: 'fixture-old-preserved-session-value' } }, accountOrder: [id] });
    let disk = structuredClone(item.api.jsonStorage.cache), discard = true;
    item.api.jsonStorage.set = async function(value) {
        this.cache = structuredClone(value); if (!discard) disk = structuredClone(value);
    };
    item.api.jsonStorage.get = async function() { return this.cache = structuredClone(disk); };
    await act(() => getButton(ui, 'Save current account').props.onPress());
    assert.match(JSON.stringify(ui.toJSON()), /Could not confirm the account was saved/);
    assert.doesNotMatch(JSON.stringify(ui.toJSON()), /Saved @test-owner successfully/);
    assert.equal(disk.accounts[id].token, 'fixture-old-preserved-session-value');
    assert.equal(item.api.jsonStorage.cache.accounts[id].token, 'fixture-old-preserved-session-value');
    assert.equal(getButton(ui, 'Save current account').props.disabled, false);
    discard = false;
    await act(() => getButton(ui, 'Save current account').props.onPress());
    assert.match(JSON.stringify(ui.toJSON()), /Saved @test-owner successfully/);
    assert.equal(disk.accounts[id].token, 'fake-test-session-token-only');
    assert.deepEqual(Object.keys(disk.accounts), [id]);
});
