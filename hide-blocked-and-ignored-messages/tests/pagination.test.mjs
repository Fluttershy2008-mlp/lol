import test from 'node:test';
import assert from 'node:assert/strict';
import { createPagination } from '../src/pagination.js';

const hidden = id => Object.freeze({ id, author: { id: 'blocked' } });
const visible = id => Object.freeze({ id, author: { id: 'friend' } });
function setup(fetch) {
  const collection = { _array: [hidden('300')], hasMoreBefore: true, hasMoreAfter: false, ready: true };
  let selected = 'channel', serial = 0;
  const timers = new Map(), requests = [];
  const paging = createPagination({ getMessages: () => collection,
    shouldHide: row => row.author.id === 'blocked', selectedChannel: () => selected,
    fetchMessages(options) { requests.push(options); return fetch?.(options, collection); },
    setTimer(fn) { timers.set(++serial, fn); return serial; },
    clearTimer(id) { timers.delete(id); } });
  const tick = async () => {
    for (const [id, fn] of [...timers]) { timers.delete(id); fn(); }
    await Promise.resolve();
  };
  return { paging, collection, requests, timers, tick, select: id => { selected = id; } };
}

test('hidden history automatically advances from the raw oldest ID and stops when visible content arrives', async () => {
  const h = setup((options, collection) => {
    collection._array.unshift(options.before === '300' ? hidden('200') : visible('100'));
  });
  h.paging.consider('channel'); h.paging.consider('channel');
  assert.equal(h.timers.size, 1);
  await h.tick(); await h.tick(); await h.tick();
  assert.deepEqual(h.requests.map(r => r.before), ['300', '200']);
  assert.deepEqual(h.requests[0], { channelId: 'channel', before: '300', limit: 50 });
  assert.equal(h.timers.size, 0);
});

test('no-progress pages and failures never loop; explicit native loads allow another bounded attempt', async () => {
  const h = setup();
  h.paging.consider('channel'); await h.tick();
  for (let n = 0; n < 10; n++) {
    h.paging.observe({ type: 'LOAD_MESSAGES_SUCCESS', channelId: 'channel' });
    h.paging.consider('channel'); await h.tick();
  }
  assert.equal(h.requests.length, 1);
  const ticket = h.paging.manualRequest({ channelId: 'channel' });
  h.paging.finishRequest(ticket);
  h.paging.consider('channel'); await h.tick();
  assert.equal(h.requests.length, 2);
  for (const fail of [() => { throw Error('offline'); }, () => Promise.reject(Error('429'))]) {
    const f = setup(fail);
    f.paging.consider('channel'); await f.tick();
    f.collection._array.unshift(hidden('200'));
    f.paging.consider('channel'); await f.tick();
    assert.equal(f.requests.length, 1);
    assert.equal(f.timers.size, 0);
  }
});

test('a pending manual native request prevents automatic duplicates and late completions cannot unlock another request', async () => {
  const h = setup();
  const first = h.paging.manualRequest({ channelId: 'channel', before: '300' });
  h.paging.consider('channel'); await h.tick(); assert.equal(h.requests.length, 0);
  const second = h.paging.manualRequest({ channelId: 'channel', before: '300' });
  h.paging.finishRequest(first);
  h.paging.consider('channel'); await h.tick(); assert.equal(h.requests.length, 0);
  h.paging.finishRequest(second);
  await h.tick(); assert.equal(h.requests.length, 1);
});

test('a fully hidden older batch continues even when newer visible messages are already cached', async () => {
  const h = setup((_options, c) => c._array.unshift(visible('100')));
  h.collection._array = [hidden('200'), visible('300')];
  h.paging.manualRequest({ channelId: 'channel', before: '300' });
  h.paging.observe({ type: 'LOAD_MESSAGES_SUCCESS', channelId: 'channel', messages: [hidden('200')] });
  await h.tick();
  assert.equal(h.requests[0].before, '200');
  h.paging.observe({ type: 'LOAD_MESSAGES_SUCCESS', channelId: 'channel', messages: [visible('100')] });
  await h.tick();
  assert.equal(h.requests.length, 1);
});

test('automatic loading is limited to five pages in the selected channel at the latest history edge', async () => {
  let cursor = 300;
  const h = setup((_options, c) => c._array.unshift(hidden(String(--cursor))));
  h.paging.consider('channel');
  for (let n = 0; n < 10; n++) { await h.tick(); h.paging.consider('channel'); }
  assert.equal(h.requests.length, 5);
  for (const flags of [
    { hasMoreBefore: false }, { hasMoreBefore: undefined }, { hasMoreAfter: true },
    { loadingMore: true }, { loadingMoreBefore: true }, { loadingMoreAfter: true },
    { loading: true }, { isLoading: true }, { ready: false },
  ]) {
    const f = setup(); Object.assign(f.collection, flags);
    f.paging.consider('channel'); await f.tick(); assert.equal(f.requests.length, 0);
  }
  const f = setup();
  f.paging.consider('background'); await f.tick(); assert.equal(f.requests.length, 0);
  f.paging.consider('channel'); f.select('other'); await f.tick(); assert.equal(f.requests.length, 0);
});

test('boundary cursor repair uses numeric snowflake order, preserves frozen input, arbitrary anchors and jumps', () => {
  const h = setup();
  h.collection._array = [hidden('1000'), visible('100'), hidden('99'), visible('200')];
  const before = Object.freeze({ channelId: 'channel', before: '100', limit: 25, custom: true });
  assert.deepEqual(h.paging.repairOptions(before), { ...before, before: '99' });
  assert.equal(before.before, '100');
  const after = Object.freeze({ channelId: 'channel', after: '200' });
  assert.deepEqual(h.paging.repairOptions(after), { ...after, after: '1000' });
  for (const options of [
    { before: '150' }, { before: '99' }, {}, { before: '100', jump: { messageId: '100' } },
    { before: '100', around: '100' }, { before: '100', messageId: '100' },
    { before: '100', jumpToMessageId: '100' }, { before: '100', after: '200' },
  ]) {
    const input = Object.freeze({ channelId: 'channel', ...options });
    assert.equal(h.paging.repairOptions(input), input);
  }
});

test('native cursor reads and display subscriptions have separate synchronous scopes, including throws', () => {
  const { paging } = setup();
  assert.equal(paging.isNative(), false);
  assert.throws(() => paging.runNative(() => {
    assert.equal(paging.isNative(), true);
    paging.runDisplay(() => assert.equal(paging.isNative(), false));
    assert.equal(paging.isNative(), true);
    throw Error('native failed');
  }));
  assert.equal(paging.isNative(), false);
});

test('channel/account changes and unloading cancel pending work and ignore late promises', async () => {
  for (const type of ['CHANNEL_SELECT', 'LOGOUT', 'CONNECTION_OPEN']) {
    const h = setup(); h.paging.consider('channel');
    h.paging.observe({ type }); await h.tick(); assert.equal(h.requests.length, 0);
  }
  let finish;
  const h = setup(() => new Promise(resolve => { finish = resolve; }));
  h.paging.consider('channel'); await h.tick();
  h.collection._array.unshift(hidden('200'));
  h.paging.stop(); finish(); await Promise.resolve(); await h.tick();
  assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
  const pending = setup(); pending.paging.consider('channel'); pending.paging.stop();
  await pending.tick(); assert.equal(pending.requests.length, 0);
});
