// SPDX-License-Identifier: GPL-3.0-or-later
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export function isGIFPageURL(value: string): boolean {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
        const host = url.hostname.replace(/^www\./, "");
        if (host === "tenor.com") return /^\/view\/[^/]+\/?$/.test(url.pathname) || /^\/[a-zA-Z0-9]+\.gif$/.test(url.pathname);
        if (host === "giphy.com") return /^\/(gifs|stickers|embed)\/[^/]+\/?$/.test(url.pathname);
        if (host === "imgur.com") return /^\/[a-zA-Z0-9]+\/?$/.test(url.pathname);
        return false;
    } catch { return false; }
}

export function messageLinks(content: unknown): string[] {
    if (typeof content !== "string") return [];
    // Handles raw URLs, <URLs>, spoilers, and [labels](URLs). Preserve signed queries.
    return [...new Set((content.match(/https:\/\/[^\s<>"`|]+/gi) ?? [])
        .map(url => url.replace(/[)\]}.,!?;:]+$/, "")))].slice(0, 20);
}

function decodeEntities(value: string) {
    return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (match, code: string) => {
        if (code[0] !== "#") return ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" } as Record<string, string>)[code.toLowerCase()] ?? match;
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    });
}

function attributes(tag: string) {
    const result: Record<string, string> = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s'"=<>`]+))/g)) {
        result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4]);
    }
    return result;
}

export function pageMediaURLs(html: string, pageURL: string): string[] {
    if (!isGIFPageURL(pageURL) || html.length > MAX_PAGE_BYTES) return [];
    const candidates: string[] = [];
    // Read metadata only. Never run page scripts, load an iframe, or pick a
    // recommended GIF, avatar, advertisement, or still thumbnail from the page.
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
        const meta = attributes(tag);
        if (/^(og:(image|video)(:url|:secure_url)?|og:url|twitter:image(:src)?)$/i.test(meta.property ?? meta.name ?? "")) {
            if (meta.content) candidates.push(meta.content);
        }
    }
    function visit(value: any, depth = 0) {
        if (!value || typeof value !== "object" || depth > 6) return;
        if (Array.isArray(value)) { value.slice(0, 20).forEach(v => visit(v, depth + 1)); return; }
        if (["ImageObject", "VideoObject"].includes(value["@type"])) {
            for (const key of ["contentUrl", "url"]) if (typeof value[key] === "string") candidates.push(value[key]);
        }
        for (const key of ["image", "video", "associatedMedia", "@graph"]) {
            if (typeof value[key] === "string") candidates.push(value[key]);
            else visit(value[key], depth + 1);
        }
    }
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        if (attributes(script[1]).type?.toLowerCase() !== "application/ld+json") continue;
        try { visit(JSON.parse(script[2])); } catch { /* Other metadata can still work. */ }
    }
    const urls = candidates.flatMap(value => {
        try {
            const url = new URL(value, pageURL);
            if (url.protocol !== "https:" || url.username || url.password || url.port) return [];
            if (!/\.(gif|mp4|webm)$/i.test(url.pathname)) return [];
            if (!/^(media\d*\.tenor\.com|media\d*\.giphy\.com|i\.giphy\.com|i\.imgur\.com)$/.test(url.hostname)) return [];
            return [url.href];
        } catch { return []; }
    });
    const unique = [...new Set(urls)];
    return [...unique.filter(u => /\.gif(?:[?#]|$)/i.test(u)), ...unique.filter(u => !/\.gif(?:[?#]|$)/i.test(u))].slice(0, 8);
}
