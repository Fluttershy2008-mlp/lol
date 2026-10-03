import test from 'node:test';
import assert from 'node:assert/strict';
import { collectUnread, bulkReadEvent } from '../src/collect.js';

function fixture() {
  const text = { id: '101', guild_id: '1', type: 0 };
  const voice = { id: '102', guild_id: '1', type: 2 };
  const thread = { id: '103', guild_id: '1', type: 11 };
  return {
    GuildStore: { getGuilds: () => ({ 1: { id: '1' } }) },
    GuildChannelStore: { getChannels: () => ({ SELECTABLE: [{ channel: text }], VOCAL: [{ channel: voice }] }) },
    ActiveJoinedThreadsStore: { getActiveJoinedThreadsForGuild: () => ({ 101: { 103: { channel: thread } } }) },
    ActiveThreadsStore: { getThreadsForGuild: () => ({}) },
    ReadStateStore: { hasUnread: () => true, getMentionCount: () => 0, lastMessageId: id => id + '000' },
    ChannelStore: { getMutablePrivateChannels: () => ({}) },
  };
}

test('collects server text, voice and joined thread reads with the original Vencord action shape', () => {
  const result = collectUnread(fixture());
  assert.deepEqual(result, { channels: [
    { channelId: '101', messageId: '101000', readStateType: 0 },
    { channelId: '102', messageId: '102000', readStateType: 0 },
    { channelId: '103', messageId: '103000', readStateType: 0 },
  ], warnings: [] });
  assert.deepEqual(bulkReadEvent(result.channels), { type: 'BULK_ACK', context: 'APP', channels: result.channels });
});

test('includes forums, media channels and unjoined threads but excludes categories and mismatched guilds', () => {
  const stores = fixture();
  stores.GuildChannelStore.getChannels = () => ({ SELECTABLE: [
    ...[1, 3, 4, 14, 15, 16, 11].map((type, i) => ({ channel: { id: String(200 + i), guild_id: '1', type } })),
    { channel: { id: '300', guild_id: '2', type: 0 } },
  ] });
  assert.deepEqual(collectUnread(stores).channels.map(c => c.channelId), ['204', '205', '206', '103']);
});

test('deduplicates overlapping channel and joined thread lists without changing store objects', () => {
  const stores = fixture();
  const item = Object.freeze({ id: '101', guild_id: '1', type: 0 });
  const index = Object.freeze({ SELECTABLE: Object.freeze([{ channel: item }, { channel: item }]), VOCAL: Object.freeze([{ channel: item }]) });
  stores.GuildChannelStore.getChannels = () => index;
  stores.ActiveJoinedThreadsStore.getActiveJoinedThreadsForGuild = () => ({ a: { channel: item } });
  assert.equal(collectUnread(stores).channels.length, 1);
  assert.equal(index.SELECTABLE.length, 2);
});

test('does not acknowledge read channels or invent IDs for channels with missing last messages', () => {
  const stores = fixture();
  stores.ReadStateStore.hasUnread = id => id !== '101';
  stores.ReadStateStore.lastMessageId = id => id === '102' ? null : '900';
  const result = collectUnread(stores);
  assert.deepEqual(result.channels.map(c => c.channelId), ['103']);
  assert.match(result.warnings.join(' '), /1 channel/);
});

test('includes unread mention badges even if hasUnread is false', () => {
  const stores = fixture();
  stores.ReadStateStore.hasUnread = () => false;
  stores.ReadStateStore.getMentionCount = id => id === '101' ? 2 : 0;
  assert.deepEqual(collectUnread(stores).channels.map(c => c.channelId), ['101']);
});

test('falls back to guild channel records when GuildChannelStore is missing', () => {
  const stores = fixture();
  delete stores.GuildChannelStore;
  stores.ChannelStore.getMutableGuildChannelsForGuild = () => ({ 104: { id: '104', type: 0, guild_id: '1' } });
  assert.deepEqual(collectUnread(stores).channels.map(c => c.channelId), ['104', '103']);
});

