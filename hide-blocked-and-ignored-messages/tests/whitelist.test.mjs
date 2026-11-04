import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWhitelist, parseWhitelistInput, isUserWhitelisted } from '../src/whitelist.js';
import { createMessageFilter } from '../src/filter.js';
import { createCollectionFilter } from '../src/collection.js';
import { createMentionFilter } from '../src/mentions.js';

const ALLOWED = '100000000000000002', OTHER = '100000000000000003', FRIEND = '100000000000000001';
const row = (id, author, extra = {}) => Object.freeze({ id, channel_id: 'channel', author: { id: author }, content: 'original', ...extra });
function setup(storage = {}) {
  const f = createMessageFilter({ storage,
    blockedStore: { isBlocked: id => id === ALLOWED || id === OTHER },
    ignoredStore: { isIgnored: id => id === OTHER }, getMessage: () => undefined });
  return { ...f, storage };
}

test('whitelist input preserves large IDs as strings, accepts mentions/separators, deduplicates and rejects malformed tokens', () => {
  assert.deepEqual(parseWhitelistInput(`${ALLOWED}, <@${OTHER}>;\n<@!${ALLOWED}>`), { ids: [ALLOWED, OTHER], invalid: [] });
  assert.deepEqual(parseWhitelistInput(''), { ids: [], invalid: [] });
  const invalid = ['123', 'not-an-id', '0'.repeat(18), '1'.repeat(21), '1.23456789e18', `<@&${ALLOWED}>`, `<#${ALLOWED}>`];
  assert.deepEqual(parseWhitelistInput(invalid.join(' ')), { ids: [], invalid });
  const original = Object.freeze([ALLOWED, ALLOWED, OTHER, 100000000000000002, {}, 'bad']);
  assert.deepEqual(normalizeWhitelist(original), [ALLOWED, OTHER]);
  for (const value of [undefined, null, ALLOWED, 100000000000000002, {}]) assert.deepEqual(normalizeWhitelist(value), []);
});

test('only enabled exact whitelisted IDs override blocked/ignored filters; empty/disabled/malformed lists hide normally', () => {
  const f = setup({ whitelistedIds: [ALLOWED] });
  assert.equal(f.shouldHide(row('one', ALLOWED)), true);
  f.storage.whitelistEnabled = true;
  assert.equal(f.shouldHide(row('one', ALLOWED)), false);
  assert.equal(f.shouldHide(row('two', OTHER)), true);
  assert.equal(f.shouldHide(row('three', FRIEND)), false);
  assert.equal(isUserWhitelisted(f.storage, ALLOWED.slice(0, -1)), false);
  f.storage.whitelistedIds = [OTHER];
  assert.equal(f.shouldHide(row('one', ALLOWED)), true);
  assert.equal(f.shouldHide(row('two', OTHER)), false);
  f.storage.whitelistedIds = [];
  assert.equal(f.shouldHide(row('two', OTHER)), true);
  f.storage.whitelistedIds = ALLOWED;
  assert.equal(f.shouldHide(row('one', ALLOWED)), true);
});

test('whitelisted authors can reply to hidden users while other blocked authors remain hidden', () => {
  const f = setup({ whitelistEnabled: true, whitelistedIds: [ALLOWED] });
  const other = row('other', OTHER), allowed = row('allowed', ALLOWED);
  assert.equal(f.shouldHide(row('r1', ALLOWED, { type: 19, referenced_message: other })), false);
  assert.equal(f.shouldHide(row('r2', FRIEND, { type: 19, referenced_message: allowed })), false);
  assert.equal(f.shouldHide(row('r3', FRIEND, { type: 19, referenced_message: other })), true);
  assert.equal(f.shouldHide(row('r4', OTHER, { type: 19, referenced_message: allowed })), true);
});

test('whitelisted command initiators and mentions return immediately; editing the whitelist invalidates display results without changing originals', () => {
  const f = setup({ whitelistEnabled: true, whitelistedIds: [] });
  const mentions = createMentionFilter(f.isFilteredUser, f.storage);
  const lists = createCollectionFilter(f.shouldHide, undefined, mentions.project);
  const allowed = row('allowed', ALLOWED);
  const bot = row('bot', '200000000000000001');
  f.observe({ type: 'MESSAGE_CREATE', message: { ...bot, interaction_metadata: { user: { id: ALLOWED } } } });
  const ping = row('ping', FRIEND, { content: `<@${ALLOWED}> <@!${OTHER}>`, mentions: [{ id: ALLOWED }, { id: OTHER }] });
  const original = Object.freeze([allowed, bot, ping, row('other', OTHER)]);
  assert.deepEqual(lists.project(original).map(m => m.id), ['ping']);
  assert.equal(mentions.project(ping).content, ' ');
  f.storage.whitelistedIds = [ALLOWED];
  assert.deepEqual(lists.project(original).map(m => m.id), ['allowed', 'bot', 'ping']);
  assert.equal(mentions.project(ping).content, `<@${ALLOWED}> `);
  assert.deepEqual(mentions.project(ping).mentions, [{ id: ALLOWED }]);
  f.storage.whitelistEnabled = false;
  assert.deepEqual(lists.project(original).map(m => m.id), ['ping']);
  assert.equal(ping.content, `<@${ALLOWED}> <@!${OTHER}>`);
  assert.equal(original.length, 4);
});
