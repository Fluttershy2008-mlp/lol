(function () {
    "use strict";

    // Legacy Revenge / Vendetta-compatible plugin expression. No build step needed.
    // Revenge injects a plugin-specific API containing this plugin's storage.
    const api = typeof vendetta !== "undefined" ? vendetta : globalThis.vendetta;
    if (!api) throw new Error("Silent Server Invite needs Revenge's Vendetta compatibility API.");
    const common = api.metro.common;
    const React = common.React;
    const RN = common.ReactNative;
    const storage = api.plugin.storage;
    const removers = [];
    let active = false;
    let lastNotice = 0;

    function normalizeInvite(value) {
        const text = String(value || "").trim();
        const match = text.match(/^(?:https:\/\/)?(?:www\.)?(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)([A-Za-z0-9_-]{1,128})\/?$/i);
        return match ? "https://discord.gg/" + match[1] : null;
    }

    function inviteChannel(request) {
        const raw = typeof request === "string" ? request : request && request.url;
        if (typeof raw !== "string") return null;
        // Absolute URLs must belong to Discord, not an unrelated REST service.
        if (/^https?:\/\//i.test(raw) && !/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\//i.test(raw)) return null;
        const path = raw.replace(/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com/i, "").split(/[?#]/)[0];
        const match = path.match(/^(?:\/api(?:\/v\d+)?)?\/channels\/(\d+)\/invites\/?$/);
        return match ? match[1] : null;
    }

    function notice(message) {
        try { api.ui.toasts.showToast(message); } catch (_) { /* never alter request blocking */ }
    }

    function clipboard() {
        return common.clipboard || RN.Clipboard || api.metro.findByProps("getString", "setString");
    }

    function stop() {
        active = false;
        while (removers.length) {
            try { removers.pop()(); } catch (_) { /* continue removing remaining patches */ }
        }
    }

    function start() {
        if (active) return;
        const rest = common.restAPI || api.metro.findByProps("get", "post", "put", "patch", "del");
        if (!rest || typeof rest.post !== "function") {
            throw new Error("Silent Server Invite: Discord REST module unavailable. Blocking is NOT active.");
        }
        try {
            const remove = api.patcher.instead("post", rest, (args, original) => {
                if (!inviteChannel(args[0])) return original(...args);
                const message = "New invite blocked. Copy your saved invite in Silent Server Invite settings.";
                if (Date.now() - lastNotice > 2000) {
                    lastNotice = Date.now();
                    notice(message);
                }
                const error = new Error(message);
                error.name = "SilentServerInviteBlocked";
                error.status = 403;
                error.body = { message, code: "SILENT_SERVER_INVITE_BLOCKED" };
                // Fail honestly: no fabricated invite or successful Discord response.
                return Promise.reject(error);
            });
            if (typeof remove !== "function") throw new Error("Unsupported Revenge patcher API.");
            removers.push(remove);
            active = true;
        } catch (error) {
            stop();
            throw error;
        }
    }

    function Settings() {
        const [draft, setDraft] = React.useState(storage.savedInvite || "");
        const [message, setMessage] = React.useState("");
        const dark = RN.useColorScheme ? RN.useColorScheme() !== "light" : true;
        const textColor = dark ? "#f2f3f5" : "#18191c";
        const muted = dark ? "#b5bac1" : "#4e5058";
        const h = React.createElement;
        const paragraph = (text, extra) => h(RN.Text, { style: Object.assign({ color: muted, fontSize: 15, marginBottom: 14, lineHeight: 22 }, extra) }, text);
        const button = (text, onPress) => h(RN.Pressable, {
            accessibilityRole: "button", onPress,
            style: { backgroundColor: "#5865f2", borderRadius: 8, padding: 14, marginBottom: 12 }
        }, h(RN.Text, { style: { color: "#fff", fontWeight: "600", textAlign: "center" } }, text));

        return h(RN.ScrollView, { keyboardShouldPersistTaps: "handled", contentContainerStyle: { padding: 20 } },
            paragraph("Silent Server Invite", { color: textColor, fontSize: 24, fontWeight: "700" }),
            paragraph(active ? "Invite blocking is active in this client." : "Invite blocking is NOT active. Enable the plugin and reload Discord."),
            paragraph("This plugin blocks new channel invite requests. It cannot hide invites from Discord's audit log or server bots."),
            paragraph("Paste an existing invite below. Saving and copying only use your device; they do not create or validate an invite."),
            h(RN.TextInput, {
                accessibilityLabel: "Existing Discord invite", value: draft, onChangeText: setDraft,
                autoCapitalize: "none", autoCorrect: false, placeholder: "https://discord.gg/your-existing-code",
                placeholderTextColor: muted,
                style: { color: textColor, borderColor: muted, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 14 }
            }),
            button("Save existing invite", () => {
                const normalized = normalizeInvite(draft);
                if (!normalized) { setMessage("Enter a valid discord.gg or discord.com/invite link."); return; }
                storage.savedInvite = normalized;
                setDraft(normalized);
                setMessage("Saved locally. No invite was created.");
            }),
            button("Copy saved invite", async () => {
                const saved = normalizeInvite(storage.savedInvite);
                if (!saved) { setMessage("Save an existing invite first."); return; }
                try {
                    const cp = clipboard();
                    if (!cp || typeof cp.setString !== "function") throw new Error("Clipboard unavailable");
                    await cp.setString(saved);
                    setMessage("Copied your saved invite. No new invite was created.");
                } catch (_) { setMessage("Could not copy. Select and copy the link manually."); }
            }),
            button("Clear saved invite", () => { storage.savedInvite = ""; setDraft(""); setMessage("Saved invite cleared."); }),
            message ? paragraph(message, { color: textColor }) : null,
            paragraph("Existing links may expire or be revoked. Bots can still track joins and uses. Disabling this plugin restores normal invite creation."),
            paragraph("Experimental: targets legacy Revenge with the Vendetta API. Discord updates or other request paths may bypass this hook. Do not assume undetectability.")
        );
    }

    const plugin = { onLoad: start, onUnload: stop, settings: Settings };
    // Accommodate loaders that read either the expression or its default export.
    Object.defineProperty(plugin, "default", { value: plugin });
    return plugin;
})();
