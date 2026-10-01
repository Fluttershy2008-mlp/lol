import test from 'node:test';
import assert from 'node:assert/strict';
import { createTyper, typingCharacters } from '../src/typer.mjs';

function harness({ initial = '', delayed = false, reject = false, limit = 2000, sendBehavior = 'clear', hasSend = true } = {}) {
  let text = initial, allowed = true, clock = 0, nextId = 0;
  const tasks = new Map(), native = [], inserted = [], sent = [];
  const typer = createTyper({ read: () => text, allowed: () => allowed, maxLength: () => limit,
    schedule: (fn, delay) => { tasks.set(++nextId, { fn, time: clock + delay, delay }); return nextId; },
    cancel: id => tasks.delete(id), now: () => clock,
    insert: (char, expected) => {
      if (reject) return false;
      assert.equal(text, expected); inserted.push({ char, time: clock });
      const apply = () => { text += char; typer.observe(text, { start: text.length, end: text.length }); };
      if (delayed) native.push(apply); else apply();
      return true;
    },
    send: hasSend ? expected => {
      assert.equal(text, expected); sent.push(text);
      if (sendBehavior === 'throw') throw new Error('Native send failed');
      if (sendBehavior === 'false') return false;
      if (sendBehavior === 'reject') return Promise.reject(new Error('Network failure'));
      if (sendBehavior === 'clear') { text = ''; typer.observe(''); }
    } : undefined,
  });
  const next = () => {
    const item = [...tasks].sort((a, b) => a[1].time - b[1].time)[0];
    if (!item) return false;
    tasks.delete(item[0]); clock = item[1].time; item[1].fn(); return true;
  };
  return { typer, tasks, native, inserted, sent, next, read: () => text,
    all() { let n = 0; while (next()) assert(++n < 5000, 'typing loop is bounded'); },
    interrupt(value, selection) { text = value; typer.observe(text, selection); },
    leave() { allowed = false; },
  };
}
test('types a prepared multiline list literally, one visible character at a time', () => {
  const h = harness(); const source = '- One\n- Two\n1. Three\n;brb';
  h.typer.start(source, 70);
  assert.equal(h.read(), '', 'no immediate bulk replacement');
  h.next(); assert.equal(h.read(), '-');
  h.all();
  assert.equal(h.read(), source); assert.equal(h.typer.state.status, 'done');
  assert.equal(h.inserted.length, source.length);
  assert.equal(h.tasks.size, 0);
});
test('speed setting controls the interval and existing drafts are preserved', () => {
  for (const speed of [25, 70, 150, 500]) {
    const h = harness({ initial: 'Hello ' }); h.typer.start('world', speed); h.all();
    assert.equal(h.read(), 'Hello world');
    assert.equal(h.inserted[0].time, 400);
    assert.equal(h.inserted[1].time - h.inserted[0].time, speed);
  }
});
test('stop cancels future writes and leaves the partial text', () => {
  const h = harness(); h.typer.start('abcdef'); h.next(); h.next();
  h.typer.stop(); h.all();
  assert.equal(h.read(), 'ab'); assert.equal(h.typer.state.status, 'stopped'); assert.equal(h.tasks.size, 0);
});
test('typing waits for each delayed native echo before adding another letter', () => {
  const h = harness({ delayed: true }); h.typer.start('abc', 25); h.next(); h.next(); h.next();
  assert.equal(h.native.length, 1); assert.equal(h.inserted.length, 1);
  h.native.shift()(); h.next();
  assert.equal(h.inserted.length, 2);
  h.native.shift()(); h.next(); h.native.shift()(); h.all();
  assert.equal(h.read(), 'abc'); assert.equal(h.typer.state.status, 'done');
});
test('missing native acknowledgment times out without duplicating characters', () => {
  const h = harness({ delayed: true }); h.typer.start('abc'); h.all();
  assert.equal(h.typer.state.status, 'error'); assert.equal(h.inserted.length, 1);
});
test('a native echo delayed beyond 1.5 seconds can still complete the message once', () => {
  const h = harness({ delayed: true }); h.typer.start('ab', 500, { autoSend: true });
  // First insert at 400ms, then wait beyond the old 1500ms deadline.
  for (let i = 0; i < 50; i++) h.next();
  assert.equal(h.typer.state.status, 'running'); assert.equal(h.inserted.length, 1);
  h.native.shift()(); h.next(); h.native.shift()(); h.all();
  assert.deepEqual(h.sent, ['ab']); assert.equal(h.inserted.length, 2);
});
test('manual edits, cursor moves, leaving the chat and unload stop a run', () => {
  for (const reason of ['edit', 'cursor', 'leave', 'dispose']) {
    const h = harness(); h.typer.start('abcdef'); h.next();
    if (reason === 'edit') h.interrupt('ax');
    if (reason === 'cursor') h.interrupt('a', { start: 0, end: 0 });
    if (reason === 'leave') h.leave();
    if (reason === 'dispose') h.typer.dispose();
    h.all(); assert.equal(h.read(), reason === 'edit' ? 'ax' : 'a', reason); assert.equal(h.tasks.size, 0);
  }
});
test('message limits, empty text and failed native edits cannot create a partial overlong message', () => {
  const h = harness({ initial: '123', limit: 5 });
  assert.throws(() => h.typer.start('abc'), /limit/);
  assert.throws(() => h.typer.start(' \n '), /Enter/);
  assert.equal(h.read(), '123'); assert.equal(h.tasks.size, 0);
  const rejected = harness({ reject: true }); rejected.typer.start('Hello'); rejected.all();
  assert.equal(rejected.read(), ''); assert.equal(rejected.typer.state.status, 'stopped');
});
test('emoji and accent clusters remain intact with and without Intl.Segmenter', () => {
  const sample = '🍓👩🏽‍💻🇸🇬e\u03011️⃣';
  assert.deepEqual(typingCharacters(sample), ['🍓', '👩🏽‍💻', '🇸🇬', 'e\u0301', '1️⃣']);
  const segmenter = Intl.Segmenter;
  try { Intl.Segmenter = undefined; assert.deepEqual(typingCharacters(sample), ['🍓', '👩🏽‍💻', '🇸🇬', 'e\u0301', '1️⃣']); }
  finally { Intl.Segmenter = segmenter; }
});
test('auto-send is opt-in and sends a complete multiline message exactly once', () => {
  const source = 'Hello. Another sentence!\n- One\n- Two 🍓';
  const manual = harness(); manual.typer.start(source); manual.all();
  assert.equal(manual.sent.length, 0); assert.equal(manual.read(), source);
  const auto = harness(); auto.typer.start(source, 25, { autoSend: true }); auto.all();
  assert.deepEqual(auto.sent, [source]); assert.equal(auto.read(), '');
  assert.equal(auto.typer.state.status, 'done'); auto.all(); assert.equal(auto.sent.length, 1);
});
test('the final native update must be acknowledged before auto-send', () => {
  const h = harness({ delayed: true }); h.typer.start('a', 25, { autoSend: true });
  h.next(); h.next(); h.next(); assert.equal(h.sent.length, 0);
  h.native.shift()(); h.next(); assert.deepEqual(h.sent, ['a']);
});
test('Stop, edits, leaving and unload cancel auto-send after the final letter', () => {
  for (const action of ['stop', 'edit', 'leave', 'dispose']) {
    const h = harness(); h.typer.start('a', 25, { autoSend: true }); h.next();
    assert.equal(h.read(), 'a');
    if (action === 'stop') h.typer.stop();
    if (action === 'edit') h.interrupt('changed');
    if (action === 'leave') h.leave();
    if (action === 'dispose') h.typer.dispose();
    h.all(); assert.equal(h.sent.length, 0, action);
  }
});
test('failed or unconfirmed native sends are never retried', async () => {
  for (const sendBehavior of ['throw', 'false', 'reject', 'pending']) {
    const h = harness({ sendBehavior }); h.typer.start('a', 25, { autoSend: true });
    h.next(); h.next(); await Promise.resolve(); await Promise.resolve(); h.all();
    assert.deepEqual(h.sent, ['a'], sendBehavior); assert.equal(h.read(), 'a');
    assert.equal(h.typer.state.busy, false); assert.equal(h.tasks.size, 0);
    if (sendBehavior !== 'pending') assert.equal(h.typer.state.status, 'error');
  }
});
test('a new run cannot start while a send is pending and a later manual run does not auto-send', async () => {
  const h = harness({ sendBehavior: 'pending' });
  h.typer.start('a', 25, { autoSend: true }); h.next(); h.next();
  assert.equal(h.typer.state.sending, true);
  assert.throws(() => h.typer.start('b'), /current run/);
  h.all(); assert.equal(h.sent.length, 1);
  h.typer.start('b'); h.all(); assert.equal(h.read(), 'ab'); assert.equal(h.sent.length, 1);
});
test('unsupported automatic sending is rejected before typing begins', () => {
  const h = harness({ hasSend: false });
  assert.throws(() => h.typer.start('hello', 70, { autoSend: true }), /unavailable/);
  assert.equal(h.tasks.size, 0); assert.equal(h.read(), '');
  h.typer.start('hello'); h.all(); assert.equal(h.read(), 'hello');
});
