import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchScope } from '../src/search.js';

test('search result and autocomplete actions enable only synchronous search exclusions', () => {
  const scope = createSearchScope();
  for (const type of ['SEARCH_MESSAGES_SUCCESS', 'SEARCH_FINISH', 'SEARCH_AUTOCOMPLETE_QUERY_UPDATE']) {
    assert.equal(scope.dispatch({ type }, () => scope.active()), true);
    assert.equal(scope.active(), false);
  }
  for (const type of ['MESSAGE_CREATE', 'LOAD_MESSAGES_SUCCESS', 'RELATIONSHIP_ADD', 'SEARCH_MESSAGES_START']) {
    assert.equal(scope.dispatch({ type }, () => scope.active()), false);
  }
});

test('nested unrelated dispatches keep real blocking and restore the outer search scope', () => {
  const scope = createSearchScope();
  scope.dispatch({ type: 'SEARCH_MESSAGES_SUCCESS' }, () => {
    assert.equal(scope.active(), true);
    scope.dispatch({ type: 'MESSAGE_CREATE' }, () => {
      assert.equal(scope.active(), false);
      scope.dispatch({ type: 'SEARCH_FINISH' }, () => assert.equal(scope.active(), true));
      assert.equal(scope.active(), false);
    });
    assert.equal(scope.active(), true);
  });
  assert.equal(scope.active(), false);
});

test('autocomplete render scope preserves exact return values and restores on exceptions', () => {
  const scope = createSearchScope(), result = Object.freeze({ result: true });
  assert.equal(scope.run(() => { assert.equal(scope.active(), true); return result; }), result);
  assert.equal(scope.active(), false);
  assert.throws(() => scope.run(() => { throw Error('render failed'); }));
  assert.equal(scope.active(), false);
  assert.throws(() => scope.dispatch({ type: 'SEARCH_MESSAGES_SUCCESS' }, () => { throw Error('store failed'); }));
  assert.equal(scope.active(), false);
});

test('search scopes never leak into deferred work or promises', async () => {
  const scope = createSearchScope();
  const result = scope.run(() => Promise.resolve().then(() => scope.active()));
  assert.equal(scope.active(), false);
  assert.equal(await result, false);
});
