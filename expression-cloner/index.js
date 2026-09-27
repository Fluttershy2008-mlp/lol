(() => {
    "use strict";

    // ExpressionCloner for Revenge / Vendetta-compatible mobile clients.
    // Ported from Vencord's ExpressionCloner behavior and adapted to the
    // mobile action-sheet patterns used by Stealmoji.

    const { find, findByProps, findByStoreName } = vendetta.metro;
    const { React, ReactNative, constants, FluxDispatcher } = vendetta.metro.common;
    const { before, after } = vendetta.patcher;
    const { getAssetIDByName } = vendetta.ui.assets;
    const { showToast } = vendetta.ui.toasts;
    const { showInputAlert } = vendetta.ui.alerts;
    const { findInReactTree } = vendetta.utils;
    const { Forms, General, ErrorBoundary } = vendetta.ui.components;

    const { FormRow, FormIcon, FormDivider } = Forms;
    const { TouchableOpacity } = General;

    const LazyActionSheet = findByProps("openLazy", "hideActionSheet") ?? findByProps("hideActionSheet");
    const ActionSheet = findByProps("ActionSheet")?.ActionSheet ?? find(m => m?.render?.name === "ActionSheet");
    const ActionSheetTitleHeader = findByProps("ActionSheetTitleHeader")?.ActionSheetTitleHeader
        ?? findByProps("BottomSheetTitleHeader")?.BottomSheetTitleHeader;
    const ActionSheetCloseButton = findByProps("ActionSheetCloseButton")?.ActionSheetCloseButton;
    const BottomSheetFlatList = findByProps("BottomSheetScrollView")?.BottomSheetFlatList
        ?? ReactNative.FlatList;
    const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow;
    const Button = findByProps("TableRow", "Button")?.Button;

    const GuildStore = findByStoreName("GuildStore");
    const PermissionStore = findByStoreName("PermissionStore");
    const EmojiStore = findByStoreName("EmojiStore");
    const StickerStore = findByStoreName("StickersStore") ?? findByStoreName("StickerStore");
    const UserStore = findByStoreName("UserStore");

    const EmojiActions = findByProps("uploadEmoji");
    const StickerActions = findByProps("fetchSticker", "createGuildSticker")
        ?? findByProps("createGuildSticker", "updateGuildSticker");
    const EmojiSlotModule = findByProps("getMaxEmojiSlots");
    const Surrogates = findByProps("convertSurrogateToName");
    const GuildIconModule = findByProps("GuildIconSizes");
    const GuildIcon = GuildIconModule?.default;
    const GuildIconSizes = GuildIconModule?.GuildIconSizes;

    const iconAdd = getAssetIDByName("ic_add_24px") ?? getAssetIDByName("CirclePlusIcon-primary");
    const iconEmoji = getAssetIDByName("ic_emoji_24px") ?? getAssetIDByName("EmojiIcon");
    const iconSticker = getAssetIDByName("ic_sticker_24px") ?? getAssetIDByName("StickerIcon");
    const iconSuccess = getAssetIDByName("Check") ?? getAssetIDByName("CircleCheckIcon-primary");
    const iconError = getAssetIDByName("Small") ?? getAssetIDByName("CircleXIcon-primary");

    const MAX_EMOJI_BYTES = 256 * 1024;
    const MAX_STICKER_BYTES = 512 * 1024;
    const STICKER_LIMITS = { 0: 5, 1: 15, 2: 30, 3: 60 };
    const unpatches = [];

    function logError(...args) {
        try { vendetta.logger?.error?.("[ExpressionCloner]", ...args); }
        catch { console.error("[ExpressionCloner]", ...args); }
    }

    function normalizeName(name, type) {
        let out = String(name ?? (type === "Emoji" ? "emoji" : "sticker"));
        if (type === "Emoji") {
            out = out.replace(/^:+|:+$/g, "").split("~")[0].replace(/[^A-Za-z0-9_]/g, "_");
            if (out.length < 2) out = `emoji_${out}`;
            return out.slice(0, 32);
        }
        out = out.trim().replace(/[\r\n\t]/g, " ");
        if (out.length < 2) out = `sticker_${out}`;
        return out.slice(0, 30);
    }

    function validateName(name, type) {
        const value = String(name ?? "").trim();
        if (type === "Emoji") return /^[A-Za-z0-9_]{2,32}$/.test(value);
        return value.length >= 2 && value.length <= 30;
    }

    function dataUrlFromBlob(blob) {
        return new Promise((resolve, reject) => {
            try {
                const reader = new FileReader();
                reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
                reader.onloadend = () => resolve(String(reader.result));
                reader.readAsDataURL(blob);
            } catch (e) {
                reject(e);
            }
        });
    }

    function emojiUrl(emoji, size) {
        const ext = emoji.animated ? "gif" : "webp";
        return `https://cdn.discordapp.com/emojis/${emoji.id}.${ext}?size=${size}&quality=lossless`;
    }

    function stickerExt(sticker) {
        const format = Number(sticker.format_type ?? sticker.formatType ?? sticker.format ?? 1);
        if (format === 4) return "gif";
        if (format === 3) return "json";
        return "png";
    }

    function stickerMime(sticker) {
        return stickerExt(sticker) === "gif" ? "image/gif" : "image/png";
    }

    function stickerUrl(sticker, size) {
        const ext = stickerExt(sticker);
        return `https://media.discordapp.net/stickers/${sticker.id}.${ext}?size=${size}&lossless=true`;
    }

    async function fetchCapped(type, item) {
        const max = type === "Sticker" ? MAX_STICKER_BYTES : MAX_EMOJI_BYTES;
        let lastError;

        for (let size = 4096; size >= 16; size = Math.floor(size / 2)) {
            const url = type === "Sticker" ? stickerUrl(item, size) : emojiUrl(item, size);
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    lastError = new Error(`HTTP ${response.status} while fetching image`);
                    continue;
                }
                const blob = await response.blob();
                if (blob.size <= max) return blob;
            } catch (e) {
                lastError = e;
            }
        }
        throw lastError ?? new Error(`${type} is larger than Discord's upload limit`);
    }

    function canCreateExpressions(guild) {
        const currentId = UserStore?.getCurrentUser?.()?.id;
        if (guild?.ownerId === currentId || guild?.owner_id === currentId) return true;
        try {
            return Boolean(PermissionStore?.can?.(constants.Permissions.CREATE_GUILD_EXPRESSIONS, guild));
        } catch {
            return false;
        }
    }

    function emojiSlotsAvailable(guild, item) {
        try {
            const max = guild?.getMaxEmojiSlots?.() ?? EmojiSlotModule?.getMaxEmojiSlots?.(guild);
            if (!max) return true;
            const guildEntry = EmojiStore?.getGuilds?.()?.[guild.id];
            const emojis = guildEntry?.emojis ?? EmojiStore?.getGuildEmoji?.(guild.id) ?? [];
            const list = Array.isArray(emojis) ? emojis : Object.values(emojis ?? {});
            const used = list.filter(e => Boolean(e?.animated) === Boolean(item.animated) && !e?.managed).length;
            return used < max;
        } catch {
            return true;
        }
    }

    function stickerSlotsAvailable(guild) {
        try {
            let max = STICKER_LIMITS[guild?.premiumTier ?? guild?.premium_tier ?? 0] ?? 5;
            const features = guild?.features;
            const hasMore = Array.isArray(features)
                ? features.includes("MORE_STICKERS")
                : Boolean(features?.has?.("MORE_STICKERS"));
            if (hasMore && Number(guild?.premiumTier ?? guild?.premium_tier) === 3) max = 120;
            const stickers = StickerStore?.getStickersByGuildId?.(guild.id);
            return !stickers || stickers.length < max;
        } catch {
            return true;
        }
    }

    function getGuilds(type, item) {
        const guilds = Object.values(GuildStore?.getGuilds?.() ?? {});
        return guilds
            .filter(g => canCreateExpressions(g))
            .filter(g => type === "Emoji" ? emojiSlotsAvailable(g, item) : stickerSlotsAvailable(g))
            .sort((a, b) => String(a?.name ?? "").localeCompare(String(b?.name ?? "")));
    }

    function errorMessage(error) {
        const candidates = [
            error?.body?.message,
            error?.message,
            error?.text,
        ];
        for (const value of candidates) {
            if (!value) continue;
            if (typeof value === "string") {
                try { return JSON.parse(value)?.message ?? value; }
                catch { return value; }
            }
        }
        return "Unknown error";
    }

    async function cloneEmoji(guildId, emoji, customName) {
        if (!EmojiActions?.uploadEmoji) throw new Error("Discord's emoji upload module was not found");
        const blob = await fetchCapped("Emoji", emoji);
        const image = await dataUrlFromBlob(blob);
        return EmojiActions.uploadEmoji({
            guildId,
            image,
            name: customName,
            roles: undefined,
        });
    }

    async function cloneSticker(guildId, sticker, customName) {
        if (Number(sticker.format_type ?? sticker.formatType ?? sticker.format) === 3)
            throw new Error("Lottie stickers are not supported by ExpressionCloner");
        if (!StickerActions?.createGuildSticker)
            throw new Error("Discord's sticker upload module was not found");

        let full = sticker;
        try {
            if (StickerActions.fetchSticker) full = await StickerActions.fetchSticker(sticker.id) ?? sticker;
        } catch { /* message sticker data is enough as a fallback */ }

        const blob = await fetchCapped("Sticker", full);
        const dataUrl = await dataUrlFromBlob(blob);
        const tags = String(full.tags ?? full.emoji_name ?? full.emojiName ?? "sticker").trim() || "sticker";
        const description = String(full.description ?? "").slice(0, 100);
        const mimeType = stickerMime(full);

        // Discord mobile's native action creator normally uploads a local URI.
        // A data URI works on many React Native builds. If it does not, retry the
        // action creator through its web/FormData path, which uses the same auth.
        try {
            return await StickerActions.createGuildSticker({
                guildId,
                name: customName,
                tags,
                description,
                uri: dataUrl,
                mimeType,
                platform: "mobile",
                originalMd5: null,
            });
        } catch (mobileError) {
            try {
                const form = new FormData();
                form.append("name", customName);
                form.append("tags", tags);
                form.append("description", description);
                form.append("file", blob, `${customName}.${stickerExt(full)}`);
                return await StickerActions.createGuildSticker({
                    guildId,
                    body: form,
                    platform: "web",
                });
            } catch (webError) {
                webError.cause ??= mobileError;
                throw webError;
            }
        }
    }

    async function doClone(guild, type, item, customName) {
        try {
            if (type === "Emoji") await cloneEmoji(guild.id, item, customName);
            else await cloneSticker(guild.id, item, customName);
            showToast(`Cloned ${customName} to ${guild.name}`, iconSuccess);
        } catch (e) {
            logError("Clone failed", e);
            showToast(`Clone failed: ${errorMessage(e)}`, iconError);
        }
    }

    function askNameAndClone(guild, type, item) {
        const initialValue = normalizeName(item.name ?? item.alt, type);
        if (!showInputAlert) {
            doClone(guild, type, item, initialValue);
            return;
        }

        showInputAlert({
            title: `${type} name`,
            initialValue,
            placeholder: type === "Emoji" ? "my_emoji" : "My sticker",
            confirmText: `Clone to ${guild.name}`,
            cancelText: "Cancel",
            onConfirm: value => {
                const name = String(value ?? "").trim();
                if (!validateName(name, type)) {
                    showToast(type === "Emoji"
                        ? "Emoji names must be 2–32 characters using letters, numbers, or underscores"
                        : "Sticker names must be 2–30 characters",
                    iconError);
                    return;
                }
                void doClone(guild, type, item, name);
            },
        });
    }

    function GuildRow({ guild, type, item }) {
        const slotsAvailable = type === "Emoji" ? emojiSlotsAvailable(guild, item) : stickerSlotsAvailable(guild);
        const leading = GuildIcon
            ? React.createElement(GuildIcon, {
                guild,
                size: GuildIconSizes?.MEDIUM,
                animate: false,
            })
            : React.createElement(FormIcon, { source: type === "Emoji" ? iconEmoji : iconSticker });

        return React.createElement(FormRow, {
            leading,
            disabled: !slotsAvailable,
            label: guild.name,
            subLabel: slotsAvailable ? undefined : `No ${type.toLowerCase()} slots available`,
            trailing: React.createElement(FormIcon, { style: { opacity: 1 }, source: iconAdd }),
            onPress: () => {
                LazyActionSheet?.hideActionSheet?.();
                askNameAndClone(guild, type, item);
            },
        });
    }

    function ServerPicker({ type, item }) {
        const guilds = getGuilds(type, item);
        const image = type === "Emoji" ? emojiUrl(item, 128) : stickerUrl(item, 128);

        const header = ActionSheetTitleHeader
            ? React.createElement(ActionSheetTitleHeader, {
                title: `Clone ${normalizeName(item.name ?? item.alt, type)}`,
                leading: React.createElement(FormIcon, {
                    style: { marginRight: 12, opacity: 1 },
                    source: { uri: image },
                    disableColor: true,
                }),
                trailing: ActionSheetCloseButton
                    ? React.createElement(ActionSheetCloseButton, { onPress: () => LazyActionSheet?.hideActionSheet?.() })
                    : undefined,
            })
            : null;

        const list = React.createElement(BottomSheetFlatList, {
            style: { flex: 1 },
            contentContainerStyle: { paddingBottom: 24 },
            data: guilds,
            renderItem: ({ item: guild }) => React.createElement(GuildRow, { guild, type, item }),
            ItemSeparatorComponent: FormDivider,
            keyExtractor: guild => guild.id,
            ListEmptyComponent: React.createElement(FormRow, {
                label: "No eligible servers",
                subLabel: "You need permission to create expressions and a free slot.",
            }),
        });

        return React.createElement(React.Fragment, null, header, list);
    }

    function openServerPicker(type, item) {
        if (!LazyActionSheet?.openLazy || !ActionSheet) {
            showToast("ExpressionCloner could not open the server picker on this Discord build", iconError);
            return;
        }
        const body = ErrorBoundary
            ? React.createElement(ErrorBoundary, null, React.createElement(ServerPicker, { type, item }))
            : React.createElement(ServerPicker, { type, item });
        const element = React.createElement(ActionSheet, { scrollable: true }, body);
        LazyActionSheet.openLazy(Promise.resolve({ default: () => element }), "ExpressionClonerServerPicker");
    }

    function emojiFromNode(emojiNode) {
        if (!emojiNode?.id) return null;
        const src = String(emojiNode.src ?? "");
        return {
            id: String(emojiNode.id),
            name: normalizeName(emojiNode.alt ?? emojiNode.name ?? "emoji", "Emoji"),
            animated: Boolean(emojiNode.animated) || /\.gif(?:\?|$)/i.test(src) || /[?&]animated=true/i.test(src),
            src,
        };
    }

    function cloneButton(emojiNode) {
        const emoji = emojiFromNode(emojiNode);
        if (!emoji || !Button) return null;
        return React.createElement(Button, {
            color: Button.Colors?.BRAND,
            text: "Clone Emoji",
            size: Button.Sizes?.SMALL,
            onPress: () => {
                LazyActionSheet?.hideActionSheet?.();
                openServerPicker("Emoji", emoji);
            },
            style: { marginTop: ReactNative.Platform.select({ android: 12, default: 16 }) },
        });
    }

    function patchMessageEmojiActionSheet() {
        const legacy = findByProps("GuildDetails");
        const patches = [];

        const patchSheet = (method, sheetModule, once = false) => {
            if (!sheetModule?.[method]) return () => {};
            const unpatch = after(method, sheetModule, ([{ emojiNode } = {}], res) => {
                React.useEffect?.(() => () => { if (once) unpatch(); }, []);
                if (!emojiNode?.id) return;
                const view = res?.props?.children?.props?.children;
                if (!view?.type) return;

                const unpatchView = after("type", view, (_, component) => {
                    React.useEffect?.(() => unpatchView, []);
                    const isButton = c => c?.type?.name === "Button" || c?.type === Button;
                    const container = findInReactTree(component, c => c?.find?.(isButton));
                    const node = cloneButton(emojiNode);
                    if (!node) return;
                    if (container) {
                        const i = container.findLastIndex?.(isButton) ?? container.length - 1;
                        container.splice(Math.max(0, i + 1), 0, node);
                    } else {
                        component?.props?.children?.push?.(node);
                    }
                });
                patches.push(unpatchView);
            });
            return unpatch;
        };

        if (legacy?.default) {
            patches.push(patchSheet("default", legacy));
        } else if (LazyActionSheet?.openLazy) {
            const unpatchLazy = before("openLazy", LazyActionSheet, ([lazySheet, name]) => {
                if (name !== "MessageEmojiActionSheet") return;
                Promise.resolve(lazySheet).then(module => patches.push(patchSheet("default", module, true)));
            });
            patches.push(unpatchLazy);
        }

        return () => patches.splice(0).reverse().forEach(p => { try { p?.(); } catch {} });
    }

    function openEmojiActionSheet(emoji) {
        if (!emoji?.id) return;
        try {
            const Handlers = findByProps("MessagesHandlers")?.MessagesHandlers;
            if (!Handlers) return openServerPicker("Emoji", {
                id: emoji.id,
                name: normalizeName(emoji.name, "Emoji"),
                animated: Boolean(emoji.animated),
            });
            const instance = new Handlers(() => {});
            instance.isModalOrActionsheetObstructing = () => LazyActionSheet?.hideActionSheet?.();
            instance.handleTapEmoji({
                nativeEvent: {
                    node: {
                        id: emoji.id,
                        alt: emoji.name,
                        src: emojiUrl({ id: emoji.id, animated: Boolean(emoji.animated) }, 128),
                    },
                },
            });
        } catch (e) {
            logError("Failed to open emoji action sheet", e);
            openServerPicker("Emoji", {
                id: emoji.id,
                name: normalizeName(emoji.name, "Emoji"),
                animated: Boolean(emoji.animated),
            });
        }
    }

    function patchReactionLongPress() {
        if (!LazyActionSheet?.openLazy || !TouchableOpacity) return () => {};
        const patches = [];
        const unpatchLazy = before("openLazy", LazyActionSheet, ([lazySheet, name]) => {
            if (name !== "MessageReactions") return;
            Promise.resolve(lazySheet).then(module => {
                const unpatchSheet = after("default", module, (_, sheet) => {
                    React.useEffect?.(() => unpatchSheet, []);
                    const child = sheet?.props?.children;
                    if (!child?.type) return;
                    const unpatchView = after("type", child, (_, view) => {
                        React.useEffect?.(() => unpatchView, []);
                        if (!view?.props?.header) return;
                        const unpatchHeader = after("type", view.props.header, (_, header) => {
                            React.useEffect?.(() => unpatchHeader, []);
                            const row = findInReactTree(header, c => c?.props?.tabs?.length);
                            if (!row) return;
                            const { tabs, onSelect } = row.props;
                            row.props.tabs = tabs.map((tab, i) => {
                                const reaction = tab?.props?.reaction?.emoji;
                                if (!reaction?.id) return tab;
                                return React.createElement(TouchableOpacity, {
                                    onPress: () => onSelect(tab.props.index ?? i),
                                    onLongPress: () => openEmojiActionSheet(reaction),
                                }, tab);
                            });
                        });
                        patches.push(unpatchHeader);
                    });
                    patches.push(unpatchView);
                });
                patches.push(unpatchSheet);
            });
        });
        patches.push(unpatchLazy);
        return () => patches.splice(0).reverse().forEach(p => { try { p?.(); } catch {} });
    }

    function patchMessageStickerActionSheet() {
        if (!LazyActionSheet?.openLazy || !ActionSheetRow) return () => {};
        const patches = [];
        const unpatchLazy = before("openLazy", LazyActionSheet, ([lazySheet, name, args]) => {
            if (name !== "MessageLongPressActionSheet") return;
            const message = args?.message;
            const items = message?.stickerItems ?? message?.stickers ?? [];
            const stickers = Array.isArray(items)
                ? items.filter(s => s?.id && Number(s.format_type ?? s.formatType ?? s.format) !== 3)
                : [];
            if (!stickers.length) return;

            Promise.resolve(lazySheet).then(module => {
                const unpatchSheet = after("default", module, (_, component) => {
                    React.useEffect?.(() => unpatchSheet, []);
                    let buttons = findInReactTree(component, c => c?.some?.(child =>
                        child?.type?.name === "ButtonRow" || child?.type?.name === "ActionSheetRow" || child?.type === ActionSheetRow
                    ));
                    if (!buttons?.push) return;

                    for (const sticker of stickers) {
                        const label = stickers.length === 1 ? "Clone Sticker" : `Clone Sticker: ${sticker.name ?? sticker.id}`;
                        buttons.push(React.createElement(ActionSheetRow, {
                            label,
                            icon: ActionSheetRow.Icon
                                ? React.createElement(ActionSheetRow.Icon, { source: iconSticker })
                                : undefined,
                            iconSource: !ActionSheetRow.Icon ? iconSticker : undefined,
                            onPress: () => {
                                LazyActionSheet?.hideActionSheet?.();
                                openServerPicker("Sticker", {
                                    ...sticker,
                                    name: normalizeName(sticker.name ?? "sticker", "Sticker"),
                                });
                            },
                        }));
                    }
                });
                patches.push(unpatchSheet);
            });
        });
        patches.push(unpatchLazy);
        return () => patches.splice(0).reverse().forEach(p => { try { p?.(); } catch {} });
    }

    function onLoad() {
        if (!LazyActionSheet || !GuildStore || !PermissionStore)
            throw new Error("ExpressionCloner: required Discord modules were not found on this build");

        unpatches.push(patchMessageEmojiActionSheet());
        unpatches.push(patchReactionLongPress());
        unpatches.push(patchMessageStickerActionSheet());
        showToast("ExpressionCloner enabled", iconEmoji);
    }

    function onUnload() {
        for (const unpatch of unpatches.splice(0).reverse()) {
            try { unpatch?.(); } catch (e) { logError("Failed to unpatch", e); }
        }
    }

    return { onLoad, onUnload };
})()
