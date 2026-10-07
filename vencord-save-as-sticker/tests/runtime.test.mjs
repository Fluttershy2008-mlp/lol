import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { gifFixture } from "./gif-fixture.mjs";

await mkdir(new URL("../.test-build/", import.meta.url), { recursive: true });
const state = { guilds: {}, stickers: {}, permissions: {}, posts: [], events: [], modals: [], closed: [], reply: null };
globalThis.__sasMock = {
    Constants: { Endpoints: { GUILD_STICKER_PACKS: id => `/guilds/${id}/stickers` } },
    FluxDispatcher: { dispatch: event => state.events.push(event) },
    GuildStore: { getGuilds: () => state.guilds, getGuild: id => state.guilds[id] },
    PermissionsBits: { CREATE_GUILD_EXPRESSIONS: 1n << 43n },
    PermissionStore: { getGuildPermissions: ({ id }) => state.permissions[id] ?? 0n },
    RestAPI: { post: async options => { state.posts.push(options); return state.reply ? state.reply() : { body: { id: "sticker1", name: "saved" } }; } },
    StickersStore: { getStickersByGuildId: id => state.stickers[id] },
    UserStore: { getCurrentUser: () => ({ id: "me" }) },
    closeModal: key => state.closed.push(key),
    openModal: (render, options) => state.modals.push({ render, options }),
    IconUtils: {},
    Menu: { MenuItem: "MenuItem", MenuGroup: "MenuGroup" },
    Modal: "Modal",
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    showToast() {}, useStateFromStores() {}
};
for (const file of ["media.ts", "upload.ts", "index.tsx"]) {
    await build({
        entryPoints: [new URL(`../saveAsSticker/${file}`, import.meta.url).pathname],
        outfile: new URL(`../.test-build/${file.split(".")[0]}.mjs`, import.meta.url).pathname,
        bundle: true, platform: "browser", format: "esm", jsxFactory: "React.createElement", loader: { ".css": "empty" },
        plugins: [{ name: "vencord-mocks", setup(b) {
            b.onResolve({ filter: /^@/ }, args => ({ path: args.path, namespace: "mock" }));
            b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "@webpack/common"
                ? Object.keys(globalThis.__sasMock).map(k => `export const ${k} = globalThis.__sasMock.${k};`).join("\n")
                : args.path === "@utils/types" ? "export default p => p;"
                : args.path === "@utils/discord" ? "export const getGuildAcronym = g => g.name;"
                : "export const findGroupChildrenByChildId = () => null;" }));
        } }]
    });
}
const media = await import("../.test-build/media.mjs");
const upload = await import("../.test-build/upload.mjs");
const plugin = (await import("../.test-build/index.mjs")).default;
const image = new Blob([gifFixture()], { type: "image/gif" });
const prepared = await media.prepareSticker(image, true);
const guild = (id, values = {}) => ({ id, name: id, ownerId: "me", premiumTier: 0, features: new Set(), ...values });
function reset() {
    state.guilds = { a: guild("a") }; state.stickers = { a: [] }; state.permissions = {};
    state.posts = []; state.events = []; state.reply = null;
}

test("selected attachment preserves signed GIF URL and removes preview transforms", () => {
    const original = "https://cdn.discordapp.com/attachments/1/2/pony.gif?ex=abc&is=def&hm=secret";
    const message = { attachments: [{ url: "https://cdn.discordapp.com/other.png" }, { url: original, filename: "pony.gif" }] };
    const selected = media.resolveMedia({ message, itemSrc: original.replace("cdn.discordapp.com", "media.discordapp.net") + "&format=webp&width=64" });
    assert.equal(selected.length, 1); assert.equal(selected[0].url, original); assert.equal(selected[0].gif, true);
    assert.equal(media.originalURL(original + "&format=png&height=80&animated=false"), original);
});

test("GIF embeds prefer original animation, then use their own MP4 preview", () => {
    const embed = { type: "gifv", url: "https://tenor.com/view/123", video: { url: "https://media.tenor.com/abc/pony.mp4" }, thumbnail: { url: "https://media.tenor.com/abc/pony.gif" } };
    assert.equal(media.resolveMedia({ message: { embeds: [embed] }, itemHref: embed.url })[0].gif, true);
    embed.thumbnail.url = "https://media.tenor.com/abc/pony.png";
    const selected = media.resolveMedia({ message: { embeds: [embed], attachments: [{ url: "https://example.com/other.png" }] }, itemSrc: embed.video.url });
    assert.equal(selected.length, 1);
    assert.equal(selected[0].url, embed.video.url);
    assert.equal(selected[0].video, true);
    assert.equal(selected[0].gif, true);
    assert.deepEqual(media.resolveMedia({ itemSrc: "file:///etc/passwd.png" }), []);
});

