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
  const cache = new Map(), events = [], requests = [], timers = new Map(), commands = [], pages = [], alerts = [];
  let now = 0, timerId = 0, busy = false;
  const storage = { nopk: Boolean(options.nopk), ...options.storage };
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
    getMessage(c, id) { if (options.brokenStore || options.brokenPrimary) throw new Error("cache not ready"); return cache.get(key(c, id)); },
    getMessages: (c) => { if (options.brokenStore) throw new Error("cache not ready"); return { get: (id) => cache.get(key(c, id)) }; },
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
      const c = event?.channelId ?? event?.channel_id ?? event?.message?.channel_id ?? event?.message?.channelId;
      if (event?.type === "MESSAGE_DELETE_BULK" && event.__vml_cleanup && c === options.failCleanupChannel) throw new Error("channel already unloaded");
      if (event?.type === "MESSAGE_UPDATE") {
        if (event.__vml_synthetic && options.asyncFailUpdate) return Promise.reject(new Error("async label rejected"));
        if (event.__vml_synthetic && options.labelPromise) return options.labelPromise();
        const k = key(event.message.channel_id ?? event.message.channelId ?? c, event.message.id), old = cache.get(k);
        if (old) cache.set(k, utils.updateMessageRecord(old, event.message));
      } else if (event?.type === "MESSAGE_DELETE") cache.delete(key(c, event.id ?? event.messageId ?? event.message?.id));
      else if (event?.type === "MESSAGE_DELETE_BULK") {
        if (Array.isArray(event.ids)) for (const id of event.ids) cache.delete(key(c, id));
      } else if (event?.type === "LOGOUT") cache.clear();
      else if (event?.type === "CHANNEL_DELETE") {
        for (const [k, m] of cache) if (m.channel_id === event.channel?.id) cache.delete(k);
      }
      return "original-return";
    },
  };
  if (options.mobileDispatch) {
    dispatcher.dirtyDispatch = dispatcher.dispatch;
    dispatcher.maybeDispatch = function (...args) { return this.dirtyDispatch(...args); };
    dispatcher.dispatch = function (...args) {
      return options.queuedDispatch ? Promise.resolve().then(() => this.maybeDispatch(...args)) : this.maybeDispatch(...args);
    };
  }
  const originalDirtyDispatch = dispatcher.dirtyDispatch, originalMaybeDispatch = dispatcher.maybeDispatch;
  const originalDispatch = dispatcher.dispatch, originalUpdate = utils.updateMessageRecord, originalGenerate = RowManager.prototype.generate;
  const React = {
    useState: value => [value, () => {}], useEffect() {},
    createElement: (type, props, ...children) => { assert.ok(type, "settings cannot render missing controls"); return { type, props, children }; },
  };
  const nativeKeys = ['BUNNY', 'BUNNY_PLUGINS', 'CUSTOMRPC_FLUTTERSHY_SETTINGS',
    'PROFILE_STATUS_PRESETS_FLUTTERSHY_SETTINGS', 'RELATIONSHIP_NOTIFIER_FLUTTERSHY_SETTINGS',
    'BUNNY_THEMES', 'BUNNY_FONTS', 'BUNNY_DEVELOPER', 'ACCOUNT_SWITCHER'];
  const nativeRows = nativeKeys.map(key => ({ key }));
  const nativeBase = Object.fromEntries(nativeKeys.map(key => [key, { type: 'pressable', parent: null }]));
  const settingConstants = {};
  Object.defineProperty(settingConstants, 'SETTING_RENDERER_CONFIG', {
    configurable: !options.lockedSettings, enumerable: true, get: () => ({ ...nativeBase }),
  });
  const settingsTree = {
    getAncestors(key) {
      const parents = [];
      let parent = settingConstants.SETTING_RENDERER_CONFIG[key].parent;
      while (parent != null) { parents.push(parent); parent = settingConstants.SETTING_RENDERER_CONFIG[parent].parent; }
      return parents;
    },
    isBlocked(key, blocked) { return [...this.getAncestors(key), key].some(id => blocked.has(id)); },
  };
  const settingsAPI = { registeredSections: { Revenge: nativeRows } };
  const originalGetAncestors = settingsTree.getAncestors;
  const splice = nativeRows.splice;
  nativeRows.splice = function (index, count, ...added) {
    for (const row of added) assert.doesNotThrow(() => settingsTree.getAncestors(row.key), 'register renderer before exposing row');
    return splice.call(this, index, count, ...added);
  };
  const api = {
    metro: {
      findByProps(...props) {
        if (props[0] === "getMessage") return options.noStore || options.legacyCache ? undefined : store;
        if (props[0] === "_channelMessages") return options.noStore || options.modernCache ? undefined : channelMessages;
        if (props[0] === "updateMessageRecord") return options.noUtils ? undefined : utils;
        if (props[0] === "getChannel") return { getChannel: id => ({ id, name: "channel " + id, guild_id: "guild", parent_id: "category" }) };
        if (props[0] === "getCurrentUser") return { getCurrentUser: () => ({ id: "self" }) };
        if (props[0] === "getRootNavigationRef") return options.noNavigation ? undefined : { getRootNavigationRef: () => ({ navigate: (...args) => pages.push(args) }) };
        if (props[0] === "SETTING_RENDERER_CONFIG") return options.shortcut ? settingConstants : undefined;
        if (props[0] === "getAncestors") return options.shortcut ? settingsTree : undefined;
      },
      findByName: () => RowManager,
      common: { FluxDispatcher: dispatcher, ReactNative: { ScrollView: "scroll", View: "view", Text: "text", Switch: "switch", TextInput: "input", Pressable: "button", FlatList: "list", Image: "image", Alert: { alert: (...args) => alerts.push(args) }, useColorScheme: () => "dark", processColor: (v) => v }, React },
    },
    commands: options.noCommands ? undefined : { registerCommand: command => { commands.push(command); return () => commands.splice(commands.indexOf(command), 1); } },
    patcher: options.patcher ?? patcher,
    plugin: { storage }, storage: { useProxy() {} },
    // Deliberately absent in modern Discord. The plugin must not depend on Forms.
    ui: options.noForms ? { components: {}, assets: {} } : { components: { Forms: { FormIcon: "icon", FormSwitchRow: "switch" } }, assets: { getAssetIDByName: () => 1 } },
  };
  const plugin = runInNewContext(bundle, {
    vendetta: api, setTimeout: timeout, clearTimeout: (id) => timers.delete(id),
    bunny: options.shortcut ? { ui: { settings: settingsAPI } } : undefined,
    AbortController: options.noAbort ? undefined : AbortController,
    fetch(...args) {
      requests.push(args);
      return options.fetch ? options.fetch(...args) : Promise.reject(new Error("offline"));
    },
  });
  function add(id, fields = {}) {
    const value = record({ id, channel_id: "c", content: "hello", author: Object.freeze({ id: "user" }), attachments: Object.freeze([{ id: "a", url: "https://example.test/a.png" }]), timestamp: new Date(0), reactions: Object.freeze([{ count: 1 }]), flags: 0, ...fields });
    cache.set(key(value.channel_id ?? value.channelId ?? "c", id), value); return value;
  }
  const remove = (id, fields = {}) => dispatcher.dispatch({ type: "MESSAGE_DELETE", channelId: "c", id, ...fields });
  function logs(channelId) {
    assert.equal(commands[0].execute([], { channel: { id: channelId } }), undefined, "local command must not return a message to send");
    const [route, params] = pages.at(-1); assert.equal(route, "BUNNY_CUSTOM_PAGE");
    const page = params.render();
    return nodes(page.type(page.props)).find(n => n.type === "list").props.data;
  }
  function clearAll() {
    nodes(plugin.settings()).find(n => n.props?.label === "Clear all history").props.onPress();
    alerts.at(-1)[2].find(button => button.text === "Clear").onPress();
  }
  return { plugin, add, remove, logs, clearAll, commands, pages, alerts, store, cache, events, requests, storage, dispatcher, utils, RowManager, nativeKeys, nativeRows, nativeBase, settingsAPI, settingConstants, settingsTree, originalGetAncestors, originalDispatch, originalDirtyDispatch, originalMaybeDispatch, originalUpdate, originalGenerate, advance, timers, setBusy: (v) => { busy = v; } };
}
function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (!element || typeof element !== "object") return [];
  return [element, ...nodes(element.children)];
}