test('handles Map indexes and direct joined-thread channel objects', () => {
  const stores = fixture();
  stores.GuildStore.getGuilds = () => new Map([['1', { id: '1' }]]);
  stores.GuildChannelStore.getChannels = () => ({ SELECTABLE: new Map([['101', { id: '101', type: 0 }]]) });
  stores.ActiveJoinedThreadsStore.getActiveJoinedThreadsForGuild = () => [{ id: '103', type: 11, guild_id: '1' }];
  assert.deepEqual(collectUnread(stores).channels.map(c => c.channelId), ['101', '103']);
});

test('missing channel indexes and missing read state stores report a failure, not false success', () => {
  const stores = fixture();
  delete stores.GuildChannelStore;
  delete stores.ChannelStore.getMutablePrivateChannels;
  assert.throws(() => collectUnread(stores), /channels are not ready/);
  delete stores.ReadStateStore;
  assert.throws(() => collectUnread(stores), /read states are not ready/);
});

test('skips unavailable guilds and reports absent thread support', () => {
  const stores = fixture();
  stores.GuildStore.getGuilds = () => ({ 1: { id: '1' }, 2: { id: '2', unavailable: true } });
  const calls = [];
  stores.GuildChannelStore.getChannels = id => { calls.push(id); return { SELECTABLE: [] }; };
  delete stores.ActiveJoinedThreadsStore;
  delete stores.ActiveThreadsStore;
  const result = collectUnread(stores);
  assert.deepEqual(calls, ['1']);
  assert.equal(result.channels.length, 0);
  assert.match(result.warnings.join(' '), /unavailable/);
  assert.match(result.warnings.join(' '), /Thread tracking/);
});

test('includes unread DMs and group DMs, deduplicates lists and skips read or malformed private channels', () => {
  const stores = fixture();
  const privateChannels = {
    201: { id: '201', type: 1 },
    202: { id: '202', type: 3 },
    203: { id: '203', type: 1 },
    204: { id: '204', type: 1 },
    205: { id: '205', type: 0, guild_id: '1' },
    206: { id: '206', type: 1, guild_id: '1' },
  };
  stores.ChannelStore.getMutablePrivateChannels = () => privateChannels;
  stores.ChannelStore.getSortedPrivateChannels = () => ['201', '202'];
  stores.ChannelStore.getChannel = id => privateChannels[id];
  stores.ReadStateStore.hasUnread = id => id !== '203';
  stores.ReadStateStore.lastMessageId = id => id === '204' ? null : id + '000';
  const result = collectUnread(stores);
  assert.deepEqual(result.channels.map(c => c.channelId), ['101', '102', '103', '201', '202']);
  assert.deepEqual(result.channels.slice(-2), [
    { channelId: '201', messageId: '201000', readStateType: 0 },
    { channelId: '202', messageId: '202000', readStateType: 0 },
  ]);
  assert.match(result.warnings.join(' '), /1 channel/);
});

test('DM-only accounts work with private channel ID arrays and no joined servers', () => {
  const stores = fixture();
  stores.GuildStore.getGuilds = () => ({});
  delete stores.ChannelStore.getMutablePrivateChannels;
  stores.ChannelStore.getSortedPrivateChannels = () => ['201', '202'];
  stores.ChannelStore.getChannel = id => ({ id, type: id === '201' ? 1 : 3 });
  assert.deepEqual(collectUnread(stores).channels.map(c => c.channelId), ['201', '202']);
});

test('private channel fallback supports Map records and unread mention badges', () => {
  const stores = fixture();
  stores.ChannelStore.getMutablePrivateChannels = () => { throw new Error('not supported'); };
  stores.ChannelStore.getPrivateChannels = () => new Map([['201', { channel: { id: '201', type: 1 } }]]);
  stores.ReadStateStore.hasUnread = () => false;
  stores.ReadStateStore.getMentionCount = id => id === '201' ? 1 : 0;
  assert.deepEqual(collectUnread(stores).channels.map(c => c.channelId), ['201']);
});

test('unavailable DM lists do not stop server reads and are reported', () => {
  const stores = fixture();
  delete stores.ChannelStore.getMutablePrivateChannels;
  const result = collectUnread(stores);
  assert.equal(result.channels.length, 3);
  assert.match(result.warnings.join(' '), /DM and group DM lists could not be loaded/);
});

