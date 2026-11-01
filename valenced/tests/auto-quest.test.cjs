'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, Renderer, ACCOUNT, FRIEND } = require('../../revenge-next/tests/next-harness.cjs');
const { installSettingsSection } = require('./settings-fixture.cjs');
const ID = '141000000000000001';
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function quest(patch = {}) {
    return { id: ID, config: { expiresAt: '2030-01-01T00:00:00Z', messages: { questName: 'Test Video' },
        taskConfigV2: { tasks: { WATCH_VIDEO_ON_MOBILE: { target: 14 } } } },
        userStatus: { enrolledAt: '2026-01-01', progress: {} }, ...patch };
}
function fixture(t, opts = {}) {
    const w = createWorld({ splitHTTP: !!opts.nested, http: opts.http }), renderers = [];
    w.registry = installSettingsSection(w);
    const listeners = new Set();
    w.questStore = { quests: opts.quests ?? new Map([[ID, quest()]]), listeners,
        addChangeListener: fn => listeners.add(fn), removeChangeListener: fn => listeners.delete(fn),
        emit: () => { for (const fn of [...listeners]) fn(); } };
    w.installQuestStore = (expose = true) => {
        if (expose) w.stores.QuestStore = w.questStore;
        w.addModule(opts.defaultStore ? { default: w.questStore } : w.questStore);
    };
    if (!opts.coldStore) w.installQuestStore(!opts.findStore);
    if (opts.coldHTTP) {
        w.httpModule = w.modules.find(m => m.HTTP || m.getAPIBaseURL);
        w.modules.splice(w.modules.indexOf(w.httpModule), 1);
    }
    w.requests = () => w.calls.filter(x => x[0] === 'http' && x[1] === 'post');
    w.tick = async ms => { await Renderer.act(async () => { await w.advance(ms); await settle(); await w.advance(0); await settle(); }); };
    w.startQuest = async initial => { const item = await w.start('auto-quest', initial); await w.tick(0); return item; };
    w.mount = async item => { const ui = await w.render(item); renderers.push(ui); return ui; };
    w.toggle = async (ui, label, value) => { await Renderer.act(async () => {
        ui.root.findAllByType('Switch').find(x => x.props.accessibilityLabel === label).props.onValueChange(value);
        await settle(); await w.advance(0);
    }); };
    w.retry = async ui => { await Renderer.act(async () => {
        ui.root.findByType('Button').props.onPress(); await settle(); await w.advance(0);
    }); };
    w.text = ui => JSON.stringify(ui.toJSON());
    t.after(async () => {
        for (const ui of renderers.reverse()) await Renderer.act(async () => ui.unmount());
        for (const item of [...w.loaded.values()]) await Renderer.act(async () => w.stop(item));
        await settle();
        assert.equal(listeners.size, 0, 'QuestStore listener removed');
        assert.equal(w.stores.UserStore.listeners.size, 0, 'account listener removed');
        assert.equal(w.appListeners.size, 0); assert.equal(w.timers.size, 0);
        assert.equal(w.moduleWaiters.size, 0); assert.equal(w.pathWaiters.size, 0);
        assert.deepEqual(w.registry.section.settings, w.registry.core);
        assert.deepEqual(w.errors, []);
    });
    return w;
}

for (const nested of [false, true]) test((nested ? 'nested' : 'flat') + ' Discord HTTP reports elapsed progress and confirmed success once', async t => {
    const w = fixture(t, { nested, http: async (_method, input) => ({ status: 200, body: input.body.timestamp === 14
        ? { completed_at: '2026-11-01T00:00:00Z' } : { completed_at: null } }) });
    await w.startQuest(); assert.equal(w.requests().length, 0);
    await w.tick(6999); assert.equal(w.requests().length, 0);
    await w.tick(1); assert.equal(w.requests()[0][2].body.timestamp, 7);
    await w.tick(7000); assert.deepEqual(w.requests().map(x => x[2].body.timestamp), [7, 14]);
    assert.equal(w.toasts.filter(x => x.startsWith('Quest completed:')).length, 1);
    const ui = await w.mount(w.loaded.get('auto-quest')); await w.retry(ui); await w.tick(60000);
    assert.equal(w.requests().length, 2, 'retry does not rerun server-confirmed quests');
    assert.ok(w.requests().every(x => x[2].url === '/quests/' + ID + '/video-progress'));
    assert.equal(w.calls.some(x => x[0] === 'fetch'), false, 'no raw token/fetch fallback');
});