test("published manifest hashes the exact executable bundle", () => {
  const m = JSON.parse(readFileSync(new URL("../dist/message-logger/manifest.json", import.meta.url)));
  assert.equal(m.version, "2.0.2"); assert.equal(m.main, "index.js");
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

test("label update failures preserve deleted messages instead of deleting them", async () => {
  const h = setup({ failUpdate: true }); h.plugin.onLoad(); h.add("a"); h.remove("a"); await h.advance();
  assert.equal(h.store.getMessage("c", "a").content, "hello");
  assert.equal(h.events.some(x => x.event.type.startsWith("MESSAGE_DELETE")), false);
  h.add("b"); h.remove("b"); await h.advance();
  assert.equal(h.store.getMessage("c", "b").content, "hello");
  assert.equal(h.events.filter(x => x.event.type === "MESSAGE_UPDATE").length, 1, "unsupported labels are not retried for each delete");
  h.clearAll(); await h.advance(); assert.equal(h.cache.size, 0); h.plugin.onUnload();
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

test("real edits keep chronological versions, blank content and deletion without synthetic edits", async () => {
  const h = setup({ strictUpdate: false }); h.plugin.onLoad(); h.add("a", { content: "original" });
  for (const [content, date] of [["changed", "2026-09-29T12:00:00Z"], ["", "2026-09-29T12:01:00Z"]]) {
    h.dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: "a", channel_id: "c", content, edited_timestamp: date } });
  }
  h.remove("a"); await h.advance(); h.remove("a");
  const log = h.logs()[0];
  assert.deepEqual(Array.from(log.edits, v => v.content), ["original", "changed"]);
  assert.equal(log.current.content, ""); assert.ok(log.deletedAt); assert.equal(log.current.time, "2026-09-29T12:01:00.000Z");
  assert.equal(h.store.getMessage("c", "a").content, "[deleted] ");
  assert.equal(JSON.stringify(h.storage).includes("original"), false, "message history must not be persisted in settings");
  h.plugin.onUnload(); assert.equal(h.commands.length, 0);
});

test("embed updates, repeated content, missing records and ephemeral updates create no fake edits", () => {
  const h = setup({ strictUpdate: false }); h.plugin.onLoad(); h.add("a");
  for (const message of [
    { id: "a", channel_id: "c", embeds: [] }, { id: "a", channel_id: "c", content: "hello" },
    { id: "missing", channel_id: "c", content: "unknown" }, { id: "a", channel_id: "c", content: "secret", flags: 64 },
  ]) h.dispatcher.dispatch({ type: "MESSAGE_UPDATE", message });
  assert.equal(h.logs().length, 0); h.plugin.onUnload();
});

test("attachment removal preserves detached metadata without changing Discord attachments", () => {
  const h = setup({ strictUpdate: false }); h.plugin.onLoad();
  const attachments = [{ id: "image", filename: "picture.png", url: "https://cdn.discordapp.com/attachments/1/2/a.png" }];
  h.add("a", { attachments });
  h.dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: "a", channel_id: "c", attachments: [] } });
  attachments[0].filename = "mutated-after-capture";
  const log = h.logs()[0];
  assert.equal(log.edits[0].attachments[0].filename, "picture.png");
  assert.equal(log.current.attachments.length, 0); assert.equal(h.store.getMessage("c", "a").attachments.length, 0);
  h.plugin.onUnload();
});

