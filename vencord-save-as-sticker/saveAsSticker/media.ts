// SPDX-License-Identifier: GPL-3.0-or-later
import { prepareGIF } from "./gif";

export const MAX_UPLOAD_BYTES = 512 * 1024;
export const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const imageExtension = /\.(png|apng|jpe?g|webp|gif|bmp)(?:[?#]|$)/i;
const gifExtension = /\.gif(?:[?#]|$)/i;

export interface Media {
    url: string;
    name: string;
    gif: boolean;
}

export interface PreparedSticker {
    blob: Blob;
    extension: "png" | "gif";
}

export function stickerName(name: string) {
    const value = name.replace(/\.[a-z0-9]{1,6}$/i, "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 30);
    return value.length >= 2 ? value : "sticker";
}

export function originalURL(value: string): string | null {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password) return null;
        if (["media.discordapp.net", "cdn.discordapp.com"].includes(url.hostname)) {
            // Keep signed attachment credentials (ex/is/hm). Remove transformations only.
            for (const key of ["width", "height", "format", "quality", "lossless", "animated"]) url.searchParams.delete(key);
        }
        return url.href;
    } catch {
        return null;
    }
}

function mediaFrom(source: any, knownImage = false): Media | null {
    if (!source) return null;
    const candidates = [source.url, source.proxy_url, source.proxyURL].filter(u => typeof u === "string");
    const gifURL = candidates.find(u => gifExtension.test(u));
    const mime = source.content_type ?? source.contentType ?? "";
    const gif = Boolean(gifURL) || mime === "image/gif";
    if (!gif && /^(video|audio)\//i.test(mime)) return null;
    const raw = gifURL ?? candidates[0];
    if (!raw || (!knownImage && !gif && !mime.startsWith("image/") && !imageExtension.test(raw))) return null;
    const url = originalURL(raw);
    if (!url) return null;
    let name = source.filename ?? source.name ?? new URL(url).pathname.split("/").pop() ?? "sticker";
    try { name = decodeURIComponent(name); } catch { /* Preserve an unusual filename. */ }
    return { url, name: stickerName(name), gif };
}

function embedMedia(embed: any): Media[] {
    const sources = embed.type === "gifv"
        ? [embed.video, embed.image, embed.thumbnail].filter(s => gifExtension.test(s?.url ?? "") || gifExtension.test(s?.proxy_url ?? ""))
        : [embed.image, ...(embed.images ?? []), embed.type === "image" ? embed : null];
    return sources.map(s => mediaFrom(s, embed.type !== "gifv")).filter((s): s is Media => Boolean(s));
}

function sameResource(a: string, b: string) {
    try {
        const x = new URL(a), y = new URL(b);
        const host = (s: string) => s === "media.discordapp.net" ? "cdn.discordapp.com" : s;
        return host(x.hostname) === host(y.hostname) && x.pathname === y.pathname;
    } catch { return false; }
}

export function resolveMedia(props: any): Media[] {
    if (!props) return [];
    const message = props.message;
    const selected = [props.itemHref, props.itemSrc, props.src].filter(s => typeof s === "string" && s);
    if (selected.length) {
        for (const attachment of message?.attachments ?? []) {
            if (selected.some(s => [attachment.url, attachment.proxy_url].some(u => u && sameResource(s, u)))) {
                const media = mediaFrom(attachment);
                return media ? [media] : [];
            }
        }
        for (const embed of message?.embeds ?? []) {
            const urls = [embed.url, embed.image?.url, embed.image?.proxy_url, embed.thumbnail?.url,
                embed.thumbnail?.proxy_url, embed.video?.url, embed.video?.proxy_url];
            if (selected.some(s => urls.some(u => u && sameResource(s, u)))) return embedMedia(embed).slice(0, 1);
        }
        // A clicked video/link must never select an unrelated message attachment.
        const raw = selected.find(s => gifExtension.test(s)) ?? selected.find(s => imageExtension.test(s));
        const media = raw ? mediaFrom({ url: raw }) : null;
        return media ? [media] : [];
    }
    const media = [
        ...(message?.attachments ?? []).map(a => mediaFrom(a)),
        ...(message?.embeds ?? []).flatMap(embedMedia)
    ].filter((m): m is Media => Boolean(m));
    return media.filter((m, i) => media.findIndex(other => other.url === m.url) === i);
}

export async function downloadMedia(media: Media, signal: AbortSignal): Promise<Blob> {
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    const timeout = setTimeout(() => controller.abort(new Error("Image download timed out. Try the original file.")), 30_000);
    try {
        const res = await fetch(media.url, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" });
        if (!res.ok) throw new Error(`Image download failed (${res.status}). Reopen the message or choose the original file.`);
        if (Number(res.headers.get("content-length")) > MAX_DOWNLOAD_BYTES) throw new Error("Choose an image below 25 MiB.");
        if (!res.body) {
            const blob = await res.blob();
            if (blob.size > MAX_DOWNLOAD_BYTES) throw new Error("Choose an image below 25 MiB.");
            return blob;
        }
        const reader = res.body.getReader();
        const parts: Uint8Array<ArrayBuffer>[] = [];
        let size = 0;
        try {
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > MAX_DOWNLOAD_BYTES) throw new Error("Choose an image below 25 MiB.");
                parts.push(new Uint8Array(value));
            }
        } finally {
            await reader.cancel().catch(() => {});
        }
        return new Blob(parts, { type: res.headers.get("content-type") ?? "" });
    } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        if (error instanceof TypeError) throw new Error("This host blocked the image download. Use Choose original file below.");
        throw error;
    } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
    }
}

function bytesToBase64(bytes: Uint8Array) {
    let value = "";
    for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(value);
}

function animatedPNG(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let p = 8; p + 12 <= bytes.length;) {
        const kind = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
        if (kind === "acTL") return true;
        if (kind === "IDAT" || kind === "IEND") return false;
        p += view.getUint32(p) + 12;
    }
    return false;
}

