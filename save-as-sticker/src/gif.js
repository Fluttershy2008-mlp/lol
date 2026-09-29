import { GifReader } from 'omggif';
// Use the CommonJS entry consistently in Node tests and the browser bundle.
import gifenc from 'gifenc/dist/gifenc.js';
import { toByteArray, fromByteArray } from 'base64-js';

const { GIFEncoder, quantize, applyPalette } = gifenc;

export const isGIF = base64 => /^R0lGOD[dl]h/.test(base64);
const EDGE = 320;
const MAX_BYTES = 512 * 1024;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function normalizeGIF(bytes) {
  const incomplete = () => new Error('This GIF download is incomplete. Reopen the GIF or share the original file and try again.');
  if (bytes.length < 13) throw incomplete();
  if (!/^GIF8[79]a$/.test(String.fromCharCode(...bytes.subarray(0, 6)))) {
    throw new Error('This file could not be read as an animated GIF.');
  }
  let position = 13, frames = 0, pendingControl = false;
  function take(length) {
    if (position + length > bytes.length) throw incomplete();
    const start = position;
    position += length;
    return start;
  }
  function palette(packed) {
    if (packed & 0x80) take(3 * (1 << ((packed & 7) + 1)));
  }
  function subBlocks() {
    for (;;) {
      const length = bytes[take(1)];
      if (length === 0) return;
      take(length);
    }
  }
  palette(bytes[10]);
  // Walk real block boundaries. A 0x3b inside a palette, extension or compressed
  // frame is data, not a trailer. Downloads may contain bytes after the stream.
  while (position < bytes.length) {
    const marker = bytes[take(1)];
    if (marker === 0x3b) {
      if (!frames || pendingControl) throw incomplete();
      return position === bytes.length ? bytes : bytes.subarray(0, position);
    }
    if (marker === 0x21) {
      const label = bytes[take(1)];
      subBlocks();
      if (label === 0xf9) pendingControl = true;
    } else if (marker === 0x2c) {
      const descriptor = take(9);
      palette(bytes[descriptor + 8]);
      take(1); // LZW minimum code size; checked with the decoded frame metadata.
      subBlocks();
      pendingControl = false;
      if (++frames > 250) throw new Error('Use a GIF with 250 frames or fewer.');
    } else {
      throw new Error('This GIF contains an invalid data block. Share the original GIF file and try again.');
    }
  }
  // Some encoders omit only the final trailer. Repair it only after complete,
  // terminated blocks; never discard an incomplete image or extension.
  if (!frames || pendingControl) throw incomplete();
  const complete = new Uint8Array(bytes.length + 1);
  complete.set(bytes);
  complete[bytes.length] = 0x3b;
  return complete;
}

export function inspectGIF(input) {
  const bytes = normalizeGIF(input);
  let reader;
  try { reader = new GifReader(bytes); } catch { throw new Error('This file could not be read as an animated GIF.'); }
  const { width, height } = reader;
  const count = reader.numFrames();
  if (!width || !height || width * height > 4 * 1024 * 1024) throw new Error('This GIF is too large to resize on mobile. Use a GIF below 4 megapixels.');
  if (!count || count > 250) throw new Error('Use a GIF with 250 frames or fewer.');
  const frames = [];
  let duration = 0;
  for (let i = 0; i < count; i++) {
    const f = reader.frameInfo(i);
    if (!f.width || !f.height || f.x + f.width > width || f.y + f.height > height
      || f.data_offset + f.data_length > bytes.length || f.palette_offset == null
      || f.palette_offset + f.palette_size * 3 > bytes.length
      || bytes[f.data_offset] < 2 || bytes[f.data_offset] > 8) throw new Error('This GIF contains an invalid frame.');
    // Browsers display zero/one-centisecond delays as 100 ms.
    const delay = f.delay < 2 ? 100 : f.delay * 10;
    duration += delay;
    frames.push({ ...f, delayMs: delay });
  }
  if (duration > 5000) throw new Error('Discord stickers can be at most 5 seconds long. Use a shorter GIF; it has not been trimmed or uploaded.');
  return { bytes, reader, width, height, frames, duration };
}

