"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture, id, message } = require("./fixtures.cjs");

test("discovers text/voice channels, DMs, group chats and joined threads; deduplicates store views", () => {
    const f = fixture();
    const entries = f.engine.collect();
    assert.equal(entries.length, 6);
    assert.equal(entries.find(e => e.id === f.dm.id).name, "Fluttershy");
    assert.equal(entries.find(e => e.id === f.thread.id).kind, "thread");
    assert(!entries.some(e => [f.category.id, f.forum.id].includes(e.id)));
    assert.equal(new Set(entries.map(e => e.id)).size, entries.length);
});

test("supports nested Map and Set channel collections", () => {
    const f = fixture();
    f.stores.ChannelStore.getMutablePrivateChannels = () => new Map([[f.dm.id, f.dm], [f.group.id, f.group]]);
    f.stores.GuildChannelStore.getChannels = () => new Set([{ channel: f.text }, { channel: f.voice }]);
    assert.equal(f.engine.collect().length, 6);
});

test("filters hidden server channels without applying guild permissions to private chats", () => {
    const f = fixture();
    f.denied.add(f.text.id); f.denied.add(f.dm.id);
    const entries = f.engine.collect();
    assert(!entries.some(e => e.id === f.text.id));
    assert(entries.some(e => e.id === f.dm.id));
});

test("all, server, DM/group, group, current, guild and selected scopes resolve precisely", () => {
    const f = fixture();
    assert.equal(f.engine.makePlan("all").total, 6);
    assert.equal(f.engine.makePlan("servers").total, 4);
    assert.equal(f.engine.makePlan("dms").total, 2);
    assert.equal(f.engine.makePlan("groups").total, 1);
    assert.deepEqual(f.engine.makePlan("current").targets.map(t => t.id), [f.text.id]);
    assert.equal(f.engine.makePlan("guild").total, 3);
    assert.equal(f.engine.makePlan("selected", [f.dm.id, f.other.id]).total, 2);
    assert.equal(f.engine.makePlan("selected", [f.dm.id, f.dm.id]).total, 1);
});

test("server and channel exclusions protect child threads and remain account-specific", () => {
    const f = fixture();
    f.settings.accounts[id(900)] = { guilds: [f.guildB], channels: [f.text.id, f.dm.id] };
    const plan = f.engine.makePlan();
    assert.deepEqual(new Set(plan.targets.map(t => t.id)), new Set([f.voice.id, f.group.id]));
    assert.equal(plan.skipped.Excluded, 4);
    f.setAccount(id(901));
    assert.equal(f.engine.makePlan().total, 6);
});

test("whole-server exclusion covers every loaded channel and thread", () => {
    const f = fixture();
    f.settings.accounts[id(900)] = { guilds: [f.guildA], channels: [] };
    const plan = f.engine.makePlan();
    assert.equal(plan.total, 3);
    assert(!plan.targets.some(t => t.guildId === f.guildA));
});

test("muted guilds, channels and inherited categories can be skipped", () => {
    const f = fixture();
    f.text.parent_id = f.category.id;
    f.settings.includeMuted = false;
    f.muted.add(f.category.id); f.muted.add(f.guildB);
    const plan = f.engine.makePlan();
    assert.equal(plan.total, 3); // Voice, DM, group; text/thread inherit category mute.
    assert.equal(plan.skipped.Muted, 3);
    f.settings.includeMuted = true;
    assert.equal(f.engine.makePlan().total, 6);
});

test("mention protection skips mentions and unknown mention counts", () => {
    const f = fixture();
    f.settings.protectMentions = true;
    f.mentions.set(f.dm.id, 2); f.mentions.delete(f.group.id);
    const plan = f.engine.makePlan();
    assert.equal(plan.total, 4);
    assert.equal(plan.skipped["Mentions protected"], 1);
    assert.equal(plan.skipped["Mention count unavailable"], 1);
});

test("thread option and missing message IDs produce explicit skips", () => {
    const f = fixture();
    f.settings.includeThreads = false;
    f.latest.delete(f.dm.id);
    const plan = f.engine.makePlan();
    assert.equal(plan.total, 4);
    assert.equal(plan.skipped["Threads disabled"], 1);
    assert.equal(plan.skipped["Latest message unavailable"], 1);
});

test("uses a valid channel last_message_id when the read store lacks its latest ID", () => {
    const f = fixture();
    f.latest.delete(f.dm.id); f.dm.last_message_id = message(444);
    assert.equal(f.engine.makePlan("dms").targets.find(t => t.id === f.dm.id).messageId, message(444));
});

test("bulk flow clears server channels, direct messages and groups with normal acknowledgement payloads", async () => {
    const f = fixture();
    const result = await f.engine.run(f.engine.makePlan());
    assert.equal(result.confirmed, 6); assert.equal(result.unconfirmed, 0);
    assert.equal(f.sent[0].type, "BULK_ACK"); assert.equal(f.sent[0].context, "APP");
    assert(f.sent[0].channels.every(c => c.readStateType === 0));
    assert(f.sent[0].channels.some(c => c.channelId === f.dm.id));
    assert(f.sent[0].channels.some(c => c.channelId === f.group.id));
    assert.equal(f.history.length, 1); assert.equal(f.engine.isBusy(), false);
});

test("message high-water marks are frozen at preview time; newer messages stay unread", async () => {
    const f = fixture();
    const plan = f.engine.makePlan("current");
    f.latest.set(f.text.id, message(999));
    const result = await f.engine.run(plan);
    assert.equal(f.sent[0].channels[0].messageId, message(1));
    assert(f.unread.has(f.text.id));
    assert.equal(result.confirmed, 1); // The older snapshot was acknowledged, not the new message.
});

