import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeLink, findYouTubeLinks, readScriptJSON, createYouTubeResolver, feedVideos, feedRoots, oldestControl, feedContinuation } from '../src/youtube.mjs';
import { CHANNEL, OTHER_CHANNEL, IDS, transport, grid, sorted, tile, home, chip, html, response, player, script } from './fixtures.mjs';

test('sharing links, mobile hosts, handles and legacy URLs normalise safely', () => {
  for (const input of ['https://youtube.com/@mobilelegends5v5moba?si=nMO4_CUOKa5VUi4b', 'https://m.youtube.com/@mobilelegends5v5moba/videos', '@mobilelegends5v5moba']) {
    assert.deepEqual(parseYouTubeLink(input), { kind: 'channel', url: 'https://www.youtube.com/@mobilelegends5v5moba' });
  }
  assert.equal(parseYouTubeLink(`https://youtube.com/channel/${CHANNEL}/streams`).kind, 'channel');
  assert.equal(parseYouTubeLink('https://youtube.com/user/Test/videos?sort=da').url, 'https://www.youtube.com/user/Test');
  for (const input of [`https://youtu.be/${IDS.video}?si=xxx`, `https://youtube.com/watch?si=xxx&v=${IDS.video}`, `https://youtube.com/shorts/${IDS.video}`])
    assert.equal(parseYouTubeLink(input).url, `https://www.youtube.com/watch?v=${IDS.video}`);
});

test('invalid domains, playlists, malformed encodings and IDs are rejected', () => {
  for (const input of ['https://youtube.com.evil.test/@Foo', 'https://notyoutube.com/@Foo', 'https://youtube.com/playlist?list=123',
    'https://youtube.com/channel/UCwrong', 'https://youtube.com/@%ZZ', 'https://youtube.com/watch?v=wrong', 'https://youtu.be/../@Foo'])
    assert.throws(() => parseYouTubeLink(input));
  assert.equal(findYouTubeLinks('https://notyoutube.com/@Foo').length, 0);
});

test('message extraction supports Markdown and deduplicates shared URLs', () => {
  const links = findYouTubeLinks('See [MLBB](https://youtube.com/@Foo?si=abc), then <https://youtube.com/@Foo>.');
  assert.deepEqual(links.map(x => x.url), ['https://www.youtube.com/@Foo']);
});

test('balanced JSON parsing handles braces and escapes inside a video title', () => {
  const data = { title: 'A } title with "quotes" and \\ braces {' };
  assert.deepEqual(readScriptJSON(script('ytInitialData', data) + script('other', { wrong: true }), 'ytInitialData'), data);
  assert.deepEqual(readScriptJSON('ytcfg.set({"a":1}); ytcfg.set({"b":2});', 'ytcfg'), { a: 1, b: 2 });
  assert.equal(readScriptJSON('consent required', 'ytInitialData'), null);
});

test('2026 lockups, Shorts, and dropdown Oldest commands parse without menu contamination', () => {
  assert.equal(feedVideos(feedRoots(sorted('video')))[0].id, IDS.video);
  assert.equal(feedVideos(feedRoots(sorted('Short')))[0].id, IDS.Short);
  const dropdown = { listItemViewModel: { title: { content: 'Oldest' }, rendererContext: { commandContext: {
    onTap: { innertubeCommand: { continuationCommand: { token: 'sort-dropdown' } } },
  } } } };
  assert.deepEqual(oldestControl([dropdown]).payload, { continuation: 'sort-dropdown' });
  const content = grid('video');
  assert.equal(feedContinuation([content]), undefined, 'sort tokens are not page tokens');
  content.richGridRenderer.contents.push({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'next-page' } } } });
  assert.equal(feedContinuation([content]), 'next-page');
});

test('compares exact oldest publication dates across all three tabs', async () => {
  const requests = [];
  const result = await createYouTubeResolver(transport({ observe: (url, init) => requests.push({ url, init }) })).lookup('@mobilelegends5v5moba');
  assert.equal(result.id, IDS.video);
  assert.equal(result.date, '2017-03-29');
  assert.deepEqual(result.checked, ['videos', 'shorts', 'streams']);
  assert.equal(result.channel, 'Mobile Legends: Bang Bang');
  assert.equal(requests.filter(x => x.url.includes('/youtubei/')).length, 3, 'actually sends all three Oldest commands');
  for (const { url, init } of requests) {
    assert.ok(url.startsWith('https://www.youtube.com/'));
    assert.equal(init.credentials, 'omit');
    assert.equal(init.headers.Authorization, undefined);
  }
});

test('a video URL resolves its own uploader before sorting channel uploads', async () => {
  const result = await createYouTubeResolver(transport()).lookup(`https://youtu.be/${IDS.Short}`);
  assert.equal(result.id, IDS.video);
});

test('never substitutes the latest feed if the Oldest response is malformed', async () => {
  const resolver = createYouTubeResolver(transport({ mutate: (data, stage) => stage === 'sorted' ? {} : data }));
  await assert.rejects(resolver.lookup('@Foo'), /did not return its oldest/);
});

test('an empty oldest response cannot silently drop a populated channel tab', async () => {
  const resolver = createYouTubeResolver(transport({ mutate: (data, stage, kind) => stage === 'sorted' ? sorted(kind, []) : data }));
  await assert.rejects(resolver.lookup('@Foo'), /empty oldest/);
});

test('an unsorted paginated feed fails without claiming a partial first video', async () => {
  let watches = 0;
  const resolver = createYouTubeResolver(transport({
    observe: url => { if (url.includes('/watch?')) watches++; },
    mutate(data, stage, kind) {
      if (stage === 'page' && kind === 'video') {
        const content = grid('video', false, [tile('video'), { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'page2' } } } }]);
        delete content.richGridRenderer.header;
        return home('videos', content);
      }
      return data;
    },
  }));
  await assert.rejects(resolver.lookup('@Foo'), /did not offer an Oldest filter/);
  assert.equal(watches, 0);
});

test('unavailable dates or cross-channel candidates prevent a false result', async () => {
  await assert.rejects(createYouTubeResolver(transport({ mutate: (data, stage, kind) => stage === 'player' && kind === 'Short'
    ? player(kind, { publishDate: null }) : data })).lookup('@Foo'), /confirm an upload date/);
  await assert.rejects(createYouTubeResolver(transport({ mutate(data, stage) {
    if (stage === 'player') { data.videoDetails.channelId = OTHER_CHANNEL; }
    return data;
  } })).lookup('@Foo'), /another channel/);
});

test('the earliest Short wins when it predates the oldest regular video', async () => {
  const result = await createYouTubeResolver(transport({ mutate: (data, stage, kind) => stage === 'player' && kind === 'Short'
    ? player(kind, { publishDate: '2016-01-01T00:00:00Z' }) : data })).lookup('@Foo');
  assert.equal(result.kind, 'Short');
});

test('cancellation, timeouts and rate limits surface correctly', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createYouTubeResolver(transport()).lookup('@Foo', { signal: controller.signal }), { name: 'AbortError' });
  const slow = createYouTubeResolver(() => new Promise(() => {}), { timeout: 10 });
  await assert.rejects(slow.lookup('@Foo'), /too long/);
  await assert.rejects(createYouTubeResolver(async () => ({ ok: false, status: 429 })).lookup('@Foo'), /limiting requests/);
});
