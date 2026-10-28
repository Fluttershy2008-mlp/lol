(() => {
// SPDX-License-Identifier: CC0-1.0
// Shared by the separately installable Revenge bundles; no global API changes.
function withRevengeCompatibility(api, factory, pluginName) {
    var active = true;
    var generation = 0;
    var disposers = new Set();
    var warnings = new Set();
    var delayKey = Symbol.for('bunny.api.patcher.delay');
    var raw = api.patcher;
    function warn(message, error) {
        if (warnings.has(message)) return;
        warnings.add(message);
        try { api.logger?.warn?.('[' + pluginName + '] ' + message, error); } catch (_) {}
    }
    function clear() {
        active = false;
        generation++;
        Array.from(disposers).reverse().forEach(function (dispose) { dispose(); });
    }
    function patchKind(kind) {
        function patch(method, parent, callback, once) {
            var epoch = generation;
            var cancelled = false;
            var unpatch;
            var unsubscribe;
            var uiPatch = method === 'render' || method === 'type' || method === 'default';
            function dispose() {
                if (cancelled) return;
                cancelled = true;
                disposers.delete(dispose);
                try { unsubscribe?.(); } catch (error) { warn('Could not cancel a module subscription.', error); }
                try { unpatch?.(); } catch (error) { warn('Could not remove a ' + method + ' patch.', error); }
            }
            if (!active) return dispose;
            disposers.add(dispose);
            function install(target) {
                if (cancelled || !active || epoch !== generation) return;
                try {
                    var owner = target;
                    var key = method;
                    // React memo/forwardRef exports are objects, not functions.
                    // Inspect the resolved module, not just the lazy proxy.
                    for (var depth = 0; uiPatch && depth < 8; depth++) {
                        var value = owner?.[key];
                        if (value?.$$typeof === Symbol.for('react.memo')) {
                            owner = value; key = 'type';
                        } else if (value?.$$typeof === Symbol.for('react.forward_ref')) {
                            owner = value; key = 'render';
                        } else break;
                    }
                    if (uiPatch && typeof owner?.[key] !== 'function') {
                        warn('Skipped unavailable Discord component method: ' + method);
                        dispose();
                        return;
                    }
                    var remove = raw[kind](key, owner, function () {
                        if (!active || cancelled || epoch !== generation) {
                            if (kind === 'after') return arguments[1];
                            if (kind === 'instead') return arguments[1].apply(this, arguments[0]);
                            return;
                        }
                        try { return callback.apply(this, arguments); }
                        finally { if (once) dispose(); }
                    });
                    // A module can synchronously unload the plugin while installing.
                    if (cancelled || !active || epoch !== generation) remove?.();
                    else unpatch = remove;
                } catch (error) {
                    dispose();
                    // Required data/action patches must still fail visibly.
                    // Only optional UI methods can safely be skipped.
                    if (!uiPatch) throw error;
                    warn('Skipped incompatible Discord component patch: ' + method, error);
                }
            }
            try {
                var delay = parent?.[delayKey];
                if (typeof delay === 'function') {
                    var cancel = delay.call(parent, function (target) {
                        try { install(target); }
                        catch (error) {
                            // The caller is now Discord's module loader, outside
                            // the plugin loader's onLoad error boundary.
                            warn('Deferred Discord method is unavailable: ' + method, error);
                        }
                    });
                    if (typeof cancel === 'function') {
                        if (cancelled) cancel();
                        else unsubscribe = cancel;
                    }
                } else install(parent);
            } catch (error) {
                dispose();
                if (!uiPatch) throw error;
                warn('Could not resolve Discord component: ' + method, error);
            }
            return dispose;
        }
        patch.await = function (method, promise, callback, once) {
            var epoch = generation;
            var cancelled = false;
            var remove;
            function dispose() {
                if (cancelled) return;
                cancelled = true;
                disposers.delete(dispose);
                remove?.();
            }
            if (!active) return dispose;
            disposers.add(dispose);
            Promise.resolve(promise).then(function (target) {
                if (!cancelled && active && epoch === generation) remove = patch(method, target, callback, once);
            }).catch(function (error) {
                warn('Deferred patch failed: ' + method, error);
                dispose();
            });
            return dispose;
        };
        return patch;
    }
    var guardedPatcher;
    function currentPatcher() {
        if (!guardedPatcher || raw !== api.patcher) {
            raw = api.patcher;
            guardedPatcher = Object.create(raw || null);
            ['before', 'after', 'instead'].forEach(function (kind) {
                if (typeof raw?.[kind] === 'function') Object.defineProperty(guardedPatcher, kind, { value: patchKind(kind), enumerable: true });
            });
        }
        return guardedPatcher;
    }
    var localAPI = Object.create(api);
    Object.defineProperty(localAPI, 'patcher', { get: currentPatcher, enumerable: true });
    // Discord's legacy JS toast bridge can queue a broken ToastContainer on
    // newer Android builds (useToastContainer reads .position of undefined).
    // Keep this adapter per-plugin. Never change api.ui or Discord's global UI.
    function safeToast(message) {
        var label = typeof message === 'string' || typeof message === 'number'
            ? String(message)
            : String(message?.message ?? message?.text ?? '');
        if (!label) return;
        try {
            var nativeToast = api.metro?.common?.ReactNative?.ToastAndroid;
            if (typeof nativeToast?.show === 'function') {
                return nativeToast.show(label, nativeToast.SHORT ?? 0);
            }
        } catch (error) {
            warn('Native Android notification failed.', error);
        }
        warn('Notification logged because the Discord toast bridge is unsafe: ' + label);
    }
    var lastUI, lastToasts, adaptedUI;
    function currentUI() {
        var ui = api.ui;
        if (!ui?.toasts) return ui;
        if (ui !== lastUI || ui.toasts !== lastToasts) {
            lastUI = ui;
            lastToasts = ui.toasts;
            adaptedUI = Object.create(ui);
            var toasts = Object.create(ui.toasts);
            Object.defineProperty(toasts, 'showToast', { value: safeToast, enumerable: true });
            Object.defineProperty(adaptedUI, 'toasts', { value: toasts, enumerable: true });
        }
        return adaptedUI;
    }
    Object.defineProperty(localAPI, 'ui', { get: currentUI, enumerable: true });
    var plugin;
    try { plugin = factory(localAPI); }
    catch (error) { clear(); throw error; }
    if (!plugin || typeof plugin !== 'object') { clear(); throw new Error(pluginName + ': invalid plugin exports'); }
    var result = Object.assign({}, plugin);
    result.onLoad = function () {
        active = true;
        var epoch = generation;
        function failed(error) {
            if (active && epoch === generation) {
                try { result.onUnload(); } catch (cleanupError) { warn('Startup cleanup failed.', cleanupError); }
            }
            throw error;
        }
        try {
            var pending = plugin.onLoad?.apply(this, arguments);
            if (pending && typeof pending.then === 'function') return Promise.resolve(pending).catch(failed);
            return pending;
        } catch (error) {
            return failed(error);
        }
    };
    result.onUnload = function () {
        clear();
        return plugin.onUnload?.apply(this, arguments);
    };
    return result;
}

return withRevengeCompatibility(vendetta, function(vendetta) {
return (() => {
    "use strict";

    // ExpressionCloner for Revenge / Vendetta-compatible mobile clients.
    // Ported from Vencord's ExpressionCloner behavior and adapted to the
    // mobile action-sheet patterns used by Stealmoji.

    const optional = callback => { try { return callback(); } catch { return undefined; } };
    const find = (...args) => optional(() => vendetta.metro.find(...args));
    const findByProps = (...args) => optional(() => vendetta.metro.findByProps(...args));
    const findByStoreName = (...args) => optional(() => vendetta.metro.findByStoreName(...args));
    const { React, ReactNative, constants, FluxDispatcher } = vendetta.metro.common;
    const { before, after } = vendetta.patcher;
    const { getAssetIDByName } = vendetta.ui.assets;
    const { showToast } = vendetta.ui.toasts;
    const { findInReactTree } = vendetta.utils;
    const { Forms = {}, General = {}, ErrorBoundary } = vendetta.ui.components ?? {};

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

    // Discord 346+ removed the legacy FluxContainer(Alert) component that
    // vendetta.ui.alerts.showInputAlert still depends on. Use the current
    // AlertModal stack directly so opening the rename prompt cannot crash.
    const AlertManager = findByProps("openAlert", "dismissAlert");
    const AlertComponents = findByProps("AlertModal", "AlertActions");
    const AlertModal = AlertComponents?.AlertModal;
    const AlertActions = AlertComponents?.AlertActions;
    const AlertActionButton = AlertComponents?.AlertActionButton;

    const GuildStore = findByStoreName("GuildStore");
    const PermissionStore = findByStoreName("PermissionStore");
    const EmojiStore = findByStoreName("EmojiStore");
    const StickerStore = findByStoreName("StickersStore") ?? findByStoreName("StickerStore");
    const UserStore = findByStoreName("UserStore");

    const EmojiActions = findByProps("uploadEmoji");
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
    const pendingClones = new Set();
    let temporaryFileId = 0;
    let active = false, generation = 0;
    const sessionToken = () => ({ generation, account: UserStore?.getCurrentUser?.()?.id });
    const isCurrent = session => active && session.generation === generation && Boolean(session.account)
        && session.account === UserStore?.getCurrentUser?.()?.id;
    function resolveSheet(promise, callback) {
        const epoch = generation;
        return Promise.resolve(promise).then(module => {
            if (active && epoch === generation) return callback(module);
        }).catch(error => logError("Could not extend this action sheet", error));
    }

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
        return `https://media.discordapp.net/stickers/${sticker.id}.${ext}?size=${size}&lossless=true&animated=true`;
    }

    async function fetchCapped(type, item, check = () => {}) {
        const max = type === "Sticker" ? MAX_STICKER_BYTES : MAX_EMOJI_BYTES;
        let lastError;

        for (let size = 4096; size >= 16; size = Math.floor(size / 2)) {
            check();
            const url = type === "Sticker" ? stickerUrl(item, size) : emojiUrl(item, size);
            try {
                const response = await (vendetta.utils?.safeFetch ?? fetch)(url);
                check();
                if (!response.ok) {
                    lastError = new Error(`HTTP ${response.status} while fetching image`);
                    continue;
                }
                const blob = await response.blob();
                check();
                if (blob.size <= max) return blob;
            } catch (e) {
                check();
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

    async function cloneEmoji(guildId, emoji, customName, check, beforeUpload) {
        if (!EmojiActions?.uploadEmoji) throw new Error("Discord's emoji upload module was not found");
        const blob = await fetchCapped("Emoji", emoji, check);
        const image = await dataUrlFromBlob(blob);
        beforeUpload();
        return EmojiActions.uploadEmoji({
            guildId,
            image,
            name: customName,
            roles: undefined,
        });
    }

    function nativeStickerFiles() {
        const getters = [
            () => typeof valenced !== "undefined" ? valenced.discord?.native?.FileModule : undefined,
            () => typeof revenge !== "undefined" ? revenge.discord?.native?.FileModule : undefined,
            () => findByProps("writeFile", "removeFile"),
            () => ReactNative.NativeModules?.NativeFileModule,
        ];
        for (const get of getters) {
            const files = optional(get);
            if (typeof files?.writeFile === "function" && typeof files?.removeFile === "function") return files;
        }
    }

    async function cloneSticker(guildId, sticker, customName, check, beforeUpload) {
        if (Number(sticker.format_type ?? sticker.formatType ?? sticker.format) === 3)
            throw new Error("Lottie stickers are not supported by ExpressionCloner");
        // The action may load after the plugin, and no longer has to share a
        // barrel with fetchSticker/updateGuildSticker. Resolve it on each clone.
        const actions = findByProps("createGuildSticker");
        const http = actions?.createGuildSticker ? undefined : vendetta.metro.common.RestAPI
            ?? findByProps("HTTP")?.HTTP ?? findByProps("get", "post", "del");
        if (!actions?.createGuildSticker && typeof http?.post !== "function")
            throw new Error("Discord's sticker upload module was not found");

        let full = { ...sticker, ...optional(() => StickerStore?.getStickerById?.(sticker.id)), id: sticker.id };
        try {
            const fetcher = actions?.fetchSticker ? actions : findByProps("fetchSticker");
            const fetched = await fetcher?.fetchSticker?.(sticker.id);
            check();
            const data = fetched?.body ?? fetched;
            if (data?.id === sticker.id) full = { ...full, ...data };
        } catch { /* message sticker data is enough as a fallback */ }
        check();
        if (Number(full.format_type ?? full.formatType ?? full.format) === 3)
            throw new Error("Lottie stickers are not supported by ExpressionCloner");

        const blob = await fetchCapped("Sticker", full, check);
        if (!blob.size) throw new Error("The sticker image is empty.");
        const tags = (String(full.tags ?? full.emoji_name ?? full.emojiName ?? "slight_smile").trim() || "slight_smile").slice(0, 200);
        const originalDescription = String(full.description ?? "").slice(0, 100);
        const description = originalDescription.length === 1 ? "" : originalDescription;
        const mimeType = stickerMime(full);
        const form = actions?.createGuildSticker ? undefined : new FormData();
        const files = nativeStickerFiles();
        let temporary, uri;
        try {
            if (actions?.createGuildSticker || typeof form.getParts === "function") {
                const dataUrl = await dataUrlFromBlob(blob);
                check();
                if (files) {
                    const data = dataUrl.match(/^data:[^,]*;base64,([A-Za-z0-9+/=\s]+)$/)?.[1]?.replace(/\s/g, "");
                    if (!data) throw new Error("Could not read the sticker image.");
                    temporary = `expression-cloner-${Date.now()}-${++temporaryFileId}-${Math.random().toString(36).slice(2)}.${stickerExt(full)}`;
                    const path = await files.writeFile("cache", temporary, data, "base64");
                    check();
                    if (typeof path !== "string" || !path) throw new Error("Discord did not return a local sticker path.");
                    uri = /^(file|content):\/\//.test(path) ? path : "file://" + path;
                } else if (actions?.createGuildSticker) {
                    // Older compatibility clients can accept a data URI.
                    uri = dataUrl;
                } else throw new Error("Discord's image file module is unavailable on this build.");
            }

            beforeUpload();
            let result;
            // Choose one uploader before the POST. A timeout can follow a
            // successful creation, so never retry through a second uploader.
            if (actions?.createGuildSticker) {
                result = await actions.createGuildSticker({ guildId, name: customName, tags, description,
                    uri, mimeType, platform: "mobile", originalMd5: null });
            } else {
                form.append("name", customName);
                form.append("tags", tags);
                form.append("description", description);
                if (typeof form.getParts === "function") form.append("file", { uri, name: `sticker.${stickerExt(full)}`, type: mimeType });
                else form.append("file", blob, `sticker.${stickerExt(full)}`);
                result = await http.post({ url: `/guilds/${guildId}/stickers`, body: form,
                    oldFormErrors: true, failImmediatelyWhenRateLimited: true });
            }
            if (result?.ok === false || Number(result?.status) >= 400) throw result;
            const created = result?.body ?? result;
            if (!created?.id) throw new Error("Discord did not confirm the upload. Check the server's stickers before trying again.");
            check();
            if (!actions?.createGuildSticker) optional(() => FluxDispatcher?.dispatch?.({ type: "GUILD_STICKERS_CREATE_SUCCESS",
                guildId, sticker: { ...created, user: UserStore?.getCurrentUser?.() } }));
            return created;
        } finally {
            if (temporary) { try { await files.removeFile("cache", temporary); } catch {} }
        }
    }

    async function doClone(guild, type, item, customName, session) {
        if (!isCurrent(session)) return;
        const key = `${session.generation}:${session.account}:${guild.id}:${type}:${item.id}:${customName}`;
        if (pendingClones.has(key)) return;
        pendingClones.add(key);
        const check = () => { if (!isCurrent(session)) throw new Error("Clone cancelled."); };
        const beforeUpload = () => {
            check();
            const currentGuild = GuildStore?.getGuild?.(guild.id) ?? GuildStore?.getGuilds?.()?.[guild.id];
            if (!currentGuild || !canCreateExpressions(currentGuild)) throw new Error("You no longer have permission to create expressions in this server.");
            if (!(type === "Emoji" ? emojiSlotsAvailable(currentGuild, item) : stickerSlotsAvailable(currentGuild)))
                throw new Error(`This server has no free ${type.toLowerCase()} slots.`);
        };
        try {
            if (type === "Emoji") await cloneEmoji(guild.id, item, customName, check, beforeUpload);
            else await cloneSticker(guild.id, item, customName, check, beforeUpload);
            if (isCurrent(session)) showToast(`Cloned ${customName} to ${guild.name}`, iconSuccess);
        } catch (e) {
            if (!isCurrent(session)) return;
            logError("Clone failed", e);
            showToast(`Clone failed: ${errorMessage(e)}`, iconError);
        } finally { pendingClones.delete(key); }
    }

    function RenamePrompt({ guild, type, item, alertKey, session }) {
        const initialValue = normalizeName(item.name ?? item.alt, type);
        const [value, setValue] = React.useState(initialValue);
        const [error, setError] = React.useState("");
        const dark = ReactNative.Appearance?.getColorScheme?.() !== "light";

        const confirm = () => {
            if (!isCurrent(session)) return;
            const name = String(value ?? "").trim();
            if (!validateName(name, type)) {
                setError(type === "Emoji"
                    ? "Use 2–32 letters, numbers, or underscores."
                    : "Use a name between 2 and 30 characters.");
                return;
            }

            try { AlertManager?.dismissAlert?.(alertKey); } catch {}
            void doClone(guild, type, item, name, session);
        };

        const input = React.createElement(ReactNative.View, {
            style: { width: "100%", gap: 8 }
        },
            React.createElement(ReactNative.TextInput, {
                value,
                autoFocus: true,
                selectTextOnFocus: true,
                placeholder: type === "Emoji" ? "my_emoji" : "My sticker",
                placeholderTextColor: dark ? "#949ba4" : "#5c5e66",
                returnKeyType: "done",
                onChangeText: text => {
                    setValue(text);
                    if (error) setError("");
                },
                onSubmitEditing: confirm,
                style: {
                    minHeight: 44,
                    borderWidth: 1,
                    borderColor: error ? "#da373c" : (dark ? "#4e5058" : "#c4c9ce"),
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: dark ? "#f2f3f5" : "#1e1f22",
                    backgroundColor: dark ? "#1e1f22" : "#f2f3f5"
                }
            }),
            error ? React.createElement(ReactNative.Text, {
                style: { color: "#da373c", fontSize: 12 }
            }, error) : null
        );

        const primary = React.createElement(AlertActionButton, {
            text: `Clone to ${guild.name}`,
            variant: "primary",
            onPress: confirm
        });
        const cancel = React.createElement(AlertActionButton, {
            text: "Cancel",
            variant: "secondary",
            onPress: () => {
                try { AlertManager?.dismissAlert?.(alertKey); } catch {}
            }
        });

        return React.createElement(AlertModal, {
            title: `${type} name`,
            content: input,
            actions: AlertActions
                ? React.createElement(AlertActions, null, primary, cancel)
                : React.createElement(ReactNative.View, { style: { gap: 8 } }, primary, cancel)
        });
    }

    function askNameAndClone(guild, type, item, session) {
        if (!isCurrent(session)) return;
        const initialValue = normalizeName(item.name ?? item.alt, type);

        if (!AlertManager?.openAlert || !AlertModal || !AlertActionButton) {
            showToast(`Rename prompt unavailable; cloning as ${initialValue}`, iconError);
            void doClone(guild, type, item, initialValue, session);
            return;
        }

        const alertKey = `expression-cloner-${type.toLowerCase()}-${guild.id}-${item.id ?? "item"}`;
        AlertManager.openAlert(
            alertKey,
            React.createElement(RenamePrompt, { guild, type, item, alertKey, session })
        );
    }

    function GuildRow({ guild, type, item, session }) {
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
                askNameAndClone(guild, type, item, session);
            },
        });
    }

    function ServerPicker({ type, item, session }) {
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
            renderItem: ({ item: guild }) => React.createElement(GuildRow, { guild, type, item, session }),
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
        if (!active) return;
        const session = sessionToken();
        if (!LazyActionSheet?.openLazy || !ActionSheet) {
            showToast("ExpressionCloner could not open the server picker on this Discord build", iconError);
            return;
        }
        const body = ErrorBoundary
            ? React.createElement(ErrorBoundary, null, React.createElement(ServerPicker, { type, item, session }))
            : React.createElement(ServerPicker, { type, item, session });
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
                if (!emojiNode?.id) return;
                const view = res?.props?.children?.props?.children;
                if (!view?.type) return;

                const unpatchView = after("type", view, (_, component) => {
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
                }, true);
                patches.push(unpatchView);
            }, once);
            return unpatch;
        };

        if (legacy?.default) {
            patches.push(patchSheet("default", legacy));
        } else if (LazyActionSheet?.openLazy) {
            const unpatchLazy = before("openLazy", LazyActionSheet, ([lazySheet, name]) => {
                if (name !== "MessageEmojiActionSheet") return;
                resolveSheet(lazySheet, module => patches.push(patchSheet("default", module, true)));
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
            resolveSheet(lazySheet, module => {
                const unpatchSheet = after("default", module, (_, sheet) => {
                    const child = sheet?.props?.children;
                    if (!child?.type) return;
                    const unpatchView = after("type", child, (_, view) => {
                        if (!view?.props?.header) return;
                        const unpatchHeader = after("type", view.props.header, (_, header) => {
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
                        }, true);
                        patches.push(unpatchHeader);
                    }, true);
                    patches.push(unpatchView);
                }, true);
                patches.push(unpatchSheet);
            });
        });
        patches.push(unpatchLazy);
        return () => patches.splice(0).reverse().forEach(p => { try { p?.(); } catch {} });
    }


    let hookedStickerDetailModules = new WeakSet();

    function resolveStickerFromProps(props) {
        let sticker = props?.sticker ?? props?.renderableSticker ?? props?.item;
        if (!sticker?.id && sticker?.stickerId) {
            sticker = {
                ...sticker,
                id: sticker.stickerId,
                name: sticker.stickerName ?? sticker.name,
                format_type: sticker.stickerType ?? sticker.format_type,
            };
        }

        const id = sticker?.id ?? props?.stickerId ?? props?.renderableSticker?.id;
        if (id && StickerStore?.getStickerById) {
            try {
                const full = StickerStore.getStickerById(String(id));
                if (full?.id) sticker = { ...sticker, ...full };
            } catch {}
        }

        return sticker?.id ? sticker : null;
    }

    function StickerCloneButton({ sticker }) {
        if (!Button || !sticker?.id) return null;
        const format = Number(sticker.format_type ?? sticker.formatType ?? sticker.format);
        const unsupported = format === 3;

        return React.createElement(Button, {
            color: Button.Colors?.BRAND,
            text: unsupported ? "Clone Sticker (Lottie unsupported)" : "Clone Sticker",
            size: Button.Sizes?.SMALL,
            disabled: unsupported,
            onPress: () => {
                LazyActionSheet?.hideActionSheet?.();
                openServerPicker("Sticker", {
                    ...sticker,
                    name: normalizeName(sticker.name ?? "sticker", "Sticker"),
                });
            },
            style: { marginTop: ReactNative.Platform.select({ android: 12, default: 16 }) },
        });
    }

    function injectStickerDetailButton(props, result) {
        try {
            const sticker = resolveStickerFromProps(props);
            if (!sticker?.id) return;

            const key = `expression-cloner-sticker-${sticker.id}`;
            const view = result?.props?.children;
            const content = view?.props?.children;

            if (content) {
                const children = React.Children.toArray(content).slice();
                if (children.some(child => child?.key === key)) return;
                children.push(React.createElement(StickerCloneButton, { key, sticker }));
                view.props.children = children;
                return;
            }

            const isButton = child => child?.type?.name === "Button" || child?.type === Button;
            const container = findInReactTree(result, node => Array.isArray(node) && node.some?.(isButton));
            if (!container) return;
            if (container.some(child => child?.key === key)) return;

            const lastIndex = container.findLastIndex?.(isButton) ?? container.length - 1;
            container.splice(lastIndex + 1, 0,
                React.createElement(StickerCloneButton, { key, sticker })
            );
        } catch (e) {
            logError("Sticker detail injection failed", e);
        }
    }

    function hookStickerDetailModule(module) {
        if (!module || hookedStickerDetailModules.has(module)) return false;
        const sheetDefault = module.default;

        if (sheetDefault && typeof sheetDefault === "object" && typeof sheetDefault.type === "function") {
            hookedStickerDetailModules.add(module);
            const unpatch = after("type", sheetDefault, (args, result) => {
                injectStickerDetailButton(args?.[0], result);
            });
            unpatches.push(unpatch);
            return true;
        }

        if (typeof sheetDefault === "function") {
            hookedStickerDetailModules.add(module);
            const unpatch = after("default", module, (args, result) => {
                try {
                    if (result?.type && typeof result.type === "function") {
                        const innerUnpatch = after("type", result, (innerArgs, innerResult) => {
                            injectStickerDetailButton(innerArgs?.[0] ?? args?.[0], innerResult);
                        }, true);
                        unpatches.push(innerUnpatch);
                    } else {
                        injectStickerDetailButton(args?.[0], result);
                    }
                } catch (e) {
                    logError("Sticker detail sheet patch failed", e);
                }
            });
            unpatches.push(unpatch);
            return true;
        }

        return false;
    }

    function findStickerDetailModuleByPath() {
        try {
            const registry = globalThis.modules ?? globalThis.window?.modules;
            const requireFn = globalThis.__r ?? globalThis.window?.__r;
            if (!registry || !requireFn) return null;

            const entries = registry instanceof Map
                ? [...registry.entries()]
                : Object.entries(registry);

            for (const [id, factory] of entries) {
                const path = factory?.__filePath ?? factory?.definition?.__filePath;
                if (typeof path !== "string") continue;
                if (!path.endsWith("StickerDetailActionSheet.tsx") && !path.endsWith("StickerDetailActionSheet.ts")) continue;

                try {
                    const module = requireFn(Number(id));
                    const target = module?.default?.type ?? module?.default;
                    if (typeof target === "function") return module;
                } catch {}
            }
        } catch (e) {
            logError("Failed to locate sticker detail module", e);
        }
        return null;
    }

    function patchStickerDetailActionSheet() {
        const localUnpatches = [];
        let retryTimer = null;

        const tryDirect = () => {
            const module = findStickerDetailModuleByPath();
            if (!module) return false;
            return hookStickerDetailModule(module);
        };

        if (LazyActionSheet?.openLazy) {
            const unpatchLazy = before("openLazy", LazyActionSheet, ([lazySheet, name]) => {
                const key = String(name ?? "");
                if (!/sticker_detail_action_sheet|StickerDetailActionSheet/i.test(key)) return;

                resolveSheet(lazySheet, module => hookStickerDetailModule(module))
                    .catch(e => logError("Failed to patch sticker detail sheet", e));
            });
            localUnpatches.push(unpatchLazy);
        }

        if (!tryDirect()) {
            let attempts = 0;
            retryTimer = setInterval(() => {
                attempts++;
                if (tryDirect() || attempts >= 20) {
                    clearInterval(retryTimer);
                    retryTimer = null;
                }
            }, 1000);
        }

        return () => {
            if (retryTimer) clearInterval(retryTimer);
            localUnpatches.splice(0).reverse().forEach(fn => {
                try { fn?.(); } catch {}
            });
        };
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

            resolveSheet(lazySheet, module => {
                const unpatchSheet = after("default", module, (_, component) => {
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
                }, true);
                patches.push(unpatchSheet);
            });
        });
        patches.push(unpatchLazy);
        return () => patches.splice(0).reverse().forEach(p => { try { p?.(); } catch {} });
    }

    function onLoad() {
        if (active) return;
        if (!LazyActionSheet || !GuildStore || !PermissionStore)
            throw new Error("ExpressionCloner: required Discord modules were not found on this build");

        active = true;
        generation++;
        unpatches.push(patchMessageEmojiActionSheet());
        unpatches.push(patchReactionLongPress());
        unpatches.push(patchStickerDetailActionSheet());
        unpatches.push(patchMessageStickerActionSheet());
        showToast("ExpressionCloner enabled", iconEmoji);
    }

    function onUnload() {
        active = false;
        generation++;
        pendingClones.clear();
        hookedStickerDetailModules = new WeakSet();
        for (const unpatch of unpatches.splice(0).reverse()) {
            try { unpatch?.(); } catch (e) { logError("Failed to unpatch", e); }
        }
    }

    return { onLoad, onUnload };
})()
}, "ExpressionCloner");
})()
