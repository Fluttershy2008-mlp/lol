import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopRuntime } from '../hideBlockedAndIgnoredMessages/runtime.js';
const HIDDEN = '400000000000000001', KEEP = '400000000000000002', CH = '300000000000000001', DM = '300000000000000002';
const BLOCK = '100000000000000001', WHITE = '100000000000000002', FRIEND = '100000000000000003';
function world(t) {
    const modules = [], waiters = new Map(), warnings = [];
    const events = [], fetches = [], channels = { [CH]: { guild_id: HIDDEN }, [DM]: { type: 1 } };
    const storage = { hiddenServerIds: [HIDDEN], whitelistedIds: [WHITE], whitelistEnabled: true };
    let blockedChecks = 0;
    function store(name, methods) {
        const listeners = new Set();
        class Store {} Store.displayName = name;
        const value = Object.assign(new Store(), methods, {
            emitChange() { for (const f of [...listeners]) f(); },
            addChangeListener: fn => listeners.add(fn), removeChangeListener: fn => listeners.delete(fn)
        });
        modules.push(value); return value;
    }
    const rows = [
        { id: '1', channel_id: DM, author: { id: BLOCK }, content: 'hidden user' },
        { id: '2', channel_id: CH, author: { id: FRIEND }, content: 'hidden server' },
        { id: '3', channel_id: DM, author: { id: FRIEND }, content: `hello <@${BLOCK}>` },
        { id: '4', channel_id: DM, author: { id: WHITE }, content: 'allowed' }
    ];
    const collection = { _array: rows, _map: Object.fromEntries(rows.map(row => [row.id, row])), hasMoreBefore: false, ready: true };
    const MessageStore = store('MessageStore', { getMessages: () => collection, getMessage: (_, id) => rows.find(row => row.id === id) });
    const RelationshipStore = store('RelationshipStore', { isBlocked(id) { blockedChecks++; return [BLOCK, WHITE].includes(id); }, isIgnored: () => false,
        isBlockedOrIgnored: id => [BLOCK, WHITE].includes(id), isBlockedOrIgnoredForMessage: m => [BLOCK, WHITE].includes(m.author.id),
        isBlockedForMessage: m => [BLOCK, WHITE].includes(m.author.id) });
    const ChannelStore = store('ChannelStore', { getChannel: id => channels[id] });
    const SelectedChannelStore = store('SelectedChannelStore', { getChannelId: () => DM });
    const folders = [{ folderId: 1, guildIds: [HIDDEN, KEEP] }];
    const SortedGuildStore = store('SortedGuildStore', { getFastListGuildFolders: () => folders, getGuildFolders: () => folders, getCompatibleGuildFolders: () => folders });
    const model = { id: HIDDEN, getSections: () => [2], getRows: () => [[{ type: 0 }, { type: 15 }]], invalidate() {} };
    const channelList = store('ChannelListStore', { getGuild: id => ({ guildChannels: { ...model, id } }) });
    const read = store('ReadStateStore', { getMentionCount: () => 7 });
    const guild = store('GuildReadStateStore', { getMentionCount: () => 7, getTotalMentionCount: () => 10,
        getMutableGuildStates: () => ({ [HIDDEN]: { highImportanceMentionCount: 7 } }) });
    let recentRows = [{ id: 'ping-hidden', message: rows[1] }, { id: 'ping-dm', message: rows[2] }];
    const recent = store('RecentMentionsStore', { getMentions: () => recentRows, hasMention: () => true });
    const search = store('SearchMessageStore', { getMessages: () => MessageStore.getMessages(DM) });
    const env = { MessageStore, ChannelStore, RelationshipStore, SelectedChannelStore, SortedGuildStore, ReadStateStore: read, GuildReadStateStore: guild,
        MessageActions: { fetchMessages(options) { fetches.push({ options, rows: MessageStore.getMessages(DM) }); return 'native'; } },
        FluxDispatcher: { dispatch(event) { events.push(event); event.inspect?.(); return 'event'; } },
        logger: { warn: (...args) => warnings.push(args) },
        filters: { byStoreName: name => m => m.constructor.displayName === name, byProps: (...props) => m => props.every(key => key in m) },
        find: f => modules.find(f), waitForSubscriptions: waiters,
        waitFor(f, callback) { const found = modules.find(f); if (found) callback(found); else waiters.set(f, callback); }
    };
    const runtime = createDesktopRuntime(env, storage); runtime.start(); t.after(() => runtime.stop());
    return { runtime, env, storage, rows, collection, folders, recent, search, channelList, warnings, fetches, events, channels, blockedChecks: () => blockedChecks,
        updateRecent(rows) { recentRows = rows; recent.emitChange(); }, waiters };
}
test('desktop store integration hides only selected locations/users, preserves native history and explicit search, and restores on stop', t => {
    const w = world(t), { env, runtime } = w;
    const displayed = env.MessageStore.getMessages(DM);
    assert.deepEqual(displayed._array.map(row => row.id), ['3', '4']);
    assert.equal(displayed._array[0].content.includes(`<@${BLOCK}>`), false);
    assert.equal(w.rows[2].content.includes(`<@${BLOCK}>`), true);
    assert.equal(w.search.getMessages(), w.collection);
    env.FluxDispatcher.dispatch({ type: 'SEARCH_MESSAGES_SUCCESS', inspect() {
        assert.equal(env.RelationshipStore.isBlockedOrIgnoredForMessage(w.rows[0]), false);
        assert.equal(env.MessageStore.getMessages(DM), w.collection);
    } });
    assert.equal(env.RelationshipStore.isBlockedOrIgnoredForMessage(w.rows[0]), true);
    assert.equal(env.RelationshipStore.isBlockedOrIgnoredForMessage(w.rows[3]), false);
    assert.equal(env.MessageActions.fetchMessages({ channelId: DM }), 'native');
    assert.equal(w.fetches[0].rows, w.collection);
    assert.deepEqual(env.SortedGuildStore.getFastListGuildFolders()[0].guildIds, [KEEP]);
    assert.equal(env.SortedGuildStore.getGuildFolders(), w.folders);
    assert.equal(env.SortedGuildStore.getCompatibleGuildFolders(), w.folders);
    assert.deepEqual(w.recent.getMentions().map(row => row.id), ['ping-dm']);
    assert.equal(env.GuildReadStateStore.getTotalMentionCount(), 3);
    assert.equal(runtime.suppressPing(w.rows[1]), true); assert.equal(runtime.suppressPing(w.rows[2]), false);
    w.storage.hideServerIcons = false; runtime.refresh();
    assert.equal(env.SortedGuildStore.getFastListGuildFolders(), w.folders);
    w.storage.hideServers = false; runtime.refresh();
    assert.deepEqual(env.MessageStore.getMessages(DM)._array.map(row => row.id), ['2', '3', '4']);
    assert.equal(runtime.suppressPing(w.rows[1]), true, 'ping switch is independent of message visibility');
    w.storage.hideServerPings = false; runtime.refresh();
    assert.equal(w.recent.getMentions().length, 2); assert.equal(runtime.suppressPing(w.rows[1]), false);
    runtime.stop(); assert.equal(env.MessageStore.getMessages(DM), w.collection);
    assert.equal(env.RelationshipStore.isBlockedOrIgnoredForMessage(w.rows[3]), true);
    assert.equal(w.waiters.size, 0); assert.deepEqual(w.warnings, []);
});
test('desktop message projections reuse native snapshots and invalidate when native data changes', t => {
    const w = world(t);
    const first = w.env.MessageStore.getMessages(DM), checks = w.blockedChecks();
    for (let i = 0; i < 500; i++) assert.equal(w.env.MessageStore.getMessages(DM), first);
    assert.equal(w.blockedChecks(), checks);
    w.rows.push({ id: '5', channel_id: DM, author: { id: FRIEND }, content: 'new message' });
    w.env.MessageStore.emitChange();
    assert.deepEqual(w.env.MessageStore.getMessages(DM)._array.map(row => row.id), ['3', '4', '5']);
    w.channels[CH] = { guild_id: KEEP }; w.env.ChannelStore.emitChange();
    assert.equal(w.runtime.suppressPing({ channel_id: CH }), false);
    w.updateRecent([{ id: 'late', channel_id: CH }]); assert.equal(w.recent.getMentions().length, 1);
});

test('desktop channel models hide forum/text rows and restore them with the channel switch', t => {
    const w = world(t);
    const hidden = w.channelList.getGuild(HIDDEN).guildChannels;
    assert.deepEqual(hidden.getSections(), [0]); assert.deepEqual(hidden.getRows(), [[]]);
    assert.deepEqual(w.channelList.getGuild(KEEP).guildChannels.getSections(), [2]);
    w.storage.hideServerChannels = false; w.runtime.refresh();
    assert.deepEqual(hidden.getSections(), [2]); assert.equal(hidden.getRows()[0].length, 2);
    w.storage.hideServerChannels = true; w.runtime.refresh(); assert.deepEqual(hidden.getSections(), [0]);
    w.runtime.stop(); assert.deepEqual(hidden.getSections(), [2]);
});
