(() => {
var InfoCommandsBundle = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/plugin.js
  var plugin_exports = {};
  __export(plugin_exports, {
    default: () => plugin_default
  });

  // src/common.js
  function mSendMessage(vendetta2) {
    const {
      metro: {
        findByProps: findByProps4,
        findByStoreName: findByStoreName3,
        common: {
          lodash: { merge }
        }
      }
    } = vendetta2;
    const Send = findByProps4("_sendMessage");
    const { createBotMessage } = findByProps4("createBotMessage");
    const Avatars = findByProps4("BOT_AVATARS");
    const { getChannelId: getFocusedChannelId } = findByStoreName3("SelectedChannelStore");
    return function(message, mod) {
      var _a;
      message.channelId ?? (message.channelId = getFocusedChannelId());
      if ([null, void 0].includes(message.channelId)) throw new Error("No channel id to receive the message into (channelId)");
      let msg = message;
      if (message.really) {
        if (typeof mod === "object") msg = merge(msg, mod);
        const args = [msg, {}];
        (_a = args[0]).tts ?? (_a.tts = false);
        for (const key of ["allowedMentions", "messageReference"]) {
          if (key in args[0]) {
            args[1][key] = args[0][key];
            delete args[0][key];
          }
        }
        const overwriteKey = "overwriteSendMessageArg2";
        if (overwriteKey in args[0]) {
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
              author.avatar ?? (author.avatar = author.avatarURL);
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
    obj.displayName ?? (obj.displayName = translations?.names?.[locale] ?? obj.name);
    obj.displayDescription ?? (obj.displayDescription = translations?.names?.[locale] ?? obj.description);
    if (obj.options) {
      if (!Array.isArray(obj.options)) throw new Error(`Options is not an array (received: ${typeof obj.options})`);
      for (let optionIndex = 0; optionIndex < obj.options.length; optionIndex++) {
        const option = obj.options[optionIndex];
        if (!option?.name || !option?.description) throw new Error(`No name(${option?.name}) or description(${option?.description} in the option with index ${optionIndex}`);
        option.displayName ?? (option.displayName = translations?.options?.[optionIndex]?.names?.[locale] ?? option.name);
        option.displayDescription ?? (option.displayDescription = translations?.options?.[optionIndex]?.descriptions?.[locale] ?? option.description);
        if (option?.choices) {
          if (!Array.isArray(option?.choices)) throw new Error(`Choices is not an array (received: ${typeof option.choices})`);
          for (let choiceIndex = 0; choiceIndex < option.choices.length; choiceIndex++) {
            const choice = option.choices[choiceIndex];
            if (!choice?.name) throw new Error(`No name of choice with index ${choiceIndex} in option with index ${optionIndex}`);
            choice.displayName ?? (choice.displayName = translations?.options?.[optionIndex]?.choices?.[choiceIndex]?.names?.[locale] ?? choice.name);
          }
        }
      }
    }
    return obj;
  }
  var AVATARS = { command: "https://cdn.discordapp.com/attachments/1099116247364407337/1112129955053187203/command.png" };

  // src/embeds.js
  var { findByProps } = vendetta.metro;
  var API = findByProps("get", "post");
  var DISCORD_EPOCH = 14200704e5;
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
    return `<t:${Math.floor(timestamp / 1e3)}:R>`;
  }
  function formatTimestampFromSnowflake(snowflake) {
    const timestamp = snowflakeToTimestamp(snowflake);
    if (!timestamp) return "Unknown";
    return formatTimestamp(timestamp);
  }
  function formatDate(timestamp) {
    if (!timestamp) return "Unknown";
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
      gif: isGif ? `${baseUrl}.gif?size=1024` : void 0
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
  function getGuildIconUrl(guildId2, iconHash) {
    if (!iconHash) return null;
    return `https://cdn.discordapp.com/icons/${guildId2}/${iconHash}.png?size=1024`;
  }
  function getGuildBannerUrl(guildId2, bannerHash) {
    if (!bannerHash) return null;
    return `https://cdn.discordapp.com/banners/${guildId2}/${bannerHash}.png?size=1024`;
  }
  function getGuildSplashUrl(guildId2, splashHash) {
    if (!splashHash) return null;
    return `https://cdn.discordapp.com/splashes/${guildId2}/${splashHash}.png?size=1024`;
  }
  function getGuildDiscoverySplashUrl(guildId2, discoverySplashHash) {
    if (!discoverySplashHash) return null;
    return `https://cdn.discordapp.com/discovery-splashes/${guildId2}/${discoverySplashHash}.png?size=1024`;
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
  async function fetchGuild(guildId2) {
    try {
      const response = await API.get({ url: `/guilds/${guildId2}?with_counts=true` });
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

  // src/server-info/runtime.tsx
  var { React, ReactNative: RN } = vendetta.metro.common;
  var optional = (fn) => {
    try {
      return fn();
    } catch {
      return void 0;
    }
  };
  function color(name, fallback) {
    const theme = optional(() => vendetta.metro.findByStoreName("ThemeStore")?.theme);
    return optional(() => vendetta.metro.findByProps("colors", "meta")?.meta?.resolveSemanticColor(
      theme,
      vendetta.ui.semanticColors?.[name]
    )) ?? fallback;
  }
  function Text({ children, color: semantic, variant, lineClamp, style, ...props2 }) {
    const light = optional(() => vendetta.metro.findByStoreName("ThemeStore")?.theme) === "light";
    const name = semantic === "text-link" ? "TEXT_LINK" : semantic === "text-subtle" ? "TEXT_MUTED" : "TEXT_NORMAL";
    return React.createElement(RN.Text, {
      ...props2,
      numberOfLines: lineClamp,
      style: [{
        color: color(name, name === "TEXT_LINK" ? "#8ea1ff" : light ? "#1e1f22" : "#f2f3f5"),
        fontSize: variant?.includes("lg") ? 20 : variant?.includes("sm") ? 13 : 15,
        fontWeight: /semibold|medium/.test(variant ?? "") ? "600" : "400"
      }, style]
    }, children);
  }
  function TrailingText({ text }) {
    return React.createElement(Text, { color: "text-subtle" }, text ?? "—");
  }
  function TableRow({ label, subLabel, trailing, onPress, disabled }) {
    return React.createElement(RN.TouchableOpacity, {
      onPress,
      disabled: disabled || !onPress,
      accessibilityRole: onPress ? "button" : void 0,
      accessibilityLabel: label,
      style: { padding: 14, flexDirection: "row", alignItems: "center", gap: 8 }
    }, React.createElement(
      RN.View,
      { style: { flex: 1 } },
      React.createElement(Text, { variant: "text-md/medium" }, label),
      subLabel ? React.createElement(Text, { color: "text-subtle", style: { marginTop: 4 } }, subLabel) : null
    ), trailing);
  }
  TableRow.TrailingText = TrailingText;
  function TableRowGroup({ title, children }) {
    const light = optional(() => vendetta.metro.findByStoreName("ThemeStore")?.theme) === "light";
    return React.createElement(
      RN.View,
      { style: { paddingHorizontal: 16, gap: 8 } },
      React.createElement(Text, { variant: "text-sm/normal", color: "text-subtle" }, title),
      React.createElement(RN.View, { style: {
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: color("BACKGROUND_SECONDARY", light ? "#f2f3f5" : "#2b2d31")
      } }, children)
    );
  }
  var nativeRow = optional(() => vendetta.metro.findByProps("TableRow")?.TableRow);
  var NativeGroup = optional(() => vendetta.metro.findByProps("TableRowGroup")?.TableRowGroup);
  var useReRender = () => React.useReducer((value) => value + 1, 0)[1];
  var runtime = {
    react: { React, ReactNative: RN },
    utils: { react: { useReRender } },
    discord: { design: { Design: {
      get ActionSheet() {
        return optional(() => vendetta.metro.findByProps("ActionSheet")?.ActionSheet) ?? RN.View;
      },
      Text,
      TableRow: nativeRow?.TrailingText ? nativeRow : TableRow,
      TableRowGroup: nativeRow?.TrailingText && NativeGroup ? NativeGroup : TableRowGroup,
      space: { PX_16: 16, PX_12: 12 }
    } } },
    modules: { finders: {
      filters: { withProps: (...props2) => props2 },
      lookupModule: (props2) => [optional(() => vendetta.metro.findByProps(...props2))]
    } }
  };

  // src/server-info/ui/format.ts
  var formatCount = (n) => n == null ? "—" : n.toLocaleString();

  // src/server-info/ui/OverviewRows.tsx
  function OverviewRows({
    memberCount,
    onlineCount,
    roleCount,
    channelCount,
    boostLabel,
    premiumTier
  }) {
    const { TableRow: TableRow2, TableRowGroup: TableRowGroup2 } = runtime.discord.design.Design;
    return /* @__PURE__ */ runtime.react.React.createElement(TableRowGroup2, { title: "Overview" }, /* @__PURE__ */ runtime.react.React.createElement(
      TableRow2,
      {
        label: "Members",
        trailing: /* @__PURE__ */ runtime.react.React.createElement(TableRow2.TrailingText, { text: formatCount(memberCount) })
      }
    ), /* @__PURE__ */ runtime.react.React.createElement(
      TableRow2,
      {
        label: "Online",
        trailing: /* @__PURE__ */ runtime.react.React.createElement(TableRow2.TrailingText, { text: formatCount(onlineCount) })
      }
    ), /* @__PURE__ */ runtime.react.React.createElement(
      TableRow2,
      {
        label: "Roles",
        trailing: /* @__PURE__ */ runtime.react.React.createElement(TableRow2.TrailingText, { text: formatCount(roleCount) })
      }
    ), /* @__PURE__ */ runtime.react.React.createElement(
      TableRow2,
      {
        label: "Channels",
        trailing: /* @__PURE__ */ runtime.react.React.createElement(TableRow2.TrailingText, { text: formatCount(channelCount) })
      }
    ), /* @__PURE__ */ runtime.react.React.createElement(
      TableRow2,
      {
        label: "Boost Level",
        subLabel: boostLabel,
        trailing: /* @__PURE__ */ runtime.react.React.createElement(TableRow2.TrailingText, { text: `Level ${premiumTier}` })
      }
    ));
  }

  // src/server-info/ui/ServerBanner.tsx
  function ServerBanner({ uri, bleed = 28, height = 140, scrollY }) {
    const RN3 = runtime.react.ReactNative;
    const Animated = RN3.Animated;
    const Image = RN3.Image;
    const AnimatedView = Animated && Animated.View ? Animated.View : RN3.View;
    const translate = Animated && scrollY ? Animated.multiply(scrollY, -1) : void 0;
    return /* @__PURE__ */ runtime.react.React.createElement(
      AnimatedView,
      {
        pointerEvents: "none",
        style: {
          position: "absolute",
          top: 0,
          left: -bleed,
          right: -bleed,
          height,
          overflow: "hidden",
          transform: translate ? [{ translateY: translate }] : void 0
        }
      },
      /* @__PURE__ */ runtime.react.React.createElement(Image, { source: { uri }, style: { width: "100%", height: "100%", resizeMode: "cover" } })
    );
  }

  // src/server-info/ui/ServerHeader.tsx
  function ServerHeader({
    name,
    description,
    iconUri
  }) {
    const { View, Image } = runtime.react.ReactNative;
    const { Text: Text2 } = runtime.discord.design.Design;
    return /* @__PURE__ */ runtime.react.React.createElement(
      View,
      {
        style: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingTop: 16,
          paddingBottom: 8
        }
      },
      iconUri != null && /* @__PURE__ */ runtime.react.React.createElement(
        Image,
        {
          source: { uri: iconUri },
          style: { width: 56, height: 56, borderRadius: 14 }
        }
      ),
      /* @__PURE__ */ runtime.react.React.createElement(View, { style: { flex: 1 } }, /* @__PURE__ */ runtime.react.React.createElement(Text2, { variant: "text-lg/semibold", color: "text-default", lineClamp: 1 }, name), description != null && description.length > 0 && /* @__PURE__ */ runtime.react.React.createElement(Text2, { variant: "text-sm/normal", color: "text-subtle", lineClamp: 2 }, description))
    );
  }

  // src/server-info/modules.ts
  var optional2 = (fn) => {
    try {
      return fn();
    } catch {
      return void 0;
    }
  };
  var store = (name) => optional2(() => vendetta.metro.findByStoreName(name));
  var props = (...keys) => optional2(() => vendetta.metro.findByProps(...keys));
  var getGuildStore = () => store("GuildStore");
  var getBasicGuildStore = () => store("BasicGuildStore");
  var getUserStore = () => store("UserStore");
  var getGuildRoleStore = () => store("GuildRoleStore");
  var getGuildChannelStore = () => store("GuildChannelStore");
  var getGuildMemberStore = () => store("GuildMemberStore");
  var getRelationshipStore = () => store("RelationshipStore");
  var getGuildMemberCountStore = () => store("GuildMemberCountStore") ?? props("getMemberCount", "getOnlineCount");
  var getGuildHeaderCountsStore = () => store("GuildHeaderCountsStore") ?? getGuildMemberCountStore();
  function getHTTPUtils() {
    const http = props("get", "post");
    return http?.get ? { get: (url) => http.get({ url }) } : void 0;
  }
  function getRequestMembersById() {
    const actions = props("requestMembersById");
    return actions?.requestMembersById ? (...args) => actions.requestMembersById(...args) : void 0;
  }
  function openUserProfileSheet(options) {
    const actions = props("openLazy", "hideActionSheet") ?? props("hideActionSheet");
    for (const method of ["openUserProfileModal", "openUserProfile", "showUserProfile"]) {
      const module = props(method);
      if (typeof module?.[method] !== "function") continue;
      try {
        actions?.hideActionSheet?.(`info-commands-server-info-${options.guildId}`);
        Promise.resolve(module[method](options)).catch(() => notify("Unable to open profile. Try again."));
        return;
      } catch {
      }
    }
    notify("Profiles are unavailable on this Discord version");
  }
  function notify(text) {
    optional2(() => vendetta.ui.toasts.showToast(text));
  }
  function copyServerId(id) {
    const clipboard = vendetta.metro.common.clipboard;
    if (clipboard?.setString) {
      clipboard.setString(id);
      notify("Server ID copied");
    }
  }

  // src/server-info/ui/ServerRows.tsx
  function ServerRows({
    guildId: guildId2,
    ownerId,
    ownerDisplayName,
    ownerAvatarUri,
    createdLabel
  }) {
    const { View, Image } = runtime.react.ReactNative;
    const { TableRow: TableRow2, TableRowGroup: TableRowGroup2, Text: Text2 } = runtime.discord.design.Design;
    return /* @__PURE__ */ runtime.react.React.createElement(TableRowGroup2, { title: "Server" }, /* @__PURE__ */ runtime.react.React.createElement(
      TableRow2,
      {
        label: "Owner",
        trailing: /* @__PURE__ */ runtime.react.React.createElement(
          View,
          {
            style: {
              flexDirection: "row",
              alignItems: "center",
              gap: 8
            }
          },
          ownerAvatarUri != null && /* @__PURE__ */ runtime.react.React.createElement(
            Image,
            {
              source: { uri: ownerAvatarUri },
              style: { width: 24, height: 24, borderRadius: 12 }
            }
          ),
          /* @__PURE__ */ runtime.react.React.createElement(
            Text2,
            {
              variant: "text-md/medium",
              color: ownerId ? "text-link" : "text-default"
            },
            ownerDisplayName ?? "—"
          )
        ),
        onPress: ownerId ? () => {
          openUserProfileSheet({
            userId: ownerId,
            guildId: guildId2,
            ignoreBlockedSpeedBump: false
          });
        } : void 0
      }
    ), /* @__PURE__ */ runtime.react.React.createElement(
      TableRow2,
      {
        label: "Created",
        trailing: /* @__PURE__ */ runtime.react.React.createElement(TableRow2.TrailingText, { text: createdLabel })
      }
    ), /* @__PURE__ */ runtime.react.React.createElement(
      TableRow2,
      {
        label: "ID",
        trailing: /* @__PURE__ */ runtime.react.React.createElement(TableRow2.TrailingText, { text: guildId2 }),
        onPress: () => copyServerId(guildId2)
      }
    ));
  }

  // src/server-info/data.ts
  function assetUrl(path, hash, size = 128) {
    return hash ? `https://cdn.discordapp.com/${path}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=${size}` : void 0;
  }
  function normalizeGuild(id, cached, fetched) {
    if (!cached?.name && !fetched?.name) return void 0;
    const guild = { ...cached, ...fetched, id };
    const aliases = {
      ownerId: "owner_id",
      memberCount: "approximate_member_count",
      onlineCount: "approximate_presence_count",
      premiumTier: "premium_tier",
      premiumSubscriptionCount: "premium_subscription_count"
    };
    for (const [key, snake] of Object.entries(aliases)) guild[key] = fetched?.[snake] ?? fetched?.[key] ?? cached?.[key] ?? cached?.[snake];
    guild.premiumSubscriptionCount ?? (guild.premiumSubscriptionCount = cached?.premiumSubscriberCount);
    return guild;
  }
  function countChannels(value) {
    if (value == null) return void 0;
    const ids = /* @__PURE__ */ new Set();
    const seen = /* @__PURE__ */ new Set();
    function walk(node) {
      if (!node || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);
      const channel = node.channel ?? node;
      if (typeof channel.id === "string") {
        ids.add(channel.id);
        return;
      }
      for (const child of Object.values(node)) walk(child);
    }
    walk(value);
    return ids.size;
  }
  function creationLabel(id) {
    try {
      return new Date(Number((BigInt(id) >> 22n) + 1420070400000n)).toLocaleDateString(void 0, {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    } catch {
      return void 0;
    }
  }

  // src/server-info/ui/FriendsRows.tsx
  var VISIBLE_LIMIT = 5;
  function FriendsRows({ guildId: guildId2, friends, loading }) {
    const { React: React3 } = runtime.react;
    const { View, Image } = runtime.react.ReactNative;
    const { TableRow: TableRow2, TableRowGroup: TableRowGroup2, Text: Text2 } = runtime.discord.design.Design;
    const [expanded, setExpanded] = React3.useState(false);
    const visibleFriends = expanded ? friends : friends.slice(0, VISIBLE_LIMIT);
    const hasMore = friends.length > VISIBLE_LIMIT;
    return /* @__PURE__ */ runtime.react.React.createElement(TableRowGroup2, { title: "Friends in Server" }, friends.length === 0 ? /* @__PURE__ */ runtime.react.React.createElement(TableRow2, { label: loading ? "Loading friends…" : "No cached friends in this server", disabled: true }) : /* @__PURE__ */ runtime.react.React.createElement(runtime.react.React.Fragment, null, visibleFriends.map(({ userId, displayName, avatarHash, nick }) => {
      const avatarUri = assetUrl(`avatars/${userId}`, avatarHash, 128);
      return /* @__PURE__ */ runtime.react.React.createElement(
        TableRow2,
        {
          key: userId,
          label: nick ? `${nick} (${displayName})` : displayName,
          trailing: /* @__PURE__ */ runtime.react.React.createElement(
            View,
            {
              style: {
                flexDirection: "row",
                alignItems: "center",
                gap: 8
              }
            },
            avatarUri != null && /* @__PURE__ */ runtime.react.React.createElement(
              Image,
              {
                source: { uri: avatarUri },
                style: { width: 28, height: 28, borderRadius: 14 }
              }
            )
          ),
          onPress: () => {
            openUserProfileSheet({
              userId,
              guildId: guildId2,
              ignoreBlockedSpeedBump: false
            });
          }
        }
      );
    }), hasMore && /* @__PURE__ */ runtime.react.React.createElement(
      TableRow2,
      {
        label: expanded ? `Show less (${friends.length})` : `Show all ${friends.length} friends`,
        color: "text-default",
        onPress: () => setExpanded(!expanded)
      }
    )));
  }

  // src/server-info/ui/useGuildInfo.ts
  function cachedGuild(id) {
    return getGuildStore()?.getGuild?.(id) ?? getBasicGuildStore()?.getGuild?.(id);
  }
  function optional3(fn) {
    try {
      return fn();
    } catch {
      return void 0;
    }
  }
  function useGuildInfo(guildId2) {
    const { React: React3 } = runtime.react;
    const forceUpdate = runtime.utils.react.useReRender();
    const [remoteGuild, setRemoteGuild] = React3.useState(null);
    const [pending, setPending] = React3.useState(true);
    const [ownerUser, setOwnerUser] = React3.useState(null);
    const [friendsPending, setFriendsPending] = React3.useState(false);
    const guild = normalizeGuild(guildId2, optional3(() => cachedGuild(guildId2)), remoteGuild);
    React3.useEffect(() => {
      const stores = [
        getGuildStore(),
        getBasicGuildStore(),
        getUserStore(),
        getGuildRoleStore(),
        getGuildChannelStore(),
        getGuildMemberCountStore(),
        getGuildHeaderCountsStore(),
        getGuildMemberStore(),
        getRelationshipStore()
      ].filter(Boolean);
      const distinct = [...new Set(stores)];
      for (const store2 of distinct) optional3(() => store2.addChangeListener?.(forceUpdate));
      return () => {
        for (const store2 of distinct) optional3(() => store2.removeChangeListener?.(forceUpdate));
      };
    }, [guildId2, forceUpdate]);
    React3.useEffect(() => {
      let cancelled = false;
      let timer;
      setPending(true);
      const http = getHTTPUtils();
      const request = Promise.resolve().then(() => http?.get(`/guilds/${guildId2}?with_counts=true`));
      Promise.race([request, new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), 8e3);
      })]).then((response) => {
        if (!cancelled) setRemoteGuild(response?.body ?? null);
      }).catch(() => {
        if (!cancelled) setRemoteGuild(null);
      }).finally(() => {
        clearTimeout(timer);
        if (!cancelled) setPending(false);
      });
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [guildId2]);
    const ownerId = guild?.ownerId ?? null;
    React3.useEffect(() => {
      let cancelled = false;
      setOwnerUser(null);
      if (!ownerId) return;
      const cached = getUserStore()?.getUser?.(ownerId);
      if (cached?.username || cached?.globalName) {
        setOwnerUser(cached);
        return;
      }
      Promise.resolve().then(() => getHTTPUtils()?.get(`/users/${ownerId}`)).then((response) => {
        if (!cancelled) setOwnerUser(response?.body ?? null);
      }).catch(() => {
      });
      return () => {
        cancelled = true;
      };
    }, [ownerId]);
    React3.useEffect(() => {
      const ids = getRelationshipStore()?.getFriendIDs?.() ?? [];
      const request = getRequestMembersById();
      if (!ids.length || !request) return;
      setFriendsPending(true);
      optional3(() => request(guildId2, ids, false));
      const timer = setTimeout(() => setFriendsPending(false), 1500);
      return () => clearTimeout(timer);
    }, [guildId2]);
    const userStore = getUserStore();
    const memberStore = getGuildMemberStore();
    const owner = ownerId ? userStore?.getUser?.(ownerId) ?? ownerUser : null;
    const friendIds = getRelationshipStore()?.getFriendIDs?.() ?? [];
    const friends = friendIds.filter((id) => memberStore?.getMember?.(guildId2, id) != null).map((id) => {
      const user = userStore?.getUser?.(id);
      return {
        userId: id,
        displayName: user?.globalName ?? user?.global_name ?? user?.username ?? "Unknown",
        avatarHash: user?.avatar,
        nick: memberStore?.getMember?.(guildId2, id)?.nick
      };
    });
    const channelStore = getGuildChannelStore();
    const boostCount = guild?.premiumSubscriptionCount;
    return {
      guild,
      isLoading: !guild && pending,
      error: !guild && !pending ? "Server details are unavailable. Try again later." : null,
      cachedOnly: !pending && !remoteGuild,
      ownerId,
      ownerDisplayName: owner?.globalName ?? owner?.global_name ?? owner?.username ?? ownerId,
      ownerAvatarUri: assetUrl(`avatars/${ownerId}`, owner?.avatar, 64),
      iconUri: assetUrl(`icons/${guildId2}`, guild?.icon, 128),
      bannerUri: assetUrl(`banners/${guildId2}`, guild?.banner, 1024),
      memberCount: getGuildMemberCountStore()?.getMemberCount?.(guildId2) ?? guild?.memberCount,
      onlineCount: getGuildHeaderCountsStore()?.getOnlineCount?.(guildId2) ?? guild?.onlineCount,
      roleCount: getGuildRoleStore()?.getSortedRoles?.(guildId2)?.length ?? (guild?.roles ? Object.keys(guild.roles).length : void 0),
      channelCount: countChannels(optional3(() => channelStore?.getChannels?.(guildId2))),
      boostLabel: boostCount != null ? `${boostCount.toLocaleString()} boost${boostCount === 1 ? "" : "s"}` : void 0,
      premiumTier: guild?.premiumTier ?? 0,
      createdLabel: guild ? creationLabel(guildId2) : void 0,
      friends,
      friendsPending
    };
  }

  // src/server-info/ui/ServerInfoSheet.tsx
  var scrollContainerModule;
  function getScrollContainer() {
    if (scrollContainerModule) return scrollContainerModule;
    try {
      const [exports] = runtime.modules.finders.lookupModule(
        runtime.modules.finders.filters.withProps("BottomSheetScrollView")
      );
      if (exports?.BottomSheetScrollView) {
        scrollContainerModule = exports.BottomSheetScrollView;
      }
    } catch {
    }
    return scrollContainerModule;
  }
  function ServerInfoSheet({ guildId: guildId2, onClose }) {
    const RN3 = runtime.react.ReactNative;
    const { View, ActivityIndicator, ScrollView } = RN3;
    const Animated = RN3.Animated;
    const React3 = runtime.react.React;
    const Design = runtime.discord.design.Design;
    const { ActionSheet, Text: Text2 } = Design;
    const sideInset = Design?.space?.PX_16 ?? 16;
    const extraBleed = 12;
    const bleed = sideInset + extraBleed;
    const BANNER_HEIGHT = 140;
    const bannerSpacing = Design?.space?.PX_12 ?? 12;
    const ScrollContainer = getScrollContainer() ?? ScrollView;
    const { guild, isLoading, ...info } = useGuildInfo(guildId2);
    const [containerWidth, setContainerWidth] = React3.useState(void 0);
    const scrollY = React3.useRef(Animated ? new Animated.Value(0) : { current: 0 }).current;
    if (!guild && !isLoading) return /* @__PURE__ */ runtime.react.React.createElement(ActionSheet, { scrollable: true, startExpanded: true }, /* @__PURE__ */ runtime.react.React.createElement(View, { style: { padding: 24 } }, /* @__PURE__ */ runtime.react.React.createElement(Text2, null, info.error ?? "Server details are unavailable."), /* @__PURE__ */ runtime.react.React.createElement(Text2, { color: "text-link", onPress: onClose }, "Close")));
    if (!guild && isLoading) {
      return /* @__PURE__ */ runtime.react.React.createElement(ActionSheet, { scrollable: true, startExpanded: true }, /* @__PURE__ */ runtime.react.React.createElement(ScrollContainer, { contentContainerStyle: { flexGrow: 1 } }, /* @__PURE__ */ runtime.react.React.createElement(
        View,
        {
          style: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 40
          }
        },
        /* @__PURE__ */ runtime.react.React.createElement(ActivityIndicator, { size: "large", color: "#5865f2" }),
        /* @__PURE__ */ runtime.react.React.createElement(
          Text2,
          {
            variant: "text-md/normal",
            color: "text-subtle",
            style: { marginTop: 12 }
          },
          "Loading server info…"
        ),
        /* @__PURE__ */ runtime.react.React.createElement(Text2, { color: "text-link", onPress: onClose }, "Close")
      )));
    }
    if (!guild) return null;
    return /* @__PURE__ */ runtime.react.React.createElement(
      ActionSheet,
      {
        scrollable: true,
        handleDisabled: true,
        startExpanded: true,
        contentStyles: { paddingHorizontal: 0, paddingBottom: 24 }
      },
      /* @__PURE__ */ runtime.react.React.createElement(View, { style: { width: "100%", position: "relative", overflow: "visible" }, onLayout: (e) => setContainerWidth(e.nativeEvent.layout.width) }, info.bannerUri != null && /* @__PURE__ */ runtime.react.React.createElement(ServerBanner, { uri: info.bannerUri, bleed, height: 140, scrollY }), /* @__PURE__ */ runtime.react.React.createElement(
        ScrollContainer,
        {
          contentContainerStyle: { flexGrow: 1, paddingTop: info.bannerUri != null ? BANNER_HEIGHT + bannerSpacing : 0, paddingBottom: 24, paddingHorizontal: 0, gap: 16 },
          nestedScrollEnabled: true,
          keyboardShouldPersistTaps: "handled",
          showsVerticalScrollIndicator: false,
          onScroll: (e) => {
            const y = e?.nativeEvent?.contentOffset?.y ?? 0;
            if (Animated && typeof scrollY?.setValue === "function") {
              scrollY.setValue(y);
            }
          },
          scrollEventThrottle: 16
        },
        /* @__PURE__ */ runtime.react.React.createElement(
          View,
          {
            style: {
              marginHorizontal: -sideInset,
              paddingHorizontal: sideInset,
              gap: 16,
              paddingTop: 8
            }
          },
          /* @__PURE__ */ runtime.react.React.createElement(
            ServerHeader,
            {
              name: guild.name,
              description: guild.description,
              iconUri: info.iconUri
            }
          ),
          /* @__PURE__ */ runtime.react.React.createElement(Text2, { color: "text-link", onPress: onClose, style: { paddingHorizontal: 16 } }, "Close"),
          info.cachedOnly && /* @__PURE__ */ runtime.react.React.createElement(Text2, { color: "text-subtle", style: { paddingHorizontal: 16 } }, "Showing cached server details."),
          /* @__PURE__ */ runtime.react.React.createElement(OverviewRows, { ...info }),
          /* @__PURE__ */ runtime.react.React.createElement(ServerRows, { guildId: guildId2, ...info }),
          /* @__PURE__ */ runtime.react.React.createElement(FriendsRows, { guildId: guildId2, friends: info.friends, loading: info.friendsPending })
        )
      ))
    );
  }

  // src/server-menu.js
  var { find, findByName, findByProps: findByProps2, findByStoreName } = vendetta.metro;
  var { before, after } = vendetta.patcher;
  var { React: React2, ReactNative: RN2 } = vendetta.metro.common;
  var ITEM_ID = "info-commands-server-info";
  var sheetKey;
  var sheets;
  var contexts;
  var running = false;
  var generation = 0;
  var dynamicPatches = [];
  function optional4(fn) {
    try {
      return fn();
    } catch {
      return void 0;
    }
  }
  function guildId(value) {
    const id = typeof value === "object" && value !== null ? value.guild?.id ?? value.guildId ?? value.guild_id ?? value.id : value;
    return typeof id === "string" && /^\d{5,22}$/.test(id) ? id : null;
  }
  function notify2(text) {
    optional4(() => vendetta.ui.toasts.showToast(text));
  }
  function isInfo(item) {
    return item?.id === ITEM_ID || item?.key === ITEM_ID || item?.label === "Server Info" || item?.props?.label === "Server Info";
  }
  function itemsWithInfo(items, id, open, close) {
    if (!id || !Array.isArray(items) || items.some(isInfo)) return items;
    if (Array.isArray(items[0])) {
      if (items.some((group) => Array.isArray(group) && group.some(isInfo))) return items;
      return [itemsWithInfo(items[0], id, open, close), ...items.slice(1)];
    }
    return [...items, {
      id: ITEM_ID,
      label: "Server Info",
      action() {
        if (!running) return;
        optional4(() => close?.());
        open(id);
      }
    }];
  }
  function installServerMenu(open) {
    if (running) return () => {
    };
    running = true;
    generation++;
    const patches2 = [];
    sheets = optional4(() => findByProps2("openLazy", "hideActionSheet")) ?? optional4(() => findByProps2("openLazy"));
    contexts = optional4(() => findByProps2("showContextMenu"));
    const store2 = optional4(() => findByStoreName("GuildStore"));
    const menu = optional4(() => findByName?.("getGuildsBarGuildMenuItems", false)) ?? optional4(() => find?.((m) => m?.default?.name === "getGuildsBarGuildMenuItems"));
    const holder = typeof menu?.default === "function" ? [menu, "default"] : typeof menu?.getGuildsBarGuildMenuItems === "function" ? [menu, "getGuildsBarGuildMenuItems"] : null;
    if (holder) patches2.push(after(
      holder[1],
      holder[0],
      (args, result) => itemsWithInfo(result, guildId(args?.[0]), open, () => contexts?.hideContextMenu?.())
    ));
    if (typeof contexts?.showContextMenu === "function") {
      patches2.push(before("showContextMenu", contexts, ([menu2]) => {
        try {
          if (!menu2 || !Array.isArray(menu2.items)) return;
          if (menu2.user || menu2.userId || menu2.context?.user || menu2.context?.userId || menu2.message || menu2.channel || menu2.channelId || menu2.context?.channelId) return;
          const target = menu2.guild ?? menu2.context?.guild ?? (menu2.key ? store2?.getGuild?.(String(menu2.key)) : null) ?? (!menu2.key && menu2.guildId ? store2?.getGuild?.(String(menu2.guildId)) : null) ?? (/guild|server/i.test(String(menu2.type ?? menu2.name ?? "")) ? { id: menu2.guildId ?? menu2.context?.guildId } : null);
          menu2.items = itemsWithInfo(menu2.items, guildId(target), open, () => contexts.hideContextMenu?.());
        } catch (error) {
          console.error("[InfoCommands] Context menu patch failed", error);
        }
      }));
    }
    const Row = optional4(() => findByProps2("ActionSheetRow")?.ActionSheetRow);
    let lazyModules = /* @__PURE__ */ new WeakMap();
    if (typeof sheets?.openLazy === "function") {
      patches2.push(before("openLazy", sheets, ([promise, key, props2]) => {
        if (!/guild/i.test(String(key)) || !/menu|context|actions/i.test(String(key))) return;
        const id = guildId(props2?.guild ?? props2);
        if (!id || !promise?.then) return;
        const epoch = generation;
        Promise.resolve(promise).then((module) => {
          if (!running || generation !== epoch || !module) return;
          const context = { id, key };
          if (lazyModules.has(module)) {
            lazyModules.set(module, context);
            return;
          }
          const holder2 = typeof module.default === "function" ? [module, "default"] : typeof module.default?.type === "function" ? [module.default, "type"] : typeof module.default?.render === "function" ? [module.default, "render"] : null;
          if (!holder2) return;
          lazyModules.set(module, context);
          dynamicPatches.push(after(holder2[1], holder2[0], (_, result) => {
            try {
              if (!running) return;
              const target = lazyModules.get(module);
              const tree = vendetta.utils?.findInReactTree;
              const node = optional4(() => tree?.(result, (n) => Array.isArray(n?.props?.items)));
              if (node) {
                node.props.items = itemsWithInfo(node.props.items, target.id, open, () => sheets.hideActionSheet?.(target.key));
                return;
              }
              if (!Row) return;
              const rows = optional4(() => tree?.(result, (n) => Array.isArray(n) && n.some((child) => child?.type === Row || child?.type?.name === "ActionSheetRow" || child?.type?.displayName === "ActionSheetRow")));
              if (!Array.isArray(rows) || rows.some(isInfo)) return;
              rows.push(React2.createElement(Row, {
                key: ITEM_ID,
                label: "Server Info",
                onPress() {
                  if (!running) return;
                  optional4(() => sheets.hideActionSheet?.(target.key));
                  open(target.id);
                }
              }));
            } catch (error) {
              console.error("[InfoCommands] Guild sheet injection failed", error);
            }
          }));
        }).catch((error) => console.error("[InfoCommands] Lazy menu unavailable", error));
      }));
    }
    if (!patches2.length) notify2("InfoCommands: server menu unavailable on this Discord version");
    return () => {
      disposeServerMenu();
      lazyModules = /* @__PURE__ */ new WeakMap();
      for (const unpatch of patches2.splice(0).reverse()) optional4(() => unpatch());
    };
  }
  function plainText(value) {
    return String(value ?? "Unknown").replace(/`/g, "").replace(/<t:(\d+)(?::[a-zA-Z])?>/g, (_, seconds) => new Date(Number(seconds) * 1e3).toLocaleString());
  }
  function copy(value) {
    const clipboard = vendetta.metro.common.clipboard;
    if (typeof clipboard?.setString === "function") {
      clipboard.setString(String(value));
      notify2("Server ID copied");
    } else notify2("Select and copy the server ID below");
  }
  function openOwnerProfile(ownerId, serverId, close) {
    if (!running || !guildId(ownerId)) return;
    for (const method of ["openUserProfileModal", "openUserProfile", "showUserProfile"]) {
      const module = optional4(() => findByProps2(method));
      if (typeof module?.[method] !== "function") continue;
      try {
        close?.();
        Promise.resolve(module[method]({ userId: ownerId, guildId: serverId })).catch(() => notify2("Unable to open the owner's profile. Try again."));
        return;
      } catch (error) {
        console.error("[InfoCommands] Owner profile opener unavailable", error);
      }
    }
    notify2("Owner profiles are unavailable on this Discord version");
  }
  function openServerInfo(id, load) {
    if (!running) return;
    const key = `${ITEM_ID}-${id}`;
    if (sheetKey === key) return;
    if (sheetKey) optional4(() => sheets?.hideActionSheet?.(sheetKey));
    const ActionSheet = optional4(() => findByProps2("ActionSheet")?.ActionSheet);
    const epoch = generation;
    const close = () => {
      optional4(() => sheets?.hideActionSheet?.(key));
      if (sheetKey === key) sheetKey = void 0;
    };
    function ManagedServerInfoSheet(props2) {
      React2.useEffect(() => () => {
        if (sheetKey === key) sheetKey = void 0;
      }, []);
      return React2.createElement(ServerInfoSheet, props2);
    }
    if (typeof sheets?.openLazy === "function" && ActionSheet && React2?.createElement) {
      sheetKey = key;
      try {
        Promise.resolve(sheets.openLazy(Promise.resolve({ default: ManagedServerInfoSheet }), key, { guildId: id, onClose: close })).catch(() => {
          close();
          notify2("Unable to open server info");
        });
        return;
      } catch {
        close();
      }
    }
    Promise.resolve().then(() => load(id)).then((data) => {
      if (!running || epoch !== generation) return;
      const buttons = [{ text: "Copy Server ID", onPress: () => copy(id) }, { text: "Close", style: "cancel" }];
      if (guildId(data.ownerId)) buttons.unshift({ text: "View Owner Profile", onPress: () => openOwnerProfile(data.ownerId, id) });
      RN2.Alert.alert(`Server Info — ${data.title}`, [
        data.description,
        data.cachedOnly ? "Showing cached details." : "",
        ...data.fields.map((f) => `${f.name}: ${plainText(f.value)}`)
      ].filter(Boolean).join("\n\n"), buttons);
    }).catch((error) => {
      if (running && epoch === generation) notify2(error?.message ?? "Unable to load server info");
    });
  }
  function disposeServerMenu() {
    running = false;
    generation++;
    if (sheetKey) optional4(() => sheets?.hideActionSheet?.(sheetKey));
    sheetKey = void 0;
    for (const unpatch of dynamicPatches.splice(0).reverse()) optional4(() => unpatch());
  }

  // src/plugin.js
  var { findByStoreName: findByStoreName2, findByProps: findByProps3 } = vendetta.metro;
  var { registerCommand } = vendetta.commands;
  var { semanticColors } = vendetta.ui;
  var ThemeStore = findByStoreName2("ThemeStore");
  var colorModule = findByProps3("colors", "meta");
  var EMBED_COLOR = () => {
    try {
      return parseInt(colorModule.meta.resolveSemanticColor(ThemeStore.theme, semanticColors.BACKGROUND_BASE_LOWER).slice(1), 16);
    } catch {
      return 5793266;
    }
  };
  var authorMods = {
    author: {
      username: "InfoCommands",
      avatar: "command",
      avatarURL: AVATARS.command
    }
  };
  var madeSendMessage;
  function sendMessage() {
    if (window.sendMessage) return window.sendMessage(...arguments);
    if (!madeSendMessage) madeSendMessage = mSendMessage(vendetta);
    return madeSendMessage(...arguments);
  }
  var userInfoCommand = cmdDisplays({
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
        description: "ID of the user"
      },
      {
        required: false,
        type: 5,
        name: "ephemeral",
        description: "Send as ephemeral message"
      }
    ],
    execute: async (args, ctx) => {
      try {
        const userId = args.find((a) => a.name === "user_id")?.value;
        const isEphemeral = args.find((a) => a.name === "ephemeral")?.value || false;
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
        const avatarUrl = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=256` : null;
        const avatarLinks = user.avatar ? formatAvatarLinks(user.avatar, user.id) : "None";
        const bannerUrl = user.banner ? getBannerUrl(user.id, user.banner) : null;
        const bannerLink = bannerUrl ? maskUrl("View Banner", bannerUrl) : "None";
        const accentColor = user.accent_color ? `#${user.accent_color.toString(16).padStart(6, "0")}` : "None";
        const badges = decodeBadges(user.public_flags || 0);
        const createdDate = user.created_at ? formatTimestamp(Date.parse(user.created_at)) : formatTimestampFromSnowflake(user.id);
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
          image: bannerUrl ? { url: bannerUrl } : void 0,
          fields
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
              user: findByStoreName2("UserStore").getCurrentUser()
            }
          };
          sendMessage({
            loggingName: "UserInfo output",
            channelId: ctx.channel.id,
            embeds: [embed]
          }, messageMods);
          return null;
        }
      } catch (error) {
        console.error("[UserInfo] Error:", error);
        return null;
      }
    }
  });
  async function getServerEmbed(guildId2) {
    const cached = findByStoreName2("GuildStore")?.getGuild?.(guildId2);
    let timer;
    let fetched;
    try {
      fetched = await Promise.race([
        fetchGuild(guildId2),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), 8e3);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (!fetched && !cached) throw new Error("Server details are unavailable. Try again later.");
    const guild = { ...cached, ...fetched, id: guildId2 };
    const aliases = { owner_id: "ownerId", approximate_member_count: "memberCount", approximate_presence_count: "presenceCount", premium_tier: "premiumTier", premium_subscription_count: "premiumSubscriberCount", verification_level: "verificationLevel", nsfw_level: "nsfwLevel", mfa_level: "mfaLevel", explicit_content_filter: "explicitContentFilter", afk_timeout: "afkTimeout", preferred_locale: "preferredLocale", widget_enabled: "widgetEnabled", vanity_url_code: "vanityURLCode", discovery_splash: "discoverySplash" };
    for (const [key, alias] of Object.entries(aliases)) guild[key] ?? (guild[key] = cached?.[alias]);
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
    const features = (guild.features || []).map((f) => featureMap[f] || f).sort().slice(0, 15).join(", ");
    const iconUrl = guild.icon ? getGuildIconUrl(guild.id, guild.icon) : null;
    const bannerUrl = guild.banner ? getGuildBannerUrl(guild.id, guild.banner) : null;
    const splashUrl = guild.splash ? getGuildSplashUrl(guild.id, guild.splash) : null;
    const discoverySplashUrl = guild.discovery_splash ? getGuildDiscoverySplashUrl(guild.id, guild.discovery_splash) : null;
    const createdDate = guild.created_at ? formatTimestamp(Date.parse(guild.created_at)) : formatTimestampFromSnowflake(guild.id);
    const memberCount = guild.approximate_member_count;
    const presenceCount = guild.approximate_presence_count;
    const onlinePercentage = memberCount > 0 ? Math.round(presenceCount / memberCount * 100) : 0;
    const afkTimeout = guild.afk_timeout ? `${guild.afk_timeout / 60} minutes` : "Not set";
    const preferredLocale = guild.preferred_locale || "en-US";
    const fields = [
      { name: "Owner ID", value: `\`${guild.owner_id || "Unknown"}\``, inline: true },
      { name: "Created", value: createdDate, inline: true },
      { name: "Members", value: `${memberCount == null ? "Unknown" : memberCount.toLocaleString()} total
${presenceCount == null ? "Unknown" : presenceCount.toLocaleString()} online${memberCount > 0 && presenceCount != null ? ` (${onlinePercentage}%)` : ""}`, inline: true },
      { name: "Boosts", value: `Level ${guild.premium_tier || 0}
${guild.premium_subscription_count || 0} boosts`, inline: true },
      { name: "Verification", value: guild.verification_level == null ? "Unknown" : verificationMap[guild.verification_level] ?? "Unknown", inline: true },
      { name: "NSFW Level", value: guild.nsfw_level == null ? "Unknown" : nsfwLevelMap[guild.nsfw_level] ?? "Unknown", inline: true },
      { name: "MFA Level", value: guild.mfa_level == null ? "Unknown" : mfaLevelMap[guild.mfa_level] ?? "Unknown", inline: true },
      { name: "Explicit Content", value: guild.explicit_content_filter == null ? "Unknown" : explicitContentFilterMap[guild.explicit_content_filter] ?? "Unknown", inline: true },
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
      thumbnail: iconUrl ? { url: iconUrl } : void 0,
      image: bannerUrl || splashUrl || discoverySplashUrl ? { url: bannerUrl || splashUrl || discoverySplashUrl } : void 0,
      fields
    };
    return { ...embed, ownerId: guild.owner_id, cachedOnly: !fetched };
  }
  var inviteInfoCommand = cmdDisplays({
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
        description: "Invite code or URL (e.g., discord.gg/example)"
      },
      {
        required: false,
        type: 5,
        name: "ephemeral",
        description: "Send as ephemeral message"
      }
    ],
    execute: async (args, ctx) => {
      try {
        let inviteInput = args.find((a) => a.name === "invite")?.value;
        const isEphemeral = args.find((a) => a.name === "ephemeral")?.value || false;
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
        const onlinePercentage = memberCount > 0 ? Math.round(onlineCount / memberCount * 100) : 0;
        const createdDate = guild.created_at ? formatTimestamp(Date.parse(guild.created_at)) : formatTimestampFromSnowflake(guild.id);
        const expiresText = invite.expires_at ? formatDate(Date.parse(invite.expires_at)) : "Never";
        const inviteUrl = `https://discord.gg/${invite.code}`;
        const iconUrl = guild.icon ? getGuildIconUrl(guild.id, guild.icon) : null;
        const fields = [
          { name: "Members", value: `${memberCount.toLocaleString()} total
${onlineCount.toLocaleString()} online (${onlinePercentage}%)`, inline: true },
          { name: "Created", value: createdDate, inline: true },
          { name: "Boosts", value: `Level ${guild.premium_tier || 0}
${guild.premium_subscription_count || 0} boosts`, inline: true },
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
          thumbnail: iconUrl ? { url: iconUrl } : void 0,
          fields
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
              user: findByStoreName2("UserStore").getCurrentUser()
            }
          };
          sendMessage({
            loggingName: "InviteInfo output",
            channelId: ctx.channel.id,
            embeds: [embed]
          }, messageMods);
          return null;
        }
      } catch (error) {
        console.error("[InviteInfo] Error:", error);
        return null;
      }
    }
  });
  var patches = [];
  var active = false;
  var plugin_default = {
    onLoad() {
      if (active) return;
      active = true;
      for (const command of [userInfoCommand, inviteInfoCommand]) {
        try {
          patches.push(registerCommand(command));
        } catch (error) {
          console.error("[InfoCommands] Command registration failed", error);
        }
      }
      try {
        patches.push(installServerMenu((id) => openServerInfo(id, getServerEmbed)));
      } catch (error) {
        console.error("[InfoCommands] Server menu unavailable", error);
      }
    },
    onUnload() {
      active = false;
      disposeServerMenu();
      for (const unpatch of patches.splice(0).reverse()) {
        try {
          unpatch?.();
        } catch {
        }
      }
      madeSendMessage = void 0;
    }
  };
  return __toCommonJS(plugin_exports);
})();

return InfoCommandsBundle.default;
})()
