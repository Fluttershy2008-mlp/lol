const { find, findByName, findByProps, findByStoreName } = vendetta.metro;
const { before, after } = vendetta.patcher;
const { React, ReactNative: RN } = vendetta.metro.common;
const ITEM_ID = "info-commands-server-info";
let sheetKey;
let sheets;
let contexts;
let running = false;
let generation = 0;
let dynamicPatches = [];

function optional(fn) { try { return fn(); } catch { return undefined; } }
function guildId(value) {
    const id = typeof value === "object" && value !== null
        ? value.guild?.id ?? value.guildId ?? value.guild_id ?? value.id
        : value;
    return typeof id === "string" && /^\d{5,22}$/.test(id) ? id : null;
}
function notify(text) {
    optional(() => vendetta.ui.toasts.showToast(text));
}
function isInfo(item) {
    return item?.id === ITEM_ID || item?.key === ITEM_ID
        || item?.label === "Server Info" || item?.props?.label === "Server Info";
}
function itemsWithInfo(items, id, open, close) {
    if (!id || !Array.isArray(items) || items.some(isInfo)) return items;
    if (Array.isArray(items[0])) {
        if (items.some(group => Array.isArray(group) && group.some(isInfo))) return items;
        return [itemsWithInfo(items[0], id, open, close), ...items.slice(1)];
    }
    return [...items, {
        id: ITEM_ID,
        label: "Server Info",
        action() {
            if (!running) return;
            optional(() => close?.());
            open(id);
        },
    }];
}

export function installServerMenu(open) {
    if (running) return () => {};
    running = true;
    generation++;
    const patches = [];
    sheets = optional(() => findByProps("openLazy", "hideActionSheet"))
        ?? optional(() => findByProps("openLazy"));
    contexts = optional(() => findByProps("showContextMenu"));
    const store = optional(() => findByStoreName("GuildStore"));
    const menu = optional(() => findByName?.("getGuildsBarGuildMenuItems", false))
        ?? optional(() => find?.(m => m?.default?.name === "getGuildsBarGuildMenuItems"));
    const holder = typeof menu?.default === "function" ? [menu, "default"]
        : typeof menu?.getGuildsBarGuildMenuItems === "function" ? [menu, "getGuildsBarGuildMenuItems"] : null;
    if (holder) patches.push(after(holder[1], holder[0], (args, result) =>
        itemsWithInfo(result, guildId(args?.[0]), open, () => contexts?.hideContextMenu?.())
    ));

    if (typeof contexts?.showContextMenu === "function") {
        patches.push(before("showContextMenu", contexts, ([menu]) => {
            try {
                if (!menu || !Array.isArray(menu.items)) return;
                // A user menu can also carry a guildId. Only accept a guild target.
                if (menu.user || menu.userId || menu.context?.user || menu.context?.userId
                    || menu.message || menu.channel || menu.channelId || menu.context?.channelId) return;
                const target = menu.guild ?? menu.context?.guild
                    ?? (menu.key ? store?.getGuild?.(String(menu.key)) : null)
                    ?? (!menu.key && menu.guildId ? store?.getGuild?.(String(menu.guildId)) : null)
                    ?? (/guild|server/i.test(String(menu.type ?? menu.name ?? ""))
                        ? { id: menu.guildId ?? menu.context?.guildId } : null);
                menu.items = itemsWithInfo(menu.items, guildId(target), open, () => contexts.hideContextMenu?.());
            } catch (error) { console.error("[InfoCommands] Context menu patch failed", error); }
        }));
    }

    // Modern Discord builds lazy-load their action-sheet component.
    const Row = optional(() => findByProps("ActionSheetRow")?.ActionSheetRow);
    let lazyModules = new WeakMap();
    if (typeof sheets?.openLazy === "function") {
        patches.push(before("openLazy", sheets, ([promise, key, props]) => {
            if (!/guild/i.test(String(key)) || !/menu|context|actions/i.test(String(key))) return;
            const id = guildId(props?.guild ?? props);
            if (!id || !promise?.then) return;
            const epoch = generation;
            Promise.resolve(promise).then(module => {
                if (!running || generation !== epoch || !module) return;
                const context = { id, key };
                if (lazyModules.has(module)) { lazyModules.set(module, context); return; }
                const holder = typeof module.default === "function" ? [module, "default"]
                    : typeof module.default?.type === "function" ? [module.default, "type"]
                    : typeof module.default?.render === "function" ? [module.default, "render"] : null;
                if (!holder) return;
                lazyModules.set(module, context);
                dynamicPatches.push(after(holder[1], holder[0], (_, result) => {
                    try {
                    if (!running) return;
                    const target = lazyModules.get(module);
                    const tree = vendetta.utils?.findInReactTree;
                    const node = optional(() => tree?.(result, n => Array.isArray(n?.props?.items)));
                    if (node) {
                        node.props.items = itemsWithInfo(node.props.items, target.id, open, () => sheets.hideActionSheet?.(target.key));
                        return;
                    }
                    if (!Row) return;
                    const rows = optional(() => tree?.(result, n => Array.isArray(n)
                        && n.some(child => child?.type === Row || child?.type?.name === "ActionSheetRow" || child?.type?.displayName === "ActionSheetRow")));
                    if (!Array.isArray(rows) || rows.some(isInfo)) return;
                    rows.push(React.createElement(Row, {
                        key: ITEM_ID, label: "Server Info",
                        onPress() {
                            if (!running) return;
                            optional(() => sheets.hideActionSheet?.(target.key));
                            open(target.id);
                        },
                    }));
                    } catch (error) { console.error("[InfoCommands] Guild sheet injection failed", error); }
                }));
            }).catch(error => console.error("[InfoCommands] Lazy menu unavailable", error));
        }));
    }
    if (!patches.length) notify("InfoCommands: server menu unavailable on this Discord version");
    return () => {
        disposeServerMenu();
        lazyModules = new WeakMap();
        for (const unpatch of patches.splice(0).reverse()) optional(() => unpatch());
    };
}

