(() => {
    "use strict";

    // ViewIcons for Revenge / Vendetta-compatible Discord mobile clients.
    // Mobile port of the core Vencord ViewIcons behavior.

    const { findByProps, findByStoreName, findByName } = vendetta.metro;
    const { React, ReactNative } = vendetta.metro.common;
    const { before, after } = vendetta.patcher;
    const { getAssetIDByName } = vendetta.ui.assets;
    const { showToast } = vendetta.ui.toasts;
    const { findInReactTree } = vendetta.utils;

    const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
    const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow;
    const ContextMenus = findByProps("showContextMenu", "hideContextMenu");
    const MediaModal = findByProps("openMediaModal");

    const IconUtils =
        findByProps("getUserAvatarURL", "getGuildIconURL")
        ?? findByProps("getUserAvatarURL", "getGuildBannerURL");

    const UserStore = findByStoreName("UserStore");
    const UserProfileStore = findByStoreName("UserProfileStore");
    const GuildMemberStore = findByStoreName("GuildMemberStore");
    const GuildStore = findByStoreName("GuildStore");
    const ChannelStore = findByStoreName("ChannelStore");

    const imageIcon =
        getAssetIDByName("ImageIcon")
        ?? getAssetIDByName("ic_image")
        ?? getAssetIDByName("ic_image_24px")
        ?? getAssetIDByName("ic_gallery_24px");

    const unpatches = [];
    const patchedLazyModules = new WeakSet();

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

    function openImage(label, source, fallbackWidth = 512, fallbackHeight = 512) {
        if (!source) {
            toast(`${label} is unavailable`);
            return;
        }

        const uri = normalizeImageUrl(source, 4096);

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
                    ReactNative.Linking.openURL(uri);
                    return;
                }
            } catch (error) {
                logError("Browser fallback failed", error);
            }
            toast(`Couldn't open ${label.toLowerCase()}`);
        };

        try {
            const Image = ReactNative?.Image;
            if (Image?.getSize && typeof MediaModal?.openMediaModal === "function") {
                Image.getSize(
                    uri,
                    (width, height) => {
                        if (!openInDiscord(width, height)) openFallback();
                    },
                    () => {
                        if (!openInDiscord(fallbackWidth, fallbackHeight)) openFallback();
                    },
                );
                return;
            }
        } catch (error) {
            logError("Image size lookup failed", error);
        }

        if (!openInDiscord(fallbackWidth, fallbackHeight)) openFallback();
    }

    function resolveProfile(user, guildId, suppliedProfile) {
        if (!user?.id) return suppliedProfile ?? user;
        let profile = suppliedProfile ?? null;

        try {
            if (!profile && guildId && UserProfileStore?.getGuildMemberProfile) {
                profile = UserProfileStore.getGuildMemberProfile(user.id, guildId);
            }
        } catch {}

        try {
            profile ??= UserProfileStore?.getUserProfile?.(user.id) ?? null;
        } catch {}

        return profile ? { ...user, ...profile } : user;
    }

    function getUserBannerUrl(user, suppliedProfile, guildId) {
        const profile = suppliedProfile ?? resolveProfile(user, guildId);

        // Current Discord mobile exposes the actually displayed banner through
        // DisplayProfile#getBannerURL. This also handles guild-specific banners.
        try {
            if (typeof suppliedProfile?.getBannerURL === "function") {
                const url = suppliedProfile.getBannerURL({ canAnimate: true, size: 2048 });
                if (url) return url;
            }
        } catch {}

        try {
            if (typeof profile?.getBannerURL === "function") {
                const url = profile.getBannerURL({ canAnimate: true, size: 2048 });
                if (url) return url;
            }
        } catch {}

        const banner =
            safeString(suppliedProfile?.banner)
            ?? safeString(suppliedProfile?._guildMemberProfile?.banner)
            ?? safeString(suppliedProfile?._userProfile?.banner)
            ?? safeString(profile?.banner)
            ?? safeString(user?.banner);

        const userId =
            safeString(suppliedProfile?.userId)
            ?? safeString(profile?.userId)
            ?? safeString(user?.id);

        if (!banner || !userId) return null;

        try {
            const url = IconUtils?.getUserBannerURL?.({
                id: userId,
                banner,
                canAnimate: true,
                size: 2048,
            });
            if (url) return url;
        } catch {}

        // Final CDN fallback in case Discord renames the URL helper.
        const extension = banner.startsWith("a_") ? "gif" : "webp";
        return `https://cdn.discordapp.com/banners/${userId}/${banner}.${extension}?size=2048`;
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
            if (IconUtils?.getAvatarDecorationURL) {
                const url = IconUtils.getAvatarDecorationURL({
                    avatarDecoration: decoration,
                    avatarDecorationData: decoration,
                    size: 1024,
                    canAnimate: true,
                });
                if (url) return url;
            }
        } catch {}

        const asset = safeString(decoration?.asset) ?? safeString(decoration?.hash);
        return asset
            ? `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png?size=1024&passthrough=true`
            : null;
    }

    function userTargets(user, guildId, suppliedProfile) {
        if (!user?.id || !IconUtils) return [];
        const profile = resolveProfile(user, guildId, suppliedProfile);
        const targets = [];

        try {
            const avatar = IconUtils.getUserAvatarURL?.(user, true);
            if (avatar) targets.push({ label: "Avatar", url: avatar, width: 512, height: 512 });
        } catch {}

        try {
            const banner = getUserBannerUrl(user, suppliedProfile, guildId);
            if (banner) targets.push({ label: "Banner", url: banner, width: 1024, height: 400 });
        } catch {}

        if (guildId) {
            try {
                const member = GuildMemberStore?.getMember?.(guildId, user.id);
                if (member?.avatar && IconUtils.getGuildMemberAvatarURLSimple) {
                    const serverAvatar = IconUtils.getGuildMemberAvatarURLSimple({
                        userId: user.id,
                        avatar: member.avatar,
                        guildId,
                        canAnimate: true,
                    });
                    if (serverAvatar) {
                        targets.push({ label: "Server Avatar", url: serverAvatar, width: 512, height: 512 });
                    }
                }
            } catch {}
        }

        const decoration = getDecorationData(suppliedProfile) ?? getDecorationData(profile) ?? getDecorationData(user);
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
        if (!guild?.id || !IconUtils) return [];
        const targets = [];

        if (guild.icon) {
            try {
                const icon = IconUtils.getGuildIconURL?.({
                    id: guild.id,
                    icon: guild.icon,
                    canAnimate: true,
                });
                if (icon) targets.push({ label: "Server Icon", url: icon, width: 512, height: 512 });
            } catch {}
        }

        if (guild.banner) {
            try {
                const banner = IconUtils.getGuildBannerURL?.(guild, true);
                if (banner) targets.push({ label: "Server Banner", url: banner, width: 1024, height: 400 });
            } catch {}
        }

        return dedupeTargets(targets);
    }

    function channelTargets(channel) {
        if (!channel?.id || !channel?.icon || !IconUtils?.getChannelIconURL) return [];
        try {
            const icon = IconUtils.getChannelIconURL(channel);
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

    function makePlainMenuItem(target, hide) {
        const item = {
            label: `View ${target.label}`,
            action: () => {
                try { hide?.(); } catch {}
                openImage(target.label, target.url, target.width, target.height);
            },
        };

        if (imageIcon != null) item.icon = imageIcon;
        return item;
    }

    function getItemsGroup(rendered) {
        let items = rendered?.props?.items;
        if (Array.isArray(items)) {
            if (Array.isArray(items[0])) return items[0];
            return items;
        }

        items = rendered?.props?.children?.props?.items;
        if (Array.isArray(items)) {
            if (Array.isArray(items[0])) return items[0];
            return items;
        }

        const node = findInReactTree(rendered, value =>
            Array.isArray(value?.props?.items)
            && (Array.isArray(value.props.items[0]) || value.props.items.length === 0)
        );
        if (Array.isArray(node?.props?.items?.[0])) return node.props.items[0];
        if (Array.isArray(node?.props?.items)) return node.props.items;
        return null;
    }

    function addPlainItems(items, targets, hide) {
        if (!Array.isArray(items)) return;
        for (const target of targets) {
            const label = `View ${target.label}`;
            if (items.some(item => item?.label === label || item?.props?.label === label)) continue;
            items.push(makePlainMenuItem(target, hide));
        }
    }

    function patchUserProfileMenus() {
        if (typeof findByName !== "function") return;

        for (const moduleName of ["UserProfileOverflowMenu", "BotUserProfileOverflowMenu"]) {
            try {
                const module = findByName(moduleName, false);
                if (!module?.default) continue;

                const unpatch = after("default", module, (args, rendered) => {
                    try {
                        const props = args?.[0] ?? {};
                        const user = props.user
                            ?? (props.userId ? UserStore?.getUser?.(String(props.userId)) : null);
                        if (!user?.id) return;

                        const guildId = safeString(props.guildId)
                            ?? safeString(props.displayProfile?.guildId)
                            ?? safeString(props.channel?.guild_id)
                            ?? safeString(props.channel?.guildId);

                        const displayProfile =
                            props.displayProfile
                            ?? props.profile
                            ?? props.userProfile
                            ?? null;

                        const items = getItemsGroup(rendered);
                        addPlainItems(
                            items,
                            userTargets(user, guildId, displayProfile),
                            () => LazyActionSheet?.hideActionSheet?.(),
                        );
                    } catch (error) {
                        logError(`Failed to patch ${moduleName}`, error);
                    }
                });

                unpatches.push(unpatch);
            } catch (error) {
                logError(`Could not locate ${moduleName}`, error);
            }
        }
    }

    function resolveContextTargets(menu) {
        if (!menu || typeof menu !== "object") return [];
        const context = menu.context ?? {};
        const key = safeString(menu.key);
        const guildId = safeString(menu.guildId) ?? safeString(context.guildId);

        const explicitGuild = menu.guild
            ?? (safeString(menu.guildId) ? GuildStore?.getGuild?.(String(menu.guildId)) : null);
        if (explicitGuild?.id) return guildTargets(explicitGuild);

        const explicitUser = menu.user
            ?? (safeString(menu.userId) ? UserStore?.getUser?.(String(menu.userId)) : null)
            ?? (safeString(context.userId) ? UserStore?.getUser?.(String(context.userId)) : null);
        if (explicitUser?.id) {
            return userTargets(
                explicitUser,
                guildId,
                menu.displayProfile ?? menu.profile ?? context.displayProfile ?? context.profile ?? null,
            );
        }

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

        return [];
    }

    function patchContextMenus() {
        if (typeof ContextMenus?.showContextMenu !== "function") return;

        const unpatch = before("showContextMenu", ContextMenus, ([menu]) => {
            try {
                if (!menu || !Array.isArray(menu.items)) return;
                const targets = resolveContextTargets(menu);
                addPlainItems(menu.items, targets, () => ContextMenus.hideContextMenu?.());
            } catch (error) {
                logError("Context menu patch failed", error);
            }
        });

        unpatches.push(unpatch);
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
            onPress: () => {
                try { LazyActionSheet?.hideActionSheet?.(sheetKey); } catch {}
                openImage(target.label, target.url, target.width, target.height);
            },
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
            const user = props?.user
                ?? (safeString(props?.userId) ? UserStore?.getUser?.(String(props.userId)) : null);
            return user?.id
                ? userTargets(user, guildId, props?.displayProfile ?? props?.profile ?? props?.userProfile ?? null)
                : [];
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
            const targets = targetsFromLazyProps(sheetKey, props ?? {});
            if (!targets.length || !componentPromise?.then) return;

            Promise.resolve(componentPromise).then(module => {
                if (!module || patchedLazyModules.has(module)) return;

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
                patchedLazyModules.add(module);

                let unpatchRender;
                unpatchRender = after(holder.method, holder.object, (_, rendered) => {
                    try {
                        // Only inject while this particular sheet is being mounted.
                        injectRows(rendered, targets, String(sheetKey ?? ""));
                        React.useEffect?.(() => () => {
                            try { unpatchRender?.(); } catch {}
                            patchedLazyModules.delete(module);
                        }, []);
                    } catch (error) {
                        logError("Action sheet row injection failed", error);
                    }
                });

                unpatches.push(unpatchRender);
            }).catch(error => logError("Failed to resolve action sheet", error));
        });

        unpatches.push(unpatchOpen);
    }

    function onLoad() {
        if (!IconUtils) {
            throw new Error("ViewIcons: Discord's icon URL module was not found on this build");
        }

        patchUserProfileMenus();
        patchContextMenus();
        patchLazyActionSheets();
        toast("ViewIcons enabled");
    }

    function onUnload() {
        for (const unpatch of unpatches.splice(0).reverse()) {
            try { unpatch?.(); } catch (error) { logError("Failed to unpatch", error); }
        }
    }

    return { onLoad, onUnload };
})()