test('cold QuestStore and HTTP attach after startup without restarting Discord', async t => {
    const w = fixture(t, { coldStore: true, coldHTTP: true, nested: true });
    const item = await w.startQuest(), ui = await w.mount(item);
    assert.match(w.text(ui), /Open Discord Quests/);
    w.installQuestStore(); w.addModule(w.httpModule); await w.tick(7000);
    assert.equal(w.requests().length, 1);
});

test('default-exported QuestStore and HTTP are discovered', async t => {
    const w = fixture(t, { defaultStore: true, findStore: true, coldHTTP: true, nested: true });
    w.addModule({ default: w.httpModule });
    await w.startQuest(); await w.tick(7000); assert.equal(w.requests().length, 1);
});

for (const kind of ['array', 'object', 'getter']) test(kind + ' QuestStore collections support legacy snake_case quest data', async t => {
    const q = quest({ config: { expires_at: '2030-01-01', messages: { quest_name: 'Legacy Video' },
        task_config: { tasks: { WATCH_VIDEO: { target: 12 } } } },
        userStatus: undefined, user_status: { enrolled_at: '2026-01-01', progress: { WATCH_VIDEO: { value: 5 } } } });
    const w = fixture(t, { quests: kind === 'object' ? { [ID]: q } : [q] });
    if (kind === 'getter') { delete w.questStore.quests; w.questStore.getQuests = () => [q]; }
    await w.startQuest(); await w.tick(7000); assert.equal(w.requests()[0][2].body.timestamp, 12);
});

test('prefers mobile video task when desktop and mobile targets differ', async t => {
    const q = quest(); q.config.taskConfigV2.tasks.WATCH_VIDEO = { target: 3 };
    const w = fixture(t, { quests: [q] }); await w.startQuest();
    await w.tick(3000); assert.equal(w.requests().length, 0);
    await w.tick(4000); assert.equal(w.requests()[0][2].body.timestamp, 7);
});

test('accepted quests begin after acceptance and new-quest notices are deduplicated', async t => {
    const q = quest({ userStatus: {} }), w = fixture(t, { quests: [q] });
    await w.startQuest(); for (let n = 0; n < 10; n++) w.questStore.emit();
    await w.tick(30000); assert.equal(w.requests().length, 0); assert.equal(w.toasts.length, 1);
    q.userStatus.enrolledAt = '2026-11-01'; w.questStore.emit(); await w.tick(7000);
    assert.equal(w.requests().length, 1);
});

test('expired, completed, unaccepted, ignored and non-video quests make no progress requests', async t => {
    const q = quest(), unsupported = quest({ id: '141000000000000002' });
    unsupported.config.taskConfigV2.tasks = { PLAY_ON_DESKTOP: { target: 30 } };
    const expired = quest({ id: '141000000000000003' }); expired.config.expiresAt = '2020-01-01';
    const complete = quest({ id: '141000000000000004', userStatus: { enrolledAt: '2026-01-01', completedAt: '2026-10-01' } });
    const w = fixture(t, { quests: [q, unsupported, expired, complete, quest({ id: '../bad', userStatus: {} })] });
    await w.startQuest({ ignoredQuestIds: { [ID]: true } }); await w.tick(120000);
    assert.equal(w.requests().length, 0); assert.deepEqual(w.toasts, []);
});

test('unsupported quest notices obey both notification settings', async t => {
    const q = quest({ userStatus: {} }); q.config.taskConfigV2.tasks = { PLAY_ACTIVITY: { target: 60 } };
    const w = fixture(t, { quests: [q] });
    const item = await w.startQuest({ notifyUnsupported: true, notifyNewQuest: false }), ui = await w.mount(item);
    assert.equal(w.toasts.length, 0);
    await w.toggle(ui, 'Notify for new quests', true); await w.tick(0);
    assert.equal(w.toasts.length, 1); assert.match(w.toasts[0], /Unsupported/);
    await w.tick(120000); assert.equal(w.requests().length, 0);
});

test('switching off immediately cancels the runner; changes persist and resume without a restart', async t => {
    const w = fixture(t), item = await w.startQuest(), ui = await w.mount(item);
    await w.tick(3000); await w.toggle(ui, 'Auto-complete video quests', false);
    await w.tick(30000); assert.equal(w.requests().length, 0);
    assert.equal(item.writes.at(-1).enabled, false); assert.equal(item.writes.at(-1).watchAdSpeed, 7);
    await w.toggle(ui, 'Auto-complete video quests', true); await w.tick(7000);
    assert.equal(w.requests().length, 1);
});