test("attachment logging can be disabled independently of text history", () => {
  const h = setup({ strictUpdate: false, storage: { logDeletedAttachments: false } }); h.plugin.onLoad(); h.add("a");
  h.dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: "a", channel_id: "c", content: "new", attachments: [] } });
  const log = h.logs()[0]; assert.equal(log.edits.length, 1); assert.equal(log.edits[0].attachments.length, 0); h.plugin.onUnload();
});

test("bot, self, user, channel, category and server filters apply to edits and deletes", () => {
  for (const [storage, fields] of [
    [{}, { author: { id: "bot", bot: true } }], [{ ignoreSelf: true }, { author: { id: "self" } }],
    [{ ignoreUsers: "elsewhere, user" }, {}], [{ ignoreChannels: "c" }, {}],
    [{ ignoreChannels: "other category" }, {}], [{ ignoreGuilds: "guild" }, {}],
  ]) {
    const h = setup({ storage, strictUpdate: false }); h.plugin.onLoad(); h.add("a", fields);
    h.dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: "a", channel_id: "c", content: "edited" } });
    assert.equal(h.remove("a"), "original-return"); assert.equal(h.logs().length, 0); h.plugin.onUnload();
  }
});

test("ignore IDs match whole tokens and bots may be explicitly enabled", () => {
  const h = setup({ storage: { ignoreBots: false, ignoreUsers: "1234", ignoreChannels: "abc", ignoreGuilds: "otherguild" } });
  h.plugin.onLoad(); h.add("a", { author: { id: "123", bot: true } }); h.remove("a");
  assert.equal(h.logs().length, 1); h.plugin.onUnload();
});

