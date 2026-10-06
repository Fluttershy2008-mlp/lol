(() => {
"use strict";
const common = (() => {
function mSendMessage(vendetta) {
        const {
                metro: {
                        findByProps,
                        findByStoreName,
                        common: {
                                lodash: { merge },
                        },
                },
        } = vendetta;
        const Send = findByProps("_sendMessage");
        const { createBotMessage } = findByProps("createBotMessage");
        const Avatars = findByProps("BOT_AVATARS");
        const { getChannelId: getFocusedChannelId } = findByStoreName("SelectedChannelStore");
        return function (message, mod) {
                message.channelId ??= getFocusedChannelId();
                if ([null, undefined].includes(message.channelId)) throw new Error("No channel id to receive the message into (channelId)");
                let msg = message;
                if (message.really) {
                        if (typeof mod === "object") msg = merge(msg, mod);
                        const args = [msg, {}];
                        args[0].tts ??= false;
                        for (const key of ["allowedMentions", "messageReference"]) {
                                if (key in args[0]) {
                                        args[1][key] = args[0][key];
                                        delete args[0][key];
                                }
                        }
                        const overwriteKey = "overwriteSendMessageArg2"
                        if (overwriteKey in args[0]) {
                                // so that you can use the keys i may have missed in the for loop above
                                args[1] = args[0][overwriteKey];
                                delete args[0][overwriteKey];
                        }
                        return Send._sendMessage(message.channelId, ...args);
                }
                if (mod !== true) msg = createBotMessage(msg);
                if (typeof mod === "object") {
                        msg = merge(msg, mod);
                        if (typeof mod.author === "object")
                                (function processAvatarURL() {
                                        const author = mod.author;
                                        if (typeof author.avatarURL === "string") {
                                                Avatars.BOT_AVATARS[author.avatar ?? author.avatarURL] = author.avatarURL;
                                                author.avatar ??= author.avatarURL
                                                delete author.avatarURL;
                                        }
                                })();
                }
                Send.receiveMessage(msg.channel_id, msg);
                return msg;
        };
}

function cmdDisplays(obj, translations, locale) {
        if (!obj?.name || !obj?.description) throw new Error(`No name(${obj?.name}) or description(${obj?.description}) in the passed command (command name: ${obj?.name})`);

        obj.displayName ??= translations?.names?.[locale] ?? obj.name;
        obj.displayDescription ??= translations?.names?.[locale] ?? obj.description;
        if (obj.options) {
                if (!Array.isArray(obj.options)) throw new Error(`Options is not an array (received: ${typeof obj.options})`);
                for (let optionIndex = 0; optionIndex < obj.options.length; optionIndex++) {
                        const option = obj.options[optionIndex];
                        // TODO: Handle subcommands (type 1 or 2 probably i forgor)
                        if (!option?.name || !option?.description) throw new Error(`No name(${option?.name}) or description(${option?.description} in the option with index ${optionIndex}`);
                        option.displayName ??= translations?.options?.[optionIndex]?.names?.[locale] ?? option.name;
                        option.displayDescription ??= translations?.options?.[optionIndex]?.descriptions?.[locale] ?? option.description;
                        if (option?.choices) {
                                if (!Array.isArray(option?.choices)) throw new Error(`Choices is not an array (received: ${typeof option.choices})`);
                                for (let choiceIndex = 0; choiceIndex < option.choices.length; choiceIndex++) {
                                        const choice = option.choices[choiceIndex];
                                        if (!choice?.name) throw new Error(`No name of choice with index ${choiceIndex} in option with index ${optionIndex}`);
                                        choice.displayName ??= translations?.options?.[optionIndex]?.choices?.[choiceIndex]?.names?.[locale] ?? choice.name;
                                }
                        }
                }
        }
        return obj;
}

const AVATARS = { command: "https://cdn.discordapp.com/attachments/1099116247364407337/1112129955053187203/command.png" };

return { cmdDisplays, mSendMessage, AVATARS };
})();
const embedHelpers = (() => {
const { findByProps } = vendetta.metro;

const API = findByProps("get", "post");
const DISCORD_EPOCH = 1420070400000;

function snowflakeToTimestamp(snowflake) {
    try {
        const id = BigInt(snowflake);
        const timestamp = Number((id >> 22n) + BigInt(DISCORD_EPOCH));
        return timestamp;
    } catch (e) {
        console.error("[Snowflake] Failed to convert:", e);
        return null;
    }
}

function formatTimestamp(timestamp) {
    if (!timestamp) return "Unknown";
    return `<t:${Math.floor(timestamp / 1000)}:R>`;
}

function formatTimestampFromSnowflake(snowflake) {
    const timestamp = snowflakeToTimestamp(snowflake);
    if (!timestamp) return "Unknown";
    return formatTimestamp(timestamp);
}

function formatDate(timestamp) {
    if (!timestamp) return "Unknown";
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function maskUrl(text, url) {
    return `[${text}](${url})`;
}

function getAvatarUrls(userId, avatarHash) {
    const baseUrl = `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}`;
    const isGif = avatarHash?.startsWith("a_");

    return {
        png: `${baseUrl}.png?size=1024`,
        jpg: `${baseUrl}.jpg?size=1024`,
        webp: `${baseUrl}.webp?size=1024`,
        gif: isGif ? `${baseUrl}.gif?size=1024` : undefined
    };
}

function formatAvatarLinks(avatarHash, userId) {
    if (!avatarHash) return "None";
    const urls = getAvatarUrls(userId, avatarHash);
    const links = [];
    links.push(maskUrl("PNG", urls.png));
    links.push(maskUrl("JPG", urls.jpg));
    links.push(maskUrl("WebP", urls.webp));
    if (urls.gif) links.push(maskUrl("GIF", urls.gif));
    return links.join(" | ");
}

function getBannerUrl(userId, bannerHash) {
    if (!bannerHash) return null;
    const isGif = bannerHash.startsWith("a_");
    return `https://cdn.discordapp.com/banners/${userId}/${bannerHash}.${isGif ? "gif" : "png"}?size=1024`;
}

function getGuildIconUrl(guildId, iconHash) {
    if (!iconHash) return null;
    return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png?size=1024`;
}

function getGuildBannerUrl(guildId, bannerHash) {
    if (!bannerHash) return null;
    return `https://cdn.discordapp.com/banners/${guildId}/${bannerHash}.png?size=1024`;
}

function getGuildSplashUrl(guildId, splashHash) {
    if (!splashHash) return null;
    return `https://cdn.discordapp.com/splashes/${guildId}/${splashHash}.png?size=1024`;
}

function getGuildDiscoverySplashUrl(guildId, discoverySplashHash) {
    if (!discoverySplashHash) return null;
    return `https://cdn.discordapp.com/discovery-splashes/${guildId}/${discoverySplashHash}.png?size=1024`;
}

function decodeBadges(flags) {
    const badgeMap = [
        { bit: 1 << 0, name: "Staff" },
        { bit: 1 << 1, name: "Partner" },
        { bit: 1 << 2, name: "Hypesquad" },
        { bit: 1 << 3, name: "Bug Hunter Level 1" },
        { bit: 1 << 6, name: "Hypesquad Bravery" },
        { bit: 1 << 7, name: "Hypesquad Brilliance" },
        { bit: 1 << 8, name: "Hypesquad Balance" },
        { bit: 1 << 9, name: "Early Supporter" },
        { bit: 1 << 10, name: "Team User" },
        { bit: 1 << 11, name: "Bug Hunter Level 2" },
        { bit: 1 << 12, name: "Verified Bot" },
        { bit: 1 << 13, name: "Early Verified Bot Developer" },
        { bit: 1 << 14, name: "Discord Certified Moderator" },
        { bit: 1 << 16, name: "Active Developer" },
        { bit: 1 << 18, name: "BOT_HTTP_INTERACTIONS" }
    ];

    const userBadges = [];
    for (const badge of badgeMap) {
        if (flags & badge.bit) {
            userBadges.push(badge.name);
        }
    }
    return userBadges.length > 0 ? userBadges.join(", ") : "None";
}

async function fetchUser(userId) {
    try {
        const response = await API.get({ url: `/users/${userId}` });
        return response.body;
    } catch (e) {
        console.error("[API] Failed to fetch user:", e);
        return null;
    }
}

async function fetchGuild(guildId) {
    try {
        const response = await API.get({ url: `/guilds/${guildId}?with_counts=true` });
        return response.body;
    } catch (e) {
        console.error("[API] Failed to fetch guild:", e);
        return null;
    }
}

async function fetchInvite(inviteCode) {
    try {
        const response = await API.get({ url: `/invites/${inviteCode}?with_counts=true&with_expiration=true` });
        return response.body;
    } catch (e) {
        console.error("[API] Failed to fetch invite:", e);
        return null;
    }
}
return { fetchUser, fetchGuild, fetchInvite, formatTimestamp, formatTimestampFromSnowflake, formatAvatarLinks, maskUrl, getGuildIconUrl, getBannerUrl, getGuildBannerUrl, getGuildSplashUrl, getGuildDiscoverySplashUrl, decodeBadges, formatDate };
})();
const { fetchUser, fetchGuild, fetchInvite, formatTimestamp, formatTimestampFromSnowflake, formatAvatarLinks, maskUrl, getGuildIconUrl, getBannerUrl, getGuildBannerUrl, getGuildSplashUrl, getGuildDiscoverySplashUrl, decodeBadges, formatDate } = embedHelpers;
const serverMenu = (() => {
const { find, findByName, findByProps, findByStoreName } = vendetta.metro;
const { before, after } = vendetta.patcher;
const { React, ReactNative: RN } = vendetta.metro.common;
const ITEM_ID = "info-commands-server-info";
let sheetKey;
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
function isInfo(item) {
    return item?.id === ITEM_ID || item?.key === ITEM_ID
        || item?.label === "Server Info" || item?.props?.label === "Server Info";
}
function itemsWithInfo(items, id, open, close) {
    if (!id || !Array.isArray(items) || items.some(isInfo)) return items;
    if (Array.isArray(items[0])) {
        if (items.some(group => Array.isArray(group) && group.some(isInfo))) return items;
        return [itemsWithInfo(items[0], id, open, close), ...items.slice(1)];
    }
    return [...items, {
        id: ITEM_ID,
        label: "Server Info",
        action() {
            if (!running) return;
            optional(() => close?.());
            open(id);
        },
    }];
}

function installServerMenu(open) {
    if (running) return () => {};
    running = true;
    generation++;
    const patches = [];
    sheets = optional(() => findByProps("openLazy", "hideActionSheet"))
        ?? optional(() => findByProps("openLazy"));
    contexts = optional(() => findByProps("showContextMenu"));
    const store = optional(() => findByStoreName("GuildStore"));
    const menu = optional(() => findByName?.("getGuildsBarGuildMenuItems", false))
        ?? optional(() => find?.(m => m?.default?.name === "getGuildsBarGuildMenuItems"));
    const holder = typeof menu?.default === "function" ? [menu, "default"]
        : typeof menu?.getGuildsBarGuildMenuItems === "function" ? [menu, "getGuildsBarGuildMenuItems"] : null;
    if (holder) patches.push(after(holder[1], holder[0], (args, result) =>
        itemsWithInfo(result, guildId(args?.[0]), open, () => contexts?.hideContextMenu?.())
    ));

    if (typeof contexts?.showContextMenu === "function") {
        patches.push(before("showContextMenu", contexts, ([menu]) => {
            try {
                if (!menu || !Array.isArray(menu.items)) return;
                // A user menu can also carry a guildId. Only accept a guild target.
                if (menu.user || menu.userId || menu.context?.user || menu.context?.userId
                    || menu.message || menu.channel || menu.channelId || menu.context?.channelId) return;
                const target = menu.guild ?? menu.context?.guild
                    ?? (menu.key ? store?.getGuild?.(String(menu.key)) : null)
                    ?? (!menu.key && menu.guildId ? store?.getGuild?.(String(menu.guildId)) : null)
                    ?? (/guild|server/i.test(String(menu.type ?? menu.name ?? ""))
                        ? { id: menu.guildId ?? menu.context?.guildId } : null);
                menu.items = itemsWithInfo(menu.items, guildId(target), open, () => contexts.hideContextMenu?.());
            } catch (error) { console.error("[InfoCommands] Context menu patch failed", error); }
        }));
    }

    // Modern Discord builds lazy-load their action-sheet component.
    const Row = optional(() => findByProps("ActionSheetRow")?.ActionSheetRow);
    let lazyModules = new WeakMap();
    if (typeof sheets?.openLazy === "function") {
        patches.push(before("openLazy", sheets, ([promise, key, props]) => {
            if (!/guild/i.test(String(key)) || !/menu|context|actions/i.test(String(key))) return;
            const id = guildId(props?.guild ?? props);
            if (!id || !promise?.then) return;
            const epoch = generation;
            Promise.resolve(promise).then(module => {
                if (!running || generation !== epoch || !module) return;
                const context = { id, key };
                if (lazyModules.has(module)) { lazyModules.set(module, context); return; }
                const holder = typeof module.default === "function" ? [module, "default"]
                    : typeof module.default?.type === "function" ? [module.default, "type"]
                    : typeof module.default?.render === "function" ? [module.default, "render"] : null;
                if (!holder) return;
                lazyModules.set(module, context);
                dynamicPatches.push(after(holder[1], holder[0], (_, result) => {
                    try {
                    if (!running) return;
                    const target = lazyModules.get(module);
                    const tree = vendetta.utils?.findInReactTree;
                    const node = optional(() => tree?.(result, n => Array.isArray(n?.props?.items)));
                    if (node) {
                        node.props.items = itemsWithInfo(node.props.items, target.id, open, () => sheets.hideActionSheet?.(target.key));
                        return;
                    }
                    if (!Row) return;
                    const rows = optional(() => tree?.(result, n => Array.isArray(n)
                        && n.some(child => child?.type === Row || child?.type?.name === "ActionSheetRow" || child?.type?.displayName === "ActionSheetRow")));
                    if (!Array.isArray(rows) || rows.some(isInfo)) return;
                    rows.push(React.createElement(Row, {
                        key: ITEM_ID, label: "Server Info",
                        onPress() {
                            if (!running) return;
                            optional(() => sheets.hideActionSheet?.(target.key));
                            open(target.id);
                        },
                    }));
                    } catch (error) { console.error("[InfoCommands] Guild sheet injection failed", error); }
                }));
            }).catch(error => console.error("[InfoCommands] Lazy menu unavailable", error));
        }));
    }
    if (!patches.length) notify("InfoCommands: server menu unavailable on this Discord version");
    return () => {
        disposeServerMenu();
        lazyModules = new WeakMap();
        for (const unpatch of patches.splice(0).reverse()) optional(() => unpatch());
    };
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

function openServerInfo(id, load) {
    if (!running) return;
    const key = `${ITEM_ID}-${id}`;
    if (sheetKey === key) return;
    if (sheetKey) optional(() => sheets?.hideActionSheet?.(sheetKey));
    const ActionSheet = optional(() => findByProps("ActionSheet")?.ActionSheet);
    const colors = optional(() => findByProps("colors", "meta"));
    const theme = optional(() => findByStoreName("ThemeStore")?.theme);
    const sc = (name, fallback) => optional(() => colors?.meta?.resolveSemanticColor(theme, vendetta.ui.semanticColors?.[name])) ?? fallback;
    const textColor = sc("TEXT_NORMAL", theme === "light" ? "#1e1f22" : "#f2f3f5");
    const background = sc("BACKGROUND_SECONDARY", theme === "light" ? "#f2f3f5" : "#2b2d31");
    const epoch = generation;
    const text = (value, style = {}, props = {}) => React.createElement(RN.Text, {
        style: { color: textColor, fontSize: 15, ...style }, ...props,
    }, value);
    const close = () => {
        optional(() => sheets?.hideActionSheet?.(key));
        if (sheetKey === key) sheetKey = undefined;
    };
    function ServerInfoSheet() {
        const [data, setData] = React.useState(null);
        const [error, setError] = React.useState(null);
        React.useEffect(() => {
            let mounted = true;
            Promise.resolve().then(() => load(id)).then(value => {
                if (mounted && running && epoch === generation) setData(value);
            }).catch(reason => {
                if (mounted && running && epoch === generation) setError(reason?.message ?? "Unable to load server details.");
            });
            return () => {
                mounted = false;
                if (sheetKey === key) sheetKey = undefined;
            };
        }, []);
        const content = [text("Server Info", { fontSize: 22, fontWeight: "700" }, { key: "title" }),
            React.createElement(RN.TouchableOpacity, { key: "close", onPress: close, accessibilityLabel: "Close server info", style: { paddingVertical: 12 } }, text("Close", { color: "#8ea1ff" }))];
        if (error) content.push(text(error, {}, { key: "error" }));
        if (!data && !error) content.push(text("Loading server details…", {}, { key: "loading" }));
        if (data) {
            if (data.thumbnail?.url) content.push(React.createElement(RN.Image, { key: "icon", source: { uri: data.thumbnail.url }, style: { width: 72, height: 72, borderRadius: 16, marginBottom: 12 } }));
            content.push(text(data.title, { fontSize: 20, fontWeight: "600" }, { key: "name" }));
            content.push(text(data.description, { marginTop: 8 }, { key: "description", selectable: true }));
            if (data.cachedOnly) content.push(text("Showing cached details. Some information may be unavailable.", { marginTop: 10 }, { key: "cache" }));
            for (const field of data.fields) {
                const value = plainText(field.value);
                const row = React.createElement(RN.View, { key: field.name, style: { paddingVertical: 12 } },
                    text(field.name, { fontWeight: "600", marginBottom: 4 }), text(value, {}, { selectable: true }));
                content.push(field.name === "ID" ? React.createElement(RN.TouchableOpacity, {
                    key: field.name, onPress: () => copy(id), accessibilityLabel: "Copy server ID",
                }, row, text("Tap to copy", { color: "#8ea1ff" })) : row);
            }
            if (data.image?.url) content.push(React.createElement(RN.Image, { key: "banner", source: { uri: data.image.url }, style: { width: "100%", height: 150, resizeMode: "contain", marginVertical: 12 } }));
        }
        return React.createElement(ActionSheet, null, React.createElement(RN.ScrollView, {
            style: { maxHeight: Math.round((RN.Dimensions?.get?.("window")?.height ?? 700) * 0.8), backgroundColor: background },
            contentContainerStyle: { padding: 20, paddingBottom: 40 },
        }, ...content));
    }
    if (typeof sheets?.openLazy === "function" && ActionSheet && React?.createElement) {
        sheetKey = key;
        try {
            Promise.resolve(sheets.openLazy(Promise.resolve({ default: ServerInfoSheet }), key, {})).catch(() => {
                close(); notify("Unable to open server info");
            });
            return;
        } catch { close(); }
    }
    // Native alert remains usable on older clients without custom action sheets.
    Promise.resolve().then(() => load(id)).then(data => {
        if (!running || epoch !== generation) return;
        RN.Alert.alert(`Server Info — ${data.title}`, [data.description,
            data.cachedOnly ? "Showing cached details." : "",
            ...data.fields.map(f => `${f.name}: ${plainText(f.value)}`),
        ].filter(Boolean).join("\n\n"), [{ text: "Copy Server ID", onPress: () => copy(id) }, { text: "Close", style: "cancel" }]);
    }).catch(error => { if (running && epoch === generation) notify(error?.message ?? "Unable to load server info"); });
}

function disposeServerMenu() {
    running = false;
    generation++;
    if (sheetKey) optional(() => sheets?.hideActionSheet?.(sheetKey));
    sheetKey = undefined;
    for (const unpatch of dynamicPatches.splice(0).reverse()) optional(() => unpatch());
}

return { installServerMenu, openServerInfo, disposeServerMenu };
})();
const { installServerMenu, openServerInfo, disposeServerMenu } = serverMenu;



const { findByStoreName, findByProps } = vendetta.metro;
const { registerCommand } = vendetta.commands;
const { semanticColors } = vendetta.ui;
const ThemeStore = findByStoreName("ThemeStore");
const colorModule = findByProps("colors", "meta");
const EMBED_COLOR = () => {
    try { return parseInt(colorModule.meta.resolveSemanticColor(ThemeStore.theme, semanticColors.BACKGROUND_BASE_LOWER).slice(1), 16); }
    catch { return 0x5865f2; }
};
const authorMods = {
    author: {
        username: "InfoCommands",
        avatar: "command",
        avatarURL: common.AVATARS.command,
    },
};

let madeSendMessage;
function sendMessage() {
    if (window.sendMessage) return window.sendMessage(...arguments);
    if (!madeSendMessage) madeSendMessage = common.mSendMessage(vendetta);
    return madeSendMessage(...arguments);
}

// User Info Command
const userInfoCommand = common.cmdDisplays({
    type: 1,
    inputType: 1,
    applicationId: "-1",
    name: "userinfo",
    description: "Get information about a user by ID",
    options: [
        {
            required: true,
            type: 3,
            name: "user_id",
            description: "ID of the user",
        },
        {
            required: false,
            type: 5,
            name: "ephemeral",
            description: "Send as ephemeral message",
        }
    ],
    execute: async (args, ctx) => {
        try {
            const userId = args.find(a => a.name === "user_id")?.value;
            const isEphemeral = args.find(a => a.name === "ephemeral")?.value || false;
            
            if (!userId) {
                if (isEphemeral) {
                    return { type: 4, data: { content: "Please provide a user ID.", flags: 64 } };
                }
                return;
            }
            
            const user = await fetchUser(userId);
            
            if (!user) {
                const errorMsg = `User not found: ${userId}`;
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                return;
            }
            
            const avatarUrl = user.avatar 
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=256`
                : null;
            
            const avatarLinks = user.avatar ? formatAvatarLinks(user.avatar, user.id) : "None";
            
            const bannerUrl = user.banner ? getBannerUrl(user.id, user.banner) : null;
            const bannerLink = bannerUrl ? maskUrl("View Banner", bannerUrl) : "None";
            
            const accentColor = user.accent_color ? `#${user.accent_color.toString(16).padStart(6, '0')}` : "None";
            const badges = decodeBadges(user.public_flags || 0);
            
            const createdDate = user.created_at 
                ? formatTimestamp(Date.parse(user.created_at)) 
                : formatTimestampFromSnowflake(user.id);
            
            let decorationLinks = "None";
            let skuInfo = null;
            if (user.avatar_decoration) {
                const decoUrl = `https://cdn.discordapp.com/avatar-decoration-presets/${user.avatar_decoration}.png?size=256`;
                decorationLinks = `${maskUrl("PNG", decoUrl)} | ${maskUrl("JPG", decoUrl)} | ${maskUrl("WebP", decoUrl)}`;
                skuInfo = user.avatar_decoration;
            }
            
            const fields = [
                { name: "Username", value: user.username, inline: true },
                { name: "Display Name", value: user.global_name || user.username, inline: true },
                { name: "Mention", value: `<@${user.id}>`, inline: true },
                { name: "Created", value: createdDate, inline: true },
                { name: "Avatar", value: avatarLinks, inline: true },
                { name: "Banner", value: bannerLink, inline: true },
                { name: "Accent Color", value: accentColor, inline: true },
                { name: "Badges", value: badges, inline: false },
                { name: "Bot", value: user.bot ? "Yes" : "No", inline: true }
            ];
            
            if (user.avatar_decoration) {
                fields.push(
                    { name: "Avatar Decoration", value: decorationLinks, inline: true },
                    { name: "SKU", value: skuInfo, inline: false }
                );
            }
            
            fields.push({ name: "ID", value: `\`${user.id}\``, inline: false });
            
            const embed = {
                color: EMBED_COLOR(),
                type: "rich",
                author: { name: user.username, icon_url: avatarUrl },
                image: bannerUrl ? { url: bannerUrl } : undefined,
                fields: fields
            };
            
            if (isEphemeral) {
                return {
                    type: 4,
                    data: {
                        embeds: [embed],
                        flags: 64
                    }
                };
            } else {
                const messageMods = {
                    ...authorMods,
                    interaction: {
                        name: "/userinfo",
                        user: findByStoreName("UserStore").getCurrentUser(),
                    },
                };
                sendMessage({
                    loggingName: "UserInfo output",
                    channelId: ctx.channel.id,
                    embeds: [embed],
                }, messageMods);
                return null;
            }
        } catch (error) {
            console.error("[UserInfo] Error:", error);
            return null;
        }
    }
});

async function getServerEmbed(guildId) {
    const cached = findByStoreName("GuildStore")?.getGuild?.(guildId);
    let timer;
    let fetched;
    try {
        fetched = await Promise.race([
            fetchGuild(guildId),
            new Promise(resolve => { timer = setTimeout(() => resolve(null), 8000); }),
        ]);
    } finally { clearTimeout(timer); }
    if (!fetched && !cached) throw new Error("Server details are unavailable. Try again later.");
    const guild = { ...cached, ...fetched, id: guildId };
    const aliases = { owner_id: "ownerId", approximate_member_count: "memberCount", approximate_presence_count: "presenceCount", premium_tier: "premiumTier", premium_subscription_count: "premiumSubscriberCount", verification_level: "verificationLevel", nsfw_level: "nsfwLevel", mfa_level: "mfaLevel", explicit_content_filter: "explicitContentFilter", afk_timeout: "afkTimeout", preferred_locale: "preferredLocale", widget_enabled: "widgetEnabled", vanity_url_code: "vanityURLCode", discovery_splash: "discoverySplash" };
    for (const [key, alias] of Object.entries(aliases)) guild[key] ??= cached?.[alias];
    guild.features = Array.from(guild.features ?? []);
            const featureMap = {
                "ANIMATED_ICON": "Animated Icon",
                "ANIMATED_BANNER": "Animated Banner",
                "BANNER": "Banner",
                "COMMUNITY": "Community",
                "DISCOVERABLE": "Discoverable",
                "INVITE_SPLASH": "Invite Splash",
                "MEMBER_VERIFICATION_GATE_ENABLED": "Member Verification",
                "NEWS": "News Channels",
                "SOUNDBOARD": "Soundboard",
                "VANITY_URL": "Vanity URL",
                "WIDGET_ENABLED": "Widget Enabled"
            };
            
            const verificationMap = { 0: "None", 1: "Low", 2: "Medium", 3: "High", 4: "Highest" };
            const nsfwLevelMap = { 0: "Default", 1: "Explicit", 2: "Safe", 3: "Age Restricted" };
            const mfaLevelMap = { 0: "None", 1: "Elevated" };
            const explicitContentFilterMap = { 0: "Disabled", 1: "Members Without Roles", 2: "All Members" };
            
            const features = (guild.features || [])
                .map(f => featureMap[f] || f)
                .sort()
                .slice(0, 15)
                .join(", ");
            
            const iconUrl = guild.icon ? getGuildIconUrl(guild.id, guild.icon) : null;
            const bannerUrl = guild.banner ? getGuildBannerUrl(guild.id, guild.banner) : null;
            const splashUrl = guild.splash ? getGuildSplashUrl(guild.id, guild.splash) : null;
            const discoverySplashUrl = guild.discovery_splash ? getGuildDiscoverySplashUrl(guild.id, guild.discovery_splash) : null;
            
            const createdDate = guild.created_at 
                ? formatTimestamp(Date.parse(guild.created_at)) 
                : formatTimestampFromSnowflake(guild.id);
            
            const memberCount = guild.approximate_member_count;
            const presenceCount = guild.approximate_presence_count;
            const onlinePercentage = memberCount > 0 ? Math.round((presenceCount / memberCount) * 100) : 0;
            
            const afkTimeout = guild.afk_timeout ? `${guild.afk_timeout / 60} minutes` : "Not set";
            const preferredLocale = guild.preferred_locale || "en-US";
            
            const fields = [
                { name: "Owner ID", value: `\`${guild.owner_id || "Unknown"}\``, inline: true },
                { name: "Created", value: createdDate, inline: true },
                { name: "Members", value: `${memberCount == null ? "Unknown" : memberCount.toLocaleString()} total\n${presenceCount == null ? "Unknown" : presenceCount.toLocaleString()} online${memberCount > 0 && presenceCount != null ? ` (${onlinePercentage}%)` : ""}`, inline: true },
                { name: "Boosts", value: `Level ${guild.premium_tier || 0}\n${guild.premium_subscription_count || 0} boosts`, inline: true },
                { name: "Verification", value: (guild.verification_level == null ? "Unknown" : verificationMap[guild.verification_level] ?? "Unknown"), inline: true },
                { name: "NSFW Level", value: (guild.nsfw_level == null ? "Unknown" : nsfwLevelMap[guild.nsfw_level] ?? "Unknown"), inline: true },
                { name: "MFA Level", value: (guild.mfa_level == null ? "Unknown" : mfaLevelMap[guild.mfa_level] ?? "Unknown"), inline: true },
                { name: "Explicit Content", value: (guild.explicit_content_filter == null ? "Unknown" : explicitContentFilterMap[guild.explicit_content_filter] ?? "Unknown"), inline: true },
                { name: "AFK Timeout", value: afkTimeout, inline: true },
                { name: "Locale", value: preferredLocale, inline: true },
                { name: "Widget", value: guild.widget_enabled == null ? "Unknown" : guild.widget_enabled ? "Enabled" : "Disabled", inline: true },
                { name: "Features", value: features || "None", inline: false }
            ];
            
            if (guild.vanity_url_code) {
                fields.push({ name: "Vanity URL", value: `discord.gg/${guild.vanity_url_code}`, inline: true });
            }
            
            fields.push({ name: "ID", value: `\`${guild.id}\``, inline: false });
            
            const embed = {
                color: EMBED_COLOR(),
                type: "rich",
                title: guild.name,
                description: guild.description || "No description.",
                thumbnail: iconUrl ? { url: iconUrl } : undefined,
                image: bannerUrl || splashUrl || discoverySplashUrl ? { url: bannerUrl || splashUrl || discoverySplashUrl } : undefined,
                fields: fields
            };
            
    return { ...embed, cachedOnly: !fetched };
}
// Invite Info Command
const inviteInfoCommand = common.cmdDisplays({
    type: 1,
    inputType: 1,
    applicationId: "-1",
    name: "inviteinfo",
    description: "Get server information from an invite code or URL",
    options: [
        {
            required: true,
            type: 3,
            name: "invite",
            description: "Invite code or URL (e.g., discord.gg/example)",
        },
        {
            required: false,
            type: 5,
            name: "ephemeral",
            description: "Send as ephemeral message",
        }
    ],
    execute: async (args, ctx) => {
        try {
            let inviteInput = args.find(a => a.name === "invite")?.value;
            const isEphemeral = args.find(a => a.name === "ephemeral")?.value || false;
            
            if (!inviteInput) {
                if (isEphemeral) {
                    return { type: 4, data: { content: "Please provide an invite code or URL.", flags: 64 } };
                }
                return;
            }
            
            const extractInviteCode = (input) => {
                const urlMatch = input.match(/(?:discord\.gg\/|discord\.com\/invite\/)([a-zA-Z0-9_-]+)/);
                if (urlMatch) return urlMatch[1];
                const codeMatch = input.match(/^([a-zA-Z0-9_-]+)/);
                if (codeMatch) return codeMatch[1];
                return input;
            };
            
            const inviteCode = extractInviteCode(inviteInput);
            const invite = await fetchInvite(inviteCode);
            
            if (!invite || !invite.guild) {
                const errorMsg = `Invalid or expired invite: ${inviteCode}`;
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                return;
            }
            
            const guild = invite.guild;
            const memberCount = invite.approximate_member_count || 0;
            const onlineCount = invite.approximate_presence_count || 0;
            const onlinePercentage = memberCount > 0 ? Math.round((onlineCount / memberCount) * 100) : 0;
            
            const createdDate = guild.created_at 
                ? formatTimestamp(Date.parse(guild.created_at)) 
                : formatTimestampFromSnowflake(guild.id);
            
            const expiresText = invite.expires_at ? formatDate(Date.parse(invite.expires_at)) : "Never";
            const inviteUrl = `https://discord.gg/${invite.code}`;
            
            const iconUrl = guild.icon ? getGuildIconUrl(guild.id, guild.icon) : null;
            
            const fields = [
                { name: "Members", value: `${memberCount.toLocaleString()} total\n${onlineCount.toLocaleString()} online (${onlinePercentage}%)`, inline: true },
                { name: "Created", value: createdDate, inline: true },
                { name: "Boosts", value: `Level ${guild.premium_tier || 0}\n${guild.premium_subscription_count || 0} boosts`, inline: true },
                { name: "Invite URL", value: maskUrl(inviteUrl, inviteUrl), inline: true },
                { name: "Invite Code", value: `\`${invite.code}\``, inline: true },
                { name: "Channel", value: `#${invite.channel?.name || "Unknown"}`, inline: true },
                { name: "Channel ID", value: `\`${invite.channel?.id || "Unknown"}\``, inline: true },
                { name: "Inviter", value: invite.inviter?.username || "Vanity URL", inline: true },
                { name: "Inviter ID", value: invite.inviter ? `\`${invite.inviter.id}\`` : "N/A", inline: true },
                { name: "Expires", value: expiresText, inline: true },
                { name: "Max Uses", value: invite.max_uses?.toString() || "Unlimited", inline: true },
                { name: "Server ID", value: `\`${guild.id}\``, inline: false }
            ];
            
            const embed = {
                color: EMBED_COLOR(),
                type: "rich",
                title: guild.name,
                description: guild.description || "No description.",
                thumbnail: iconUrl ? { url: iconUrl } : undefined,
                fields: fields
            };
            
            if (isEphemeral) {
                return {
                    type: 4,
                    data: {
                        embeds: [embed],
                        flags: 64
                    }
                };
            } else {
                const messageMods = {
                    ...authorMods,
                    interaction: {
                        name: "/inviteinfo",
                        user: findByStoreName("UserStore").getCurrentUser(),
                    },
                };
                sendMessage({
                    loggingName: "InviteInfo output",
                    channelId: ctx.channel.id,
                    embeds: [embed],
                }, messageMods);
                return null;
            }
        } catch (error) {
            console.error("[InviteInfo] Error:", error);
            return null;
        }
    }
});

const patches = [];
let active = false;
return {
    onLoad() {
        if (active) return;
        active = true;
        for (const command of [userInfoCommand, inviteInfoCommand]) {
            try { patches.push(registerCommand(command)); }
            catch (error) { console.error("[InfoCommands] Command registration failed", error); }
        }
        try { patches.push(installServerMenu(id => openServerInfo(id, getServerEmbed))); }
        catch (error) { console.error("[InfoCommands] Server menu unavailable", error); }
    },
    onUnload() {
        active = false;
        disposeServerMenu();
        for (const unpatch of patches.splice(0).reverse()) {
            try { unpatch?.(); } catch {}
        }
        madeSendMessage = undefined;
    },
};

})()
