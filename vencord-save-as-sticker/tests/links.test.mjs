import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { gifFixture } from "./gif-fixture.mjs";

async function load(name, platform = "browser") {
    const result = await build({ entryPoints: [new URL(`../saveAsSticker/${name}.ts`, import.meta.url).pathname], bundle: true, write: false, platform, format: "esm" });
    return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const links = await load("links"), media = await load("media"), native = await load("native", "node");
const page = "https://tenor.com/view/pinkie-pie-gif-123";
const gif = "https://media.tenor.com/abc/pinkie.gif";
const video = "https://media.tenor.com/abc/pinkie.mp4";
const html = `<meta property="og:image" content="${gif}"><meta content="${video}" property="og:video">`;

test("raw, markdown, spoiler and forwarded GIF links work without an embed", () => {
    for (const content of [page, `<${page}>`, `[pony](${page})`, `look ||${page}||`, `look ${page}.`]) {
        const [source] = media.resolveMedia({ message: { content, embeds: [] } });
        assert.equal(source.pageUrl, page); assert.equal(source.gif, true); assert.equal(source.video, true);
    }
    for (const key of ["messageSnapshots", "message_snapshots"]) {
        assert.equal(media.resolveMedia({ message: { [key]: [{ message: { content: page } }] } })[0].pageUrl, page);
    }
    const direct = "https://cdn.discordapp.com/attachments/a/pony.gif?ex=aaa&is=bbb&hm=ccc";
    assert.equal(media.resolveMedia({ message: { content: `<${direct}>` } })[0].url, direct);
    assert.deepEqual(media.resolveMedia({ message: { content: "https://example.com/article" } }), []);
    assert.equal(media.resolveMedia({ message: { content: page }, itemHref: "https://example.com/unrelated" }).length, 0);
});

test("provider links support missing/rich embed types, still posters and duplicate text URLs", () => {
    for (const type of [undefined, "rich", "image", "gifv"]) {
        const embed = { type, url: page, video: { url: video }, thumbnail: { url: "https://media.tenor.com/abc/pony.png" } };
        const sources = media.resolveMedia({ message: { content: page, embeds: [embed] } });
        assert.equal(sources.length, 1); assert.equal(sources[0].url, video); assert.equal(sources[0].pageUrl, page);
    }
    const poster = { type: "rich", url: page, image: { url: "https://media.tenor.com/abc/pony.png" } };
    assert.equal(media.resolveMedia({ message: { embeds: [poster] } })[0].url, page);
    assert.equal(media.resolveMedia({ itemHref: page, itemSrc: poster.image.url })[0].pageUrl, page);
    assert.equal(media.resolveMedia({ itemHref: "https://tenor.com/abcd.gif" })[0].pageUrl, "https://tenor.com/abcd.gif");
});

test("page metadata prefers GIFs, reads Giphy JSON-LD, and ignores unrelated page images/scripts", () => {
    assert.deepEqual(links.pageMediaURLs(html, page), [gif, video]);
    assert.deepEqual(links.pageMediaURLs(`<meta content='${gif}?x=1&amp;y=2' property='og:image'>`, page), [gif + "?x=1&y=2"]);
    const giphy = "https://media3.giphy.com/media/v1.token/abc/giphy.gif";
    const body = `<img src="https://media.giphy.com/media/unrelated/giphy.gif"><script>throw new Error('never execute')</script>
        <script type="application/ld+json">${JSON.stringify({ "@type": "Article", image: { "@type": "ImageObject", url: giphy } })}</script>`;
    assert.deepEqual(links.pageMediaURLs(body, "https://giphy.com/gifs/pony-abc"), [giphy]);
    assert.deepEqual(links.pageMediaURLs(`<meta property="og:image" content="https://evil.example/pony.gif">`, page), []);
    assert.deepEqual(links.pageMediaURLs(`<meta property="og:image" content="http://media.tenor.com/a.gif">`, page), []);
    assert.deepEqual(links.pageMediaURLs(html, "https://tenor.com.evil.example/view/pony"), []);
});

test("a page-only GIF link downloads its real animation and falls back after an expired embed URL", async () => {
    const saved = globalThis.fetch, requests = [], pages = [];
    try {
        const bytes = gifFixture();
        globalThis.fetch = async url => {
            requests.push(url);
            return url.includes("expired") ? new Response("expired", { status: 404 }) : new Response(bytes, { headers: { "content-type": "image/gif" } });
        };
        for (const source of [media.resolveMedia({ message: { content: page } })[0], { url: "https://media.tenor.com/expired.mp4", pageUrl: page, gif: true, video: true }]) {
            const blob = await media.downloadMedia(source, new AbortController().signal, async url => { pages.push(url); return html; });
            assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
        }
        assert.deepEqual(pages, [page, page]);
        assert.deepEqual(requests, [gif, "https://media.tenor.com/expired.mp4", gif]);
    } finally { globalThis.fetch = saved; }
});

test("closing a picker stops waiting for page resolution and never downloads animation afterwards", async () => {
    const saved = globalThis.fetch, controller = new AbortController();
    let release, reads = 0, requests = 0;
    try {
        globalThis.fetch = async () => { requests++; throw new Error("should not fetch"); };
        const pending = media.downloadMedia(media.resolveMedia({ message: { content: page } })[0], controller.signal,
            () => { reads++; return new Promise(resolve => { release = resolve; }); });
        await Promise.resolve();
        controller.abort();
        await assert.rejects(pending, { name: "AbortError" });
        release(html);
        await Promise.resolve();
        assert.equal(reads, 1); assert.equal(requests, 0);
    } finally { globalThis.fetch = saved; }
});

test("a browser-blocked Tenor GIF falls back to the page's animated MP4", async () => {
    const saved = globalThis.fetch, requests = [];
    const bytes = Uint8Array.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109]);
    try {
        globalThis.fetch = async url => {
            requests.push(url);
            if (url === gif) throw new TypeError("Failed to fetch");
            assert.equal(url, video);
            return new Response(bytes, { headers: { "content-type": "video/mp4" } });
        };
        const source = media.resolveMedia({ message: { content: page } })[0];
        assert.equal(source.video, true);
        const blob = await media.downloadMedia(source, new AbortController().signal, async () => html);
        assert.equal(blob.type, "video/mp4");
        assert.deepEqual(requests, [gif, video]);
    } finally { globalThis.fetch = saved; }
});

