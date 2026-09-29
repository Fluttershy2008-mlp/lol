import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { GifReader } from 'omggif';
import { gifFixture } from './gif-fixture.mjs';

test('installed bundle preserves GIF imports, animation and uploads in Hermes', { skip: !process.env.HERMES_BINARY }, () => {
  const ready = gifFixture({ width: 320, height: 320 });
  const fixtures = [
    { name: 'resize', data: gifFixture(), frames: 2 },
    { name: 'direct', data: ready, frames: 2 },
    { name: 'trailing bytes', data: Uint8Array.from([...ready, 0, 10]), frames: 2 },
    { name: 'restore disposal', data: gifFixture({ width: 32, height: 32, frames: [
      { color: 1, disposal: 1 },
      { width: 16, height: 32, color: 2, disposal: 3 },
      { x: 16, width: 16, height: 32, color: 3 },
    ] }), frames: 3 },
  ].map(f => ({ ...f, base64: Buffer.from(f.data).toString('base64'), bytes: f.data.length }));
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const harness = readFileSync(new URL('./hermes-harness.js', import.meta.url), 'utf8');
  const directory = mkdtempSync(join(tmpdir(), 'save-as-sticker-hermes-'));
  try {
    const path = join(directory, 'runtime.js');
    writeFileSync(path, 'var pluginSource=' + JSON.stringify(source) + ';\nvar fixtures='
      + JSON.stringify(fixtures.map(({ data, ...f }) => f)) + ';\n' + harness);
    const run = spawnSync(process.env.HERMES_BINARY, ['-w', '-Xmicrotask-queue', '-time-limit=15000', path], {
      encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024,
    });
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr + run.stdout);
    assert.doesNotMatch(run.stdout, /HERMES_FAILURE/, run.stdout);
    const results = run.stdout.split('\n').filter(line => line.startsWith('HERMES_RESULT ')).map(line => JSON.parse(line.slice(14)));
    assert.equal(results.length, fixtures.length, run.stdout);
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      assert.deepEqual(result.alerts, [], result.name);
      assert.equal(result.posts.length, 1, result.name + ': upload must happen once');
      assert.equal(result.posts[0].mimeType, 'image/gif');
      assert.match(result.posts[0].uri, /-sticker.gif$/);
      assert.equal(result.deletes.length, 1);
      assert.ok(result.toasts.includes('Sticker added to Test server'));
      const reader = new GifReader(Buffer.from(result.writes[0].data, 'base64'));
      assert.equal(reader.width, 320); assert.equal(reader.height, 320);
      assert.equal(reader.numFrames(), fixtures[i].frames);
      const rgba = new Uint8Array(320 * 320 * 4);
      reader.decodeAndBlitFrameRGBA(reader.numFrames() - 1, rgba);
      const pixel = (x, y) => [...rgba.slice((y * 320 + x) * 4, (y * 320 + x) * 4 + 4)];
      if (result.name === 'restore disposal') {
        assert.deepEqual(pixel(80, 160), [255, 0, 0, 255]);
        assert.deepEqual(pixel(240, 160), [0, 0, 255, 255]);
      } else {
        assert.deepEqual(pixel(160, 160), [0, 255, 0, 255]);
        assert.equal(reader.frameInfo(1).delay, 15);
        if (result.name === 'resize') assert.equal(pixel(160, 0)[3], 0);
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
