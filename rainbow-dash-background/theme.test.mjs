import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

const theme = JSON.parse(readFileSync(new URL('../Rainbow_Dash_Sonic_Rainboom.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('manifest.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('index.js', import.meta.url), 'utf8');

test('theme and companion use the same wallpaper, visibility and author', () => {
    const wallpaper = /const WALLPAPER = "([^"]+)"/.exec(source)?.[1];
    const opacity = /height: "100%", opacity: ([0-9.]+)/.exec(source)?.[1];
    assert.equal(wallpaper, theme.background.url);
    assert.equal(Number(opacity), theme.background.alpha);
    assert.equal(theme.background.blur, 0);
    assert.deepEqual(manifest.authors, theme.authors);
    assert.equal(theme.spec, 2);
});

test('all chat appearance slots let the wallpaper through while cards remain solid', () => {
    // CHANNEL_BACKGROUND_DEFAULT is the actual ChatView surface token in the
    // Decord 350008 / 351109 / 352207 snapshots, unlike older CHAT_BACKGROUND.
    for (const key of ['CHANNEL_BACKGROUND_DEFAULT', 'CHAT_BACKGROUND', 'BACKGROUND_PRIMARY', 'BACKGROUND_MOBILE_PRIMARY', 'BG_BASE_PRIMARY', 'BACKGROUND_BASE_LOWEST']) {
        assert.ok(theme.semanticColors[key].length >= 2, key);
        for (const color of theme.semanticColors[key]) assert.equal(color, '#07142100', key);
    }
    for (const key of ['CARD_BACKGROUND_DEFAULT', 'CARD_SECONDARY_BACKGROUND_DEFAULT', 'CHAT_INPUT_BACKGROUND', 'INPUT_BACKGROUND_DEFAULT', 'CARD_PRIMARY_BG', 'CARD_SECONDARY_BG', 'EMBED_BACKGROUND', 'REDESIGN_CHAT_INPUT_BACKGROUND', 'BACKGROUND_FLOATING']) {
        for (const color of theme.semanticColors[key]) assert.match(color, /^#[0-9A-F]{6}$/i, key);
    }
    assert.ok(theme.semanticColors.TEXT_NORMAL.every(color => color === '#EAF5FF'));
    assert.ok(theme.semanticColors.HEADER_PRIMARY.every(color => color === '#F3FAFF'));
});

test('published manifest hash matches the actual plugin entrypoint', () => {
    assert.equal(manifest.main, 'index.js');
    assert.equal(manifest.hash, createHash('sha256').update(source).digest('hex'));
});

test('both palette slots and AMOLED have complete, valid colour values', () => {
    const color = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
    for (const [name, values] of Object.entries(theme.semanticColors)) {
        assert.equal(values.length, 3, name);
        for (const value of values) assert.match(value, color, name);
    }
    for (const [name, value] of Object.entries(theme.rawColors)) assert.match(value, color, name);
    assert.equal(theme.version, '1.4.0');
    assert.equal(theme.authors[0].id, '753962426407452713');
    assert.ok(!JSON.stringify(theme).includes('PASTE_'));
});

test('important text stays readable over the brightest possible wallpaper pixel', () => {
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const luminance = color => color.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const opacity = theme.background.alpha;
    const brightest = rgb('#071421').map(c => c * (1 - opacity) + opacity);
    for (const key of ['TEXT_NORMAL', 'TEXT_MUTED', 'TEXT_LINK', 'HEADER_PRIMARY', 'MENTION_FOREGROUND']) {
        const fg = luminance(rgb(theme.semanticColors[key][0]));
        const bg = luminance(brightest);
        assert.ok((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) >= 4.5, key);
    }
});

test('the repository wallpaper is a PNG with portrait dimensions', () => {
    const png = readFileSync(new URL('../assets/rainbow-dash-portrait.png', import.meta.url));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.ok(width > 0 && height > width);
});

test('the current native NEUTRAL ramp keeps light text and dark surfaces ordered and opaque', () => {
    const luminance = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    let previous = Infinity;
    for (let i = 1; i <= 100; i++) {
        const value = theme.rawColors['NEUTRAL_' + i];
        assert.match(value, /^#[0-9A-F]{6}$/i);
        const current = luminance(value);
        assert.ok(current <= previous, 'Native palette reverses brightness at NEUTRAL_' + i);
        previous = current;
    }
    // These native roles are mapped by Decord's dark appearance snapshot.
    const background = luminance(theme.rawColors.NEUTRAL_86);
    for (const key of ['NEUTRAL_5', 'NEUTRAL_23']) {
        assert.ok((luminance(theme.rawColors[key]) + 0.05) / (background + 0.05) >= 4.5, key);
    }
});

