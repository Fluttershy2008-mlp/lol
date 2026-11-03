'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, CHANNEL, FRIEND, GUILD } = require('../../revenge-next/tests/next-harness.cjs');
const { installColdProfileModule } = require('./profile-fixture.cjs');
const ID = '807723155015073803';
const PATH = 'components_native/chat/contentHandlers.tsx';
const event = (data = {}) => ({ nativeEvent: { parsedUserId: ID, channelId: CHANNEL, ...data } });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function fixture(t, options = {}) {
    const w = createWorld({ splitHTTP: true, ...options });
    const cold = installColdProfileModule(w);
    const contentHandlers = { onTapMention: (...args) => w.calls.push(['originalMention', ...args]), onLongPressLink() {} };
    const original = contentHandlers.onTapMention;
    const add = () => w.addModule({ contentHandlers }, PATH);
    if (!options.late) add();
    t.after(async () => {
        for (const item of [...w.loaded.values()].reverse()) await w.stop(item);
        assert.equal(w.timers.size, 0); assert.equal(w.pathWaiters.size, 0);
        assert.equal(contentHandlers.onTapMention, original);
        assert.deepEqual(w.errors, []);
    });
    return { w, cold, contentHandlers, add, original, opened: () => w.calls.filter(x => x[0] === 'profileOpened') };
}

test('tap screenshot parsedUserId resolves it and opens the cold native profile without the access alert', async t => {
    const f = fixture(t, { http: (_method, input) => ({ status: 200, body: { id: input.url.split('/').pop(), username: 'afroaxolotl' } }) });
    await f.w.start('valid-user');
    await f.contentHandlers.onTapMention(event({ guildId: GUILD }));
    assert.equal(f.opened().length, 1);
    assert.deepEqual({ ...f.opened()[0][1] }, { userId: ID, channelId: CHANNEL, guildId: GUILD });
    assert.equal(f.opened()[0][2], 'stack');
    assert.equal(f.cold.initializedFactories(), 1); assert.equal(f.cold.unrelatedFactories(), 0);
    assert.equal(f.w.calls.some(x => x[0] === 'originalMention'), false);
    assert.equal(f.w.alerts.length, 0);
    assert.equal(f.w.calls.filter(x => x[0] === 'dispatch' && x[1].type === 'USER_UPDATE').length, 1);
});

test('resolved user mentions open without a lookup, while roles, everyone and malformed IDs keep native behaviour', async t => {
    const f = fixture(t, { http() { throw Error('Unexpected request'); } });
    await f.w.start('valid-user');
    await f.contentHandlers.onTapMention(event({ userId: FRIEND }));
    assert.equal(f.opened()[0][1].userId, FRIEND);
    for (const data of [{ roleId: ID }, { roleName: '@everyone' }, { roleName: '@here' }, { parsedUserId: 'bad' }, { parsedUserId: Number(ID) }, { parsedUserId: null }])
        f.contentHandlers.onTapMention(event(data));
    assert.equal(f.w.calls.filter(x => x[0] === 'originalMention').length, 6);
    assert.equal(f.opened().length, 1);
});

test('late contentHandlers and pre-captured JSX callbacks both handle unresolved mentions', async t => {
    const f = fixture(t, { late: true });
    const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    f.w.addModule(jsx);
    await f.w.start('valid-user');
    // A view can retain a callback captured before the shared module is patched.
    const node = jsx.jsx('TextDisplay', { onTapMention: f.original, onTapLink: f.original });
    assert.equal(node.props.onTapLink, f.original);
    await node.props.onTapMention(event({ userId: FRIEND }));
    assert.equal(f.opened().length, 1);
    f.add();
    await f.contentHandlers.onTapMention(event({ userId: FRIEND }));
    assert.equal(f.opened().length, 2);
});

for (const status of [403, 404, 429]) test('lookup status ' + status + ' gives an honest result without a fake profile or old alert', async t => {
    const f = fixture(t, { http: () => ({ status, body: { retry_after: 2 } }) });
    await f.w.start('valid-user');
    await f.contentHandlers.onTapMention(event());
    assert.equal(f.opened().length, 0); assert.equal(f.w.alerts.length, 0);
    assert.equal(f.w.calls.some(x => x[0] === 'originalMention'), false);
    assert.equal(f.w.toasts.length, 1);
});

test('repeated taps share one lookup and open one profile', async t => {
    let complete, requests = 0;
    const f = fixture(t, { http() { requests++; return new Promise(resolve => { complete = resolve; }); } });
    await f.w.start('valid-user');
    const a = f.contentHandlers.onTapMention(event()), b = f.contentHandlers.onTapMention(event());
    await flush(); complete({ status: 200, body: { id: ID, username: 'actual-user' } });
    await Promise.all([a, b]);
    assert.equal(requests, 1); assert.equal(f.opened().length, 1);
});

for (const change of ['disable', 'logout', 'channel', 'account']) test('pending tap does not open after ' + change, async t => {
    let complete;
    const f = fixture(t, { http: () => new Promise(resolve => { complete = resolve; }) });
    const item = await f.w.start('valid-user');
    const task = f.contentHandlers.onTapMention(event()); await flush();
    if (change === 'disable') await f.w.stop(item);
    if (change === 'logout') await f.w.dispatcher.dispatch({ type: 'LOGOUT' });
    if (change === 'channel') f.w.stores.SelectedChannelStore.getChannelId = () => '300000000000000002';
    if (change === 'account') f.w.stores.UserStore.getCurrentUser = () => ({ id: FRIEND });
    complete({ status: 200, body: { id: ID, username: 'actual-user' } });
    await task; assert.equal(f.opened().length, 0);
});

test('auto-resolution can be disabled without disabling direct mention taps', async t => {
    const f = fixture(t);
    const item = await f.w.start('valid-user');
    item.api.jsonStorage.cache.autoResolve = false;
    await f.contentHandlers.onTapMention(event({ userId: FRIEND }));
    assert.equal(f.opened().length, 1);
});
