(() => {
    "use strict";

    // PingJumper for Revenge / Vendetta-compatible Discord mobile clients.
    // Floating arrows let you move through Discord's Recent Mentions history:
    //   \u2191 older ping
    //   \u2193 newer ping

    const { findByProps, findByStoreName, findByTypeName } = vendetta.metro;
    const { React, ReactNative } = vendetta.metro.common;
    const { before, after } = vendetta.patcher;
    const { getAssetIDByName } = vendetta.ui.assets;
    const { showToast } = vendetta.ui.toasts;
    const { findInReactTree } = vendetta.utils;

    const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
    const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow;
    const APIUtils = findByProps("getAPIBaseURL", "get");
    const OpenURL = findByProps("openUrl");

    const UserStore = findByStoreName("UserStore");
    const ChannelStore = findByStoreName("ChannelStore");
    const ChatView = findByTypeName?.("ChatView");

    const iconJump =
        getAssetIDByName("LinkIcon")
        ?? getAssetIDByName("ic_jump_to_message")
        ?? getAssetIDByName("ic_arrow_right_24px")
        ?? getAssetIDByName("ic_copy_message_link");

    const iconSuccess =
        getAssetIDByName("Check")
        ?? getAssetIDByName("CircleCheckIcon-primary")
        ?? iconJump;

    const iconError =
        getAssetIDByName("Small")
        ?? getAssetIDByName("CircleXIcon-primary")
        ?? iconJump;

    const PAGE_SIZE = 25;
    const unpatches = [];

    let commandUnregister = null;
    let mentions = [];
    let currentIndex = -1;
    let hasMore = true;
    let busy = false;
    let lastRefresh = 0;

    function logError(...args) {
        try {
            vendetta.logger?.error?.("[PingJumper]", ...args);
        } catch {
            console.error("[PingJumper]", ...args);
        }
    }

    function getCurrentUserId() {
        return String(UserStore?.getCurrentUser?.()?.id ?? "");
    }

    function normalizeMention(message) {
        if (!message?.id) return null;

        const channelId = String(message.channel_id ?? message.channelId ?? "");
        if (!channelId) return null;

        return {
            ...message,
            id: String(message.id),
            channel_id: channelId,
        };
    }

    function parseMentionResponse(response) {
        const body = response?.body ?? response;
        const raw = Array.isArray(body)
            ? body
            : Array.isArray(body?.messages)
                ? body.messages
                : Array.isArray(body?.mentions)
                    ? body.mentions
                    : [];

        return raw.map(normalizeMention).filter(Boolean);
    }

    function buildMentionQuery(beforeId) {
        const parts = [
            "limit=" + PAGE_SIZE,
            "roles=true",
            "everyone=true",
            "guilds=true",
        ];

        if (beforeId) parts.push("before=" + encodeURIComponent(beforeId));
        return parts.join("&");
    }

    async function fetchMentionPage(beforeId = null, reset = false) {
        if (!APIUtils?.get) throw new Error("Discord's mentions API module was not found");

        const response = await APIUtils.get({
            url: "/users/@me/mentions",
            query: buildMentionQuery(beforeId),
        });

        const batch = parseMentionResponse(response);

        if (reset) {
            mentions = [];
            currentIndex = -1;
            hasMore = true;
        }

        const known = new Set(mentions.map(message => message.id));
        let added = 0;

        for (const message of batch) {
            if (known.has(message.id)) continue;
            mentions.push(message);
            known.add(message.id);
            added++;
        }

        hasMore = batch.length === PAGE_SIZE && added > 0;
        lastRefresh = Date.now();
        return added;
    }

    function getGuildIdForMention(message) {
        const explicit = String(message?.guild_id ?? message?.guildId ?? "");
        if (explicit) return explicit;

        try {
            const channel = ChannelStore?.getChannel?.(message?.channel_id);
            return String(channel?.guild_id ?? channel?.guildId ?? "") || null;
        } catch {
            return null;
        }
    }

    function buildMessageURL(guildId, channelId, messageId) {
        return "https://discord.com/channels/" + (guildId || "@me") + "/" + channelId + "/" + messageId;
    }

    function openMention(message) {
        const channelId = String(message?.channel_id ?? message?.channelId ?? "");
        if (!channelId || !message?.id) throw new Error("This ping has no message location");

        const guildId = getGuildIdForMention(message);
        const target = buildMessageURL(guildId, channelId, String(message.id));

        if (OpenURL?.openUrl) {
            OpenURL.openUrl(target);
            return;
        }

        if (ReactNative?.Linking?.openURL) {
            ReactNative.Linking.openURL(target);
            return;
        }

        throw new Error("Could not open the ping message");
    }

    function showPositionToast() {
        if (currentIndex < 0 || !mentions[currentIndex]) return;
        const loaded = mentions.length;
        showToast(
            "Ping " + (currentIndex + 1) + " of " + loaded + (hasMore ? "+" : "") + " loaded",
            iconSuccess,
        );
    }

    async function ensureMentionsLoaded() {
        if (mentions.length) return true;
        await fetchMentionPage(null, true);
        return mentions.length > 0;
    }

    async function jumpToNewestPing(forceRefresh = false) {
        if (busy) return;
        busy = true;

        try {
            if (forceRefresh || !mentions.length) {
                await fetchMentionPage(null, true);
            }

            if (!mentions.length) {
                showToast("No recent pings found", iconError);
                return;
            }

            currentIndex = 0;
            openMention(mentions[currentIndex]);
            showPositionToast();
        } catch (error) {
            logError("Failed to jump to newest ping", error);
            showToast("Couldn't load pings: " + (error?.message ?? "Unknown error"), iconError);
        } finally {
            busy = false;
        }
    }

    async function jumpOlder() {
        if (busy) return;
        busy = true;

        try {
            const loaded = await ensureMentionsLoaded();
            if (!loaded) {
                showToast("No recent pings found", iconError);
                return;
            }

            if (currentIndex < 0) {
                currentIndex = 0;
                openMention(mentions[currentIndex]);
                showPositionToast();
                return;
            }

            let nextIndex = currentIndex + 1;

            if (nextIndex >= mentions.length && hasMore) {
                const oldest = mentions[mentions.length - 1];
                await fetchMentionPage(oldest?.id ?? null, false);
                nextIndex = currentIndex + 1;
            }

            if (nextIndex >= mentions.length) {
                showToast("No older pings", iconError);
                return;
            }

            currentIndex = nextIndex;
            openMention(mentions[currentIndex]);
            showPositionToast();
        } catch (error) {
            logError("Failed to jump to older ping", error);
            showToast("Couldn't load older ping: " + (error?.message ?? "Unknown error"), iconError);
        } finally {
            busy = false;
        }
    }

    async function jumpNewer() {
        if (busy) return;
        busy = true;

        try {
            const loaded = await ensureMentionsLoaded();
            if (!loaded) {
                showToast("No recent pings found", iconError);
                return;
            }

            if (currentIndex < 0) {
                currentIndex = 0;
                openMention(mentions[currentIndex]);
                showPositionToast();
                return;
            }

            if (currentIndex === 0) {
                if (Date.now() - lastRefresh > 10000) {
                    await fetchMentionPage(null, true);
                    if (mentions.length) {
                        currentIndex = 0;
                        openMention(mentions[0]);
                        showPositionToast();
                        return;
                    }
                }

                showToast("Already at your newest ping", iconJump);
                return;
            }

            currentIndex--;
            openMention(mentions[currentIndex]);
            showPositionToast();
        } catch (error) {
            logError("Failed to jump to newer ping", error);
            showToast("Couldn't load newer ping: " + (error?.message ?? "Unknown error"), iconError);
        } finally {
            busy = false;
        }
    }

    function ArrowButton({ direction, onPress, label }) {
        return React.createElement(
            ReactNative.TouchableOpacity,
            {
                activeOpacity: 0.72,
                accessibilityRole: "button",
                accessibilityLabel: label,
                onPress,
                style: {
                    width: 50,
                    height: 50,
                    borderRadius: 14,
                    backgroundColor: "rgba(30, 31, 34, 0.94)",
                    alignItems: "center",
                    justifyContent: "center",
                    marginVertical: 5,
                    elevation: 8,
                    shadowColor: "#000000",
                    shadowOpacity: 0.3,
                    shadowRadius: 5,
                    shadowOffset: { width: 0, height: 2 },
                },
            },
            React.createElement(
                ReactNative.Text,
                {
                    style: {
                        color: "#F2F3F5",
                        fontSize: 34,
                        lineHeight: 38,
                        fontWeight: "500",
                        textAlign: "center",
                    },
                },
                direction,
            ),
        );
    }

    function PingArrowOverlay() {
        return React.createElement(
            ReactNative.View,
            {
                pointerEvents: "box-none",
                style: {
                    position: "absolute",
                    right: 14,
                    bottom: 145,
                    zIndex: 9999,
                    alignItems: "center",
                },
            },
            React.createElement(ArrowButton, {
                direction: "\u2191",
                label: "Older ping",
                onPress: () => void jumpOlder(),
            }),
            React.createElement(ArrowButton, {
                direction: "\u2193",
                label: "Newer ping",
                onPress: () => void jumpNewer(),
            }),
        );
    }

    function patchChatArrows() {
        if (!ChatView?.type) return () => {};

        return after("type", ChatView, (_, rendered) => {
            try {
                return React.createElement(
                    React.Fragment,
                    null,
                    rendered,
                    React.createElement(PingArrowOverlay),
                );
            } catch (error) {
                logError("Failed to render ping arrows", error);
                return rendered;
            }
        });
    }

    function makeJumpRow() {
        if (!ActionSheetRow) return null;

        const iconProps = ActionSheetRow.Icon
            ? { icon: React.createElement(ActionSheetRow.Icon, { source: iconJump }) }
            : { iconSource: iconJump };

        return React.createElement(ActionSheetRow, {
            label: "Jump to Latest Ping",
            ...iconProps,
            onPress: () => {
                LazyActionSheet?.hideActionSheet?.();
                void jumpToNewestPing(true);
            },
        });
    }

    function patchMessageActionSheet() {
        if (!LazyActionSheet?.openLazy || !ActionSheetRow) return () => {};

        const nested = [];

        const unpatchOpen = before("openLazy", LazyActionSheet, ([componentPromise, sheetName, args]) => {
            if (sheetName !== "MessageLongPressActionSheet" || !args?.message) return;

            Promise.resolve(componentPromise).then(module => {
                if (!module?.default) return;

                const unpatchSheet = after("default", module, (_, component) => {
                    try {
                        React.useEffect?.(() => () => {
                            try { unpatchSheet(); } catch {}
                        }, []);

                        let buttons = findInReactTree(component, node =>
                            Array.isArray(node)
                            && node.some(child => child?.type === ActionSheetRow || child?.type?.name === "ActionSheetRow")
                        );

                        if (!buttons?.push) {
                            const groups = findInReactTree(component, node =>
                                Array.isArray(node)
                                && node.some(child => child?.type?.name === "ActionSheetRowGroup")
                            );

                            if (Array.isArray(groups)) {
                                for (const group of groups) {
                                    const candidate = findInReactTree(group, node =>
                                        Array.isArray(node)
                                        && node.some(child => child?.type === ActionSheetRow || child?.type?.name === "ActionSheetRow")
                                    );

                                    if (candidate?.push) {
                                        buttons = candidate;
                                        break;
                                    }
                                }
                            }
                        }

                        if (!buttons?.push) return;
                        if (buttons.some(child => child?.props?.label === "Jump to Latest Ping")) return;

                        const row = makeJumpRow();
                        if (!row) return;

                        const copyLinkIndex = buttons.findIndex(child => child?.props?.label === "Copy Message Link");
                        const position = copyLinkIndex >= 0 ? copyLinkIndex : Math.max(0, buttons.length - 1);
                        buttons.splice(position, 0, row);
                    } catch (error) {
                        logError("Failed to add message action", error);
                    }
                });

                nested.push(unpatchSheet);
            }).catch(error => logError("Failed to patch message action sheet", error));
        });

        nested.push(unpatchOpen);

        return () => {
            for (const unpatch of nested.splice(0).reverse()) {
                try { unpatch?.(); } catch {}
            }
        };
    }

    function registerCommandIfAvailable() {
        const registerCommand = vendetta.commands?.registerCommand;
        if (typeof registerCommand !== "function") return null;

        try {
            return registerCommand({
                name: "lastping",
                displayName: "lastping",
                description: "Jump to your newest Discord ping",
                displayDescription: "Jump to your newest Discord ping",
                options: [],
                execute: async () => {
                    await jumpToNewestPing(true);
                    return null;
                },
                applicationId: "-1",
                inputType: 1,
                type: 1,
            });
        } catch (error) {
            logError("Could not register /lastping", error);
            return null;
        }
    }

    function onLoad() {
        if (!UserStore || !APIUtils?.get) {
            throw new Error("PingJumper: required Discord modules were not found on this build");
        }

        if (ChatView?.type) unpatches.push(patchChatArrows());
        if (LazyActionSheet && ActionSheetRow) unpatches.push(patchMessageActionSheet());
        commandUnregister = registerCommandIfAvailable();

        showToast(
            ChatView?.type
                ? "PingJumper enabled - use \u2191 / \u2193 in chat"
                : "PingJumper enabled - use /lastping or the message menu",
            iconJump,
        );
    }

    function onUnload() {
        try {
            commandUnregister?.();
        } catch {}
        commandUnregister = null;

        for (const unpatch of unpatches.splice(0).reverse()) {
            try { unpatch?.(); } catch (error) { logError("Failed to unpatch", error); }
        }

        mentions = [];
        currentIndex = -1;
        hasMore = true;
        busy = false;
    }

    return { onLoad, onUnload };
})()
