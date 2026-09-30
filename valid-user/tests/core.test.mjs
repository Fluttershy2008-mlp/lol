import test from "node:test";
import assert from "node:assert/strict";
import { extractMentionIds, validId, createResolver, classifyFailure } from "../src/core.mjs";

const A = "1332879948079431743", B = "753962426407452713", C = "12345678901234567890";
const raw = id => ({ id, username: "person", discriminator: "0", avatar: null });
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(options = {}) {
    const users = new Map(), requests = [], accepted = [];
    const resolver = createResolver({
        getUser: id => users.get(id),
        request: async id => { requests.push(id); return { status: 200, body: raw(id) }; },
        accept: user => { accepted.push(user); users.set(user.id, user); }, spacing: 0,
        ...options
    });
    return { resolver, users, requests, accepted };
}
test("reads screenshot IDs, raw and parsed embed fields, components and snapshots", () => {
    const data = { embeds: [{ description: `<@${A}>`, fields: [{ rawValue: `<@!${B}>` }] }],
        components: [{ components: [{ type: 10, content: `<@${C}>` }] }],
        message_snapshots: [{ message: { embeds: [{ rawDescription: `<@${A}>` }] } }],
        messageSnapshots: [{ message: { content: `<@!${B}>` } }] };
    const before = JSON.stringify(data);
    assert.deepEqual(extractMentionIds(data), [A, B, C]);
    assert.equal(JSON.stringify(data), before);
});
test("ignores roles, channels and malformed IDs; accepts user profile links", () => {
    assert.deepEqual(extractMentionIds(`<@&${A}> <#${B}> <@123> https://discord.com/users/${C}`), [C]);
    assert.equal(validId(Number(A)), false);
    assert.deepEqual(extractMentionIds("<@123456789012345678901>"), []);
});
test("handles cycles, null fields and huge messages with bounded results", () => {
    const value = { embeds: [null, { description: 42 }], content: `<@${A}>` };
    value.message = value;
    assert.deepEqual(extractMentionIds(value), [A]);
    const many = Array.from({ length: 1000 }, (_, i) => `<@${1332879948079431000n + BigInt(i)}>`).join(" ");
    assert.equal(extractMentionIds(many).length, 40);
});
test("simultaneous lookups for the same ID share one request; resolved users stay cached", async () => {
    const { resolver, requests, accepted } = harness();
    const first = resolver.resolve(A), second = resolver.resolve(A);
    assert.equal(first, second);
    assert.equal((await first).status, "resolved");
    assert.equal((await resolver.resolve(A)).status, "resolved");
    assert.deepEqual(requests, [A]); assert.equal(accepted.length, 1); resolver.stop();
});
test("only one request runs at a time", async () => {
    let concurrent = 0, maximum = 0;
    const { resolver } = harness({ request: async id => {
        maximum = Math.max(maximum, ++concurrent); await tick(); concurrent--;
        return { body: raw(id) };
    } });
    await Promise.all([A, B, C].map(resolver.resolve));
    assert.equal(maximum, 1); resolver.stop();
});
test("403/404/network errors never fabricate or cache users", async () => {
    for (const [error, status] of [[{ status: 403 }, "unavailable"], [{ status: 404, body: { code: 10013 } }, "unknown"], [new Error("offline"), "retry"]]) {
        let calls = 0;
        const { resolver, accepted } = harness({ request: async () => { calls++; throw error; } });
        assert.equal((await resolver.resolve(A)).status, status);
        assert.equal((await resolver.resolve(A)).status, status);
        assert.equal(calls, 1); assert.equal(accepted.length, 0); resolver.stop();
    }
});
test("resolved HTTP error responses get the same handling as rejected requests", async () => {
    const { resolver, accepted } = harness({ request: async () => ({ status: 403, body: { message: "Missing Access" } }) });
    assert.equal((await resolver.resolve(A)).status, "unavailable");
    assert.equal(accepted.length, 0); resolver.stop();
});
test("429 retry_after is seconds and pauses all user lookups until its deadline", async () => {
    let clock = 1000, calls = 0;
    const { resolver } = harness({ now: () => clock, request: async id => {
        calls++;
        if (calls === 1) throw { status: 429, body: { retry_after: 1.5 } };
        return { body: raw(id) };
    } });
    const result = await resolver.resolve(A);
    assert.equal(result.until, 2750);
    assert.equal((await resolver.resolve(B)).status, "rate-limited");
    assert.equal(calls, 1); clock = 2751;
    assert.equal((await resolver.resolve(B)).status, "resolved"); resolver.stop();
    assert.equal(classifyFailure({ status: 429, body: { retry_after: 3600 } }, 0).until, 3600250);
});
test("failed lookup can be retried once its short cooldown expires", async () => {
    let clock = 0, calls = 0;
    const { resolver } = harness({ now: () => clock, request: async id => {
        if (++calls === 1) throw new Error("offline"); return { body: raw(id) };
    } });
    assert.equal((await resolver.resolve(A)).status, "retry"); clock = 15001;
    assert.equal((await resolver.resolve(A)).status, "resolved"); resolver.stop();
});
test("malformed and mismatched successful responses cannot corrupt UserStore", async () => {
    for (const body of [{ id: B, username: "wrong" }, { id: A }, { id: A, username: "Deleted User" }]) {
        const { resolver, accepted } = harness({ request: async () => ({ body }) });
        assert.equal((await resolver.resolve(A)).status, "retry");
        assert.equal(accepted.length, 0); resolver.stop();
    }
});
test("late HTTP completion after timeout is ignored", async () => {
    let finish;
    const { resolver, accepted } = harness({ timeout: 5, request: () => new Promise(resolve => { finish = resolve; }) });
    assert.equal((await resolver.resolve(A)).status, "retry");
    finish({ body: raw(A) }); await tick();
    assert.equal(accepted.length, 0); resolver.stop();
});
test("stop cancels in-flight and queued work; late completion cannot dispatch", async () => {
    let finish;
    const { resolver, accepted } = harness({ request: () => new Promise(resolve => { finish = resolve; }) });
    const one = resolver.resolve(A), two = resolver.resolve(B); await tick(); resolver.stop();
    assert.equal((await one).status, "cancelled"); assert.equal((await two).status, "cancelled");
    finish({ body: raw(A) }); await tick(); assert.equal(accepted.length, 0);
});
test("switching accounts discards old responses even without an unload", async () => {
    let sameAccount = true, finish;
    const { resolver, accepted } = harness({ isCurrent: () => sameAccount,
        request: () => new Promise(resolve => { finish = resolve; }) });
    const promise = resolver.resolve(A); await tick(); sameAccount = false;
    finish({ body: raw(A) }); assert.equal((await promise).status, "cancelled");
    assert.equal(accepted.length, 0); resolver.stop();
});
test("the lookup queue is bounded", async () => {
    const { resolver } = harness({ request: () => new Promise(() => {}) });
    const jobs = Array.from({ length: 101 }, (_, i) => resolver.resolve(String(1332879948079431000n + BigInt(i))));
    assert.equal((await jobs[100]).status, "busy"); resolver.stop(); await Promise.all(jobs);
});