test("desktop page helper allows public provider pages, sends no credentials, and validates redirects", async () => {
    const saved = globalThis.fetch, requests = [];
    try {
        globalThis.fetch = async (url, options) => {
            requests.push({ url, options });
            return url.endsWith("abcd.gif") ? new Response(null, { status: 302, headers: { location: page } })
                : new Response(html, { headers: { "content-type": "text/html" } });
        };
        assert.equal(await native.fetchGIFPage(null, "https://tenor.com/abcd.gif"), html);
        assert.equal(requests.length, 2);
        for (const { options } of requests) {
            assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "manual");
            assert.deepEqual(options.headers, { Accept: "text/html" });
        }
        for (const url of ["http://tenor.com/view/123", "https://tenor.com:444/view/123", "https://u:p@tenor.com/view/123", "https://localhost/view/123", "https://tenor.com.evil.example/view/123"]) {
            await assert.rejects(native.fetchGIFPage(null, url), /supported GIF page/);
        }
        const before = requests.length;
        globalThis.fetch = async () => { requests.push({}); return new Response(null, { status: 302, headers: { location: "https://localhost/internal" } }); };
        await assert.rejects(native.fetchGIFPage(null, page), /supported GIF page/);
        assert.equal(requests.length, before + 1);
    } finally { globalThis.fetch = saved; }
});

test("desktop page helper rejects oversized, non-HTML, and failed responses", async () => {
    const saved = globalThis.fetch;
    try {
        for (const response of [new Response(html, { status: 403 }), new Response("GIF89a", { headers: { "content-type": "image/gif" } })]) {
            globalThis.fetch = async () => response;
            await assert.rejects(native.fetchGIFPage(null, page), /Could not read/);
        }
        globalThis.fetch = async () => new Response("x".repeat(links.MAX_PAGE_BYTES + 1), { headers: { "content-type": "text/html" } });
        await assert.rejects(native.fetchGIFPage(null, page), /too large/);
    } finally { globalThis.fetch = saved; }
});
