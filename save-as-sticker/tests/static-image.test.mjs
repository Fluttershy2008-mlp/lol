import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from 'fast-png';
import jpeg from 'jpeg-js';
import { zlibSync } from 'fflate';
import { prepareStaticImage } from '../src/static-image.mjs';

const b64 = bytes => Buffer.from(bytes).toString('base64');
const output = bytes => decode(Buffer.from(prepareStaticImage(b64(bytes)).base64, 'base64'), { checkCrc: true });
const pixel = (image, x, y) => Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));
function solid(width, height, color = [255,0,0,255]) {
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < data.length; p += 4) data.set(color, p);
  return { width, height, data, channels: 4, depth: 8 };
}
test('bundled PNG resizing preserves aspect ratio and transparent padding without a cropper', () => {
  const result = output(encode(solid(80, 40)));
  assert.equal(result.width, 320); assert.equal(result.height, 320);
  assert.deepEqual(pixel(result, 160, 20), [0,0,0,0]);
  assert.deepEqual(pixel(result, 160, 160), [255,0,0,255]);
  assert.deepEqual(pixel(result, 160, 300), [0,0,0,0]);
});
test('bundled JPEG decoder produces a real 320×320 PNG under the sticker limit', () => {
  const encoded = jpeg.encode(solid(40, 80, [0,255,0,255]), 95).data;
  const prepared = prepareStaticImage(b64(encoded)), result = decode(Buffer.from(prepared.base64, 'base64'));
  assert.equal(result.width, 320); assert.equal(result.height, 320);
  assert.ok(Buffer.from(prepared.base64, 'base64').length < 512 * 1024);
  const p = pixel(result, 160, 160); assert.ok(p[1] > 240 && p[0] < 15 && p[2] < 15); assert.equal(p[3], 255);
  assert.equal(pixel(result, 20, 160)[3], 0);
});
test('phone JPEG EXIF orientations rotate and mirror pixels before fitting', () => {
  const raw = solid(40, 20);
  for (let y = 0; y < 20; y++) for (let x = 20; x < 40; x++) raw.data.set([0,0,255,255], (y * 40 + x) * 4);
  for (const orientation of [2, 3, 4, 5, 6, 7, 8]) {
    const exifBuffer = Buffer.alloc(26); exifBuffer.write('II'); exifBuffer.writeUInt16LE(42,2);
    exifBuffer.writeUInt32LE(8,4); exifBuffer.writeUInt16LE(1,8);
    exifBuffer.writeUInt16LE(0x112,10); exifBuffer.writeUInt16LE(3,12);
    exifBuffer.writeUInt32LE(1,14); exifBuffer.writeUInt16LE(orientation,18);
    const result = output(jpeg.encode({ ...raw, exifBuffer },95).data);
    const rotated = orientation >= 5, reverse = [2,3,7,8].includes(orientation);
    const start = pixel(result, rotated ? 160 : 30, rotated ? 30 : 160);
    const end = pixel(result, rotated ? 160 : 290, rotated ? 290 : 160);
    assert.ok(start[reverse ? 2 : 0] > 230, 'start color for orientation ' + orientation);
    assert.ok(end[reverse ? 0 : 2] > 230, 'end color for orientation ' + orientation);
    assert.equal(pixel(result, rotated ? 10 : 160, rotated ? 160 : 10)[3],0);
  }
});
test('interlaced PNG input is decoded before resizing', () => {
  const result = output(encode(solid(17, 9, [10,20,30,128]), { interlace: 'Adam7' }));
  assert.deepEqual(pixel(result, 160, 160), [10,20,30,128]);
});
test('16-bit grayscale with alpha is converted to 8-bit RGBA', () => {
  const result = output(encode({ width: 1, height: 1, data: new Uint16Array([32768, 65535]), depth: 16, channels: 2 }));
  assert.deepEqual(pixel(result, 160, 160), [128,128,128,255]);
});
test('packed palette PNG retains transparent colors', () => {
  const result = output(encode({ width: 2, height: 1, data: new Uint8Array([0b01000000]), depth: 1,
    channels: 1, palette: [[255,0,0,0], [0,0,255,255]] }));
  assert.equal(pixel(result, 20, 160)[3], 0); assert.deepEqual(pixel(result, 300, 160), [0,0,255,255]);
});
test('transparent interpolation does not add black fringes', () => {
  const result = output(encode({ width: 2, height: 1, data: new Uint8Array([0,0,0,0,255,0,0,255]), channels: 4, depth: 8 }));
  const middle = pixel(result, 160, 160); assert.equal(middle[0], 255); assert.ok(middle[3] > 0 && middle[3] < 255);
});
test('oversized dimensions and malformed images stop before upload preparation', () => {
  const bytes = Buffer.from(encode(solid(1, 1))); bytes.writeUInt32BE(20000, 16);
  assert.throws(() => prepareStaticImage(b64(bytes)), /too large/);
  assert.throws(() => prepareStaticImage(b64(new Uint8Array([255,216,1,2,3]))));
  assert.throws(() => prepareStaticImage(b64(new Uint8Array([1,2,3]))), { code: 'STATIC_FORMAT_UNSUPPORTED' });
});
test('cancellation during preparation never returns output', () => {
  let calls = 0;
  assert.throws(() => prepareStaticImage(b64(encode(solid(40,80))), () => { if (++calls === 8) throw new Error('cancelled'); }), /cancelled/);
});
test('an over-expanding PNG data stream is rejected at the declared image size', () => {
  const original = Buffer.from(encode(solid(1,1))), compressed = zlibSync(new Uint8Array(100000));
  const start = original.indexOf(Buffer.from('IDAT')) - 4, length = original.readUInt32BE(start);
  const chunk = Buffer.alloc(compressed.length + 12); chunk.writeUInt32BE(compressed.length); chunk.write('IDAT',4); Buffer.from(compressed).copy(chunk,8);
  const bytes = Buffer.concat([original.subarray(0,start),chunk,original.subarray(start+length+12)]);
  assert.throws(() => prepareStaticImage(b64(bytes)), /decoded/);
});
