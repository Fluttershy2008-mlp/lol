import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscordAdapter } from '../src/discord.js';

function fixture({ modules = [], status = { customStatus: { text: 'Old' }, status: { value: 'invisible' } } } = {}) {
  let account = '100';
  const stores = { UserStore: { getCurrentUser: () => ({ id: account }) }, UserSettingsProtoStore: { settings: { status } }, ConnectionStore: { isConnected: () => true } };
  const V = { metro: { common: {}, findByProps: (...keys) => modules.find(m => keys.every(k => k in m)),
    findByPropsAll: (...keys) => modules.filter(m => keys.every(k => k in m)), findByStoreName: name => stores[name] } };
  return { adapter: createDiscordAdapter(V, () => 1000), stores, account: value => { account = value; }, V };
}

const payload = { text: 'Playing', emojiId: '1234567890123456789', emojiName: 'party', expiresAtMs: 3601000, createdAtMs: 1000 };

test('native update preserves invisible presence and unrelated settings; clear removes only custom status', async () => {
  const draft = { status: { value: 'invisible' }, showCurrentGame: true, customStatus: { text: 'old' } };
  const calls = [];
  const actions = { updateAsync: async (key, mutate, delay) => { calls.push([key, delay]); mutate(draft); } };
  const { adapter } = fixture({ modules: [{ PreloadedUserSettingsActionCreators: actions }] });
  await adapter.update(payload, '100');
  assert.deepEqual(calls, [['status', 0]]);
  assert.equal(draft.status.value, 'invisible');
  assert.equal(draft.showCurrentGame, true);
  assert.deepEqual(draft.customStatus, { ...payload, expiresAtMs: '3601000', createdAtMs: '1000' });
  await adapter.update(null, '100');
  assert.equal(draft.customStatus, undefined);
  assert.equal(draft.status.value, 'invisible');
});

test('selects the preloaded schema instead of other modules with updateAsync', async () => {
  let right = false;
  const modules = [
    { ProtoClass: { typeName: 'discord.FrecencyUserSettings' }, updateAsync: () => { throw new Error('wrong serializer'); } },
    { ProtoClass: { typeName: 'discord.PreloadedUserSettings' }, updateAsync: (key, mutate) => { right = true; mutate({}); } },
  ];
  await fixture({ modules }).adapter.update(payload, '100');
  assert.equal(right, true);
});

test('REST compatibility path awaits success, uses correct emoji/expiry fields and clears old fields', async () => {
  const requests = [];
  const api = { getAPIBaseURL() {}, get() {}, patch: async req => { requests.push(req); return { status: 200 }; } };
  const { adapter } = fixture({ modules: [api] });
  await adapter.update(payload, '100');
  assert.deepEqual(requests[0], { url: '/users/@me/settings', body: { custom_status: {
    text: 'Playing', emoji_id: '1234567890123456789', emoji_name: 'party', expires_at: new Date(3601000).toISOString(),
  } } });
  await adapter.update({ ...payload, emojiId: '', emojiName: '', expiresAtMs: 0 }, '100');
  assert.equal(requests[1].body.custom_status.emoji_id, null);
  assert.equal(requests[1].body.custom_status.emoji_name, null);
  assert.equal(requests[1].body.custom_status.expires_at, null);
  await adapter.update(null, '100');
  assert.equal(requests[2].body.custom_status, null);
});

test('never falls through to REST after native rejection; resolved HTTP failures are rejected', async () => {
  let rest = 0;
  const api = { getAPIBaseURL() {}, get() {}, patch: async () => { rest++; return { status: 429, body: { retry_after: 8 } }; } };
  const actions = { updateAsync: async () => { throw new Error('Network down'); } };
  const { adapter } = fixture({ modules: [{ PreloadedUserSettingsActionCreators: actions }, api] });
  await assert.rejects(adapter.update(payload, '100'), /Network down/);
  assert.equal(rest, 0);
  await assert.rejects(fixture({ modules: [api] }).adapter.update(payload, '100'), error => error.status === 429 && error.body.retry_after === 8);
});

test('missing modules, offline, and account changes fail without touching a profile', async () => {
  const { adapter, stores, account } = fixture();
  await assert.rejects(adapter.update(payload, '100'), /unavailable/);
  account('200');
  await assert.rejects(adapter.update(payload, '100'), /account changed/);
  stores.ConnectionStore.isConnected = () => false;
  await assert.rejects(adapter.update(payload, '200'), /offline/);
});

test('deferred native callback refuses to mutate another account after a switch', async () => {
  let mutate;
  const actions = { updateAsync: (_, callback) => { mutate = callback; } };
  const { adapter, account } = fixture({ modules: [{ PreloadedUserSettingsActionCreators: actions }] });
  await adapter.update(payload, '100');
  account('200');
  assert.throws(() => mutate({}), /account changed/);
});

test('empty native status wins over stale presence; fallbacks can read custom emoji activity', () => {
  const { adapter, stores } = fixture({ status: {} });
  stores.PresenceStore = { getActivities: () => [{ type: 4, state: 'stale', emoji: { id: '1234567890123456789', name: 'party' } }] };
  assert.equal(adapter.currentStatus(), null);
  delete stores.UserSettingsProtoStore;
  assert.equal(adapter.currentStatus().emojiId, '1234567890123456789');
});
