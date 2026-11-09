import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerFilter, parseServerIds, normalizeServerIds } from '../src/servers.js';
import { createMessageFilter } from '../src/filter.js';
const GUILD = '400000000000000001', USER = '100000000000000001';
test('server IDs stay strings, deduplicate and reject user mentions or mixed invalid input', () => {
  assert.deepEqual(parseServerIds(`${GUILD}, ${GUILD};12345678901234567890`), { ids: [GUILD, '12345678901234567890'], invalid: [] });
  assert.deepEqual(parseServerIds(`<@${USER}> abc`).invalid, [`<@${USER}>`, 'abc']);
  assert.deepEqual(normalizeServerIds([GUILD, GUILD, Number(GUILD), 'invalid']), [GUILD]);
});
test('classifies only the owning guild; missing channels and cyclic parents stay visible', () => {
  const storage = { hiddenServerIds: [GUILD], whitelistEnabled: true, whitelistedIds: [USER] };
  const channels = { guild: { guildId: GUILD }, thread: { parent_id: 'guild' }, dm: { type: 1 }, loop: { parentId: 'loop' } };
  const server = createServerFilter(storage, id => channels[id]);
  const filter = createMessageFilter({ storage, ...server });
  assert.equal(filter.shouldHide({ author: { id: USER }, channel_id: 'thread' }), true);
  for (const id of ['dm', 'missing', 'loop']) assert.equal(filter.shouldHide({ channel_id: id, message_reference: { guild_id: GUILD } }), false);
  assert.equal(filter.shouldHide({ guild_id: GUILD }), true);
  storage.hideServers = false;
  assert.equal(filter.shouldHide({ guild_id: GUILD }), false);
});
