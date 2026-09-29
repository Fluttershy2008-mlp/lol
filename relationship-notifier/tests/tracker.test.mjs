import test from 'node:test';
import assert from 'node:assert/strict';
import { createTracker } from '../src/tracker.js';

const item = (id, name = id) => ({ id, name });
const snapshot = (overrides = {}) => ({
  accountId: 'me', friends: { a: item('a', 'Alice') }, requests: { b: item('b', 'Bob') },
  guilds: { c: item('c', 'Cloudsdale') }, groups: { d: item('d', 'Pony chat') },
  relationshipTypes: { a: 1, b: 3 }, unavailableIds: [], ...overrides,
});
function harness(storage = {}) {
  const delivered = [];
  let time = 1000;
  const tracker = createTracker({ storage, notify: events => delivered.push(...events), now: () => time });
  return { storage, delivered, tracker, advance: value => { time += value; } };
}

test('first install saves a baseline; removals notify once and keep names', () => {
  const { tracker, delivered } = harness();
  tracker.reconcile(snapshot(), { offline: true });
  assert.equal(delivered.length, 0);
  tracker.reconcile(snapshot({ friends: {}, requests: {}, guilds: {}, groups: {}, relationshipTypes: {} }));
  assert.equal(delivered.length, 4);
  assert.match(delivered[0].text, /Alice/);
  assert.match(delivered[2].text, /Cloudsdale/);
  tracker.reconcile(snapshot({ friends: {}, requests: {}, guilds: {}, groups: {}, relationshipTypes: {} }));
  assert.equal(delivered.length, 4);
  assert.equal(tracker.history().length, 4);
});

test('all four individual category switches disable alerts without replaying when re-enabled', () => {
  for (const [category, option] of [['friends', 'friends'], ['requests', 'friendRequestCancels'], ['guilds', 'servers'], ['groups', 'groups']]) {
    const { tracker, delivered } = harness();
    tracker.reconcile(snapshot()); tracker.setOption(option, false);
    tracker.reconcile(snapshot({ [category]: {}, relationshipTypes: {} }));
    tracker.setOption(option, true);
    tracker.reconcile(snapshot({ [category]: {}, relationshipTypes: {} }));
    assert.equal(delivered.length, 0, category);
  }
});

test('accepted, blocked and outgoing requests are not cancellations', () => {
  for (const type of [1, 2, 4]) {
    const { tracker, delivered } = harness();
    tracker.reconcile(snapshot());
    tracker.reconcile(snapshot({ requests: {}, relationshipTypes: { a: 1, b: type } }));
    assert.equal(delivered.length, 0);
  }
});

test('blocking a friend does not generate an unfriend alert', () => {
  const { tracker, delivered } = harness();
  tracker.reconcile(snapshot());
  tracker.reconcile(snapshot({ friends: {}, relationshipTypes: { a: 2, b: 3 } }));
  assert.equal(delivered.length, 0);
});

test('local removals, leaves and request rejection are suppressed independently', () => {
  const { tracker, delivered } = harness();
  tracker.reconcile(snapshot());
  tracker.markManual('relationships', 'a'); tracker.markManual('relationships', 'b');
  tracker.markManual('guilds', 'c'); tracker.markManual('groups', 'd');
  tracker.reconcile(snapshot({ friends: {}, requests: {}, guilds: {}, groups: {}, relationshipTypes: {} }));
  assert.equal(delivered.length, 0);
  assert.deepEqual(tracker.counts(), { friends: 0, requests: 0, guilds: 0, groups: 0 });
});

test('failed local actions remove their suppression; unrelated IDs still notify', () => {
  const { tracker, delivered } = harness();
  tracker.reconcile(snapshot());
  const failed = tracker.markManual('relationships', 'a');
  tracker.cancelManual(failed);
  tracker.markManual('relationships', 'someone-else');
  tracker.reconcile(snapshot({ friends: {}, relationshipTypes: { b: 3 } }));
  assert.equal(delivered.length, 1);
});

