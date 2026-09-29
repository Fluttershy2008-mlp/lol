/* SPDX-License-Identifier: GPL-3.0-or-later. Includes BSD-3-Clause code; see NOTICE. */
import { findByProps } from "@vendetta/metro";
import { FluxDispatcher, React, ReactNative } from "@vendetta/metro/common";
import { before, instead } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import * as commands from "@vendetta/commands";
import { history, configureHistory, initOptions, resetHistory, retentionStatus, reportRetention, resetRetentionStatus } from "./state";
import Settings, { openHistory, openSettings } from "./settings";
import { registerSettingsShortcut } from "./shortcut";

type Entry = { id: string; channelId: string };
type Job = { entry: Entry; remove: boolean };
const PREFIX = "[deleted] ";
const MAX_RETAINED = 200;
const MAX_PER_CHANNEL = 50;
const MAX_PENDING = 400;
const WORK_PER_TICK = 10;
const MAX_IN_FLIGHT = 10;
const inFlight = new Set<object>();
const deleted = new Map<string, Entry>();
const pending = new Map<string, Job>();
const pkQueue = new Map<string, Entry>();
const unloadEntries = new Map<string, Entry>();
const requests = new Set<{ controller: AbortController; timer: ReturnType<typeof setTimeout> }>();
const patches: (() => void)[] = [];
let MessageStore: any;
let ChannelMessages: any;
let active = false;
let labelSupported = true;
let transformedEvents = new WeakMap<object, any>();
let generation = 0;
let workTimer: ReturnType<typeof setTimeout> | undefined;
let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
const key = ({ channelId, id }: Entry) => channelId + ":" + id;
const current = (entry: Entry) => deleted.get(key(entry)) === entry;
const label = (content: string) => content.startsWith(PREFIX) ? content : PREFIX + content;

function getMessage({ channelId, id }: Entry) {
  // One unavailable store must not prevent the other cache from being read.
  for (const read of [
    () => MessageStore?.getMessage?.(channelId, id),
    () => MessageStore?.getMessages?.(channelId)?.get?.(id),
    () => ChannelMessages?.get?.(channelId)?.get?.(id),
  ]) {
    try { const message = read(); if (message) return message; } catch { /* Try the next cache. */ }
  }
}

function forHistory(message: any, entry: Entry) {
  if (!message) return undefined;
  // This small view is ONLY for archive/filter reads, never a native message update.
  return {
    id: message.id ?? entry.id, channel_id: message.channel_id ?? message.channelId ?? entry.channelId,
    guild_id: message.guild_id ?? message.guildId, author: message.author, state: message.state,
    flags: message.flags, content: message.content, attachments: message.attachments,
    timestamp: message.timestamp, edited_timestamp: message.edited_timestamp ?? message.editedTimestamp,
  };
}

function dispatchSafely(event: any, onError: () => void = () => {}, onSettled: () => void = () => {}) {
  const failed = () => { try { onError(); } catch { /* Error reporting must not reject a native dispatch promise. */ } };
  const settled = () => { try { onSettled(); } catch { /* Cleanup must not reject a native dispatch promise. */ } };
  try {
    const result = FluxDispatcher.dispatch(event);
    // Newer Flux dispatchers return a Promise; sync try/catch alone misses rejection.
    if (result && typeof result.then === "function") {
      void Promise.resolve(result).then(settled, () => { failed(); settled(); });
    } else settled();
  } catch { failed(); settled(); }
}

function dispatchQueued(event: any, onError: () => void = () => {}) {
  const token = {};
  const epoch = generation;
  inFlight.add(token);
  dispatchSafely(event, onError, () => {
    inFlight.delete(token);
    if (active && epoch === generation) scheduleWork();
  });
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
    const request = { controller, timer: setTimeout(() => {
      try { controller.abort(); } catch { /* Native abort may fail during app shutdown. */ }
    }, 10000) };
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
        if (data?.original === entry.id && !data.member?.keep_proxy) {
          history.clear(entry.channelId, entry.id);
          release(entry);
        }
      })
      .catch(() => { /* Offline, timeout and missing PK messages are harmless. */ })
      .finally(() => {
        clearTimeout(request.timer);
        requests.delete(request);
        if (epoch === generation) pumpPluralKit();
      })
      .catch(() => { /* A changed storage/network API must not cause an unhandled rejection. */ });
  }
}

function deleteEvent(entry: Entry) {
  return { type: "MESSAGE_DELETE", id: entry.id, channelId: entry.channelId, __vml_cleanup: true };
}

