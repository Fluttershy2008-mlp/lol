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

    // ViewIcons for Revenge / Vendetta-compatible Discord mobile clients.
    // Mobile port of the core Vencord ViewIcons behavior.

    const { findByProps, findByStoreName, findByName, findByImportedPath, getModuleWithImportedPath } = vendetta.metro;
    const { React, ReactNative } = vendetta.metro.common;
    const { before, after } = vendetta.patcher;
    const { getAssetIDByName } = vendetta.ui.assets;
    const { showToast } = vendetta.ui.toasts;
    const { findInReactTree } = vendetta.utils;

    let LazyActionSheet, ActionSheetRow, ContextMenus, MediaModal, imageIcon;
    let UserStore, UserProfileStore, GuildMemberStore, GuildStore, ChannelStore;

    function optional(resolve) {
        try { return resolve(); } catch { return undefined; }
    }

    function resolveModules() {
        LazyActionSheet = optional(() => findByProps("openLazy", "hideActionSheet"));
        ActionSheetRow = optional(() => findByProps("ActionSheetRow")?.ActionSheetRow);
        ContextMenus = optional(() => findByProps("showContextMenu"));
        MediaModal = optional(() => findByProps("openMediaModal"));
        UserStore = optional(() => findByStoreName("UserStore"));
        UserProfileStore = optional(() => findByStoreName("UserProfileStore"));
        GuildMemberStore = optional(() => findByStoreName("GuildMemberStore"));
        GuildStore = optional(() => findByStoreName("GuildStore"));
        ChannelStore = optional(() => findByStoreName("ChannelStore"));
        imageIcon = ["ImageIcon", "ic_image", "ic_image_24px", "ic_gallery_24px"]
            .map(name => optional(() => getAssetIDByName(name)))
            .find(id => id != null);
    }

    // Discord can split URL helpers between modules. Resolve each independently;
    // missing helpers must not prevent the entire plugin from starting.
    function iconUrl(name, ...args) {
        return optional(() => findByProps(name)?.[name]?.(...args));
    }

    function cdnUrl(path, hash) {
        if (!hash) return null;
        return `https://cdn.discordapp.com/${path}/${hash}.${hash.startsWith("a_") ? "gif" : "webp"}?size=4096`;
    }

    const unpatches = [];
    let serverMenuTimer, serverSizeTimer, serverRequest = 0;
    let lazyContexts = new WeakMap();
    let active = false;
    let generation = 0;

    function logError(...args) {
        try {
            vendetta.logger?.error?.("[ViewIcons]", ...args);
        } catch {
            console.error("[ViewIcons]", ...args);
        }
    }

    function toast(message) {
        try {
            showToast(message, imageIcon);
        } catch {}
    }

    function safeString(value) {
        return typeof value === "string" && value ? value : null;
    }

    function normalizeImageUrl(source, size = 4096) {
        if (!source || typeof source !== "string" || source.startsWith("data:")) return source;

        try {
            const url = new URL(source, "https://discord.com");
            if (url.pathname.startsWith("/embed/avatars/")) return url.toString();
            url.searchParams.set("size", String(size));

            // Avatar decorations are animated PNG/APNG assets. Rewriting them to GIF/WebP
            // can break the animation, so keep Discord's PNG endpoint intact.
            if (url.pathname.includes("/avatar-decoration-presets/")) {
                url.searchParams.set("passthrough", "true");
                return url.toString();
            }

            const animated =
                url.searchParams.get("animated") === "true"
                || /\/(?:a_)[^/]+\.(?:png|jpe?g|webp|gif)$/i.test(url.pathname);

            const format = animated ? "gif" : "webp";
            url.pathname = url.pathname.replace(/\.(?:png|jpe?g|webp|gif)$/i, `.${format}`);
            return url.toString();
        } catch {
            return source;
        }
    }

    function openImage({ label, url: source, width: fallbackWidth, height: fallbackHeight, server }) {
        if (!source) {
            toast(`${label} is unavailable`);
            return;
        }

        const uri = normalizeImageUrl(source, 4096);
        const session = generation;
        const request = serverRequest;
        MediaModal ??= optional(() => findByProps("openMediaModal"));

        const openInDiscord = (width, height) => {
            if (typeof MediaModal?.openMediaModal !== "function") return false;
            try {
                MediaModal.openMediaModal({
                    initialIndex: 0,
                    initialSources: [{
                        uri,
                        sourceURI: uri,
                        width: Number(width) || fallbackWidth,
                        height: Number(height) || fallbackHeight,
                    }],
                });
                return true;
            } catch (error) {
                logError("Discord media modal failed", error);
                return false;
            }
        };

        const openFallback = () => {
            try {
                if (ReactNative?.Linking?.openURL) {
                    Promise.resolve(ReactNative.Linking.openURL(uri)).catch(error => {
                        logError("Browser fallback failed", error);
                        toast(`Couldn't open ${label.toLowerCase()}`);
                    });
                    return;
                }
            } catch (error) {
                logError("Browser fallback failed", error);
            }
            toast(`Couldn't open ${label.toLowerCase()}`);
        };

        let opened = false;
        const show = (width, height) => {
            if (opened || !active || session !== generation || (server && request !== serverRequest)) return;
            opened = true;
            if (server) {
                clearTimeout(serverSizeTimer);
                serverSizeTimer = undefined;
            }
            if (!openInDiscord(width, height)) openFallback();
        };
        try {
            const Image = ReactNative?.Image;
            if (Image?.getSize && typeof MediaModal?.openMediaModal === "function") {
                if (server) {
                    // Animated or large server images can leave Android's size callback pending.
                    serverSizeTimer = setTimeout(() => show(fallbackWidth, fallbackHeight), 1500);
                }
                Image.getSize(uri, show, () => show(fallbackWidth, fallbackHeight));
                return;
            }
        } catch (error) {
            logError("Image size lookup failed", error);
        }

        show(fallbackWidth, fallbackHeight);
    }

    function defaultAvatarUrl(user) {
        const discriminator = Number(user.discriminator);
        if (Number.isInteger(discriminator) && discriminator > 0) {
            return `https://cdn.discordapp.com/embed/avatars/${discriminator % 5}.png`;
        }
        if (!/^\d+$/.test(user.id)) return null;
        const index = (BigInt(user.id) >> BigInt(22)) % BigInt(6);
        return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    }

    function getUserBannerUrl(user, guildId, displayProfile, memberProfile, globalProfile) {
        // Keep the original profile objects so Discord's URL methods retain their receiver.
        const displayed = optional(() => displayProfile?.getBannerURL?.({ canAnimate: true, size: 2048 }));
        if (displayed) return displayed;
        const memberBanner = safeString(displayProfile?._guildMemberProfile?.banner)
            ?? safeString(memberProfile?.banner);
        if (guildId && memberBanner) return cdnUrl(`guilds/${guildId}/users/${user.id}/banners`, memberBanner);

        const globalUrl = optional(() => globalProfile?.getBannerURL?.({ canAnimate: true, size: 2048 }));
        if (globalUrl) return globalUrl;
        const banner = safeString(displayProfile?.banner)
            ?? safeString(displayProfile?._userProfile?.banner)
            ?? safeString(globalProfile?.banner)
            ?? safeString(user.banner);
        if (!banner) return null;
        return iconUrl("getUserBannerURL", { id: user.id, banner, canAnimate: true, size: 2048 })
            || cdnUrl(`banners/${user.id}`, banner);
    }

    function getDecorationData(user) {
        return user?.avatarDecorationData
            ?? user?.avatar_decoration_data
            ?? user?.avatarDecoration
            ?? user?.avatar_decoration
            ?? null;
    }

    function getDecorationUrl(decoration) {
        if (!decoration) return null;

        try {
            const url = iconUrl("getAvatarDecorationURL", {
                avatarDecoration: decoration,
                avatarDecorationData: decoration,
                size: 1024,
                canAnimate: true,
            });
            if (url) return url;
        } catch {}

        const asset = safeString(decoration?.asset) ?? safeString(decoration?.hash);
        return asset
            ? `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png?size=1024&passthrough=true`
            : null;
    }

    function userTargets(user, guildId, suppliedProfile) {
        if (!user?.id) return [];
        const memberProfile = guildId && optional(() => UserProfileStore?.getGuildMemberProfile?.(user.id, guildId));
        const globalProfile = optional(() => UserProfileStore?.getUserProfile?.(user.id));
        const targets = [];

        try {
            const avatar = iconUrl("getUserAvatarURL", user, true)
                || optional(() => user.getAvatarURL?.(null, 4096, true))
                || cdnUrl(`avatars/${user.id}`, safeString(user.avatar))
                || defaultAvatarUrl(user);
            if (avatar) targets.push({ label: "Avatar", url: avatar, width: 512, height: 512 });
        } catch {}

        try {
            const banner = getUserBannerUrl(user, guildId, suppliedProfile, memberProfile, globalProfile);
            if (banner) targets.push({ label: "Banner", url: banner, width: 1024, height: 400 });
        } catch {}

        if (guildId) {
            try {
                const member = GuildMemberStore?.getMember?.(guildId, user.id);
                if (member?.avatar) {
                    const serverAvatar = iconUrl("getGuildMemberAvatarURLSimple", {
                        userId: user.id,
                        avatar: member.avatar,
                        guildId,
                        canAnimate: true,
                    }) ?? cdnUrl(`guilds/${guildId}/users/${user.id}/avatars`, safeString(member.avatar));
                    if (serverAvatar) {
                        targets.push({ label: "Server Avatar", url: serverAvatar, width: 512, height: 512 });
                    }
                }
            } catch {}
        }

        const decoration = getDecorationData(suppliedProfile) ?? getDecorationData(memberProfile)
            ?? getDecorationData(globalProfile) ?? getDecorationData(user);
        const decorationUrl = getDecorationUrl(decoration);
        if (decorationUrl) {
            targets.push({
                label: "Avatar Decoration",
                url: decorationUrl,
                width: 512,
                height: 512,
            });
        }

        return dedupeTargets(targets);
    }

    function guildTargets(guild) {
        if (!guild?.id) return [];
        const targets = [];

        const icon = cdnUrl(`icons/${guild.id}`, safeString(guild.icon));
        const banner = cdnUrl(`banners/${guild.id}`, safeString(guild.banner));
        if (icon) targets.push({ label: "Server Icon", url: icon, width: 512, height: 512, server: true });
        if (banner) targets.push({ label: "Server Banner", url: banner, width: 960, height: 540, server: true });
        return targets;
    }

    function channelTargets(channel) {
        if (!channel?.id || !channel?.icon) return [];
        try {
            const icon = iconUrl("getChannelIconURL", channel)
                ?? cdnUrl(`channel-icons/${channel.id}`, safeString(channel.icon));
            return icon ? [{ label: "Group DM Icon", url: icon, width: 512, height: 512 }] : [];
        } catch {
            return [];
        }
    }

    function dedupeTargets(targets) {
        const seen = new Set();
        return targets.filter(target => {
            if (!target?.url || seen.has(target.label)) return false;
            seen.add(target.label);
            return true;
        });
    }

    function imageAction(target, hide) {
        const session = generation;
        return () => {
            if (!active || session !== generation) return;
            optional(() => hide?.());
            if (target.server) {
                serverRequest++;
                clearTimeout(serverSizeTimer);
                serverSizeTimer = undefined;
                if (vendetta.host?.id === "valenced") {
                    // Match Server Info's handoff from Discord's closing guild popout.
                    clearTimeout(serverMenuTimer);
                    serverMenuTimer = setTimeout(() => {
                        serverMenuTimer = undefined;
                        if (active && session === generation) openImage(target);
                    }, 180);
                    return;
                }
            }
            openImage(target);
        };
    }

    function makePlainMenuItem(target, hide) {
        const item = {
            label: `View ${target.label}`,
            action: imageAction(target, hide),
        };

        if (imageIcon != null) item.icon = imageIcon;
        return item;
    }

    function withMenuItems(items, targets, hide) {
        const grouped = items.some(Array.isArray);
        const groups = grouped ? items.filter(Array.isArray) : [items];
        const labels = new Set(groups.flat().map(item => item?.label ?? item?.props?.label));
        const additions = targets.filter(target => !labels.has(`View ${target.label}`))
            .map(target => makePlainMenuItem(target, hide));
        if (!additions.length) return items;
        const group = groups[0];
        const extended = [...group, ...additions];
        return grouped ? items.map(value => value === group ? extended : value) : extended;
    }

    function injectProfileItems(tree, targets) {
        let found = false, visited = 0;
        function walk(node, depth = 0) {
            if (!node || found || depth > 30 || ++visited > 1500) return node;
            if (Array.isArray(node)) {
                const children = node.map(child => walk(child, depth + 1));
                return children.some((child, index) => child !== node[index]) ? children : node;
            }
            if (!node.props) return node;
            if (Array.isArray(node.props.items)) {
                found = true;
                const items = withMenuItems(node.props.items, targets);
                return items === node.props.items ? node : React.cloneElement(node, { items });
            }
            const children = walk(node.props.children, depth + 1);
            return children === node.props.children ? node : React.cloneElement(node, { children });
        }
        return targets.length ? walk(tree) : tree;
    }

    function profileContext(props, context) {
        const displayProfile = props?.displayProfile ?? props?.profile ?? props?.userProfile
            ?? context?.displayProfile ?? context?.profile ?? context?.userProfile;
        const userId = safeString(props?.userId) ?? safeString(context?.userId)
            ?? safeString(displayProfile?.userId);
        const user = props?.user ?? context?.user ?? optional(() => userId && UserStore?.getUser?.(userId));
        const guildId = safeString(props?.guildId) ?? safeString(context?.guildId)
            ?? safeString(displayProfile?.guildId) ?? safeString(props?.channel?.guild_id)
            ?? safeString(props?.channel?.guildId);
        return { user, guildId, displayProfile };
    }

    function patchProfileMenu(module, session) {
        if (!active || generation !== session || !module?.default) return false;
        let owner = module, method = "default", classComponent = false;
        for (let depth = 0; depth < 8; depth++) {
            const component = owner[method];
            if (component?.$$typeof === Symbol.for("react.memo")) {
                owner = component;
                method = "type";
            } else if (component?.$$typeof === Symbol.for("react.forward_ref")) {
                owner = component;
                method = "render";
            } else if (component?.prototype?.isReactComponent) {
                owner = component.prototype;
                method = "render";
                classComponent = true;
                break;
            } else break;
        }
        if (typeof owner[method] !== "function") return false;

        const unpatch = after(method, owner, function (args, rendered) {
            if (!active || generation !== session) return rendered;
            try {
                const { user, guildId, displayProfile } = profileContext(classComponent ? this?.props : args?.[0]);
                return injectProfileItems(rendered, userTargets(user, guildId, displayProfile));
            } catch (error) {
                logError("Could not extend profile menu", error);
                return rendered;
            }
        });
        if (typeof unpatch !== "function") return false;
        unpatches.push(unpatch);
        return true;
    }

    function patchUserProfileMenus() {
        const session = generation;
        function connect(name) {
            const path = `modules/user_profile/native/${name}.tsx`;
            const patch = module => {
                try { return patchProfileMenu(module, session); }
                catch (error) { logError(`Could not patch ${name}`, error); }
            };
            const module = optional(() => findByImportedPath?.(path))
                ?? optional(() => findByName?.(name, false));
            if (patch(module)) return;
            const unsubscribe = optional(() => getModuleWithImportedPath?.(path, patch));
            if (typeof unsubscribe === "function") unpatches.push(unsubscribe);
        }
        connect("UserProfileOverflowMenu");
        connect("BotUserProfileOverflowMenu");
    }

    function resolveContextTargets(menu) {
        if (!menu || typeof menu !== "object") return [];
        const context = menu.context ?? {};
        const key = safeString(menu.key);
        const guildId = safeString(menu.guildId) ?? safeString(context.guildId);

        if (menu.guild?.id) return guildTargets(menu.guild);

        const profile = profileContext(menu, context);
        if (profile.user?.id) return userTargets(profile.user, profile.guildId, profile.displayProfile);

        const explicitChannel = menu.channel
            ?? (safeString(menu.channelId) ? ChannelStore?.getChannel?.(String(menu.channelId)) : null)
            ?? (safeString(context.channelId) ? ChannelStore?.getChannel?.(String(context.channelId)) : null);
        if (explicitChannel?.icon) return channelTargets(explicitChannel);

        if (key) {
            try {
                const guild = GuildStore?.getGuild?.(key);
                if (guild?.id) return guildTargets(guild);
            } catch {}
            try {
                const user = UserStore?.getUser?.(key);
                if (user?.id) {
                    return userTargets(
                        user,
                        guildId,
                        menu.displayProfile ?? menu.profile ?? context.displayProfile ?? context.profile ?? null,
                    );
                }
            } catch {}
            try {
                const channel = ChannelStore?.getChannel?.(key);
                if (channel?.icon) return channelTargets(channel);
            } catch {}
        }

        return guildId ? guildTargets(GuildStore?.getGuild?.(guildId)) : [];
    }

    function patchContextMenus() {
        if (typeof ContextMenus?.showContextMenu !== "function") return;

        const unpatch = before("showContextMenu", ContextMenus, args => {
            try {
                const menu = args[0];
                if (!menu || !Array.isArray(menu.items)) return;
                const targets = resolveContextTargets(menu);
                const hide = () => ContextMenus.hideContextMenu?.();
                const items = withMenuItems(menu.items, targets, hide);
                if (items !== menu.items) args[0] = { ...menu, items };
            } catch (error) {
                logError("Context menu patch failed", error);
            }
        });

        unpatches.push(unpatch);
    }

    function patchGuildMenu() {
        if (typeof getModuleWithImportedPath !== "function") return;
        const session = generation;
        const path = "modules/guilds_bar/native/utils/getGuildsBarGuildMenuItems.tsx";
        const unsubscribe = getModuleWithImportedPath(path, module => {
            if (!active || generation !== session) return;
            const method = typeof module?.getGuildsBarGuildMenuItems === "function" ? "getGuildsBarGuildMenuItems" : "default";
            if (typeof module?.[method] !== "function") return;
            try {
                const unpatch = after(method, module, ([value], items) => {
                    if (!active || generation !== session || !Array.isArray(items)) return items;
                    const id = safeString(value) ?? safeString(value?.guildId) ?? safeString(value?.id);
                    const guild = value?.guild ?? optional(() => id && GuildStore?.getGuild?.(id));
                    return withMenuItems(items, guildTargets(guild));
                });
                if (typeof unpatch === "function") unpatches.push(unpatch);
            } catch (error) {
                logError("Could not patch server menu", error);
            }
        });
        if (typeof unsubscribe === "function") unpatches.push(unsubscribe);
    }

    function findRowArray(rendered) {
        return findInReactTree(rendered, node =>
            Array.isArray(node)
            && node.some(child =>
                child?.type === ActionSheetRow
                || child?.type?.name === "ActionSheetRow"
                || child?.type?.displayName === "ActionSheetRow"
            )
        );
    }

    function makeActionSheetRow(target, sheetKey) {
        if (!ActionSheetRow) return null;

        const props = {
            label: `View ${target.label}`,
            onPress: imageAction(target, () => LazyActionSheet?.hideActionSheet?.(sheetKey)),
        };

        if (imageIcon != null) {
            if (ActionSheetRow.Icon) {
                props.icon = React.createElement(ActionSheetRow.Icon, { source: imageIcon });
            } else {
                props.iconSource = imageIcon;
            }
        }

        return React.createElement(ActionSheetRow, {
            key: `view-icons-${target.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            ...props,
        });
    }

    function injectRows(rendered, targets, sheetKey) {
        if (!ActionSheetRow || !targets?.length) return;
        const rows = findRowArray(rendered);
        if (!rows?.push) return;

        for (const target of targets) {
            const label = `View ${target.label}`;
            if (rows.some(row => row?.props?.label === label)) continue;
            const row = makeActionSheetRow(target, sheetKey);
            if (row) rows.splice(Math.min(1, rows.length), 0, row);
        }
    }

    function targetsFromLazyProps(sheetKey, props) {
        const key = String(sheetKey ?? "");
        const guildId = safeString(props?.guildId);

        if (/^UserProfile/i.test(key)) {
            const profile = profileContext(props);
            return userTargets(profile.user, profile.guildId, profile.displayProfile);
        }

        if (/Guild/i.test(key)) {
            const guild = props?.guild
                ?? (guildId ? GuildStore?.getGuild?.(guildId) : null);
            if (guild?.id) return guildTargets(guild);
        }

        if (/Channel|Group/i.test(key)) {
            const channelId = safeString(props?.channelId) ?? safeString(props?.channel?.id);
            const channel = props?.channel ?? (channelId ? ChannelStore?.getChannel?.(channelId) : null);
            if (channel?.icon) return channelTargets(channel);
        }

        return [];
    }

    function patchLazyActionSheets() {
        if (typeof LazyActionSheet?.openLazy !== "function" || !ActionSheetRow) return;

        const unpatchOpen = before("openLazy", LazyActionSheet, ([componentPromise, sheetKey, props]) => {
            const targets = optional(() => targetsFromLazyProps(sheetKey, props ?? {}));
            if (!componentPromise?.then) return;
            const currentGeneration = generation;

            Promise.resolve(componentPromise).then(module => {
                if (!active || currentGeneration !== generation || !module) return;
                const alreadyPatched = lazyContexts.has(module);
                if (alreadyPatched) {
                    lazyContexts.set(module, { sheetKey, targets: targets ?? [] });
                    return;
                }
                if (!targets?.length) return;

                const exportValue = module.default;
                const holder =
                    typeof exportValue === "function"
                        ? { object: module, method: "default" }
                        : exportValue && typeof exportValue.type === "function"
                            ? { object: exportValue, method: "type" }
                            : exportValue && typeof exportValue.render === "function"
                                ? { object: exportValue, method: "render" }
                                : null;

                if (!holder) return;

                const unpatchRender = after(holder.method, holder.object, (_, rendered) => {
                    try {
                        const context = lazyContexts.get(module);
                        if (active && context) {
                            injectRows(rendered, context.targets, String(context.sheetKey ?? ""));
                        }
                    } catch (error) {
                        logError("Action sheet row injection failed", error);
                    }
                });

                lazyContexts.set(module, { sheetKey, targets });
                unpatches.push(unpatchRender);
            }).catch(error => logError("Failed to resolve action sheet", error));
        });

        unpatches.push(unpatchOpen);
    }

    function onLoad() {
        if (active) return;
        active = true;
        generation++;
        resolveModules();

        for (const patch of [patchUserProfileMenus, patchGuildMenu, patchContextMenus, patchLazyActionSheets]) {
            try { patch(); } catch (error) { logError("Optional menu patch unavailable", error); }
        }
        toast(unpatches.length ? "ViewIcons enabled" : "ViewIcons: no supported menus found on this Discord build");
    }

    function onUnload() {
        active = false;
        generation++;
        clearTimeout(serverMenuTimer);
        clearTimeout(serverSizeTimer);
        serverMenuTimer = serverSizeTimer = undefined;
        for (const unpatch of unpatches.splice(0).reverse()) {
            try { unpatch?.(); } catch (error) { logError("Failed to unpatch", error); }
        }
        lazyContexts = new WeakMap();
    }

    return { onLoad, onUnload };
})()
}, "ViewIcons");
})()
