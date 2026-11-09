'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, GUILD } = require('../../revenge-next/tests/next-harness.cjs');
const { installChatButtonsHost } = require('./chat-buttons-fixture.cjs');
const h = React.createElement, ID = 'dev.fluttershy2008.hide-blocked-and-ignored-messages';
const LABEL = 'Hidden users & servers';
function button(ui, label) {
  const node = ui.root.findAll(n => typeof n.type === 'string' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  assert.ok(node, 'button: ' + label); return node;
}
function scene(t) {
  const routes = [], views = [];
  const w = createWorld({ decorateApi(api) {
    api.pluginSettings = {
      hasPluginSettings: id => id === ID && !!w.loaded.get('hide-blocked-and-ignored-messages')?.options.SettingsComponent,
      openPluginSettings: id => routes.push(id),
    };
  } });
  const f = installChatButtonsHost(w);
  const mount = async element => { let ui; await Renderer.act(async () => { ui = Renderer.create(element); }); views.push(ui); return ui; };
  const startChat = async initial => { let item; await Renderer.act(async () => { item = await w.start('chat-buttons', initial); f.attachStorage(item); }); return item; };
  const menu = async composer => { await Renderer.act(async () => button(composer, 'Buttons').props.onPress()); return mount(f.popout.ContextMenuPopout({ menu: w.lastMenu, transitionState: 0, cleanUp() {} })); };
  t.after(async () => {
    for (const ui of views.reverse()) await Renderer.act(async () => ui.unmount());
    for (const item of [...w.loaded.values()].reverse()) await Renderer.act(async () => w.stop(item));
    assert.deepEqual(w.errors, []); assert.equal(w.timers.size, 0); assert.equal(w.pathWaiters.size, 0);
    assert.equal(f.patches.size, 0); assert.equal(f.backHandlers.size, 0);
  });
  return { w, f, routes, mount, startChat, menu };
}
for (const chatFirst of [true, false]) test('Hidden users & servers opens the existing plugin settings without toggling it; Chat Buttons loaded ' + (chatFirst ? 'first' : 'last'), async t => {
  const s = scene(t); let chat;
  if (chatFirst) chat = await s.startChat();
  const target = await s.w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  if (!chatFirst) chat = await s.startChat();
  const before = structuredClone(target.api.jsonStorage.cache);
  const composer = await s.mount(h(s.f.chatModule.default)), menu = await s.menu(composer);
  const row = button(menu, LABEL);
  assert.equal(row.props.accessibilityRole, 'button');
  await Renderer.act(async () => row.props.onPress());
  assert.deepEqual(s.routes, [ID]); assert.equal(s.w.closed, true);
  assert.deepEqual(target.api.jsonStorage.cache, before);
  assert.equal(s.w.calls.some(call => call[0] === 'send' || call[0] === 'sendMessage'), false);
  assert.equal(Object.keys(chat.api.jsonStorage.cache.seen).filter(id => id === ID).length, 1);
  const page = await s.mount(h(target.options.SettingsComponent, { api: target.api }));
  const toggle = page.root.findAll(n => n.type === 'Switch' && n.props.accessibilityLabel === 'Hide selected server icons')[0];
  await Renderer.act(async () => toggle.props.onValueChange(false));
  assert.equal(target.api.jsonStorage.cache.hideServerIcons, false);
  assert.deepEqual(Array.from(target.api.jsonStorage.cache.hiddenServerIds), [GUILD]);
});

test('shortcut supports nicknames and pinning, gives a useful unavailable message and becomes inert on stop', async t => {
  const s = scene(t), chat = await s.startChat({ names: { [ID]: 'My hide settings' } });
  const target = await s.w.start('hide-blocked-and-ignored-messages');
  const composer = await s.mount(h(s.f.chatModule.default)), menu = await s.menu(composer);
  assert.ok(button(menu, 'My hide settings'));
  await Renderer.act(async () => chat.api.jsonStorage.set({ kept: { [ID]: true } }));
  assert.equal(menu.root.findAll(n => n.props.accessibilityLabel === 'My hide settings').length, 0);
  const pinned = button(composer, LABEL), stalePress = pinned.props.onPress;
  await Renderer.act(async () => pinned.props.onPress()); assert.deepEqual(s.routes, [ID]);
  await s.w.stop(target);
  await Renderer.act(async () => pinned.props.onPress());
  assert.deepEqual(s.routes, [ID]);
  assert.equal(s.w.alerts.at(-1)[0], 'chatbuttons-hidden-settings-unavailable');
  assert.match(s.w.alerts.at(-1)[1].props.content, /Enable HideBlockedAndIgnoredMessages/);
  await Renderer.act(async () => s.w.stop(chat));
  assert.equal(composer.root.findAll(n => n.props.accessibilityLabel === LABEL).length, 0);
  await Renderer.act(async () => stalePress()); assert.deepEqual(s.routes, [ID]);
});