test("linked GIFV with only a still thumbnail and video exposes one animated source", () => {
    const embed = { type: "gifv", url: "https://tenor.com/view/pinkie-123", title: "Pinkie smile",
        thumbnail: { url: "https://media.tenor.com/abc/pinkie.png" },
        video: { url: "https://media.tenor.com/abc/pinkie.mp4", proxyURL: "https://media.discordapp.net/external/abc/pinkie.mp4" } };
    const sources = media.resolveMedia({ message: { embeds: [embed] } });
    assert.equal(sources.length, 1);
    assert.equal(sources[0].name, "Pinkie smile");
    assert.equal(sources[0].url, embed.video.url);
    assert.deepEqual(sources[0].fallbackUrls, [embed.video.proxyURL]);
    assert.equal(sources[0].video, true);
    assert.equal(media.resolveMedia({ itemSrc: embed.video.url })[0].video, true);
});

test("ordinary videos and unrelated clicked links still cannot select a different image", () => {
    const message = { attachments: [{ url: "https://example.com/other.png" }], embeds: [{ type: "video", url: "https://example.com/movie", video: { url: "https://example.com/movie.mp4" } }] };
    assert.deepEqual(media.resolveMedia({ message, itemHref: "https://example.com/movie" }), []);
    assert.deepEqual(media.resolveMedia({ message, itemSrc: "https://example.com/movie.mp4" }), []);
});

test("an unavailable original falls back to the animated proxy, not a still thumbnail", async () => {
    const saved = globalThis.fetch, requests = [];
    const mp4Header = Uint8Array.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109]);
    try {
        globalThis.fetch = async url => {
            requests.push(url);
            return url.endsWith(".gif") ? new Response("still preview", { headers: { "content-type": "image/png" } })
                : new Response(mp4Header, { headers: { "content-type": "video/mp4" } });
        };
        const downloaded = await media.downloadMedia({ url: "https://example.com/a.gif", gif: true, video: true, fallbackUrls: ["https://example.com/a.mp4"] }, new AbortController().signal);
        assert.equal(downloaded.type, "video/mp4");
        assert.deepEqual(requests, ["https://example.com/a.gif", "https://example.com/a.mp4"]);
    } finally { globalThis.fetch = saved; }
});

test("message with multiple images exposes choices and decodes filenames", () => {
    const images = media.resolveMedia({ message: { attachments: [{ url: "https://example.com/pony%20smile.png" }, { url: "https://example.com/pony.gif" }, { url: "https://example.com/pony.gif" }] } });
    assert.equal(images.length, 2); assert.equal(images[0].name, "pony smile");
    assert.equal(media.stickerName("x.png"), "sticker");
});

test("download requests omit credentials, reject HTTP failures, and enforce streaming limit", async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async (_url, options) => {
            assert.equal(options.credentials, "omit");
            return new Response(gifFixture(), { headers: { "content-type": "image/gif" } });
        };
        const downloaded = await media.downloadMedia({ url: "https://example.com/a.gif" }, new AbortController().signal);
        assert.equal(downloaded.type, "image/gif");
        globalThis.fetch = async () => new Response("missing", { status: 403 });
        await assert.rejects(media.downloadMedia({ url: "https://example.com/a.gif" }, new AbortController().signal), /403/);
        globalThis.fetch = async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(media.MAX_DOWNLOAD_BYTES + 1)); c.close(); } }));
        await assert.rejects(media.downloadMedia({ url: "https://example.com/a.gif" }, new AbortController().signal), /25 MiB/);
        globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
        await assert.rejects(media.downloadMedia({ url: "https://example.com/a.gif" }, new AbortController().signal), /Choose original file/);
    } finally { globalThis.fetch = originalFetch; }
});

test("GIF Blob stays animated and fake GIF previews fail before image decoding", async () => {
    const bytes = new Uint8Array(await prepared.blob.arrayBuffer());
    assert.equal(prepared.blob.type, "image/gif"); assert.equal(prepared.extension, "gif");
    assert.equal(String.fromCharCode(...bytes.slice(0, 6)), "GIF89a");
    await assert.rejects(media.prepareSticker(new Blob(["PNG preview"], { type: "image/png" }), true), /preview instead of a GIF/);
    await assert.rejects(media.prepareSticker(new Blob(["mp4 video"])), /Video previews/);
});