function scheduleWork() {
  if (!active || workTimer !== undefined || !pending.size || inFlight.size >= MAX_IN_FLIGHT) return;
  const epoch = generation;
  workTimer = setTimeout(() => {
    workTimer = undefined;
    if (!active || epoch !== generation) return;
    // Flux disallows dispatch inside a store notification. Yield between small batches.
    try {
      if (FluxDispatcher.isDispatching?.()) { scheduleWork(); return; }
      for (let i = 0; i < WORK_PER_TICK && pending.size && inFlight.size < MAX_IN_FLIGHT; i++) {
        const [id, job] = pending.entries().next().value as [string, Job];
        pending.delete(id);
        if (job.remove) {
          dispatchQueued(deleteEvent(job.entry));
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
          if (labelSupported) dispatchQueued({
              type: "MESSAGE_UPDATE",
              __vml_synthetic: true,
              message: { id: job.entry.id, channel_id: job.entry.channelId, content: label(content) },
            }, () => {
              if (!active || epoch !== generation || !current(job.entry)) return;
              // A cosmetic label failure must NEVER turn back into a real deletion.
              labelSupported = false;
              reportRetention({ labelFailures: retentionStatus.labelFailures + 1, last: "Message kept in chat; deleted label is unavailable on this Discord build" });
            });
          if (storage.nopk && current(job.entry)) pkQueue.set(id, job.entry);
        } catch {
          // Keep the original cached record even when the optional marker cannot be applied.
          reportRetention({ last: "Message kept in chat without a deleted label" });
        }
      }
      pumpPluralKit();
    } catch { /* Optional module/storage failures must not escape the worker. */ }
    scheduleWork();
  }, 16);
}

