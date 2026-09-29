import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import patcher from 'spitroast';

const root = new URL('../', import.meta.url);
const bundle = readFileSync(new URL('index.js', root), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));

function harness({ failPatch = false, missing = false } = {}) {
  const blocked = new Set(['blocked']);
  const ignored = new Set(['ignored']);
  const rows = [];
  const listeners = new Set();
  const timers = new Map();
  const events = [];
  const storage = {};
  let nextTimer = 0, emits = 0;
  const relationships = {
    isBlocked: id => blocked.has(id), isIgnored: id => ignored.has(id),
    addChangeListener: fn => listeners.add(fn), removeChangeListener: fn => listeners.delete(fn),
  };
  class Collection {
    constructor() { this._array = rows; this.hasMoreBefore = true; this.ready = true; }
    toArray() { return this._array; }
  }
  const collection = new Collection();
  const messageStore = {
    getMessages() { assert.equal(this, messageStore); return collection; },
    getMessage(channel, id) { return rows.find(row => row.channel_id === channel && row.id === id); },
    emitChange() { emits++; },
  };
  const dispatcher = { dispatch(event) {
    events.push(event);
    const add = raw => {
      const { interaction_metadata, interaction, ...normalized } = raw;
      const at = rows.findIndex(row => row.id === raw.id);
      if (at >= 0) rows[at] = { ...rows[at], ...normalized };
      else rows.push(normalized);
    };
    if (event.type === 'LOAD_MESSAGES_SUCCESS') event.messages.forEach(add);
    if (event.type === 'MESSAGE_CREATE' || event.type === 'MESSAGE_UPDATE') add(event.message);
    return 'passed-through';
  } };
  const originalGet = messageStore.getMessages, originalDispatch = dispatcher.dispatch;
  const V = {
    plugin: { storage }, logger: { warn() {} },
    patcher: failPatch ? { ...patcher, before() { throw new Error('patch failed'); } } : patcher,
    metro: { common: { FluxDispatcher: dispatcher },
      findByStoreName: name => missing ? undefined : ({ MessageStore: messageStore, RelationshipStore: relationships })[name],
      findByProps: () => undefined,
    },
  };
  const plugin = vm.runInNewContext(bundle, { vendetta: V,
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  function flush() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } }
  return { plugin, dispatcher, messageStore, rows, collection, events, storage, blocked, ignored,
    listeners, timers, originalGet, originalDispatch, flush, getEmits: () => emits };
}
const row = (id, user = 'friend', extra = {}) => ({ id, channel_id: 'channel', content: 'original', author: { id: user }, ...extra });

test('install bundle exposes lifecycle, has correct manifest hash, and never writes placeholder text', () => {
  assert.equal(manifest.main, 'index.js');
  assert.equal(createHash('sha256').update(bundle).digest('hex'), manifest.hash);
  assert.doesNotMatch(bundle, /\[Filtered message\. Check plugin settings\.\]|PLACEHOLDER/);
  const h = harness();
  assert.equal(typeof h.plugin.settings, 'function');
  h.plugin.onLoad(); h.flush();
  assert.equal(h.events.length, 0);
  assert.equal(h.storage.removeBotCommands, true);
  h.plugin.onUnload();
});

test('real Revenge patcher filters cached and live messages; events and full native cache stay intact', () => {
  const h = harness();
  h.rows.push(row('cached-hidden', 'blocked'), row('cached-visible'));
  h.plugin.onLoad();
  const hiddenBot = Object.freeze(row('bot-response', 'bot', { interaction_metadata: { user: { id: 'blocked' } } }));
  const event = Object.freeze({ type: 'MESSAGE_CREATE', message: hiddenBot });
  assert.equal(h.dispatcher.dispatch(event), 'passed-through');
  h.dispatcher.dispatch({ type: 'MESSAGE_CREATE', message: row('other-bot-response', 'bot', { interaction: { user: { id: 'friend' } } }) });
  const shown = h.messageStore.getMessages('channel').toArray();
  assert.deepEqual(shown.map(row => row.id), ['cached-visible', 'other-bot-response']);
  assert.equal(h.rows.length, 4);
  assert.equal(h.events[0], event);
  assert.equal(h.messageStore.getMessage('channel', 'bot-response').content, 'original');
  h.dispatcher.dispatch({ type: 'MESSAGE_UPDATE', message: { id: 'bot-response', channel_id: 'channel', content: 'edited' } });
  assert.equal(h.messageStore.getMessages('channel').toArray().some(row => row.id === 'bot-response'), false);
  h.plugin.onUnload();
});

test('a fully hidden history batch preserves pagination and is restored on disable', () => {
  const h = harness(); h.plugin.onLoad();
  const history = Object.freeze([Object.freeze(row('one', 'blocked')), Object.freeze(row('two', 'ignored'))]);
  const event = Object.freeze({ type: 'LOAD_MESSAGES_SUCCESS', messages: history, channelId: 'channel' });
  h.dispatcher.dispatch(event);
  const shown = h.messageStore.getMessages('channel');
  assert.equal(shown.toArray().length, 0);
  assert.equal(shown.hasMoreBefore, true);
  assert.equal(h.events[0].messages.length, 2);
  h.plugin.onUnload();
  assert.equal(h.messageStore.getMessages('channel').toArray().length, 2);
  assert.equal(h.messageStore.getMessages, h.originalGet);
  assert.equal(h.dispatcher.dispatch, h.originalDispatch);
});

test('relationship changes refresh current chat and repeated lifecycle removes every hook/timer', () => {
  const h = harness(); h.rows.push(row('hidden', 'blocked'));
  h.plugin.onLoad(); h.plugin.onLoad(); h.flush();
  assert.equal(h.listeners.size, 1);
  assert.equal(h.messageStore.getMessages('channel').toArray().length, 0);
  h.blocked.clear(); for (const fn of h.listeners) fn(); h.flush();
  assert.equal(h.messageStore.getMessages('channel'), h.collection);
  assert.ok(h.getEmits() >= 2);
  h.plugin.onUnload(); h.plugin.onUnload();
  assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
  h.plugin.onLoad(); h.plugin.onUnload();
  assert.equal(h.messageStore.getMessages, h.originalGet);
  assert.equal(h.dispatcher.dispatch, h.originalDispatch);
});

test('missing modules or partially failed setup do not leave an installed hook', () => {
  for (const options of [{ missing: true }, { failPatch: true }]) {
    const h = harness(options);
    assert.throws(() => h.plugin.onLoad());
    assert.equal(h.messageStore.getMessages, h.originalGet);
    assert.equal(h.dispatcher.dispatch, h.originalDispatch);
    assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
  }
});
