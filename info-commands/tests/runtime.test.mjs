import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

const source = await readFile(new URL("../index.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
const A = "123456789012345678";
const B = "223456789012345678";
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness({ modern = false, fallback = false, apiFailure = false, pending = false, cached = true, profileMethod = "openUserProfileModal", profileThrows = false, missingOwner = false, rich = false } = {}) {
    const requests = [], alerts = [], opens = [], hidden = [], commands = [], notifications = [], copied = [], errors = [], timeouts = [], profiles = [], events = [];
    const guilds = {
        [A]: { id: A, name: "Server A", ownerId: "333456789012345678", features: new Set(["COMMUNITY"]), premiumTier: 2 },
        [B]: { id: B, name: "Server B", ownerId: "444456789012345678", features: ["COMMUNITY"] },
    };
    if (missingOwner) for (const guild of Object.values(guilds)) delete guild.ownerId;
    const menu = { default: function getGuildsBarGuildMenuItems() { return [{ label: "Mark As Read" }, { label: "Notifications" }, { label: "More Options" }]; } };
    const contexts = { showContextMenu(menu) { return menu; }, hideContextMenu() { hidden.push("context"); } };
    const sheets = { openLazy(promise, key, props) { opens.push({ promise, key, props }); }, hideActionSheet(key) { hidden.push(key); events.push("hide"); } };
    const api = { post() { throw new Error("Unexpected POST"); }, get({ url }) {
        requests.push(url);
        if (pending) return new Promise(() => {});
        if (apiFailure) return Promise.reject(new Error("offline"));
        if (url.startsWith("/users/")) return Promise.resolve({ body: { id: A, username: "Test user" } });
        if (url.startsWith("/invites/")) return Promise.resolve({ body: { code: "test", guild: { id: A, name: "Server A" }, expires_at: "2026-10-15T00:00:00Z" } });
        const id = url.match(/\/guilds\/(\d+)/)[1];
        return Promise.resolve({ body: { id, name: guilds[id].name, owner_id: guilds[id].ownerId, approximate_member_count: 120, approximate_presence_count: 0, features: ["COMMUNITY"], verification_level: 0, nsfw_level: 0, mfa_level: 0, explicit_content_filter: 0, widget_enabled: false, icon: rich ? guilds[id].icon : "test" } });
    } };
    const hookInstances = new Map(), effects = [];
    let cursor = 0, instance;
    const React = {
        createElement(type, props, ...children) { return { type, key: props?.key, props: { ...props, children } }; },
        useState(initial) {
            const index = cursor++;
            const state = instance.values;
            if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
            instance.setters[index] ??= value => { state[index] = typeof value === "function" ? value(state[index]) : value; };
            return [state[index], instance.setters[index]];
        },
        useReducer(reduce, initial) {
            const [value, set] = React.useState(initial);
            const index = cursor - 1;
            instance.reducers[index] ??= action => set(value => reduce(value, action));
            return [value, instance.reducers[index]];
        },
        useRef(value) { return React.useState(() => ({ current: value }))[0]; },
        useEffect(effect, deps) {
            const index = cursor++, owner = instance;
            const previous = owner.effects[index];
            if (previous && deps && previous.deps && deps.every((value, i) => value === previous.deps[i])) return;
            effects.push(() => {
                previous?.cleanup?.();
                owner.effects[index] = { deps, cleanup: effect() };
            });
        },
        Fragment: "Fragment",
    };
    const RN = { Text: "Text", View: "View", Image: "Image", ScrollView: "ScrollView", TouchableOpacity: "TouchableOpacity", Dimensions: { get: () => ({ height: 800 }) }, Alert: { alert(...args) { alerts.push(args); } } };
    function ActionSheet() {}
    function ActionSheetRow() {}
    function searchTree(value, predicate) {
        const seen = new Set();
        function walk(n) {
            if (predicate(n)) return n;
            if (!n || typeof n !== "object" || seen.has(n)) return;
            seen.add(n);
            for (const v of Object.values(n)) { const found = walk(v); if (found) return found; }
        }
        return walk(value);
    }
    const stores = { ThemeStore: { theme: "dark" }, GuildStore: { getGuild: id => cached ? guilds[id] : null }, UserStore: { getCurrentUser: () => ({ id: "1" }), getUser: id => ({ id, username: "Server owner" }) } };
    const listeners = new Set(), memberRequests = [];
    if (rich) {
        guilds[A].icon = "a_icon"; guilds[A].banner = "a_banner";
        const friendIds = Array.from({ length: 7 }, (_, i) => String(600000000000000000n + BigInt(i)));
        stores.GuildRoleStore = { getSortedRoles: () => [{ id: "role1" }, { id: "role2" }] };
        const channels = [{ channel: { id: "channel1" } }, { channel: { id: "channel2" } }];
        stores.GuildChannelStore = { getChannels: () => ({ SELECTABLE: channels, VOCAL: [channels[0]] }) };
        stores.RelationshipStore = { getFriendIDs: () => friendIds };
        stores.GuildMemberStore = { getMember: (guildId, id) => guildId === A && friendIds.includes(id) ? { nick: `Friend ${friendIds.indexOf(id) + 1}` } : undefined };
        stores.GuildMemberCountStore = { getMemberCount: () => 200, getOnlineCount: () => 0 };
        stores.UserStore.getUser = id => ({ id, username: friendIds.includes(id) ? "Friend user" : "Server owner", avatar: "a_avatar" });
        for (const store of Object.values(stores)) {
            const callbacks = new Set();
            store.addChangeListener = fn => { callbacks.add(fn); listeners.add(callbacks); };
            store.removeChangeListener = fn => { callbacks.delete(fn); if (!callbacks.size) listeners.delete(callbacks); };
        }
    }
    const profile = profileMethod ? { [profileMethod](options) {
        if (profileThrows) throw new Error("Unsupported profile opener");
        profiles.push(options); events.push("profile");
    } } : null;
    const modules = [api, contexts, ...(fallback ? [] : [sheets, { ActionSheet }]), { ActionSheetRow }, { colors: {}, meta: { resolveSemanticColor: () => "#2b2d31" } }, ...(profile ? [profile] : [])];
    if (rich) modules.push({ requestMembersById: (...args) => memberRequests.push(args) });
    function patch(kind, name, obj, callback) {
        const original = obj[name];
        const wrapper = function (...args) {
            if (kind === "before") callback(args);
            const result = original.apply(this, args);
            if (kind === "after") return callback(args, result) ?? result;
            return result;
        };
        obj[name] = wrapper;
        return () => { if (obj[name] === wrapper) obj[name] = original; };
    }
    const vendetta = {
        metro: {
            findByProps: (...keys) => modules.find(m => keys.every(k => k in m)),
            findByStoreName: name => stores[name],
            findByName: () => modern ? undefined : menu,
            find: predicate => modern ? undefined : [menu].find(predicate),
            common: { React, ReactNative: RN, clipboard: { setString: value => copied.push(value) } },
        },
        patcher: { before: (n, o, f) => patch("before", n, o, f), after: (n, o, f) => patch("after", n, o, f) },
        commands: { registerCommand(command) { commands.push(command); return () => commands.splice(commands.indexOf(command), 1); } },
        ui: { semanticColors: {}, toasts: { showToast: value => notifications.push(value) } },
        utils: { findInReactTree: searchTree },
    };
    const sandbox = { vendetta, window: {}, console: { log() {}, error: (...args) => errors.push(args) },
        setTimeout: (callback, delay) => { const timer = { callback, delay, cleared: false }; timeouts.push(timer); return timer; },
        clearTimeout: timer => { if (timer) timer.cleared = true; },
    };
    const plugin = vm.runInNewContext(source, sandbox);
    const render = (component, props = opens.at(-1)?.props ?? {}) => {
        function expand(node, path) {
            if (Array.isArray(node)) return node.map((child, i) => expand(child, `${path}.${i}`));
            if (!node || typeof node !== "object") return node;
            if (typeof node.type === "function" && node.type !== ActionSheet && node.type !== ActionSheetRow) {
                const key = `${path}:${node.type.name}`;
                if (!hookInstances.has(key)) hookInstances.set(key, { values: [], setters: [], reducers: [], effects: [] });
                instance = hookInstances.get(key); cursor = 0;
                return expand(node.type(node.props), `${key}.render`);
            }
            return { ...node, props: { ...node.props, children: expand(node.props?.children, `${path}.children`) } };
        }
        return expand(React.createElement(component, props), "root");
    };
    return { plugin, requests, alerts, opens, hidden, commands, notifications, copied, errors, timeouts, menu, contexts, sheets, ActionSheetRow, React, profiles, events, searchTree, listeners, memberRequests,
        render,
        mountEffects() { for (const effect of effects.splice(0)) effect(); },
        unmount() { for (const state of hookInstances.values()) for (const effect of state.effects) effect?.cleanup?.(); hookInstances.clear(); },
    };
}

test("bundle and manifest match and startup registers only preserved commands without fetching", () => {
    assert.equal(createHash("sha256").update(source).digest("hex"), manifest.hash);
    const h = harness();
    h.plugin.onLoad(); h.plugin.onLoad();
    assert.deepEqual(h.commands.map(c => c.name), ["userinfo", "inviteinfo"]);
    assert.deepEqual(h.requests, []);
    h.plugin.onUnload();
    assert.equal(h.commands.length, 0);
});

test("long press keeps existing entries, adds one row, and loads the pressed server", async () => {
    const h = harness({ fallback: true }); h.plugin.onLoad();
    const original = h.menu.default(A);
    assert.deepEqual(Array.from(original, item => item.label), ["Mark As Read", "Notifications", "More Options", "Server Info"]);
    const menu = h.contexts.showContextMenu({ key: B, items: original });
    assert.equal(menu.items.filter(x => x.label === "Server Info").length, 1);
    // A row that is already present keeps the guild it was built for.
    h.menu.default(B).at(-1).action(); await tick();
    assert.deepEqual(h.requests, [`/guilds/${B}?with_counts=true`]);
    assert.match(h.alerts[0][0], /Server B/);
    assert.match(h.alerts[0][1], /0 online/);
    h.alerts[0][2].find(button => button.text === "Copy Server ID").onPress();
    assert.deepEqual(h.copied, [B]);
    h.plugin.onUnload();
});

test("native context menus resolve the clicked guild and ignore user/channel menus", async () => {
    const h = harness({ modern: true, fallback: true }); h.plugin.onLoad();
    for (const menu of [{ key: "55555555555", guildId: A, userId: "55555555555", items: [] }, { key: "55555555555", guildId: A, channel: { id: "55555555555" }, items: [] }, { key: "unknown", items: [] }]) {
        assert.equal(h.contexts.showContextMenu(menu).items.length, 0);
    }
    const target = h.contexts.showContextMenu({ key: B, items: [{ label: "Existing" }] });
    target.items.at(-1).action(); await tick();
    assert.match(h.alerts[0][0], /Server B/);
    h.plugin.onUnload();
});

test("offline cached details keep unknown counts honest and support Set features", async () => {
    const h = harness({ fallback: true, apiFailure: true }); h.plugin.onLoad();
    h.menu.default(A).at(-1).action(); await tick();
    assert.match(h.alerts[0][1], /cached/);
    assert.match(h.alerts[0][1], /Unknown total\nUnknown online/);
    assert.match(h.alerts[0][1], /Features: Community/);
    h.plugin.onUnload();
});

test("request timeout falls back to cache and clears its timer", async () => {
    const h = harness({ fallback: true, pending: true }); h.plugin.onLoad();
    h.menu.default(A).at(-1).action(); await tick();
    assert.equal(h.timeouts[0].delay, 8000);
    h.timeouts[0].callback(); await tick();
    assert.match(h.alerts[0][1], /cached/);
    assert.equal(h.timeouts[0].cleared, true);
    h.plugin.onUnload();
});

test("no data produces a visible error instead of an empty sheet", async () => {
    const h = harness({ fallback: true, apiFailure: true, cached: false }); h.plugin.onLoad();
    h.menu.default(A).at(-1).action(); await tick();
    assert.equal(h.alerts.length, 0);
    assert.match(h.notifications.at(-1), /unavailable/);
    h.plugin.onUnload();
});

test("replacement sheet displays cached details immediately and repeated tap opens once", async () => {
    const h = harness(); h.plugin.onLoad();
    const item = h.menu.default(B).at(-1);
    item.action(); item.action();
    assert.equal(h.opens.length, 1);
    const module = await h.opens[0].promise;
    const initial = h.render(module.default);
    assert.match(JSON.stringify(initial), /Server B/);
    h.mountEffects(); await tick();
    const loaded = h.render(module.default);
    assert.match(JSON.stringify(loaded), /Server B/);
    assert.match(JSON.stringify(loaded), /223456789012345678/);
    h.unmount(); item.action();
    assert.equal(h.opens.length, 2);
    h.plugin.onUnload();
});

test("lazy menu injection tracks each guild, avoids duplicates, and is removed on unload", async () => {
    const h = harness({ modern: true }); h.plugin.onLoad();
    const original = () => h.React.createElement("Menu", { items: [{ label: "Notifications" }] });
    const module = { default: original };
    h.sheets.openLazy(Promise.resolve(module), "GuildContextMenu", { guildId: A }); await tick();
    let rendered = module.default();
    assert.equal(rendered.props.items.filter(x => x.label === "Server Info").length, 1);
    h.sheets.openLazy(Promise.resolve(module), "GuildContextMenu", { guildId: B }); await tick();
    rendered = module.default();
    rendered.props.items.at(-1).action();
    assert.equal(h.opens.at(-1).key, `info-commands-server-info-${B}`);
    h.plugin.onUnload();
    assert.equal(module.default, original);
});

test("lazy ActionSheetRow layout adds a usable row and frozen layouts do not crash", async () => {
    const h = harness({ modern: true }); h.plugin.onLoad();
    const module = { default: () => h.React.createElement("View", {}, h.React.createElement(h.ActionSheetRow, { label: "Notifications" })) };
    h.sheets.openLazy(Promise.resolve(module), "GuildContextMenu", { guildId: A }); await tick();
    const rendered = module.default();
    const row = rendered.props.children.at(-1);
    assert.equal(row.props.label, "Server Info"); row.props.onPress();
    assert.match(h.opens.at(-1).key, new RegExp(A));
    const frozen = { default: () => ({ props: Object.freeze({ items: [] }) }) };
    h.sheets.openLazy(Promise.resolve(frozen), "GuildContextMenu", { guildId: A }); await tick();
    assert.doesNotThrow(() => frozen.default());
    h.plugin.onUnload();
});

test("late lazy resolutions after unloading cannot install new hooks", async () => {
    const h = harness({ modern: true }); h.plugin.onLoad();
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    const original = () => ({ props: { items: [] } });
    const module = { default: original };
    h.sheets.openLazy(promise, "GuildContextMenu", { guildId: A });
    h.plugin.onUnload(); resolve(module); await tick();
    assert.equal(module.default, original);
    assert.equal(h.menu.default(A).length, 3);
});

test("disable/re-enable cleans all hooks and stale menu actions do nothing", async () => {
    const h = harness({ fallback: true }); h.plugin.onLoad();
    const stale = h.menu.default(A).at(-1);
    h.plugin.onUnload(); stale.action(); await tick();
    assert.equal(h.requests.length, 0);
    assert.equal(h.menu.default(A).length, 3);
    h.plugin.onLoad();
    assert.equal(h.menu.default(A).length, 4);
    assert.equal(h.commands.length, 2);
    h.plugin.onUnload();
});

test("userinfo and inviteinfo retain options and generate private command output", async () => {
    const h = harness(); h.plugin.onLoad();
    const user = h.commands.find(c => c.name === "userinfo");
    const invite = h.commands.find(c => c.name === "inviteinfo");
    assert.deepEqual(Array.from(user.options, o => o.name), ["user_id", "ephemeral"]);
    assert.deepEqual(Array.from(invite.options, o => o.name), ["invite", "ephemeral"]);
    const u = await user.execute([{ name: "user_id", value: A }, { name: "ephemeral", value: true }], {});
    assert.equal(u.data.flags, 64);
    assert.equal(u.data.embeds[0].author.name, "Test user");
    const i = await invite.execute([{ name: "invite", value: "https://discord.gg/test" }, { name: "ephemeral", value: true }], {});
    assert.equal(i.data.flags, 64);
    assert.equal(i.data.embeds[0].title, "Server A");
    assert.notEqual(i.data.embeds[0].fields.find(f => f.name === "Expires").value, "Never");
    h.plugin.onUnload();
});

for (const method of ["openUserProfileModal", "openUserProfile", "showUserProfile"]) {
    test(`Owner ID opens the correct owner's profile using ${method}`, async () => {
        const h = harness({ profileMethod: method }); h.plugin.onLoad();
        h.menu.default(B).at(-1).action();
        const { default: component } = await h.opens[0].promise;
        h.render(component); h.mountEffects(); await tick();
        const rendered = h.render(component);
        const owner = h.searchTree(rendered, node => node?.props?.accessibilityLabel === "Owner");
        assert.ok(owner);
        assert.match(JSON.stringify(owner), /Server owner/);
        owner.props.onPress();
        assert.equal(h.profiles.length, 1);
        assert.equal(h.profiles[0].userId, "444456789012345678");
        assert.equal(h.profiles[0].guildId, B);
        assert.deepEqual(h.events.slice(-2), ["hide", "profile"]);
        assert.equal(h.opens.length, 1);
        assert.deepEqual(h.copied, []);
        h.plugin.onUnload();
    });
}

test("cached owner ID and older native alert still open the owner's profile", async () => {
    const h = harness({ fallback: true, apiFailure: true }); h.plugin.onLoad();
    h.menu.default(A).at(-1).action(); await tick();
    const button = h.alerts[0][2].find(button => button.text === "View Owner Profile");
    assert.ok(button); button.onPress();
    assert.equal(h.profiles[0].userId, "333456789012345678");
    assert.equal(h.profiles[0].guildId, A);
    assert.equal(h.alerts[0][2].length, 3);
    h.plugin.onUnload();
});

test("an unavailable owner ID stays plain and is not passed to a profile opener", async () => {
    const h = harness({ missingOwner: true }); h.plugin.onLoad();
    h.menu.default(A).at(-1).action();
    const { default: component } = await h.opens[0].promise;
    h.render(component); h.mountEffects(); await tick();
    const rendered = h.render(component);
    assert.equal(h.searchTree(rendered, node => node?.props?.accessibilityLabel === "Owner")?.props?.onPress, undefined);
    assert.match(JSON.stringify(rendered), /Owner/);
    assert.match(JSON.stringify(rendered), /—/);
    assert.equal(h.profiles.length, 0);
    h.plugin.onUnload();
});

for (const options of [{ profileMethod: null }, { profileThrows: true }]) {
    test(`missing or failing profile helper shows feedback without crashing: ${JSON.stringify(options)}`, async () => {
        const h = harness({ fallback: true, ...options }); h.plugin.onLoad();
        h.menu.default(A).at(-1).action(); await tick();
        assert.doesNotThrow(() => h.alerts[0][2].find(button => button.text === "View Owner Profile").onPress());
        assert.match(h.notifications.at(-1), /profiles are unavailable/);
        assert.equal(h.profiles.length, 0);
        h.plugin.onUnload();
    });
}

test("supplied layout renders overview, animated images, expandable friends, and profile/copy actions", async () => {
    const h = harness({ rich: true }); h.plugin.onLoad();
    assert.equal(h.memberRequests.length, 0);
    assert.equal(h.listeners.size, 0);
    h.menu.default(A).at(-1).action();
    const { default: component } = await h.opens[0].promise;
    h.render(component); h.mountEffects(); await tick();
    let rendered = h.render(component);
    assert.match(JSON.stringify(rendered), /Overview/);
    assert.match(JSON.stringify(rendered), /Friends in Server/);
    assert.match(JSON.stringify(rendered), /a_banner\.gif\?size=1024/);
    assert.match(JSON.stringify(rendered), /a_icon\.gif\?size=128/);
    const row = label => h.searchTree(rendered, node => node?.props?.accessibilityLabel === label);
    assert.match(JSON.stringify(row("Members")), /200/);
    assert.match(JSON.stringify(row("Online")), /"0"/);
    assert.match(JSON.stringify(row("Channels")), /"2"/);
    assert.match(JSON.stringify(row("Roles")), /"2"/);
    assert.equal(h.memberRequests.length, 1);
    assert.equal(h.memberRequests[0][0], A);
    assert.equal(h.memberRequests[0][1].length, 7);
    assert.equal(h.memberRequests[0][2], false);
    assert.equal(row("Friend 6 (Friend user)"), undefined);
    row("Show all 7 friends").props.onPress();
    rendered = h.render(component);
    row("Friend 7 (Friend user)").props.onPress();
    assert.equal(h.profiles.at(-1).userId, "600000000000000006");
    assert.equal(h.profiles.at(-1).guildId, A);
    row("ID").props.onPress();
    assert.deepEqual(h.copied, [A]);
    h.unmount();
    assert.equal(h.listeners.size, 0);
    assert.ok(h.timeouts.every(timer => timer.cleared));
    h.plugin.onUnload();
});

test("replacement sheet shows a loading state, then a visible error if there is no cached or fetched guild", async () => {
    const h = harness({ cached: false, apiFailure: true }); h.plugin.onLoad();
    h.menu.default(A).at(-1).action();
    const { default: component } = await h.opens[0].promise;
    assert.match(JSON.stringify(h.render(component)), /Loading server info/);
    h.mountEffects(); await tick();
    assert.match(JSON.stringify(h.render(component)), /Server details are unavailable/);
    h.unmount(); h.plugin.onUnload();
});
