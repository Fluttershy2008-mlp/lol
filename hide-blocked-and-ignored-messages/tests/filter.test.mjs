import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessageFilter, interactionInfo } from '../src/filter.js';
import { createCollectionFilter } from '../src/collection.js';

function setup(storage = {}) {
  const blocked = new Set(['blocked']);
  const ignored = new Set(['ignored']);
  const messages = new Map();
  const blockedStore = { isBlocked(id) { assert.equal(this, blockedStore); return blocked.has(id); } };
  const ignoredStore = { isIgnored(id) { assert.equal(this, ignoredStore); return ignored.has(id); } };
  const filter = createMessageFilter({ storage, blockedStore, ignoredStore,
    getMessage: (channel, id) => messages.get(channel + ':' + id) });
  return { ...filter, storage, blocked, ignored, messages };
}
const message = (id, author = 'friend', extra = {}) => ({ id, channel_id: 'channel', author: { id: author }, content: 'unchanged', ...extra });

test('blocked/ignored authors and independent settings; no matching message text', () => {
  const f = setup();
  assert.equal(f.shouldHide(message('a', 'blocked')), true);
  assert.equal(f.shouldHide(message('b', 'ignored')), true);
  assert.equal(f.shouldHide(message('c', 'friend', { content: '<@blocked> [Filtered message. Check plugin settings.]' })), false);
  f.storage.blocked = false;
  assert.equal(f.shouldHide(message('a', 'blocked')), false);
  assert.equal(f.shouldHide(message('b', 'ignored')), true);
  f.storage.ignored = false;
  assert.equal(f.shouldHide(message('b', 'ignored')), false);
});

test('slash responses: current API, normalized mobile records, legacy interaction, member and nested modal', () => {
  const f = setup();
  for (const extra of [
    { interaction_metadata: { user: { id: 'blocked' } } },
    { interactionMetadata: { user: { id: 'ignored' } } },
    { interaction: { user: { id: 'blocked' } } },
    { interaction: { member: { user: { id: 'ignored' } } } },
    { interactionMetadata: { userId: 'blocked' } },
    { interaction_metadata: { triggering_interaction_metadata: { user: { id: 'blocked' } } } },
  ]) assert.equal(f.shouldHide(message('bot', 'bot', extra)), true);
  assert.equal(f.shouldHide(message('allowed', 'bot', { interaction_metadata: { user: { id: 'friend' },
    target_user: { id: 'blocked' }, authorizing_integration_owners: { 1: 'blocked' } }, mentions: [{ id: 'blocked' }] })), false);
  assert.equal(f.shouldHide(message('unattributed', 'bot')), false);
  f.storage.removeBotCommands = false;
  assert.equal(f.shouldHide(message('bot', 'bot', { interaction: { user: { id: 'blocked' } } })), false);
});

test('replies resolve embedded messages or raw cache without fetching; toggling restores them', () => {
  const f = setup();
  f.messages.set('other:original', message('original', 'blocked'));
  const replies = [
    message('r1', 'friend', { type: 19, referenced_message: message('a', 'blocked') }),
    message('r2', 'friend', { type: 19, referencedMessage: message('b', 'ignored') }),
    message('r3', 'friend', { type: 19, message_reference: { channel_id: 'other', message_id: 'original' } }),
    message('r4', 'friend', { type: 19, messageReference: { channelId: 'other', messageId: 'original' } }),
    message('r5', 'friend', { type: 19, referenced_message: message('bot', 'bot', { interaction: { user: { id: 'blocked' } } }) }),
  ];
  for (const reply of replies) assert.equal(f.shouldHide(reply), true);
  f.storage.removeReplies = false;
  for (const reply of replies) assert.equal(f.shouldHide(reply), false);
  f.storage.removeReplies = true;
  assert.equal(f.shouldHide(message('forward', 'friend', { type: 0, message_reference: { type: 1, channel_id: 'other', message_id: 'original' } })), false);
  assert.equal(f.shouldHide(message('unknown', 'friend', { type: 19, message_reference: { message_id: 'unloaded' } })), false);
});

test('observing gateway metadata handles dropped normalized fields, partial edits and follow-ups', () => {
  const f = setup();
  const original = message('origin', 'bot', { interaction_metadata: { user: { id: 'blocked' } } });
  const event = Object.freeze({ type: 'MESSAGE_CREATE', message: Object.freeze(original) });
  f.observe(event);
  f.messages.set('channel:origin', message('origin', 'bot'));
  assert.equal(f.shouldHide(f.messages.get('channel:origin')), true);
  f.observe({ type: 'MESSAGE_UPDATE', message: { id: 'origin', channel_id: 'channel', content: 'edited' } });
  assert.equal(f.shouldHide(f.messages.get('channel:origin')), true);
  const followup = message('followup', 'bot', { interaction_metadata: { original_response_message_id: 'origin' } });
  assert.equal(f.shouldHide(followup), true);
  assert.equal(f.shouldHide({ ...followup, interaction_metadata: { user: { id: 'friend' }, original_response_message_id: 'origin' } }), false);
  f.observe({ type: 'MESSAGE_UPDATE', message: { id: 'origin', channel_id: 'channel', interaction_metadata: { user: { id: 'friend' } } } });
  assert.equal(f.shouldHide(f.messages.get('channel:origin')), false);
  f.observe(event);
  f.observe({ type: 'MESSAGE_UPDATE', message: { id: 'origin', channel_id: 'channel', interaction_metadata: null } });
  assert.equal(f.shouldHide(f.messages.get('channel:origin')), false);
  f.observe(event);
  f.clear();
  assert.equal(f.shouldHide(f.messages.get('channel:origin')), false);
});