test("logging switches are independent and viewer-only mode allows normal deletion", () => {
  const h = setup({ strictUpdate: false, storage: { keepDeletedInChat: false, logEdits: false } }); h.plugin.onLoad(); h.add("a");
  h.dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: "a", channel_id: "c", content: "changed" } });
  assert.equal(h.logs().length, 0); h.remove("a"); assert.equal(h.cache.size, 0);
  assert.equal(h.logs()[0].current.content, "changed"); assert.equal(h.timers.size, 0);
  h.storage.logDeletes = false; h.storage.logEdits = true; h.add("b");
  h.dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: "b", channel_id: "c", content: "edit logged" } }); h.remove("b");
  assert.equal(h.logs()[0].deletedAt, null); assert.equal(h.logs()[0].edits.length, 1); h.plugin.onUnload();
});

test("clearing history removes retained deletes without removing live edited messages", async () => {
  const h = setup({ strictUpdate: false }); h.plugin.onLoad(); h.add("deleted"); h.remove("deleted"); h.add("live");
  h.dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: "live", channel_id: "c", content: "edited" } });
  h.clearAll(); assert.equal(h.logs().length, 0); await h.advance();
  assert.equal(h.store.getMessage("c", "deleted"), undefined); assert.equal(h.store.getMessage("c", "live").content, "edited");
  h.plugin.onUnload();
});

test("local command filters the requested channel and sends no message", () => {
  const h = setup(); h.plugin.onLoad(); h.add("a"); h.remove("a"); h.add("b", { channel_id: "other" }); h.remove("b", { channelId: "other" });
  assert.equal(h.logs("c").length, 1); assert.equal(h.logs()[0].channelId, "other");
  assert.equal(h.events.length, 0); assert.equal(h.commands[0].name, "messagelogger"); h.plugin.onUnload();
});

