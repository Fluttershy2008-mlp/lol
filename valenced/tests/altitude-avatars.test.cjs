'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, Renderer } = require('../../revenge-next/tests/next-harness.cjs');

test('square image corners preserve animated sources, press handlers, refs and ordinary attachments', async t => {
  const w = createWorld();
  const image = w.RN.Image, original = image.render;
  const plugin = await w.start('altitude-theme');
  t.after(async () => w.stop(plugin));
  plugin.options.init(plugin.api);
  const source = Object.freeze({ uri: 'https://cdn.discordapp.com/avatars/123/a_abc.gif?size=128' });
  const style = Object.freeze({ borderRadius: 24, width: 48 });
  const props = Object.freeze({ source, style, onPress() {} }), ref = {};
  const result = image.render(props, ref);
  assert.equal(result.props.style.at(-1).borderRadius, 3);
  assert.equal(result.props.style.at(-1).borderTopStartRadius, 3);
  assert.equal(result.props.source, source);
  assert.equal(result.props.onPress, props.onPress);
  assert.equal(result.props.ref, ref);
  assert.equal(style.borderRadius, 24);
  for (const uri of [
    'https://cdn.discordapp.com/attachments/1/2/image.png',
    'https://cdn.discordapp.com/avatar-decoration-presets/1.png',
    'https://cdn.discordapp.com/emojis/1.gif'
  ]) {
    const ordinary = { source: { uri }, style };
    assert.equal(image.render(ordinary).props.style, style);
  }
  await w.stop(plugin);
  assert.equal(image.render, original);
  assert.equal(w.moduleWaiters.size, 0);
  assert.equal(w.pathWaiters.size, 0);
  assert.equal(w.timers.size, 0);
  assert.deepEqual(w.errors, []);
});

test('Altitude settings use the real Valenced React namespace and report native styling', async t => {
  const w = createWorld();
  w.U.modules.native.callNativeMethod = async name => {
    assert.equal(name, 'dev.fluttershy2008.altitude-theme.status');
    return { active: true, messageHooks: 2, fontLoaded: true };
  };
  const plugin = await w.start('altitude-theme');
  const ui = await w.render(plugin);
  t.after(async () => {
    await Renderer.act(async () => ui.unmount());
    await w.stop(plugin);
  });
  const text = ui.root.findAllByType('Text').map(x => x.props.children).join('\n');
  assert.match(text, /Square avatar styling is active/);
  assert.match(text, /Chat fonts are loaded/);
  assert.deepEqual(w.errors, []);
});
