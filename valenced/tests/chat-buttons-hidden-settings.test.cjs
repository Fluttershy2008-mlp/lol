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
const panels = ui => ui.root.findAll(n => n.type === 'Modal' && n.props.testID === 'hide-blocked.settings-panel');
function scene(t) {
  // Deliberately provide no pluginSettings API and make navigation silently do nothing.
  // Only a mounted settings panel counts as success, not a call to navigate().
  const w = createWorld(), f = installChatButtonsHost(w), views = [];
  const mount = async el => { let ui; await Renderer.act(async () => { ui = Renderer.create(el); }); views.push(ui); return ui; };
  const startChat = async initial => { let item; await Renderer.act(async () => { item = await w.start('chat-buttons', initial); f.attachStorage(item); }); return item; };
  const menu = async composer => { await Renderer.act(async () => button(composer, 'Buttons').props.onPress()); return mount(f.popout.ContextMenuPopout({ menu: w.lastMenu, transitionState: 0, cleanUp() {} })); };
  t.after(async () => {
    for (const ui of views.reverse()) await Renderer.act(async () => ui.unmount());
    for (const item of [...w.loaded.values()].reverse()) await Renderer.act(async () => w.stop(item));
    assert.deepEqual(w.errors, []); assert.equal(w.timers.size, 0); assert.equal(w.pathWaiters.size, 0);
    assert.equal(f.patches.size, 0); assert.equal(f.backHandlers.size, 0);
  });
  return { w, f, mount, startChat, menu };
}
for (const first of [true, false]) test('menu tap mounts real hider settings with silent navigation and no helper; Chat Buttons ' + (first ? 'first' : 'last'), async t => {
  const s = scene(t); let chat;
  if (first) chat = await s.startChat();
  const target = await s.w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  if (!first) chat = await s.startChat();
  const before = structuredClone(target.api.jsonStorage.cache);
  s.w.RN.useColorScheme = () => 'light';
  s.w.stores.ThemeStore = { theme: 'dark' };
  const composer = await s.mount(h(s.f.chatModule.default)), menu = await s.menu(composer);
  assert.equal(menu.root.findAll(n => n.type === 'Pressable' && n.props.accessibilityLabel === LABEL).length, 1);
  const actions = menu.root.findAll(n => n.type === 'Pressable' && n.props.accessibilityHint === 'Opens filter settings');
  assert.equal(actions[0], button(menu, LABEL));
  const labels = menu.root.findAll(n => n.type === 'Pressable').map(n => n.props.accessibilityLabel);
  assert.ok(labels.indexOf(LABEL) < labels.indexOf('Emoji'));
  await Renderer.act(async () => button(menu, LABEL).props.onPress());
  assert.equal(panels(composer).length, 1, 'the settings UI must actually mount');
  const panel = panels(composer)[0];
  assert.equal(panel.props.statusBarTranslucent, true);
  assert.ok(panel.findAll(n => n.type === 'View' && n.props.style?.paddingTop === s.w.RN.StatusBar.currentHeight).length);
  const body = panel.findAll(n => n.type === 'View' && n.props.style?.backgroundColor === 'BACKGROUND_BASE_LOWER');
  assert.ok(body.length, 'the modal uses the active Discord theme tokens');
  assert.ok(panel.findAll(n => n.type === 'Text' && n.props.children === `Version ${target.manifest.version}`).length);
  assert.equal(s.w.closed, true); assert.deepEqual(target.api.jsonStorage.cache, before);
  assert.equal(s.w.calls.some(c => c[0] === 'navigate' || c[0] === 'send'), false); assert.equal(s.w.alerts.length, 0);
  const toggle = composer.root.findAll(n => n.type === 'Switch' && n.props.accessibilityLabel === 'Hide selected server icons')[0];
  await Renderer.act(async () => toggle.props.onValueChange(false));
  assert.equal(target.api.jsonStorage.cache.hideServerIcons, false); assert.deepEqual(Array.from(target.api.jsonStorage.cache.hiddenServerIds), [GUILD]);
  await Renderer.act(async () => button(composer, 'Manage hidden server IDs (1)').props.onPress());
  const input = composer.root.findAll(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'Server IDs to hide')[0];
  await Renderer.act(async () => input.props.onChangeText('400000000000000002'));
  await Renderer.act(async () => button(composer, 'Add and hide servers').props.onPress());
  assert.deepEqual(Array.from(target.api.jsonStorage.cache.hiddenServerIds), [GUILD, '400000000000000002']);
  await Renderer.act(async () => button(composer, 'Close Hidden users & servers').props.onPress());
  assert.equal(panels(composer).length, 0);
  await Renderer.act(async () => button(menu, LABEL).props.onPress());
  assert.equal(panels(composer).length, 1); assert.equal(Object.keys(chat.api.jsonStorage.cache.seen).filter(id => id === ID).length, 1);
});

test('the direct panel supports saved nicknames/pinning and closes cleanly when the hider stops', async t => {
  const s = scene(t), chat = await s.startChat({ names: { [ID]: 'My hide settings' } });
  const target = await s.w.start('hide-blocked-and-ignored-messages');
  const composer = await s.mount(h(s.f.chatModule.default)), menu = await s.menu(composer);
  assert.ok(button(menu, 'My hide settings'));
  await Renderer.act(async () => chat.api.jsonStorage.set({ kept: { [ID]: true } }));
  assert.equal(menu.root.findAll(n => n.props.accessibilityLabel === 'My hide settings').length, 0);
  const press = button(composer, LABEL).props.onPress;
  await Renderer.act(async () => press()); assert.equal(panels(composer).length, 1);
  await Renderer.act(async () => s.w.stop(target)); assert.equal(panels(composer).length, 0);
  await Renderer.act(async () => press()); assert.equal(panels(composer).length, 0);
  assert.equal(menu.root.findAll(n => n.props.accessibilityLabel === 'My hide settings').length, 0);
});

test('the hider settings button opens the same panel without Chat Buttons and Android Back closes it', async t => {
  const s = scene(t);
  const target = await s.w.start('hide-blocked-and-ignored-messages', { hiddenServerIds: [GUILD] });
  const composer = await s.mount(h(s.f.chatModule.default));
  await Renderer.act(async () => button(composer, LABEL).props.onPress());
  assert.equal(panels(composer).length, 1);
  await Renderer.act(async () => panels(composer)[0].props.onRequestClose());
  assert.equal(panels(composer).length, 0); assert.deepEqual(Array.from(target.api.jsonStorage.cache.hiddenServerIds), [GUILD]);
});