test("missing optional commands and navigation leave settings and logging usable", () => {
  for (const options of [{ noCommands: true }, { noNavigation: true }]) {
    const h = setup(options); h.plugin.onLoad(); h.add("a"); h.remove("a");
    assert.doesNotThrow(() => h.plugin.settings());
    if (h.commands.length) { assert.equal(h.commands[0].execute([], {}), undefined); assert.equal(h.alerts.length, 1); }
    assert.ok(h.store.getMessage("c", "a")); h.plugin.onUnload();
  }
});

test("history clears on logout, account transition, channel removal and guild removal", async () => {
  for (const event of [
    { type: "LOGOUT" }, { type: "LOGOUT_START" }, { type: "LOGIN_SUCCESS" },
    { type: "CHANNEL_DELETE", channel: { id: "c" } }, { type: "GUILD_DELETE", id: "guild" },
  ]) {
    const h = setup(); h.plugin.onLoad(); h.add("a"); h.remove("a"); assert.equal(h.logs().length, 1);
    h.dispatcher.dispatch(event); assert.equal(h.logs().length, 0); await h.advance(); h.plugin.onUnload();
  }
  const h = setup(); h.plugin.onLoad(); h.add("a"); h.remove("a");
  h.dispatcher.dispatch({ type: "GUILD_DELETE", id: "guild", unavailable: true }); assert.equal(h.logs().length, 1);
  h.dispatcher.dispatch({ type: "CHANNEL_DELETE" }); assert.equal(h.logs().length, 1); h.plugin.onUnload();
  h.plugin.onLoad(); assert.equal(h.logs().length, 0); h.plugin.onUnload();
});

test("repeated edits respect version and content limits and disclose discarded history", () => {
  const h = setup({ strictUpdate: false }); h.plugin.onLoad(); h.add("a", { content: "old", editedTimestamp: new Date(0) });
  for (let i = 0; i < 30; i++) h.dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: "a", channel_id: "c", content: String(i) + "x".repeat(5000) } });
  const log = h.logs()[0]; assert.equal(log.edits.length, 10); assert.equal(log.droppedEdits, 20);
  assert.equal(log.current.content.length, 4000); assert.equal(log.earlierEditsMissing, true); h.plugin.onUnload();
});

test("history obeys per-channel, global record and total text budgets", () => {
  const h = setup({ storage: { keepDeletedInChat: false }, strictUpdate: false }); h.plugin.onLoad();
  for (let i = 0; i < 250; i++) { const c = "channel" + Math.floor(i / 25); h.add(String(i), { channel_id: c }); h.remove(String(i), { channelId: c }); }
  assert.equal(h.logs().length, 200);
  for (let i = 0; i < 60; i++) { h.add("same" + i); h.remove("same" + i); }
  assert.equal(h.logs("c").length, 50);
  for (let i = 0; i < 80; i++) {
    const c = "long" + Math.floor(i / 10), id = "long" + i; h.add(id, { channel_id: c, content: "start" });
    for (let edit = 0; edit < 12; edit++) h.dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id, channel_id: c, content: String(edit) + "a".repeat(3990) } });
  }
  assert.ok(JSON.stringify(h.logs()).length <= 2_000_201); assert.equal(h.logs()[0].id, "long79"); h.plugin.onUnload();
});

test("mobile dirtyDispatch and maybeDispatch deletion paths retain messages and unload cleanly", async () => {
  for (const method of ["dirtyDispatch", "maybeDispatch"]) {
    const h = setup({ mobileDispatch: true }); h.plugin.onLoad(); h.add("a");
    h.dispatcher[method]({ type: "MESSAGE_DELETE", channelId: "c", id: "a" });
    await h.advance(); assert.equal(h.store.getMessage("c", "a").content, "[deleted] hello");
    assert.equal(h.logs().length, 1); h.plugin.onUnload();
    assert.equal(h.dispatcher.dirtyDispatch, h.originalDirtyDispatch); assert.equal(h.dispatcher.maybeDispatch, h.originalMaybeDispatch);
    assert.equal(h.cache.size, 0);
  }
});