test('history has channel fallback; relationship changes reevaluate cached IDs; account switch clears IDs', () => {
  const f = setup();
  const raw = { id: 'bot', author: { id: 'bot' }, interaction: { user: { id: 'blocked' } } };
  f.observe({ type: 'LOAD_MESSAGES_SUCCESS', channelId: 'channel', messages: [raw] });
  assert.equal(f.shouldHide(message('bot', 'bot')), true);
  f.blocked.clear();
  assert.equal(f.shouldHide(message('bot', 'bot')), false);
  f.blocked.add('blocked');
  f.observe({ type: 'LOGOUT' });
  assert.equal(f.shouldHide(message('bot', 'bot')), false);
  f.observe({ type: 'MESSAGE_CREATE', channelId: 'channel', message: raw });
  f.observe({ type: 'CONNECTION_OPEN' });
  assert.equal(f.shouldHide(message('bot', 'bot')), false);
});

test('malformed/cyclic metadata and uncached original responses are safe; ID cache is bounded', () => {
  const f = setup();
  const cyclic = {}; cyclic.triggering_interaction_metadata = cyclic;
  assert.deepEqual(interactionInfo({ interaction_metadata: cyclic }), { ids: [], originals: [] });
  for (const value of [null, undefined, {}, 0, 'text', { author: null }, { interaction: cyclic }]) assert.equal(f.shouldHide(value), false);
  const a = message('a', 'bot', { interaction: { originalResponseMessageId: 'b' } });
  const b = message('b', 'bot', { interaction: { originalResponseMessageId: 'a' } });
  f.messages.set('channel:a', a); f.messages.set('channel:b', b);
  assert.equal(f.shouldHide(a), false);
  for (let i = 0; i <= 2000; i++) f.observe({ type: 'MESSAGE_CREATE', message: message(String(i), 'bot', { interaction: { user: { id: 'blocked' } } }) });
  assert.equal(f.shouldHide(message('0', 'bot')), false);
  assert.equal(f.shouldHide(message('2000', 'bot')), true);
});

// ChannelMessages' documented mobile-compatible shape: an ordered _array,
// indexed _map, prototype methods and independent pagination state.
class ChannelMessages {
  constructor(rows) {
    this._array = rows;
    this._map = Object.fromEntries(rows.map(row => [row.id, row]));
    this.hasMoreBefore = true; this.hasMoreAfter = false; this.ready = true;
    this.jumpTargetId = 'hidden'; this.loadingMore = false;
  }
  get(id) { return this._map[id]; }
  toArray() { return this._array; }
  forEach(callback) { return this._array.forEach(callback); }
  some(callback) { return this._array.some(callback); }
}

test('chat list projection removes entire rows without changing frozen originals or paging flags', () => {
  const f = setup();
  const hidden = Object.freeze(message('hidden', 'blocked', { attachments: [{ url: 'attachment' }], embeds: [{ description: 'embed' }] }));
  const visible = Object.freeze(message('visible'));
  const raw = Object.freeze(new ChannelMessages(Object.freeze([hidden, visible])));
  const project = createCollectionFilter(f.shouldHide).project;
  const shown = project(raw);
  assert.ok(shown instanceof ChannelMessages);
  assert.deepEqual(shown.toArray(), [visible]);
  const iterated = []; shown.forEach(row => iterated.push(row));
  assert.deepEqual(iterated, [visible]);
  assert.equal(shown.some(row => row.author.id === 'blocked'), false);
  assert.equal(shown.get('hidden'), undefined);
  assert.equal(shown.get('visible'), visible);
  assert.equal(shown.hasMoreBefore, true);
  assert.equal(shown.jumpTargetId, 'hidden');
  assert.equal(raw.get('hidden'), hidden);
  assert.equal(hidden.content, 'unchanged');
  assert.equal(raw._array.length, 2);
  assert.equal(project(raw), shown);
  f.blocked.clear();
  assert.equal(project(raw), raw);
});

test('all-hidden pages still paginate, in-place arrivals/flags refresh and unsupported shapes pass through', () => {
  const f = setup();
  let unsupported = 0;
  const lists = createCollectionFilter(f.shouldHide, () => unsupported++);
  const raw = new ChannelMessages([message('hidden', 'blocked')]);
  const empty = lists.project(raw);
  assert.deepEqual(empty._array, []);
  assert.equal(empty.hasMoreBefore, true);
  raw.loadingMore = true;
  assert.equal(lists.project(raw).loadingMore, true);
  const visible = message('visible');
  raw._array.push(visible); raw._map.visible = visible;
  assert.deepEqual(lists.project(raw)._array, [visible]);
  assert.deepEqual(lists.project(raw._array), [visible]);
  const unknown = Object.freeze({ unusual: true });
  assert.equal(lists.project(unknown), unknown);
  assert.equal(unsupported, 1);
});
