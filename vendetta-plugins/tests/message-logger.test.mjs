import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import test from "node:test";
import patcher from "spitroast";

// Execute the shipped IIFE with Vendetta's real patcher and strict simulated stores.
const bundle = readFileSync(process.env.MESSAGE_LOGGER_BUNDLE ?? new URL("../dist/message-logger/index.js", import.meta.url), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(options = {}) {
  const cache = new Map(), events = [], requests = [], timers = new Map();
  let now = 0, timerId = 0, busy = false;
  const storage = { nopk: Boolean(options.nopk) };
  const key = (c, id) => `${c}:${id}`;
  const timeout = (fn, delay = 0) => { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; };
  async function advance(ms = 1000) {
    const target = now + ms;
    let iterations = 0;
    await tick();
    while (true) {
      const next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      assert.ok(++iterations < 10000, "timer loop must remain bounded");
      timers.delete(next[0]); now = next[1].at; next[1].fn(); await tick();
    }
    now = target;
  }
  function record(data) {
    return Object.freeze({ ...data, toJS() { throw new Error("Do not serialize normalized message records"); } });
  }
  const utils = {
    createMessageRecord() { throw new Error("Do not reconstruct a normalized record as gateway data"); },
    updateMessageRecord(old, update) {
      assert.equal(this, utils);
      if (options.failUpdate) throw new Error("store failed");
      // No normalized embeds, author objects, timestamps, or native props may leak.
      if (options.strictUpdate !== false) assert.deepEqual(Object.keys(update).sort(), ["channel_id", "content", "id"]);
      return record({ ...old, ...update });
    },
  };
  const store = {
    getMessage(c, id) { if (options.brokenStore) throw new Error("cache not ready"); return cache.get(key(c, id)); },
    getMessages: (c) => ({ get: (id) => cache.get(key(c, id)) }),
  };
  const channelMessages = { _channelMessages: {}, get: store.getMessages };
  class RowManager {
    generate(data) {
      if (!data?.message) return;
      return Object.freeze({ message: Object.freeze({ content: data.message.content, edited: false }), backgroundHighlight: Object.freeze({ type: 0 }) });
    }
  }
  const dispatcher = {
    isDispatching: () => busy,
    dispatch(event, extra) {
      assert.equal(this, dispatcher);
      assert.equal(busy, false, "synthetic dispatch must not run inside Flux notifications");
      events.push({ event, extra, at: now });
      const c = event?.channelId ?? event?.channel_id;
      if (event?.type === "MESSAGE_DELETE_BULK" && event.__vml_cleanup && c === options.failCleanupChannel) throw new Error("channel already unloaded");
      if (event?.type === "MESSAGE_UPDATE") {
        const k = key(event.message.channel_id, event.message.id), old = cache.get(k);
        if (old) cache.set(k, utils.updateMessageRecord(old, event.message));
      } else if (event?.type === "MESSAGE_DELETE") cache.delete(key(c, event.id));
      else if (event?.type === "MESSAGE_DELETE_BULK") {
        if (Array.isArray(event.ids)) for (const id of event.ids) cache.delete(key(c, id));
      } else if (event?.type === "LOGOUT") cache.clear();
      else if (event?.type === "CHANNEL_DELETE") {
        for (const [k, m] of cache) if (m.channel_id === event.channel?.id) cache.delete(k);
      }
      return "original-return";
    },
  };
  const originalDispatch = dispatcher.dispatch, originalUpdate = utils.updateMessageRecord, originalGenerate = RowManager.prototype.generate;
  const React = { createElement: (type, props, ...children) => { assert.ok(type, "settings cannot render missing controls"); return { type, props, children }; } };
  const api = {
    metro: {
      findByProps(...props) {
        if (props[0] === "getMessage") return options.noStore || options.legacyCache ? undefined : store;
        if (props[0] === "_channelMessages") return options.noStore || options.modernCache ? undefined : channelMessages;
        if (props[0] === "updateMessageRecord") return options.noUtils ? undefined : utils;
      },
      findByName: () => RowManager,
      common: { FluxDispatcher: dispatcher, ReactNative: { ScrollView: "scroll", View: "view", Text: "text", Switch: "switch", useColorScheme: () => "dark", processColor: (v) => v }, React },
    },
    patcher: options.patcher ?? patcher,
    plugin: { storage }, storage: { useProxy() {} },
    // Deliberately absent in modern Discord. The plugin must not depend on Forms.
    ui: options.noForms ? { components: {}, assets: {} } : { components: { Forms: { FormIcon: "icon", FormSwitchRow: "switch" } }, assets: { getAssetIDByName: () => 1 } },
  };
  const plugin = runInNewContext(bundle, {
    vendetta: api, setTimeout: timeout, clearTimeout: (id) => timers.delete(id),
    AbortController: options.noAbort ? undefined : AbortController,
    fetch(...args) {
      requests.push(args);
      return options.fetch ? options.fetch(...args) : Promise.reject(new Error("offline"));
    },
  });
  function add(id, fields = {}) {
    const value = record({ id, channel_id: "c", content: "hello", author: Object.freeze({ id: "user" }), attachments: Object.freeze([{ id: "a", url: "https://example.test/a.png" }]), timestamp: new Date(0), reactions: Object.freeze([{ count: 1 }]), flags: 0, ...fields });
    cache.set(key(value.channel_id, id), value); return value;
  }
  const remove = (id, fields = {}) => dispatcher.dispatch({ type: "MESSAGE_DELETE", channelId: "c", id, ...fields });
  return { plugin, add, remove, store, cache, events, requests, storage, dispatcher, utils, RowManager, originalDispatch, originalUpdate, originalGenerate, advance, timers, setBusy: (v) => { busy = v; } };
}

test("published manifest hashes the exact executable bundle", () => {
  const m = JSON.parse(readFileSync(new URL("../dist/message-logger/manifest.json", import.meta.url)));
  assert.equal(m.version, "1.2.0"); assert.equal(m.main, "index.js");
  assert.equal(m.hash, createHash("sha256").update(bundle).digest("hex"));
});

test("labels frozen records without rebuilding attachments or touching native rows", async () => {
  const h = setup({ modernCache: true }); h.plugin.onLoad();
  const old = h.add("a"); h.remove("a");
  assert.equal(h.events.length, 0, "updates must be deferred");
  await h.advance();
  const result = h.store.getMessage("c", "a");
  assert.equal(result.content, "[deleted] hello");
  for (const field of ["author", "attachments", "timestamp", "reactions"]) assert.equal(result[field], old[field]);
  assert.equal(h.utils.updateMessageRecord, h.originalUpdate);
  assert.equal(h.RowManager.prototype.generate, h.originalGenerate);
  assert.equal(new h.RowManager().generate({ message: result }).message.edited, false);
  h.plugin.onUnload(); assert.equal(h.timers.size, 0);
});

test("works without legacy record utilities or Discord Forms", async () => {
  const h = setup({ noUtils: true, noForms: true }); h.plugin.onLoad();
  assert.doesNotThrow(() => h.plugin.settings());
  h.add("a"); h.remove("a"); await h.advance();
  assert.equal(h.store.getMessage("c", "a").content, "[deleted] hello"); h.plugin.onUnload();
});

test("legacy store, attachment-only messages and duplicate deletes are supported", async () => {
  const h = setup({ legacyCache: true }); h.plugin.onLoad(); h.add("a", { content: "" });
  h.remove("a"); h.remove("a"); await h.advance(); h.remove("a"); await h.advance();
  assert.equal(h.store.getMessage("c", "a").content, "[deleted] ");
  assert.equal(h.events.filter((x) => x.event.type === "MESSAGE_UPDATE").length, 1); h.plugin.onUnload();
});

test("mixed bulk deletions preserve cached messages and forward remaining IDs and arguments", async () => {
  const h = setup(); h.plugin.onLoad(); h.add("a"); h.add("b"); h.add("failed", { state: "SEND_FAILED" });
  const event = { type: "MESSAGE_DELETE_BULK", channelId: "c", ids: ["a", "b", "failed", "missing"] };
  assert.equal(h.dispatcher.dispatch(event, "extra"), "original-return");
  assert.deepEqual(Array.from(h.events[0].event.ids), ["failed", "missing"]);
  assert.equal(h.events[0].extra, "extra"); assert.deepEqual(event.ids, ["a", "b", "failed", "missing"]);
  await h.advance(); assert.ok(h.store.getMessage("c", "a")); assert.ok(h.store.getMessage("c", "b")); h.plugin.onUnload();
});

test("failed, system, ephemeral, malformed and unrelated events pass through", () => {
  const h = setup(); h.plugin.onLoad();
  for (const [id, fields] of [["failed", { state: "SEND_FAILED" }], ["system", { author: { id: "1" } }], ["ephemeral", { flags: 64 }], ["bad", { content: {} }]]) {
    h.add(id, fields); assert.equal(h.remove(id), "original-return"); assert.equal(h.store.getMessage("c", id), undefined);
  }
  for (const event of [null, { type: "TYPING_START" }, { type: "MESSAGE_DELETE_BULK", channelId: "c", ids: null }]) {
    assert.equal(h.dispatcher.dispatch(event, 42), "original-return"); assert.equal(h.events.at(-1).event, event); assert.equal(h.events.at(-1).extra, 42);
  }
  h.plugin.onUnload();
});

test("cleanup events cancel pending updates instead of resurrecting a message", async () => {
  const h = setup(); h.plugin.onLoad(); h.add("a"); h.remove("a"); h.remove("a", { __vml_cleanup: true });
  await h.advance(); assert.equal(h.cache.size, 0); assert.equal(h.events.some((x) => x.event.type === "MESSAGE_UPDATE"), false); h.plugin.onUnload();
});

test("later content updates keep one label without mutating the input event", async () => {
  const h = setup(); h.plugin.onLoad(); h.add("a"); h.remove("a"); await h.advance();
  const event = { type: "MESSAGE_UPDATE", message: { id: "a", channel_id: "c", content: "changed" } };
  h.dispatcher.dispatch(event); assert.equal(h.store.getMessage("c", "a").content, "[deleted] changed"); assert.equal(event.message.content, "changed"); h.plugin.onUnload();
});

test("update failures fall back to ordinary deletion without escaping the timer", async () => {
  const h = setup({ failUpdate: true }); h.plugin.onLoad(); h.add("a"); h.remove("a"); await h.advance();
  assert.equal(h.cache.size, 0); assert.equal(h.events.at(-1).event.type, "MESSAGE_DELETE"); h.plugin.onUnload();
});

test("cache failures fail open", () => {
  const h = setup({ brokenStore: true }); h.plugin.onLoad(); h.add("a"); assert.equal(h.remove("a"), "original-return"); assert.equal(h.cache.size, 0); h.plugin.onUnload();
});

test("evicted cache entries do not cause updates or crashes", async () => {
  const h = setup(); h.plugin.onLoad(); h.add("a"); h.remove("a"); h.cache.clear(); await h.advance();
  assert.equal(h.events.length, 0); h.plugin.onUnload();
});

test("deletions during Flux notification wait until dispatch is safe", async () => {
  const h = setup(); h.plugin.onLoad(); h.add("a"); h.setBusy(true); h.remove("a"); await h.advance(64);
  assert.equal(h.events.length, 0); h.setBusy(false); await h.advance(); assert.equal(h.store.getMessage("c", "a").content, "[deleted] hello"); h.plugin.onUnload();
});

test("large bulk updates are split into at most ten operations per tick", async () => {
  const h = setup(); h.plugin.onLoad(); const ids = Array.from({ length: 30 }, (_, i) => String(i));
  ids.forEach((id) => h.add(id)); h.dispatcher.dispatch({ type: "MESSAGE_DELETE_BULK", channelId: "c", ids });
  assert.equal(h.events.length, 0); await h.advance(16); assert.equal(h.events.length, 10); await h.advance(16); assert.equal(h.events.length, 20);
  await h.advance(); assert.equal(h.events.length, 30); h.plugin.onUnload();
});

test("oldest entries are evicted at fifty per channel", async () => {
  const h = setup(); h.plugin.onLoad();
  for (let i = 0; i < 80; i++) { h.add(String(i)); h.remove(String(i)); }
  await h.advance(); assert.equal(h.cache.size, 50); assert.equal(h.store.getMessage("c", "0"), undefined); assert.ok(h.store.getMessage("c", "79")); h.plugin.onUnload();
});

test("total retained history stays at two hundred across channels", async () => {
  const h = setup(); h.plugin.onLoad();
  for (let i = 0; i < 250; i++) { const c = "c" + Math.floor(i / 25); h.add(String(i), { channel_id: c }); h.remove(String(i), { channelId: c }); }
  await h.advance(); assert.equal(h.cache.size, 200); assert.ok(h.store.getMessage("c9", "249")); h.plugin.onUnload();
});

test("a two-thousand-message burst cannot create unbounded queued work", async () => {
  const h = setup(); h.plugin.onLoad();
  for (let i = 0; i < 2000; i++) { h.add(String(i)); h.remove(String(i)); }
  const before = h.events.length; assert.ok(h.cache.size <= 400);
  await h.advance(); assert.ok(h.events.length - before <= 400); assert.equal(h.cache.size, 50); assert.equal(h.timers.size, 0); h.plugin.onUnload();
});

test("unload removes pending entries and evictions, restores dispatch and allows reload", async () => {
  const h = setup(); h.plugin.onLoad(); h.plugin.onLoad();
  for (let i = 0; i < 80; i++) { h.add(String(i)); h.remove(String(i)); } h.add("live");
  h.plugin.onUnload(); h.plugin.onUnload(); assert.equal(h.cache.size, 1); assert.equal(h.dispatcher.dispatch, h.originalDispatch); assert.equal(h.timers.size, 0);
  h.plugin.onLoad(); h.add("again"); h.remove("again"); await h.advance(); assert.ok(h.store.getMessage("c", "again")); h.plugin.onUnload();
});

test("unloading inside a dispatch defers cleanup and never dispatches recursively", async () => {
  const h = setup(); h.plugin.onLoad(); h.add("a"); h.remove("a"); h.setBusy(true); h.plugin.onUnload();
  await h.advance(32); assert.equal(h.events.length, 0); h.setBusy(false); await h.advance(); assert.equal(h.cache.size, 0); assert.equal(h.timers.size, 0);
});

test("logout and channel deletion cancel queued work", async () => {
  for (const event of [{ type: "LOGOUT" }, { type: "CHANNEL_DELETE", channel: { id: "c" } }]) {
    const h = setup(); h.plugin.onLoad(); h.add("a"); h.remove("a"); h.dispatcher.dispatch(event); await h.advance();
    assert.equal(h.cache.size, 0); assert.equal(h.events.some((x) => x.event.type === "MESSAGE_UPDATE"), false); h.plugin.onUnload();
  }
});

test("unsupported stores and patch failures leave no hooks or timers", () => {
  for (const options of [{ noStore: true }, { patcher: { instead() { throw new Error("patch failed"); } } }]) {
    const h = setup(options); assert.throws(() => h.plugin.onLoad(), /unsupported message store|patch failed/);
    assert.equal(h.dispatcher.dispatch, h.originalDispatch); assert.equal(h.RowManager.prototype.generate, h.originalGenerate); assert.equal(h.timers.size, 0);
  }
});

test("PluralKit stays opt-in and network errors are handled", async () => {
  const h = setup(); h.plugin.onLoad(); h.add("a"); h.remove("a"); await h.advance(); assert.equal(h.requests.length, 0);
  h.storage.nopk = true; h.add("b"); h.remove("b"); await h.advance(); assert.equal(h.requests.length, 1); assert.ok(h.store.getMessage("c", "b")); h.plugin.onUnload();
});

test("PluralKit removes only confirmed originals and respects keep_proxy/non-OK", async () => {
  for (const [keep, ok, retained] of [[false, true, false], [true, true, true], [false, false, true]]) {
    const h = setup({ nopk: true, fetch: async () => ({ ok, json: async () => ({ original: "a", member: { keep_proxy: keep } }) }) });
    h.plugin.onLoad(); h.add("a"); h.remove("a"); await h.advance(); assert.equal(Boolean(h.store.getMessage("c", "a")), retained); h.plugin.onUnload();
  }
});

test("PluralKit concurrency is bounded and unload aborts active requests", async () => {
  const h = setup({ nopk: true, fetch: () => new Promise(() => {}) }); h.plugin.onLoad();
  for (let i = 0; i < 20; i++) { h.add(String(i)); h.remove(String(i)); }
  await h.advance(); assert.equal(h.requests.length, 2); h.plugin.onUnload();
  assert.ok(h.requests.every(([, options]) => options.signal.aborted)); assert.equal(h.timers.size, 0);
});

test("PluralKit timeouts abort the request without removing retained messages", async () => {
  const h = setup({ nopk: true, fetch: (_, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) });
  h.plugin.onLoad(); h.add("a"); h.remove("a"); await h.advance(11000);
  assert.equal(h.requests[0][1].signal.aborted, true); assert.ok(h.store.getMessage("c", "a")); assert.equal(h.timers.size, 0); h.plugin.onUnload();
});

test("a stale PluralKit response cannot delete a message after reload", async () => {
  let resolve;
  const h = setup({ nopk: true, fetch: () => new Promise((r) => { resolve = r; }) }); h.plugin.onLoad(); h.add("a"); h.remove("a"); await h.advance();
  h.plugin.onUnload(); h.storage.nopk = false; h.plugin.onLoad(); h.add("a"); h.remove("a"); await h.advance(); h.storage.nopk = true;
  resolve({ ok: true, json: async () => ({ original: "a", member: { keep_proxy: false } }) }); await h.advance();
  assert.ok(h.store.getMessage("c", "a")); h.plugin.onUnload();
});

test("old runtimes without AbortController skip optional PluralKit lookups", async () => {
  const h = setup({ nopk: true, noAbort: true }); h.plugin.onLoad(); h.add("a"); h.remove("a"); await h.advance();
  assert.equal(h.requests.length, 0); assert.ok(h.store.getMessage("c", "a")); h.plugin.onUnload();
});

test("rapid re-enable drains deferred unload cleanup without stranding cached rows", async () => {
  const h = setup(); h.plugin.onLoad(); h.add("old"); h.remove("old"); h.setBusy(true); h.plugin.onUnload(); h.plugin.onLoad();
  h.setBusy(false); h.add("new"); h.remove("new"); await h.advance();
  assert.equal(h.store.getMessage("c", "old"), undefined); assert.equal(h.store.getMessage("c", "new").content, "[deleted] hello"); h.plugin.onUnload();
});

test("failure of one cleanup does not skip other messages or channels", async () => {
  const h = setup({ failCleanupChannel: "c" }); h.plugin.onLoad(); h.add("a"); h.remove("a"); h.add("b", { channel_id: "other" }); h.remove("b", { channelId: "other" }); await h.advance();
  h.plugin.onUnload(); assert.equal(h.store.getMessage("other", "b"), undefined); assert.equal(h.timers.size, 0); assert.equal(h.dispatcher.dispatch, h.originalDispatch);
});
