import ServerInfoSheet from "./server-info/ui/ServerInfoSheet";
import ServerInfoModal from "./server-info/ui/ServerInfoModal";
import { wrapGuildSheet } from "./guild-sheet";
import { nextAPI, nativeSheets, nativeDesign, nativeAlerts } from "./next-api";
import { openUserProfile } from "../../compatibility/user-profile.mjs";
const { find, findByName, findByProps, findByStoreName } = vendetta.metro;
const { before, after } = vendetta.patcher;
const { React, ReactNative: RN } = vendetta.metro.common;
const ITEM_ID = "info-commands-server-info";
let activeSheet;
let menuTimer;
let pendingProfile;
let panelSequence = 0;
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
function cancelPendingProfile() {
    const request = pendingProfile;
    pendingProfile = undefined;
    request?.cancel();
}
function isInfo(item) {
    return item?.id === ITEM_ID || item?.key === ITEM_ID
        || item?.label === "Server Info" || item?.props?.label === "Server Info";
}
function itemsWithInfo(items, id, action) {
    if (!id || !Array.isArray(items) || items.some(isInfo)) return items;
    if (Array.isArray(items[0])) {
        if (items.some(group => Array.isArray(group) && group.some(isInfo))) return items;
        return [itemsWithInfo(items[0], id, action), ...items.slice(1)];
    }
    return [...items, {
        id: ITEM_ID,
        label: "Server Info",
        action,
    }];
}

