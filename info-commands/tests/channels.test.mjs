import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countChannels } from '../src/server-info/data.ts';
const channel = (id, type = 0, guild_id = 'guild') => ({ id, type, guild_id });
test('counts nested channels under ID-bearing containers and category wrappers', () => {
  const text = channel('text'), voice = channel('voice', 2);
  const grouped = { id: 'guild', SELECTABLE: [{ channel: channel('category', 4), channels: [text, voice] }], VOCAL: [{ channel: voice }] };
  grouped.circular = grouped;
  assert.equal(countChannels(grouped, 'guild'), 3);
});
test('merges full cache with grouped lists without counting metadata, threads or other guilds', () => {
  const cache = new Map([['text', channel('text')], ['forum', channel('forum', 15)], ['stage', channel('stage', 13)]]);
  assert.equal(countChannels([cache, { SELECTABLE: [{ channel: channel('text') }], metadata: { id: 'fake' }, thread: channel('thread', 11), foreign: channel('foreign', 0, 'other'), dm: channel('dm', 1) }], 'guild'), 3);
});
test('preserves missing and empty cache states', () => {
  assert.equal(countChannels(undefined), undefined);
  assert.equal(countChannels({}), 0);
});
