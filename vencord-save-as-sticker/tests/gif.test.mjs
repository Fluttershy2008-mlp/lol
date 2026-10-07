import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GifReader } from 'omggif';
import { prepareGIF, isGIF, encodeVideoFrames } from '../saveAsSticker/gif.js';
import { gifFixture } from './gif-fixture.mjs';

const base64 = bytes => Buffer.from(bytes).toString('base64');
const pixel = (rgba, x, y) => [...rgba.slice((y * 320 + x) * 4, (y * 320 + x) * 4 + 4)];
const red = [255, 0, 0, 255], green = [0, 255, 0, 255], blue = [0, 0, 255, 255], clear = [0, 0, 0, 0];

test('video frame encoder preserves rounded duration and checks cancellation between frames', async () => {
  const frame = new Uint8ClampedArray(320 * 320 * 4);
  frame.set(red, (160 * 320 + 160) * 4);
  const bytes = await encodeVideoFrames(3, 110, async () => frame);
  const gif = new GifReader(bytes);
  assert.equal(gif.numFrames(), 3);
  assert.deepEqual([0, 1, 2].map(i => gif.frameInfo(i).delay), [4, 3, 4]);
  assert.equal(gif.loopCount(), 0);
  let read = 0;
  await assert.rejects(encodeVideoFrames(3, 110, async () => { read++; return frame; }, () => {
    if (read === 1) throw new Error('cancelled');
  }), /cancelled/);
  assert.equal(read, 1);
  await assert.rejects(encodeVideoFrames(126, 5000, async () => frame), /5 seconds/);
  await assert.rejects(encodeVideoFrames(1, 5010, async () => frame), /5 seconds/);
  await assert.rejects(encodeVideoFrames(1, 40, async () => new Uint8Array(4)), /decode/);
});
async function convert(options) {
  const result = await prepareGIF(base64(gifFixture(options)));
  const bytes = Buffer.from(result.base64, 'base64'), reader = new GifReader(bytes);
  assert.equal(result.mimeType, 'image/gif');
  assert.equal(reader.width, 320); assert.equal(reader.height, 320);
  assert.ok(bytes.length <= 512 * 1024);
  const frames = Array.from({ length: reader.numFrames() }, (_, i) => {
    const rgba = new Uint8Array(320 * 320 * 4);
    reader.decodeAndBlitFrameRGBA(i, rgba);
    return rgba;
  });
  return { reader, frames, bytes };
}

test('GIF resizing keeps every frame, timing, looping, aspect ratio and transparent padding', async () => {
  const { reader, frames } = await convert();
  assert.equal(reader.numFrames(), 2); assert.equal(reader.loopCount(), 0);
  assert.deepEqual([reader.frameInfo(0).delay, reader.frameInfo(1).delay], [10, 15]);
  assert.deepEqual(pixel(frames[0], 160, 160), red);
  assert.deepEqual(pixel(frames[1], 160, 160), green);
  for (const rgba of frames) {
    assert.deepEqual(pixel(rgba, 160, 79), clear);
    assert.equal(pixel(rgba, 160, 80)[3], 255);
    assert.equal(pixel(rgba, 160, 239)[3], 255);
    assert.deepEqual(pixel(rgba, 160, 240), clear);
  }
});

test('partial frames compose correctly for keep, clear and restore-previous disposal', async () => {
  for (const disposal of [1, 2, 3]) {
    const { frames } = await convert({ width: 32, height: 32, frames: [
      { color: 1, disposal: 1 },
      { x: 0, y: 0, width: 16, height: 32, color: 2, disposal },
      { x: 16, y: 0, width: 16, height: 32, color: 3 },
    ] });
    assert.equal(frames.length, 3);
    assert.deepEqual(pixel(frames[0], 80, 160), red);
    assert.deepEqual(pixel(frames[1], 80, 160), green);
    assert.deepEqual(pixel(frames[1], 240, 160), red);
    assert.deepEqual(pixel(frames[2], 80, 160), disposal === 1 ? green : disposal === 2 ? clear : red);
    assert.deepEqual(pixel(frames[2], 240, 160), blue);
  }
});

test('ready-to-upload GIF is preserved byte-for-byte, including original palette and timing', async () => {
  const original = base64(gifFixture({ width: 320, height: 320, loop: 3 }));
  assert.equal(isGIF(original), true);
  const result = await prepareGIF(original);
  assert.equal(result.base64, original);
  assert.equal(result.mimeType, 'image/gif');
  assert.equal(isGIF('iVBORw0KGgo='), false);
});

test('finite and non-looping animations retain their loop settings', async () => {
  for (const loop of [null, 2]) assert.equal((await convert({ loop })).reader.loopCount(), loop);
});