test("full servers stay in picker, permissions are respected, and tierless slots are not double-counted", () => {
    reset(); state.guilds.b = guild("b", { ownerId: "other" }); state.guilds.c = guild("c", { ownerId: "other" });
    state.permissions.b = 1n << 43n; state.stickers.a = Array(5).fill({});
    assert.deepEqual(upload.eligibleGuilds().map(g => g.id), ["a", "b"]);
    assert.equal(upload.stickerSlots(state.guilds.a).full, true);
    assert.equal(upload.stickerSlots(guild("x", { premiumTier: 1, premiumFeatures: { additionalStickerSlots: 10 } })).max, 15);
    assert.equal(upload.stickerSlots(guild("x", { premiumTier: 3, features: new Set(["MORE_STICKERS"]) })).max, 120);
});

test("upload rechecks permissions and capacity, sends animated multipart file, refreshes store", async () => {
    reset(); state.guilds.a.ownerId = "other";
    await assert.rejects(upload.uploadSticker("a", "pony", prepared), /permission/);
    assert.equal(state.posts.length, 0);
    state.permissions.a = 1n << 43n; state.stickers.a = Array(5).fill({});
    await assert.rejects(upload.uploadSticker("a", "pony", prepared), /no free sticker slots/);
    state.stickers.a = [];
    await assert.rejects(upload.uploadSticker("a", "x", prepared), /2 and 30/);
    await upload.uploadSticker("a", "pony", prepared);
    assert.equal(state.posts.length, 1);
    const { url, body, retries } = state.posts[0];
    assert.equal(url, "/guilds/a/stickers"); assert.equal(retries, 0);
    assert.equal(body.get("name"), "pony"); assert.equal(body.get("tags"), "🙂");
    assert.equal(body.get("file").name, "pony.gif"); assert.equal(body.get("file").type, "image/gif");
    assert.equal(state.events[0].type, "GUILD_STICKERS_CREATE_SUCCESS");
});

test("duplicate submissions and cancellation cannot send another upload", async () => {
    reset(); let finish;
    state.reply = () => new Promise(resolve => { finish = resolve; });
    const first = upload.uploadSticker("a", "pony", prepared);
    await assert.rejects(upload.uploadSticker("a", "pony", prepared), /already being uploaded/);
    assert.equal(state.posts.length, 1);
    finish({ body: { id: "created" } }); await first;
    await assert.rejects(upload.uploadSticker("a", "pony", prepared, () => { throw new Error("Cancelled"); }), /Cancelled/);
    assert.equal(state.posts.length, 1);
});

test("failed POST is never retried and errors explain permission, capacity, or rate limits", async () => {
    reset(); state.reply = () => { throw { body: { code: 50013 } }; };
    await assert.rejects(upload.uploadSticker("a", "pony", prepared));
    assert.equal(state.posts.length, 1);
    assert.match(upload.errorText({ body: { code: 50013 } }), /Create Expressions/);
    assert.match(upload.errorText({ text: '{"code":30039}' }), /no free sticker slots/);
    assert.match(upload.errorText({ status: 429 }), /rate limiting/);
});

test("both Vencord menus open the selected image and disabling closes the picker", () => {
    plugin.start();
    for (const [id, props] of [["message", { itemSrc: "https://example.com/pony.gif" }], ["image-context", { src: "https://example.com/pony.gif" }],
        ["message", { message: { embeds: [{ type: "gifv", url: "https://tenor.com/view/pony-123", video: { url: "https://media.tenor.com/abc/pony.mp4" }, thumbnail: { url: "https://media.tenor.com/abc/pony.png" } }] } }]]) {
        const children = [];
        plugin.contextMenus[id](children, props);
        const item = children[0].props.children[0];
        assert.equal(item.props.label, "Save as Sticker"); item.props.action();
        const modal = state.modals.at(-1).render({ onClose() {}, transitionState: 1 });
        assert.equal(modal.props.source.url, props.message ? "https://media.tenor.com/abc/pony.mp4" : "https://example.com/pony.gif");
    }
    plugin.stop();
    const controller = state.modals.at(-1).render({ onClose() {}, transitionState: 1 }).props.controller;
    assert.equal(controller.signal.aborted, true);
    assert.ok(state.closed.includes("vc-save-as-sticker"));
});
