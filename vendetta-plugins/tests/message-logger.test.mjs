import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import test from "node:test";
import patcher from "spitroast";

// Exercise the shipped IIFE with Vendetta's real patcher and a simulated Flux store.
const bundle = readFileSync(new URL("../dist/message-logger/index.js", import.meta.url), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup(options = {}) {
  const cache = new Map();
  const events = [];
  const requests = [];
  const storage = { nopk: Boolean(options.nopk) };
  const cacheKey = (channelId, id) => `${channelId}:${id}`;
  function record(data, reactions = []) {
    // Model records which are frozen and strip unknown custom properties.
    const { __vml_deleted, ...fields } = data;
    const result = { ...fields, reactions };
    result.toJS = () => ({ ...fields, reactions });
    return Object.freeze(result);
  }
  const utils = {
    createMessageRecord: record,
    updateMessageRecord(old, update, ...rest) {
      assert.equal(this, utils);
      if (options.checkUpdateArgs) options.checkUpdateArgs(rest);
      return record({ ...old.toJS(), ...update }, old.reactions);
    },
  };
  const store = {
    getMessage: (channelId, id) => cache.get(cacheKey(channelId, id)),
    getMessages: (channelId) => ({ get: (id) => cache.get(cacheKey(channelId, id)) }),
  };
  const channelMessages = { _channelMessages: {}, get: store.getMessages };
  class RowManager {
    generate(data) {
      if (!data?.message) return options.emptyRow;
      return Object.freeze({
        message: Object.freeze({ content: data.message.content, edited: "original" }),
        backgroundHighlight: { retained: true },
      });
    }
  }
  const dispatcher = {
    dispatch(event, extra) {
      assert.equal(this, dispatcher);
      if (options.failUpdate && event.type === "MESSAGE_UPDATE") throw new Error("store failed");
      events.push({ event, extra });
      const channelId = event.channelId ?? event.channel_id;
      if (event.type === "MESSAGE_UPDATE") {
        const k = cacheKey(event.message.channel_id, event.message.id);
        const old = cache.get(k);
        if (old) cache.set(k, utils.updateMessageRecord(old, event.message));
      } else if (event.type === "MESSAGE_DELETE") {
        cache.delete(cacheKey(channelId, event.id));
      } else if (event.type === "MESSAGE_DELETE_BULK") {
        for (const id of event.ids ?? []) cache.delete(cacheKey(channelId, id));
      }
      return "original-return";
    },
  };
  const originalDispatch = dispatcher.dispatch;
  const originalUpdate = utils.updateMessageRecord;
  const originalGenerate = RowManager.prototype.generate;
  const React = { createElement: (...args) => args };
  const api = {
    metro: {
      findByProps: (...props) => {
        if (props[0] === "getMessage") return options.legacyCache ? undefined : store;
        if (props[0] === "_channelMessages") return options.modernCache ? undefined : channelMessages;
        if (props[0] === "updateMessageRecord") return options.missingUtils ? undefined : utils;
      },
      findByName: (name) => name === "RowManager" && !options.noRows
        ? options.defaultRows ? { default: RowManager } : RowManager
        : undefined,
      common: { FluxDispatcher: dispatcher, ReactNative: { processColor: (v) => v, ScrollView: "ScrollView" }, React },
    },
    patcher,
    plugin: { storage },
    storage: { useProxy() {} },
    ui: { components: { Forms: { FormIcon: "icon", FormSwitchRow: "switch" } }, assets: { getAssetIDByName: () => 1 } },
  };
  const plugin = runInNewContext(bundle, {
    vendetta: api,
    fetch: (...args) => {
      requests.push(args);
      return options.fetch ? options.fetch(...args) : Promise.reject(new Error("offline"));
    },
  });
  const add = (id, fields = {}) => {
    const value = record({ id, channel_id: "c", content: "hello", author: { id: "user" }, attachments: [{ id: "a" }], flags: 0, ...fields });
    cache.set(cacheKey(value.channel_id, id), value);
    return value;
  };
  const remove = (id, fields = {}) => dispatcher.dispatch({ type: "MESSAGE_DELETE", channelId: "c", id, ...fields });
  return { plugin, add, remove, store, cache, events, requests, storage, dispatcher, utils, RowManager, originalDispatch, originalUpdate, originalGenerate };
}

test("the distributed manifest points to this exact executable bundle", () => {
  const manifest = JSON.parse(readFileSync(new URL("../dist/message-logger/manifest.json", import.meta.url)));
  assert.equal(manifest.main, "index.js");
  assert.equal(manifest.hash, createHash("sha256").update(bundle).digest("hex"));
});

test("loads without MessageRecord, preserves content/attachments and highlights frozen rows", () => {
  const h = setup({ modernCache: true });
  h.plugin.onLoad();
  h.add("1"); h.remove("1");
  const retained = h.store.getMessage("c", "1");
  assert.equal(retained.content, "hello");
  assert.equal(retained.attachments[0].id, "a");
  assert.equal(retained.__vml_deleted, undefined);
  const row = new h.RowManager().generate({ rowType: 1, message: retained });
  assert.equal(row.message.edited, "deleted");
  assert.equal(row.backgroundHighlight.retained, true);
  assert.equal(row.backgroundHighlight.gutterColor, "#da373cff");
  assert.equal(new h.RowManager().generate({ rowType: 0 }), undefined);
  h.plugin.onUnload();
});

test("bulk deletion retains eligible messages and forwards ignored/uncached IDs with extra arguments", () => {
  const h = setup(); h.plugin.onLoad();
  h.add("a"); h.add("b"); h.add("failed", { state: "SEND_FAILED" });
  const event = { type: "MESSAGE_DELETE_BULK", channelId: "c", ids: ["a", "b", "failed", "missing"] };
  h.dispatcher.dispatch(event, "extra");
  assert.ok(h.store.getMessage("c", "a")); assert.ok(h.store.getMessage("c", "b"));
  assert.equal(h.store.getMessage("c", "failed"), undefined);
  assert.deepEqual(Array.from(h.events.at(-1).event.ids), ["failed", "missing"]);
  assert.equal(h.events.at(-1).extra, "extra");
  assert.deepEqual(event.ids, ["a", "b", "failed", "missing"]);
  h.plugin.onUnload();
});

test("unknown, failed, system, ephemeral, cleanup and unrelated events pass through normally", () => {
  const h = setup(); h.plugin.onLoad();
  for (const [id, fields] of [["failed", { state: "SEND_FAILED" }], ["system", { author: { id: "1" } }], ["ephemeral", { flags: 64 }]]) {
    h.add(id, fields); assert.equal(h.remove(id), "original-return");
    assert.equal(h.store.getMessage("c", id), undefined);
  }
  assert.equal(h.remove("missing"), "original-return");
  const event = { type: "TYPING_START", channelId: "c" };
  assert.equal(h.dispatcher.dispatch(event, 42), "original-return");
  assert.equal(h.events.at(-1).event, event);
  h.add("cleanup"); h.remove("cleanup"); h.remove("cleanup", { __vml_cleanup: true });
  assert.equal(h.store.getMessage("c", "cleanup"), undefined);
  h.plugin.onUnload();
});

test("legacy cache and missing RowManager use one visible fallback label with plain records", () => {
  const h = setup({ legacyCache: true, noRows: true }); h.plugin.onLoad();
  h.cache.set("c:plain", { id: "plain", channel_id: "c", author: { id: "u" }, content: "text", attachments: [] });
  h.remove("plain"); h.remove("plain");
  assert.equal(h.store.getMessage("c", "plain").content, "[deleted] text");
  h.plugin.onUnload();
});

test("default-export renderer and subsequent record updates preserve deletion highlighting", () => {
  const h = setup({ defaultRows: true, checkUpdateArgs: (args) => assert.equal(args[0], "extra") });
  h.plugin.onLoad(); h.add("a"); h.remove("a");
  const record = h.utils.updateMessageRecord(h.store.getMessage("c", "a"), { content: "updated" }, "extra");
  assert.equal(new h.RowManager().generate({ message: record }).message.edited, "deleted");
  h.plugin.onUnload();
});

test("unload removes every retained message, restores hooks and supports restarting", () => {
  const h = setup(); h.plugin.onLoad(); h.plugin.onLoad();
  for (const id of ["a", "b", "c"]) { h.add(id); h.remove(id); }
  h.add("live"); h.plugin.onUnload();
  assert.equal(h.cache.size, 1);
  assert.ok(h.store.getMessage("c", "live"));
  assert.equal(h.dispatcher.dispatch, h.originalDispatch);
  assert.equal(h.utils.updateMessageRecord, h.originalUpdate);
  assert.equal(h.RowManager.prototype.generate, h.originalGenerate);
  h.plugin.onUnload(); h.plugin.onLoad();
  h.add("again"); h.remove("again"); assert.ok(h.store.getMessage("c", "again"));
  h.plugin.onUnload();
});

test("unsupported modules report a useful error without leaving dispatcher patches", () => {
  const h = setup({ missingUtils: true });
  assert.throws(() => h.plugin.onLoad(), /message modules are unsupported/);
  assert.equal(h.dispatcher.dispatch, h.originalDispatch);
  assert.equal(h.RowManager.prototype.generate, h.originalGenerate);
});

test("a failed synthetic update falls back to the normal deletion", () => {
  const h = setup({ failUpdate: true }); h.plugin.onLoad();
  h.add("a"); h.remove("a");
  assert.equal(h.store.getMessage("c", "a"), undefined);
  assert.equal(h.events.at(-1).event.type, "MESSAGE_DELETE");
  h.plugin.onUnload();
});

test("PluralKit is opt-in and network failures are handled", async () => {
  const h = setup(); h.plugin.onLoad(); h.add("a"); h.remove("a");
  await tick(); assert.equal(h.requests.length, 0);
  h.storage.nopk = true; h.add("b"); h.remove("b");
  await tick(); assert.equal(h.requests.length, 1);
  assert.ok(h.store.getMessage("c", "b")); h.plugin.onUnload();
});

test("PluralKit removes confirmed proxy originals and respects keep_proxy/non-OK responses", async () => {
  for (const [keep, ok, retained] of [[false, true, false], [true, true, true], [false, false, true]]) {
    const h = setup({ nopk: true, fetch: async () => ({ ok, json: async () => ({ original: "a", member: { keep_proxy: keep } }) }) });
    h.plugin.onLoad(); h.add("a"); h.remove("a"); await tick();
    assert.equal(Boolean(h.store.getMessage("c", "a")), retained);
    h.plugin.onUnload();
  }
});

test("a late PluralKit response cannot delete a message after unload and re-enable", async () => {
  let resolve;
  const h = setup({ nopk: true, fetch: () => new Promise((r) => { resolve = r; }) });
  h.plugin.onLoad(); h.add("a"); h.remove("a"); await tick();
  h.plugin.onUnload(); h.storage.nopk = false; h.plugin.onLoad(); h.add("a"); h.remove("a"); h.storage.nopk = true;
  resolve({ ok: true, json: async () => ({ original: "a", member: { keep_proxy: false } }) });
  await tick(); assert.ok(h.store.getMessage("c", "a"));
  h.plugin.onUnload();
});
