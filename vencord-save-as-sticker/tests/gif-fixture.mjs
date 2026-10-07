import { GifWriter } from 'omggif';

// Real, independently encoded GIFs, including partial transparent frames.
export function gifFixture({ width = 64, height = 32, frames, loop = 0, palette = [0, 0xff0000, 0x00ff00, 0x0000ff] } = {}) {
  const bytes = new Uint8Array(4 * 1024 * 1024);
  const writer = new GifWriter(bytes, width, height, { palette, ...(loop == null ? {} : { loop }) });
  for (const frame of frames ?? [{ color: 1, delay: 10 }, { color: 2, delay: 15 }]) {
    const w = frame.width ?? width, h = frame.height ?? height;
    writer.addFrame(frame.x ?? 0, frame.y ?? 0, w, h,
      frame.pixels ?? new Uint8Array(w * h).fill(frame.color ?? 1),
      { delay: frame.delay ?? 10, disposal: frame.disposal ?? 2, transparent: 0 });
  }
  return bytes.slice(0, writer.end());
}