function plainText(value) {
    return String(value ?? "Unknown").replace(/`/g, "")
        .replace(/<t:(\d+)(?::[a-zA-Z])?>/g, (_, seconds) => new Date(Number(seconds) * 1000).toLocaleString());
}
function copy(value) {
    const clipboard = vendetta.metro.common.clipboard;
    if (typeof clipboard?.setString === "function") {
        clipboard.setString(String(value));
        notify("Server ID copied");
    } else notify("Select and copy the server ID below");
}

export function openServerInfo(id, load) {
    if (!running) return;
    const key = `${ITEM_ID}-${id}`;
    if (sheetKey === key) return;
    if (sheetKey) optional(() => sheets?.hideActionSheet?.(sheetKey));
    const ActionSheet = optional(() => findByProps("ActionSheet")?.ActionSheet);
    const colors = optional(() => findByProps("colors", "meta"));
    const theme = optional(() => findByStoreName("ThemeStore")?.theme);
    const sc = (name, fallback) => optional(() => colors?.meta?.resolveSemanticColor(theme, vendetta.ui.semanticColors?.[name])) ?? fallback;
    const textColor = sc("TEXT_NORMAL", theme === "light" ? "#1e1f22" : "#f2f3f5");
    const background = sc("BACKGROUND_SECONDARY", theme === "light" ? "#f2f3f5" : "#2b2d31");
    const epoch = generation;
    const text = (value, style = {}, props = {}) => React.createElement(RN.Text, {
        style: { color: textColor, fontSize: 15, ...style }, ...props,
    }, value);
    const close = () => {
        optional(() => sheets?.hideActionSheet?.(key));
        if (sheetKey === key) sheetKey = undefined;
    };
    function ServerInfoSheet() {
        const [data, setData] = React.useState(null);
        const [error, setError] = React.useState(null);
        React.useEffect(() => {
            let mounted = true;
            Promise.resolve().then(() => load(id)).then(value => {
                if (mounted && running && epoch === generation) setData(value);
            }).catch(reason => {
                if (mounted && running && epoch === generation) setError(reason?.message ?? "Unable to load server details.");
            });
            return () => {
                mounted = false;
                if (sheetKey === key) sheetKey = undefined;
            };
        }, []);
        const content = [text("Server Info", { fontSize: 22, fontWeight: "700" }, { key: "title" }),
            React.createElement(RN.TouchableOpacity, { key: "close", onPress: close, accessibilityLabel: "Close server info", style: { paddingVertical: 12 } }, text("Close", { color: "#8ea1ff" }))];
        if (error) content.push(text(error, {}, { key: "error" }));
        if (!data && !error) content.push(text("Loading server details…", {}, { key: "loading" }));
        if (data) {
            if (data.thumbnail?.url) content.push(React.createElement(RN.Image, { key: "icon", source: { uri: data.thumbnail.url }, style: { width: 72, height: 72, borderRadius: 16, marginBottom: 12 } }));
            content.push(text(data.title, { fontSize: 20, fontWeight: "600" }, { key: "name" }));
            content.push(text(data.description, { marginTop: 8 }, { key: "description", selectable: true }));
            if (data.cachedOnly) content.push(text("Showing cached details. Some information may be unavailable.", { marginTop: 10 }, { key: "cache" }));
            for (const field of data.fields) {
                const value = plainText(field.value);
                const row = React.createElement(RN.View, { key: field.name, style: { paddingVertical: 12 } },
                    text(field.name, { fontWeight: "600", marginBottom: 4 }), text(value, {}, { selectable: true }));
                content.push(field.name === "ID" ? React.createElement(RN.TouchableOpacity, {
                    key: field.name, onPress: () => copy(id), accessibilityLabel: "Copy server ID",
                }, row, text("Tap to copy", { color: "#8ea1ff" })) : row);
            }
            if (data.image?.url) content.push(React.createElement(RN.Image, { key: "banner", source: { uri: data.image.url }, style: { width: "100%", height: 150, resizeMode: "contain", marginVertical: 12 } }));
        }
        return React.createElement(ActionSheet, null, React.createElement(RN.ScrollView, {
            style: { maxHeight: Math.round((RN.Dimensions?.get?.("window")?.height ?? 700) * 0.8), backgroundColor: background },
            contentContainerStyle: { padding: 20, paddingBottom: 40 },
        }, ...content));
    }
    if (typeof sheets?.openLazy === "function" && ActionSheet && React?.createElement) {
        sheetKey = key;
        try {
            Promise.resolve(sheets.openLazy(Promise.resolve({ default: ServerInfoSheet }), key, {})).catch(() => {
                close(); notify("Unable to open server info");
            });
            return;
        } catch { close(); }
    }
    // Native alert remains usable on older clients without custom action sheets.
    Promise.resolve().then(() => load(id)).then(data => {
        if (!running || epoch !== generation) return;
        RN.Alert.alert(`Server Info — ${data.title}`, [data.description,
            data.cachedOnly ? "Showing cached details." : "",
            ...data.fields.map(f => `${f.name}: ${plainText(f.value)}`),
        ].filter(Boolean).join("\n\n"), [{ text: "Copy Server ID", onPress: () => copy(id) }, { text: "Close", style: "cancel" }]);
    }).catch(error => { if (running && epoch === generation) notify(error?.message ?? "Unable to load server info"); });
}

export function disposeServerMenu() {
    running = false;
    generation++;
    if (sheetKey) optional(() => sheets?.hideActionSheet?.(sheetKey));
    sheetKey = undefined;
    for (const unpatch of dynamicPatches.splice(0).reverse()) optional(() => unpatch());
}
