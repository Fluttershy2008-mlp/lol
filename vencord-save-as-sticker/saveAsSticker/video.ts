// SPDX-License-Identifier: GPL-3.0-or-later
import { encodeVideoFrames } from "./gif";

export interface VideoOptions {
    signal?: AbortSignal;
    check?: () => void;
    onProgress?: (frame: number, total: number) => void;
}

export function videoTimeline(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("This GIF preview has no readable duration. Choose the original GIF file.");
    if (seconds > 5) throw new Error("Discord stickers can be at most 5 seconds long. Use a shorter GIF; it has not been trimmed or uploaded.");
    return { count: Math.max(1, Math.ceil(seconds * 25)), durationMs: seconds * 1000 };
}

function waitForVideo(video: HTMLVideoElement, event: "loadeddata" | "seeked", start: () => void, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
            clearTimeout(timer);
            video.removeEventListener(event, ready);
            video.removeEventListener("error", failed);
            signal?.removeEventListener("abort", aborted);
            error ? reject(error) : resolve();
        };
        const ready = () => finish();
        const failed = () => finish(new Error("Discord could not decode this GIF preview. Choose the original GIF file."));
        const aborted = () => finish(new DOMException("Cancelled", "AbortError"));
        const timer = setTimeout(() => finish(new Error("The GIF preview took too long to decode. Choose the original GIF file.")), 15_000);
        video.addEventListener(event, ready, { once: true });
        video.addEventListener("error", failed, { once: true });
        signal?.addEventListener("abort", aborted, { once: true });
        if (signal?.aborted) { aborted(); return; }
        try { start(); } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    });
}

export async function prepareVideoGIF(blob: Blob, { signal, check = () => {}, onProgress }: VideoOptions = {}): Promise<Blob> {
    const ensureActive = () => {
        if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        check();
    };
    ensureActive();
    const video = document.createElement("video");
    const objectURL = URL.createObjectURL(blob);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    try {
        await waitForVideo(video, "loadeddata", () => { video.src = objectURL; video.load(); }, signal);
        ensureActive();
        const { count, durationMs } = videoTimeline(video.duration);
        const { videoWidth: sourceWidth, videoHeight: sourceHeight } = video;
        if (!sourceWidth || !sourceHeight || sourceWidth * sourceHeight > 4 * 1024 * 1024) throw new Error("Choose a GIF preview below 4 megapixels.");
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 320;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Discord could not open the GIF converter. Restart Discord and try again.");
        const scale = Math.min(320 / sourceWidth, 320 / sourceHeight);
        const width = Math.max(1, Math.round(sourceWidth * scale)), height = Math.max(1, Math.round(sourceHeight * scale));
        const x = Math.floor((320 - width) / 2), y = Math.floor((320 - height) / 2);
        const bytes = await encodeVideoFrames(count, durationMs, async i => {
            ensureActive();
            const time = (i / count) * video.duration;
            if (Math.abs(video.currentTime - time) > 0.000001 || video.seeking) {
                await waitForVideo(video, "seeked", () => { video.currentTime = time; }, signal);
            }
            ensureActive();
            if (video.readyState < 2) throw new Error("This GIF preview has an incomplete frame. Choose the original GIF file.");
            ctx.clearRect(0, 0, 320, 320);
            ctx.drawImage(video, x, y, width, height);
            onProgress?.(i + 1, count);
            return ctx.getImageData(0, 0, 320, 320).data;
        }, ensureActive);
        ensureActive();
        return new Blob([bytes], { type: "image/gif" });
    } finally {
        video.pause();
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(objectURL);
    }
}