test('unavailable server indexes do not stop valid DM reads', () => {
  const stores = fixture();
  delete stores.GuildChannelStore;
  stores.ActiveJoinedThreadsStore.getActiveJoinedThreadsForGuild = () => ({});
  stores.ChannelStore.getMutablePrivateChannels = () => ({ 201: { id: '201', type: 1 } });
  const result = collectUnread(stores);
  assert.deepEqual(result.channels.map(c => c.channelId), ['201']);
  assert.match(result.warnings.join(' '), /server channel lists could not be loaded/);
});

test('unresolved private channel IDs are skipped and reported without inventing a message ID', () => {
  const stores = fixture();
  stores.ChannelStore.getSortedPrivateChannels = () => ['201'];
  stores.ChannelStore.getChannel = () => undefined;
  const result = collectUnread(stores);
  assert.equal(result.channels.length, 3);
  assert.match(result.warnings.join(' '), /1 channel/);
});

test('forum/media new-post markers are included even when hasUnread is false and the forum was not opened', () => {
  const stores = fixture();
  const forum = { id: '300', guild_id: '1', type: 15, last_message_id: '1234567890123456789' };
  const media = { id: '301', guild_id: '1', type: 16, lastMessageId: '1234567890123456790' };
  // The visible index exists but omits both channels (collapsed/muted/not selected).
  stores.ChannelStore.getMutableGuildChannelsForGuild = () => ({ 300: forum, 301: media });
  stores.ReadStateStore.hasUnread = () => false;
  stores.ReadStateStore.lastMessageId = () => null;
  stores.ReadStateStore.ackMessageId = () => '1234567890123456788';
  assert.deepEqual(collectUnread(stores).channels, [
    { channelId: '300', messageId: forum.last_message_id, readStateType: 0 },
    { channelId: '301', messageId: media.lastMessageId, readStateType: 0 },
  ]);
});

test('read forum markers are not repeatedly acked, including snowflakes above Number precision', () => {
  const stores = fixture();
  stores.GuildChannelStore.getChannels = () => ({ SELECTABLE: [
    { id: '300', guild_id: '1', type: 15, last_message_id: '1234567890123456789' },
    { id: '301', guild_id: '1', type: 16, last_message_id: '1234567890123456788' },
  ] });
  stores.ReadStateStore.hasUnread = () => false;
  stores.ReadStateStore.lastMessageId = () => null;
  stores.ReadStateStore.ackMessageId = () => '1234567890123456789';
  assert.deepEqual(collectUnread(stores).channels, []);
});

test('unfollowed forum posts use forum unread predicates and channel last-message fallbacks', () => {
  const stores = fixture();
  stores.ActiveJoinedThreadsStore.getActiveUnjoinedThreadsForGuild = () => ({ 300: {
    401: { channel: { id: '401', guild_id: '1', parent_id: '300', type: 11, last_message_id: '700' } },
    402: { channel: { id: '402', guild_id: '1', parent_id: '300', type: 11, lastMessageId: '800' } },
  } });
  stores.ReadStateStore.hasUnread = () => false;
  stores.ReadStateStore.lastMessageId = () => null;
  stores.ReadStateStore.isForumPostUnread = id => id === '401';
  stores.ReadStateStore.isNewForumThread = (id, parent, guild) => id === '402' && parent === '300' && guild === '1';
  assert.deepEqual(collectUnread(stores).channels, [
    { channelId: '401', messageId: '700', readStateType: 0 },
    { channelId: '402', messageId: '800', readStateType: 0 },
  ]);
});

test('forum parent snapshot uses newest post creation ID, never the newer reply ID', () => {
  const stores = fixture();
  const forum = { id: '300', guild_id: '1', type: 15 };
  stores.ChannelStore.getChannel = id => id === '300' ? forum : undefined;
  const first = { id: '401', guild_id: '1', parent_id: '300', type: 11, last_message_id: '999' };
  const second = { id: '402', guild_id: '1', parent_id: '300', type: 11, last_message_id: '800' };
  stores.ActiveThreadsStore.getThreadsForGuild = () => ({ 300: { 401: first, 402: second } });
  stores.ReadStateStore.hasUnread = () => false;
  stores.ReadStateStore.lastMessageId = () => null;
  stores.ReadStateStore.ackMessageId = () => '400';
  assert.deepEqual(collectUnread(stores).channels, [{ channelId: '300', messageId: '402', readStateType: 0 }]);
});

