import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/session.mjs';
import { DEFAULT_OPTIONS, DEFAULT_PHRASES, startList } from '../src/core.mjs';

function harness({ initial = '', asynchronousNative = false } = {}) {
  let text = initial, allowed = true, options = { ...DEFAULT_OPTIONS }, nextId = 0;
  const timers = new Map(), calls = [], errors = [], native = [];
  const target = {
    getText: () => text,
    handleTextChanged(value) { calls.push(['change', value]); },
    insertText(insert, start, space, nodes, end) {
      calls.push(['insert', insert, start, space, nodes, end]);
      const next = text.slice(0, start) + insert + text.slice(end);
      const event = () => { text = next; target.handleTextChanged(next); };
      if (asynchronousNative) native.push(event); else event();
    },
  };
  const original = target.handleTextChanged;
  const patcher = { after(key, object, callback) {
    const fn = object[key]; object[key] = (...args) => { const result = fn(...args); callback(args, result); return result; };
    return () => { object[key] = fn; };
  } };
  const session = createSession({ target, patcher, options: () => options, phrases: () => DEFAULT_PHRASES, maxLength: () => 2000,
    allowed: () => allowed, report: e => errors.push(e), schedule: fn => { timers.set(++nextId, fn); return nextId; }, cancel: id => timers.delete(id) });
  return { target, session, calls, errors, timers, original,
    read: () => text,
    type: value => { text = value; target.handleTextChanged(value); },
    flush: () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
    flushNative: () => { while (native.length) native.shift()(); },
    switchChannel: () => { allowed = false; },
    pause: () => { options = { ...options, enabled: false }; },
  };
}
test('native range edit updates a draft without sending and supports undo', () => {
  const h = harness({ initial: '- First' });
  h.type('- First\n'); h.flush();
  assert.equal(h.read(), '- First\n- ');
  assert.equal(h.session.canUndo, true);
  assert.equal(h.session.undo(), true);
  assert.equal(h.read(), '- First\n');
  h.session.dispose(); assert.equal(h.target.handleTextChanged, h.original);
});
test('pending change is cancelled when user types ahead', () => {
  const h = harness({ initial: '- First' });
  h.type('- First\n'); h.type('- First\nSomething'); h.flush();
  assert.equal(h.read(), '- First\nSomething');
  assert.equal(h.calls.filter(c => c[0] === 'insert').length, 0);
});
test('pending change cannot cross channel switches, pause or unload', () => {
  for (const stop of ['switchChannel', 'pause', 'dispose']) {
    const h = harness({ initial: ';brb' });
    h.type(';brb ');
    if (stop === 'dispose') h.session.dispose(); else h[stop]();
    h.flush();
    assert.equal(h.read(), ';brb ', stop);
    assert.equal(h.calls.filter(c => c[0] === 'insert').length, 0);
  }
});
test('asynchronous native echo preserves undo and never expands twice', () => {
  const h = harness({ initial: ';brb', asynchronousNative: true });
  h.type(';brb '); h.flush(); h.flushNative(); h.flush();
  assert.equal(h.read(), 'Be right back! ');
  assert.equal(h.session.canUndo, true);
  assert.equal(h.calls.filter(c => c[0] === 'insert').length, 1);
});
test('duplicate input events do not cancel a pending transform', () => {
  const h = harness({ initial: ';brb' });
  h.type(';brb '); h.type(';brb '); h.flush();
  assert.equal(h.read(), 'Be right back! ');
});
test('stale suggestion cannot overwrite a different draft', () => {
  const h = harness({ initial: 'Hi' });
  const edit = startList('Hi');
  h.type('Hello');
  assert.equal(h.session.apply(edit, 'Hi'), false);
  assert.equal(h.read(), 'Hello');
});
test('native failure leaves the original draft and disables undo', () => {
  const h = harness({ initial: ';brb' });
  h.target.insertText = () => { throw new Error('Unsupported native command'); };
  h.type(';brb '); h.flush();
  assert.equal(h.read(), ';brb '); assert.equal(h.session.text, ';brb ');
  assert.equal(h.session.canUndo, false); assert.equal(h.errors.length, 1);
});
test('two composers keep independent drafts and lifecycle', () => {
  const a = harness({ initial: '- A' }), b = harness({ initial: '- B' });
  a.type('- A\n'); b.type('- B\n'); a.session.dispose(); a.flush(); b.flush();
  assert.equal(a.read(), '- A\n'); assert.equal(b.read(), '- B\n- ');
});