export async function prepareSticker(input: Blob, expectedGIF = false, check = () => {}): Promise<PreparedSticker> {
    check();
    if (!input.size || input.size > MAX_DOWNLOAD_BYTES) throw new Error("Choose a non-empty image below 25 MiB.");
    const bytes = new Uint8Array(await input.arrayBuffer());
    check();
    const header = String.fromCharCode(...bytes.subarray(0, 12));
    if (/^GIF8[79]a/.test(header)) {
        const result = await prepareGIF(bytesToBase64(bytes), check);
        check();
        const data = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
        return { blob: new Blob([data], { type: "image/gif" }), extension: "gif" };
    }
    if (expectedGIF || input.type === "image/gif") throw new Error("The link returned a preview instead of a GIF. Choose the original GIF file below.");
    const png = bytes[0] === 137 && header.slice(1, 4) === "PNG";
    const webp = header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const bmp = header.startsWith("BM");
    if (!(png || webp || jpeg || bmp)) throw new Error("Choose a PNG, JPEG, WebP, BMP or animated GIF file. Video previews are not GIF files.");
    if ((png && animatedPNG(bytes)) || (webp && header.length >= 12 && String.fromCharCode(...bytes.subarray(12, 16)) === "VP8X" && (bytes[20] & 2))) {
        throw new Error("This image is animated APNG/WebP. Export it as a GIF to keep its animation.");
    }
    const bitmap = await createImageBitmap(input);
    try {
        check();
        if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 36 * 1024 * 1024) throw new Error("Choose an image below 36 megapixels.");
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 320;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Discord could not open the image converter. Restart Discord and try again.");
        const scale = Math.min(320 / bitmap.width, 320 / bitmap.height);
        const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
        ctx.drawImage(bitmap, Math.floor((320 - width) / 2), Math.floor((320 - height) / 2), width, height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not encode the image.")), "image/png"));
        check();
        if (blob.size > MAX_UPLOAD_BYTES) throw new Error("The converted sticker is over 512 KiB. Choose a simpler image.");
        return { blob, extension: "png" };
    } finally {
        bitmap.close();
    }
}
