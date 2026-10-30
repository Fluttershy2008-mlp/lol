import ServerInfoPage from "./ui/ServerInfoPage";
import { openUserProfile } from "../../../compatibility/user-profile.mjs";

let sequence = 0;
const TOKEN = "__infoCommandsPage";
const LOADING = "__infoCommandsLoading";
const safe = fn => { try { return fn(); } catch { return undefined; } };

// Use a native SettingsNavigator route. Never create a second dialog window
// inside Discord's alert host: removing its React node need not release input.
export function createValencedServerInfo(V, client, isRunning) {
    const { React, ReactNative: RN } = V.metro.common;
    const settings = client?.discord?.modules?.settings;
    const routeName = `${V.plugin.id}.server-info.${++sequence}`;
    const entries = new Map(), listeners = new Set();
    let enabled = true, unregister, revision = 0;
    const notify = () => { revision++; for (const listener of [...listeners]) listener(); };
    const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
    const accountId = () => safe(() => V.metro.findByStoreName("UserStore")?.getCurrentUser?.()?.id);
    const live = entry => enabled && isRunning() && entry.open && accountId() === entry.account;
    const toast = text => safe(() => V.ui.toasts.showToast(text));
    function contains(navigation, key, token) {
        const visit = state => Array.isArray(state?.routes) && state.routes.some(route =>
            route.params?.[key] === token || visit(route.state));
        return Boolean(visit(safe(() => navigation.getRootState())));
    }
    function ownsFocus(entry) {
        const route = safe(() => entry.root.getCurrentRoute?.());
        if (route) return route.params?.[TOKEN] === entry.token;
        let state = safe(() => entry.root.getRootState()), current;
        for (let depth = 0; depth < 16 && state?.routes?.length; depth++) {
            current = state.routes[state.index ?? state.routes.length - 1]; state = current.state;
        }
        return current?.params?.[TOKEN] === entry.token;
    }
    function close(entry, navigate = true) {
        if (!entry.open) return;
        const owned = ownsFocus(entry);
        entry.open = false;
        clearTimeout(entry.timer); clearTimeout(entry.navigationTimer);
        for (const remove of entry.removers.splice(0).reverse()) safe(remove);
        entries.delete(entry.token); notify();
        if (navigate && owned && safe(() => entry.root.canGoBack?.()) !== false)
            safe(() => (entry.navigation ?? entry.root).goBack());
    }
    function EntryPage({ entry, navigation }) {
        React.useEffect(() => {
            entry.mounted = true;
            clearTimeout(entry.timer);
            return () => close(entry, false);
        }, [entry]);
        React.useEffect(() => {
            entry.navigation = navigation;
            return () => { if (entry.navigation === navigation) entry.navigation = undefined; };
        }, [entry, navigation]);
        const allowed = () => live(entry) && ownsFocus(entry);
        return React.createElement(ServerInfoPage, {
            guildId: entry.guildId,
            onClose: () => close(entry),
            onCopyServerId: id => {
                if (!allowed() || id !== entry.guildId) return;
                const clipboard = V.metro.common.clipboard;
                if (typeof clipboard?.setString === "function") { clipboard.setString(id); toast("Server ID copied"); }
            },
            onOpenProfile: options => {
                if (!allowed() || entry.profilePending || !/^\d{5,22}$/.test(options.userId)) return;
                entry.profilePending = true;
                // Keep this ordinary screen underneath Discord's own profile.
                // Its X/Android Back owns only that native profile sheet.
                openUserProfile(V, { ...options }, allowed).then(opened => {
                    if (!opened && allowed()) toast("Profiles are unavailable on this Discord version");
                }).catch(() => { if (allowed()) toast("Unable to open profile. Try again."); })
                    .finally(() => { entry.profilePending = false; });
            },
        });
    }
    function RoutePage({ route, navigation }) {
        React.useSyncExternalStore(subscribe, () => revision, () => revision);
        const entry = entries.get(route?.params?.[TOKEN]);
        return entry && live(entry) ? React.createElement(EntryPage, { key: entry.token, entry, navigation })
            : React.createElement(RN.Text, { style: { padding: 24 } }, "Server Info is closed. Use Back to return to Discord.");
    }
    function registerRoute() {
        if (unregister) return;
        unregister = settings.registerSettingsItem(routeName, {
            type: "route", parent: null, unsearchable: true, useTitle: () => "Server Info",
            screen: { route: routeName, getComponent: () => RoutePage },
        });
        settings.refreshSettings?.();
    }
    function open(guildId) {
        const root = safe(() => V.metro.findByProps("getRootNavigationRef")?.getRootNavigationRef?.());
        if (!enabled || !isRunning() || !root?.navigate || !root.goBack || !root.getRootState
            || !settings?.onSettingsModulesLoaded || !settings.registerSettingsItem) return false;
        if ([...entries.values()].some(entry => live(entry) && entry.guildId === guildId)) return true;
        for (const entry of [...entries.values()]) close(entry);
        const token = `${routeName}.${++sequence}`;
        const entry = { token, guildId, root, account: accountId(), open: true, mounted: false,
            presented: false, loading: false, removers: [] };
        entries.set(token, entry);
        const add = remove => {
            if (typeof remove !== "function") return;
            if (entry.open) entry.removers.push(remove); else safe(remove);
        };
        const changed = () => {
            if (!live(entry)) { close(entry); return; }
            if (contains(root, TOKEN, token)) entry.presented = true;
            else if (entry.presented) close(entry, false);
            if (contains(root, LOADING, token)) entry.loading = true;
            else if (entry.loading && !entry.presented) close(entry, false);
        };
        add(safe(() => root.addListener?.("state", changed)));
        const userStore = safe(() => V.metro.findByStoreName("UserStore"));
        if (userStore?.addChangeListener && userStore?.removeChangeListener) {
            userStore.addChangeListener(changed); add(() => userStore.removeChangeListener(changed));
        }
        entry.timer = setTimeout(() => {
            if (!entry.open || entry.mounted) return;
            close(entry); toast("Server Info could not open. Update Valenced and try again.");
        }, 8000);
        const ready = () => {
            if (!live(entry) || entry.started) return;
            entry.started = true;
            try {
                if (settings.isSettingsModulesLoaded?.() === false)
                    root.navigate("settings", { [LOADING]: token });
                add(settings.onSettingsModulesLoaded(() => {
                    if (!live(entry)) return;
                    try {
                        registerRoute();
                        entry.navigationTimer = setTimeout(() => {
                            if (!live(entry)) return;
                            try { root.navigate("settings", { screen: routeName, params: { [TOKEN]: token } }); }
                            catch { close(entry); toast("Server Info could not open its Discord screen."); }
                        }, 0);
                    } catch { close(entry); toast("Server Info could not register its Discord screen."); }
                }));
            } catch { close(entry); toast("Server Info could not open. Update Valenced and try again."); }
        };
        if (root.isReady?.() === false) {
            if (!root.addListener) { close(entry, false); return false; }
            add(root.addListener("ready", ready));
        } else ready();
        return true;
    }
    return { open, dispose() {
        if (!enabled) return;
        enabled = false;
        for (const entry of [...entries.values()]) close(entry);
        safe(() => unregister?.()); unregister = undefined;
        safe(() => settings?.refreshSettings?.());
    } };
}
