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
    const members = [{ userId: BLOCK }, { userId: WHITE }, { userId: FRIEND }];
    const pages = { 1: [BLOCK, WHITE, FRIEND], 2: [FRIEND] };
    const memberSearch = store('MemberSafetyStore', {
        getCurrentMemberSearchResultsByGuildId: () => [members, 3], getPagedMembersByGuildId: () => [pages, 4],
        getKnownMemberSearchCountByGuildId: () => 4, getEstimatedMemberSearchCountByGuildId: () => 4
    });
    const sections = { online: { userIds: [BLOCK, WHITE, FRIEND], sectionId: 'online' } };
    const threadMembers = store('ThreadMemberListStore', { getMemberListSections: () => sections });
    const references = store('ReferencedMessageStore', { getMessage: () => ({ state: 0, message: rows[0] }) });
    const threadMessages = store('ThreadMessageStore', { getMostRecentMessage: () => rows[0] });
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
        updateRecent(rows) { recentRows = rows; recent.emitChange(); }, waiters,
        memberSearch, members, pages, threadMembers, sections, references, threadMessages };
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

test('member search and thread display projections honour whitelist/settings while preserving raw paging and author suggestions', t => {
    const w = world(t), { runtime, memberSearch } = w;
    assert.deepEqual(memberSearch.getCurrentMemberSearchResultsByGuildId()[0].map(m => m.userId), [WHITE, FRIEND]);
    assert.deepEqual(memberSearch.getPagedMembersByGuildId()[0][1], [WHITE, FRIEND]);
    assert.equal(memberSearch.getPagedMembersByGuildId()[0][2], w.pages[2]);
    assert.equal(memberSearch.getEstimatedMemberSearchCountByGuildId(), 4, 'native pager can still reach the last page');
    assert.equal(w.threadMembers.getMemberListSections(), w.sections, 'author autocomplete reads raw thread memberships');
    assert.deepEqual(runtime.threadMembers(w.sections).online.userIds, [WHITE, FRIEND]);
    let membershipUpdates = 0;
    runtime.subscribe('members', () => membershipUpdates++);
    w.env.MessageStore.emitChange();
    assert.equal(membershipUpdates, 0, 'new messages do not rescan members');
    w.storage.whitelistEnabled = false; runtime.refresh();
    assert.deepEqual(memberSearch.getCurrentMemberSearchResultsByGuildId()[0].map(m => m.userId), [FRIEND]);
    w.storage.blocked = false; runtime.refresh();
    assert.equal(memberSearch.getCurrentMemberSearchResultsByGuildId()[0], w.members);
    w.storage.blocked = true; w.env.RelationshipStore.isBlocked = () => false;
    w.env.RelationshipStore.emitChange();
    assert.equal(memberSearch.getPagedMembersByGuildId()[0], w.pages);
    runtime.stop();
    assert.equal(memberSearch.getCurrentMemberSearchResultsByGuildId()[0], w.members);
    assert.equal(w.waiters.size, 0); assert.deepEqual(w.warnings, []);
});

test('preview rules hide blocked/ignored content, retain raw records and explicit search, and notify mounted previews', t => {
    const w = world(t), { runtime } = w;
    assert.equal(runtime.hiddenPreview({ message: w.rows[0] }), true);
    assert.equal(runtime.hiddenPreview({ firstMessage: w.rows[0] }), true);
    assert.equal(runtime.hiddenPreview({ message: w.rows[3] }, true), false, 'whitelist overrides the native blocked-media flag');
    assert.equal(runtime.hiddenPreview({ message: { ...w.rows[0], isSearchHit: true } }), false);
    w.env.FluxDispatcher.dispatch({ type: 'SEARCH_MESSAGES_SUCCESS', inspect() {
        assert.equal(runtime.hiddenPreview({ message: w.rows[0] }), false);
    } });
    assert.equal(w.references.getMessage().message, w.rows[0]);
    assert.equal(w.threadMessages.getMostRecentMessage(), w.rows[0]);
    let updates = 0;
    runtime.subscribe('previews', () => updates++);
    w.references.emitChange(); w.threadMessages.emitChange();
    assert.equal(updates, 2);
    assert.equal(runtime.hiddenPreview({ senderModifier: 'ignored' }), true);
    w.storage.ignored = false; w.storage.blocked = false; runtime.refresh();
    assert.equal(runtime.hiddenPreview({ senderModifier: 'ignored' }), false);
    assert.equal(runtime.hiddenPreview({ message: w.rows[0] }), false);
    runtime.stop();
    assert.equal(runtime.hiddenPreview({ message: w.rows[0] }), false);
    assert.equal(runtime.hiddenPreview({ message: w.rows[0] }, true), true, 'disabling restores native blocked-media behaviour');
    assert.deepEqual(w.warnings, []);
});
