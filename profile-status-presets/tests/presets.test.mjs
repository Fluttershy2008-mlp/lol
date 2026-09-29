import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEmoji, validatePreset, createPresetStore, expiration, statusPayload, normalizeStatus } from '../src/presets.js';

const draft = { name: 'Gaming', text: 'Playing with friends', emoji: '🎮', clearAfter: '1h' };

test('stores create/edit/delete, persist on restart, and isolate accounts', () => {
  const storage = {};
  const store = createPresetStore(storage);
  const one = store.save('100', draft);
  const two = store.save('100', { ...draft, name: 'Sleeping' });
  assert.equal(store.list('200').length, 0);
  assert.equal(createPresetStore(JSON.parse(JSON.stringify(storage))).list('100').length, 2);
  store.save('100', { ...draft, name: 'Study', text: 'Class' }, one.id);
  assert.deepEqual(store.list('100').map(p => p.name), ['Study', 'Sleeping']);
  store.remove('100', two.id);
  assert.equal(store.list('100').length, 1);
  store.save('200', draft);
  assert.equal(store.list('100')[0].text, 'Class');
  assert.throws(() => store.save('200', { ...draft, name: 'GAMING' }), /already exists/);
  assert.throws(() => store.save('100', draft, 'gone'), /removed/);
});

test('status validation handles Unicode, custom emoji snowflakes and empty statuses', () => {
  assert.deepEqual(parseEmoji('<a:party:1234567890123456789>'), { emojiName: 'party', emojiId: '1234567890123456789', animated: true });
  for (const emoji of ['🎮', '👨‍👩‍👧‍👦', '🇸🇬', '1️⃣']) assert.equal(parseEmoji(emoji).emojiName, emoji);
  assert.equal(validatePreset({ ...draft, text: '' }).text, '');
  assert.throws(() => validatePreset({ ...draft, text: '', emoji: '' }), /Add status text/);
  assert.throws(() => validatePreset({ ...draft, text: 'x'.repeat(129) }), /128/);
  assert.throws(() => validatePreset({ ...draft, name: ' ' }), /name/);
  assert.throws(() => validatePreset({ ...draft, emoji: ':gaming:' }), /Paste/);
  assert.throws(() => validatePreset({ ...draft, clearAfter: 'bad' }), /Choose/);
});

test('expiry restarts on each apply; Today uses local midnight across month boundaries', () => {
  const now = new Date(2026, 8, 30, 23, 50).getTime();
  const preset = validatePreset(draft);
  assert.equal(statusPayload(preset, now).expiresAtMs, now + 3600000);
  assert.equal(statusPayload(preset, now + 60000).expiresAtMs, now + 3660000);
  assert.equal(expiration('30m', now), now + 1800000);
  assert.equal(expiration('4h', now), now + 14400000);
  assert.equal(expiration('never', now), 0);
  assert.equal(expiration('today', now), new Date(2026, 9, 1).getTime());
  assert.equal(statusPayload(null, now), null);
});

test('reads proto, REST and presence statuses without expired entries or precision loss', () => {
  const now = 100000;
  assert.equal(normalizeStatus({ text: 'expired', expiresAtMs: '50000' }, now), null);
  assert.equal(normalizeStatus({ text: '', emojiId: '0' }, now), null);
  assert.equal(normalizeStatus({ text: 'hi', emojiId: '1234567890123456789', expiresAtMs: '0' }, now).emojiId, '1234567890123456789');
  assert.equal(normalizeStatus({ text: 'hi', emoji_name: '🎮', expires_at: null }, now).emojiName, '🎮');
  assert.equal(normalizeStatus({ state: 'hi', emoji: { id: '1234567890123456789', name: 'party', animated: true } }, now).animated, true);
});
