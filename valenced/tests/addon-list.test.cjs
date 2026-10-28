'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, CHANNEL } = require('../../revenge-next/tests/next-harness.cjs');

function scenario(t, cold = true) {
    const w = createWorld(), renders = [];
    if (cold) w.modules.splice(w.modules.indexOf(w.commands), 1);
    t.after(async () => {
        for (const ui of renders.reverse()) await Renderer.act(async () => ui.unmount());
        for (const item of [...w.loaded.values()].reverse()) await w.stop(item);
        assert.equal(w.timers.size, 0);
        assert.equal(w.moduleWaiters.size, 0);
        assert.equal(w.pathWaiters.size, 0);
        assert.deepEqual(w.errors, []);
    });
    w.settings = async item => {
        let ui;
        await Renderer.act(async () => { ui = Renderer.create(React.createElement(item.options.SettingsComponent, { api: item.api })); });
        renders.push(ui); return ui;
    };
    return w;
}
function copyButton(ui, kind) {
    return ui.root.findAll(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === `Copy ${kind} list`)[0];
}
function listCommands(w) {
    return w.commands.getBuiltInCommands(1).filter(c => ['plugin-list', 'theme-list'].includes(c.name));
}

test('Addon List starts before Discord loads commands and copies both native registries from settings', async t => {
    const w = scenario(t);
    w.U.modules.native.callNativeMethod = async () => ({ result: [
        { manifest: { id: 'test.plugin', name: 'Installed plugin', author: 'Test author' }, source: { repo: 'https://example.test/plugins.json' } },
        { manifest: { id: 'test.theme', name: 'Installed theme', author: 'Theme author', dependencies: { 'valenced.api.themes': { version: '*' } } }, source: { repo: 'https://example.test/themes.json' } },
    ] });
    const item = await w.start('addon-list', { pluginListAlwaysDetailed: true, themeListAlwaysDetailed: true });
    const ui = await w.settings(item);
    assert.ok(copyButton(ui, 'plugin'));
    assert.equal(w.timers.size, 0, 'waiting for commands does not poll');
    await Renderer.act(async () => copyButton(ui, 'plugin').props.onPress());
    assert.match(w.clipboard[0], /Installed plugin/);
    assert.match(w.clipboard[0], /Test author/);
    assert.match(w.clipboard[0], /https:\/\/example.test\/plugins.json/);
    assert.match(w.clipboard[0], /Installed/);
    await Renderer.act(async () => copyButton(ui, 'theme').props.onPress());
    assert.match(w.clipboard[1], /Installed theme/);
    assert.match(w.clipboard[1], /https:\/\/example.test\/themes.json/);
    assert.equal(w.calls.some(c => c[0] === 'sendMessage'), false, 'settings copy never posts');
});

test('Addon List registers and executes both commands when Discord loads them after a minute', async t => {
    const w = scenario(t);
    await w.start('addon-list');
    await w.advance(60000);
    assert.equal(listCommands(w).length, 0);
    w.addModule(w.commands); // Property matching also works without import-tracker metadata.
    const commands = listCommands(w);
    assert.deepEqual(Array.from(commands, c => c.name), ['plugin-list', 'theme-list']);
    assert.equal(new Set(commands.map(c => c.id)).size, 2);
    for (const command of commands) await command.execute([{ name: 'copy', value: true }], { channel: { id: CHANNEL } });
    assert.match(w.clipboard[0], /Addon List/);
    assert.match(w.clipboard[1], /No themes installed/);
    assert.equal(w.calls.some(c => c[0] === 'sendMessage'), false);
    await commands[0].execute([], { channel: { id: CHANNEL } });
    assert.equal(w.calls.filter(c => c[0] === 'sendMessage').length, 1, 'one explicit send produces one message');
});

test('Addon List cancels pending registration on stop and registers once on restart', async t => {
    const w = scenario(t);
    const first = await w.start('addon-list');
    assert.equal(w.moduleWaiters.size, 1);
    await w.stop(first);
    assert.equal(w.moduleWaiters.size, 0);
    w.addModule(w.commands);
    assert.equal(listCommands(w).length, 0);
    const second = await w.start('addon-list');
    assert.equal(listCommands(w).length, 2);
    const stale = listCommands(w)[0];
    await w.stop(second);
    await stale.execute([{ name: 'copy', value: true }], { channel: { id: CHANNEL } });
    assert.equal(w.clipboard.length, 0);
    assert.equal(listCommands(w).length, 0);
    await w.start('addon-list');
    assert.equal(listCommands(w).length, 2);
});

test('Addon List ignores a queued module-ready callback delivered after stop', async t => {
    const w = scenario(t), callbacks = [];
    w.U.modules.finders.getModules = (_filter, callback) => { callbacks.push(callback); return () => {}; };
    const item = await w.start('addon-list');
    await w.stop(item);
    w.addModule(w.commands);
    for (const callback of callbacks) callback(w.commands, w.modules.indexOf(w.commands));
    assert.equal(listCommands(w).length, 0);
    assert.equal(w.clipboard.length, 0);
});

test('Addon List can use imported-path waiting if the general subscription API is unavailable', async t => {
    const w = scenario(t);
    w.U.modules.finders.getModules = undefined;
    await w.start('addon-list');
    assert.equal(w.pathWaiters.size, 1);
    w.addModule(w.commands, 'modules/application_commands/ApplicationCommandBuiltIns.tsx');
    assert.equal(listCommands(w).length, 2);
});

test('Addon List remains usable through settings if Discord command discovery is unsupported', async t => {
    const w = scenario(t);
    w.U.modules.finders.getModules = undefined;
    w.U.discord.utils.modules.finders.getModuleWithImportedPath = undefined;
    const item = await w.start('addon-list');
    const ui = await w.settings(item);
    await Renderer.act(async () => copyButton(ui, 'plugin').props.onPress());
    assert.match(w.clipboard[0], /Addon List/);
    assert.equal(listCommands(w).length, 0);
});
