import test from 'node:test';
import assert from 'node:assert/strict';
import { projectNativeRows } from '../src/native-rows.js';
import { isUserWhitelisted } from '../src/whitelist.js';

const ALLOWED = '100000000000000002', OTHER = '100000000000000003';
const message = (id, authorId) => Object.freeze({ type: 1, changeType: 0,
  message: Object.freeze({ id, authorId, channelId: 'channel', content: [{ type: 'text', content: 'hi' }] }) });
const group = (content, type = 2) => Object.freeze({ type, content: Object.freeze(content),
  text: `${content.length} blocked messages`, revealed: false, changeType: 0 });
const storage = { whitelistEnabled: true, whitelistedIds: [ALLOWED] };
const filtered = id => !isUserWhitelisted(storage, id) && [ALLOWED, OTHER].includes(id);

test('blocked and ignored groups become normal rows only for the whitelisted user, preserving frozen sources', () => {
  for (const type of [2, 6]) {
    const first = message('one', ALLOWED), second = message('two', ALLOWED), hidden = message('hidden', OTHER);
    const original = group([first, hidden, second], type);
    const rows = projectNativeRows(original, storage, filtered);
    assert.deepEqual(rows.map(row => row.type), [1, 1]);
    assert.deepEqual(rows.map(row => row.message.id), ['one', 'two']);
    assert.ok(rows.every(row => row.changeType === 2 && !('text' in row)));
    assert.equal(rows[0].message, first.message);
    assert.notEqual(rows[0], first);
    assert.equal(first.changeType, 0); assert.equal(original.content.length, 3); assert.equal(original.revealed, false);
  }
});

test('hidden-only groups leave no bar while intentionally allowed non-whitelisted groups retain native behaviour', () => {
  const original = group([message('one', OTHER)]);
  assert.deepEqual(projectNativeRows(original, storage, filtered), []);
  assert.equal(projectNativeRows(original, storage, () => false)[0], original);
  const noWhitelist = { whitelistEnabled: false, whitelistedIds: [ALLOWED] };
  assert.deepEqual(projectNativeRows(group([message('one', ALLOWED)]), noWhitelist, () => true), []);
  const normal = message('one', ALLOWED), loading = { type: 4 }, separator = { type: 3 };
  for (const row of [normal, loading, separator]) assert.equal(projectNativeRows(row, storage, filtered)[0], row);
});

test('nested native groups unwrap in order; unexpected, empty and cyclic layouts pass through', () => {
  const original = group([group([message('one', ALLOWED), message('hidden', OTHER)], 6), message('two', ALLOWED)]);
  assert.deepEqual(projectNativeRows(original, storage, filtered).map(row => row.message.id), ['one', 'two']);
  const cyclic = { type: 2, content: [] }; cyclic.content.push(cyclic);
  for (const row of [group([]), group([{ type: 99 }]), group([{ type: 1, message: {} }]), { type: 2 }, cyclic]) {
    assert.equal(projectNativeRows(row, storage, filtered)[0], row);
  }
});
