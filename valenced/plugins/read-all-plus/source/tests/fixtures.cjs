"use strict";
const { createReadAllEngine } = require("../core.cjs");
const id = n => String(1400000000000000000n + BigInt(n));
const message = n => String(1500000000000000000n + BigInt(n));

function fixture(overrides = {}) {
    let uid = id(900);
    const guildA = id(800), guildB = id(801);
    const channels = new Map();
    const unread = new Set();
    const mentions = new Map();
    const latest = new Map();
    const ack = new Map();
    const muted = new Set();
    const denied = new Set();
    const sent = [], sleeps = [], history = [], progress = [];
    const settings = { includeMuted: true, protectMentions: false, includeThreads: true, accounts: {} };
    const add = (n, type, guild, extra = {}) => {
        const channel = { id: id(n), type, guild_id: guild, name: `Channel ${n}`, ...extra };
        channels.set(channel.id, channel); unread.add(channel.id); mentions.set(channel.id, 0); latest.set(channel.id, message(n));
        return channel;
    };
    const text = add(1, 0, guildA);
    const voice = add(2, 2, guildA);
    const other = add(3, 0, guildB);
    const dm = add(4, 1, undefined, { name: undefined, recipients: [id(700)] });
    const group = add(5, 3, undefined, { name: "Friends" });
    const thread = add(6, 11, guildA, { parent_id: text.id });
    const category = add(7, 4, guildA);
    const forum = add(8, 15, guildA);
    const privateChannels = () => Object.fromEntries([...channels].filter(([, c]) => [1, 3].includes(c.type)));
    const guildChannels = gid => Object.fromEntries([...channels].filter(([, c]) => c.guild_id === gid && ![10, 11, 12].includes(c.type)));
    const stores = {
        GuildStore: { getGuildIds: () => [guildA, guildB], getGuilds: () => ({ [guildA]: { id: guildA, name: "Ponyville" }, [guildB]: { id: guildB, name: "Cloudsdale" } }) },
        ChannelStore: { getChannel: value => channels.get(value), getMutablePrivateChannels: privateChannels, getMutableGuildChannelsForGuild: guildChannels },
        GuildChannelStore: { getChannels: gid => ({ SELECTABLE: Object.values(guildChannels(gid)).map(channel => ({ channel })), VOCAL: [{ channel: voice }] }) },
        ActiveJoinedThreadsStore: { getActiveJoinedThreadsForGuild: gid => gid === guildA ? { [text.id]: { [thread.id]: { channel: thread } } } : {} },
        PrivateChannelSortStore: { getPrivateChannelIds: () => Object.keys(privateChannels()) },
        ReadStateStore: { hasUnread: value => unread.has(value), getMentionCount: value => mentions.get(value), lastMessageId: value => latest.get(value), ackMessageId: value => ack.get(value) },
        SelectedChannelStore: { getChannelId: () => text.id }, SelectedGuildStore: { getGuildId: () => guildA },
        UserStore: { getCurrentUser: () => ({ id: uid }), getUser: () => ({ username: "Fluttershy", globalName: "Fluttershy" }) },
        UserGuildSettingsStore: { isGuildMuted: gid => muted.has(gid), isChannelMuted: (gid, value) => muted.has(value) },
    };
    const apply = payload => {
        sent.push(payload);
        for (const target of payload.channels) {
            ack.set(target.channelId, target.messageId);
            if (latest.get(target.channelId) === target.messageId) { unread.delete(target.channelId); mentions.set(target.channelId, 0); }
        }
    };
    const env = {
        getStores: () => stores, getAccountId: () => uid, getSettings: () => settings,
        canView: channel => !denied.has(channel.id), dispatch: apply,
        sleep: async ms => { sleeps.push(ms); }, onProgress: p => progress.push(p), onComplete: p => history.push(p),
        ...overrides,
    };
    const engine = createReadAllEngine(env);
    return { engine, env, stores, settings, channels, unread, mentions, latest, ack, muted, denied, sent, sleeps, history, progress, add, id, message, guildA, guildB, text, voice, other, dm, group, thread, category, forum, apply, setAccount: value => { uid = value; } };
}

module.exports = { fixture, id, message };