test("rechecks newly arrived mentions and newly added exclusions before sending", async () => {
    const f = fixture();
    f.settings.protectMentions = true;
    const plan = f.engine.makePlan("selected", [f.dm.id, f.other.id]);
    f.mentions.set(f.dm.id, 1);
    f.settings.accounts[id(900)] = { guilds: [f.guildB], channels: [] };
    const result = await f.engine.run(plan);
    assert.equal(f.sent.length, 0); assert.equal(result.skipped, 2);
});

test("splits large selections into batches of at most 25 with non-blocking pauses", async () => {
    const f = fixture();
    for (let n = 20; n < 95; n++) f.add(n, 0, f.guildA);
    const result = await f.engine.run(f.engine.makePlan());
    assert.equal(result.confirmed, 81);
    assert.deepEqual(f.sent.map(p => p.channels.length), [25, 25, 25, 6]);
    assert.equal(f.sleeps.filter(ms => ms === 450).length, 3);
});

test("stopping after one batch prevents all remaining batches and retains verified results", async () => {
    const f = fixture();
    for (let n = 20; n < 75; n++) f.add(n, 0, f.guildA);
    f.env.dispatch = payload => { f.apply(payload); f.engine.cancel(); };
    const result = await f.engine.run(f.engine.makePlan());
    assert.equal(f.sent.length, 1); assert.equal(result.cancelled, true);
    assert.equal(result.confirmed, 25); assert.equal(result.skipped, 36);
});

test("a different signed-in account invalidates a pending preview", async () => {
    const f = fixture();
    const plan = f.engine.makePlan(); f.setAccount(id(901));
    await assert.rejects(f.engine.run(plan), /account changed/);
    assert.equal(f.sent.length, 0);
});

test("an account switch during dispatch stops the queue and never saves history to the new account", async () => {
    const f = fixture();
    for (let n = 20; n < 75; n++) f.add(n, 0, f.guildA);
    f.env.dispatch = payload => { f.apply(payload); f.setAccount(id(901)); };
    const result = await f.engine.run(f.engine.makePlan());
    assert.equal(f.sent.length, 1); assert.equal(result.cancelled, true);
    assert.equal(f.history.length, 0);
});

test("concurrent actions are rejected while a dispatched batch is pending", async () => {
    const f = fixture(); let release;
    f.env.dispatch = payload => new Promise(resolve => { release = () => { f.apply(payload); resolve(); }; });
    const plan = f.engine.makePlan(); const first = f.engine.run(plan);
    await assert.rejects(f.engine.run(plan), /already running/);
    release(); await first;
    assert.equal(f.sent.length, 1);
});

test("expired previews do not dispatch", async () => {
    const f = fixture(); const plan = f.engine.makePlan(); plan.createdAt -= 310000;
    await assert.rejects(f.engine.run(plan), /expired/); assert.equal(f.sent.length, 0);
});

test("failed dispatches are reported without claiming successful reads", async () => {
    const f = fixture(); f.env.dispatch = () => { throw new Error("offline"); };
    const result = await f.engine.run(f.engine.makePlan());
    assert.equal(result.confirmed, 0); assert.equal(result.failed, 6); assert.equal(result.failedIds.length, 6);
    assert.equal(f.engine.isBusy(), false);
});

test("a no-op or not-yet-synced Discord handler is unconfirmed, never falsely successful", async () => {
    const f = fixture(); f.env.dispatch = p => { f.sent.push(p); };
    const result = await f.engine.run(f.engine.makePlan());
    assert.equal(result.sent, 6); assert.equal(result.confirmed, 0); assert.equal(result.unconfirmed, 6);
    assert.equal(f.sleeps.length, 5);
});

test("disabling mid-operation prevents subsequent dispatches and completion notifications", async () => {
    const f = fixture(); for (let n = 20; n < 75; n++) f.add(n, 0, f.guildA);
    f.env.dispatch = p => { f.apply(p); f.engine.dispose(); };
    const result = await f.engine.run(f.engine.makePlan());
    assert.equal(f.sent.length, 1); assert.equal(result.cancelled, true); assert.equal(f.history.length, 0);
    assert.throws(() => f.engine.makePlan(), /disabled/);
});

test("removed channels and channels already read elsewhere are skipped at execution", async () => {
    const f = fixture(); const plan = f.engine.makePlan("selected", [f.dm.id, f.other.id]);
    f.channels.delete(f.dm.id); f.unread.delete(f.other.id);
    const result = await f.engine.run(plan);
    assert.equal(result.sent, 0); assert.equal(result.skipped, 2);
});

test("missing stores and missing selected contexts give actionable errors", () => {
    const f = fixture();
    f.stores.SelectedChannelStore.getChannelId = () => undefined;
    f.stores.SelectedGuildStore.getGuildId = () => undefined;
    assert.throws(() => f.engine.makePlan("current"), /Open a channel/);
    assert.throws(() => f.engine.makePlan("guild"), /Open a server/);
    f.stores.ReadStateStore = undefined;
    assert.throws(() => f.engine.makePlan(), /still loading/);
});

test("discovery tolerates cyclic or malformed store containers", () => {
    const f = fixture(); const data = { channel: f.dm }; data.cycle = data;
    f.stores.ChannelStore.getMutablePrivateChannels = () => data;
    assert.equal(f.engine.makePlan().total, 6);
});

test("a stuck asynchronous handler times out and releases the controls", async () => {
    const f = fixture({ dispatchTimeoutMs: 10 });
    f.env.dispatch = () => new Promise(() => {});
    const result = await f.engine.run(f.engine.makePlan());
    assert.equal(result.failed, 6); assert.equal(result.confirmed, 0);
    assert.equal(f.engine.isBusy(), false);
});
