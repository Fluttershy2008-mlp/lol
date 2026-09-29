/* MessageLogger mobile adaptation. SPDX-License-Identifier: GPL-3.0-or-later */
export const defaults = {
  logDeletes: true, logEdits: true, logDeletedAttachments: true,
  keepDeletedInChat: true, ignoreBots: true, ignoreSelf: false,
  ignoreUsers: "", ignoreChannels: "", ignoreGuilds: "", nopk: false,
};
export const limits = { messages: 200, perChannel: 50, edits: 10, content: 4000, attachments: 10, characters: 2_000_000 };
export type Attachment = { id: string; filename: string; url: string };
export type Version = { content: string; attachments: Attachment[]; time: string | null };
export type Log = {
  id: string; channelId: string; guildId: string; channelName: string;
  authorId: string; authorName: string; bot: boolean; parentId: string;
  current: Version; edits: Version[]; deletedAt: string | null; changedAt: number;
  earlierEditsMissing: boolean; droppedEdits: number;
};
const text = (v: unknown, max = 200) => typeof v === "string" ? v.slice(0, max) : "";
const date = (v: any): string | null => {
  try { const d = new Date(v?.toDate?.() ?? v); return v != null && Number.isFinite(d.getTime()) ? d.toISOString() : null; }
  catch { return null; }
};
const ids = (v: unknown) => new Set(text(v, 10000).split(/[\s,;]+/).filter(Boolean));
const key = (channelId: string, id: string) => channelId + ":" + id;
function attachments(value: any): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limits.attachments).filter(a => a && typeof a === "object").map(a => ({
    id: text(a.id), filename: text(a.filename ?? a.name, 512) || "Attachment",
    url: text(a.url ?? a.proxy_url ?? a.proxyURL, 2048),
  }));
}
const attachmentKey = (items: Attachment[]) => JSON.stringify(items.map(a => [a.id, a.filename]));

export function createHistory(deps: {
  options: () => any; channel?: (id: string) => any; selfId?: () => string | undefined;
  changed?: () => void; now?: () => number;
}) {
  const records = new Map<string, Log>();
  const costs = new Map<string, number>();
  let characters = 0;
  const now = deps.now ?? Date.now;
  const options = () => ({ ...defaults, ...deps.options() });
  const changed = () => deps.changed?.();
  function metadata(message: any) {
    let channel: any;
    try { channel = deps.channel?.(message.channel_id); } catch { /* Optional store. */ }
    return {
      guildId: text(message.guild_id ?? channel?.guild_id),
      channelName: text(channel?.name) || "DM / channel " + text(message.channel_id),
      parentId: text(channel?.parent_id),
    };
  }
  function ignoreReason(message: any, edit = false): string | null {
    const o = options();
    if (!message || typeof message.id !== "string" || typeof message.channel_id !== "string") return "Unsupported message data";
    if (message.author?.id === "1" || message.state === "SEND_FAILED" || (Number(message.flags) & 64)) return "System, failed or ephemeral message";
    if (message.content != null && typeof message.content !== "string") return "Unsupported message content";
    if (edit ? !o.logEdits : !o.logDeletes) return "Logging is disabled";
    if (o.ignoreBots && message.author?.bot) return "Bot ignored — switch off Ignore bots to include it";
    let self: string | undefined;
    try { self = deps.selfId?.(); } catch { /* Optional store. */ }
    if (o.ignoreSelf && self && message.author?.id === self) return "Your own message is ignored";
    const channel = metadata(message);
    if (ids(o.ignoreUsers).has(message.author?.id)) return "User is in the ignore list";
    if (ids(o.ignoreChannels).has(message.channel_id) || ids(o.ignoreChannels).has(channel.parentId)) return "Channel or category is in the ignore list";
    if (ids(o.ignoreGuilds).has(channel.guildId)) return "Server is in the ignore list";
    return null;
  }
  const ignore = (message: any, edit = false) => ignoreReason(message, edit) !== null;
  function snapshot(message: any): Version {
    return {
      content: text(message.content, limits.content),
      attachments: options().logDeletedAttachments ? attachments(message.attachments) : [],
      time: date(message.edited_timestamp ?? message.editedTimestamp ?? message.timestamp),
    };
  }
  function make(message: any): Log {
    return {
      id: message.id, channelId: message.channel_id, ...metadata(message),
      authorId: text(message.author?.id), authorName: text(message.author?.globalName ?? message.author?.global_name ?? message.author?.username) || "Unknown user",
      bot: Boolean(message.author?.bot), current: snapshot(message), edits: [], deletedAt: null,
      changedAt: now(), earlierEditsMissing: Boolean(message.edited_timestamp ?? message.editedTimestamp), droppedEdits: 0,
    };
  }
  function removeKey(k: string) {
    characters -= costs.get(k) ?? 0;
    costs.delete(k); records.delete(k);
  }
  function save(log: Log) {
    const k = key(log.channelId, log.id);
    removeKey(k);
    records.set(k, log);
    const size = JSON.stringify(log).length;
    characters += size; costs.set(k, size);
    const channel = [...records].filter(([, r]) => r.channelId === log.channelId);
    while (channel.length > limits.perChannel) removeKey(channel.shift()![0]);
    while (records.size > limits.messages || characters > limits.characters) removeKey(records.keys().next().value!);
    changed();
    return log;
  }
  function recordEdit(old: any, patch: any) {
    if (ignore(old, true) || !patch || old.id !== patch.id || old.channel_id !== patch.channel_id || (Number(patch.flags) & 64)) return;
    const k = key(old.channel_id, old.id), existing = records.get(k);
    const before = snapshot(old);
    // The in-chat label is synthetic and must never enter edit history.
    if (existing?.deletedAt && before.content === "[deleted] " + existing.current.content) before.content = existing.current.content;
    const after: Version = {
      content: typeof patch.content === "string" ? text(patch.content, limits.content) : before.content,
      attachments: Array.isArray(patch.attachments) && options().logDeletedAttachments ? attachments(patch.attachments) : before.attachments,
      time: date(patch.edited_timestamp ?? patch.editedTimestamp) ?? new Date(now()).toISOString(),
    };
    if (before.content === after.content && attachmentKey(before.attachments) === attachmentKey(after.attachments)) return;
    const log = existing ?? make(old);
    log.edits.push(before);
    if (log.edits.length > limits.edits) { log.edits.shift(); log.droppedEdits++; }
    log.current = after; log.changedAt = now();
    return save(log);
  }
  function recordDelete(message: any) {
    if (ignore(message)) return;
    const k = key(message.channel_id, message.id), log = records.get(k) ?? make(message);
    if (log.deletedAt) return log;
    log.current = snapshot(message); log.deletedAt = new Date(now()).toISOString(); log.changedAt = now();
    return save(log);
  }
  function clear(channelId?: string, id?: string) {
    for (const [k, record] of records) if ((!channelId || record.channelId === channelId) && (!id || record.id === id)) removeKey(k);
    changed();
  }
  return {
    ignore, ignoreReason, recordEdit, recordDelete, clear,
    get: (channelId: string, id: string) => records.get(key(channelId, id)),
    list: () => [...records.values()].reverse(),
    size: () => records.size,
  };
}
