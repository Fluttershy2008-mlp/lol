/* Read All Plus, GPL-3.0-or-later. See ../NOTICE.txt and ../LICENSE. */
"use strict";

function createReadAllEngine(env) {
    const pause = env.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    let disposed = false;
    let cancelled = false;
    let busy = false;
    let progress = { phase: "idle", total: 0, sent: 0, confirmed: 0, unconfirmed: 0, failed: 0, skipped: 0 };

    const safe = (obj, name, ...args) => {
        try { return typeof obj?.[name] === "function" ? obj[name](...args) : undefined; }
        catch { return undefined; }
    };
    const sf = value => typeof value === "string" && /^\d{15,22}$/.test(value);
    const newerOrEqual = (a, b) => sf(a) && sf(b) && (a.length > b.length || (a.length === b.length && a >= b));
    const setting = () => env.getSettings() || {};
    const accountId = () => env.getAccountId() || "";
    const stores = () => env.getStores() || {};
    const accountSettings = () => setting().accounts?.[accountId()] || {};

    function update(patch) {
        progress = { ...progress, ...patch };
        try { env.onProgress?.({ ...progress }); } catch { /* UI must not interrupt a queue. */ }
    }

    function currentChannelId() {
        return safe(stores().SelectedChannelStore, "getChannelId");
    }

    function currentGuildId() {
        const s = stores();
        const channel = safe(s.ChannelStore, "getChannel", currentChannelId());
        return channel?.guild_id || channel?.guildId || safe(s.SelectedGuildStore, "getGuildId");
    }

    function readInfo(channel, s = stores()) {
        const rs = s.ReadStateStore;
        const id = channel.id;
        const m = safe(rs, "getMentionCount", id);
        const mentions = typeof m === "number" && Number.isFinite(m) ? Math.max(0, m) : null;
        const unreadValue = safe(rs, "hasUnread", id);
        const unread = mentions > 0 || unreadValue === true;
        const messageId = [safe(rs, "lastMessageId", id), channel.lastMessageId, channel.last_message_id].find(sf);
        return { unread, mentions, messageId };
    }

    function muted(channel, s = stores()) {
        const ns = s.UserGuildSettingsStore || s.NotificationSettingsStore;
        const gid = channel.guild_id || channel.guildId;
        if (!gid) return safe(ns, "isChannelMuted", null, channel.id) === true;
        const combined = safe(ns, "isGuildOrCategoryOrChannelMuted", gid, channel.id);
        if (typeof combined === "boolean") return combined;
        if (safe(ns, "isGuildMuted", gid) === true) return true;
        let parent = channel;
        for (let i = 0; parent && i < 8; i++) {
            if (safe(ns, "isChannelMuted", gid, parent.id) === true) return true;
            parent = safe(s.ChannelStore, "getChannel", parent.parent_id || parent.parentId);
        }
        return false;
    }

    function excluded(channel, s = stores()) {
        const a = accountSettings();
        const gid = channel.guild_id || channel.guildId;
        if (gid && (a.guilds || []).includes(gid)) return true;
        let parent = channel;
        for (let i = 0; parent && i < 8; i++) {
            if ((a.channels || []).includes(parent.id)) return true;
            parent = safe(s.ChannelStore, "getChannel", parent.parent_id || parent.parentId);
        }
        return false;
    }

    function reason(channel, options, s = stores()) {
        const opts = options || setting();
        if (excluded(channel, s)) return "Excluded";
        if (!opts.includeThreads && [10, 11, 12].includes(channel.type)) return "Threads disabled";
        if (!opts.includeMuted && muted(channel, s)) return "Muted";
        const info = readInfo(channel, s);
        if (opts.protectMentions && info.mentions === null) return "Mention count unavailable";
        if (opts.protectMentions && info.mentions > 0) return "Mentions protected";
        if (!info.messageId) return "Latest message unavailable";
        return null;
    }

    function collect() {
        const s = stores();
        const byId = new Map();
        const guilds = new Map();
        const seen = new WeakSet();
        let visited = 0;
        const gs = safe(s.GuildStore, "getGuilds");
        if (gs) for (const g of Object.values(gs)) if (g?.id) guilds.set(g.id, g);
        for (const id of safe(s.GuildStore, "getGuildIds") || []) {
            if (!guilds.has(id)) guilds.set(id, safe(s.GuildStore, "getGuild", id) || { id, name: "Server" });
        }

        function walk(node, guildHint, depth = 0) {
            if (!node || typeof node !== "object" || depth > 10 || visited++ > 120000 || seen.has(node)) return;
            seen.add(node);
            if (typeof node.id === "string" && typeof node.type === "number") {
                if (![0, 1, 2, 3, 5, 10, 11, 12, 13].includes(node.type)) return;
                const isPrivate = node.type === 1 || node.type === 3;
                const gid = isPrivate ? undefined : (node.guild_id || node.guildId || guildHint);
                if (!isPrivate && (!gid || (guilds.size && !guilds.has(gid)))) return;
                if (!isPrivate && env.canView && env.canView(node) === false) return;
                byId.set(node.id, { ...node, id: node.id, type: node.type, guild_id: gid });
                return;
            }
            if (node instanceof Map || node instanceof Set) {
                for (const value of node.values()) walk(value, guildHint, depth + 1);
            } else {
                for (const value of Object.values(node)) walk(value, guildHint, depth + 1);
            }
        }

        walk(safe(s.ChannelStore, "getMutableGuildChannels"));
        walk(safe(s.ChannelStore, "getMutablePrivateChannels"));
        for (const id of safe(s.PrivateChannelSortStore, "getPrivateChannelIds") || []) walk(safe(s.ChannelStore, "getChannel", id));
        for (const gid of guilds.keys()) {
            walk(safe(s.ChannelStore, "getMutableGuildChannelsForGuild", gid), gid);
            walk(safe(s.GuildChannelStore, "getChannels", gid), gid);
            walk(safe(s.ActiveJoinedThreadsStore, "getActiveJoinedThreadsForGuild", gid), gid);
        }
        walk(safe(s.ChannelStore, "getChannel", currentChannelId()));

        const entries = [];
        for (const channel of byId.values()) {
            const gid = channel.guild_id;
            const kind = channel.type === 1 ? "dm" : channel.type === 3 ? "group" : [10, 11, 12].includes(channel.type) ? "thread" : "server";
            let name = channel.name;
            if (!name && kind === "dm") {
                const recipient = channel.recipients?.[0];
                const user = typeof recipient === "object" ? recipient : safe(s.UserStore, "getUser", recipient);
                name = user?.globalName || user?.global_name || user?.username;
            }
            if (!name && kind === "group") {
                name = (channel.recipients || []).slice(0, 4).map(r => {
                    const user = typeof r === "object" ? r : safe(s.UserStore, "getUser", r);
                    return user?.globalName || user?.global_name || user?.username;
                }).filter(Boolean).join(", ");
            }
            const info = readInfo(channel, s);
            const skipReason = reason(channel, undefined, s);
            entries.push({
                channel, id: channel.id, guildId: gid,
                guildName: gid ? guilds.get(gid)?.name || "Server" : "Direct messages",
                name: name || (kind === "group" ? "Group chat" : kind === "dm" ? "Direct message" : "Channel"),
                kind, ...info, muted: muted(channel, s), excluded: excluded(channel, s),
                skipReason, eligible: info.unread && !skipReason,
            });
        }
        entries.sort((a, b) => Number(b.unread) - Number(a.unread) || a.guildName.localeCompare(b.guildName) || a.name.localeCompare(b.name));
        return entries;
    }

    function makePlan(scope = "all", selectedIds, guildId) {
        if (disposed) throw new Error("Read All Plus is disabled.");
        if (!accountId()) throw new Error("Sign in to Discord first.");
        const s = stores();
        if (!s.ChannelStore || !s.ReadStateStore || typeof s.ReadStateStore.hasUnread !== "function") {
            throw new Error("Discord is still loading its channels. Open your channel list, then try again.");
        }
        const selected = new Set(selectedIds || []);
        const currentId = currentChannelId();
        const gid = guildId || currentGuildId();
        if (scope === "current" && !currentId) throw new Error("Open a channel or DM first.");
        if (scope === "guild" && !gid) throw new Error("Open a server first.");
        const matches = e => scope === "all" ||
            (scope === "servers" && Boolean(e.guildId)) ||
            (scope === "dms" && ["dm", "group"].includes(e.kind)) ||
            (scope === "groups" && e.kind === "group") ||
            (scope === "current" && e.id === currentId) ||
            (scope === "guild" && e.guildId === gid) ||
            (scope === "selected" && selected.has(e.id));
        const candidates = collect().filter(e => matches(e) && e.unread);
        const skipped = {};
        const targets = [];
        for (const entry of candidates) {
            if (!entry.eligible) skipped[entry.skipReason] = (skipped[entry.skipReason] || 0) + 1;
            else targets.push({ id: entry.id, messageId: entry.messageId, guildId: entry.guildId, channel: entry.channel, kind: entry.kind });
        }
        return {
            accountId: accountId(), createdAt: Date.now(), scope,
            total: targets.length, unreadInScope: candidates.length, skipped,
            guilds: new Set(targets.map(t => t.guildId).filter(Boolean)).size,
            dms: targets.filter(t => t.kind === "dm").length,
            groups: targets.filter(t => t.kind === "group").length,
            threads: targets.filter(t => t.kind === "thread").length,
            targets,
        };
    }

    function acknowledged(target) {
        const rs = stores().ReadStateStore;
        for (const name of ["ackMessageId", "getLastReadMessageId", "getAckMessageId"]) {
            const value = safe(rs, name, target.id);
            if (newerOrEqual(value, target.messageId)) return true;
        }
        return safe(rs, "hasUnread", target.id) === false && !(safe(rs, "getMentionCount", target.id) > 0);
    }

    async function dispatchWithDeadline(payload) {
        const request = env.dispatch(payload);
        if (!request || typeof request.then !== "function") return request;
        let timer;
        try {
            return await Promise.race([
                request,
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error("Discord did not finish this batch in time.")), env.dispatchTimeoutMs || 5000);
                }),
            ]);
        } finally { clearTimeout(timer); }
    }

    async function run(plan) {
        if (busy) throw new Error("A read-all operation is already running.");
        if (disposed) throw new Error("Read All Plus is disabled.");
        if (!plan || plan.accountId !== accountId()) throw new Error("Your account changed. Preview this action again.");
        if (Date.now() - plan.createdAt > 5 * 60 * 1000) throw new Error("This preview has expired. Preview this action again.");
        if (!plan.total) return { phase: "done", total: 0, sent: 0, confirmed: 0, unconfirmed: 0, failed: 0, skipped: 0, cancelled: false };
        busy = true;
        cancelled = false;
        const sent = [];
        const failedIds = [];
        const interrupted = () => disposed || cancelled || accountId() !== plan.accountId;
        update({ phase: "running", total: plan.total, sent: 0, confirmed: 0, unconfirmed: 0, failed: 0, skipped: 0, cancelled: false, cancelling: false, scope: plan.scope, error: null, failedIds: [] });
        try {
            for (let i = 0; i < plan.targets.length; i += 25) {
                if (interrupted()) break;
                const batch = [];
                for (const target of plan.targets.slice(i, i + 25)) {
                    const cs = stores().ChannelStore;
                    const live = safe(cs, "getChannel", target.id);
                    if ((typeof cs?.getChannel === "function" && !live) || reason(live || target.channel) || acknowledged(target)) {
                        update({ skipped: progress.skipped + 1 });
                    } else batch.push(target);
                }
                if (interrupted()) break;
                if (batch.length) {
                    try {
                        await dispatchWithDeadline({
                            type: "BULK_ACK", context: "APP",
                            channels: batch.map(t => ({ channelId: t.id, messageId: t.messageId, readStateType: 0 })),
                        });
                        sent.push(...batch);
                        update({ sent: sent.length });
                    } catch {
                        failedIds.push(...batch.map(t => t.id));
                        update({ failed: failedIds.length, error: "Discord rejected one or more batches." });
                    }
                }
                if (i + 25 < plan.targets.length && !interrupted()) await pause(450);
            }
            update({ phase: "checking" });
            let pending = accountId() === plan.accountId ? sent.filter(t => !acknowledged(t)) : sent.slice();
            update({ confirmed: sent.length - pending.length });
            for (let attempt = 0; attempt < 5 && pending.length && !interrupted(); attempt++) {
                await pause(attempt ? 650 : 200);
                if (interrupted()) break;
                pending = pending.filter(t => !acknowledged(t));
                update({ confirmed: sent.length - pending.length });
            }
            const didCancel = interrupted();
            const unprocessed = Math.max(0, plan.total - sent.length - failedIds.length - progress.skipped);
            update({
                phase: didCancel ? "cancelled" : "done", cancelled: didCancel,
                unconfirmed: pending.length, skipped: progress.skipped + unprocessed,
                failedIds, completedAt: Date.now(),
            });
            const result = { ...progress };
            if (!disposed && accountId() === plan.accountId) {
                try { env.onComplete?.(result); } catch { /* Saving history must not affect the result. */ }
            }
            return result;
        } finally {
            busy = false;
            update({ cancelling: false });
        }
    }

    return {
        collect, makePlan, run, reason, readInfo, currentChannelId, currentGuildId,
        cancel() { cancelled = true; update({ cancelling: true }); },
        dispose() { disposed = true; cancelled = true; },
        getProgress() { return { ...progress }; },
        isBusy() { return busy; },
    };
}

module.exports = { createReadAllEngine };
