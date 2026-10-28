import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIDs, guildRows, makePlan, samePlan, runQueue } from '../src/model.mjs';
import { MAIN_PROTECTED_IDS } from '../src/main-protection.mjs';
import { readFileSync } from 'node:fs';
const MAIN = JSON.parse(readFileSync(new URL('./main-ids.json', import.meta.url), 'utf8'));
const account = '322423286283632660', other = '422423286283632660';
const A = '100000000000000001', B = '100000000000000002', C = '100000000000000003';
const row = (id, owner = other, extras = {}) => ({ id, name: id, owner, ...extras });
const plan = (rows = [row(A), row(B), row(C)], ids = A) => makePlan(rows, account, ids);
async function run(overrides = {}) {
  const calls = [];
  const result = await runQueue({ plan: plan(), alive: () => true, getRows: () => [row(A), row(B), row(C)],
    getIDs: () => A, leave: async id => { calls.push(id); return { status: 204 }; }, wait: async () => {}, update: () => {}, ...overrides });
  return { calls, result };
}
test('full snowflake strings stay exact; mixed separators and duplicates work', () => {
  assert.deepEqual(parseIDs(`${A}, ${B}\n${A};${C}`), [A, B, C]);
  assert.deepEqual(parseIDs(''), []);
  for (const input of ['123', `https://discord.com/channels/${A}`, `${A} junk`, '1e18', '010000000000000001']) assert.throws(() => parseIDs(input));
});
test('GuildStore objects and Maps normalize owner fields without precision loss', () => {
  for (const raw of [{ [A]: { id: A, name: 'A', owner_id: other } }, new Map([[A, { id: A, name: 'A', ownerId: other }]])]) {
    assert.deepEqual(guildRows({ getGuilds: () => raw }), [{ id: A, name: 'A', owner: other, unavailable: false }]);
  }
  assert.throws(() => guildRows({ getGuilds: () => null }));
});
test('protected, owned, unavailable and unknown ownership servers stay', () => {
  const p = plan([row(A), row(B, account), row(C, other, { unavailable: true }), row('100000000000000004', undefined, { owner: undefined })]);
  assert.equal(p.targets.length, 0); assert.equal(p.kept.length, 4);
});
test('unknown protected ID blocks the plan instead of silently losing protection', () => {
  assert.throws(() => plan([row(A)], B), /not in your server list/);
  assert.throws(() => makePlan([row(A)], '', A), /account/);
});
test('server additions and protection changes invalidate confirmation', () => {
  assert.equal(samePlan(plan(), plan()), true);
  assert.equal(samePlan(plan(), plan([row(A), row(B)])), false);
  assert.equal(samePlan(plan(), plan(undefined, `${A}\n${B}`)), false);
});
test('queue leaves only unprotected targets and confirms success', async () => {
  const { calls, result } = await run(); assert.deepEqual(calls, [B, C]); assert.equal(result.left.length, 2);
});
test('live protections and ownership are rechecked before each request', async () => {
  const calls = [];
  const { result } = await run({ getIDs: () => `${A}\n${B}`, getRows: () => [row(A), row(B), row(C, account)],
    leave: async id => { calls.push(id); return { status: 204 }; } });
  assert.deepEqual(calls, []); assert.equal(result.skipped.length, 2);
});
test('newly joined servers are excluded from the confirmed snapshot', async () => {
  const { calls } = await run({ getRows: () => [row(A), row(B), row(C), row('100000000000000004')] });
  assert.deepEqual(calls, [B, C]);
});
test('Stop during an in-flight request prevents the next leave', async () => {
  let live = true;
  const { result } = await run({ alive: () => live, leave: async () => { live = false; return { status: 204 }; } });
  assert.equal(result.left.length, 1); assert.match(result.stopped, /Stopped/);
});
test('disabled/account-changed queue makes no request', async () => {
  assert.deepEqual((await run({ alive: () => false })).calls, []);
});
test('429, 403, unknown success and network rejection stop with no retry', async () => {
  for (const response of [{ status: 429 }, { status: 403 }, undefined, { ok: true }]) {
    let calls = 0;
    const { result } = await run({ leave: async () => { calls++; return response; } });
    assert.equal(calls, 1); assert.equal(result.failed.length, 1); assert.equal(result.left.length, 0);
  }
  let calls = 0;
  const { result } = await run({ leave: async () => { calls++; throw new Error('Network offline'); } });
  assert.equal(calls, 1); assert.match(result.failed[0].error, /offline/);
});
test('server cache failure mid-run stops without sending a request', async () => {
  const { calls, result } = await run({ getRows: () => { throw new Error('Store unavailable'); } });
  assert.deepEqual(calls, []); assert.match(result.stopped, /unavailable/);
});
test('requests never overlap', async () => {
  let running = 0, max = 0;
  await run({ leave: async () => { running++; max = Math.max(max, running); await Promise.resolve(); running--; return { status: 204 }; } });
  assert.equal(max, 1);
});

test('all 22 requested main IDs stay exact and are kept with an empty editable list', () => {
  assert.deepEqual(MAIN_PROTECTED_IDS, MAIN);
  const p = makePlan([...MAIN.map(id => row(id)), row(B)], account, '');
  assert.deepEqual(p.kept.map(item => item.id), MAIN);
  assert.ok(p.kept.every(item => item.reason === 'Main protected'));
  assert.deepEqual(p.targets.map(item => item.id), [B]);
});

test('main IDs absent from an account do not block preview; unknown additional IDs still do', () => {
  const p = makePlan([row(A)], account, MAIN.join('\n'));
  assert.deepEqual(p.targets.map(item => item.id), [A]);
  assert.throws(() => makePlan([row(A)], account, MAIN.join('\n') + '\n' + B), /not in your server list/);
});

test('the queue independently protects main IDs even if a supplied plan or saved list omits them', async () => {
  const rows = [...MAIN.map(id => row(id)), row(B)], calls = [];
  const result = await runQueue({ plan: { account, ids: [], targets: rows, kept: [] }, alive: () => true,
    getRows: () => rows, getIDs: () => '', leave: async id => { calls.push(id); return { status: 204 }; },
    wait: async () => {}, update() {} });
  assert.deepEqual(calls, [B]); assert.deepEqual(result.skipped.map(item => item.id), MAIN);
});
