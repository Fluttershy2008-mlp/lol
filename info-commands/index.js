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
var InfoCommandsBundle = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
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
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // info-commands/src/plugin.js
  var plugin_exports = {};
  __export(plugin_exports, {
    default: () => plugin_default
  });

  // info-commands/src/common.js
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

  // info-commands/src/embeds.js
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

  // info-commands/src/next-api.js
  var optional = (fn) => {
    try {
      return fn();
    } catch {
      return void 0;
    }
  };
  function nextAPI() {
    const valencedAPI = optional(() => typeof valenced !== "undefined" && valenced.modules?.finders ? valenced : void 0);
    if (valencedAPI) return valencedAPI;
    return optional(() => typeof revenge !== "undefined" && revenge.modules?.finders ? revenge : void 0);
  }
  function nativeSheets() {
    const actions = optional(() => nextAPI()?.discord?.actions?.ActionSheetActionCreators);
    return optional(() => typeof actions?.openLazy === "function" && typeof actions?.hideActionSheet === "function" ? actions : void 0);
  }
  function nativeDesign(name) {
    return optional(() => nextAPI()?.discord?.design?.Design?.[name]);
  }
  function nativeAlerts() {
    const candidates = [
      optional(() => vendetta.metro.findByImportedPath?.("design/components/AlertModal/native/useAlertStore.native.tsx")),
      optional(() => nextAPI()?.discord?.actions?.AlertActionCreators)
    ];
    return candidates.find((actions) => optional(() => typeof actions?.openAlert === "function" && typeof actions?.dismissAlert === "function"));
  }

  // info-commands/src/server-info/runtime.tsx
  var { React, ReactNative: RN } = vendetta.metro.common;
  var optional2 = (fn) => {
    try {
      return fn();
    } catch {
      return void 0;
    }
  };
  function color(name, fallback) {
    const theme = optional2(() => vendetta.metro.findByStoreName("ThemeStore")?.theme);
    return optional2(() => vendetta.metro.findByProps("colors", "meta")?.meta?.resolveSemanticColor(
      theme,
      vendetta.ui.semanticColors?.[name]
    )) ?? fallback;
  }
  function sheetColors() {
    const light = optional2(() => vendetta.metro.findByStoreName("ThemeStore")?.theme) === "light";
    return { background: color("BACKGROUND_PRIMARY", light ? "#ffffff" : "#242429") };
  }
  function Text({ children, color: semantic, variant, lineClamp, style, ...props2 }) {
    const light = optional2(() => vendetta.metro.findByStoreName("ThemeStore")?.theme) === "light";
    const name = semantic === "text-link" ? "TEXT_LINK" : semantic === "text-subtle" ? "TEXT_MUTED" : "TEXT_NORMAL";
    return React.createElement(RN.Text, {
      ...props2,
      numberOfLines: lineClamp,
      style: [{
        color: color(name, name === "TEXT_LINK" ? "#8ea1ff" : name === "TEXT_MUTED" ? light ? "#5c5f66" : "#b5bac1" : light ? "#1e1f22" : "#f2f3f5"),
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
    const light = optional2(() => vendetta.metro.findByStoreName("ThemeStore")?.theme) === "light";
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
  function PanelRow(props2) {
    return React.createElement(RN.View, { style: {
      borderBottomWidth: RN.StyleSheet?.hairlineWidth ?? 0.5,
      borderBottomColor: color("BACKGROUND_MODIFIER_ACCENT", "rgba(127,127,127,0.12)")
    } }, React.createElement(TableRow, props2));
  }
  PanelRow.TrailingText = TrailingText;
  var panelDesign = { Text, TableRow: PanelRow, TableRowGroup };
  var nativeRow = nativeDesign("TableRow") ?? optional2(() => vendetta.metro.findByProps("TableRow")?.TableRow);
  var NativeGroup = nativeDesign("TableRowGroup") ?? optional2(() => vendetta.metro.findByProps("TableRowGroup")?.TableRowGroup);
  var useReRender = () => React.useReducer((value) => value + 1, 0)[1];
  var runtime = {
    react: { React, ReactNative: RN },
    utils: { react: { useReRender } },
    discord: { design: { Design: {
      get ActionSheet() {
        return nativeDesign("ActionSheet") ?? optional2(() => vendetta.metro.findByProps("ActionSheet")?.ActionSheet) ?? RN.View;
      },
      Text,
      TableRow: nativeRow?.TrailingText ? nativeRow : TableRow,
      TableRowGroup: nativeRow?.TrailingText && NativeGroup ? NativeGroup : TableRowGroup,
      space: { PX_16: 16, PX_12: 12 }
    } } },
    modules: { finders: {
      filters: { withProps: (...props2) => props2 },
      lookupModule: (props2) => [
        // Next exposes this lazy library through its curated external API.
        (props2.includes("BottomSheetScrollView") ? optional2(() => nextAPI()?.externals?.Gorhom?.BottomSheet) : void 0) ?? optional2(() => vendetta.metro.findByProps(...props2))
      ]
    } }
  };

  // info-commands/src/server-info/ui/format.ts
  var formatCount = (n) => n == null ? "—" : n.toLocaleString();

  // info-commands/src/server-info/ui/OverviewRows.tsx
  function OverviewRows({
    memberCount,
    onlineCount,
    roleCount,
    channelCount,
    boostLabel,
    premiumTier,
    design
  }) {
    const { TableRow: TableRow2, TableRowGroup: TableRowGroup2 } = design ?? runtime.discord.design.Design;
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

  // info-commands/src/server-info/ui/ServerBanner.tsx
  function ServerBanner({ uri, bleed = 28, height = 140, scrollY }) {
    const RN4 = runtime.react.ReactNative;
    const Animated = RN4.Animated;
    const Image = RN4.Image;
    const AnimatedView = Animated && Animated.View ? Animated.View : RN4.View;
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

  // info-commands/src/server-info/ui/ServerHeader.tsx
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

  // compatibility/user-profile.mjs
  var USER_PROFILE_MODULE_PATH = "modules/user_profile/native/showUserProfileActionSheet.tsx";
  var profileTry = (callback) => {
    try {
      return callback();
    } catch {
      return void 0;
    }
  };
  function profileClientAPI() {
    const valencedAPI = profileTry(() => typeof valenced !== "undefined" ? valenced : void 0);
    if (valencedAPI?.modules?.finders) return valencedAPI;
    return profileTry(() => typeof revenge !== "undefined" && revenge.modules?.finders ? revenge : void 0);
  }
  function profileCallable(module) {
    if (typeof module === "function") return { owner: void 0, call: module };
    if (typeof module?.showUserProfileActionSheet === "function")
      return { owner: module, call: module.showUserProfileActionSheet };
    if (typeof module?.default === "function") return { owner: module, call: module.default };
  }
  function findUserProfileOpener(legacy, client = profileClientAPI()) {
    const metro = legacy?.metro;
    const imported = profileTry(() => metro?.findByImportedPath?.(USER_PROFILE_MODULE_PATH)) ?? profileTry(() => client?.discord?.utils?.modules?.finders?.lookupModuleWithImportedPath(USER_PROFILE_MODULE_PATH)?.[0]);
    let opener = profileCallable(imported);
    if (opener) return opener;
    const { finders } = client?.modules ?? {};
    const filters = finders?.filters;
    const namespace = profileTry(() => metro?.findByProps?.("USER_PROFILE_ACTION_SHEET_KEY_PREFIX", "getUserProfileActionSheetKey")) ?? profileTry(() => finders?.lookupModule(
      filters.withProps("USER_PROFILE_ACTION_SHEET_KEY_PREFIX", "getUserProfileActionSheetKey"),
      { initialize: false, returnNamespace: true }
    )?.[0]);
    opener = profileCallable(namespace);
    if (opener) return opener;
    const cold = profileTry(() => {
      if (!filters?.withDependencies || !client.discord?.flux?.withStoreName) return;
      const loggerId = client.discord.common?.logger?.LoggerModuleId;
      const trackerId = client.discord.common?.importTracker?.ImportTrackerModuleId;
      const userStoreId = finders.lookupModule(client.discord.flux.withStoreName("UserStore"), { initialize: false })[1];
      if (![loggerId, trackerId, userStoreId].every((id) => Number.isInteger(id) && id >= 0)) return;
      const { ordered, relative } = filters.withDependencies;
      const named2 = filters.withName("showUserProfileActionSheet");
      const marked = filters.withProps("USER_PROFILE_ACTION_SHEET_KEY_PREFIX", "getUserProfileActionSheetKey");
      const identity = typeof named2.or === "function" ? named2.or(marked) : named2;
      const fingerprint = filters.withDependencies(ordered([
        loggerId,
        userStoreId,
        relative(1),
        relative(2),
        relative(3),
        trackerId
      ]));
      return finders.lookupModule(identity.and(fingerprint), { initialize: true, returnNamespace: true })[0];
    });
    opener = profileCallable(cold);
    if (opener) return opener;
    const named = profileTry(() => metro?.findByName?.("showUserProfileActionSheet"));
    if (typeof named === "function") return { owner: void 0, call: named };
    for (const method of ["showUserProfileActionSheet", "openUserProfileModal", "openUserProfile", "showUserProfile"]) {
      const module = profileTry(() => metro?.findByProps?.(method));
      if (typeof module?.[method] === "function") return { owner: module, call: module[method] };
    }
  }
  async function openUserProfile(legacy, options, isCurrent = () => true) {
    if (!isCurrent()) return false;
    const opener = findUserProfileOpener(legacy);
    if (!opener || !isCurrent()) return false;
    await Reflect.apply(opener.call, opener.owner, [options, "stack"]);
    return true;
  }

  // info-commands/src/server-info/modules.ts
  var optional3 = (fn) => {
    try {
      return fn();
    } catch {
      return void 0;
    }
  };
  var store = (name) => optional3(() => vendetta.metro.findByStoreName(name));
  var props = (...keys) => optional3(() => vendetta.metro.findByProps(...keys));
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
    actions?.hideActionSheet?.(`info-commands-server-info-${options.guildId}`);
    openUserProfile(vendetta, options).then((opened) => {
      if (!opened) notify("Profiles are unavailable on this Discord version");
    }).catch(() => notify("Unable to open profile. Try again."));
  }
  function notify(text) {
    optional3(() => vendetta.ui.toasts.showToast(text));
  }
  function copyServerId(id) {
    const clipboard = vendetta.metro.common.clipboard;
    if (clipboard?.setString) {
      clipboard.setString(id);
      notify("Server ID copied");
    }
  }

  // info-commands/src/server-info/ui/ServerRows.tsx
  function ServerRows({
    guildId: guildId2,
    ownerId,
    ownerDisplayName,
    ownerAvatarUri,
    createdLabel,
    onOpenProfile,
    onCopyServerId,
    design
  }) {
    const { View, Image } = runtime.react.ReactNative;
    const { TableRow: TableRow2, TableRowGroup: TableRowGroup2, Text: Text2 } = design ?? runtime.discord.design.Design;
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
          (onOpenProfile ?? openUserProfileSheet)({
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
        onPress: () => (onCopyServerId ?? copyServerId)(guildId2)
      }
    ));
  }

  // info-commands/src/server-info/data.ts
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
  function countChannels(value, guildId2) {
    if (value == null) return void 0;
    const ids = /* @__PURE__ */ new Set();
    const seen = /* @__PURE__ */ new Set();
    const guildTypes = /* @__PURE__ */ new Set([0, 2, 4, 5, 13, 14, 15, 16]);
    function walk(node) {
      if (!node || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);
      const owner = node.guild_id ?? node.guildId;
      if (typeof node.id === "string" && guildTypes.has(node.type) && (!guildId2 || owner == null || owner === guildId2)) ids.add(node.id);
      for (const child of node instanceof Map ? node.values() : Object.values(node)) walk(child);
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

  // info-commands/src/server-info/ui/FriendsRows.tsx
  var VISIBLE_LIMIT = 5;
  function FriendsRows({ guildId: guildId2, friends, loading, onOpenProfile, design }) {
    const { React: React4 } = runtime.react;
    const { View, Image } = runtime.react.ReactNative;
    const { TableRow: TableRow2, TableRowGroup: TableRowGroup2, Text: Text2 } = design ?? runtime.discord.design.Design;
    const [expanded, setExpanded] = React4.useState(false);
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
            (onOpenProfile ?? openUserProfileSheet)({
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

  // info-commands/src/server-info/ui/useGuildInfo.ts
  function cachedGuild(id) {
    return getGuildStore()?.getGuild?.(id) ?? getBasicGuildStore()?.getGuild?.(id);
  }
  function optional4(fn) {
    try {
      return fn();
    } catch {
      return void 0;
    }
  }
  function useGuildInfo(guildId2) {
    const { React: React4 } = runtime.react;
    const forceUpdate = runtime.utils.react.useReRender();
    const [remoteGuild, setRemoteGuild] = React4.useState(null);
    const [pending, setPending] = React4.useState(true);
    const [ownerUser, setOwnerUser] = React4.useState(null);
    const [friendsPending, setFriendsPending] = React4.useState(false);
    const guild = normalizeGuild(guildId2, optional4(() => cachedGuild(guildId2)), remoteGuild);
    React4.useEffect(() => {
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
      for (const store2 of distinct) optional4(() => store2.addChangeListener?.(forceUpdate));
      return () => {
        for (const store2 of distinct) optional4(() => store2.removeChangeListener?.(forceUpdate));
      };
    }, [guildId2, forceUpdate]);
    React4.useEffect(() => {
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
    React4.useEffect(() => {
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
    React4.useEffect(() => {
      const ids = getRelationshipStore()?.getFriendIDs?.() ?? [];
      const request = getRequestMembersById();
      if (!ids.length || !request) return;
      setFriendsPending(true);
      optional4(() => request(guildId2, ids, false));
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
    const channels = optional4(() => channelStore?.getMutableGuildChannelsForGuild?.(guildId2));
    const groupedChannels = optional4(() => channelStore?.getChannels?.(guildId2));
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
      channelCount: countChannels(channels == null && groupedChannels == null ? void 0 : [channels, groupedChannels], guildId2),
      boostLabel: boostCount != null ? `${boostCount.toLocaleString()} boost${boostCount === 1 ? "" : "s"}` : void 0,
      premiumTier: guild?.premiumTier ?? 0,
      createdLabel: guild ? creationLabel(guildId2) : void 0,
      friends,
      friendsPending
    };
  }

  // info-commands/src/server-info/ui/ServerInfoSheet.tsx
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
  function ServerInfoSheet({ guildId: guildId2, onClose, onDismiss, onPresented }) {
    const RN4 = runtime.react.ReactNative;
    const { View, ActivityIndicator, ScrollView } = RN4;
    const Animated = RN4.Animated;
    const React4 = runtime.react.React;
    const Design = runtime.discord.design.Design;
    const { ActionSheet, Text: Text2 } = Design;
    const sideInset = Design?.space?.PX_16 ?? 16;
    const extraBleed = 12;
    const bleed = sideInset + extraBleed;
    const BANNER_HEIGHT = 140;
    const bannerSpacing = Design?.space?.PX_12 ?? 12;
    const ScrollContainer = getScrollContainer() ?? ScrollView;
    const { guild, isLoading, ...info } = useGuildInfo(guildId2);
    const [containerWidth, setContainerWidth] = React4.useState(void 0);
    const onLayout = (event) => {
      const { width, height } = event?.nativeEvent?.layout ?? {};
      if (width > 0) setContainerWidth(width);
      if (width > 0 && height > 0) onPresented?.();
    };
    const scrollY = React4.useRef(Animated ? new Animated.Value(0) : { current: 0 }).current;
    if (!guild && !isLoading) return /* @__PURE__ */ runtime.react.React.createElement(ActionSheet, { scrollable: true, startExpanded: true, onDismiss }, /* @__PURE__ */ runtime.react.React.createElement(View, { onLayout, style: { padding: 24 } }, /* @__PURE__ */ runtime.react.React.createElement(Text2, null, info.error ?? "Server details are unavailable."), /* @__PURE__ */ runtime.react.React.createElement(Text2, { color: "text-link", onPress: onClose }, "Close")));
    if (!guild && isLoading) {
      return /* @__PURE__ */ runtime.react.React.createElement(ActionSheet, { scrollable: true, startExpanded: true, onDismiss }, /* @__PURE__ */ runtime.react.React.createElement(ScrollContainer, { contentContainerStyle: { flexGrow: 1 } }, /* @__PURE__ */ runtime.react.React.createElement(
        View,
        {
          onLayout,
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
        onDismiss,
        contentStyles: { paddingHorizontal: 0, paddingBottom: 24 }
      },
      /* @__PURE__ */ runtime.react.React.createElement(View, { style: { width: "100%", position: "relative", overflow: "visible" }, onLayout }, info.bannerUri != null && /* @__PURE__ */ runtime.react.React.createElement(ServerBanner, { uri: info.bannerUri, bleed, height: 140, scrollY }), /* @__PURE__ */ runtime.react.React.createElement(
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

  // info-commands/src/server-info/ui/ServerInfoModal.tsx
  function ServerInfoModal({ guildId: guildId2, onClose, onPresented, onDismiss, onOpenProfile, onCopyServerId }) {
    const { React: React4, ReactNative: RN4 } = runtime.react;
    const { View, Modal, ScrollView, Image, TouchableOpacity, ActivityIndicator } = RN4;
    const { Text: Text2 } = runtime.discord.design.Design;
    const dimensions = RN4.useWindowDimensions?.() ?? RN4.Dimensions.get("window");
    const height = Math.min(Math.max(220, dimensions.height * 0.86), dimensions.height - 24);
    const colors = sheetColors();
    const { guild, isLoading, ...info } = useGuildInfo(guildId2);
    return /* @__PURE__ */ runtime.react.React.createElement(
      Modal,
      {
        visible: true,
        transparent: true,
        animationType: "slide",
        presentationStyle: "overFullScreen",
        onRequestClose: onClose,
        onShow: onPresented,
        onDismiss
      },
      /* @__PURE__ */ runtime.react.React.createElement(View, { style: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" } }, /* @__PURE__ */ runtime.react.React.createElement(
        TouchableOpacity,
        {
          accessibilityRole: "button",
          accessibilityLabel: "Dismiss server info",
          activeOpacity: 1,
          onPress: onClose,
          style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }
        }
      ), /* @__PURE__ */ runtime.react.React.createElement(
        View,
        {
          testID: "info-commands-server-panel",
          accessibilityViewIsModal: true,
          onAccessibilityEscape: onClose,
          onLayout: (event) => {
            const layout = event?.nativeEvent?.layout;
            if (layout?.width > 0 && layout?.height > 0) onPresented();
          },
          style: {
            height,
            maxHeight: "100%",
            width: "100%",
            maxWidth: 640,
            alignSelf: "center",
            backgroundColor: colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: "hidden"
          }
        },
        /* @__PURE__ */ runtime.react.React.createElement(
          ScrollView,
          {
            style: { flex: 1 },
            contentContainerStyle: { paddingBottom: 28, gap: 18 },
            nestedScrollEnabled: true,
            keyboardShouldPersistTaps: "handled",
            showsVerticalScrollIndicator: false
          },
          info.bannerUri && /* @__PURE__ */ runtime.react.React.createElement(
            Image,
            {
              accessibilityLabel: "Server banner",
              source: { uri: info.bannerUri },
              style: { width: "100%", height: 140, resizeMode: "cover" }
            }
          ),
          /* @__PURE__ */ runtime.react.React.createElement(View, { style: { paddingHorizontal: 16, paddingTop: info.bannerUri ? 0 : 8 } }, guild ? /* @__PURE__ */ runtime.react.React.createElement(ServerHeader, { name: guild.name, description: guild.description, iconUri: info.iconUri }) : /* @__PURE__ */ runtime.react.React.createElement(Text2, { variant: "text-lg/semibold" }, "Server Info"), /* @__PURE__ */ runtime.react.React.createElement(
            TouchableOpacity,
            {
              accessibilityRole: "button",
              accessibilityLabel: "Close server info",
              onPress: onClose,
              style: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 12, marginTop: 4 }
            },
            /* @__PURE__ */ runtime.react.React.createElement(Text2, { color: "text-link", onPress: onClose, accessibilityRole: "button" }, "Close")
          )),
          guild ? /* @__PURE__ */ runtime.react.React.createElement(runtime.react.React.Fragment, null, /* @__PURE__ */ runtime.react.React.createElement(OverviewRows, { ...info, design: panelDesign }), /* @__PURE__ */ runtime.react.React.createElement(ServerRows, { guildId: guildId2, ...info, onOpenProfile, onCopyServerId, design: panelDesign }), /* @__PURE__ */ runtime.react.React.createElement(FriendsRows, { guildId: guildId2, friends: info.friends, loading: info.friendsPending, onOpenProfile, design: panelDesign }), info.cachedOnly && /* @__PURE__ */ runtime.react.React.createElement(Text2, { color: "text-subtle", style: { paddingHorizontal: 16 } }, "Showing cached server details.")) : /* @__PURE__ */ runtime.react.React.createElement(View, { style: { padding: 24, alignItems: "center", gap: 12 } }, isLoading && /* @__PURE__ */ runtime.react.React.createElement(ActivityIndicator, { size: "large", color: "#5865f2" }), /* @__PURE__ */ runtime.react.React.createElement(Text2, null, isLoading ? "Loading server info…" : info.error ?? "Server details are unavailable."))
        )
      ))
    );
  }

  // info-commands/src/guild-sheet.js
  var { React: React2, ReactNative: RN2 } = vendetta.metro.common;
  function wrapGuildSheet(component, live, extendItems, makeRow, Row) {
    const caches = Array.from({ length: 5 }, () => /* @__PURE__ */ new WeakMap());
    const isInfo2 = (node) => node?.key === "info-commands-server-info" || node?.props?.label === "Server Info";
    const isRow = (node) => node?.props && (node.type === Row || node.type?.name === "ActionSheetRow" || node.type?.displayName === "ActionSheetRow");
    function inject(tree) {
      let target, kind, duplicate = false, visited = 0;
      function scan(node, depth = 0) {
        if (!node || depth > 30 || ++visited > 1500) return;
        if (Array.isArray(node)) {
          if (!target && Row && node.some(isRow)) {
            target = node;
            kind = "rows";
          }
          node.forEach((child) => scan(child, depth + 1));
        } else if (node.props) {
          if (isInfo2(node)) duplicate = true;
          if (!target && Array.isArray(node.props.items)) {
            target = node;
            kind = "items";
          }
          if (!target && Row && isRow(node.props.children)) {
            target = node;
            kind = "child";
          }
          scan(node.props.children, depth + 1);
        }
      }
      scan(tree);
      if (duplicate) return { tree, done: true };
      if (!target) return { tree, done: false };
      function replace(node, depth = 0) {
        if (!node || depth > 30) return node;
        if (node === target) {
          if (kind === "items") {
            const items = extendItems(node.props.items);
            return items === node.props.items ? node : React2.cloneElement(node, { items });
          }
          if (kind === "rows") return [...node, makeRow()];
          return React2.cloneElement(node, { children: [node.props.children, makeRow()] });
        }
        if (Array.isArray(node)) {
          const children = node.map((child) => replace(child, depth + 1));
          return children.some((child, i) => child !== node[i]) ? children : node;
        }
        if (node.props?.children != null) {
          const children = replace(node.props.children, depth + 1);
          if (children !== node.props.children) return React2.cloneElement(node, { children });
        }
        return node;
      }
      return { tree: replace(tree), done: true };
    }
    function transform(tree, level) {
      if (!live()) return tree;
      try {
        let walk = function(node, depth = 0) {
          if (!node || depth > 30 || ++visited > 1500) return node;
          if (Array.isArray(node)) return node.map((child) => walk(child, depth + 1));
          if (!node.props) return node;
          const children = walk(node.props.children, depth + 1);
          const native = [RN2.View, RN2.ScrollView, RN2.Text, RN2.Image, RN2.Pressable, RN2.TouchableOpacity, Row];
          const type = level < 4 && !native.includes(node.type) ? wrap(node.type, level + 1) : node.type;
          if (type !== node.type) return React2.createElement(type, {
            ...node.props,
            children,
            key: node.key,
            ref: node.props.ref ?? Object.getOwnPropertyDescriptor(node, "ref")?.value
          });
          return children !== node.props.children ? React2.cloneElement(node, { children }) : node;
        };
        const result = inject(tree);
        if (result.done) return result.tree;
        let visited = 0;
        return walk(tree);
      } catch (error) {
        console.error("[InfoCommands] Guild sheet injection failed", error);
        return tree;
      }
    }
    function wrap(original, level = 0) {
      if (!original || !["function", "object"].includes(typeof original)) return original;
      const cache = caches[level];
      if (cache.has(original)) return cache.get(original);
      let wrapped = original;
      if (typeof original === "function") {
        if (original.prototype?.isReactComponent) {
          wrapped = class ServerInfoMenu extends original {
            render() {
              return transform(super.render(), level);
            }
          };
        } else {
          wrapped = function ServerInfoMenu(...args) {
            return transform(original.apply(this, args), level);
          };
        }
      } else if (original.$$typeof === /* @__PURE__ */ Symbol.for("react.memo")) {
        wrapped = React2.memo(wrap(original.type, level), original.compare);
      } else if (original.$$typeof === /* @__PURE__ */ Symbol.for("react.forward_ref")) {
        wrapped = React2.forwardRef((props2, ref) => transform(original.render(props2, ref), level));
      }
      cache.set(original, wrapped);
      return wrapped;
    }
    return wrap(component);
  }

  // info-commands/src/server-menu.js
  var { find, findByName, findByProps: findByProps2, findByStoreName } = vendetta.metro;
  var { before, after } = vendetta.patcher;
  var { React: React3, ReactNative: RN3 } = vendetta.metro.common;
  var ITEM_ID = "info-commands-server-info";
  var activeSheet;
  var menuTimer;
  var profileTimer;
  var panelSequence = 0;
  var sheets;
  var contexts;
  var running = false;
  var generation = 0;
  var dynamicPatches = [];
  function optional5(fn) {
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
    optional5(() => vendetta.ui.toasts.showToast(text));
  }
  function isInfo(item) {
    return item?.id === ITEM_ID || item?.key === ITEM_ID || item?.label === "Server Info" || item?.props?.label === "Server Info";
  }
  function itemsWithInfo(items, id, action) {
    if (!id || !Array.isArray(items) || items.some(isInfo)) return items;
    if (Array.isArray(items[0])) {
      if (items.some((group) => Array.isArray(group) && group.some(isInfo))) return items;
      return [itemsWithInfo(items[0], id, action), ...items.slice(1)];
    }
    return [...items, {
      id: ITEM_ID,
      label: "Server Info",
      action
    }];
  }
  function installServerMenu(open) {
    if (running) return () => {
    };
    running = true;
    const epoch = ++generation;
    const live = () => running && generation === epoch;
    const patched = /* @__PURE__ */ new WeakMap();
    const store2 = optional5(() => findByStoreName("GuildStore"));
    const next = nextAPI()?.modules?.finders;
    const action = (id, close) => () => {
      if (!live()) return;
      optional5(close);
      if (next) {
        clearTimeout(menuTimer);
        menuTimer = setTimeout(() => {
          menuTimer = void 0;
          if (live()) open(id);
        }, vendetta.host?.id === "valenced" ? 180 : 0);
      } else open(id);
    };
    function patch(target, key, kind, callback) {
      if (!live() || typeof target?.[key] !== "function") return false;
      if (patched.get(target)?.has(key)) return true;
      const unpatch = optional5(() => kind(key, target, callback));
      if (typeof unpatch !== "function") return false;
      if (!patched.has(target)) patched.set(target, /* @__PURE__ */ new Set());
      patched.get(target).add(key);
      dynamicPatches.push(unpatch);
      return true;
    }
    function connectBuilder(menu2) {
      const key = typeof menu2?.getGuildsBarGuildMenuItems === "function" ? "getGuildsBarGuildMenuItems" : "default";
      return patch(menu2, key, after, (args, result) => live() ? itemsWithInfo(result, guildId(args?.[0]), action(guildId(args?.[0]), () => contexts?.hideContextMenu?.())) : result);
    }
    function connectContexts(module) {
      const target = module?.showContextMenu ? module : module?.default;
      if (!target?.showContextMenu) return false;
      contexts = target;
      return patch(target, "showContextMenu", before, (args) => {
        if (!live()) return;
        const menu2 = args[0];
        if (!menu2 || !Array.isArray(menu2.items)) return;
        if (menu2.user || menu2.userId || menu2.context?.user || menu2.context?.userId || menu2.message || menu2.context?.message || menu2.channel || menu2.channelId || menu2.context?.channel || menu2.context?.channelId) return;
        const guild = menu2.guild ?? menu2.context?.guild ?? (menu2.key ? store2?.getGuild?.(String(menu2.key)) : null) ?? (!menu2.key && menu2.guildId ? store2?.getGuild?.(String(menu2.guildId)) : null) ?? (/guild|server/i.test(String(menu2.type ?? menu2.name ?? "")) ? { id: menu2.guildId ?? menu2.context?.guildId } : null);
        const id = guildId(guild);
        const items = itemsWithInfo(menu2.items, id, action(id, () => target.hideContextMenu?.()));
        if (items !== menu2.items) args[0] = { ...menu2, items };
      });
    }
    function connectSheets(module) {
      const target = module?.openLazy ? module : module?.default;
      if (!target?.openLazy) return false;
      sheets = target;
      return patch(target, "openLazy", before, (args) => {
        if (!live()) return;
        const [promise, key, props2] = args;
        if (!/guild/i.test(String(key)) || !/menu|context|actions/i.test(String(key))) return;
        if (props2?.user || props2?.userId || props2?.channel || props2?.channelId || props2?.message) return;
        const id = guildId(props2?.guild ?? props2);
        if (!id || !promise?.then) return;
        args[0] = Promise.resolve(promise).then((module2) => {
          if (!live() || !module2?.default) return module2;
          const Row = nativeDesign("ActionSheetRow") ?? optional5(() => findByProps2("ActionSheetRow")?.ActionSheetRow);
          const onPress = action(id, () => target.hideActionSheet?.(key));
          return { ...module2, default: wrapGuildSheet(
            module2.default,
            live,
            (items) => itemsWithInfo(items, id, onPress),
            () => React3.createElement(Row, { key: ITEM_ID, label: "Server Info", onPress }),
            Row
          ) };
        });
      });
    }
    function watch(filter, connect) {
      if (!next?.getModules || !filter) return;
      const unsubscribe = optional5(() => next.getModules(filter, (module) => {
        if (live()) connect(module);
      }, { returnNamespace: true, initialize: false }));
      if (typeof unsubscribe === "function") dynamicPatches.push(unsubscribe);
    }
    const pathWatch = vendetta.metro.getModuleWithImportedPath;
    const usesPaths = typeof pathWatch === "function";
    if (usesPaths) {
      const unsubscribe = pathWatch("modules/guilds_bar/native/utils/getGuildsBarGuildMenuItems.tsx", (module) => {
        if (live()) connectBuilder(module);
      });
      if (typeof unsubscribe === "function") dynamicPatches.push(unsubscribe);
    }
    const menu = !usesPaths && (optional5(() => findByName?.("getGuildsBarGuildMenuItems", false)) ?? optional5(() => find?.((m) => m?.default?.name === "getGuildsBarGuildMenuItems")));
    if (!usesPaths && !connectBuilder(menu)) watch(optional5(() => next.filters.createFilterGenerator(
      (_args, _id, value) => value?.name === "getGuildsBarGuildMenuItems" || typeof value?.getGuildsBarGuildMenuItems === "function" || value?.default?.name === "getGuildsBarGuildMenuItems",
      () => "info-commands.guild-menu"
    )()), connectBuilder);
    if (!connectContexts(optional5(() => findByProps2("showContextMenu"))))
      watch(optional5(() => next.filters.withProps("showContextMenu")), connectContexts);
    if (!connectSheets(nativeSheets() ?? optional5(() => findByProps2("openLazy", "hideActionSheet")) ?? optional5(() => findByProps2("openLazy"))))
      watch(optional5(() => next.filters.withProps("openLazy", "hideActionSheet")), connectSheets);
    if (!dynamicPatches.length) notify2("InfoCommands: server menu unavailable on this Discord version");
    return () => {
      if (live()) disposeServerMenu();
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
    const session = generation;
    const live = () => running && generation === session;
    close?.();
    openUserProfile(vendetta, { userId: ownerId, guildId: serverId }, live).then((opened) => {
      if (!opened && live()) notify2("Owner profiles are unavailable on this Discord version");
    }).catch(() => {
      if (live()) notify2("Unable to open the owner's profile. Try again.");
    });
  }
  function openServerInfo(id, load) {
    if (!running || !guildId(id)) return;
    const key = `${ITEM_ID}-${id}`;
    if (activeSheet?.key === key) return;
    activeSheet?.close();
    clearTimeout(profileTimer);
    profileTimer = void 0;
    const next = nextAPI();
    const host = nativeSheets() ?? sheets;
    const ActionSheet = nativeDesign("ActionSheet") ?? optional5(() => findByProps2("ActionSheet")?.ActionSheet);
    const epoch = generation;
    const attempt = {
      key,
      timer: void 0,
      fallback: false,
      presented: false,
      panel: void 0,
      panelKey: void 0,
      panelNode: void 0,
      closed: false,
      close
    };
    activeSheet = attempt;
    const live = () => running && epoch === generation && activeSheet === attempt;
    const panelListeners = /* @__PURE__ */ new Set();
    const panelVisible = () => !attempt.closed;
    const subscribePanel = (listener) => {
      panelListeners.add(listener);
      return () => panelListeners.delete(listener);
    };
    function hidePanel() {
      if (attempt.closed) return;
      attempt.closed = true;
      for (const listener of [...panelListeners]) optional5(listener);
    }
    function dismissPanelHost() {
      const alerts = attempt.panel;
      if (!alerts) return;
      optional5(() => alerts.dismissAlert(attempt.panelKey));
      optional5(() => {
        const store2 = alerts.useAlertStore;
        if (typeof store2?.getState !== "function" || typeof store2?.setState !== "function") return;
        const owns = (entry) => entry?.key === attempt.panelKey || entry?.node === attempt.panelNode;
        const entries = store2.getState()?.alerts;
        if (!Array.isArray(entries) || !entries.some(owns)) return;
        store2.setState((state) => {
          if (!Array.isArray(state.alerts)) return state;
          const remaining = state.alerts.filter((entry) => !owns(entry));
          return remaining.length === state.alerts.length ? state : { alerts: remaining };
        });
      });
    }
    function close(hide = true) {
      clearTimeout(attempt.timer);
      const current = live();
      if (current) activeSheet = void 0;
      hidePanel();
      if (!current) return;
      if (hide) {
        if (attempt.panel) dismissPanelHost();
        else optional5(() => host?.hideActionSheet?.(key));
      }
    }
    function presented() {
      if (live() && !attempt.fallback) {
        attempt.presented = true;
        clearTimeout(attempt.timer);
      }
    }
    function dismissed() {
      if (!live() || attempt.fallback) return;
      if (next && !attempt.presented) fallback();
      else close(false);
    }
    function fallback(error) {
      if (!live() || attempt.fallback) return;
      attempt.fallback = true;
      clearTimeout(attempt.timer);
      hidePanel();
      if (attempt.panel) dismissPanelHost();
      else optional5(() => host?.hideActionSheet?.(key));
      if (error) optional5(() => console.warn("[InfoCommands] Using native server info fallback", error));
      Promise.resolve().then(() => load(id, { preferCache: Boolean(next) })).then((data) => {
        if (!live()) return;
        close(false);
        const allowed = (fn) => () => {
          if (running && epoch === generation) fn();
        };
        const buttons = [
          { text: "Copy Server ID", onPress: allowed(() => copy(id)) },
          { text: "Close", style: "cancel" }
        ];
        if (guildId(data.ownerId)) buttons.unshift({ text: "View Owner Profile", onPress: allowed(() => openOwnerProfile(data.ownerId, id)) });
        RN3.Alert.alert(`Server Info — ${data.title}`, [
          data.description,
          data.cachedOnly ? "Showing cached details." : "",
          ...data.fields.map((f) => `${f.name}: ${plainText(f.value)}`)
        ].filter(Boolean).join("\n\n"), buttons);
      }).catch((error2) => {
        if (!live()) return;
        close(false);
        const message = error2?.message ?? "Unable to load server info";
        if (next) RN3.Alert.alert("Server Info", message, [{ text: "Close", style: "cancel" }]);
        else notify2(message);
      });
    }
    const Boundary = React3.Component ? class ServerInfoBoundary extends React3.Component {
      constructor() {
        super(...arguments);
        __publicField(this, "state", { failed: false });
      }
      static getDerivedStateFromError() {
        return { failed: true };
      }
      componentDidCatch(error) {
        fallback(error);
      }
      render() {
        return this.state.failed ? null : this.props.children;
      }
    } : null;
    if (vendetta.host?.id === "valenced") {
      const alerts = nativeAlerts();
      if (alerts && RN3.Modal) {
        let ManagedServerInfoModal = function() {
          const visible = React3.useSyncExternalStore(subscribePanel, panelVisible, panelVisible);
          if (!visible || !live() || attempt.fallback) return null;
          const content = React3.createElement(ServerInfoModal, {
            guildId: id,
            onClose: () => close(),
            onPresented: presented,
            onDismiss: dismissed,
            onCopyServerId: (value) => {
              if (live() && value === id) copy(id);
            },
            onOpenProfile: (options) => {
              if (!live() || !guildId(options.userId)) return;
              close();
              const current = () => running && epoch === generation;
              profileTimer = setTimeout(() => {
                profileTimer = void 0;
                openUserProfile(vendetta, options, current).then((opened) => {
                  if (!opened && current()) notify2("Profiles are unavailable on this Discord version");
                }).catch(() => {
                  if (current()) notify2("Unable to open profile. Try again.");
                });
              }, 180);
            }
          });
          return Boundary ? React3.createElement(Boundary, null, content) : content;
        };
        attempt.panel = alerts;
        attempt.panelKey = `${key}.panel.${epoch}.${++panelSequence}`;
        attempt.panelNode = React3.createElement(ManagedServerInfoModal);
        attempt.timer = setTimeout(() => fallback(), 2500);
        try {
          const result = alerts.openAlert(attempt.panelKey, attempt.panelNode, dismissed, { dismissable: true });
          Promise.resolve(result).catch(fallback);
          return;
        } catch (error) {
          fallback(error);
          return;
        }
      }
      fallback();
      return;
    }
    function ManagedServerInfoSheet(props2) {
      React3.useEffect(() => () => {
        dismissed();
      }, []);
      if (!live() || attempt.fallback) return null;
      const content = React3.createElement(ServerInfoSheet, props2);
      return Boundary ? React3.createElement(Boundary, null, content) : content;
    }
    if (typeof host?.openLazy === "function" && ActionSheet && React3?.createElement) {
      if (next) attempt.timer = setTimeout(() => fallback(), 1500);
      try {
        const result = host.openLazy(
          Promise.resolve({ default: ManagedServerInfoSheet }),
          key,
          {
            guildId: id,
            onClose: () => close(),
            onPresented: presented,
            onDismiss: dismissed
          },
          next ? "stack" : void 0
        );
        Promise.resolve(result).catch(fallback);
        return;
      } catch (error) {
        fallback(error);
        return;
      }
    }
    fallback();
  }
  function disposeServerMenu() {
    activeSheet?.close();
    clearTimeout(menuTimer);
    menuTimer = void 0;
    clearTimeout(profileTimer);
    profileTimer = void 0;
    running = false;
    generation++;
    for (const unpatch of dynamicPatches.splice(0).reverse()) optional5(() => unpatch());
  }

  // info-commands/src/plugin.js
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
  async function getServerEmbed(guildId2, { preferCache = false } = {}) {
    const cached = findByStoreName2("GuildStore")?.getGuild?.(guildId2) ?? findByStoreName2("BasicGuildStore")?.getGuild?.(guildId2);
    let timer;
    let fetched;
    try {
      if (!preferCache || !cached) {
        fetched = await Promise.race([
          fetchGuild(guildId2),
          new Promise((resolve) => {
            timer = setTimeout(() => resolve(null), 8e3);
          })
        ]);
      }
    } finally {
      clearTimeout(timer);
    }
    if (!fetched && !cached) throw new Error("Server details are unavailable. Try again later.");
    const guild = { ...cached, ...fetched, id: guildId2, name: fetched?.name ?? cached?.name };
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
    const memberCount = guild.approximate_member_count ?? findByStoreName2("GuildMemberCountStore")?.getMemberCount?.(guildId2);
    const presenceCount = guild.approximate_presence_count ?? findByStoreName2("GuildHeaderCountsStore")?.getOnlineCount?.(guildId2);
    const channelStore = findByStoreName2("GuildChannelStore");
    const fullChannels = channelStore?.getMutableGuildChannelsForGuild?.(guildId2);
    const groupedChannels = channelStore?.getChannels?.(guildId2);
    const channelCount = countChannels(fullChannels == null && groupedChannels == null ? void 0 : [fullChannels, groupedChannels], guildId2);
    const onlinePercentage = memberCount > 0 ? Math.round(presenceCount / memberCount * 100) : 0;
    const afkTimeout = guild.afk_timeout ? `${guild.afk_timeout / 60} minutes` : "Not set";
    const preferredLocale = guild.preferred_locale || "en-US";
    const fields = [
      { name: "Owner ID", value: `\`${guild.owner_id || "Unknown"}\``, inline: true },
      { name: "Created", value: createdDate, inline: true },
      { name: "Members", value: `${memberCount == null ? "Unknown" : memberCount.toLocaleString()} total
${presenceCount == null ? "Unknown" : presenceCount.toLocaleString()} online${memberCount > 0 && presenceCount != null ? ` (${onlinePercentage}%)` : ""}`, inline: true },
      { name: "Channels", value: channelCount?.toLocaleString() ?? "Unknown", inline: true },
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
    settings() {
      const { React: React4, ReactNative: RN4 } = vendetta.metro.common;
      const open = () => {
        const channelId = findByStoreName2("SelectedChannelStore")?.getChannelId?.();
        const channel = findByStoreName2("ChannelStore")?.getChannel?.(channelId);
        const id = findByStoreName2("SelectedGuildStore")?.getGuildId?.() ?? channel?.guildId ?? channel?.guild_id;
        if (id) openServerInfo(id, getServerEmbed);
        else RN4.Alert.alert("Server Info", "Open a server chat first, then return here.");
      };
      return React4.createElement(
        RN4.View,
        { style: { padding: 20 } },
        React4.createElement(
          RN4.Text,
          { style: { color: "#aeb5c5", marginBottom: 16 } },
          "InfoCommands " + (vendetta.plugin.version ?? vendetta.plugin.manifest?.version ?? "")
        ),
        React4.createElement(RN4.Button, { title: "Open current server info", onPress: open })
      );
    },
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
}, "InfoCommands");
})()
