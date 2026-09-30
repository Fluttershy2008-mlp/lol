import { validId, extractMentionIds, createResolver } from "./core.mjs";

export default function createPlugin(V) {
    "use strict";
    const { React, ReactNative: RN } = V.metro.common;
    const h = React.createElement, storage = V.plugin?.storage ?? {};
    const unpatches = [], timers = new Set(), autoIds = new Set();
    let active = false, generation = 0, resolver, scanTimer, refreshTimer;
    let users, messages, selected, dispatcher, rest, sheetHost, Row;
    const byProps = (...keys) => { try { return V.metro.findByProps(...keys); } catch {} };
    const byStore = name => { try { return V.metro.findByStoreName(name); } catch {} };
    const byName = name => { try { return V.metro.findByName(name); } catch {} };
    const toast = text => { try { V.ui.toasts.showToast(text); } catch {} };
    const log = text => { try { V.logger.warn(`[ValidUser] ${text}`); } catch {} };
    const asset = () => {
        for (const name of ["MentionIcon", "ic_mention_24px"]) {
            try { const id = V.ui.assets.getAssetIDByName(name); if (id != null) return id; } catch {}
        }
    };
    function later(fn, delay = 0) {
        const session = generation;
        const timer = setTimeout(() => {
            timers.delete(timer);
            if (active && session === generation) { try { fn(); } catch { log("A UI refresh was skipped."); } }
        }, delay);
        timers.add(timer);
        return timer;
    }
    function refresh() {
        if (refreshTimer) return;
        refreshTimer = later(() => {
            refreshTimer = null;
            // Notify subscribers only. Never fake MESSAGE_UPDATE, modify message text,
            // or reserialize embeds/attachments just to repaint a mention.
            for (const store of [users, messages]) {
                try { store?.emitChange?.(); } catch {}
            }
        }, 30);
    }
    function resetResolver() {
        resolver?.stop(); generation++;
        for (const timer of timers) clearTimeout(timer);
        timers.clear(); autoIds.clear(); scanTimer = refreshTimer = null;
        const session = generation, account = users.getCurrentUser?.()?.id;
        resolver = createResolver({
            getUser: id => users.getUser(id),
            isCurrent: () => active && generation === session && account === users.getCurrentUser?.()?.id,
            request: id => rest.get({ url: `/users/${id}` }),
            accept: raw => dispatcher.dispatch({ type: "USER_UPDATE", user: raw }),
            onResolved: refresh
        });
    }
    function statusText(result) {
        switch (result.status) {
            case "resolved": return "Resolved. You can open this user's profile.";
            case "unavailable": return "Discord refused this lookup. Your account may not have access to this user.";
            case "unknown": return "Discord could not find this user. The ID may be invalid, unavailable, or deleted.";
            case "rate-limited": return `Discord asked us to slow down. Try again in ${Math.max(1, Math.ceil((result.until - Date.now()) / 1000))} seconds.`;
            case "busy": return "There are too many pending lookups. Try again shortly.";
            case "invalid": return "Enter a valid user ID, mention, or Discord user link.";
            case "cancelled": return "Lookup cancelled.";
            default: return "The lookup failed or timed out. Check your connection and try again shortly.";
        }
    }
    function displayName(result) {
        const user = result.user;
        return user?.globalName || user?.global_name || user?.username || result.id;
    }
    async function openProfile(result) {
        if (!active || result.status !== "resolved") return;
        try {
            const open = byName("showUserProfileActionSheet")
                ?? byProps("showUserProfileActionSheet")?.showUserProfileActionSheet;
            if (typeof open !== "function") {
                toast("Profile opening is unavailable on this Discord version. Try the mention again.");
                return;
            }
            // Let Discord fetch the real profile. Do not invent badges, membership,
            // or a successful profile response when the server denies access.
            await open({ userId: result.id });
        } catch { toast("Discord could not open this profile. Try the mention again."); }
    }
    function showResults(results, index = 0, session = generation) {
        if (!active || session !== generation || !results.length) return;
        const result = results[index];
        const buttons = [{ text: "Done", style: "cancel" }];
        if (results.length > 1) buttons.push({ text: "Next", onPress: () => showResults(results, (index + 1) % results.length, session) });
        if (result.status === "resolved") buttons.push({ text: "Open profile", onPress: () => {
            if (active && session === generation) void openProfile(result);
        } });
        const title = `${displayName(result)}${results.length > 1 ? ` (${index + 1}/${results.length})` : ""}`;
        const text = `${result.id}\n\n${statusText(result)}${result.status === "resolved" ? "\n\nIf the old mention stays visible, switch channels and return." : ""}`;
        try { RN.Alert.alert(title, text, buttons); } catch { toast(statusText(result)); }
    }
    async function resolveMessage(message) {
        const session = generation, ids = extractMentionIds(message);
        if (!active || !ids.length) return;
        toast(`Resolving ${ids.length} mention${ids.length === 1 ? "" : "s"}…`);
        try {
            const results = await Promise.all(ids.map(id => resolver.resolve(id)));
            if (active && generation === session) { refresh(); showResults(results); }
        } catch { if (active && generation === session) toast("Could not resolve these mentions."); }
    }
    function queueMessage(message, eventChannel) {
        if (!active || storage.autoResolve === false || !message) return;
        const channel = message.channel_id ?? message.channelId ?? eventChannel;
        const current = selected?.getChannelId?.();
        if (!current || channel !== current) return;
        for (const id of extractMentionIds(message)) if (autoIds.size < 100) autoIds.add(id);
        if (scanTimer || !autoIds.size) return;
        // Subscriptions can execute inside a dispatch. Defer USER_UPDATE until it ends.
        scanTimer = later(() => {
            scanTimer = null;
            const ids = [...autoIds]; autoIds.clear();
            if (storage.autoResolve === false) return;
            for (const id of ids) void resolver.resolve(id).catch(() => {});
        });
    }
    function scanCurrentChannel() {
        const id = selected?.getChannelId?.();
        if (!id || storage.autoResolve === false) return;
        let list = messages?.getMessages?.(id);
        if (typeof list?.toArray === "function") list = list.toArray();
        else if (typeof list?.values === "function") list = Array.from(list.values());
        else if (Array.isArray(list?._array)) list = list._array;
        if (Array.isArray(list)) for (const message of list.slice(-80)) queueMessage(message, id);
    }
    function subscribe(event, fn) {
        const safe = value => { if (active) { try { fn(value); } catch { log(`Skipped ${event}.`); } } };
        dispatcher.subscribe(event, safe);
        unpatches.push(() => dispatcher.unsubscribe(event, safe));
    }
    function makeRow(message) {
        const icon = asset(), session = generation;
        return h(Row, {
            key: "valid-user-resolve", label: "Resolve mentions / Open profile",
            icon: Row.Icon && icon != null ? h(Row.Icon, { source: icon }) : undefined,
            iconSource: !Row.Icon ? icon : undefined,
            onPress: () => {
                if (!active || session !== generation) return;
                try { sheetHost.hideActionSheet("MessageLongPressActionSheet"); } catch {}
                later(() => { void resolveMessage(message); }, 150);
            }
        });
    }
    function injectRow(tree, message) {
        let target, best = -1, duplicate = false;
        const seen = new Set();
        function inspect(node, depth = 0) {
            if (!node || typeof node !== "object" || depth > 35 || seen.has(node)) return;
            seen.add(node);
            if (node.key === "valid-user-resolve") duplicate = true;
            if (Array.isArray(node)) {
                const score = node.filter(child => child?.props && typeof child.props.onPress === "function"
                    && (child.type === Row || child.props.label != null)).length;
                if (score > best && score > 0) { best = score; target = node; }
                node.forEach(child => inspect(child, depth + 1));
            } else if (node.props) inspect(node.props.children, depth + 1);
        }
        inspect(tree);
        if (duplicate) return tree;
        const row = makeRow(message);
        // Some versions put a single child inside a Row.Group rather than an array.
        function replace(node, depth = 0) {
            if (depth > 35 || !node) return node;
            if (node === target) return [row, ...node];
            if (!target && Row.Group && node.type === Row.Group) {
                target = node;
                return React.cloneElement(node, {}, row, node.props.children);
            }
            if (Array.isArray(node)) {
                const children = node.map(child => replace(child, depth + 1));
                return children.some((child, i) => child !== node[i]) ? children : node;
            }
            if (node.props?.children != null) {
                const children = replace(node.props.children, depth + 1);
                return children === node.props.children ? node : React.cloneElement(node, { children });
            }
            return node;
        }
        return replace(tree);
    }
    function wrapSheet(component, context, session) {
        function transform(props, tree) {
            if (!active || generation !== session) return tree;
            try {
                const message = props?.message ?? context?.message;
                return extractMentionIds(message).length ? injectRow(tree, message) : tree;
            } catch { return tree; }
        }
        if (typeof component === "function" && !component.prototype?.isReactComponent) {
            return function ValidUserSheet(...args) { return transform(args[0], component.apply(this, args)); };
        }
        if (component?.$$typeof === Symbol.for("react.memo")) return React.memo(wrapSheet(component.type, context, session), component.compare);
        if (component?.$$typeof === Symbol.for("react.forward_ref")) return React.forwardRef((props, ref) => transform(props, component.render(props, ref)));
        return component;
    }
    function Settings() {
        const [value, setValue] = React.useState("");
        const [auto, setAuto] = React.useState(storage.autoResolve !== false);
        const [busy, setBusy] = React.useState(false), [result, setResult] = React.useState(null);
        const mounted = React.useRef(true);
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
        const light = RN.useColorScheme?.() === "light";
        const color = light ? "#191919" : "#ffffff", muted = light ? "#555555" : "#b9bbc3";
        const text = (label, style = {}) => h(RN.Text, { style: { color, marginVertical: 8, ...style } }, label);
        async function lookup() {
            if (!active || busy) return;
            const input = value.trim(), id = validId(input) ? input : extractMentionIds(input)[0];
            setBusy(true); setResult(null);
            const session = generation;
            try {
                const next = await resolver.resolve(id ?? input);
                if (mounted.current && active && session === generation) setResult(next);
            } finally { if (mounted.current) setBusy(false); }
        }
        return h(RN.ScrollView, { contentContainerStyle: { padding: 20, paddingBottom: 40 }, keyboardShouldPersistTaps: "handled" },
            text("ValidUser 2.0.0", { fontSize: 24, fontWeight: "700" }),
            text("Resolve unknown mentions in messages, embeds and forwarded messages."),
            h(RN.View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" } },
                text("Automatically resolve mentions"), h(RN.Switch, { value: auto, onValueChange: enabled => {
                    storage.autoResolve = enabled; setAuto(enabled);
                    resetResolver(); if (enabled) later(scanCurrentChannel);
                } })),
            text("User ID, mention, or profile link"),
            h(RN.TextInput, { value, onChangeText: setValue, autoCapitalize: "none", autoCorrect: false,
                placeholder: "Paste a user ID or <@mention>", placeholderTextColor: muted,
                style: { color, borderColor: muted, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 } }),
            h(RN.Button, { title: busy ? "Resolving…" : "Resolve user", disabled: busy || !value.trim(), onPress: () => { void lookup(); } }),
            result && text(`${displayName(result)}\n${statusText(result)}`),
            result?.status === "resolved" && h(RN.Button, { title: "Open profile", onPress: () => { void openProfile(result); } }),
            text("You can also long-press a message and choose Resolve mentions / Open profile. If a resolved mention has not redrawn, switch channels and return.", { color: muted }),
            text("Only information Discord makes available to your account can be loaded.", { color: muted })
        );
    }
    function onLoad() {
        if (active) return;
        users = byStore("UserStore") ?? byProps("getUser", "getCurrentUser");
        messages = byStore("MessageStore") ?? byProps("getMessage", "getMessages");
        selected = byStore("SelectedChannelStore") ?? byProps("getChannelId", "getVoiceChannelId");
        dispatcher = V.metro.common.FluxDispatcher ?? byProps("dispatch", "subscribe");
        rest = byProps("get", "post", "del") ?? byProps("get", "post", "patch");
        sheetHost = byProps("openLazy", "hideActionSheet");
        Row = byProps("ActionSheetRow")?.ActionSheetRow;
        if (!users?.getUser || !dispatcher?.dispatch || !rest?.get) {
            throw new Error("ValidUser: user lookup modules are unavailable on this Discord build.");
        }
        active = true;
        try {
            resetResolver();
            if (dispatcher.subscribe && dispatcher.unsubscribe) {
                for (const event of ["MESSAGE_CREATE", "MESSAGE_UPDATE"]) subscribe(event, payload => queueMessage(payload?.message));
                subscribe("LOAD_MESSAGES_SUCCESS", payload => {
                    for (const message of (Array.isArray(payload?.messages) ? payload.messages.slice(-80) : [])) {
                        queueMessage(message, payload.channelId ?? payload.channel_id);
                    }
                });
                subscribe("CHANNEL_SELECT", () => later(scanCurrentChannel));
                subscribe("CONNECTION_OPEN", () => { resetResolver(); later(scanCurrentChannel); });
                subscribe("LOGOUT", () => { resetResolver(); resolver.stop(); });
            }
            if (sheetHost?.openLazy && Row) {
                unpatches.push(V.patcher.before("openLazy", sheetHost, args => {
                    const [lazy, key, context] = args;
                    if (key !== "MessageLongPressActionSheet" || !lazy?.then) return;
                    const session = generation;
                    // Wrap only this opening; never patch a shared React module or add hooks to it.
                    args[0] = Promise.resolve(lazy).then(module => {
                        if (!active || generation !== session || !module?.default) return module;
                        return { ...module, default: wrapSheet(module.default, context, session) };
                    });
                }));
            } else toast("ValidUser: use the plugin settings to resolve a user on this Discord version.");
            later(scanCurrentChannel);
        } catch (error) { onUnload(); throw error; }
    }
    function onUnload() {
        active = false; generation++; resolver?.stop();
        for (const timer of timers) clearTimeout(timer);
        timers.clear(); autoIds.clear(); scanTimer = refreshTimer = null;
        for (const unpatch of unpatches.splice(0).reverse()) { try { unpatch(); } catch {} }
    }
    return { onLoad, onUnload, settings: Settings };
}
