// SPDX-License-Identifier: GPL-3.0-or-later
import type { IpcMainInvokeEvent } from "electron";

import { isGIFPageURL, MAX_PAGE_BYTES } from "./links";

// Provider HTML pages do not generally allow browser-origin fetches. Use the
// desktop helper for public GIF pages only, without Discord cookies or tokens.
export async function fetchGIFPage(_: IpcMainInvokeEvent, value: string): Promise<string> {
    const signal = AbortSignal.timeout(15_000);
    let url = value;
    for (let redirects = 0; redirects <= 3; redirects++) {
        if (typeof url !== "string" || !isGIFPageURL(url)) throw new Error("This is not a supported GIF page link.");
        const response = await fetch(url, { signal, redirect: "manual", credentials: "omit", headers: { Accept: "text/html" } });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get("location");
            await response.body?.cancel();
            if (!location) throw new Error("This GIF page redirect is incomplete.");
            url = new URL(location, url).href;
            continue;
        }
        if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
            await response.body?.cancel();
            throw new Error(`Could not read this GIF page (${response.status}). Choose the original GIF file.`);
        }
        if (Number(response.headers.get("content-length")) > MAX_PAGE_BYTES) {
            await response.body?.cancel();
            throw new Error("This GIF page is too large. Choose the original GIF file.");
        }
        if (!response.body) throw new Error("This GIF page is empty.");
        const reader = response.body.getReader(), parts: Uint8Array[] = [];
        let size = 0;
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > MAX_PAGE_BYTES) throw new Error("This GIF page is too large. Choose the original GIF file.");
                parts.push(value);
            }
        } finally { await reader.cancel().catch(() => {}); }
        return Buffer.concat(parts).toString("utf8");
    }
    throw new Error("This GIF page redirects too many times. Choose the original GIF file.");
}
