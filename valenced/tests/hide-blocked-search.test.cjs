'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, CHANNEL, FRIEND, BLOCKED, IGNORED } = require('../../revenge-next/tests/next-harness.cjs');

function setup() {
  const w = createWorld(), rel = w.stores.RelationshipStore;
  rel.isBlockedOrIgnored = function (id) { return this.isBlocked(id) || this.isIgnored(id); };
  rel.isBlockedOrIgnoredForMessage = function (message) { return this.isBlockedOrIgnored(message.author?.id); };
  const messages = [BLOCKED, IGNORED, FRIEND].map((id, index) => Object.freeze({
    id: String(index + 1), channel_id: CHANNEL, author: w.users[id], content: 'original', hit: true }));
  const cache = [];
  const state = Object.freeze({ query: 'from: blocked-name', autocompletes: Object.freeze([
    { group: 'from', results: Object.freeze(messages.map(message => ({ user: message.author }))) }]) });
  const search = { getMessages: () => cache, getCursor: () => 'native-cursor', getTotalResults: () => 3, emitChange() {} };
  const autocomplete = { getState: () => state, emitChange() {} };
  Object.assign(w.stores, { SearchMessageStore: search, SearchAutocompleteStore: autocomplete });
  const screen = { type: function AutocompleteScreen() {
    return autocomplete.getState().autocompletes[0].results.filter(item => !rel.isBlockedOrIgnored(item.user.id));
  } };
  const event = Object.freeze({ type: 'SEARCH_MESSAGES_SUCCESS', data: Object.freeze([
    { id: 'search', messages: Object.freeze(messages.map(message => Object.freeze([message]))) }]) });
  w.dispatcher.subscribe('SEARCH_MESSAGES_SUCCESS', incoming => {
    for (const batch of incoming.data) for (const [message] of batch.messages) {
      if (!rel.isBlockedOrIgnoredForMessage(message)) cache.push(message);
    }
  });
  return { w, rel, messages, cache, state, search, autocomplete, screen, event };
}

test('Valenced includes blocked/ignored users in native search results and author suggestions while chat remains hidden', async t => {
  const h = setup(), { w, rel, screen, search, autocomplete, state, messages, event } = h;
  w.addModule({ default: screen }, 'modules/search/native/components/layout/autocomplete/AutocompleteScreen.tsx');
  const originalScreen = screen.type, originalBlocked = rel.isBlocked, originalCombined = rel.isBlockedOrIgnored;
  const originalGet = search.getMessages;
  w.messages.push(...messages);
  const item = await w.start('hide-blocked-and-ignored-messages');
  t.after(async () => {
    if (w.loaded.has(item.slug)) await w.stop(item);
    assert.deepEqual(w.errors, []); assert.equal(w.timers.size, 0); assert.equal(w.pathWaiters.size, 0);
  });
  w.dispatcher.dispatch(event);
  assert.deepEqual(search.getMessages().map(message => message.author.id), [BLOCKED, IGNORED, FRIEND]);
  assert.equal(search.getMessages(), h.cache);
  assert.equal(search.getCursor(), 'native-cursor'); assert.equal(search.getTotalResults(), 3);
  assert.equal(autocomplete.getState(), state);
  assert.deepEqual(screen.type().map(item => item.user.id), [BLOCKED, IGNORED, FRIEND]);
  assert.equal(rel.isBlocked, originalBlocked); assert.equal(rel.isBlocked(BLOCKED), true);
  assert.equal(rel.isBlockedOrIgnored(BLOCKED), true); assert.equal(rel.isBlockedOrIgnoredForMessage(messages[0]), true);
  assert.equal(w.stores.MessageStore.getMessages(CHANNEL).some(message => message.author.id === BLOCKED), false);
  await w.stop(item);
  assert.equal(search.getMessages, originalGet); assert.equal(screen.type, originalScreen);
  assert.equal(rel.isBlockedOrIgnored, originalCombined);
  h.cache.length = 0; w.dispatcher.dispatch(event);
  assert.deepEqual(h.cache.map(message => message.author.id), [FRIEND]);
});