test('backgrounding pauses timers and foregrounding resumes', async t => {
    const w = fixture(t); await w.startQuest(); await w.tick(3000);
    for (const fn of w.appListeners) fn('background'); await w.tick(30000);
    assert.equal(w.requests().length, 0);
    for (const fn of w.appListeners) fn('active'); await w.tick(7000);
    assert.equal(w.requests().length, 1);
});

test('switching accounts quarantines the old QuestStore objects until refreshed', async t => {
    const w = fixture(t); await w.startQuest(); await w.tick(3000);
    w.setAccount(FRIEND); await w.tick(30000); assert.equal(w.requests().length, 0);
    w.questStore.emit(); await w.tick(10000); assert.equal(w.requests().length, 0);
    w.questStore.quests = [quest({ id: '141000000000000002' })]; w.questStore.emit(); await w.tick(7000);
    assert.equal(w.requests().length, 1); assert.match(w.requests()[0][2].url, /141000000000000002/);
});

for (const reason of ['account', 'stop', 'pause']) test('late HTTP completion after ' + reason + ' cannot toast, navigate or continue', async t => {
    let finish;
    const w = fixture(t, { http: () => new Promise(resolve => { finish = resolve; }) });
    const item = await w.startQuest(), ui = await w.mount(item); await w.tick(7000);
    if (reason === 'account') w.setAccount(FRIEND);
    if (reason === 'stop') await Renderer.act(async () => w.stop(item));
    if (reason === 'pause') await w.toggle(ui, 'Auto-complete video quests', false);
    finish({ status: 200, body: { completed_at: '2026-11-01' } }); await w.tick(60000);
    assert.equal(w.requests().length, 1); assert.deepEqual(w.toasts, []);
    assert.equal(w.calls.some(x => x[0] === 'goBack'), false);
});

test('reaching the target without Discord confirmation never announces success or loops', async t => {
    const w = fixture(t), item = await w.startQuest(), ui = await w.mount(item);
    await w.tick(7000); await w.tick(7000); await w.tick(120000);
    assert.equal(w.requests().length, 2); assert.equal(w.toasts.length, 0);
    assert.match(w.text(ui), /awaiting Discord completion confirmation/);
    await w.retry(ui); await w.tick(7000); assert.equal(w.requests().length, 3);
});

test('QuestStore confirmation ends a pending timer and announces completion once', async t => {
    const q = quest(), w = fixture(t, { quests: [q] }); await w.startQuest();
    q.userStatus.completedAt = '2026-11-01'; w.questStore.emit(); await w.tick(60000);
    assert.equal(w.requests().length, 0); assert.equal(w.toasts.length, 1);
});

test('HTTP failures pause without repeated requests and Check again explicitly retries', async t => {
    const w = fixture(t, { http: async () => ({ status: 403, body: { message: 'Forbidden' } }) });
    const item = await w.startQuest(), ui = await w.mount(item);
    await w.tick(7000); await w.tick(120000);
    assert.equal(w.requests().length, 1); assert.match(w.text(ui), /HTTP 403/);
    await w.retry(ui); await w.tick(7000); assert.equal(w.requests().length, 2);
});

test('explicit 429 delays are honored and retries are bounded', async t => {
    const w = fixture(t, { http: async () => ({ status: 429, body: { retry_after: 3 } }) });
    await w.startQuest(); await w.tick(7000); assert.equal(w.requests().length, 1);
    await w.tick(2999); assert.equal(w.requests().length, 1);
    await w.tick(1); assert.equal(w.requests().length, 2);
    await w.tick(3000); assert.equal(w.requests().length, 3);
    await w.tick(120000); assert.equal(w.requests().length, 3);
});

test('a thrown rate limit response uses the same bounded retry path', async t => {
    const w = fixture(t, { http: async () => { throw { status: 429, body: { retry_after: 2 } }; } });
    await w.startQuest(); await w.tick(7000); await w.tick(2000);
    assert.equal(w.requests().length, 2);
});

test('request timeout pauses, permits manual retry and ignores the old late response', async t => {
    const pending = [];
    const w = fixture(t, { http: () => new Promise(resolve => pending.push(resolve)) });
    const item = await w.startQuest(), ui = await w.mount(item); await w.tick(7000); await w.tick(25000);
    assert.match(w.text(ui), /HTTP 408/); await w.retry(ui); await w.tick(7000);
    assert.equal(w.requests().length, 2);
    pending[0]({ status: 200, body: { completed_at: '2026-11-01' } }); await w.tick(0);
    assert.equal(w.toasts.some(x => x.startsWith('Quest completed:')), false);
    pending[1]({ status: 200, body: { completed_at: '2026-11-01' } }); await w.tick(0);
    assert.equal(w.toasts.filter(x => x.startsWith('Quest completed:')).length, 1);
});