function background(bytes, frame) {
  if (frame.transparent_index != null || !(bytes[10] & 128)) return [0, 0, 0, 0];
  const offset = 13 + bytes[11] * 3;
  return [bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, 255];
}
function fillRect(canvas, width, f, color) {
  for (let y = f.y; y < f.y + f.height; y++) {
    let p = (y * width + f.x) * 4;
    for (let x = 0; x < f.width; x++, p += 4) canvas.set(color, p);
  }
}
function resizeContained(canvas, width, height) {
  const scale = Math.min(EDGE / width, EDGE / height);
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const left = Math.floor((EDGE - w) / 2), top = Math.floor((EDGE - h) / 2);
  const out = new Uint8Array(EDGE * EDGE * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor((y + 0.5) * height / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor((x + 0.5) * width / w));
      const from = (sy * width + sx) * 4, to = ((y + top) * EDGE + x + left) * 4;
      out[to] = canvas[from]; out[to + 1] = canvas[from + 1];
      out[to + 2] = canvas[from + 2]; out[to + 3] = canvas[from + 3];
    }
  }
  return out;
}

// Work one frame at a time; never hold all decoded frames in mobile memory.
async function encode(bytes, info, colors, check) {
  const { reader, width, height, frames } = info;
  const canvas = new Uint8Array(width * height * 4);
  fillRect(canvas, width, { x: 0, y: 0, width, height }, background(bytes, frames[0]));
  const encoder = GIFEncoder();
  let previous, restore;
  for (let i = 0; i < frames.length; i++) {
    check();
    if (previous?.disposal === 2) fillRect(canvas, width, previous, background(bytes, previous));
    else if (previous?.disposal === 3 && restore) canvas.set(restore);
    const frame = frames[i];
    restore = frame.disposal === 3 ? canvas.slice() : null;
    reader.decodeAndBlitFrameRGBA(i, canvas);
    const rgba = resizeContained(canvas, width, height);
    const reduced = quantize(rgba, colors - 1, { format: 'rgba4444', oneBitAlpha: true });
    // Index 0 is always transparent, including in the global color table. Together
    // with disposal 2 this avoids opaque backgrounds and trails between full frames.
    const palette = [[0, 0, 0, 0], ...reduced.filter(color => color[3] !== 0)];
    if (palette.length === 1) palette.push([0, 0, 0, 255]);
    const index = applyPalette(rgba, palette, 'rgba4444');
    encoder.writeFrame(index, EDGE, EDGE, {
      palette, delay: frame.delayMs, repeat: reader.loopCount() ?? -1,
      transparent: true, transparentIndex: 0, dispose: 2,
    });
    if (encoder.bytesView().length > MAX_BYTES) return null;
    previous = frame;
    await tick();
  }
  encoder.finish();
  return encoder.bytesView().length <= MAX_BYTES ? encoder.bytes() : null;
}

export async function prepareGIF(base64, check = () => {}) {
  check();
  base64 = base64.replace(/\s/g, '');
  const input = toByteArray(base64);
  const info = inspectGIF(input);
  const { bytes } = info;
  if (info.width === EDGE && info.height === EDGE && bytes.length <= MAX_BYTES) {
    return { base64: bytes === input ? base64 : fromByteArray(bytes), mimeType: 'image/gif', extension: 'gif' };
  }
  if (info.width * info.height * info.frames.length > 80 * 1024 * 1024) {
    throw new Error('This GIF is too complex to resize on mobile. Use a smaller GIF.');
  }
  for (const colors of [256, 128, 64]) {
    await tick();
    check();
    const result = await encode(bytes, info, colors, check);
    if (result) return { base64: fromByteArray(result), mimeType: 'image/gif', extension: 'gif' };
  }
  throw new Error('This animated GIF is still over 512 KiB after resizing. Use a shorter or simpler GIF.');
}
