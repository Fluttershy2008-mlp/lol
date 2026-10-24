import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

const theme = JSON.parse(readFileSync(new URL('../Sunset_Shimmer_Theme.json', import.meta.url), 'utf8'));
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
    for (const key of ['CHAT_BACKGROUND', 'BACKGROUND_PRIMARY', 'BACKGROUND_MOBILE_PRIMARY', 'BG_BASE_PRIMARY', 'BACKGROUND_BASE_LOWEST']) {
        assert.ok(theme.semanticColors[key].length >= 2, key);
        for (const color of theme.semanticColors[key]) assert.equal(color, '#1B141900', key);
    }
    for (const key of ['CARD_PRIMARY_BG', 'CARD_SECONDARY_BG', 'EMBED_BACKGROUND', 'REDESIGN_CHAT_INPUT_BACKGROUND', 'BACKGROUND_FLOATING']) {
        for (const color of theme.semanticColors[key]) assert.match(color, /^#[0-9A-F]{6}$/i, key);
    }
    assert.ok(theme.semanticColors.TEXT_NORMAL.every(color => color === '#FFF3DA'));
    assert.ok(theme.semanticColors.HEADER_PRIMARY.every(color => color === '#FFE19A'));
});

test('published manifest hash matches the actual plugin entrypoint', () => {
    assert.equal(manifest.main, 'index.js');
    assert.equal(manifest.hash, createHash('sha256').update(source).digest('hex'));
});
