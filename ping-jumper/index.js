(() => {
    "use strict";

    // PingJumper for Revenge / Vendetta-compatible Discord mobile clients.
    // Long-press any message -> "Jump to Last Ping", or use /lastping when
    // the client exposes plugin command registration.

    const { findByProps, findByStoreName } = vendetta.metro;
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
    const MessageStore = findByStoreName("MessageStore");

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

    const unpatches = [];
    let commandUnregister = null;
    let busy = false;

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

    function getGuildId(channelId, message) {
        return String(
            message?.guild_id
            ?? message?.guildId
            ?? ChannelStore?.getChannel?.(channelId)?.guild_id
            ?? ChannelStore?.getChannel?.(channelId)?.guildId
            ?? ""
        ) || null;
    }

    function isDirectPing(message, userId) {
        if (!message || !userId) return false;
        const authorId = String(message?.author?.id ?? message?.author_id ?? "");
        if (authorId && authorId === userId) return false;

        const mentions = Array.isArray(message?.mentions) ? message.mentions : [];
        return mentions.some(mention => String(mention?.id ?? mention) === userId);
    }

    function timestampOf(message) {
        const raw = message?.timestamp ?? message?.edited_timestamp ?? message?.editedTimestamp;
        if (raw instanceof Date) return raw.getTime();
        const parsed = Date.parse(String(raw ?? ""));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function normalizeMessage(message, fallbackChannelId) {
        if (!message?.id) return null;
        return {
            ...message,
            channel_id: String(message.channel_id ?? message.channelId ?? fallbackChannelId ?? ""),
        };
    }

    function extractSearchHit(body, userId, fallbackChannelId) {
        const groups = body?.messages;
        if (!Array.isArray(groups)) return null;

        for (const group of groups) {
            const entries = Array.isArray(group) ? group : [group];
            const exact = entries
                .map(message => normalizeMessage(message, fallbackChannelId))
                .filter(Boolean)
                .find(message => isDirectPing(message, userId));
            if (exact) return exact;
        }

        return null;
    }

    function getLocalMessages(channelId) {
        try {
            const collection = MessageStore?.getMessages?.(channelId);
            if (!collection) return [];

            if (Array.isArray(collection)) return collection;

            const array = collection.toArray?.();
            if (Array.isArray(array)) return array;

            if (Array.isArray(collection._array)) return collection._array;

            const map = collection._map ?? collection._messages ?? collection.messages;
            if (map instanceof Map) return Array.from(map.values());
            if (map && typeof map === "object") return Object.values(map);

            return [];
        } catch {
            return [];
        }
    }

    function findLocalPing(channelId, userId) {
        return getLocalMessages(channelId)
            .map(message => normalizeMessage(message, channelId))
            .filter(message => message && isDirectPing(message, userId))
            .sort((a, b) => timestampOf(b) - timestampOf(a))[0] ?? null;
    }

    async function searchLatestPing(channelId, guildId) {
        const userId = getCurrentUserId();
        if (!userId) throw new Error("Could not identify your Discord account");

        if (APIUtils?.get) {
            try {
                const request = guildId
                    ? {
                        url: `/guilds/${guildId}/messages/search`,
                        query: `include_nsfw=true&mentions=${encodeURIComponent(userId)}&sort_by=timestamp&sort_order=desc&offset=0`,
                    }
                    : {
                        url: `/channels/${channelId}/messages/search`,
                        query: `mentions=${encodeURIComponent(userId)}&sort_by=timestamp&sort_order=desc&offset=0`,
                    };

                const response = await APIUtils.get(request);
                const hit = extractSearchHit(response?.body ?? response, userId, channelId);
                if (hit) return hit;
            } catch (error) {
                logError("Discord search failed, falling back to loaded messages", error);
            }
        }

        // Search the currently loaded channel as a fallback. This still makes the
        // plugin useful in DMs or on builds where Discord search is unavailable.
        const local = findLocalPing(channelId, userId);
        if (local) return local;

        return null;
    }

    function buildMessageURL(guildId, channelId, messageId) {
        return `https://discord.com/channels/${guildId || "@me"}/${channelId}/${messageId}`;
    }

    function openMessage(message, fallbackGuildId, fallbackChannelId) {
        const channelId = String(message?.channel_id ?? message?.channelId ?? fallbackChannelId ?? "");
        if (!channelId || !message?.id) throw new Error("The ping message has no channel or message ID");

        const guildId =
            String(message?.guild_id ?? message?.guildId ?? fallbackGuildId ?? "") || null;

        const target = buildMessageURL(guildId, channelId, String(message.id));

        if (OpenURL?.openUrl) {
            OpenURL.openUrl(target);
            return;
        }

        if (ReactNative?.Linking?.openURL) {
            ReactNative.Linking.openURL(target);
            return;
        }

        throw new Error("Could not open the target message");
    }

    async function jumpToLastPing(channelId, guildId) {
        if (busy) {
            showToast("Already looking for your last ping…", iconJump);
            return;
        }

        busy = true;
        try {
            const hit = await searchLatestPing(channelId, guildId);
            if (!hit) {
                showToast("No recent direct ping found", iconError);
                return;
            }

            openMessage(hit, guildId, channelId);
            showToast("Jumping to your last ping", iconSuccess);
        } catch (error) {
            logError("Jump failed", error);
            showToast(`Couldn't jump to ping: ${error?.message ?? "Unknown error"}`, iconError);
        } finally {
            busy = false;
        }
    }

    function makeJumpRow(message) {
        if (!ActionSheetRow || !message?.channel_id) return null;

        const channelId = String(message.channel_id);
        const guildId = getGuildId(channelId, message);

        const iconProps = ActionSheetRow.Icon
            ? {
                icon: React.createElement(ActionSheetRow.Icon, { source: iconJump }),
            }
            : {
                iconSource: iconJump,
            };

        return React.createElement(ActionSheetRow, {
            label: "Jump to Last Ping",
            ...iconProps,
            onPress: () => {
                LazyActionSheet?.hideActionSheet?.();
                void jumpToLastPing(channelId, guildId);
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
                        if (buttons.some(child => child?.props?.label === "Jump to Last Ping")) return;

                        const row = makeJumpRow(args.message);
                        if (!row) return;

                        const copyLinkIndex = buttons.findIndex(child =>
                            child?.props?.iconSource === iconJump
                            || child?.props?.label === "Copy Message Link"
                        );
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
                description: "Jump to the latest message that directly pinged you",
                displayDescription: "Jump to the latest message that directly pinged you",
                options: [],
                execute: async (_args, ctx) => {
                    const channelId = String(ctx?.channel?.id ?? "");
                    if (!channelId) {
                        showToast("Couldn't determine the current channel", iconError);
                        return null;
                    }

                    const guildId = String(
                        ctx?.guild?.id
                        ?? ctx?.channel?.guild_id
                        ?? ctx?.channel?.guildId
                        ?? ""
                    ) || null;

                    await jumpToLastPing(channelId, guildId);
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
        if (!LazyActionSheet || !ActionSheetRow || !UserStore) {
            throw new Error("PingJumper: required Discord modules were not found on this build");
        }

        unpatches.push(patchMessageActionSheet());
        commandUnregister = registerCommandIfAvailable();
        showToast("PingJumper enabled", iconJump);
    }

    function onUnload() {
        try {
            commandUnregister?.();
        } catch {}
        commandUnregister = null;

        for (const unpatch of unpatches.splice(0).reverse()) {
            try { unpatch?.(); } catch (error) { logError("Failed to unpatch", error); }
        }
    }

    return { onLoad, onUnload };
})()
