import { findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { instead } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";

type Entry = { id: string; channelId: string };
type Job = { entry: Entry; remove: boolean };
const PREFIX = "[deleted] ";
const MAX_RETAINED = 200;
const MAX_PER_CHANNEL = 50;
const MAX_PENDING = 400;
const WORK_PER_TICK = 10;
const deleted = new Map<string, Entry>();
const pending = new Map<string, Job>();
const pkQueue = new Map<string, Entry>();
const unloadEntries = new Map<string, Entry>();
const requests = new Set<{ controller: AbortController; timer: ReturnType<typeof setTimeout> }>();
const patches: (() => void)[] = [];
let MessageStore: any;
let ChannelMessages: any;
let active = false;
let generation = 0;
let workTimer: ReturnType<typeof setTimeout> | undefined;
let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
const key = ({ channelId, id }: Entry) => channelId + ":" + id;
const current = (entry: Entry) => deleted.get(key(entry)) === entry;
const label = (content: string) => content.startsWith(PREFIX) ? content : PREFIX + content;

function getMessage({ channelId, id }: Entry) {
  return MessageStore?.getMessage?.(channelId, id)
    ?? MessageStore?.getMessages?.(channelId)?.get?.(id)
    ?? ChannelMessages?.get?.(channelId)?.get?.(id);
}

function forget(entry: Entry) {
  const id = key(entry);
  deleted.delete(id);
  pending.delete(id);
  pkQueue.delete(id);
}

function release(entry: Entry) {
  forget(entry);
  pending.set(key(entry), { entry, remove: true });
  scheduleWork();
}

function pumpPluralKit() {
  if (!active || !storage.nopk) { pkQueue.clear(); return; }
  // Old RN builds may lack cancellable fetch. Skip this optional feature there.
  if (typeof AbortController !== "function") { pkQueue.clear(); return; }
  while (requests.size < 2 && pkQueue.size) {
    const entry = pkQueue.values().next().value as Entry;
    pkQueue.delete(key(entry));
    if (!current(entry)) continue;
    const epoch = generation;
    const controller = new AbortController();
    const request = { controller, timer: setTimeout(() => controller.abort(), 10000) };
    requests.add(request);
    // Opt-in; only an ID is sent. Never send message text or a Discord token.
    void Promise.resolve()
      .then(() => {
        if (!active || epoch !== generation || !storage.nopk || !current(entry)) return;
        return fetch("https://api.pluralkit.me/v2/messages/" + encodeURIComponent(entry.id), { signal: controller.signal });
      })
      .then((res) => res?.ok ? res.json() : undefined)
      .then((data) => {
        if (!active || epoch !== generation || !storage.nopk || !current(entry)) return;
        if (data?.original === entry.id && !data.member?.keep_proxy) release(entry);
      })
      .catch(() => { /* Offline, timeout and missing PK messages are harmless. */ })
      .finally(() => {
        clearTimeout(request.timer);
        requests.delete(request);
        if (epoch === generation) pumpPluralKit();
      });
  }
}

function deleteEvent(entry: Entry) {
  return { type: "MESSAGE_DELETE", id: entry.id, channelId: entry.channelId, __vml_cleanup: true };
}

function scheduleWork() {
  if (!active || workTimer !== undefined || !pending.size) return;
  const epoch = generation;
  workTimer = setTimeout(() => {
    workTimer = undefined;
    if (!active || epoch !== generation) return;
    // Flux disallows dispatch inside a store notification. Yield between small batches.
    try {
      if (FluxDispatcher.isDispatching?.()) { scheduleWork(); return; }
      for (let i = 0; i < WORK_PER_TICK && pending.size; i++) {
        const [id, job] = pending.entries().next().value as [string, Job];
        pending.delete(id);
        if (job.remove) {
          try { FluxDispatcher.dispatch(deleteEvent(job.entry)); } catch { /* Fail open. */ }
          continue;
        }
        if (!current(job.entry)) continue;
        try {
          const message = getMessage(job.entry);
          if (!message) { forget(job.entry); continue; }
          const content = message.content ?? "";
          if (typeof content !== "string") throw new Error("Unsupported message content");
          // Records are already normalized. Reconstructing one as gateway data can
          // corrupt attachments/timestamps and later crash native rendering.
          // A partial update lets Discord preserve every other field.
          FluxDispatcher.dispatch({
            type: "MESSAGE_UPDATE",
            message: { id: job.entry.id, channel_id: job.entry.channelId, content: label(content) },
          });
          if (storage.nopk && current(job.entry)) pkQueue.set(id, job.entry);
        } catch {
          forget(job.entry);
          try { FluxDispatcher.dispatch(deleteEvent(job.entry)); } catch { /* Never throw from a timer. */ }
        }
      }
      pumpPluralKit();
    } catch { /* Optional module/storage failures must not escape the worker. */ }
    scheduleWork();
  }, 16);
}

function retain(entry: Entry) {
  if (deleted.has(key(entry))) return true;
  // Backpressure keeps huge deletion bursts from building an unbounded queue.
  if (pending.size >= MAX_PENDING - 1 || pending.has(key(entry))) return false;
  const message = getMessage(entry);
  if (!message || message.author?.id === "1" || message.state === "SEND_FAILED") return false;
  if ((Number(message.flags) & 64) !== 0) return false;
  if (message.content != null && typeof message.content !== "string") return false;
  if (message.channel_id != null && message.channel_id !== entry.channelId) return false;

  deleted.set(key(entry), entry);
  pending.set(key(entry), { entry, remove: false });
  let inChannel = 0;
  let oldestInChannel: Entry | undefined;
  for (const candidate of deleted.values()) {
    if (candidate.channelId !== entry.channelId) continue;
    oldestInChannel ??= candidate;
    inChannel++;
  }
  if (inChannel > MAX_PER_CHANNEL && oldestInChannel) release(oldestInChannel);
  if (deleted.size > MAX_RETAINED) release(deleted.values().next().value as Entry);
  scheduleWork();
  return true;
}

function resetWork() {
  generation++;
  if (workTimer !== undefined) clearTimeout(workTimer);
  if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
  workTimer = cleanupTimer = undefined;
  deleted.clear();
  pending.clear();
  pkQueue.clear();
  unloadEntries.clear();
  for (const request of requests) {
    clearTimeout(request.timer);
    try { request.controller.abort(); } catch { /* Continue cancelling. */ }
  }
  requests.clear();
}

export function onLoad() {
  if (active) return;
  storage.nopk ??= false;
  MessageStore = findByProps("getMessage", "getMessages");
  ChannelMessages = findByProps("_channelMessages");
  if (typeof FluxDispatcher?.dispatch !== "function"
    || (typeof MessageStore?.getMessage !== "function"
      && typeof MessageStore?.getMessages !== "function"
      && typeof ChannelMessages?.get !== "function")) {
    throw new Error("Message Logger: unsupported message store. Include your Discord and Revenge versions when reporting this error.");
  }
  active = true;
  generation++;
  if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
  cleanupTimer = undefined;
  // A rapid re-enable can beat deferred unload cleanup. Carry it into this
  // session's bounded worker so old retained rows are not stranded in the cache.
  for (const [id, entry] of unloadEntries) pending.set(id, { entry, remove: true });
  unloadEntries.clear();
  try {
    patches.push(instead("dispatch", FluxDispatcher, function (args, original) {
      const [event] = args;
      if (!active || !event) return original.apply(this, args);
      if (event.type === "LOGOUT") {
        resetWork();
        return original.apply(this, args);
      }
      if (event.type === "CHANNEL_DELETE") {
        const channelId = event.channel?.id ?? event.channelId ?? event.channel_id;
        for (const entry of [...deleted.values()]) if (entry.channelId === channelId) forget(entry);
        for (const [id, job] of pending) if (job.entry.channelId === channelId) pending.delete(id);
        return original.apply(this, args);
      }
      if (event.type === "MESSAGE_UPDATE") {
        const message = event.message;
        if (message && typeof message.content === "string"
          && deleted.has(key({ id: message.id, channelId: message.channel_id }))) {
          return original.apply(this, [{ ...event, message: { ...message, content: label(message.content) } }, ...args.slice(1)]);
        }
        return original.apply(this, args);
      }
      const bulk = event.type === "MESSAGE_DELETE_BULK";
      if (!bulk && event.type !== "MESSAGE_DELETE") return original.apply(this, args);
      const channelId = event.channelId ?? event.channel_id;
      const ids = bulk ? event.ids : [event.id];
      if (typeof channelId !== "string" || !Array.isArray(ids) || !ids.length) return original.apply(this, args);
      if (event.__vml_cleanup) {
        for (const id of ids) forget({ id, channelId });
        return original.apply(this, args);
      }
      const remaining: string[] = [];
      for (const id of ids) {
        try {
          if (typeof id !== "string" || !retain({ channelId, id })) remaining.push(id);
        } catch { remaining.push(id); }
      }
      if (!remaining.length) return;
      if (!bulk || remaining.length === ids.length) return original.apply(this, args);
      return original.apply(this, [{ ...event, ids: remaining }, ...args.slice(1)]);
    }));
    scheduleWork();
  } catch (error) {
    onUnload();
    throw error;
  }
}

export function onUnload() {
  if (!active && !patches.length) return;
  // Include evictions waiting for cleanup, not just currently retained messages.
  const entries = new Map<string, Entry>(deleted);
  for (const [id, job] of pending) entries.set(id, job.entry);
  active = false;
  resetWork();
  for (const [id, entry] of entries) unloadEntries.set(id, entry);
  for (const unpatch of patches.splice(0).reverse()) {
    try { unpatch(); } catch { /* Continue removing hooks. */ }
  }
  const epoch = generation;
  const cleanup = () => {
    cleanupTimer = undefined;
    if (active || epoch !== generation) return;
    try {
      if (FluxDispatcher.isDispatching?.()) { cleanupTimer = setTimeout(cleanup, 16); return; }
      const channels = new Map<string, string[]>();
      for (const entry of entries.values()) {
        const ids = channels.get(entry.channelId) ?? [];
        ids.push(entry.id);
        channels.set(entry.channelId, ids);
      }
      for (const [channelId, ids] of channels) {
        try { FluxDispatcher.dispatch({ type: "MESSAGE_DELETE_BULK", channelId, ids, __vml_cleanup: true }); }
        catch { /* A missing channel must not prevent other cleanup. */ }
      }
      unloadEntries.clear();
    } catch { /* Do not throw during unloading. */ }
  };
  cleanup();
  MessageStore = ChannelMessages = undefined;
}

export { default as settings } from "./settings";
