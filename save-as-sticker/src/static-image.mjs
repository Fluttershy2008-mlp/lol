import { decode as decodePNG, encode as encodePNG } from 'fast-png';
import jpeg from 'jpeg-js';
import { Unzlib } from 'fflate';
import { toByteArray, fromByteArray } from 'base64-js';

const EDGE = 320, MAX_PIXELS = 16_000_000;
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const u32 = (b, p) => b[p] * 16777216 + b[p + 1] * 65536 + b[p + 2] * 256 + b[p + 3];
const invalid = () => new Error('This image could not be decoded. Reopen the original image and try again.');
function dimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw invalid();
  if (width > 16384 || height > 16384 || width * height > MAX_PIXELS)
    throw new Error('This image is too large to prepare locally. Choose an image under 16 megapixels.');
}

// Bound inflation before the PNG decoder allocates pixels, and omit compressed
// metadata that is irrelevant to a sticker. No Node, canvas or native cropper.
function cleanPNG(bytes, check) {
  if (bytes.length < 33 || signature.some((v, i) => bytes[i] !== v)) throw invalid();
  const width = u32(bytes, 16), height = u32(bytes, 20), depth = bytes[24], color = bytes[25], interlace = bytes[28];
  dimensions(width, height);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth) || interlace > 1) throw invalid();
  const passes = interlace ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] : [[0,0,1,1]];
  let expected = 0;
  for (const [x, y, dx, dy] of passes) {
    const w = Math.max(0, Math.ceil((width - x) / dx)), h = Math.max(0, Math.ceil((height - y) / dy));
    if (w && h) expected += (Math.ceil(w * channels * depth / 8) + 1) * h;
  }
  const parts = [bytes.subarray(0, 8)], compressed = [];
  let end = false;
  for (let p = 8; p + 12 <= bytes.length;) {
    check();
    const length = u32(bytes, p), next = p + length + 12;
    if (next > bytes.length) throw invalid();
    const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
    if (p === 8 && (type !== 'IHDR' || length !== 13)) throw invalid();
    if (type === 'acTL') throw Object.assign(new Error('Use the original 320×320 APNG or an animated GIF to keep this animation.'), { code: 'ANIMATED_PNG' });
    if (['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(type)) parts.push(bytes.subarray(p, next));
    if (type === 'IDAT') compressed.push(bytes.subarray(p + 8, p + 8 + length));
    p = next;
    if (type === 'IEND') { end = true; break; }
  }
  if (!end || !compressed.length) throw invalid();
  let expanded = 0;
  const inflate = new Unzlib(chunk => { expanded += chunk.length; if (expanded > expected) throw invalid(); });
  for (const data of compressed) for (let p = 0; p < data.length; p += 1024) {
    check(); inflate.push(data.subarray(p, p + 1024), false);
  }
  inflate.push(new Uint8Array(0), true);
  if (expanded !== expected) throw invalid();
  const output = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0; for (const part of parts) { output.set(part, at); at += part.length; }
  return output;
}

function exifOrientation(bytes) {
  if (!bytes) return 1;
  try {
    let start = -1;
    for (let n = 0; n < Math.min(12, bytes.length - 8); n++)
      if ((bytes[n] === 73 && bytes[n + 1] === 73) || (bytes[n] === 77 && bytes[n + 1] === 77)) { start = n; break; }
    if (start < 0) return 1;
    const view = new DataView(bytes.buffer, bytes.byteOffset + start, bytes.byteLength - start), little = bytes[start] === 73;
    const directory = view.getUint32(4, little), count = Math.min(view.getUint16(directory, little), 256);
    for (let n = 0; n < count; n++) {
      const p = directory + 2 + n * 12;
      if (view.getUint16(p, little) === 0x112) {
        const value = view.getUint16(p + 8, little); return value >= 1 && value <= 8 ? value : 1;
      }
    }
  } catch {}
  return 1;
}

function sample(image, x, y, out) {
  const { width, height, data, channels = 4, depth = 8, palette, transparency, orientation = 1 } = image;
  let sx = x, sy = y;
  if (orientation === 2) sx = width - 1 - x;
  if (orientation === 3) { sx = width - 1 - x; sy = height - 1 - y; }
  if (orientation === 4) sy = height - 1 - y;
  if (orientation === 5) { sx = y; sy = x; }
  if (orientation === 6) { sx = y; sy = height - 1 - x; }
  if (orientation === 7) { sx = width - 1 - y; sy = height - 1 - x; }
  if (orientation === 8) { sx = width - 1 - y; sy = x; }
  const pixel = sy * width + sx;
  if (palette || depth < 8) {
    const bit = sx * depth, row = Math.ceil(width * depth / 8);
    const value = depth === 8 ? data[pixel] : (data[sy * row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    if (palette) {
      const color = palette[value]; if (!color) throw invalid();
      out[0] = color[0]; out[1] = color[1]; out[2] = color[2]; out[3] = color[3] ?? 255;
    } else { out[0] = out[1] = out[2] = value * 255 / ((1 << depth) - 1); out[3] = transparency?.[0] === value ? 0 : 255; }
    return;
  }
  const p = pixel * channels, scale = depth === 16 ? 1 / 257 : 1;
  out[0] = data[p] * scale;
  if (channels <= 2) {
    out[1] = out[2] = out[0]; out[3] = channels === 2 ? data[p + 1] * scale : transparency?.[0] === data[p] ? 0 : 255;
  } else {
    out[1] = data[p + 1] * scale; out[2] = data[p + 2] * scale;
    out[3] = channels === 4 ? data[p + 3] * scale : transparency?.length === 3
      && transparency[0] === data[p] && transparency[1] === data[p + 1] && transparency[2] === data[p + 2] ? 0 : 255;
  }
}

export function prepareStaticImage(base64, check = () => {}) {
  check();
  const bytes = toByteArray(base64.replace(/\s/g, ''));
  let image;
  if (signature.every((v, i) => bytes[i] === v)) image = decodePNG(cleanPNG(bytes, check), { checkCrc: true });
  else if (bytes[0] === 255 && bytes[1] === 216) {
    image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: false, maxResolutionInMP: 16, maxMemoryUsageInMB: 128 });
    image = { ...image, channels: 4, depth: 8, orientation: exifOrientation(image.exifBuffer) };
  } else throw Object.assign(new Error('This image format needs conversion to PNG.'), { code: 'STATIC_FORMAT_UNSUPPORTED' });
  check(); dimensions(image.width, image.height);
  const rotated = image.orientation >= 5, width = rotated ? image.height : image.width, height = rotated ? image.width : image.height;
  const factor = Math.min(EDGE / width, EDGE / height), w = Math.max(1, Math.round(width * factor)), h = Math.max(1, Math.round(height * factor));
  const left = Math.floor((EDGE - w) / 2), top = Math.floor((EDGE - h) / 2), output = new Uint8Array(EDGE * EDGE * 4);
  const pixels = Array.from({ length: 4 }, () => new Float64Array(4));
  for (let y = 0; y < h; y++) {
    if (y % 16 === 0) check();
    const sy = Math.max(0, Math.min(height - 1, (y + 0.5) * height / h - 0.5)), y0 = Math.floor(sy), y1 = Math.min(height - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.max(0, Math.min(width - 1, (x + 0.5) * width / w - 0.5)), x0 = Math.floor(sx), x1 = Math.min(width - 1, x0 + 1), fx = sx - x0;
      sample(image, x0, y0, pixels[0]); sample(image, x1, y0, pixels[1]); sample(image, x0, y1, pixels[2]); sample(image, x1, y1, pixels[3]);
      const weights = [(1-fx)*(1-fy), fx*(1-fy), (1-fx)*fy, fx*fy], p = ((y + top) * EDGE + x + left) * 4;
      let alpha = 0; for (let n = 0; n < 4; n++) alpha += pixels[n][3] * weights[n];
      output[p + 3] = Math.round(alpha);
      if (alpha) for (let c = 0; c < 3; c++) {
        let value = 0; for (let n = 0; n < 4; n++) value += pixels[n][c] * pixels[n][3] * weights[n];
        output[p + c] = Math.round(value / alpha);
      }
    }
  }
  check();
  const encoded = encodePNG({ width: EDGE, height: EDGE, data: output, channels: 4, depth: 8 });
  if (encoded.length > 512 * 1024) throw new Error('The prepared sticker is over 512 KiB.');
  check(); return { base64: fromByteArray(encoded), mimeType: 'image/png' };
}