test("nested and queued mobile dispatch preserve edits once and filter bulk deletion once", async () => {
  for (const queuedDispatch of [false, true]) {
    const h = setup({ mobileDispatch: true, queuedDispatch, strictUpdate: false }); h.plugin.onLoad(); h.add("a");
    await h.dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id: "a", channel_id: "c", content: "edited" } });
    assert.equal(h.logs()[0].edits.length, 1);
    h.add("bot", { author: { id: "bot", bot: true } });
    const event = { type: "MESSAGE_DELETE_BULK", channelId: "c", ids: ["a", "bot", "missing"] };
    await h.dispatcher.dispatch(event, "extra"); await h.advance();
    assert.equal(h.logs()[0].edits.length, 1); assert.equal(h.store.getMessage("c", "a").content, "[deleted] edited");
    const deletions = h.events.filter(x => x.event.type === "MESSAGE_DELETE_BULK");
    assert.equal(deletions.length, 1); assert.deepEqual(Array.from(deletions[0].event.ids), ["bot", "missing"]);
    assert.equal(deletions[0].extra, "extra"); assert.deepEqual(event.ids, ["a", "bot", "missing"]);
    h.plugin.onUnload(); await tick(); assert.equal(h.cache.size, 0);
  }
});

test("mobile camelCase records and channel identity from the event are retained", async () => {
  for (const fields of [{ channel_id: undefined, channelId: "c" }, { channel_id: undefined }]) {
    const h = setup(); h.plugin.onLoad(); h.add("a", fields);
    h.dispatcher.dispatch({ type: "MESSAGE_DELETE", message: { id: "a", channelId: "c" } });
    await h.advance(); assert.equal(h.store.getMessage("c", "a").content, "[deleted] hello"); assert.equal(h.logs()[0].channelId, "c");
    h.plugin.onUnload();
  }
});

test("a failing primary message lookup falls back to the available channel cache", async () => {
  const h = setup({ brokenPrimary: true }); h.plugin.onLoad(); h.add("a"); h.remove("a"); await h.advance();
  assert.equal(h.cache.get("c:a").content, "[deleted] hello"); assert.equal(h.logs().length, 1); h.plugin.onUnload();
});

test("asynchronous label rejection is handled and never deletes the retained record", async () => {
  const h = setup({ asyncFailUpdate: true }); h.plugin.onLoad(); h.add("a"); h.remove("a"); await h.advance();
  assert.equal(h.store.getMessage("c", "a").content, "hello"); assert.equal(h.logs().length, 1);
  assert.equal(h.events.some(x => x.event.type.startsWith("MESSAGE_DELETE")), false);
  h.add("b"); h.remove("b"); await h.advance(); assert.equal(h.events.length, 1); h.plugin.onUnload();
});

test("a late label failure cannot disable labels in a newly enabled session", async () => {
  let reject;
  const options = { labelPromise: () => new Promise((_resolve, r) => { reject = r; }) };
  const h = setup(options); h.plugin.onLoad(); h.add("old"); h.remove("old"); await h.advance();
  h.plugin.onUnload(); options.labelPromise = undefined; h.plugin.onLoad(); reject(new Error("old failure")); await tick();
  h.add("new"); h.remove("new"); await h.advance();
  assert.equal(h.store.getMessage("c", "new").content, "[deleted] hello"); h.plugin.onUnload();
});

test("retained deletions keep public dispatch promise semantics", async () => {
  const h = setup(); h.plugin.onLoad(); h.add("a");
  const result = h.remove("a"); assert.equal(typeof result?.then, "function"); await result;
  await h.advance(); assert.equal(h.logs().length, 1); h.plugin.onUnload();
});

