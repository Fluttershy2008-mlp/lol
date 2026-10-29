'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../themes/altitude');
const argb = value => '#' + (value >>> 0).toString(16).padStart(8, '0').slice(2)
  + ((value >>> 24) === 255 ? '' : (value >>> 24).toString(16).padStart(2, '0'));

function load() {
  const groups = new Map(), themes = new Map(), fonts = new Map();
  const script = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const sandbox = Object.create(null);
  const factory = vm.runInNewContext('(function(valenced, plugin) { return ' + script + '\n})', sandbox, { timeout: 1000 });
  const options = factory({}, value => value).default;
  options.preInit({ themes: {
    registerGroup(group, definition) { groups.set(group, definition); },
    registerTheme(group, id, definition) {
      assert.ok(groups.has(group)); themes.set(id, definition);
    },
    registerFontPack(group, id, definition) {
      assert.ok(groups.has(group)); fonts.set(id, definition);
    }
  } });
  return { groups, themes, fonts, sandbox };
}

test('Altitude loads through the lexical Valenced contract and registers native choices', () => {
  const { groups, themes, fonts, sandbox } = load();
  assert.deepEqual([...groups.keys()], ['altitude']);
  assert.deepEqual([...themes.keys()], ['high', 'low']);
  assert.deepEqual([...fonts.keys()], ['lexend-deca', 'rawson-pro']);
  assert.equal(Object.keys(sandbox).length, 0);
  const built = fs.readFileSync(path.resolve(ROOT, '../../.build/plugins/altitude-theme/index.js'), 'utf8');
  assert.equal(built, fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8'));
});

for (const id of ['high', 'low']) test(id + ' preserves source colours and displays the background without added blur', () => {
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'upstream', id + '-altitude.json'), 'utf8'));
  const theme = load().themes.get(id), colors = theme.getColors({ raw: {} });
  assert.equal(theme.getColors({ raw: { BRAND_500: '#ff0000' } }), colors);
  assert.equal(theme.background.opacity, 1);
  assert.equal(theme.background.blur, 0);
  assert.equal(theme.background.dimming, source.background.overlay_alpha / 255);
  assert.equal(theme.background.path, 'assets/backgrounds/' + id + '-altitude.' + (id === 'high' ? 'jpg' : 'png'));
  const image = fs.readFileSync(path.join(ROOT, theme.background.path));
  assert.ok(image.length > 200000, 'the original wallpaper must be bundled');
  assert.deepEqual(Object.keys(colors.semantic).sort(), ['dark', 'darker', 'light', 'midnight']);
  for (const base of Object.values(colors.semantic)) {
    assert.equal(base.BACKGROUND_BASE_LOWER, argb(source.colors.primary_dark_600));
    assert.equal(base.MOBILE_CHATINPUT_BACKGROUND_DEFAULT, argb(source.simple_colors.input_background));
    assert.equal(base.BACKGROUND_SURFACE_HIGH, argb(source.colors.primary_dark_630));
    assert.equal(base.TEXT_DEFAULT, argb(source.colors.white_500));
    assert.equal(base.TEXT_STRONG, argb(source.colors.primary_dark_200));
    assert.equal(base.TEXT_MUTED, argb(source.colors.primary_dark_360));
    assert.equal(base.TEXT_SECONDARY, argb(source.colors.primary_dark_330));
    assert.equal(base.BACKGROUND_BRAND, argb(source.simple_colors.accent));
    assert.equal(base.BUTTON_PRIMARY_TEXT, argb(source.colors.primary_630));
    assert.equal(base.TEXT_LINK, argb(source.colors.link));
    assert.equal(base.BACKGROUND_MENTIONED, argb(source.simple_colors.mention_highlight));
    assert.equal(base.CHANNEL_ICON, argb(source.drawable_tints.ic_channel_text));
    assert.equal(base.ICON_STATUS_ONLINE, argb(source.drawable_tints.ic_status_online_16dp));
    assert.equal(base.ICON_STATUS_IDLE, argb(source.drawable_tints.ic_status_idle_16dp));
    assert.equal(base.ICON_STATUS_DND, argb(source.drawable_tints.ic_status_dnd_16dp));
    for (const value of Object.values(base)) assert.match(value, /^#[0-9a-f]{6}([0-9a-f]{2})?$/);
  }
  assert.equal(colors.raw.BRAND_500, argb(source.simple_colors.accent));
  for (const value of Object.values(colors.raw)) assert.match(value, /^#[0-9a-f]{6}([0-9a-f]{2})?$/);
  for (let i = 1; i <= 100; i++) assert.ok(colors.raw['NEUTRAL_' + i]);
  assert.equal(colors.raw.OPACITY_BLURPLE_20, '#c0a38133');
  assert.equal(colors.raw.OPACITY_20, '#f1d8b733');
});

function luminance(hex) {
  const values = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test('body text and button labels remain readable on opaque fallback surfaces', () => {
  for (const definition of load().themes.values()) {
    const s = definition.getColors({ raw: {} }).semantic.dark;
    assert.ok(contrast(s.TEXT_DEFAULT, s.BACKGROUND_BASE_LOWER) >= 4.5);
    assert.ok(contrast(s.TEXT_DEFAULT, s.BACKGROUND_SURFACE_HIGH) >= 4.5);
    assert.ok(contrast(s.BUTTON_PRIMARY_TEXT, s.BUTTON_PRIMARY_BACKGROUND) >= 4.5);
  }
});

test('the font pack resolves bundled original font bytes and preserves fallback families', () => {
  const { families } = load().fonts.get('lexend-deca');
  assert.deepEqual(Object.keys(families).sort(), ['ggsans-Bold', 'ggsans-ExtraBold', 'ggsans-Medium', 'ggsans-Normal', 'ggsans-Semibold']);
  const expected = {
    'LexendDeca-Regular.ttf': '9b1d0a79505bc1cbf51449dbd030bc75bbecbf86db962dd14211e441d60d6346',
    'LexendDeca-SemiBold.ttf': '6d24560ed45218a4df10b56081791f935690c12bbbca0ef0e8d9d61e4722cae7',
    'LexendDeca-Bold.ttf': '678502f0c83fd243fa40d6d4a03b34f71833649d32ae5782e44dade1d0c6c6dc'
  };
  for (const variants of Object.values(families)) {
    const variant = variants[0];
    assert.equal(variants.length, 1);
    assert.ok([400, 600, 700].includes(variant.weight));
    const data = fs.readFileSync(path.join(ROOT, variant.path));
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), expected[path.basename(variant.path)]);
    assert.equal(data.readUInt32BE(0), 0x00010000);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'assets/fonts/OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1.1/);
});

test('the additional display pack uses the original Rawson fonts without replacing the Lexend selection ID', () => {
  const { fonts } = load();
  assert.ok(fonts.has('lexend-deca'));
  const { families } = fonts.get('rawson-pro');
  assert.ok(families['ABCGintoNormal-Bold']);
  for (const variants of Object.values(families)) {
    const data = fs.readFileSync(path.join(ROOT, variants[0].path));
    assert.equal(data.readUInt32BE(0), 0x00010000);
  }
});
