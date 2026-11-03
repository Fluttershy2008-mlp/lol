import test from 'node:test';
import assert from 'node:assert/strict';
import { createMentionFilter } from '../src/mentions.js';
import { createCollectionFilter } from '../src/collection.js';

test('display copies hide both user-mention formats, preserve records, and restore on settings/relationship changes', () => {
  const blocked = new Set(['123', '456']), storage = {};
  const f = createMentionFilter(id => blocked.has(id), storage);
  class Record { text() { return this.content; } }
  const original = Object.freeze(Object.assign(new Record(), {
    id: 'message', content: '<@123> hello <@!456> <@789> <@&123> <#123> @everyone',
    mentions: Object.freeze([{ id: '123' }, '456', { id: '789' }]),
    attachments: [{ url: 'image' }],
  }));
  const shown = f.project(original);
  assert.ok(shown instanceof Record);
  assert.equal(shown.text(), ' hello  <@789> <@&123> <#123> @everyone');
  assert.deepEqual(shown.mentions, [{ id: '789' }]);
  assert.equal(shown.attachments, original.attachments);
  assert.equal(f.project(original), shown);
  assert.match(original.content, /<@123>/);
  assert.equal(original.mentions.length, 3);
  storage.removeMentions = false;
  assert.equal(f.project(original), original);
  storage.removeMentions = true;
  blocked.clear();
  assert.equal(f.project(original), original);
});

test('projected array and indexed collection paths use the same sanitized record without filtering friends', () => {
  const f = createMentionFilter(id => id === '123', {});
  const row = { id: 'one', content: 'hello <@123>', mentions: ['123'] };
  const raw = { _array: [row], _map: new Map([['one', row]]), hasMoreBefore: true };
  const lists = createCollectionFilter(() => false, undefined, f.project);
  const shown = lists.project(raw);
  assert.equal(shown._array.length, 1);
  assert.equal(shown._array[0].content, 'hello ');
  assert.equal(shown._map.get('one'), shown._array[0]);
  assert.equal(shown.hasMoreBefore, true);
  assert.equal(raw._map.get('one'), row);
  assert.equal(lists.project(raw), shown);
  const objectMap = lists.project({ ...raw, _map: { one: row } });
  assert.equal(objectMap._map.one, objectMap._array[0]);
  assert.equal(lists.project([row])[0].content, 'hello ');
  row.attachments = [{ id: 'edited-attachment' }];
  assert.equal(lists.project(raw)._array[0].attachments, row.attachments);
  for (const value of [null, undefined, {}, { content: 'ordinary @name' }, { content: '<@789>' }]) {
    assert.equal(f.project(value), value);
  }
});