test('cached archived, public, private and announcement threads are included and deduplicated', () => {
  const stores = fixture();
  const threads = [10, 11, 12].map((type, i) => Object.freeze({ id: String(400 + i), guild_id: '1', type,
    thread_metadata: { archived: true }, last_message_id: String(800 + i) }));
  stores.ChannelStore.getAllThreadsForGuild = () => threads;
  stores.ActiveThreadsStore.getThreadsForGuild = () => ({ 101: threads });
  stores.ChannelStore.getMutableGuildChannelsForGuild = () => ({ 400: threads[0] });
  const result = collectUnread(stores);
  for (const thread of threads) assert.equal(result.channels.filter(c => c.channelId === thread.id).length, 1);
  assert.equal(result.channels.length, 6);
  assert.ok(threads.every(t => t.thread_metadata.archived));
});

test('read-state fallback resolves cached threads but excludes non-channel states and unavailable guilds', () => {
  const stores = fixture();
  stores.GuildStore.getGuilds = () => ({ 1: { id: '1' }, 2: { id: '2', unavailable: true } });
  stores.ReadStateStore.getAllReadStates = includePrivate => {
    assert.equal(includePrivate, true);
    return [{ channelId: '401', type: 0 }, { channelId: '402', type: 0 },
      { channelId: '403', type: 0 }, { channelId: '404', type: 4 }, { channelId: '405', type: 0 }];
  };
  stores.ChannelStore.getChannel = id => id === '405' ? undefined : ({ id, type: 11,
    guild_id: id === '402' ? '2' : id === '403' ? '3' : '1' });
  assert.deepEqual(collectUnread(stores).channels.map(c => c.channelId), ['101', '102', '103', '401']);
});

test('thread indexes accept IDs, wrappers, nested Maps and cycles without duplicate acknowledgements', () => {
  const stores = fixture();
  const thread = { id: '401', guild_id: '1', type: 11 };
  stores.ChannelStore.getChannel = id => id === '401' ? thread : undefined;
  const index = new Map([['300', ['401', { channel: thread }]]]);
  index.set('cycle', index);
  stores.ActiveThreadsStore.getThreadsForGuild = () => index;
  assert.deepEqual(collectUnread(stores).channels.map(c => c.channelId), ['101', '102', '103', '401']);
});

test('missing last IDs for unread forum posts or new-post markers are reported rather than fabricated', () => {
  const stores = fixture();
  stores.GuildChannelStore.getChannels = () => ({ SELECTABLE: [{ id: '300', guild_id: '1', type: 15 }] });
  stores.ActiveThreadsStore.getThreadsForGuild = () => [{ id: '401', guild_id: '1', type: 11 }];
  stores.ReadStateStore.lastMessageId = () => null;
  stores.ReadStateStore.hasUnread = () => false;
  stores.ReadStateStore.isForumPostUnread = id => id === '401';
  stores.ActiveJoinedThreadsStore.getNewThreadCount = (guild, id) => guild === '1' && id === '300' ? 1 : 0;
  const result = collectUnread(stores);
  assert.deepEqual(result.channels, []);
  assert.match(result.warnings.join(' '), /2 channels/);
});

test('broken optional forum helpers cannot prevent server, thread and DM acknowledgements', () => {
  const stores = fixture();
  const broken = () => { throw new Error('unsupported'); };
  stores.ActiveThreadsStore.getThreadsForGuild = broken;
  stores.ReadStateStore.isForumPostUnread = broken;
  stores.ReadStateStore.isNewForumThread = broken;
  stores.ChannelStore.getAllThreadsForGuild = () => [{ id: '401', type: 11, guild_id: '1', parent_id: '300' }];
  stores.ChannelStore.getMutablePrivateChannels = () => [{ id: '501', type: 1 }];
  assert.deepEqual(collectUnread(stores).channels.map(c => c.channelId), ['101', '102', '103', '401', '501']);
});

test('joined-only builds report limited forum coverage instead of claiming every post was checked', () => {
  const stores = fixture();
  delete stores.ActiveThreadsStore;
  assert.match(collectUnread(stores).warnings.join(' '), /unfollowed forum posts may be skipped/);
});