export function installServerMenu(open) {
    if (running) return () => {};
    running = true;
    const epoch = ++generation;
    const live = () => running && generation === epoch;
    const patched = new WeakMap();
    const store = optional(() => findByStoreName("GuildStore"));
    const next = nextAPI()?.modules?.finders;
    const action = (id, close) => () => {
        if (!live()) return;
        optional(close);
        if (next) {
            // The floating context-menu handler dismisses its surface after the
            // action returns. Open on the next turn so it cannot dismiss ours.
            clearTimeout(menuTimer);
            menuTimer = setTimeout(() => {
                menuTimer = undefined;
                if (live()) open(id);
            }, vendetta.host?.id === "valenced" ? 180 : 0);
        } else open(id);
    };
    function patch(target, key, kind, callback) {
        if (!live() || typeof target?.[key] !== "function") return false;
        if (patched.get(target)?.has(key)) return true;
        const unpatch = optional(() => kind(key, target, callback));
        if (typeof unpatch !== "function") return false;
        if (!patched.has(target)) patched.set(target, new Set());
        patched.get(target).add(key);
        dynamicPatches.push(unpatch);
        return true;
    }
    function connectBuilder(menu) {
        const key = typeof menu?.getGuildsBarGuildMenuItems === "function" ? "getGuildsBarGuildMenuItems" : "default";
        return patch(menu, key, after, (args, result) => live()
            ? itemsWithInfo(result, guildId(args?.[0]), action(guildId(args?.[0]), () => contexts?.hideContextMenu?.()))
            : result);
    }
    function connectContexts(module) {
        const target = module?.showContextMenu ? module : module?.default;
        if (!target?.showContextMenu) return false;
        contexts = target;
        return patch(target, "showContextMenu", before, args => {
            if (!live()) return;
            const menu = args[0];
            if (!menu || !Array.isArray(menu.items)) return;
            // User and channel menus can carry a guildId too.
            if (menu.user || menu.userId || menu.context?.user || menu.context?.userId
                || menu.message || menu.context?.message || menu.channel || menu.channelId
                || menu.context?.channel || menu.context?.channelId) return;
            const guild = menu.guild ?? menu.context?.guild
                ?? (menu.key ? store?.getGuild?.(String(menu.key)) : null)
                ?? (!menu.key && menu.guildId ? store?.getGuild?.(String(menu.guildId)) : null)
                ?? (/guild|server/i.test(String(menu.type ?? menu.name ?? ""))
                    ? { id: menu.guildId ?? menu.context?.guildId } : null);
            const id = guildId(guild);
            const items = itemsWithInfo(menu.items, id, action(id, () => target.hideContextMenu?.()));
            if (items !== menu.items) args[0] = { ...menu, items };
        });
    }
    function connectSheets(module) {
        const target = module?.openLazy ? module : module?.default;
        if (!target?.openLazy) return false;
        sheets = target;
        return patch(target, "openLazy", before, args => {
            if (!live()) return;
            const [promise, key, props] = args;
            if (!/guild/i.test(String(key)) || !/menu|context|actions/i.test(String(key))) return;
            if (props?.user || props?.userId || props?.channel || props?.channelId || props?.message) return;
            const id = guildId(props?.guild ?? props);
            if (!id || !promise?.then) return;
            args[0] = Promise.resolve(promise).then(module => {
                if (!live() || !module?.default) return module;
                const Row = nativeDesign("ActionSheetRow") ?? optional(() => findByProps("ActionSheetRow")?.ActionSheetRow);
                const onPress = action(id, () => target.hideActionSheet?.(key));
                return { ...module, default: wrapGuildSheet(module.default, live,
                    items => itemsWithInfo(items, id, onPress),
                    () => React.createElement(Row, { key: ITEM_ID, label: "Server Info", onPress }), Row) };
            });
        });
    }
    function watch(filter, connect) {
        if (!next?.getModules || !filter) return;
        const unsubscribe = optional(() => next.getModules(filter, module => {
            if (live()) connect(module);
        }, { returnNamespace: true, initialize: false }));
        if (typeof unsubscribe === "function") dynamicPatches.push(unsubscribe);
    }

    const pathWatch = vendetta.metro.getModuleWithImportedPath;
    const usesPaths = typeof pathWatch === "function";
    if (usesPaths) {
        const unsubscribe = pathWatch("modules/guilds_bar/native/utils/getGuildsBarGuildMenuItems.tsx", module => {
            if (live()) connectBuilder(module);
        });
        if (typeof unsubscribe === "function") dynamicPatches.push(unsubscribe);
    }
    const menu = !usesPaths && (optional(() => findByName?.("getGuildsBarGuildMenuItems", false))
        ?? optional(() => find?.(m => m?.default?.name === "getGuildsBarGuildMenuItems")));
    if (!usesPaths && !connectBuilder(menu)) watch(optional(() => next.filters.createFilterGenerator(
        (_args, _id, value) => value?.name === "getGuildsBarGuildMenuItems"
            || typeof value?.getGuildsBarGuildMenuItems === "function"
            || value?.default?.name === "getGuildsBarGuildMenuItems",
        () => "info-commands.guild-menu",
    )()), connectBuilder);
    if (!connectContexts(optional(() => findByProps("showContextMenu"))))
        watch(optional(() => next.filters.withProps("showContextMenu")), connectContexts);
    if (!connectSheets(nativeSheets() ?? optional(() => findByProps("openLazy", "hideActionSheet"))
        ?? optional(() => findByProps("openLazy"))))
        watch(optional(() => next.filters.withProps("openLazy", "hideActionSheet")), connectSheets);
    if (!dynamicPatches.length) notify("InfoCommands: server menu unavailable on this Discord version");
    return () => { if (live()) disposeServerMenu(); };
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
    const session = generation;
    const live = () => running && generation === session;
    close?.();
    openUserProfile(vendetta, { userId: ownerId, guildId: serverId }, live).then(opened => {
        if (!opened && live()) notify("Owner profiles are unavailable on this Discord version");
    }).catch(() => { if (live()) notify("Unable to open the owner's profile. Try again."); });
}

