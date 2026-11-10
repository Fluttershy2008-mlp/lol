import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerFilter } from '../src/servers.js';
import { createPingProjection } from '../src/notifications.js';
const GUILD = '400000000000000001', OTHER = '400000000000000002';
const CHANNEL = '300000000000000001', THREAD = '300000000000000002', DM = '300000000000000003';
function setup() {
  const storage = { hiddenServerIds: [GUILD] }, channels = {
    [CHANNEL]: { getGuildId: () => GUILD }, [THREAD]: { parent_id: CHANNEL }, [DM]: { type: 1 },
  };
  const servers = createServerFilter(storage, id => channels[id]);
  return { storage, projection: createPingProjection(servers) };
}
test('classifies mobile notification items, native MessageRecords, thread pings and trusted links without using authors or quoted messages', () => {
  const { projection: p } = setup();
  for (const row of [{ guild_id: GUILD }, { message_channel_id: CHANNEL }, { message: { getChannelId: () => THREAD } },
    { notification: { guild: { id: GUILD } } }, { data: { channel_id: CHANNEL } },
    { deeplink: `https://discord.com/channels/${GUILD}/${CHANNEL}/123` }, { deeplink: `discord://-/channels/${GUILD}/${CHANNEL}` }]) assert.equal(p.hidden(row), true);
  for (const row of [{ guild_id: OTHER }, { channel_id: DM, referenced_message: { guild_id: GUILD } },
    { message: { channel_id: DM }, guild_id: GUILD }, { author: { id: GUILD } },
    { content: `https://discord.com/channels/${GUILD}/${CHANNEL}` }, { deeplink: `https://evil.example/channels/${GUILD}/${CHANNEL}` },
    { type: 'incoming_friend_request' }, Object.defineProperty({}, 'message', { get() { throw Error('unknown notification'); } }), null]) assert.equal(p.hidden(row), false);
});
test('projection preserves frozen originals, stable snapshots, new rows and immediate OFF/ON restoration', () => {
  const { storage, projection: p } = setup();
  const hidden = Object.freeze({ guild_id: GUILD }), visible = Object.freeze({ guild_id: OTHER });
  const rows = Object.freeze([hidden, visible]);
  const first = p.list(rows); assert.deepEqual(first, [visible]); assert.equal(p.list(rows), first); assert.equal(rows.length, 2);
  storage.hideServerPings = false; assert.equal(p.list(rows), rows);
  storage.hideServerPings = true; assert.deepEqual(p.list(rows), [visible]);
  const arriving = [hidden, visible]; p.list(arriving); const next = { guild_id: OTHER }; arriving.push(next);
  assert.deepEqual(p.list(arriving), [visible, next]);
  const cycle = {}; cycle.data = cycle; assert.equal(p.hidden(cycle), false);
});

test('unchanged native activity snapshots and mention-ID lookups do not rescan history', () => {
  let classified = 0, reads = 0;
  const servers = createServerFilter({ hiddenServerIds: [GUILD] });
  const p = createPingProjection(servers);
  const data = Array.from({ length: 2000 }, (_, i) => ({ id: String(i),
    get guild_id() { classified++; return i % 2 ? OTHER : GUILD; } }));
  const rows = new Proxy(data, { get(target, key) {
    if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
    return Reflect.get(target, key);
  } });
  assert.equal(p.list(rows, true).length, 1000);
  assert.equal(p.hasHiddenId(rows, '0', true), true);
  const initial = { reads, classified };
  for (let i = 0; i < 500; i++) {
    assert.equal(p.list(rows, true).length, 1000);
    assert.equal(p.hasHiddenId(rows, '0', true), true);
    assert.equal(p.hasHiddenId(rows, 'missing', true), false);
  }
  assert.deepEqual({ reads, classified }, initial, 'no further row reads or server classification on unchanged native snapshots');
  data[0] = { id: '0', guild_id: OTHER }; p.clear();
  assert.equal(p.list(rows, true).length, 1001);
  assert.equal(p.hasHiddenId(rows, '0', true), false);
});
