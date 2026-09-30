import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import createPlugin from "../src/plugin.mjs";
const A = "1332879948079431743", CHANNEL = "123456789012345678";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function harness({ missingMenu = false, missingRest = false, request } = {}) {
    const cache = new Map(), handlers = new Map(), events = [], requests = [], alerts = [], profiles = [];
    const users = { getUser: id => cache.get(id), getCurrentUser: () => ({ id: "753962426407452713" }), emitChange() {} };
    const dispatcher = {
        subscribe(event, fn) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(fn); },
        unsubscribe(event, fn) { handlers.get(event)?.delete(fn); },
        dispatch(event) {
            events.push(event);
            if (event.type === "USER_UPDATE") cache.set(event.user.id, event.user);
            for (const fn of handlers.get(event.type) ?? []) fn(event);
        }
    };
    const Row = () => {}; Row.Group = () => {}; Row.Icon = () => {};
    const sheet = { openLazy(lazy) { return lazy; }, hideActionSheet() {} };
    const rest = { get: request ?? (async ({ url }) => {
        requests.push(url); return { status: 200, body: { id: url.split("/").pop(), username: "Resolved Name" } };
    }), post() {}, del() {} };
    const React = {
        createElement: (type, props, ...children) => ({ type, key: props?.key, props: { ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) } }),
        cloneElement: (node, props, ...children) => ({ ...node, props: { ...node.props, ...props, ...(children.length ? { children } : {}) } }),
        memo: (type, compare) => ({ $$typeof: Symbol.for("react.memo"), type, compare }),
        forwardRef: render => ({ $$typeof: Symbol.for("react.forward_ref"), render })
    };
    const stores = { UserStore: users, MessageStore: { getMessages: () => [] }, SelectedChannelStore: { getChannelId: () => CHANNEL } };
    const modules = [users, ...(missingMenu ? [] : [sheet, { ActionSheetRow: Row }]), ...(missingRest ? [] : [rest])];
    const V = {
        metro: { common: { React, ReactNative: { Alert: { alert: (...args) => alerts.push(args) } }, FluxDispatcher: dispatcher },
            findByProps: (...props) => modules.find(m => props.every(p => p in m)), findByStoreName: name => stores[name],
            findByName: name => name === "showUserProfileActionSheet" ? value => profiles.push(value) : undefined },
        patcher: { before(key, object, callback) {
            const original = object[key]; object[key] = function (...args) { callback(args); return original.apply(this, args); };
            return () => { object[key] = original; };
        } },
        plugin: { storage: {} }, logger: { warn() {} },
        ui: { toasts: { showToast() {} }, assets: { getAssetIDByName: () => 1 } }
    };
    return { V, plugin: createPlugin(V), cache, events, requests, alerts, profiles, dispatcher, handlers, sheet, Row, React };
}
test("published bundle evaluates to a Revenge lifecycle object and matches its manifest hash", () => {
    const { V } = harness();
    const code = readFileSync(new URL("../index.js", import.meta.url), "utf8");
    const plugin = vm.runInNewContext(code, { vendetta: V, setTimeout, clearTimeout });
    assert.equal(typeof plugin.onLoad, "function"); assert.equal(typeof plugin.settings, "function");
    const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url)));
    assert.equal(manifest.hash, createHash("sha256").update(code).digest("hex"));
    plugin.onLoad(); plugin.onUnload();
});
test("automatic raw embed resolution only touches UserStore, never rewrites the message", async () => {
    const t = harness(); t.plugin.onLoad();
    const message = Object.freeze({ id: "987654321012345678", channel_id: CHANNEL,
        embeds: Object.freeze([{ description: `<@${A}> nickname changed`, color: 1234 }]) });
    t.dispatcher.dispatch({ type: "LOAD_MESSAGES_SUCCESS", channelId: CHANNEL, messages: [message] });
    await wait(15);
    assert.equal(t.cache.get(A)?.username, "Resolved Name");
    assert.equal(t.events.filter(e => e.type === "MESSAGE_UPDATE").length, 0);
    assert.equal(message.embeds[0].description, `<@${A}> nickname changed`);
    t.plugin.onUnload(); assert.equal([...t.handlers.values()].reduce((n, s) => n + s.size, 0), 0);
});
test("background channels are not fetched and auto lookup can be disabled", async () => {
    const t = harness(); t.plugin.onLoad();
    t.dispatcher.dispatch({ type: "MESSAGE_CREATE", message: { channel_id: "999999999999999999", content: `<@${A}>` } });
    t.V.plugin.storage.autoResolve = false;
    t.dispatcher.dispatch({ type: "MESSAGE_CREATE", message: { channel_id: CHANNEL, content: `<@${A}>` } });
    await wait(10); assert.equal(t.requests.length, 0); t.plugin.onUnload();
});
test("message menu wraps only this opening, keeps the original tree immutable and opens the resolved profile", async () => {
    const t = harness(), h = t.React.createElement; t.plugin.onLoad();
    const children = Object.freeze([h(t.Row, { label: "Reply", onPress() {} })]);
    const tree = h(t.Row.Group, { children });
    const module = { default: () => tree }, original = module.default;
    const wrapped = await t.sheet.openLazy(Promise.resolve(module), "MessageLongPressActionSheet", { message: { content: `<@${A}>` } });
    assert.equal(module.default, original);
    const result = wrapped.default({}), row = result.props.children[0];
    assert.equal(row.props.label, "Resolve mentions / Open profile"); assert.equal(children.length, 1);
    row.props.onPress(); await wait(190);
    assert.equal(t.alerts.length, 1);
    t.alerts[0][2].find(button => button.text === "Open profile").onPress();
    assert.deepEqual(t.profiles, [{ userId: A }]);
    t.plugin.onUnload(); t.plugin.onLoad(); row.props.onPress();
    await wait(170); assert.equal(t.alerts.length, 1); t.plugin.onUnload();
});
test("resolved lazy module after unload is not patched", async () => {
    const t = harness(); t.plugin.onLoad(); let finish;
    const original = { default() {} };
    const promise = t.sheet.openLazy(new Promise(resolve => { finish = resolve; }), "MessageLongPressActionSheet", {});
    t.plugin.onUnload(); finish(original); assert.equal(await promise, original);
});
test("optional menu modules can be absent; required lookup failure leaves no subscriptions", () => {
    const t = harness({ missingMenu: true }); t.plugin.onLoad(); t.plugin.onUnload();
    const missing = harness({ missingRest: true });
    assert.throws(() => missing.plugin.onLoad(), /lookup modules/);
    assert.equal(missing.handlers.size, 0);
});
test("React memo and forwardRef sheets keep the mention action", async () => {
    for (const shape of ["memo", "forward_ref"]) {
        const t = harness(), h = t.React.createElement; t.plugin.onLoad();
        const render = () => h(t.Row.Group, { children: [h(t.Row, { label: "Reply", onPress() {} })] });
        const component = shape === "memo" ? t.React.memo(render) : t.React.forwardRef(render);
        const wrapped = await t.sheet.openLazy(Promise.resolve({ default: component }), "MessageLongPressActionSheet", { message: { content: `<@${A}>` } });
        const tree = shape === "memo" ? wrapped.default.type({}) : wrapped.default.render({}, null);
        assert.equal(tree.props.children[0].props.label, "Resolve mentions / Open profile");
        t.plugin.onUnload();
    }
});
