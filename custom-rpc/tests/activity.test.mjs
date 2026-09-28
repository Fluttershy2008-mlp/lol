import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivity, validateConfig, normalizeConfig } from '../src/activity.js';
import { createAssetResolver } from '../src/assets.js';

const basic = { appName: 'Strawberry Whirl', type: 0 };
const appID = '123456789012345678';

test('Playing type 0 survives serialization; optional fields are omitted', async () => {
  const { activity } = await createActivity(basic);
  assert.deepEqual(JSON.parse(JSON.stringify(activity)), {
    application_id: '0', name: 'Strawberry Whirl', type: 0, flags: 1,
  });
});

test('all supported types and streaming URL restrictions', async () => {
  for (const type of [0, 1, 2, 3, 5]) {
    const result = await createActivity({ ...basic, type, streamLink: 'https://www.twitch.tv/pony' });
    assert.equal(result.activity.type, type);
    assert.equal(result.activity.url, type === 1 ? 'https://www.twitch.tv/pony' : undefined);
  }
  for (const streamLink of ['', 'https://twitch.tv.evil.example/pony', 'javascript:alert(1)']) {
    assert.equal(validateConfig({ ...basic, type: 1, streamLink }).valid, false);
  }
  assert.equal(validateConfig({ ...basic, type: 4 }).valid, false);
});

test('independent button slots keep labels and URLs paired', async () => {
  const { activity } = await createActivity({ ...basic, buttonTwoText: 'Website', buttonTwoURL: 'https://example.com' });
  assert.deepEqual(activity.buttons, ['Website']);
  assert.deepEqual(activity.metadata.button_urls, ['https://example.com']);
  assert.equal(validateConfig({ ...basic, buttonOneText: 'Missing URL' }).valid, false);
  assert.equal(validateConfig({ ...basic, buttonOneURL: 'https://example.com' }).valid, false);
});

test('rejects malformed IDs, links, image pages, party sizes and timestamps', () => {
  for (const changes of [
    { appID: '../users/@me' }, { appName: '' }, { details: 'x'.repeat(129) },
    { buttonOneText: 'x'.repeat(32), buttonOneURL: 'https://example.com' },
    { stateURL: 'javascript:alert(1)' }, { detailsURL: 'https://user:password@example.com' },
    { detailsURL: 'https://example.com/\n' + 'bad' }, { imageBig: 'logo' },
    { imageBig: 'https://imgur.com/gallery/123' }, { imageSmall: 'https://tenor.com/view/pony' },
    { partySize: '3', partyMaxSize: '2' }, { partySize: '-1', partyMaxSize: '2' },
    { partySize: '1' }, { timestampMode: 'custom', startTime: 'abc' },
    { timestampMode: 'custom', startTime: '1000', endTime: '1000' },
  ]) assert.equal(validateConfig({ ...basic, ...changes }).valid, false, JSON.stringify(changes));
});

test('timer modes keep a stable origin through subsequent refreshes', async () => {
  const options = { startedAt: 1700000000000, midnightAt: 1699920000000, now: 1700000010000 };
  const first = await createActivity({ ...basic, timestampMode: 'elapsed' }, options);
  const second = await createActivity({ ...basic, timestampMode: 'elapsed' }, { ...options, now: 1700000020000 });
  assert.deepEqual(first.activity.timestamps, second.activity.timestamps);
  const midnight = await createActivity({ ...basic, timestampMode: 'midnight' }, options);
  assert.equal(midnight.activity.timestamps.start, options.midnightAt);
  const custom = await createActivity({ ...basic, timestampMode: 'custom', startTime: '1700000000000', endTime: '1700000300000' });
  assert.deepEqual(custom.activity.timestamps, { start: 1700000000000, end: 1700000300000 });
});

test('image failures leave text, buttons and a working second image intact', async () => {
  const { activity, warnings } = await createActivity({ ...basic, appID, imageBig: 'missing', imageSmall: 'small',
    imageSmallTooltip: 'Strawberry', imageSmallURL: 'https://example.com', detailsURL: 'https://example.com/details',
    partySize: '1', partyMaxSize: '6', buttonOneText: 'Open', buttonOneURL: 'https://example.com',
  }, { resolveAsset: async (_, key) => { if (key === 'missing') throw new Error('404'); return '456'; } });
  assert.equal(activity.name, basic.appName);
  assert.deepEqual(activity.assets, { small_image: '456', small_text: 'Strawberry', small_url: 'https://example.com' });
  assert.deepEqual(activity.party.size, [1, 6]);
  assert.deepEqual(activity.buttons, ['Open']);
  assert.equal(activity.details_url, 'https://example.com/details');
  assert.match(warnings[0], /Large image could not load/);
});

test('normalization excludes unrelated storage keys and converts UI values', () => {
  const value = normalizeConfig({ ...basic, appName: ' Pony ', type: '2', secret: 'unused', partySize: 2 });
  assert.equal(value.appName, 'Pony'); assert.equal(value.type, 2); assert.equal(value.partySize, '2');
  assert.equal('secret' in value, false);
});

test('asset resolution uses the native manager and caches matching requests', async () => {
  let requests = 0;
  const resolver = createAssetResolver((...keys) => keys[0] === 'fetchAssetIds' ? {
    fetchAssetIds: async (id, images) => { requests++; assert.equal(id, appID); assert.deepEqual(images, ['pony']); return ['987654321']; },
  } : undefined);
  const results = await Promise.all([resolver(appID, 'pony'), resolver(appID, 'pony')]);
  assert.deepEqual(results, ['987654321', '987654321']); assert.equal(requests, 1);
  resolver.clear(); await resolver(appID, 'pony'); assert.equal(requests, 2);
});

test('HTTP fallback resolves external paths and application keys on fixed Discord routes', async () => {
  const requests = [];
  const http = {
    post: async request => { requests.push(request); return { body: [{ external_asset_path: 'https://media.discordapp.net/external/hash/https/example.com/a.png' }] }; },
    get: async request => { requests.push(request); return { body: [{ name: 'pony', id: '5678' }] }; },
  };
  const resolver = createAssetResolver((...keys) => keys[0] === 'get' ? http : undefined);
  assert.equal(await resolver(appID, 'https://example.com/a.png'), 'mp:external/hash/https/example.com/a.png');
  assert.equal(await resolver(appID, 'pony'), '5678');
  assert.deepEqual(requests, [
    { url: `/applications/${appID}/external-assets`, body: { urls: ['https://example.com/a.png'] } },
    { url: `/oauth2/applications/${appID}/assets` },
  ]);
  await assert.rejects(resolver('../users/@me', 'pony'), /Invalid application ID/);
  assert.equal(requests.length, 2);
});

test('failed asset lookups can retry, and stalled lookups time out', async () => {
  let attempt = 0;
  const resolver = createAssetResolver(() => undefined);
  await assert.rejects(resolver(appID, 'pony'));
  const retry = createAssetResolver((...keys) => keys[0] === 'fetchAssetIds' ? {
    fetchAssetIds: async () => { if (++attempt === 1) throw new Error('Temporary'); return ['1234']; },
  } : undefined);
  await assert.rejects(retry(appID, 'pony'));
  assert.equal(await retry(appID, 'pony'), '1234');
  const stalled = createAssetResolver(() => ({ fetchAssetIds: () => new Promise(() => {}) }), { timeout: 5 });
  await assert.rejects(stalled(appID, 'pony'), /timed out/);
});
