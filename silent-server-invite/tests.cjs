const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/index.js', 'utf8');

function fixture(options = {}) {
    const calls = [], notices = [], copied = [], changes = [], storage = {};
    const rest = {
        marker: 'rest',
        post(...args) { calls.push({ args, receiver: this.marker }); return Promise.resolve('forwarded'); },
        get() {}, put() {}, patch() {}, del() {}
    };
    const original = rest.post;
    const React = {
        createElement(type, props, ...children) { return { type, props, children }; },
        useState(value) { return [value, next => changes.push(next)]; }
    };
    const ReactNative = Object.fromEntries(['Text', 'Pressable', 'ScrollView', 'TextInput'].map(k => [k, k]));
    const api = {
        metro: {
            common: { React, ReactNative, restAPI: options.noRest ? null : rest, clipboard: { setString: value => copied.push(value) } },
            findByProps: () => options.fallbackRest ? rest : undefined
        },
        plugin: { storage }, ui: { toasts: { showToast: value => notices.push(value) } },
        patcher: {
            instead(key, object, callback) {
                if (options.patchFailure) throw new Error('patch failure');
                const saved = object[key];
                object[key] = function (...args) { return callback(args, saved.bind(this)); };
                return () => { object[key] = saved; };
            }
        }
    };
    // Match Revenge's loader: a lexically injected API, not a global API.
    const plugin = vm.runInNewContext('(vendetta => { return ' + source + '\n})(injectedAPI)', { injectedAPI: api });
    return { plugin, rest, original, calls, notices, copied, storage, changes };
}

async function run() {
    const f = fixture();
    f.plugin.onLoad();
    const patched = f.rest.post;
    f.plugin.onLoad();
    assert.equal(f.rest.post, patched, 'loading twice must not stack hooks');
    const blocked = [
        '/channels/123456789/invites', '/channels/123456789/invites/',
        '/channels/123456789/invites?unique=true', '/api/v10/channels/123456789/invites',
        'https://discord.com/api/v10/channels/123456789/invites',
        'https://canary.discord.com/api/v9/channels/123456789/invites',
        'https://ptb.discordapp.com/api/channels/123456789/invites'
    ];
    for (const url of blocked) {
        await assert.rejects(f.rest.post({ url, body: {} }), error => error.name === 'SilentServerInviteBlocked');
    }
    await assert.rejects(f.rest.post('/channels/123456789/invites'), /New invite blocked/);
    assert.equal(f.calls.length, 0, 'blocked requests must never reach REST');
    assert.ok(f.notices.length >= 1, 'blocking should explain the failure');

    const forwarded = [
        '/channels/123456789/messages', '/invites/abc', '/channels/123456789/invites/abc',
        'https://example.com/channels/123456789/invites',
        'https://discord.com.evil.example/channels/123456789/invites',
        '/channels/123456789/invites-extra', '/users/@me/channels'
    ];
    for (const url of forwarded) assert.equal(await f.rest.post({ url }), 'forwarded');
    assert.equal(f.calls.length, forwarded.length);
    assert.ok(f.calls.every(call => call.receiver === 'rest'), 'forwarded calls retain this');

    let screen = f.plugin.settings();
    const find = (node, predicate) => {
        if (!node || typeof node !== 'object') return undefined;
        if (predicate(node)) return node;
        for (const child of node.children || []) { const found = find(child, predicate); if (found) return found; }
    };
    const button = label => find(screen, node => node.type === 'Pressable' && node.children[0].children[0] === label);
    await button('Copy saved invite').props.onPress();
    assert.equal(f.copied.length, 0, 'cannot copy an unsaved link');
    const input = find(screen, node => node.type === 'TextInput');
    input.props.onChangeText('https://discord.gg/Example');
    assert.equal(f.changes.at(-1), 'https://discord.gg/Example');
    // A React rerender supplies this draft; override useState through a fresh context.
    f.storage.savedInvite = 'https://discord.com/invite/Example_1';
    screen = f.plugin.settings();
    button('Save existing invite').props.onPress();
    assert.equal(f.storage.savedInvite, 'https://discord.gg/Example_1');
    await button('Copy saved invite').props.onPress();
    assert.equal(f.copied.at(-1), 'https://discord.gg/Example_1');
    assert.equal(f.calls.length, forwarded.length, 'save/copy makes no REST request');
    f.storage.savedInvite = 'https://discord.gg.evil.example/abc';
    screen = f.plugin.settings();
    button('Save existing invite').props.onPress();
    assert.match(f.changes.at(-1), /valid/);
    await button('Copy saved invite').props.onPress();
    assert.equal(f.copied.length, 1, 'lookalike domains cannot be copied');
    button('Clear saved invite').props.onPress();
    assert.equal(f.storage.savedInvite, '');

    f.plugin.onUnload();
    assert.equal(f.rest.post, f.original, 'unload restores original');
    await f.rest.post({ url: blocked[0] });
    assert.equal(f.calls.length, forwarded.length + 1);
    f.plugin.onUnload();
    f.plugin.onLoad();
    await assert.rejects(f.rest.post({ url: blocked[0] }), /blocked/);
    f.plugin.onUnload();
    const missing = fixture({ noRest: true });
    assert.throws(() => missing.plugin.onLoad(), /NOT active/);
    const fallback = fixture({ noRest: true, fallbackRest: true });
    fallback.plugin.onLoad();
    await assert.rejects(fallback.rest.post({ url: blocked[0] }), /blocked/);
    assert.equal(fallback.calls.length, 0, 'REST discovery blocks without a common.restAPI export');
    fallback.plugin.onUnload();
    const failed = fixture({ patchFailure: true });
    assert.throws(() => failed.plugin.onLoad(), /patch failure/);
    assert.equal(failed.rest.post, failed.original);
    assert.equal(f.plugin.default, f.plugin);
    console.log('PASS: invite blocking, request forwarding, lifecycle, local settings, clipboard, and API failure handling.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
