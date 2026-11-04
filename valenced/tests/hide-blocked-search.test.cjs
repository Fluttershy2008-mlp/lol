'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, React, Renderer, CHANNEL, FRIEND, BLOCKED, IGNORED } = require('../../revenge-next/tests/next-harness.cjs');

function searchStores(w) {
  const row = (id, author) => Object.freeze({ id, channel_id: CHANNEL, author: w.users[author], content: 'original' });
  const messages = Object.freeze([row('blocked', BLOCKED), row('ignored', IGNORED), row('friend', FRIEND)]);
  const groups = Object.freeze(messages.map(message => Object.freeze([{ ...message, hit: true }])));
  const state = Object.freeze({ query: 'from: someone', tokens: Object.freeze(['from']),
    autocompletes: Object.freeze([{ group: 'from', results: Object.freeze([
      { user: w.users[BLOCKED] }, { user: w.users[IGNORED] }, { user: w.users[FRIEND] }]) }]) });
  let changes = 0;
  const modern = { getMessages: () => messages, getCursor: () => 'native-cursor',
    getTotalResults: () => 100, emitChange() { changes++; } };
  const legacy = { getSearchResults: () => groups, getTotalResults: () => 100, emitChange() { changes++; } };
  const autocomplete = { getState: () => state, emitChange() { changes++; } };
  return { messages, groups, state, modern, legacy, autocomplete, changes: () => changes };
}

test('Valenced filters native/legacy search and author suggestions, respects whitelist/settings, refreshes and restores untouched caches on stop', async t => {
  const w = createWorld(), s = searchStores(w);
  Object.assign(w.stores, { SearchMessageStore: s.modern, SearchStore: s.legacy, SearchAutocompleteStore: s.autocomplete });
  const original = s.modern.getMessages;
  const item = await w.start('hide-blocked-and-ignored-messages', { whitelistEnabled: true, whitelistedIds: [BLOCKED] });
  let ui;
  t.after(async () => {
    if (ui) await Renderer.act(async () => ui.unmount());
    if (w.loaded.has(item.slug)) await w.stop(item);
    assert.deepEqual(w.errors, []); assert.equal(w.timers.size, 0); assert.equal(w.pathWaiters.size, 0);
  });
  assert.deepEqual(s.modern.getMessages('search').map(message => message.id), ['blocked', 'friend']);
  assert.deepEqual(s.legacy.getSearchResults('search').map(group => group[0].id), ['blocked', 'friend']);
  assert.deepEqual(s.autocomplete.getState('search').autocompletes[0].results.map(result => result.user.id), [BLOCKED, FRIEND]);
  assert.equal(s.modern.getCursor(), 'native-cursor'); assert.equal(s.modern.getTotalResults(), 100);
  await Renderer.act(async () => { ui = Renderer.create(React.createElement(item.options.SettingsComponent, { api: item.api })); });
  const toggle = label => ui.root.findAll(n => n.type === 'Switch' && n.props.accessibilityLabel === label)[0];
  await Renderer.act(async () => toggle('Show whitelisted users').props.onValueChange(false));
  await w.advance(0);
  assert.deepEqual(s.modern.getMessages('search').map(message => message.id), ['friend']);
  assert.deepEqual(s.autocomplete.getState('search').autocompletes[0].results.map(result => result.user.id), [FRIEND]);
  assert.equal(s.autocomplete.getState().query, 'from: someone');
  assert.ok(s.changes() >= 3);
  await Renderer.act(async () => toggle('Hide blocked users').props.onValueChange(false));
  assert.deepEqual(s.modern.getMessages('search').map(message => message.id), ['blocked', 'friend']);
  await w.stop(item);
  assert.equal(s.modern.getMessages, original); assert.equal(s.modern.getMessages(), s.messages);
  assert.equal(s.legacy.getSearchResults(), s.groups); assert.equal(s.autocomplete.getState(), s.state);
  assert.equal(w.relationships[BLOCKED], 2); assert.equal(w.relationships[IGNORED], 5);
});

test('Valenced catches search stores imported after startup and removes late loaders/patches on unload', async t => {
  const w = createWorld(), s = searchStores(w), original = s.modern.getMessages;
  const item = await w.start('hide-blocked-and-ignored-messages');
  t.after(async () => {
    if (w.loaded.has(item.slug)) await w.stop(item);
    assert.deepEqual(w.errors, []); assert.equal(w.pathWaiters.size, 0); assert.equal(w.timers.size, 0);
  });
  w.addModule({ default: s.modern }, 'modules/search/SearchMessageStore.tsx');
  w.addModule({ default: s.autocomplete }, 'modules/search/SearchAutocompleteStore.tsx');
  await w.advance(0);
  assert.deepEqual(s.modern.getMessages().map(message => message.id), ['friend']);
  assert.deepEqual(s.autocomplete.getState().autocompletes[0].results.map(result => result.user.id), [FRIEND]);
  await w.stop(item);
  assert.equal(s.modern.getMessages, original);
  w.addModule({ default: s.legacy }, 'stores/SearchStore.tsx');
  assert.equal(s.legacy.getSearchResults(), s.groups);
});