test('search exceptions do not affect unrelated nested events or deferred relationship checks', async t => {
  const h = setup(), { w, rel } = h;
  const item = await w.start('hide-blocked-and-ignored-messages');
  t.after(async () => { await w.stop(item); assert.deepEqual(w.errors, []); assert.equal(w.timers.size, 0); });
  let nested, afterNested, deferred;
  w.dispatcher.subscribe('MESSAGE_CREATE', () => { nested = rel.isBlockedOrIgnored(BLOCKED); });
  w.dispatcher.subscribe('SEARCH_MESSAGES_SUCCESS', () => {
    w.dispatcher.dispatch({ type: 'MESSAGE_CREATE', message: h.messages[2] });
    afterNested = rel.isBlockedOrIgnored(BLOCKED);
    deferred = Promise.resolve().then(() => rel.isBlockedOrIgnored(BLOCKED));
  });
  w.dispatcher.dispatch(h.event);
  assert.equal(nested, true); assert.equal(afterNested, false); assert.equal(await deferred, true);
});

test('late autocomplete modules are patched once and restored on stop', async t => {
  const h = setup(), { w, screen } = h, original = screen.type;
  const item = await w.start('hide-blocked-and-ignored-messages');
  t.after(async () => {
    if (w.loaded.has(item.slug)) await w.stop(item);
    assert.deepEqual(w.errors, []); assert.equal(w.timers.size, 0); assert.equal(w.pathWaiters.size, 0);
  });
  w.addModule({ default: screen }, 'modules/search/native/components/layout/autocomplete/AutocompleteScreen.tsx');
  assert.deepEqual(screen.type().map(item => item.user.id), [BLOCKED, IGNORED, FRIEND]);
  await w.stop(item);
  assert.equal(screen.type, original);
  assert.deepEqual(screen.type().map(item => item.user.id), [FRIEND]);
});

test('channel and server Members search hide blocked and ignored users, including a direct username match', async t => {
  const { w } = setup(), guildSearch = '400000000000000001';
  const rows = Object.freeze([BLOCKED, IGNORED, FRIEND].map(id => Object.freeze({ record: w.users[id] })));
  const scoped = new Map([[CHANNEL, rows], [guildSearch, rows]]);
  let changes = 0;
  class SearchGuildMemberTabStore {
    getResults(id) { return scoped.get(id); }
    getCount(id) { return scoped.get(id)?.length ?? null; }
    emitChange() { changes++; }
  }
  const memberSearch = new SearchGuildMemberTabStore();
  const originalResults = memberSearch.getResults, originalCount = memberSearch.getCount;
  const item = await w.start('hide-blocked-and-ignored-messages', { whitelistedIds: [BLOCKED] });
  let settings;
  t.after(async () => {
    if (settings) await w.Renderer.act(async () => settings.unmount());
    await w.stop(item);
    assert.deepEqual(w.errors, []);
    assert.equal(w.pathWaiters.size, 0);
    assert.equal(w.timers.size, 0);
  });
  w.addModule({ default: memberSearch }, 'modules/search/native/stores/SearchMemberTabStore.tsx');
  const ids = id => memberSearch.getResults(id).map(result => result.record.id);
  assert.deepEqual(ids(CHANNEL), [FRIEND]);
  assert.equal(memberSearch.getResults(CHANNEL), memberSearch.getResults(CHANNEL));
  assert.equal(memberSearch.getCount(CHANNEL), 1);
  assert.deepEqual(ids(guildSearch), [FRIEND]);
  assert.equal(memberSearch.getCount(guildSearch), 1);
  assert.equal(memberSearch.getCount('unknown'), null);

  // Server search without an in: filter, where the blocked account is the only match.
  const directMatch = Object.freeze([rows[0]]);
  scoped.set(guildSearch, directMatch);
  assert.deepEqual(ids(guildSearch), []);
  assert.equal(memberSearch.getCount(guildSearch), 0);

  settings = await w.render(item);
  const whitelist = settings.root.findAllByType('Switch').find(node => node.props.accessibilityLabel === 'Show whitelisted users');
  await w.Renderer.act(async () => {
    whitelist.props.onValueChange(true);
    await w.advance(0);
  });
  assert.deepEqual(ids(CHANNEL), [BLOCKED, FRIEND]);
  assert.equal(memberSearch.getResults(guildSearch), directMatch);
  assert.equal(memberSearch.getCount(guildSearch), 1);
  assert.equal(memberSearch.getCount(CHANNEL), 2);
  const before = changes;
  w.relationships[FRIEND] = 2;
  w.stores.RelationshipStore.emitChange();
  await w.advance(0);
  assert.ok(changes > before);
  assert.deepEqual(ids(CHANNEL), [BLOCKED]);
  assert.equal(memberSearch.getCount(CHANNEL), 1);
  assert.equal(rows.length, 3);
  await w.stop(item);
  assert.equal(memberSearch.getResults, originalResults);
  assert.equal(memberSearch.getCount, originalCount);
  assert.equal(memberSearch.getResults(CHANNEL), rows);
});