test('five-second boundary is accepted, longer GIFs and excessive frame counts are rejected', async () => {
  const five = base64(gifFixture({ frames: [{ delay: 250 }, { delay: 250 }] }));
  assert.equal((await prepareGIF(five)).mimeType, 'image/gif');
  await assert.rejects(prepareGIF(base64(gifFixture({ frames: [{ delay: 250 }, { delay: 251 }] }))), /5 seconds/);
  await assert.rejects(prepareGIF(base64(gifFixture({ width: 1, height: 1, frames: Array(251).fill({ delay: 2 }) }))), /250 frames/);
});

test('extra bytes after the GIF stream are removed without rejecting or changing its animation', async () => {
  for (const size of [64, 320]) {
    const original = gifFixture({ width: size, height: size });
    // Includes another 0x3b: taking the last trailer byte would be incorrect.
    const padded = Uint8Array.from([...original, 0, 13, 10, 0x3b, 255, 0]);
    const expected = await prepareGIF(base64(original));
    const result = await prepareGIF(base64(padded));
    assert.equal(result.base64, expected.base64);
    assert.equal(new GifReader(Buffer.from(result.base64, 'base64')).numFrames(), 2);
  }
});

test('a missing trailer after complete frames is repaired before resizing or direct upload', async () => {
  for (const size of [64, 320]) {
    const original = gifFixture({ width: size, height: size });
    const expected = await prepareGIF(base64(original));
    const result = await prepareGIF(base64(original.slice(0, -1)));
    assert.equal(result.base64, expected.base64);
  }
});

test('trailer bytes inside extensions are not confused with the end of the GIF', async () => {
  const original = gifFixture({ width: 320, height: 320, palette: [0, 0x3b3b3b, 0x00ff00, 0x0000ff] });
  const commented = Uint8Array.from([...original.slice(0, -1), 0x21, 0xfe, 3, 0x3b, 0x3b, 0, 0, 0x3b]);
  const padded = Uint8Array.from([...commented, 0, 10]);
  assert.equal((await prepareGIF(base64(padded))).base64, base64(commented));
});

test('base64 line breaks do not corrupt decoded GIF bytes', async () => {
  const original = base64(gifFixture({ width: 320, height: 320 }));
  assert.equal((await prepareGIF(original.match(/.{1,64}/g).join('\r\n'))).base64, original);
});

test('truncated palettes, images and extensions are not repaired or silently dropped', async () => {
  const bytes = gifFixture();
  const last = new GifReader(bytes).frameInfo(1);
  const cuts = [12, 15, last.data_offset - 2, last.data_offset,
    last.data_offset + 3, last.data_offset + last.data_length - 1];
  for (const cut of cuts) await assert.rejects(prepareGIF(base64(bytes.slice(0, cut))), /incomplete/);
  // A trailer-looking byte cannot stand in for missing frame payload.
  await assert.rejects(prepareGIF(base64(Uint8Array.from([...bytes.slice(0, last.data_offset + 3), 0x3b]))), /incomplete/);
  for (const suffix of [[0x21, 0xfe, 4, 0x3b], [0x21, 0xf9, 4, 0, 0, 0, 0, 0]]) {
    await assert.rejects(prepareGIF(base64(Uint8Array.from([...bytes.slice(0, -1), ...suffix]))), /incomplete/);
  }
});

test('unsafe dimensions are rejected before allocating frame canvases', async () => {
  const bytes = gifFixture();
  bytes[6] = 255; bytes[7] = 255; bytes[8] = 255; bytes[9] = 255;
  await assert.rejects(prepareGIF(base64(bytes)), /4 megapixels/);
});

test('conversion yields between frames and honors unload cancellation', async () => {
  let checks = 0, timerRan = false;
  setTimeout(() => { timerRan = true; }, 0);
  await assert.rejects(prepareGIF(base64(gifFixture()), () => {
    if (++checks === 4) throw new Error('Unloaded');
  }), /Unloaded/);
  assert.equal(timerRan, true);
});

test('oversized animations reduce color count without dropping frames, or fail at the file-size limit', async () => {
  let seed = 123456;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const palette = Array.from({ length: 256 }, () => random() & 0xffffff);
  for (const count of [5, 8]) {
    const frames = Array.from({ length: count }, () => ({
      pixels: Uint8Array.from({ length: 320 * 320 }, () => random() & 255), delay: 10,
    }));
    const input = gifFixture({ width: 320, height: 320, palette, frames });
    assert.ok(input.length > 512 * 1024);
    if (count === 8) {
      await assert.rejects(prepareGIF(base64(input)), /still over 512 KiB/);
    } else {
      const output = Buffer.from((await prepareGIF(base64(input))).base64, 'base64');
      assert.ok(output.length <= 512 * 1024);
      const reader = new GifReader(output);
      assert.equal(reader.numFrames(), count);
      for (let i = 0; i < count; i++) assert.equal(reader.frameInfo(i).delay, 10);
    }
  }
});
