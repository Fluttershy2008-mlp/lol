import { findByName, findByProps } from "@vendetta/metro";
import { FluxDispatcher, ReactNative } from "@vendetta/metro/common";
import { after, instead } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";

// Some Discord versions drop unknown record fields; keep deletion state separately.
const deleted = new Map<string, { id: string; channelId: string }>();
const patches: (() => void)[] = [];
let MessageStore: any;
let ChannelMessages: any;
let active = false;
let generation = 0;
let highlightRows = false;

const key = (channelId: string, id: string) => `${channelId}:${id}`;
const isDeleted = (message: any) => Boolean(message && deleted.has(key(message.channel_id, message.id)));

function getMessage(channelId: string, id: string) {
  return MessageStore?.getMessage?.(channelId, id)
    ?? MessageStore?.getMessages?.(channelId)?.get?.(id)
    ?? ChannelMessages?.get?.(channelId)?.get?.(id);
}

function checkPluralKit(message: any) {
  if (!storage.nopk) return;
  const currentGeneration = generation;
  // Opt-in lookup sends only the message ID, never content or a Discord token.
  void Promise.resolve()
    .then(() => fetch(`https://api.pluralkit.me/v2/messages/${encodeURIComponent(message.id)}`))
    .then((res) => res.ok ? res.json() : undefined)
    .then((data) => {
      if (!active || generation !== currentGeneration || !storage.nopk) return;
      if (data?.original !== message.id || data.member?.keep_proxy) return;
      if (!isDeleted(message)) return;
      FluxDispatcher.dispatch({
        type: "MESSAGE_DELETE",
        id: message.id,
        channelId: message.channel_id,
        __vml_cleanup: true,
      });
    })
    .catch(() => {
      // Missing PK messages and network failures must not reject Discord's dispatch.
    });
}

function retainMessage(channelId: string, id: string, dispatch: (event: any) => any) {
  const message = getMessage(channelId, id);
  if (!message || message.author?.id === "1" || message.state === "SEND_FAILED") return false;
  // Ephemeral interaction responses should disappear normally.
  if ((Number(message.flags) & 64) !== 0) return false;

  const messageKey = key(channelId, id);
  if (deleted.has(messageKey)) return true;

  const snapshot = typeof message.toJS === "function" ? message.toJS() : { ...message };
  const update = {
    ...snapshot,
    id,
    channel_id: channelId,
    __vml_deleted: true,
    ...(!highlightRows ? { content: `[deleted] ${snapshot.content ?? ""}` } : {}),
  };

  deleted.set(messageKey, { id, channelId });
  try {
    dispatch({ type: "MESSAGE_UPDATE", message: update });
  } catch (error) {
    deleted.delete(messageKey);
    throw error;
  }
  checkPluralKit(update);
  return true;
}

export function onLoad() {
  if (active) return;
  storage.nopk ??= false;

  MessageStore = findByProps("getMessage", "getMessages");
  ChannelMessages = findByProps("_channelMessages");
  const recordUtils = findByProps("updateMessageRecord", "createMessageRecord");
  const rowModule = findByName("RowManager");
  const rowManager = rowModule?.prototype?.generate ? rowModule : rowModule?.default;

  if (typeof FluxDispatcher?.dispatch !== "function"
    || (!MessageStore && typeof ChannelMessages?.get !== "function")
    || typeof recordUtils?.updateMessageRecord !== "function"
    || typeof recordUtils?.createMessageRecord !== "function") {
    throw new Error("Message Logger: this Discord build's message modules are unsupported. Include your Discord version when reporting this error.");
  }

  active = true;
  generation++;
  highlightRows = false;
  try {
    // MessageRecord's constructor name/export is not stable across Discord builds.
    patches.push(instead("updateMessageRecord", recordUtils, function (args, original) {
      const [oldRecord, update] = args;
      if (update?.__vml_deleted) {
        return recordUtils.createMessageRecord(update, oldRecord?.reactions);
      }
      return original.apply(this, args);
    }));

    if (typeof rowManager?.prototype?.generate === "function") {
      try {
        patches.push(after("generate", rowManager.prototype, ([data], row) => {
          if (!isDeleted(data?.message) || !row?.message) return;
          return {
            ...row,
            message: { ...row.message, edited: "deleted" },
            backgroundHighlight: {
              ...row.backgroundHighlight,
              backgroundColor: ReactNative.processColor("#da373c22"),
              gutterColor: ReactNative.processColor("#da373cff"),
            },
          };
        }));
        highlightRows = true;
      } catch {
        // Use a text label if this optional renderer cannot be patched.
      }
    }

    patches.push(instead("dispatch", FluxDispatcher, function (args, original) {
      const [event] = args;
      const bulk = event?.type === "MESSAGE_DELETE_BULK";
      if (!active || (!bulk && event?.type !== "MESSAGE_DELETE")) {
        return original.apply(this, args);
      }

      const channelId = event.channelId ?? event.channel_id;
      const ids = bulk ? event.ids : [event.id];
      if (!channelId || !Array.isArray(ids) || !ids.length) return original.apply(this, args);
      if (event.__vml_cleanup) {
        for (const id of ids) deleted.delete(key(channelId, id));
        return original.apply(this, args);
      }

      const remaining: string[] = [];
      let result: any;
      const dispatch = (next: any) => (result = original.apply(this, [next, ...args.slice(1)]));
      for (const id of ids) {
        try {
          if (typeof id !== "string" || !retainMessage(channelId, id, dispatch)) remaining.push(id);
        } catch {
          // Fail open: a plugin error must not stop Discord processing the event.
          remaining.push(id);
        }
      }
      if (!remaining.length) return result;
      if (remaining.length === ids.length) return original.apply(this, args);
      return original.apply(this, [{ ...event, ids: remaining }, ...args.slice(1)]);
    }));
  } catch (error) {
    onUnload();
    throw error;
  }
}

export function onUnload() {
  active = false;
  generation++;
  for (const unpatch of patches.splice(0).reverse()) {
    try { unpatch(); } catch { /* Continue removing the other hooks. */ }
  }
  // Snapshot first: deleting while iterating Discord's live array skipped messages.
  const messages = [...deleted.values()];
  deleted.clear();
  for (const { id, channelId } of messages) {
    try {
      FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", id, channelId, __vml_cleanup: true });
    } catch { /* An unloaded channel must not prevent the remaining cleanup. */ }
  }
  MessageStore = ChannelMessages = undefined;
}

export { default as settings } from "./settings";
