// Real browser decoding: requires ffmpeg and SAS_CHROMIUM_PATH (Chrome/Chromium).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import { GifReader } from "omggif";

const root = fileURLToPath(new URL("..", import.meta.url));
const temp = mkdtempSync(path.join(tmpdir(), "sas-browser-"));
let browser;
try {
    assert.ok(process.env.SAS_CHROMIUM_PATH, "Set SAS_CHROMIUM_PATH to a Chrome/Chromium executable.");
    const bundle = await build({ entryPoints: [path.join(root, "saveAsSticker/media.ts")], bundle: true, write: false, format: "iife", globalName: "SAS" });
    browser = await puppeteer.launch({ executablePath: process.env.SAS_CHROMIUM_PATH, headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader"] });
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => {
        window.activeMediaURLs = new Set();
        const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
        URL.createObjectURL = value => { const url = create(value); activeMediaURLs.add(url); return url; };
        URL.revokeObjectURL = url => { activeMediaURLs.delete(url); revoke(url); };
    });
    function clip(extension, seconds = 1) {
        const file = path.join(temp, `${seconds}.${extension}`);
        execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", `color=c=red:s=64x32:r=25:d=${seconds / 2}`,
            "-f", "lavfi", "-i", `color=c=blue:s=64x32:r=25:d=${seconds / 2}`,
            "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[out]", "-map", "[out]", "-an",
            "-c:v", extension === "mp4" ? "libx264" : "libvpx", "-pix_fmt", "yuv420p", file]);
        return readFileSync(file).toString("base64");
    }
    async function convert(base64, cancel = false) {
        return page.evaluate(async ({ base64, cancel }) => {
            const controller = new AbortController();
            const source = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: "application/octet-stream" });
            try {
                const result = await SAS.prepareSticker(source, true, () => {}, { allowVideo: true, signal: controller.signal,
                    onProgress: frame => { if (cancel && frame === 3) controller.abort(); } });
                const bytes = new Uint8Array(await result.blob.arrayBuffer());
                let binary = "";
                for (const byte of bytes) binary += String.fromCharCode(byte);
                return { base64: btoa(binary), extension: result.extension, type: result.blob.type, active: activeMediaURLs.size };
            } catch (error) { return { error: error.message, name: error.name, active: activeMediaURLs.size }; }
        }, { base64, cancel });
    }
    for (const format of ["mp4", "webm"]) {
        const source = clip(format);
        const result = await convert(source);
        assert.equal(result.error, undefined, `${format}: ${result.error}`);
        assert.equal(result.extension, "gif"); assert.equal(result.type, "image/gif");
        assert.equal(result.active, 0, "Video object URLs must be released");
        const bytes = Buffer.from(result.base64, "base64"), gif = new GifReader(bytes);
        assert.ok(bytes.length <= 512 * 1024);
        assert.equal(gif.width, 320); assert.equal(gif.height, 320);
        assert.ok(gif.numFrames() >= 25 && gif.numFrames() <= 27); // container/frame rounding
        assert.equal(gif.loopCount(), 0);
        let duration = 0;
        for (let i = 0; i < gif.numFrames(); i++) duration += gif.frameInfo(i).delay;
        assert.ok(duration >= 100 && duration <= 108);
        for (const [index, color] of [[0, 0], [gif.numFrames() - 1, 2]]) {
            const rgba = new Uint8Array(320 * 320 * 4);
            gif.decodeAndBlitFrameRGBA(index, rgba);
            const center = (160 * 320 + 160) * 4;
            assert.ok(rgba[center + color] > 230, `${format} frame ${index} must retain its color`);
            assert.ok(rgba[center + (color === 0 ? 2 : 0)] < 30);
            assert.equal(rgba[3], 0, "Letterboxing must be transparent");
            assert.equal(rgba[center + 3], 255);
        }
        const cancelled = await convert(source, true);
        assert.equal(cancelled.name, "AbortError"); assert.equal(cancelled.active, 0);
        const long = await convert(clip(format, 6));
        assert.match(long.error, /5 seconds/); assert.equal(long.active, 0);
        console.log(`${format}: animated frames, duration, dimensions, transparency, cancellation and duration limit passed`);
    }
} finally {
    await browser?.close();
    rmSync(temp, { recursive: true, force: true });
}
