(function createReadAllPlugin(initialApi, definePlugin, createEngine) {
    const defaults = {
        includeMuted: true, protectMentions: false, includeThreads: true,
        confirm: true, longPress: true, quiet: false, accounts: {}, history: [],
    };
    const KEY = "read-all-plus-panel";
    const SETTING = "ReadAllPlusPanel";
    const listeners = new Set();
    let V = initialApi;
    let R, N, api, engine, prefs = { ...defaults }, active = false, loaded = false;
    let panelSession = 0, nextPanelSession = 0, progressAccount = "", useThemeStyles;
    let loadingError = "", storage, lastOpen = 0, saveQueue = Promise.resolve();
    const cache = new Map();

    const emit = () => { for (const fn of listeners) { try { fn(); } catch {} } };
    const subscribe = listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    };
    const getPanelSession = () => panelSession;
    const storeNames = ["ChannelStore", "GuildChannelStore", "GuildStore", "ReadStateStore", "ActiveJoinedThreadsStore", "PrivateChannelSortStore", "UserStore", "UserGuildSettingsStore", "NotificationSettingsStore", "SelectedChannelStore", "SelectedGuildStore", "PermissionStore", "ThemeStore"];

    function getStores() {
        const values = {};
        for (const name of storeNames) {
            const old = cache.get(name);
            if (old?.value || old?.until > Date.now()) { values[name] = old.value; continue; }
            let value;
            try { value = V.discord.flux.Stores[name]; } catch {}
            cache.set(name, { value, until: Date.now() + 3000 });
            values[name] = value;
        }
        return values;
    }

    function getAccountId() {
        try { return getStores().UserStore?.getCurrentUser?.()?.id || ""; } catch { return ""; }
    }

    function notify(message) {
        try { V.discord.actions.ToastActionCreators.open("read-all-plus-feedback", { text: message }); }
        catch { try { N.Alert.alert("Read All Plus", message); } catch {} }
    }

    function errorAlert(error) {
        N.Alert.alert("Read All Plus", typeof error === "string" ? error : error?.message || "This action could not be completed.");
    }

    function normalise(value) {
        const result = { ...defaults };
        for (const key of ["includeMuted", "protectMentions", "includeThreads", "confirm", "longPress", "quiet"]) {
            if (typeof value?.[key] === "boolean") result[key] = value[key];
        }
        result.accounts = {};
        for (const [id, account] of Object.entries(value?.accounts || {})) {
            if (!/^\d{15,22}$/.test(id) || !account || typeof account !== "object") continue;
            result.accounts[id] = {
                guilds: [...new Set((Array.isArray(account.guilds) ? account.guilds : []).filter(x => typeof x === "string" && /^\d{15,22}$/.test(x)))],
                channels: [...new Set((Array.isArray(account.channels) ? account.channels : []).filter(x => typeof x === "string" && /^\d{15,22}$/.test(x)))],
            };
        }
        result.history = Array.isArray(value?.history) ? value.history.filter(h => h && typeof h.accountId === "string" && typeof h.at === "number").slice(0, 12) : [];
        return result;
    }

    function save(patch) {
        if (!loaded || !active) return;
        prefs = normalise({ ...prefs, ...patch });
        const value = JSON.parse(JSON.stringify(prefs));
        emit();
        saveQueue = saveQueue.then(() => storage?.set(value, true)).catch(() => {
            if (active) notify("Your changes could not be saved. Please try again.");
        });
    }

    function changeExclusion(type, id) {
        const uid = getAccountId();
        if (!uid || !loaded || !active) return;
        const account = prefs.accounts[uid] || { guilds: [], channels: [] };
        const list = new Set(account[type] || []);
        if (list.has(id)) list.delete(id); else list.add(id);
        save({ accounts: { ...prefs.accounts, [uid]: { ...account, [type]: [...list] } } });
    }

    function historySummary(p) {
        const parts = [`${p.confirmed} confirmed`];
        if (p.unconfirmed) parts.push(`${p.unconfirmed} awaiting confirmation`);
        if (p.failed) parts.push(`${p.failed} failed`);
        if (p.skipped) parts.push(`${p.skipped} skipped`);
        return `${p.cancelled ? "Stopped: " : "Finished: "}${parts.join(" · ")}`;
    }

    function startPlan(plan) {
        if (!active) return;
        progressAccount = plan.accountId;
        engine.run(plan).then(() => emit()).catch(errorAlert);
    }

    function ask(scope, selected, guildId) {
        N.Keyboard?.dismiss();
        if (!loaded) return errorAlert(loadingError || "Your preferences are still loading. Try again in a moment.");
        if (engine.isBusy()) return errorAlert("An operation is already running. Use Stop below to cancel the remaining batches.");
        let plan;
        try { plan = engine.makePlan(scope, selected, guildId); } catch (e) { return errorAlert(e); }
        if (!plan.total) {
            const skip = Object.entries(plan.skipped).map(([reason, count]) => `${count} ${reason.toLowerCase()}`).join("; ");
            return errorAlert(skip ? `Nothing to clear with these options. ${skip}.` : "You're all caught up here.");
        }
        if (!prefs.confirm) return startPlan(plan);
        const details = [];
        if (plan.guilds) details.push(`${plan.guilds} server${plan.guilds === 1 ? "" : "s"}`);
        if (plan.dms) details.push(`${plan.dms} DM${plan.dms === 1 ? "" : "s"}`);
        if (plan.groups) details.push(`${plan.groups} group chat${plan.groups === 1 ? "" : "s"}`);
        const skipCount = Object.values(plan.skipped).reduce((a, b) => a + b, 0);
        N.Alert.alert(
            `Mark ${plan.total} conversation${plan.total === 1 ? "" : "s"} as read?`,
            `${details.join(" · ")}${plan.threads ? `\nIncludes ${plan.threads} thread${plan.threads === 1 ? "" : "s"}.` : ""}${skipCount ? `\n${skipCount} skipped by your options or exclusions.` : ""}\n\nThis clears their unread markers up to this preview. Newer messages stay unread. You cannot undo messages already marked as read.`,
            [{ text: "Cancel", style: "cancel" }, { text: "Mark as read", onPress: () => startPlan(plan) }],
            { cancelable: true },
        );
    }

    function openPanel() {
        if (!active || panelSession || Date.now() - lastOpen < 400) return;
        lastOpen = Date.now();
        const session = ++nextPanelSession;
        panelSession = session;
        try {
            V.discord.actions.ActionSheetActionCreators.openLazy(
                Promise.resolve({ default: PanelLauncher }), KEY, { sheetKey: KEY, session }, "stack",
            );
        } catch {
            panelSession = 0;
            errorAlert("Open Valenced → Plugins → Read All Plus → Settings to use the full panel.");
        }
    }

    function closePanel() {
        if (!panelSession) return;
        panelSession = 0;
        emit();
        try { V.discord.actions.ActionSheetActionCreators.hideActionSheet(KEY); } catch {}
    }

    function safeArea() {
        try { return V.externals.ReactNativeSafeAreaContext.ReactNativeSafeAreaContext; }
        catch { return undefined; }
    }

    function PanelLauncher({ session }) {
        const openSession = R.useSyncExternalStore(subscribe, getPanelSession);
        R.useEffect(() => () => {
            if (panelSession === session) panelSession = 0;
        }, [session]);
        if (openSession !== session) return null;
        const h = R.createElement;
        const Provider = safeArea()?.SafeAreaProvider || N.View;
        const close = () => { if (panelSession === session) closePanel(); };
        // Unmount the native window even if Discord keeps the sheet launcher mounted.
        return h(N.Modal, {
            visible: true, presentationStyle: "fullScreen", animationType: "slide",
            onRequestClose: close,
        }, h(Provider, { style: { flex: 1 } }, h(Screen, { onClose: close })));
    }

    function getThemeStyles() {
        try {
            const design = V.discord.design.Design;
            const tokens = V.discord.common.tokens.Tokens;
            const colors = (tokens.default ?? tokens).colors;
            const names = {
                background: "BACKGROUND_BASE_LOWEST", surface: "BACKGROUND_BASE_LOWER",
                raised: "BACKGROUND_SURFACE_HIGHEST", border: "BORDER_SUBTLE",
                text: "TEXT_DEFAULT", muted: "TEXT_MUTED",
            };
            const styles = Object.fromEntries(Object.entries(names)
                .filter(([, token]) => colors[token] != null)
                .map(([key, token]) => [key, { color: colors[token] }]));
            return design.createStyles(styles) || (() => ({}));
        } catch { return () => ({}); }
    }

    function usePanelColors() {
        const systemTheme = N.useColorScheme?.();
        let theme;
        try { theme = getStores().ThemeStore?.theme || getStores().ThemeStore?.getTheme?.(); } catch {}
        const light = (theme || systemTheme) === "light";
        const colors = light
            ? { background: "#F3F2FA", surface: "#FFFFFF", raised: "#F6F4FC", border: "#DDD9E8", text: "#202031", muted: "#59566F", accent: "#5140AE", solid: "#5946C1", onSolid: "#FFFFFF", tint: "#E9E3FD", green: "#226B52", amber: "#8A5300", red: "#A52647" }
            : { background: "#15151D", surface: "#1E1F29", raised: "#272733", border: "#363746", text: "#F4F2FC", muted: "#B9B6CA", accent: "#C5B8FF", solid: "#BAA9FF", onSolid: "#221743", tint: "#32294C", green: "#92E1B9", amber: "#F4CF87", red: "#FF9BB2" };
        const [themeStyles] = R.useState(() => useThemeStyles ??= getThemeStyles());
        for (const [key, style] of Object.entries(themeStyles())) {
            const color = style?.color;
            if (typeof color === "string" || typeof color === "number") colors[key] = color;
        }
        return colors;
    }

    function Screen({ onClose } = {}) {
        const [revision, setRevision] = R.useState(0);
        const [tab, setTab] = R.useState("Home");
        const [query, setQuery] = R.useState("");
        const [filter, setFilter] = R.useState("All");
        const [onlyUnread, setOnlyUnread] = R.useState(true);
        const [selected, setSelected] = R.useState([]);
        const [excludeType, setExcludeType] = R.useState("Servers");
        const uid = getAccountId();
        const c = usePanelColors();
        const { width = 360, fontScale = 1 } = N.useWindowDimensions?.() ?? {};
        const narrow = width < 340 || fontScale > 1.3;
        const Frame = safeArea()?.SafeAreaView || N.SafeAreaView || N.View;

        R.useEffect(() => {
            let timer;
            const refresh = () => {
                if (timer) return;
                timer = setTimeout(() => { timer = null; setRevision(v => v + 1); }, 120);
            };
            const unsubscribe = subscribe(refresh);
            const unsubs = [];
            const stores = getStores();
            for (const name of ["ReadStateStore", "ChannelStore", "GuildStore", "UserStore", "UserGuildSettingsStore", "ThemeStore"]) {
                const store = stores[name];
                try {
                    store?.addChangeListener?.(refresh);
                    if (store?.removeChangeListener) unsubs.push(() => store.removeChangeListener(refresh));
                } catch {}
            }
            const poll = setInterval(refresh, 4000);
            return () => {
                unsubscribe();
                clearTimeout(timer);
                clearInterval(poll);
                for (const unsub of unsubs) { try { unsub(); } catch {} }
            };
        }, []);
        R.useEffect(() => { setSelected([]); }, [uid]);

        const { entries, scanError } = R.useMemo(() => {
            try { return { entries: engine && active ? engine.collect() : [], scanError: "" }; }
            catch { return { entries: [], scanError: "Open Discord’s channel list, then refresh." }; }
        }, [engine, active, uid, prefs, revision]);

        const h = R.createElement;
        const text = (value, style, props) => h(N.Text, {
            ...props, style: { color: c.text, fontSize: 15, lineHeight: 21, ...style },
        }, value);
        const detail = (value, style, props) => text(value, { color: c.muted, fontSize: 13, lineHeight: 18, ...style }, props);
        const heading = value => text(value, { fontSize: 17, lineHeight: 23, fontWeight: "700" }, { accessibilityRole: "header" });
        const rowStyle = { flexDirection: "row", alignItems: "center", gap: 8 };
        const divider = { borderTopWidth: 1, borderTopColor: c.border };
        const surface = { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border };
        const card = (...children) => h(N.View, { style: { ...surface, padding: 16, gap: 10 } }, ...children);
        const row = (...children) => h(N.View, { style: { ...rowStyle, flexWrap: "wrap" } }, ...children);
        const button = (label, onPress, options = {}) => h(N.Pressable, {
            key: options.key || label, accessibilityRole: "button",
            accessibilityLabel: options.accessibilityLabel || label,
            accessibilityState: { disabled: Boolean(options.disabled) },
            disabled: Boolean(options.disabled), onPress,
            style: ({ pressed }) => ({
                minHeight: options.compact ? 44 : 48, justifyContent: "center", alignItems: "center",
                paddingHorizontal: options.compact ? 10 : 14, paddingVertical: 7, borderRadius: 11,
                backgroundColor: options.primary ? c.solid : options.plain ? "transparent" : c.tint,
                opacity: options.disabled ? 0.45 : pressed ? 0.72 : 1,
                flex: options.grow ? 1 : undefined, ...options.style,
            }),
        }, text(label, {
            textAlign: "center", fontSize: options.compact ? 13 : 15, fontWeight: "700",
            color: options.primary ? c.onSolid : options.danger ? c.red : c.accent,
        }));
        const segment = (label, current, onPress, main = false) => h(N.Pressable, {
            key: label, accessibilityRole: main ? "tab" : "button",
            accessibilityState: { selected: current }, onPress,
            style: ({ pressed }) => ({
                flexGrow: main ? 1 : 0, flexBasis: main ? (narrow ? "46%" : 0) : undefined,
                minHeight: 44, justifyContent: "center", alignItems: "center",
                paddingHorizontal: main ? 2 : 11, paddingVertical: 5, borderRadius: 10,
                backgroundColor: current ? c.tint : "transparent", opacity: pressed ? 0.72 : 1,
            }),
        }, text(label, { color: current ? c.accent : c.muted, fontSize: 13, fontWeight: current ? "800" : "600", textAlign: "center" }));
        const toggle = (label, description, value, onValueChange, disabled = false, style = {}) =>
            h(N.View, { style: { ...rowStyle, minHeight: 54, paddingHorizontal: 14, paddingVertical: 9, ...style } },
                h(N.View, { style: { flex: 1, gap: 2 } }, text(label, { fontWeight: "600" }), description ? detail(description) : null),
                h(N.Switch, {
                    value: Boolean(value), onValueChange, disabled: disabled || !loaded || !active,
                    trackColor: { false: "#747184", true: c.solid }, thumbColor: "#FFFFFF",
                    accessibilityLabel: label,
                }));
        const searchField = (label, placeholder) => h(N.View, {
            style: { ...surface, ...rowStyle, borderRadius: 12, paddingHorizontal: 10 },
        }, h(N.TextInput, {
            value: query, onChangeText: setQuery, placeholder, placeholderTextColor: c.muted,
            accessibilityLabel: label, autoCorrect: false, autoCapitalize: "none", returnKeyType: "search",
            style: { flex: 1, minHeight: 46, color: c.text, fontSize: 15, paddingHorizontal: 4 },
        }), query ? button("×", () => setQuery(""), { accessibilityLabel: "Clear search", compact: true, plain: true }) : null);

        const unread = entries.filter(entry => entry.unread);
        const eligible = unread.filter(entry => entry.eligible);
        const unreadServers = new Set(eligible.map(entry => entry.guildId).filter(Boolean)).size;
        const unreadPrivate = eligible.filter(entry => !entry.guildId).length;
        const busy = Boolean(engine?.isBusy());
        const progress = progressAccount === uid ? engine?.getProgress() : undefined;
        const account = prefs.accounts[uid] || { guilds: [], channels: [] };
        const history = prefs.history.filter(item => item.accountId === uid).slice(0, 6);
        const actionDisabled = busy || !loaded || !uid || !active;
        const search = query.trim().toLocaleLowerCase();
        const matchesSearch = (name, context, id) => !search || `${name} ${context} ${id}`.toLocaleLowerCase().includes(search);
        const selectedSet = new Set(selected);
        const selectedIds = eligible.filter(entry => selectedSet.has(entry.id)).map(entry => entry.id);

        function goToTab(nextTab) {
            if (nextTab === tab) return;
            N.Keyboard?.dismiss();
            setQuery("");
            setTab(nextTab);
        }

        function refresh() {
            cache.clear();
            setRevision(value => value + 1);
        }

        function checkCompatibility() {
            const stores = getStores();
            let dispatcher = false;
            try { dispatcher = typeof V.discord.common.flux.Dispatcher?.dispatch === "function"; } catch {}
            N.Alert.alert("Compatibility check", `Signed in: ${uid ? "Yes" : "No"}\nChannel list: ${stores.ChannelStore ? "Ready" : "Still loading"}\nUnread information: ${typeof stores.ReadStateStore?.hasUnread === "function" ? "Ready" : "Still loading"}\nRead action: ${dispatcher ? "Ready" : "Unavailable"}\nLoaded conversations: ${entries.length}`);
        }

        function queueStatus() {
            if (!progress) return null;
            if (!busy) {
                if (!progress.completedAt || Date.now() - progress.completedAt > 7500) return null;
                return h(N.View, { style: { paddingHorizontal: 16, paddingVertical: 7, backgroundColor: c.surface } },
                    detail(historySummary(progress), { color: progress.failed || progress.unconfirmed ? c.amber : c.green },
                        { accessibilityLiveRegion: "polite" }));
            }
            const done = (progress.sent || 0) + (progress.failed || 0) + (progress.skipped || 0);
            const percent = progress.total ? Math.min(100, Math.round(done / progress.total * 100)) : 0;
            const label = progress.cancelling ? "Stopping…" : progress.phase === "checking" ? "Checking Discord…" : "Marking as read…";
            return h(N.View, { style: { paddingHorizontal: 14, paddingVertical: 6, gap: 5, backgroundColor: c.surface } },
                h(N.View, { style: rowStyle },
                    h(N.View, { style: { flex: 1 }, accessibilityLiveRegion: "polite" },
                        text(label, { fontWeight: "700" }), detail(`${done} of ${progress.total} processed`)),
                    button("Stop", () => engine.cancel(), { compact: true, danger: true, plain: true, disabled: progress.cancelling })),
                h(N.View, { accessibilityRole: "progressbar", accessibilityValue: { min: 0, max: 100, now: percent },
                    style: { height: 4, borderRadius: 2, backgroundColor: c.border, overflow: "hidden" } },
                    h(N.View, { style: { height: 4, width: `${percent}%`, backgroundColor: c.solid } })));
        }

        function home() {
            const protectedCount = unread.length - eligible.length;
            const loadedUnread = `${unread.length} unread conversation${unread.length === 1 ? "" : "s"}`;
            const stats = [
                ["Servers", unreadServers], ["DMs + groups", unreadPrivate], ["Skipped", protectedCount],
            ];
            const stat = ([label, count]) => h(N.View, { key: label, style: { flex: 1, gap: 3 } },
                text(String(count), { fontSize: 19, lineHeight: 25, fontWeight: "800" }), detail(label));
            return [
                h(N.View, { key: "overview", style: { ...surface, padding: 16, gap: 12, overflow: "hidden" } },
                    heading(eligible.length ? "Unread overview" : unread.length ? "No unread chats ready" : "All caught up"),
                    detail(loadedUnread),
                    h(N.View, { style: { ...rowStyle, ...divider, paddingTop: 10, alignItems: "flex-start" } }, ...stats.map(stat)),
                    button(`Mark everything read${eligible.length ? ` (${eligible.length})` : ""}`, () => ask("all"),
                        { primary: true, disabled: actionDisabled || !eligible.length })),
                h(N.View, { key: "quick", style: { gap: 8 } }, heading("Quick actions"),
                    row(button("Servers only", () => ask("servers"), { grow: true, disabled: actionDisabled || !unreadServers }),
                        button("DMs + groups", () => ask("dms"), { grow: true, disabled: actionDisabled || !unreadPrivate })),
                    row(button("Current channel", () => ask("current"), { grow: true, disabled: actionDisabled || !engine?.currentChannelId() }),
                        button("Current server", () => ask("guild"), { grow: true, disabled: actionDisabled || !engine?.currentGuildId() })),
                    button("Choose individual channels", () => goToTab("Channels"), { plain: true })),
                h(N.View, { key: "recent", style: { gap: 10 } }, history.length ? card(
                    h(N.View, { style: { ...rowStyle, justifyContent: "space-between", flexWrap: "wrap" } },
                        heading("Recent activity"), button("Clear history", () => save({ history: prefs.history.filter(item => item.accountId !== uid) }), { compact: true, plain: true })),
                    ...history.map((item, index) => h(N.View, { key: String(item.at) + "-" + index, style: { ...divider, paddingTop: 8, gap: 2 } },
                        text(historySummary(item)), detail(new Date(item.at).toLocaleString()))),
                ) : null),
            ];
        }

        function channelRow({ item: entry }) {
            const checked = entry.eligible && selectedSet.has(entry.id);
            const directExclusion = account.channels.includes(entry.id);
            const kind = { thread: "Thread", group: "Group chat", dm: "DM" }[entry.kind] || "Channel";
            const label = entry.guildId && entry.kind !== "thread" ? `#${entry.name}` : entry.name;
            const metadata = [entry.guildId ? entry.guildName : kind, entry.guildId && entry.kind === "thread" ? kind : null,
                entry.mentions > 0 ? `${entry.mentions} mention${entry.mentions === 1 ? "" : "s"}` : null,
                entry.muted && entry.skipReason !== "Muted" ? "Muted" : null].filter(Boolean).join(" · ");
            const selectionDisabled = actionDisabled || !entry.eligible;
            return h(N.View, { style: { ...surface, padding: 10, gap: 3, borderColor: checked ? c.accent : c.border } },
                h(N.Pressable, {
                    accessibilityRole: "checkbox", accessibilityState: { checked, disabled: selectionDisabled },
                    accessibilityLabel: label, disabled: selectionDisabled,
                    onLongPress: () => changeExclusion("channels", entry.id),
                    onPress: () => setSelected(items => items.includes(entry.id) ? items.filter(id => id !== entry.id) : [...items, entry.id]),
                    style: ({ pressed }) => ({ ...rowStyle, gap: 12, minHeight: 46, padding: 3, opacity: pressed ? 0.72 : 1 }),
                }, h(N.View, { style: { width: 23, height: 23, borderRadius: 7, borderWidth: 1,
                    borderColor: checked ? c.accent : c.muted, backgroundColor: checked ? c.tint : c.background,
                    alignItems: "center", justifyContent: "center" } },
                checked ? text("✓", { color: c.accent, fontWeight: "800" }) : null),
                h(N.View, { style: { flex: 1, gap: 2 } },
                    text(label, { fontWeight: "700" }, { numberOfLines: 2 }),
                    detail(metadata),
                    entry.skipReason || !entry.unread ? detail(entry.skipReason || "Already read", { color: entry.excluded ? c.amber : c.muted }) : null)),
                row(button("Read", () => ask("selected", [entry.id]), { compact: true, plain: true, disabled: selectionDisabled }),
                    button(directExclusion ? "Allow" : "Exclude", () => changeExclusion("channels", entry.id), {
                        accessibilityLabel: directExclusion ? "Allow channel" : "Exclude channel",
                        compact: true, plain: true, disabled: actionDisabled,
                    })));
        }

        function exclusionRows() {
            if (excludeType === "Conversations") {
                const rows = new Map(entries.map(entry => [entry.id, {
                    id: entry.id, name: entry.name, context: entry.guildName, excluded: account.channels.includes(entry.id), type: "channels",
                }]));
                for (const id of account.channels) {
                    if (!rows.has(id)) rows.set(id, { id, name: `Saved conversation (${id})`, context: "Currently unavailable", excluded: true, type: "channels" });
                }
                return [...rows.values()];
            }
            const servers = new Map(entries.filter(entry => entry.guildId).map(entry => [entry.guildId, entry.guildName]));
            try {
                for (const guild of Object.values(getStores().GuildStore?.getGuilds?.() || {})) {
                    if (guild?.id) servers.set(guild.id, guild.name || "Server");
                }
            } catch {}
            for (const id of account.guilds) {
                if (!servers.has(id)) servers.set(id, `Saved server (${id})`);
            }
            return [...servers].map(([id, name]) => ({ id, name, context: "All channels and threads", excluded: account.guilds.includes(id), type: "guilds" }));
        }

        function options() {
            const switchGroup = (label, definitions) => h(N.View, { key: label, style: { gap: 8 } }, heading(label),
                h(N.View, { style: surface }, ...definitions.map(([key, title, description], index) =>
                    h(N.View, { key, style: index ? divider : undefined }, toggle(title, description, prefs[key], value => save({ [key]: value }), busy)))));
            return [
                switchGroup("Read rules", [
                    ["includeMuted", "Include muted chats", "Mark muted servers, categories and conversations as read."],
                    ["protectMentions", "Protect mentions", "Keep chats with mentions unread."],
                    ["includeThreads", "Include active threads", "Mark loaded threads as read with their servers."],
                ]),
                switchGroup("Controls", [
                    ["confirm", "Preview before clearing", "Ask for confirmation before marking messages as read."],
                    ["longPress", "Long-press Messages shortcut", "Hold Messages in the server sidebar to open this panel."],
                    ["quiet", "Quiet completion", "Save results in Recent activity without a notification."],
                ]),
                h(N.View, { key: "compatibility", style: { gap: 6, alignItems: "flex-start" } },
                    detail("Read All Plus 2.1.1"), button("Check compatibility", checkCompatibility, { compact: true, plain: true })),
            ];
        }

        const notices = [
            !active ? "Enable Read All Plus in Valenced’s plugin list." : "",
            active && !loaded ? loadingError || "Loading your preferences…" : "",
            scanError,
            !uid && loaded ? "Sign in to Discord to manage unread conversations." : "",
        ].filter(Boolean);
        const notice = notices.length ? h(N.View, { style: { paddingHorizontal: 16, paddingVertical: 6 } },
            detail(notices.join("\n"), { color: c.amber }, { accessibilityLiveRegion: "polite" })) : null;

        const scrollProps = {
            key: tab, style: { flex: 1, minHeight: 0 }, keyboardShouldPersistTaps: "handled",
            keyboardDismissMode: "on-drag", showsVerticalScrollIndicator: true,
            contentContainerStyle: { padding: 14, paddingBottom: 18 },
            testID: "read-all-plus-scroll",
        };

        let body, footer;
        if (tab === "Channels") {
            const matching = entries.filter(entry => (!onlyUnread || entry.unread) &&
                matchesSearch(entry.name, entry.guildName, entry.id) &&
                (filter === "All" || (filter === "Servers" && entry.guildId) ||
                 (filter === "DMs" && entry.kind === "dm") || (filter === "Groups" && entry.kind === "group") ||
                 (filter === "Threads" && entry.kind === "thread")));
            const matchIds = matching.filter(entry => entry.eligible).map(entry => entry.id);
            body = h(N.FlatList, {
                ...scrollProps, data: matching, keyExtractor: entry => entry.id, renderItem: channelRow,
                ItemSeparatorComponent: ListSeparator,
                ListHeaderComponent: h(N.View, { style: { gap: 8, marginBottom: 8 } },
                    searchField("Search channels, people or servers", "Search conversations"),
                    row(...["All", "Servers", "DMs", "Groups", "Threads"].map(label => segment(label, filter === label, () => setFilter(label)))),
                    h(N.View, { style: surface }, toggle("Only show unread", "", onlyUnread, setOnlyUnread)),
                    h(N.View, { style: { ...rowStyle, justifyContent: "space-between", flexWrap: "wrap" } },
                        detail(`${matching.length} conversation${matching.length === 1 ? "" : "s"}`),
                        button("Select matches", () => setSelected(items => [...new Set([...items, ...matchIds])]), {
                            compact: true, plain: true, disabled: actionDisabled || !matchIds.some(id => !selectedSet.has(id)),
                        }))),
                ListEmptyComponent: card(heading("No matching conversations"),
                    detail(onlyUnread ? "Change your search or turn off Only show unread." : "Try a different name or filter.")),
            });
            if (selectedIds.length) {
                footer = h(N.View, { style: { ...rowStyle, ...divider, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.surface } },
                    button("Clear", () => setSelected([]), { accessibilityLabel: "Clear selection", compact: true, plain: true }),
                    button(`Read selected (${selectedIds.length})`, () => ask("selected", selectedIds),
                        { primary: true, grow: true, disabled: actionDisabled }));
            }
        } else if (tab === "Exclusions") {
            const matching = exclusionRows().filter(entry => matchesSearch(entry.name, entry.context, entry.id))
                .sort((a, b) => Number(b.excluded) - Number(a.excluded) || a.name.localeCompare(b.name));
            body = h(N.FlatList, {
                ...scrollProps, key: `exclusions-${excludeType}`, data: matching, keyExtractor: entry => entry.id,
                renderItem: ({ item }) => h(N.View, { style: surface },
                    toggle(item.name, `${item.context}${item.excluded ? " · Excluded" : ""}`, item.excluded,
                        () => changeExclusion(item.type, item.id), actionDisabled)),
                ItemSeparatorComponent: ListSeparator,
                ListHeaderComponent: h(N.View, { style: { gap: 8, marginBottom: 8 } },
                    detail("Excluded chats stay unread. Excluding a server also covers its channels and threads."),
                    row(...["Servers", "Conversations"].map(label => segment(label, excludeType === label, () => setExcludeType(label)))),
                    searchField("Search exclusions", excludeType === "Servers" ? "Search servers or IDs" : "Search conversations or IDs"),
                    detail(`${account.guilds.length} excluded servers · ${account.channels.length} excluded conversations`)),
                ListEmptyComponent: card(detail("No matches. Try a different name or ID.")),
            });
        } else {
            body = h(N.ScrollView, scrollProps, h(N.View, { style: { gap: 12 } }, ...(tab === "Home" ? home() : options())));
        }

        return h(Frame, { style: { flex: 1, minHeight: 0, backgroundColor: c.background },
            edges: onClose ? ["top", "right", "bottom", "left"] : ["right", "bottom", "left"] },
            onClose ? h(N.View, { style: { ...rowStyle, justifyContent: "space-between", paddingLeft: 16, paddingRight: 10, paddingVertical: 3 } },
                heading("Read All Plus"), button("Close", onClose, { compact: true, plain: true })) : null,
            h(N.View, { style: { ...rowStyle, paddingHorizontal: 14, paddingVertical: 7, alignItems: "flex-start" } },
                h(N.View, { style: { ...rowStyle, flex: 1, flexWrap: narrow ? "wrap" : "nowrap", backgroundColor: c.surface,
                    borderRadius: 13, padding: 3, gap: 2 } },
                ...["Home", "Channels", "Exclusions", "Options"].map(label => segment(label, tab === label, () => goToTab(label), true))),
                tab === "Home" ? button("↻", refresh, { accessibilityLabel: "Refresh", plain: true, compact: true, style: { minHeight: 50 } }) : null),
            queueStatus(), notice, body, footer);
    }

    function ListSeparator() {
        return R.createElement(N.View, { style: { height: 8 } });
    }

    function installShortcut(cleanup) {
        const nameOf = type => type?.displayName || type?.name || type?.type?.displayName || type?.type?.name || type?.render?.name;
        const patch = args => {
            const [type, props, key] = args;
            if (nameOf(type) !== "GuildsBarAnimatedItemWrapper" || nameOf(props?.expandedChildren?.type) !== "HomeDrawerDMsRowWrapper") return args;
            const original = props.config?.onLongPress;
            return [type, { ...props, config: { ...props.config, onLongPress: (...params) => {
                if (active && prefs.longPress) return openPanel();
                return original?.(...params);
            } } }, key];
        };
        try {
            const runtime = V.react.ReactJSXRuntime;
            cleanup(V.patcher.before(runtime, "jsx", patch), V.patcher.before(runtime, "jsxs", patch));
        } catch { /* The native Settings entry is always available. */ }
    }

    function registerSettings(cleanup) {
        try {
            const settings = V.discord.modules.settings;
            cleanup(settings.onSettingsModulesLoaded(() => {
                if (!active) return;
                cleanup(settings.registerSettingsItem(SETTING, { parent: null, type: "pressable", useTitle: () => "Read All Plus", useDescription: () => "Servers, channels, DMs and group chats", onPress: openPanel, withArrow: true }));
                try { cleanup(settings.addSettingsItemToSection("VALENCED", SETTING)); }
                catch { cleanup(settings.registerSettingsSection("READ_ALL_PLUS", { label: "Read All Plus", settings: [SETTING] })); }
                try { settings.refreshSettings(); } catch {}
            }));
        } catch { /* The plugin's own Settings button remains available. */ }
    }

    return { default: definePlugin({
        SettingsComponent: Screen,
        init(context) {
            api = context;
            V = context.unscoped;
            R = V.react.React;
            N = V.react.ReactNative;
            active = true;
            lastOpen = 0;
            loadingError = "";
            progressAccount = "";
            useThemeStyles = undefined;
            engine = createEngine({
                getStores, getAccountId, getSettings: () => prefs,
                canView(channel) {
                    try {
                        const permission = V.discord.common.constants.Constants?.Permissions?.VIEW_CHANNEL;
                        const ps = getStores().PermissionStore;
                        if (permission !== undefined && typeof ps?.can === "function") return ps.can(permission, channel);
                    } catch {}
                    return true;
                },
                dispatch(payload) {
                    const dispatcher = V.discord.common.flux.Dispatcher;
                    if (typeof dispatcher?.dispatch !== "function") throw new Error("Discord's read action is unavailable on this build.");
                    return dispatcher.dispatch(payload);
                },
                onProgress: emit,
                onComplete(result) {
                    const record = { accountId: getAccountId(), at: Date.now(), scope: result.scope, confirmed: result.confirmed, unconfirmed: result.unconfirmed, failed: result.failed, skipped: result.skipped, cancelled: result.cancelled };
                    save({ history: [record, ...prefs.history].slice(0, 12) });
                    if (!prefs.quiet) notify(historySummary(result));
                },
            });
            try {
                storage = api.jsonStorage;
                Promise.resolve(storage.get()).then(value => {
                    if (!active) return;
                    prefs = normalise(value); loaded = true; emit();
                }).catch(() => {
                    loadingError = "Your preferences could not be loaded. Restart Discord before clearing unread messages.";
                    emit();
                });
            } catch {
                loadingError = "The preferences service is unavailable. Update Valenced and restart Discord.";
            }
            installShortcut(context.cleanup);
            registerSettings(context.cleanup);
            context.cleanup(() => {
                active = false; loaded = false; engine?.dispose(); closePanel(); cache.clear(); emit();
            });
        },
        stop() {
            active = false; engine?.dispose(); closePanel(); emit();
        },
    }) };
})(valenced, plugin, (function createReadAllEngine(env) {
    const pause = env.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    let disposed = false;
    let cancelled = false;
    let busy = false;
    let progress = { phase: "idle", total: 0, sent: 0, confirmed: 0, unconfirmed: 0, failed: 0, skipped: 0 };

    const safe = (obj, name, ...args) => {
        try { return typeof obj?.[name] === "function" ? obj[name](...args) : undefined; }
        catch { return undefined; }
    };
    const sf = value => typeof value === "string" && /^\d{15,22}$/.test(value);
    const newerOrEqual = (a, b) => sf(a) && sf(b) && (a.length > b.length || (a.length === b.length && a >= b));
    const setting = () => env.getSettings() || {};
    const accountId = () => env.getAccountId() || "";
    const stores = () => env.getStores() || {};
    const accountSettings = () => setting().accounts?.[accountId()] || {};

    function update(patch) {
        progress = { ...progress, ...patch };
        try { env.onProgress?.({ ...progress }); } catch { /* UI must not interrupt a queue. */ }
    }

    function currentChannelId() {
        return safe(stores().SelectedChannelStore, "getChannelId");
    }

    function currentGuildId() {
        const s = stores();
        const channel = safe(s.ChannelStore, "getChannel", currentChannelId());
        return channel?.guild_id || channel?.guildId || safe(s.SelectedGuildStore, "getGuildId");
    }

    function readInfo(channel, s = stores()) {
        const rs = s.ReadStateStore;
        const id = channel.id;
        const m = safe(rs, "getMentionCount", id);
        const mentions = typeof m === "number" && Number.isFinite(m) ? Math.max(0, m) : null;
        const unreadValue = safe(rs, "hasUnread", id);
        const unread = mentions > 0 || unreadValue === true;
        const messageId = [safe(rs, "lastMessageId", id), channel.lastMessageId, channel.last_message_id].find(sf);
        return { unread, mentions, messageId };
    }

    function muted(channel, s = stores()) {
        const ns = s.UserGuildSettingsStore || s.NotificationSettingsStore;
        const gid = channel.guild_id || channel.guildId;
        if (!gid) return safe(ns, "isChannelMuted", null, channel.id) === true;
        const combined = safe(ns, "isGuildOrCategoryOrChannelMuted", gid, channel.id);
        if (typeof combined === "boolean") return combined;
        if (safe(ns, "isGuildMuted", gid) === true) return true;
        let parent = channel;
        for (let i = 0; parent && i < 8; i++) {
            if (safe(ns, "isChannelMuted", gid, parent.id) === true) return true;
            parent = safe(s.ChannelStore, "getChannel", parent.parent_id || parent.parentId);
        }
        return false;
    }

    function excluded(channel, s = stores()) {
        const a = accountSettings();
        const gid = channel.guild_id || channel.guildId;
        if (gid && (a.guilds || []).includes(gid)) return true;
        let parent = channel;
        for (let i = 0; parent && i < 8; i++) {
            if ((a.channels || []).includes(parent.id)) return true;
            parent = safe(s.ChannelStore, "getChannel", parent.parent_id || parent.parentId);
        }
        return false;
    }

    function reason(channel, options, s = stores()) {
        const opts = options || setting();
        if (excluded(channel, s)) return "Excluded";
        if (!opts.includeThreads && [10, 11, 12].includes(channel.type)) return "Threads disabled";
        if (!opts.includeMuted && muted(channel, s)) return "Muted";
        const info = readInfo(channel, s);
        if (opts.protectMentions && info.mentions === null) return "Mention count unavailable";
        if (opts.protectMentions && info.mentions > 0) return "Mentions protected";
        if (!info.messageId) return "Latest message unavailable";
        return null;
    }

    function collect() {
        const s = stores();
        const byId = new Map();
        const guilds = new Map();
        const seen = new WeakSet();
        let visited = 0;
        const gs = safe(s.GuildStore, "getGuilds");
        if (gs) for (const g of Object.values(gs)) if (g?.id) guilds.set(g.id, g);
        for (const id of safe(s.GuildStore, "getGuildIds") || []) {
            if (!guilds.has(id)) guilds.set(id, safe(s.GuildStore, "getGuild", id) || { id, name: "Server" });
        }

        function walk(node, guildHint, depth = 0) {
            if (!node || typeof node !== "object" || depth > 10 || visited++ > 120000 || seen.has(node)) return;
            seen.add(node);
            if (typeof node.id === "string" && typeof node.type === "number") {
                if (![0, 1, 2, 3, 5, 10, 11, 12, 13].includes(node.type)) return;
                const isPrivate = node.type === 1 || node.type === 3;
                const gid = isPrivate ? undefined : (node.guild_id || node.guildId || guildHint);
                if (!isPrivate && (!gid || (guilds.size && !guilds.has(gid)))) return;
                if (!isPrivate && env.canView && env.canView(node) === false) return;
                byId.set(node.id, { ...node, id: node.id, type: node.type, guild_id: gid });
                return;
            }
            if (node instanceof Map || node instanceof Set) {
                for (const value of node.values()) walk(value, guildHint, depth + 1);
            } else {
                for (const value of Object.values(node)) walk(value, guildHint, depth + 1);
            }
        }

        walk(safe(s.ChannelStore, "getMutableGuildChannels"));
        walk(safe(s.ChannelStore, "getMutablePrivateChannels"));
        for (const id of safe(s.PrivateChannelSortStore, "getPrivateChannelIds") || []) walk(safe(s.ChannelStore, "getChannel", id));
        for (const gid of guilds.keys()) {
            walk(safe(s.ChannelStore, "getMutableGuildChannelsForGuild", gid), gid);
            walk(safe(s.GuildChannelStore, "getChannels", gid), gid);
            walk(safe(s.ActiveJoinedThreadsStore, "getActiveJoinedThreadsForGuild", gid), gid);
        }
        walk(safe(s.ChannelStore, "getChannel", currentChannelId()));

        const entries = [];
        for (const channel of byId.values()) {
            const gid = channel.guild_id;
            const kind = channel.type === 1 ? "dm" : channel.type === 3 ? "group" : [10, 11, 12].includes(channel.type) ? "thread" : "server";
            let name = channel.name;
            if (!name && kind === "dm") {
                const recipient = channel.recipients?.[0];
                const user = typeof recipient === "object" ? recipient : safe(s.UserStore, "getUser", recipient);
                name = user?.globalName || user?.global_name || user?.username;
            }
            if (!name && kind === "group") {
                name = (channel.recipients || []).slice(0, 4).map(r => {
                    const user = typeof r === "object" ? r : safe(s.UserStore, "getUser", r);
                    return user?.globalName || user?.global_name || user?.username;
                }).filter(Boolean).join(", ");
            }
            const info = readInfo(channel, s);
            const skipReason = reason(channel, undefined, s);
            entries.push({
                channel, id: channel.id, guildId: gid,
                guildName: gid ? guilds.get(gid)?.name || "Server" : "Direct messages",
                name: name || (kind === "group" ? "Group chat" : kind === "dm" ? "Direct message" : "Channel"),
                kind, ...info, muted: muted(channel, s), excluded: excluded(channel, s),
                skipReason, eligible: info.unread && !skipReason,
            });
        }
        entries.sort((a, b) => Number(b.unread) - Number(a.unread) || a.guildName.localeCompare(b.guildName) || a.name.localeCompare(b.name));
        return entries;
    }

    function makePlan(scope = "all", selectedIds, guildId) {
        if (disposed) throw new Error("Read All Plus is disabled.");
        if (!accountId()) throw new Error("Sign in to Discord first.");
        const s = stores();
        if (!s.ChannelStore || !s.ReadStateStore || typeof s.ReadStateStore.hasUnread !== "function") {
            throw new Error("Discord is still loading its channels. Open your channel list, then try again.");
        }
        const selected = new Set(selectedIds || []);
        const currentId = currentChannelId();
        const gid = guildId || currentGuildId();
        if (scope === "current" && !currentId) throw new Error("Open a channel or DM first.");
        if (scope === "guild" && !gid) throw new Error("Open a server first.");
        const matches = e => scope === "all" ||
            (scope === "servers" && Boolean(e.guildId)) ||
            (scope === "dms" && ["dm", "group"].includes(e.kind)) ||
            (scope === "groups" && e.kind === "group") ||
            (scope === "current" && e.id === currentId) ||
            (scope === "guild" && e.guildId === gid) ||
            (scope === "selected" && selected.has(e.id));
        const candidates = collect().filter(e => matches(e) && e.unread);
        const skipped = {};
        const targets = [];
        for (const entry of candidates) {
            if (!entry.eligible) skipped[entry.skipReason] = (skipped[entry.skipReason] || 0) + 1;
            else targets.push({ id: entry.id, messageId: entry.messageId, guildId: entry.guildId, channel: entry.channel, kind: entry.kind });
        }
        return {
            accountId: accountId(), createdAt: Date.now(), scope,
            total: targets.length, unreadInScope: candidates.length, skipped,
            guilds: new Set(targets.map(t => t.guildId).filter(Boolean)).size,
            dms: targets.filter(t => t.kind === "dm").length,
            groups: targets.filter(t => t.kind === "group").length,
            threads: targets.filter(t => t.kind === "thread").length,
            targets,
        };
    }

    function acknowledged(target) {
        const rs = stores().ReadStateStore;
        for (const name of ["ackMessageId", "getLastReadMessageId", "getAckMessageId"]) {
            const value = safe(rs, name, target.id);
            if (newerOrEqual(value, target.messageId)) return true;
        }
        return safe(rs, "hasUnread", target.id) === false && !(safe(rs, "getMentionCount", target.id) > 0);
    }

    async function dispatchWithDeadline(payload) {
        const request = env.dispatch(payload);
        if (!request || typeof request.then !== "function") return request;
        let timer;
        try {
            return await Promise.race([
                request,
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error("Discord did not finish this batch in time.")), env.dispatchTimeoutMs || 5000);
                }),
            ]);
        } finally { clearTimeout(timer); }
    }

    async function run(plan) {
        if (busy) throw new Error("A read-all operation is already running.");
        if (disposed) throw new Error("Read All Plus is disabled.");
        if (!plan || plan.accountId !== accountId()) throw new Error("Your account changed. Preview this action again.");
        if (Date.now() - plan.createdAt > 5 * 60 * 1000) throw new Error("This preview has expired. Preview this action again.");
        if (!plan.total) return { phase: "done", total: 0, sent: 0, confirmed: 0, unconfirmed: 0, failed: 0, skipped: 0, cancelled: false };
        busy = true;
        cancelled = false;
        const sent = [];
        const failedIds = [];
        const interrupted = () => disposed || cancelled || accountId() !== plan.accountId;
        update({ phase: "running", total: plan.total, sent: 0, confirmed: 0, unconfirmed: 0, failed: 0, skipped: 0, cancelled: false, cancelling: false, scope: plan.scope, error: null, failedIds: [] });
        try {
            for (let i = 0; i < plan.targets.length; i += 25) {
                if (interrupted()) break;
                const batch = [];
                for (const target of plan.targets.slice(i, i + 25)) {
                    const cs = stores().ChannelStore;
                    const live = safe(cs, "getChannel", target.id);
                    if ((typeof cs?.getChannel === "function" && !live) || reason(live || target.channel) || acknowledged(target)) {
                        update({ skipped: progress.skipped + 1 });
                    } else batch.push(target);
                }
                if (interrupted()) break;
                if (batch.length) {
                    try {
                        await dispatchWithDeadline({
                            type: "BULK_ACK", context: "APP",
                            channels: batch.map(t => ({ channelId: t.id, messageId: t.messageId, readStateType: 0 })),
                        });
                        sent.push(...batch);
                        update({ sent: sent.length });
                    } catch {
                        failedIds.push(...batch.map(t => t.id));
                        update({ failed: failedIds.length, error: "Discord rejected one or more batches." });
                    }
                }
                if (i + 25 < plan.targets.length && !interrupted()) await pause(450);
            }
            update({ phase: "checking" });
            let pending = accountId() === plan.accountId ? sent.filter(t => !acknowledged(t)) : sent.slice();
            update({ confirmed: sent.length - pending.length });
            for (let attempt = 0; attempt < 5 && pending.length && !interrupted(); attempt++) {
                await pause(attempt ? 650 : 200);
                if (interrupted()) break;
                pending = pending.filter(t => !acknowledged(t));
                update({ confirmed: sent.length - pending.length });
            }
            const didCancel = interrupted();
            const unprocessed = Math.max(0, plan.total - sent.length - failedIds.length - progress.skipped);
            update({
                phase: didCancel ? "cancelled" : "done", cancelled: didCancel,
                unconfirmed: pending.length, skipped: progress.skipped + unprocessed,
                failedIds, completedAt: Date.now(),
            });
            const result = { ...progress };
            if (!disposed && accountId() === plan.accountId) {
                try { env.onComplete?.(result); } catch { /* Saving history must not affect the result. */ }
            }
            return result;
        } finally {
            busy = false;
            update({ cancelling: false });
        }
    }

    return {
        collect, makePlan, run, reason, readInfo, currentChannelId, currentGuildId,
        cancel() { cancelled = true; update({ cancelling: true }); },
        dispose() { disposed = true; cancelled = true; },
        getProgress() { return { ...progress }; },
        isBusy() { return busy; },
    };
}))