test('manual markers expire and successful local removals survive a restart', () => {
  const { tracker, storage, advance, delivered } = harness();
  tracker.reconcile(snapshot());
  tracker.markManual('relationships', 'a'); advance(120001);
  tracker.reconcile(snapshot({ friends: {}, relationshipTypes: { b: 3 } }));
  assert.equal(delivered.length, 1);
  tracker.completeManual(tracker.markManual('guilds', 'c'));
  const reloaded = harness(JSON.parse(JSON.stringify(storage)));
  reloaded.tracker.reconcile(snapshot({ friends: {}, guilds: {}, relationshipTypes: { b: 3 } }), { offline: true });
  assert.equal(reloaded.delivered.length, 0);
});

test('temporary guild outages preserve the baseline until recovery or confirmed loss', () => {
  const { tracker, delivered } = harness();
  tracker.reconcile(snapshot());
  tracker.reconcile(snapshot({ guilds: {}, unavailableIds: ['c'] }), { offline: true });
  assert.equal(delivered.length, 0);
  assert.equal(tracker.counts().guilds, 1);
  tracker.reconcile(snapshot());
  assert.equal(delivered.length, 0);
  tracker.reconcile(snapshot({ guilds: {} }));
  assert.equal(delivered.length, 1);
});

test('unavailable category data never wipes snapshots and late loads respect offline preference', () => {
  const { tracker, delivered } = harness();
  tracker.reconcile(snapshot()); tracker.setOption('offlineRemovals', false);
  tracker.reconcile(snapshot({ friends: null, requests: null }), { offline: true });
  assert.equal(tracker.counts().friends, 1);
  tracker.reconcile(snapshot({ friends: {}, requests: {}, relationshipTypes: {} }), { offline: ['friends', 'requests'] });
  assert.equal(delivered.length, 0);
  tracker.reconcile(snapshot({ friends: {}, requests: {}, guilds: {}, relationshipTypes: {} }), { offline: [] });
  assert.equal(delivered.length, 1);
});

test('offline changes use account-specific persisted snapshots and notify just once', () => {
  const first = harness();
  first.tracker.reconcile(snapshot());
  const next = harness(JSON.parse(JSON.stringify(first.storage)));
  const missing = snapshot({ friends: {}, relationshipTypes: { b: 3 } });
  next.tracker.reconcile({ ...missing, accountId: 'other-account' }, { offline: true });
  assert.equal(next.delivered.length, 0);
  next.tracker.reconcile(missing, { offline: true });
  assert.equal(next.delivered.length, 1);
  assert.equal(next.delivered[0].offline, true);
  next.tracker.reconcile(missing, { offline: true });
  assert.equal(next.delivered.length, 1);
  next.tracker.select('other-account'); assert.equal(next.tracker.history().length, 0);
  next.tracker.select('me'); assert.equal(next.tracker.history().length, 1);
});

test('history is capped, newest first, and clearing it preserves memberships', () => {
  const { tracker, advance } = harness();
  for (let i = 0; i < 105; i++) {
    advance(1); tracker.reconcile(snapshot());
    tracker.reconcile(snapshot({ friends: {}, relationshipTypes: { b: 3 } }));
  }
  assert.equal(tracker.history().length, 100);
  assert.ok(tracker.history()[0].at > tracker.history().at(-1).at);
  const counts = tracker.counts(); tracker.clearHistory();
  assert.equal(tracker.history().length, 0);
  assert.deepEqual(tracker.counts(), counts);
});

test('notification delivery failures do not lose history or replay removals', () => {
  let calls = 0;
  const tracker = createTracker({ storage: {}, notify: () => { calls++; throw new Error('UI unavailable'); } });
  tracker.reconcile(snapshot());
  assert.throws(() => tracker.reconcile(snapshot({ friends: {} })), /UI unavailable/);
  tracker.reconcile(snapshot({ friends: {} }));
  assert.equal(calls, 1); assert.equal(tracker.history().length, 1);
});
