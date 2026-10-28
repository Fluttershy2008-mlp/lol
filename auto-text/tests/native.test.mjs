import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeReader } from '../src/native.mjs';

test('a mounted reader can use native commands that load after the field', () => {
  let commands, requestId;
  const timers = new Map();
  const reader = createNativeReader(() => commands, {
    schedule(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
    cancel: id => timers.delete(id),
  });
  const handle = {};
  reader.ref({ current: null })(handle);
  assert.equal(reader.read(() => assert.fail('unavailable command must not issue a callback')), null);
  commands = { flushText(target, id) { assert.equal(target, handle); requestId = id; } };
  let answer;
  reader.read(value => { answer = value; });
  reader.observe({ nativeEvent: { requestId, text: 'native text' } });
  assert.equal(answer, 'native text');
  assert.equal(timers.size, 0);
  reader.dispose();
});