function retain(entry: Entry) {
  reportRetention({ seen: retentionStatus.seen + 1 });
  const message = forHistory(getMessage(entry), entry);
  if (!message) { reportRetention({ last: "Message was not in Discord's local cache" }); return false; }
  if (message.channel_id !== entry.channelId || message.id !== entry.id) return false;
  const reason = history.ignoreReason(message);
  if (reason) { reportRetention({ last: reason }); return false; }
  if (deleted.has(key(entry))) return true;
  history.recordDelete(message);
  if (!storage.keepDeletedInChat) { reportRetention({ last: "Saved to history only — Keep deleted messages in chat is off" }); return false; }
  // The separate viewer can still record the event when chat retention is full.
  if (pending.size >= MAX_PENDING - 1 || pending.has(key(entry))) { reportRetention({ last: "Saved to history only — chat retention queue is full" }); return false; }

  deleted.set(key(entry), entry);
  reportRetention({ kept: retentionStatus.kept + 1, last: "Deleted message kept in chat" });
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
  transformedEvents = new WeakMap();
  inFlight.clear();
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
  initOptions();
  resetRetentionStatus();
  labelSupported = true;
  MessageStore = findByProps("getMessage", "getMessages");
  ChannelMessages = findByProps("_channelMessages");
  if (typeof FluxDispatcher?.dispatch !== "function"
    || (typeof MessageStore?.getMessage !== "function"
      && typeof MessageStore?.getMessages !== "function"
      && typeof ChannelMessages?.get !== "function")) {
    throw new Error("Message Logger: unsupported message store. Include your Discord and Revenge versions when reporting this error.");
  }
  active = true;
  const optionalModule = (...props: string[]) => { try { return findByProps(...props); } catch { return undefined; } };
  configureHistory(optionalModule("getChannel", "getDMFromUserId"), optionalModule("getCurrentUser"), (channelId, id) => {
    for (const entry of [...deleted.values()]) {
      if ((!channelId || entry.channelId === channelId) && (!id || entry.id === id)) release(entry);
    }
  });
  generation++;
  if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
  cleanupTimer = undefined;
  // A rapid re-enable can beat deferred unload cleanup. Carry it into this
  // session's bounded worker so old retained rows are not stranded in the cache.
  for (const [id, entry] of unloadEntries) pending.set(id, { entry, remove: true });
  unloadEntries.clear();
  try {
    const transformEvent = (event: any) => {
      if (!active || !event) return event;
      if (event.type === "LOGOUT" || event.type === "LOGOUT_START" || event.type === "LOGIN_SUCCESS") {
        // Account transitions must not mix one account's message history with another.
        resetHistory();
        resetWork();
        return event;
      }
      if (event.type === "CHANNEL_DELETE") {
        const channelId = event.channel?.id ?? event.channelId ?? event.channel_id;
        for (const entry of [...deleted.values()]) if (entry.channelId === channelId) forget(entry);
        for (const [id, job] of pending) if (job.entry.channelId === channelId) pending.delete(id);
        if (typeof channelId === "string") history.clear(channelId);
        return event;
      }
      if (event.type === "GUILD_DELETE" && !event.unavailable && !event.guild?.unavailable) {
        const guildId = event.guild?.id ?? event.guildId ?? event.guild_id ?? event.id;
        if (typeof guildId === "string") {
          for (const log of history.list()) if (log.guildId === guildId) {
            history.clear(log.channelId, log.id);
            const entry = deleted.get(key({ channelId: log.channelId, id: log.id }));
            if (entry) release(entry);
          }
        }
      }
      if (event.type === "MESSAGE_UPDATE") {
        const message = event.message;
        const entry = { id: message?.id ?? event.id ?? event.messageId, channelId: message?.channel_id ?? message?.channelId ?? event.channelId ?? event.channel_id };
        if (!event.__vml_synthetic && message && typeof entry.id === "string" && typeof entry.channelId === "string") {
          try { history.recordEdit(forHistory(getMessage(entry), entry), forHistory(message, entry)); }
          catch { /* Logging must not prevent Discord from applying a real edit. */ }
        }
        if (labelSupported && message && typeof message.content === "string"
          && deleted.has(key(entry))) {
          return { ...event, message: { ...message, content: label(message.content) } };
        }
        return event;
      }
      const bulk = event.type === "MESSAGE_DELETE_BULK";
      if (!bulk && event.type !== "MESSAGE_DELETE") return event;
      const channelId = event.channelId ?? event.channel_id ?? event.message?.channel_id ?? event.message?.channelId;
      const ids = bulk ? event.ids : [event.id ?? event.messageId ?? event.message?.id];
      if (typeof channelId !== "string" || !Array.isArray(ids) || !ids.length) return event;
      if (event.__vml_cleanup) {
        for (const id of ids) forget({ id, channelId });
        return event;
      }
      const remaining: string[] = [];
      for (const id of ids) {
        try {
          if (typeof id !== "string" || !retain({ channelId, id })) {
            if (typeof id === "string") forget({ channelId, id });
            remaining.push(id);
          }
        } catch { reportRetention({ last: "This deletion could not be retained" }); remaining.push(id); }
      }
      if (!remaining.length) return null;
      if (!bulk || remaining.length === ids.length) return event;
      return { ...event, ids: remaining };
    };
    const installed: string[] = [];
    // Mobile can deliver gateway events directly to dirtyDispatch/maybeDispatch.
    // Cache each transformation by object identity so forwarding between paths
    // (including queued forwarding) cannot duplicate edits or bulk-delete work.
    for (const method of ["dispatch", "dirtyDispatch", "maybeDispatch"]) {
      if (typeof (FluxDispatcher as any)[method] !== "function") continue;
      try {
        patches.push(instead(method, FluxDispatcher, function (args, original) {
          const event = args[0];
          if (!active || !event || typeof event !== "object") return original.apply(this, args);
          let next;
          if (transformedEvents.has(event)) next = transformedEvents.get(event);
          else {
            try { next = transformEvent(event); }
            catch {
              // Only contain our transformation. The original dispatcher runs
              // exactly once, outside this catch, retaining its own semantics.
              next = event;
              try { reportRetention({ last: "Skipped incompatible event data; Discord handled it normally" }); } catch {}
            }
            transformedEvents.set(event, next);
            if (next && next !== event) transformedEvents.set(next, next);
          }
          if (next === null) return method === "dispatch" ? Promise.resolve() : undefined;
          return original.apply(this, next === event ? args : [next, ...args.slice(1)]);
        }));
        installed.push(method);
      } catch (error) {
        if (method === "dispatch") throw error;
      }
    }
    reportRetention({ hooks: installed.join(", ") });
    // Local built-in command. Returning no object prevents Revenge from sending a message.
    try {
      if (typeof commands?.registerCommand === "function") patches.push(commands.registerCommand({
        name: "messagelogger", description: "Open your local deleted messages and edit history",
        options: [], execute: (_args: any, context: any) => { openHistory(context?.channel?.id); },
      }));
    } catch { /* Settings remains available if the command API changes. */ }
    // Add a row to the existing Revenge section. Register its native renderer
    // before exposing the row key to avoid the old settings .parent crash.
    try {
      const host: any = globalThis;
      patches.push(registerSettingsShortcut({
        settingsAPI: host.bunny?.ui?.settings ?? host.window?.bunny?.ui?.settings,
        Settings,
        constants: optionalModule("SETTING_RENDERER_CONFIG"),
        treeManager: optionalModule("getAncestors", "isBlocked"),
        patcher: { before },
        openSettings,
        getAssetID: getAssetIDByName,
        renderIcon: (asset: any) => {
          const Icon = optionalModule("TableRowIcon")?.TableRowIcon;
          return Icon ? React.createElement(Icon, { source: asset })
            : React.createElement(ReactNative.Image, { source: asset, style: { width: 24, height: 24 } });
        },
      }));
    } catch { /* An unavailable shortcut must not stop message logging. */ }
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
  configureHistory(undefined, undefined);
  resetHistory();
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
        dispatchSafely({ type: "MESSAGE_DELETE_BULK", channelId, ids, __vml_cleanup: true });
      }
      unloadEntries.clear();
    } catch { /* Do not throw during unloading. */ }
  };
  cleanup();
  MessageStore = ChannelMessages = undefined;
}

export { default as settings } from "./settings";
