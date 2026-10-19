import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeID, appEntries, shouldHideAppMessage } from '../src/apps.mjs';
import { createCollectionFilter } from '../src/collection.mjs';

const APP = '100000000000000002';
const OTHER = '100000000000000003';
const rules = [{ id: APP, name: '' }];

test('raw and mention IDs preserve snowflakes; other copied text is rejected', () => {
  for (const text of [APP, ` ${APP}\n`, `<@${APP}>`, `<@!${APP}>`]) assert.equal(normalizeID(text), APP);
  for (const text of [Number(APP), null, '123', `<@${APP}> junk`, `https://discord.com/users/${APP}`]) assert.equal(normalizeID(text), '');
});

test('matches own author, webhook and application ID in API and normalized records', () => {
  for (const message of [{ author: { id: APP } }, { authorId: APP }, { author_id: APP },
    { webhook_id: APP }, { webhookId: APP }, { application_id: APP }, { applicationId: APP }, { application: { id: APP } }]) {
    assert.equal(shouldHideAppMessage(message, rules), true);
  }
});

test('mentions, replies, interaction initiators and identical names do not match an unrelated ID', () => {
  for (const message of [
    { author: { id: OTHER, username: 'Allo' } },
    { author: { id: OTHER }, mentions: [{ id: APP }] },
    { author: { id: OTHER }, referenced_message: { author: { id: APP } } },
    { author: { id: OTHER }, interaction_metadata: { user: { id: APP } } },
  ]) assert.equal(shouldHideAppMessage(message, [{ id: APP, name: 'Allo' }]), false);
  assert.equal(shouldHideAppMessage({ author: { id: APP, username: 'Allo' } }, [{ id: APP, name: 'Allo' }]), true);
  assert.equal(shouldHideAppMessage({ author: { id: APP, username: 'Other' } }, [{ id: APP, name: 'Allo' }]), false);
});

test('malformed saved data is ignored without rewriting stored account data', () => {
  const storage = { appBlocksByAccount: { account: [null, { id: APP }, { id: 'bad', name: '' },
    { id: APP, name: 'Allo' }, { id: APP, name: 'x'.repeat(129) }], other: 'bad' } };
  assert.deepEqual(appEntries(storage, 'account'), [{ id: APP, name: 'Allo' }]);
  assert.deepEqual(appEntries(storage, 'other'), []);
  assert.deepEqual(appEntries(storage, 'missing'), []);
  assert.equal(storage.appBlocksByAccount.account.length, 5);
});

test('frozen channel collections retain prototype, map consistency and pagination after filtering', () => {
  class Messages {
    constructor(rows) {
      this._array = Object.freeze(rows);
      this._map = new Map(rows.map(message => [message.id, message]));
      this.hasMoreBefore = true; this.loadingMore = false;
    }
    toArray() { return this._array; }
  }
  const hidden = Object.freeze({ id: 'hidden', author: { id: APP } });
  const shown = Object.freeze({ id: 'shown', author: { id: OTHER } });
  const collection = Object.freeze(new Messages([hidden, shown]));
  let enabled = true;
  const filter = createCollectionFilter(message => enabled && shouldHideAppMessage(message, rules));
  const result = filter.project(collection);
  assert.ok(result instanceof Messages);
  assert.deepEqual(result.toArray(), [shown]);
  assert.deepEqual([...result._map.keys()], ['shown']);
  assert.equal(result.hasMoreBefore, true);
  assert.equal(result.loadingMore, false);
  assert.equal(filter.project(collection), result, 'unchanged reads reuse the projected collection');
  assert.equal(collection._map.size, 2);
  assert.equal(collection._array.length, 2);
  enabled = false;
  assert.equal(filter.project(collection), collection);
});

test('fully hidden pages and object maps remain valid; unsupported shapes are preserved', () => {
  const hidden = Object.freeze({ id: 'hidden', author: { id: APP } });
  const collection = { _array: [hidden], _map: { hidden }, hasMoreAfter: true };
  const filter = createCollectionFilter(message => shouldHideAppMessage(message, rules));
  const view = filter.project(collection);
  assert.equal(view._array.length, 0);
  assert.deepEqual(Object.keys(view._map), []);
  assert.equal(view.hasMoreAfter, true);
  assert.equal(collection._map.hidden, hidden);
  let warnings = 0;
  const unsupported = { data: [] };
  assert.equal(createCollectionFilter(() => true, () => warnings++).project(unsupported), unsupported);
  assert.equal(warnings, 1);
});