test("Revenge section shortcut opens Message Logger settings and preserves the pictured rows", async () => {
  const h = setup({ shortcut: true }), key = 'MESSAGE_LOGGER_FLUTTERSHY_SETTINGS'; h.plugin.onLoad(); h.plugin.onLoad();
  assert.deepEqual(h.nativeRows.map(row => row.key), [...h.nativeKeys.slice(0, 5), key, ...h.nativeKeys.slice(5)]);
  const row = h.nativeRows.find(row => row.key === key), renderer = h.settingConstants.SETTING_RENDERER_CONFIG[key];
  assert.equal(row.title(), 'Message Logger'); assert.equal((await row.render()).default, h.plugin.settings);
  assert.equal(renderer.parent, null); assert.equal(renderer.usePredicate(), true); assert.equal(renderer.IconComponent().type, 'image');
  assert.doesNotThrow(() => h.nativeRows.forEach(row => h.settingsTree.getAncestors(row.key)));
  renderer.onPress(); assert.equal(h.pages.at(-1)[0], 'BUNNY_CUSTOM_PAGE');
  assert.equal(h.pages.at(-1)[1].render().type, h.plugin.settings);
  h.plugin.onUnload(); assert.deepEqual(h.nativeRows.map(row => row.key), h.nativeKeys);
});

test("shortcut unload and re-enable keep stale native keys safe without wrapping repeatedly", () => {
  const h = setup({ shortcut: true }), key = 'MESSAGE_LOGGER_FLUTTERSHY_SETTINGS'; h.plugin.onLoad();
  const cachedKeys = h.nativeRows.map(row => row.key), captured = h.settingConstants.SETTING_RENDERER_CONFIG[key];
  const getter = Object.getOwnPropertyDescriptor(h.settingConstants, 'SETTING_RENDERER_CONFIG').get;
  h.settingsAPI.registeredSections.Revenge = [...h.nativeRows, { key: 'LATER_PLUGIN' }];
  h.plugin.onUnload(); h.plugin.onUnload();
  assert.doesNotThrow(() => cachedKeys.forEach(key => h.settingsTree.getAncestors(key)));
  assert.equal(captured.usePredicate(), false); captured.onPress(); assert.equal(h.pages.length, 0);
  assert.equal(h.settingsAPI.registeredSections.Revenge.some(row => row.key === key), false);
  assert.equal(h.settingsAPI.registeredSections.Revenge.at(-1).key, 'LATER_PLUGIN');
  h.plugin.onLoad(); assert.equal(h.settingConstants.SETTING_RENDERER_CONFIG[key].usePredicate(), true);
  assert.equal(Object.getOwnPropertyDescriptor(h.settingConstants, 'SETTING_RENDERER_CONFIG').get, getter);
  h.plugin.onUnload(); assert.equal(h.settingsTree.getAncestors, h.originalGetAncestors);
});

test("shortcut protects its renderer from replacements and skips unsupported registries safely", async () => {
  const h = setup({ shortcut: true }), key = 'MESSAGE_LOGGER_FLUTTERSHY_SETTINGS'; h.plugin.onLoad();
  Object.defineProperty(h.settingConstants, 'SETTING_RENDERER_CONFIG', { configurable: true, get: () => ({ ...h.nativeBase, LATE: { parent: 'BUNNY' } }) });
  assert.equal(h.settingConstants.SETTING_RENDERER_CONFIG[key], undefined);
  assert.doesNotThrow(() => h.settingsTree.getAncestors(key));
  assert.equal(h.settingsTree.isBlocked('LATE', new Set(['BUNNY'])), true);
  assert.throws(() => h.settingsTree.getAncestors('UNRELATED_MISSING'), /parent/);
  h.plugin.onUnload();
  const locked = setup({ shortcut: true, lockedSettings: true }); locked.plugin.onLoad(); locked.add('a'); locked.remove('a'); await locked.advance();
  assert.deepEqual(locked.nativeRows.map(row => row.key), locked.nativeKeys);
  assert.equal(locked.store.getMessage('c', 'a').content, '[deleted] hello'); locked.plugin.onUnload();
});