export function openServerInfo(id, load) {
    if (!running || !guildId(id)) return;
    const key = `${ITEM_ID}-${id}`;
    if (activeSheet?.key === key) return;
    activeSheet?.close();
    cancelPendingProfile();
    // Resolve at click time too: the native module may not have been ready at startup.
    const next = nextAPI();
    const host = nativeSheets() ?? sheets;
    const ActionSheet = nativeDesign("ActionSheet") ?? optional(() => findByProps("ActionSheet")?.ActionSheet);
    const epoch = generation;
    const attempt = { key, timer: undefined, fallback: false, presented: false, panel: undefined,
        panelKey: undefined, panelNode: undefined, closed: false, contentReleased: true,
        hostReleased: false, profile: undefined, close };
    activeSheet = attempt;
    const live = () => running && epoch === generation && activeSheet === attempt;
    const panelListeners = new Set();
    const panelVisible = () => !attempt.closed;
    const subscribePanel = listener => {
        panelListeners.add(listener);
        return () => panelListeners.delete(listener);
    };
    function hidePanel() {
        if (attempt.closed) return;
        attempt.closed = true;
        for (const listener of [...panelListeners]) optional(listener);
    }
    function contentUnmounted() {
        attempt.contentReleased = true;
        releaseProfile();
    }
    function hostDismissed() {
        attempt.hostReleased = true;
        if (attempt.closed) releaseProfile();
        else dismissed();
    }
    function releaseProfile() {
        if (attempt.closed && attempt.contentReleased && attempt.hostReleased) attempt.profile?.release();
    }
    function requestProfile(options) {
        if (!live() || !guildId(options.userId) || attempt.profile) return;
        cancelPendingProfile();
        const accountId = () => optional(() => findByStoreName("UserStore")?.getCurrentUser?.()?.id);
        const account = accountId();
        let cancelled = false, queued = false, timer, interaction;
        const current = () => !cancelled && running && epoch === generation
            && pendingProfile === request && accountId() === account;
        const finish = () => {
            if (pendingProfile === request) pendingProfile = undefined;
            request.cancel();
        };
        const open = () => {
            timer = setTimeout(() => {
                timer = undefined;
                if (!current()) { finish(); return; }
                openUserProfile(vendetta, { ...options }, current).then(opened => {
                    if (!opened && current()) notify("Profiles are unavailable on this Discord version");
                }).catch(() => {
                    if (current()) notify("Unable to open profile. Try again.");
                }).finally(finish);
            }, 0);
        };
        const request = {
            cancel() {
                cancelled = true;
                clearTimeout(timer);
                optional(() => interaction?.cancel());
            },
            release() {
                if (queued || cancelled) return;
                if (!current()) { finish(); return; }
                queued = true;
                clearTimeout(timer);
                // Both the React native window and the hosting alert must be
                // removed first. An elapsed timeout is not proof of dismissal.
                try {
                    if (typeof RN.InteractionManager?.runAfterInteractions === "function")
                        interaction = RN.InteractionManager.runAfterInteractions(open);
                    else open();
                } catch { open(); }
            },
        };
        pendingProfile = attempt.profile = request;
        timer = setTimeout(() => {
            const show = current();
            finish();
            if (show) notify("Server Info is still closing. Close it before trying the profile again.");
        }, 2500);
        close();
        releaseProfile();
    }
    function dismissPanelHost() {
        const alerts = attempt.panel;
        if (!alerts) return;
        optional(() => alerts.dismissAlert(attempt.panelKey));
        // Some builds retain the hosting alert after dismissal. Remove only this
        // panel's entry so its dialog backdrop cannot keep blocking Discord.
        optional(() => {
            const store = alerts.useAlertStore;
            if (typeof store?.getState !== "function" || typeof store?.setState !== "function") return;
            const owns = entry => entry?.key === attempt.panelKey || entry?.node === attempt.panelNode;
            const entries = store.getState()?.alerts;
            if (!Array.isArray(entries) || !entries.some(owns)) return;
            store.setState(state => {
                if (!Array.isArray(state.alerts)) return state;
                const remaining = state.alerts.filter(entry => !owns(entry));
                return remaining.length === state.alerts.length ? state : { alerts: remaining };
            });
        });
        optional(() => {
            const entries = alerts.useAlertStore?.getState?.()?.alerts;
            if (Array.isArray(entries) && !entries.some(entry => entry?.key === attempt.panelKey || entry?.node === attempt.panelNode))
                attempt.hostReleased = true;
        });
        releaseProfile();
    }
    function close(hide = true) {
        clearTimeout(attempt.timer);
        const current = live();
        if (current) activeSheet = undefined;
        hidePanel();
        if (!current) return;
        if (hide) {
            if (attempt.panel) dismissPanelHost();
            else optional(() => host?.hideActionSheet?.(key));
        }
    }
    function presented() {
        if (live() && !attempt.fallback) {
            attempt.presented = true;
            clearTimeout(attempt.timer);
        }
    }
    function dismissed() {
        if (!live() || attempt.fallback) return;
        // A sheet that disappears before its first layout was never usable.
        // Explicit Close already clears the attempt before the native callback.
        if (next && !attempt.presented) fallback();
        else close(false);
    }
    function fallback(error) {
        if (!live() || attempt.fallback) return;
        attempt.fallback = true;
        clearTimeout(attempt.timer);
        hidePanel();
        if (attempt.panel) dismissPanelHost();
        else optional(() => host?.hideActionSheet?.(key));
        if (error) optional(() => console.warn("[InfoCommands] Using native server info fallback", error));
        Promise.resolve().then(() => load(id, { preferCache: Boolean(next) })).then(data => {
            if (!live()) return;
            close(false);
            const allowed = fn => () => { if (running && epoch === generation) fn(); };
            const buttons = [
                { text: "Copy Server ID", onPress: allowed(() => copy(id)) },
                { text: "Close", style: "cancel" },
            ];
            if (guildId(data.ownerId)) buttons.unshift({ text: "View Owner Profile", onPress: allowed(() => openOwnerProfile(data.ownerId, id)) });
            RN.Alert.alert(`Server Info — ${data.title}`, [data.description,
                data.cachedOnly ? "Showing cached details." : "",
                ...data.fields.map(f => `${f.name}: ${plainText(f.value)}`),
            ].filter(Boolean).join("\n\n"), buttons);
        }).catch(error => {
            if (!live()) return;
            close(false);
            const message = error?.message ?? "Unable to load server info";
            if (next) RN.Alert.alert("Server Info", message, [{ text: "Close", style: "cancel" }]);
            else notify(message);
        });
    }
    const Boundary = React.Component ? class ServerInfoBoundary extends React.Component {
        state = { failed: false };
        static getDerivedStateFromError() { return { failed: true }; }
        componentDidCatch(error) { fallback(error); }
        render() { return this.state.failed ? null : this.props.children; }
    } : null;
    if (vendetta.host?.id === "valenced") {
        const alerts = nativeAlerts();
        if (alerts && RN.Modal) {
            function ManagedServerInfoModal() {
                const visible = React.useSyncExternalStore(subscribePanel, panelVisible, panelVisible);
                if (!visible || !live() || attempt.fallback) return null;
                attempt.contentReleased = false;
                const content = React.createElement(ServerInfoModal, {
                    guildId: id, onClose: () => close(), onPresented: presented, onDismiss: dismissed,
                    onUnmount: contentUnmounted,
                    onCopyServerId: value => { if (live() && value === id) copy(id); },
                    onOpenProfile: requestProfile,
                });
                return Boundary ? React.createElement(Boundary, null, content) : content;
            }
            attempt.panel = alerts;
            attempt.panelKey = `${key}.panel.${epoch}.${++panelSequence}`;
            attempt.panelNode = React.createElement(ManagedServerInfoModal);
            attempt.timer = setTimeout(() => fallback(), 2500);
            try {
                const result = alerts.openAlert(attempt.panelKey, attempt.panelNode, hostDismissed, { dismissable: true });
                Promise.resolve(result).catch(fallback);
                return;
            } catch (error) { fallback(error); return; }
        }
        fallback();
        return;
    }
    function ManagedServerInfoSheet(props) {
        React.useEffect(() => () => {
            dismissed();
        }, []);
        if (!live() || attempt.fallback) return null;
        const content = React.createElement(ServerInfoSheet, props);
        return Boundary ? React.createElement(Boundary, null, content) : content;
    }
    if (typeof host?.openLazy === "function" && ActionSheet && React?.createElement) {
        // openLazy returns void in Discord: it says nothing about whether a
        // sheet actually mounted or received a visible layout.
        if (next) attempt.timer = setTimeout(() => fallback(), 1500);
        try {
            const result = host.openLazy(Promise.resolve({ default: ManagedServerInfoSheet }), key,
                { guildId: id, onClose: () => close(), onPresented: presented,
                    onDismiss: dismissed }, next ? "stack" : undefined);
            Promise.resolve(result).catch(fallback);
            return;
        } catch (error) { fallback(error); return; }
    }
    fallback();
}

export function disposeServerMenu() {
    activeSheet?.close();
    clearTimeout(menuTimer);
    menuTimer = undefined;
    cancelPendingProfile();
    running = false;
    generation++;
    for (const unpatch of dynamicPatches.splice(0).reverse()) optional(() => unpatch());
}
