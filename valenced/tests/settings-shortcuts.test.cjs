'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer } = require('../../revenge-next/tests/next-harness.cjs');
const { installSettingsSection } = require('./settings-fixture.cjs');
const h = React.createElement;
const plugins = [
    ['custom-rpc', 'CustomRPC'], ['friends-list', 'Friends List'],
    ['more-alts', 'More Alts!'], ['server-leaver', 'Server Leaver'],
];

function scenario(t) {
    const w = createWorld(), registry = installSettingsSection(w), renders = [];
    w.registry = registry;
    w.mount = async element => {
        let ui; await Renderer.act(async () => { ui = Renderer.create(element); });
        renders.push(ui); return ui;
    };
    t.after(async () => {
        for (const item of [...w.loaded.values()].reverse()) await Renderer.act(async () => w.stop(item));
        for (const ui of renders.reverse()) await Renderer.act(async () => ui.unmount());
        assert.deepEqual(registry.section.settings, registry.core);
        assert.deepEqual(registry.other.settings, ['OtherSetting']);
        assert.equal(w.registeredScreens.size, 0);
        assert.equal(w.timers.size, 0);
        assert.equal(w.moduleWaiters.size, 0);
        assert.deepEqual(w.errors, []);
    });
    return w;
}
function shortcut(w, slug) {
    const key = 'dev.fluttershy2008.' + slug + '.valenced-settings';
    const item = w.registeredScreens.get(key);
    assert.ok(item, slug + ' has a registered native row');
    assert.ok(w.registry.section.settings.includes(key), slug + ' is listed under Valenced');
    return { key, item };
}

for (const [slug, title] of plugins) test(title + ' opens its real settings from the Valenced section', async t => {
    const w = scenario(t);
    await w.start(slug);
    const { key, item } = shortcut(w, slug);
    assert.equal(item.type, 'route');
    assert.equal(item.parent, null);
    assert.equal(item.screen.route, key);
    assert.equal(item.useTitle(), title);
    assert.equal(item.usePredicate(), true);
    const Page = item.screen.getComponent(), headers = [];
    const ui = await w.mount(h(Page, { navigation: { setOptions: opts => headers.push(opts) } }));
    assert.ok(JSON.stringify(ui.toJSON()).includes(title), 'the plugin page rendered');
    assert.equal(headers.at(-1).title, title);
    assert.equal(w.calls.some(call => ['leaveGuild', 'login', 'logout'].includes(call[0])), false);
    assert.ok(w.calls.some(call => call[0] === 'refreshSettings'));
});

test('all four shortcuts coexist with core settings and stop/restart independently', async t => {
    const w = scenario(t), started = [];
    for (const [slug] of plugins) started.push(await w.start(slug));
    assert.equal(w.registry.section.settings.length, w.registry.core.length + 4);
    assert.deepEqual(w.registry.section.settings.slice(0, 4), w.registry.core);
    for (const [slug] of plugins) shortcut(w, slug);
    const old = shortcut(w, 'friends-list').item;
    await w.stop(started[1]);
    assert.equal(old.usePredicate(), false);
    assert.equal(w.registry.section.settings.length, w.registry.core.length + 3);
    for (const slug of ['custom-rpc', 'more-alts', 'server-leaver']) shortcut(w, slug);
    await w.start('friends-list');
    const { key } = shortcut(w, 'friends-list');
    assert.equal(w.registry.section.settings.filter(item => item === key).length, 1);
});

test('native shortcut registration waits for settings modules', async t => {
    const w = scenario(t); w.setSettingsLoaded(false);
    await w.start('friends-list');
    assert.deepEqual(w.registry.section.settings, w.registry.core);
    w.setSettingsLoaded(true);
    for (let n = 0; n < 5; n++) await Promise.resolve();
    shortcut(w, 'friends-list');
});

test('stopping a plugin cancels both pending and queued settings callbacks', async t => {
    const w = scenario(t), callbacks = [];
    w.registry.native.onSettingsModulesLoaded = callback => { callbacks.push(callback); return () => {}; };
    const item = await w.start('server-leaver');
    assert.equal(callbacks.length, 1);
    await w.stop(item);
    for (const callback of callbacks) callback();
    for (let n = 0; n < 5; n++) await Promise.resolve();
    assert.deepEqual(w.registry.section.settings, w.registry.core);
    assert.equal(w.registeredScreens.size, 0);
});

test('a cached shortcut screen stops rendering the plugin when it is disabled', async t => {
    const w = scenario(t), item = await w.start('friends-list');
    const Page = shortcut(w, 'friends-list').item.screen.getComponent();
    const ui = await w.mount(h(Page));
    await Renderer.act(async () => w.stop(item));
    assert.match(JSON.stringify(ui.toJSON()), /Reopen Friends List from Valenced settings/);
    await w.start('friends-list');
    const stale = await w.mount(h(Page));
    assert.match(JSON.stringify(stale.toJSON()), /Reopen Friends List from Valenced settings/);
});

test('a section insertion failure rolls back its route while plugin settings remain available', async t => {
    const w = scenario(t);
    let insertions = 0;
    w.registry.native.addSettingsItemToSection = () => { insertions++; throw new Error('Section is unavailable'); };
    const item = await w.start('custom-rpc');
    assert.equal(insertions, 1);
    assert.equal(w.registeredScreens.size, 0);
    assert.deepEqual(w.registry.section.settings, w.registry.core);
    const ui = await w.mount(h(item.options.SettingsComponent, { api: item.api }));
    assert.match(JSON.stringify(ui.toJSON()), /CustomRPC/);
});

test('stopping during asynchronous plugin startup prevents later shortcut registration', async t => {
    const w = scenario(t), cleanups = [];
    const { withValencedSettingsShortcut } = require('../settings-shortcut.cjs');
    let finish, stopped = 0;
    const options = withValencedSettingsShortcut({
        start: () => new Promise(resolve => { finish = resolve; }), stop: () => { stopped++; },
        SettingsComponent: () => h(w.RN.Text, null, 'Pending settings'),
    }, { id: 'test.pending', title: 'Pending', icon: 'UserIcon' });
    const starting = options.start({ unscoped: w.U, cleanup: fn => cleanups.push(fn), logger: { warn() {} } });
    options.stop(); finish(); await starting;
    for (const cleanup of cleanups) cleanup();
    assert.equal(stopped, 1);
    assert.equal(w.registeredScreens.size, 0);
    assert.deepEqual(w.registry.section.settings, w.registry.core);
});

test('failed plugin startup never publishes a settings row', async t => {
    const w = scenario(t), cleanups = [];
    const { withValencedSettingsShortcut } = require('../settings-shortcut.cjs');
    const options = withValencedSettingsShortcut({
        async start() { throw new Error('Plugin could not start'); },
        SettingsComponent: () => h(w.RN.Text, null, 'Failed settings'),
    }, { id: 'test.failed', title: 'Failed', icon: 'UserIcon' });
    await assert.rejects(options.start({ unscoped: w.U, cleanup: fn => cleanups.push(fn), logger: { warn() {} } }), /Plugin could not start/);
    for (const cleanup of cleanups) cleanup();
    assert.equal(w.registeredScreens.size, 0);
    assert.deepEqual(w.registry.section.settings, w.registry.core);
});
