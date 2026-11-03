'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../themes/rainbow-dash');
function load() {
  const themes = new Map(), fonts = new Map(), groups = new Set();
  const options = vm.runInNewContext(fs.readFileSync(path.join(root, 'index.js'), 'utf8'), {}, { timeout: 1000 }).default;
  options.preInit({ themes: {
    registerGroup(id) { groups.add(id); },
    registerTheme(group, id, definition) { assert.ok(groups.has(group)); themes.set(id, definition); },
    registerFontPack(group, id, definition) { assert.ok(groups.has(group)); fonts.set(id, definition); }
  } });
  return { themes, fonts };
}
function luminance(hex) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x,y) + 0.05) / (Math.min(x,y) + 0.05);
}
test('existing theme identity upgrades to an offline collage and optional clear variant', () => {
  const { themes, fonts } = load();
  assert.deepEqual([...themes.keys()], ['rainbow-dash-theme', 'rainbow-dash-clear']);
  assert.deepEqual([...fonts.keys()], ['rainbow-dash-sonic', 'rainbow-dash-clear']);
  for (const theme of themes.values()) {
    const image = fs.readFileSync(path.join(root, theme.background.path));
    assert.equal(image.readUInt16BE(0), 0xffd8);
    assert.ok(image.length > 100000);
    assert.equal(theme.background.blur, 0);
    assert.equal(theme.background.opacity, 1);
  }
  assert.ok(themes.get('rainbow-dash-clear').background.dimming > themes.get('rainbow-dash-theme').background.dimming);
});
test('modern and legacy labels have readable contrast in every base theme', () => {
  const colors = load().themes.get('rainbow-dash-theme').getColors();
  assert.deepEqual(Object.keys(colors.semantic), ['dark', 'darker', 'light', 'midnight']);
  for (const s of Object.values(colors.semantic)) {
    for (const value of Object.values(s)) assert.match(value, /^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
    for (const bg of ['BACKGROUND_PRIMARY', 'BACKGROUND_SECONDARY', 'BACKGROUND_SURFACE_HIGH']) {
      for (const fg of ['TEXT_DEFAULT', 'TEXT_STRONG', 'TEXT_MUTED', 'ICON_DEFAULT'])
        assert.ok(contrast(s[fg], s[bg]) >= 4.5, fg + ' on ' + bg);
    }
    assert.ok(contrast(s.BUTTON_PRIMARY_TEXT, s.BUTTON_PRIMARY_BACKGROUND) >= 4.5);
    assert.ok(contrast(s.REDESIGN_BUTTON_PRIMARY_TEXT, s.REDESIGN_BUTTON_PRIMARY_BACKGROUND) >= 4.5);
    assert.equal(s.MENTION_FOREGROUND, '#ffdf70');
  }
  for (const value of Object.values(colors.raw)) assert.match(value, /^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
});
test('font selections ship actual TTF bytes and leave emoji/icon/code families alone', () => {
  const { fonts } = load();
  for (const { families } of fonts.values()) {
    assert.equal(Object.keys(families).length, 20);
    for (const [name, variants] of Object.entries(families)) {
      assert.match(name, /^(ggsans-|ABCGintoNormal-|ABCGintoNord-|Ginto-)/);
      const data = fs.readFileSync(path.join(root, variants[0].path));
      assert.equal(data.readUInt32BE(0), 0x00010000);
    }
  }
  const sonic = fonts.get('rainbow-dash-sonic').families;
  assert.match(sonic['ggsans-Normal'][0].path, /Barlow-Regular.ttf$/);
  assert.match(sonic['ABCGintoNormal-Bold'][0].path, /Barlow-BoldItalic.ttf$/);
  assert.match(fonts.get('rainbow-dash-clear').families['ABCGintoNormal-Bold'][0].path, /Barlow-Bold.ttf$/);
  assert.match(fs.readFileSync(path.join(root,'assets/fonts/OFL.txt'),'utf8'), /SIL OPEN FONT LICENSE Version 1.1/);
});
