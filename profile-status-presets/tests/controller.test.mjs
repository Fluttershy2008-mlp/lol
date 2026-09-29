import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/controller.js';

function setup() {
  let account = '100', current = null, time = 100000;
  const writes = [], storage = {};
  const discord = { account: () => account, currentStatus: () => current, update: async value => { writes.push(value); current = value; } };
  const c = createController({ storage, discord, now: () => time });
  c.start();
  const preset = c.save({ name: 'Gaming', text: 'Play', emoji: '🎮', clearAfter: '1h' }, null, '100');
  return { c, preset, writes, discord, storage, account: value => { account = value; }, time: value => { time = value; } };
}

test('save never applies; one tap applies; clear and disable preserve saved presets', async () => {
  const { c, preset, writes } = setup();
  assert.equal(writes.length, 0);
  await c.apply(preset.id, '100');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].text, 'Play');
  assert.equal(writes[0].expiresAtMs, 3700000);
  assert.match(c.getState().notice, /Applied/);
  assert.equal(c.capture('100').emoji, '🎮');
  await c.apply(null, '100');
  assert.equal(writes[1], null);
  assert.equal(c.getState().presets.length, 1);
  c.stop();
  assert.equal(writes.length, 2);
  assert.equal(c.getState().presets.length, 1);
});

test('account switches block stale apply, save, delete and capture', async () => {
  const { c, preset, writes, account } = setup();
  account('200');
  assert.equal(c.getState().presets.length, 0);
  await assert.rejects(c.apply(preset.id, '100'), /account changed/);
  assert.throws(() => c.save({ name: 'Old draft' }, null, '100'), /account changed/);
  assert.throws(() => c.remove(preset.id, '100'), /account changed/);
  assert.throws(() => c.capture('100'), /account changed/);
  assert.equal(writes.length, 0);
  account('100');
  assert.equal(c.getState().presets.length, 1);
});

test('prevents concurrent requests and handles completion after unload', async () => {
  const { c, preset, discord } = setup();
  let resolve;
  discord.update = () => new Promise(done => { resolve = done; });
  const first = c.apply(preset.id, '100');
  assert.equal(c.getState().busy, true);
  await assert.rejects(c.apply(preset.id, '100'), /in progress/);
  c.stop();
  resolve(); await first;
  assert.equal(c.getState().busy, false);
  assert.equal(c.getState().notice, '');
  await assert.rejects(c.apply(preset.id, '100'), /Enable/);
});

test('Discord errors stay errors; rate limits do not trigger retries or lose presets', async () => {
  const { c, preset, discord, time } = setup();
  let requests = 0;
  discord.update = async () => { requests++; throw Object.assign(new Error('limited'), { status: 429, body: { retry_after: 12 } }); };
  await assert.rejects(c.apply(preset.id, '100'), /12 seconds/);
  assert.match(c.getState().error, /limiting/);
  assert.equal(c.getState().notice, '');
  assert.equal(c.getState().presets.length, 1);
  await assert.rejects(c.apply(preset.id, '100'), /wait 12/);
  assert.equal(requests, 1);
  time(113000);
  discord.update = async () => { requests++; };
  await c.apply(preset.id, '100');
  assert.equal(requests, 2);
  assert.equal(c.getState().error, '');
});