test('malformed responses do not produce a successful quest result', async t => {
    const w = fixture(t, { http: async () => ({ status: 200, body: '<html>not JSON</html>' }) });
    await w.startQuest(); await w.tick(7000); await w.tick(120000);
    assert.equal(w.requests().length, 1); assert.equal(w.toasts.some(x => x.startsWith('Quest completed:')), false);
});

test('Fetch-like JSON text completion is accepted', async t => {
    const w = fixture(t, { http: async () => ({ status: 200, ok: true, text: async () => '{"completed_at":"2026-11-01"}' }) });
    await w.startQuest(); await w.tick(7000);
    assert.equal(w.toasts.filter(x => x.startsWith('Quest completed:')).length, 1);
});

test('one quest is processed at a time and store changes cannot create duplicate runners', async t => {
    const w = fixture(t, { quests: [quest(), quest({ id: '141000000000000002' })],
        http: async () => ({ status: 200, body: { completed_at: '2026-11-01' } }) });
    await w.startQuest(); for (let i = 0; i < 10; i++) w.questStore.emit();
    await w.tick(7000); assert.equal(w.requests().length, 1);
    await w.tick(7000); assert.equal(w.requests().length, 2);
    assert.notEqual(w.requests()[0][2].url, w.requests()[1][2].url);
});

test('unenrolment and expiry cancel pending progress', async t => {
    const q = quest(), w = fixture(t, { quests: [q] }); await w.startQuest();
    delete q.userStatus.enrolledAt; w.questStore.emit(); await w.tick(7000); assert.equal(w.requests().length, 0);
    q.userStatus.enrolledAt = '2026-11-01'; w.questStore.emit(); await w.tick(1000);
    q.config.expiresAt = '2020-01-01'; await w.tick(7000); assert.equal(w.requests().length, 0);
});

for (const change of ['none', 'route', 'account', 'disable']) test('auto-exit is guarded when change = ' + change, async t => {
    const w = fixture(t); let route = { key: 'video1', name: 'QuestVideoPlayer', params: { questId: ID } };
    w.navigation.getCurrentRoute = () => route; w.navigation.canGoBack = () => true;
    const item = await w.startQuest({ autoExitAds: true }), ui = await w.mount(item);
    await w.tick(2000);
    if (change === 'route') route = { key: 'chat1', name: 'Chat' };
    if (change === 'account') w.setAccount(FRIEND);
    if (change === 'disable') await w.toggle(ui, 'Close the matching quest video', false);
    await w.tick(3000); assert.equal(w.calls.filter(x => x[0] === 'goBack').length, change === 'none' ? 1 : 0);
});

for (const route of [{ key: 'settings', name: 'Settings' },
    { key: 'header', name: 'QuestHeader', params: { questId: ID } },
    { key: 'badge', name: 'QuestBadge', params: { questId: ID } },
    { key: 'video1', name: 'QuestVideoPlayer', params: { questId: '141000000000000002' } },
    { key: 'video1', name: 'QuestVideoPlayer' }]) test('auto-exit ignores unrelated or unidentified route ' + JSON.stringify(route), async t => {
    const w = fixture(t); w.navigation.getCurrentRoute = () => route; w.navigation.canGoBack = () => true;
    await w.startQuest({ autoExitAds: true }); await w.tick(5000);
    assert.equal(w.calls.some(x => x[0] === 'goBack'), false);
});

test('stopping before cold discovery leaves no subscriptions, timers, notifications or requests', async t => {
    const w = fixture(t, { coldStore: true, coldHTTP: true }); const item = await w.startQuest();
    await w.stop(item); w.installQuestStore(); w.addModule(w.httpModule); await w.tick(120000);
    assert.equal(w.requests().length, 0); assert.deepEqual(w.toasts, []);
});

test('settings defaults normalize malformed values and preserve ignored IDs on edits', async t => {
    const w = fixture(t, { quests: [] }), item = await w.startQuest({ watchAdSpeed: -9, autoExitDelay: 'NaN',
        ignoredQuestIds: { [ID]: true, bad: true }, enabled: 'no' }), ui = await w.mount(item);
    assert.match(w.text(ui), /Progress interval: 7 seconds/);
    await w.toggle(ui, 'Notify for new quests', false);
    assert.equal(item.writes.at(-1).enabled, true);
    assert.deepEqual(item.writes.at(-1).ignoredQuestIds, { [ID]: true });
});
