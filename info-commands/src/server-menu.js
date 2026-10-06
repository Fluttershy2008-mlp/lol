import ServerInfoSheet from "./server-info/ui/ServerInfoSheet";
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

function openOwnerProfile(ownerId, serverId, close) {
    if (!running || !guildId(ownerId)) return;
    // Discord versions may export these helpers from separate modules.
    for (const method of ["openUserProfileModal", "openUserProfile", "showUserProfile"]) {
        const module = optional(() => findByProps(method));
        if (typeof module?.[method] !== "function") continue;
        try {
            close?.();
            Promise.resolve(module[method]({ userId: ownerId, guildId: serverId }))
                .catch(() => notify("Unable to open the owner's profile. Try again."));
            return;
        } catch (error) {
            console.error("[InfoCommands] Owner profile opener unavailable", error);
        }
    }
    notify("Owner profiles are unavailable on this Discord version");
}

export function openServerInfo(id, load) {
    if (!running) return;
    const key = `${ITEM_ID}-${id}`;
    if (sheetKey === key) return;
    if (sheetKey) optional(() => sheets?.hideActionSheet?.(sheetKey));
    const ActionSheet = optional(() => findByProps("ActionSheet")?.ActionSheet);
    const epoch = generation;
    const close = () => {
        optional(() => sheets?.hideActionSheet?.(key));
        if (sheetKey === key) sheetKey = undefined;
    };
    function ManagedServerInfoSheet(props) {
        React.useEffect(() => () => {
            if (sheetKey === key) sheetKey = undefined;
        }, []);
        return React.createElement(ServerInfoSheet, props);
    }
    if (typeof sheets?.openLazy === "function" && ActionSheet && React?.createElement) {
        sheetKey = key;
        try {
            Promise.resolve(sheets.openLazy(Promise.resolve({ default: ManagedServerInfoSheet }), key, { guildId: id, onClose: close })).catch(() => {
                close(); notify("Unable to open server info");
            });
            return;
        } catch { close(); }
    }
    // Native alert remains usable on older clients without custom action sheets.
    Promise.resolve().then(() => load(id)).then(data => {
        if (!running || epoch !== generation) return;
        const buttons = [{ text: "Copy Server ID", onPress: () => copy(id) }, { text: "Close", style: "cancel" }];
        if (guildId(data.ownerId)) buttons.unshift({ text: "View Owner Profile", onPress: () => openOwnerProfile(data.ownerId, id) });
        RN.Alert.alert(`Server Info — ${data.title}`, [data.description,
            data.cachedOnly ? "Showing cached details." : "",
            ...data.fields.map(f => `${f.name}: ${plainText(f.value)}`),
        ].filter(Boolean).join("\n\n"), buttons);
    }).catch(error => { if (running && epoch === generation) notify(error?.message ?? "Unable to load server info"); });
}

export function disposeServerMenu() {
    running = false;
    generation++;
    if (sheetKey) optional(() => sheets?.hideActionSheet?.(sheetKey));
    sheetKey = undefined;
    for (const unpatch of dynamicPatches.splice(0).reverse()) optional(() => unpatch());
}
