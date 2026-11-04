import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchProjection } from '../src/search.js';
import { createMessageFilter } from '../src/filter.js';
import { createMentionFilter } from '../src/mentions.js';

const BLOCKED = '100000000000000002', IGNORED = '100000000000000003', FRIEND = '100000000000000001';
const row = (id, author = FRIEND, extra = {}) => Object.freeze({ id, channel_id: 'channel', author: { id: author }, content: 'original', ...extra });
function setup() {
  const storage = {};
  const filter = createMessageFilter({ storage, blockedStore: { isBlocked: id => id === BLOCKED },
    ignoredStore: { isIgnored: id => id === IGNORED }, getMessage: () => undefined });
  const mentions = createMentionFilter(filter.isFilteredUser, storage);
  return { storage, filter, ...createSearchProjection(filter, mentions.project) };
}

test('flat native search messages and grouped legacy hits hide blocked/ignored users without promoting context to hits', () => {
  const h = setup(), friend = row('friend'), blocked = row('blocked', BLOCKED), ignored = row('ignored', IGNORED);
  const flat = Object.freeze([blocked, friend, ignored]);
  assert.deepEqual(h.results(flat), [friend]);
  assert.equal(flat.length, 3);
  const hiddenHit = Object.freeze([row('context'), row('hit', BLOCKED, { hit: true })]);
  const visibleHit = Object.freeze([blocked, row('visible-hit', FRIEND, { hit: true }), ignored]);
  const legacy = Object.freeze([hiddenHit, visibleHit, Object.freeze([blocked])]);
  assert.deepEqual(h.results(legacy).map(group => group.map(message => message.id)), [['visible-hit']]);
  assert.equal(legacy.length, 3); assert.equal(hiddenHit.length, 2);
  assert.deepEqual(h.results(Object.freeze([blocked, ignored])), []);
});

test('search projections preserve server totals, cursor/flags, record prototypes and stable references while sanitizing mentions', () => {
  const h = setup();
  const friend = row('friend', FRIEND, { content: `hi <@${BLOCKED}> <@!${IGNORED}>`, mentions: [{ id: BLOCKED }, { id: IGNORED }] });
  const wrapped = Object.freeze({ message: friend, hit: true });
  const state = Object.freeze({ results: Object.freeze([row('hidden', BLOCKED), wrapped]),
    totalResults: 250, cursor: 'native-cursor', isFetching: false, hasMore: true });
  const view = h.results(state);
  assert.equal(view.totalResults, 250); assert.equal(view.cursor, 'native-cursor'); assert.equal(view.hasMore, true);
  assert.equal(view.results[0].message.content, 'hi  ');
  assert.equal(h.results(state), view);
  h.storage.whitelistEnabled = true; h.storage.whitelistedIds = [BLOCKED];
  const allowed = h.results(state);
  assert.equal(allowed.results.length, 2);
  assert.equal(allowed.results[1].message.content, `hi <@${BLOCKED}> `);
  h.storage.whitelistedIds = [];
  assert.equal(h.results(state).results.length, 1);
  assert.equal(friend.content, `hi <@${BLOCKED}> <@!${IGNORED}>`);
  const emptyState = Object.freeze({ messages: Object.freeze([row('only-hidden', BLOCKED, { hit: true })]), totalResults: 1 });
  assert.equal(h.results(emptyState), h.results(emptyState));
});

test('author autocomplete removes explicit blocked/ignored users and empty groups, preserving channel/generic suggestions and typed query', () => {
  const h = setup();
  const channel = Object.freeze({ channel: { id: BLOCKED }, text: 'channel-name' });
  const friend = Object.freeze({ user: { id: FRIEND }, text: 'friend' });
  const state = Object.freeze({ query: 'from: typed-name', tokens: ['untouched-token'], mode: { type: 'FILTER' },
    autocompletes: Object.freeze([
      Object.freeze({ group: 'from', results: Object.freeze([{ user: { id: BLOCKED } }, friend, channel]) }),
      Object.freeze({ group: 'mentions', results: Object.freeze([{ userId: IGNORED }]) }),
      Object.freeze({ group: 'has', results: Object.freeze([{ text: 'image' }]) }),
    ]) });
  const view = h.autocomplete(state);
  assert.equal(view.query, state.query); assert.equal(view.tokens, state.tokens); assert.equal(view.mode, state.mode);
  assert.equal(view.autocompletes.length, 2);
  assert.deepEqual(view.autocompletes[0].results, [friend, channel]);
  assert.equal(h.autocomplete(state), view);
  h.storage.whitelistEnabled = true; h.storage.whitelistedIds = [BLOCKED, IGNORED];
  assert.equal(h.autocomplete(state), state);
});

test('search gateway interaction metadata filters normalized bot results while preserving raw events', () => {
  const h = setup();
  for (const type of ['SEARCH_FINISH', 'SEARCH_MESSAGES_SUCCESS']) {
    const raw = row(type, 'bot', { interaction_metadata: { user: { id: BLOCKED } } });
    const messages = Object.freeze([Object.freeze([raw])]);
    const event = Object.freeze(type === 'SEARCH_FINISH' ? { type, messages }
      : { type, data: Object.freeze([{ id: 'search-context', messages }]) });
    h.filter.observe(event);
    assert.deepEqual(h.results([row(type, 'bot')]), []);
    assert.equal(raw.interaction_metadata.user.id, BLOCKED); assert.equal(messages.length, 1);
  }
});

test('unknown search formats, null loading values and cyclic values are safe', () => {
  const h = setup();
  const unknown = Object.freeze({ differentShape: true });
  assert.equal(h.results(unknown), unknown); assert.equal(h.results(null), null);
  assert.equal(h.autocomplete(unknown), unknown);
  const cyclic = []; cyclic.push(cyclic);
  assert.equal(h.results(cyclic), cyclic);
  h.storage.blocked = false; h.storage.ignored = false;
  const visible = [row('blocked', BLOCKED), row('ignored', IGNORED)];
  assert.equal(h.results(visible), visible);
});
