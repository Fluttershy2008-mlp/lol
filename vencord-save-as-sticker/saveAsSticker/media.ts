// SPDX-License-Identifier: GPL-3.0-or-later
import { prepareGIF } from "./gif";
import { isGIFPageURL, MAX_PAGE_BYTES, messageLinks, pageMediaURLs } from "./links";
import { prepareVideoGIF, VideoOptions } from "./video";

export const MAX_UPLOAD_BYTES = 512 * 1024;
export const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const imageExtension = /\.(png|apng|jpe?g|webp|gif|bmp)(?:[?#]|$)/i;
const gifExtension = /\.gif(?:[?#]|$)/i;
const videoExtension = /\.(mp4|webm|gifv)(?:[?#]|$)/i;

export interface Media {
    url: string;
    name: string;
    gif: boolean;
    video?: boolean;
    fallbackUrls?: string[];
    pageUrl?: string;
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

function sourceURLs(source: any): string[] {
    return [source?.url, source?.proxy_url, source?.proxyURL].filter(u => typeof u === "string" && u);
}

function uniqueURLs(urls: string[]) {
    return [...new Set(urls.map(originalURL).filter((url): url is string => Boolean(url)))];
}

function gifHost(value: string) {
    try {
        const host = new URL(value).hostname;
        return ["tenor.com", "giphy.com", "imgur.com"].some(domain => host === domain || host.endsWith("." + domain));
    } catch { return false; }
}

function mediaFrom(source: any, knownImage = false): Media | null {
    if (!source) return null;
    const candidates = sourceURLs(source);
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
    const others = uniqueURLs(candidates).filter(u => u !== url);
    return { url, name: stickerName(name), gif, ...(others.length ? { fallbackUrls: others } : {}) };
}

function linkedMedia(value: string): Media | null {
    const url = originalURL(value);
    if (!url) return null;
    const name = stickerName(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "sticker");
    if (isGIFPageURL(url)) return { url, pageUrl: url, name, gif: true, video: true };
    if (videoExtension.test(url) && gifHost(url)) return { url, name, gif: true, video: true };
    return mediaFrom({ url });
}

function embedMedia(embed: any): Media[] {
    const pageUrl = isGIFPageURL(embed.url ?? "") ? embed.url as string : undefined;
    if (embed.type === "gifv" || pageUrl || (embed.type === "video" && gifHost(embed.url ?? ""))) {
        const assets = [embed.image, embed.thumbnail, embed.video].flatMap(sourceURLs);
        // Tenor/Giphy often provide MP4/WebM plus a still thumbnail. Prefer an
        // actual GIF, otherwise convert the video; never save the still thumbnail.
        const gifURLs = [embed.url, ...assets].filter(u => typeof u === "string" && gifExtension.test(u) && !isGIFPageURL(u));
        const videos = sourceURLs(embed.video);
        const candidates = uniqueURLs([...gifURLs, ...videos]);
        if (!candidates.length && pageUrl) {
            const link = linkedMedia(pageUrl)!;
            return [{ ...link, name: stickerName(embed.title || link.name) }];
        }
        if (!candidates.length) return [];
        return [{ url: candidates[0], fallbackUrls: candidates.slice(1),
            name: stickerName(embed.title || new URL(candidates[0]).pathname.split("/").pop() || "sticker"),
            gif: true, video: videos.length > 0 || Boolean(pageUrl), ...(pageUrl ? { pageUrl } : {}) }];
    }
    const sources = [embed.image, ...(embed.images ?? []), embed.type === "image" ? embed : null];
    return sources.map(s => mediaFrom(s, true)).filter((s): s is Media => Boolean(s));
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
    const messages = [message, ...(message?.messageSnapshots ?? message?.message_snapshots ?? []).map(s => s.message)].filter(Boolean);
    const attachments = messages.flatMap(m => m.attachments ?? []);
    const embeds = messages.flatMap(m => m.embeds ?? []);
    const selected = [props.itemHref, props.itemSrc, props.src].filter(s => typeof s === "string" && s);
    if (selected.length) {
        for (const attachment of attachments) {
            if (selected.some(s => sourceURLs(attachment).some(u => sameResource(s, u)))) {
                const media = mediaFrom(attachment);
                return media ? [media] : [];
            }
        }
        for (const embed of embeds) {
            const urls = [embed.url, ...[embed.image, embed.thumbnail, embed.video, ...(embed.images ?? [])].flatMap(sourceURLs)];
            if (selected.some(s => urls.some(u => u && sameResource(s, u)))) {
                const sources = embedMedia(embed);
                if (sources.length) return sources.slice(0, 1);
            }
        }
        // A clicked video/link must never select an unrelated message attachment.
        const sources = selected.map(linkedMedia).filter((m): m is Media => Boolean(m));
        // A provider page identifies the animation even if itemSrc is a still poster.
        const source = sources.find(m => m.pageUrl) ?? sources.find(m => m.gif) ?? sources[0];
        return source ? [source] : [];
    }
    const media = [
        ...attachments.map(a => mediaFrom(a)),
        ...embeds.flatMap(embedMedia)
    ].filter((m): m is Media => Boolean(m));
    for (const value of messages.flatMap(m => messageLinks(m.content))) {
        const source = linkedMedia(value);
        if (source && !media.some(m => [m.url, m.pageUrl, ...(m.fallbackUrls ?? [])].some(u => u && sameResource(u, source.url)))) media.push(source);
    }
    return media.filter((m, i) => media.findIndex(other => other.url === m.url) === i);
}

export async function downloadMedia(media: Media, signal: AbortSignal, readPage?: (url: string) => Promise<string>): Promise<Blob> {
    let lastError: unknown;
    const urls = uniqueURLs([media.url, ...(media.fallbackUrls ?? [])]).filter(u => !isGIFPageURL(u));
    let triedPage = false;
    for (let i = 0; i < urls.length || (!triedPage && media.pageUrl); i++) {
        if (signal.aborted) throw signal.reason;
        if (i === urls.length) {
            triedPage = true;
            try {
                const page = readPage
                    ? await cancellablePage(readPage, media.pageUrl!, signal)
                    : await (await downloadURL(media.pageUrl!, signal, MAX_PAGE_BYTES)).text();
                if (signal.aborted) throw signal.reason;
                const discovered = pageMediaURLs(page, media.pageUrl!).filter(u => !urls.includes(u));
                if (!discovered.length) throw new Error("This GIF page did not expose downloadable animation. Choose the original GIF file.");
                urls.push(...discovered);
            } catch (error) {
                if (signal.aborted) throw signal.reason;
                lastError = error;
                break;
            }
        }
        const url = urls[i];
        try {
            const blob = await downloadURL(url, signal);
            // If a GIF CDN supplied its thumbnail, try the embed's animated
            // media/proxy before reporting an error. Never retry an upload.
            if (media.gif) {
                const header = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
                if (!isGIFHeader(header) && !(media.video && videoMime(header))) throw new Error("The link returned a still preview. Choose the original GIF file below.");
            }
            return blob;
        } catch (error) {
            if (signal.aborted) throw signal.reason;
            lastError = error;
        }
    }
    throw lastError ?? new Error("This image link is not a supported HTTPS URL.");
}

function cancellablePage(readPage: (url: string) => Promise<string>, url: string, signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
        const aborted = () => reject(signal.reason);
        signal.addEventListener("abort", aborted, { once: true });
        if (signal.aborted) { signal.removeEventListener("abort", aborted); aborted(); return; }
        Promise.resolve().then(() => { if (signal.aborted) throw signal.reason; return readPage(url); })
            .then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
    });
}

async function downloadURL(url: string, signal: AbortSignal, maxBytes = MAX_DOWNLOAD_BYTES): Promise<Blob> {
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    const timeout = setTimeout(() => controller.abort(new Error("Image download timed out. Try the original file.")), 30_000);
    try {
        const res = await fetch(url, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" });
        if (!res.ok) throw new Error(`Image download failed (${res.status}). Reopen the message or choose the original file.`);
        const sizeError = maxBytes === MAX_PAGE_BYTES ? "This GIF page is too large. Choose the original GIF file." : "Choose an image below 25 MiB.";
        if (Number(res.headers.get("content-length")) > maxBytes) throw new Error(sizeError);
        if (!res.body) {
            const blob = await res.blob();
            if (blob.size > maxBytes) throw new Error(sizeError);
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
                if (size > maxBytes) throw new Error(sizeError);
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

const isGIFHeader = (bytes: Uint8Array) => /^GIF8[79]a/.test(String.fromCharCode(...bytes.subarray(0, 6)));
function videoMime(bytes: Uint8Array) {
    if (String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp") return "video/mp4";
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
    return null;
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

export async function prepareSticker(input: Blob, expectedGIF = false, check = () => {}, options: VideoOptions & { allowVideo?: boolean; } = {}): Promise<PreparedSticker> {
    check();
    if (!input.size || input.size > MAX_DOWNLOAD_BYTES) throw new Error("Choose a non-empty image below 25 MiB.");
    const bytes = new Uint8Array(await input.arrayBuffer());
    check();
    const header = String.fromCharCode(...bytes.subarray(0, 12));
    if (isGIFHeader(bytes)) {
        const result = await prepareGIF(bytesToBase64(bytes), check);
        check();
        const data = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
        return { blob: new Blob([data], { type: "image/gif" }), extension: "gif" };
    }
    const videoType = videoMime(bytes);
    if (options.allowVideo && videoType) {
        const blob = input.type === videoType ? input : new Blob([input], { type: videoType });
        return { blob: await prepareVideoGIF(blob, { ...options, check }), extension: "gif" };
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
