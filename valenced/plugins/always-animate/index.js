(function () {
/* SPDX-License-Identifier: GPL-3.0-or-later
 * Always Animate for Valenced. Mobile reimplementation inspired by
 * Vencord AlwaysAnimate, Fiery / Vendicated and contributors (2023).
 * Uses Valenced's documented runtime API; no desktop webpack patches.
 */
  'use strict';
  var defaults = { images: true, emojis: true, stickers: true, cosmetics: true };
  var storage;
  var stats = {};
  var retryNativeBridges;
  var retryNativeImage;
  var IMAGE_METHODS = [
    'getUserAvatarURL', 'getGuildMemberAvatarURL', 'getGuildIconURL',
    'getGuildBannerURL', 'getUserBannerURL', 'getAvatarURL', 'getBannerURL',
    'getGuildMemberAvatarURLSimple', 'getAvatarDecorationURL'
  ];
  var MEDIA_NAME = /avatar|emoji|customstatus|userstatus|sticker|guildicon|servericon|guildbanner|profilebanner|userbanner|nameplate|rolegradient|gradientrole/i;
  var YES_FLAGS = ['animate', 'canAnimate', 'shouldAnimate', 'animateEmoji',
    'animateAvatar', 'animateGradient', 'isAnimationEnabled'];
  var NO_FLAGS = ['disableAnimation', 'disableAnimations', 'forceStatic'];
  var SOURCE_KEYS = ['source', 'src', 'uri', 'avatarURL', 'iconURL', 'bannerURL', 'bannerSource'];
  var mediaTypes = new WeakMap();
  // URLs are immutable strings. Bound this cache rather than retaining props,
  // React elements, messages or per-user model objects across renders.
  var urlCache = new Map();

  function enabled(key) {
    return !storage || !storage.cache || storage.cache[key] !== false;
  }

  function animatedDecorationURL(url) {
    if (typeof url !== 'string' || !/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(url)) return url;
    if (/\/media\/v1\/collectibles-shop\/\d+\/(?:[a-z0-9_-]+\/)*static(?:[?#]|$)/i.test(url))
      return url.replace(/\/static(?=[?#]|$)/i, '/animated');
    if (!/\/avatar-decoration-presets\/[a-z0-9_]+\.png(?:[?#]|$)/i.test(url)) return url;
    var result = url.replace(/([?&])format=[^&#]*(?=&|#|$)/gi, '$1')
      .replace(/\?&/g, '?').replace(/&&+/g, '&').replace(/[?&](?=#|$)/g, '');
    if (/[?&]passthrough=/i.test(result)) return result.replace(/([?&]passthrough=)[^&#]*/i, '$1true');
    var hash = result.indexOf('#'), fragment = hash < 0 ? '' : result.slice(hash);
    if (hash >= 0) result = result.slice(0, hash);
    return result + (result.indexOf('?') >= 0 ? '&' : '?') + 'passthrough=true' + fragment;
  }

  // Only Discord CDN resources with an animated a_ hash are eligible.
  // Never guess that a static avatar, external image or attachment has a GIF.
  function animatedURL(url) {
    if (typeof url !== 'string') return url;
    if (urlCache.has(url)) return urlCache.get(url);
    var result = rewriteAnimatedURL(url);
    if (urlCache.size >= 256) urlCache.delete(urlCache.keys().next().value);
    urlCache.set(url, result);
    return result;
  }
  function rewriteAnimatedURL(url) {
    var decoration = animatedDecorationURL(url);
    if (decoration !== url) return decoration;
    if (!/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/(?:avatars\/|icons\/|banners\/|guilds\/[^/]+\/users\/[^/]+\/(?:avatars|banners)\/)/i.test(url)) return url;
    var result = url.replace(/(\/a_[a-z0-9_]+)\.(?:png|webp|avif|jpe?g)(?=[?#]|$)/i, '$1.gif');
    // A CDN format override can still request a static response from a .gif URL.
    if (/\/a_[a-z0-9_]+\.gif(?:[?#]|$)/i.test(result)) {
      result = result.replace(/([?&])(?:format=(?:webp|png|avif|jpe?g)|animated=false)(?=&|#|$)/gi, '$1')
        .replace(/\?&/g, '?').replace(/&&+/g, '&').replace(/[?&](?=#|$)/g, '');
    }
    return result;
  }

  function mapSource(value) {
    if (typeof value === 'string') return animatedURL(value);
    if (Array.isArray(value)) {
      var next = value;
      for (var i = 0; i < value.length; i++) {
        var mapped = mapSource(value[i]);
        if (mapped !== value[i]) { if (next === value) next = value.slice(); next[i] = mapped; }
      }
      return next;
    }
    if (value && typeof value === 'object' && typeof value.uri === 'string') {
      var uri = animatedURL(value.uri);
      if (uri !== value.uri) return Object.assign({}, value, { uri: uri });
    }
    return value;
  }

  function typeName(type) {
    if (!type || typeof type === 'string') return '';
    return type.displayName || (type.type && (type.type.displayName || type.type.name)) ||
      (type.render && (type.render.displayName || type.render.name)) || type.name || '';
  }

  function mediaProps(type, props) {
    if (!props || typeof props !== 'object') return props;
    if (props.hidden === true || props.visible === false || props.isHidden === true) return props;
    var cacheable = type && (typeof type === 'function' || typeof type === 'object');
    var group = cacheable ? mediaTypes.get(type) : '';
    if (group === undefined) {
      var name = typeName(type);
      group = !MEDIA_NAME.test(name) ? '' : /emoji|customstatus|userstatus/i.test(name) ? 'emojis' :
        /sticker/i.test(name) ? 'stickers' : /nameplate|gradient/i.test(name) ? 'cosmetics' : 'images';
      mediaTypes.set(type, group);
    }
    if (!group) {
      // Minified components often have no useful name. These explicit media
      // flags carry their own category; check them afresh on each render so a
      // cached anonymous type can also render ordinary text or another media.
      // Never infer animation from a generic `animate` prop alone.
      var gradient = typeof props.animateGradient === 'boolean';
      var emoji = typeof props.animateEmoji === 'boolean';
      var canAnimate = typeof props.canAnimate === 'boolean';
      var flags = props;
      if (gradient && enabled('cosmetics') && !props.animateGradient)
        flags = Object.assign({}, flags, { animateGradient: true });
      if (emoji && enabled('emojis') && !props.animateEmoji)
        flags = Object.assign({}, flags, { animateEmoji: true });
      var flagGroup = gradient ? 'cosmetics' : emoji ? 'emojis' : 'images';
      if (canAnimate && enabled(flagGroup) && !props.canAnimate)
        flags = Object.assign({}, flags, { canAnimate: true });
      // Most elements are text/layout/buttons. Reject them with fixed property
      // reads: no name regex, source walk, closure or array per ordinary render.
      // Anonymous native image components still use their actual source URL.
      if (props.source === undefined && props.src === undefined && props.uri === undefined &&
          props.avatarURL === undefined && props.iconURL === undefined &&
          props.bannerURL === undefined && props.bannerSource === undefined) return flags;
      if (!enabled('images')) return flags;
      var imageProps = flags;
      for (var i = 0; i < SOURCE_KEYS.length; i++) {
        var key = SOURCE_KEYS[i];
        if (props[key] === undefined) continue;
        var mapped = mapSource(props[key]);
        if (mapped !== props[key]) {
          if (imageProps === props) imageProps = Object.assign({}, props);
          imageProps[key] = mapped;
        }
      }
      if (imageProps !== props) stats.renders = (stats.renders || 0) + 1;
      return imageProps;
    }
    return namedMediaProps(group, props);
  }
  function namedMediaProps(group, props) {
    if (!enabled(group)) return props;
    var next = props;
    function set(key, value) {
      if (next[key] === value) return;
      if (next === props) next = Object.assign({}, props);
      next[key] = value;
    }
    // These components default to false when the caller omits animate.
    // Merely changing existing boolean props never reached that default.
    set('animate', true);
    set('canAnimate', true);
    if (group === 'emojis') set('animateEmoji', true);
    YES_FLAGS.forEach(function (key) {
      if (typeof props[key] === 'boolean') set(key, true);
    });
    NO_FLAGS.forEach(function (key) {
      if (typeof props[key] === 'boolean') set(key, false);
    });
    // Vencord forces nameplate looping even when Discord omits the loop prop.
    if (group === 'cosmetics' || group === 'stickers') set('loop', true);
    if (group === 'images') {
      SOURCE_KEYS.forEach(function (key) {
        if (props[key] !== undefined) set(key, mapSource(props[key]));
      });
    }
    if (next !== props) stats.renders = (stats.renders || 0) + 1;
    return next;
  }

  function SettingsComponent() {
    var React = valenced.react.React;
    var RN = valenced.react.ReactNative;
    var Design = valenced.discord && valenced.discord.design && valenced.discord.design.Design || {};
    var h = React.createElement;
    var redraw = React.useState(0)[1];
    var expanded = React.useState(false);
    var fullReport = React.useState(false);
    var native = React.useState(null);
    var loading = React.useState(true);
    var notice = React.useState('');
    var mounted = React.useRef(true);
    var request = React.useRef(0);
    var light = false;
    try {
      var theme = valenced.discord.flux.Stores.ThemeStore.theme;
      light = theme === 'light';
    } catch (_) {
      try { light = RN.Appearance.getColorScheme() === 'light'; } catch (_) {}
    }
    var colours = light ? { text: '#202127', muted: '#626671', card: '#f2f3f5', line: '#dcdfe5' } :
      { text: '#f2f3f5', muted: '#b5bac1', card: '#25262c', line: '#3b3e46' };
    var features = [
      { key: 'images', label: 'Avatars & frames', detail: 'Chat avatars, decorations, server icons and banners.' },
      { key: 'emojis', label: 'Emoji', detail: 'Animated emoji in chat and custom statuses.' },
      { key: 'stickers', label: 'Stickers', detail: 'Keep animated stickers looping in chat.' },
      { key: 'cosmetics', label: 'Nameplates & roles', detail: 'Nameplates and gradient roles, where supported.' }
    ];
    var count = features.filter(function (feature) { return enabled(feature.key); }).length;
    function text(value, muted, style, extra) {
      if (Design.Text) return h(Design.Text, Object.assign({
        variant: muted ? 'text-sm/normal' : 'text-md/normal',
        style: style
      }, muted ? { color: 'text-muted' } : {}, extra || {}), value);
      return h(RN.Text, Object.assign({ style: Object.assign({
        color: muted ? colours.muted : colours.text, fontSize: muted ? 13 : 16
      }, style || {}) }, extra || {}), value);
    }
    function group(children, key) {
      if (Design.TableRowGroup) return h(Design.TableRowGroup, { key: key, title: '' }, children);
      return h(RN.View, { key: key, style: { backgroundColor: colours.card, borderRadius: 16, overflow: 'hidden' } }, children);
    }
    function change(key, value) {
      var patch = {}; patch[key] = value;
      storage.set(patch);
      if (key === 'images' && retryNativeImage) retryNativeImage();
      redraw(function (value) { return value + 1; });
    }
    function report() {
      return JSON.stringify({ build: '1.1.0-beta1', android: native[0], javascript: stats }, null, 2);
    }
    function readStatus() {
      var token = ++request.current;
      loading[1](true);
      var task;
      try {
        var path = valenced.plugins.constants.pluginStorageDirFor('fluttershy2008.always-animate') + '/native-avatar-status.json';
        task = valenced.modules.native.fs.readFile(path);
      } catch (error) { task = Promise.reject(error); }
      return Promise.resolve(task).then(function (value) {
        var data = JSON.parse(value);
        if (mounted.current && token === request.current) { native[1](data); notice[1](''); }
      }).catch(function () {
        if (mounted.current && token === request.current) native[1]({ unavailable: true });
      }).then(function () {
        if (mounted.current && token === request.current) loading[1](false);
      });
    }
    function copyReport() {
      try {
        valenced.externals.ReactNativeClipboard.Clipboard.setString(report());
        notice[1]('Report copied.');
      } catch (_) { notice[1]('Open the full report to select and copy its text.'); fullReport[1](true); }
    }
    React.useEffect(function () {
      mounted.current = true; readStatus();
      return function () { mounted.current = false; request.current++; };
    }, []);
    var data = native[0];
    var ready = !!data && (data.decorationState === 'ready' || data.state === 'ready');
    var status = !count ? 'Paused' : loading[0] ? 'Checking playback' : ready ? 'Playback ready' : 'Status unavailable';
    var statusNote = !count ? 'Turn on an animation below to get started.' :
      ready ? 'Your animation settings are active.' :
      loading[0] ? 'Reading the latest playback status.' : 'Reopen Discord after installing the update.';
    var dot = !count || loading[0] ? '#949ba4' : ready ? '#3ba55c' : '#f0b232';
    function button(label, action, disabled) {
      if (Design.Button) return h(Design.Button, { text: label, variant: 'secondary', size: 'sm', onPress: action, disabled: !!disabled });
      return h(RN.Pressable, { onPress: action, disabled: !!disabled, accessibilityRole: 'button', accessibilityLabel: label,
        style: { borderWidth: 1, borderColor: colours.line, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, opacity: disabled ? 0.5 : 1 }
      }, text(label, false, { fontSize: 14, textAlign: 'center', fontWeight: '600' }));
    }
    function detail(label, value) {
      return h(RN.View, { key: label, style: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 6 } },
        text(label, true, { flex: 1 }), text(String(value), false, { fontSize: 14, fontWeight: '600' }));
    }
    return h(RN.ScrollView, { contentContainerStyle: { padding: 16, paddingBottom: 32 }, showsVerticalScrollIndicator: false },
      h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, marginBottom: 10 } },
        h(RN.View, { style: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#5865f2', alignItems: 'center', justifyContent: 'center' }, accessible: false },
          h(RN.Text, { style: { color: '#ffffff', fontFamily: 'sans-serif', fontSize: 34, lineHeight: 42 } }, '\u221e')),
        h(RN.View, { style: { flex: 1 } },
          text('Always Animate', false, { fontSize: 22, lineHeight: 28, fontWeight: '700' }),
          text('Keep your Discord moving.', true, { marginTop: 3, lineHeight: 18 })),
        text(count + '/4 on', true, { fontSize: 12, fontWeight: '600' })),
      group(h(RN.View, { style: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 } },
        h(RN.View, { style: { width: 9, height: 9, borderRadius: 5, backgroundColor: dot }, accessible: false }),
        h(RN.View, { style: { flex: 1 } }, text(status, false, { fontSize: 15, fontWeight: '600' }),
          text(statusNote, true, { marginTop: 3, lineHeight: 18 }))), 'status'),
      text('ANIMATIONS', true, { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 24, marginBottom: 9, marginLeft: 4 }),
      group(features.map(function (feature, index) {
        if (Design.TableSwitchRow) return h(Design.TableSwitchRow, {
          key: feature.key, label: feature.label, subLabel: feature.detail,
          value: enabled(feature.key), onValueChange: function (value) { change(feature.key, value); },
          accessibilityLabel: feature.label
        });
        return h(RN.View, { key: feature.key, style: { flexDirection: 'row', alignItems: 'center', gap: 14,
          paddingHorizontal: 16, paddingVertical: 15, borderTopWidth: index ? 1 : 0, borderTopColor: colours.line } },
          h(RN.View, { style: { flex: 1 } }, text(feature.label, false, { fontWeight: '600', lineHeight: 22 }),
            text(feature.detail, true, { marginTop: 4, lineHeight: 18 })),
          h(RN.Switch, { value: enabled(feature.key), onValueChange: function (value) { change(feature.key, value); }, accessibilityLabel: feature.label }));
      }), 'features'),
      text('Reopen a chat or profile after changing a switch.', true, { marginTop: 10, marginHorizontal: 4, lineHeight: 18 }),
      text('SUPPORT', true, { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 24, marginBottom: 9, marginLeft: 4 }),
      group([
        h(RN.Pressable, { key: 'expand', onPress: function () { expanded[1](!expanded[0]); }, accessibilityRole: 'button',
          accessibilityLabel: 'Troubleshooting', accessibilityState: { expanded: expanded[0] },
          style: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 } },
          h(RN.View, { style: { flex: 1 } }, text('Troubleshooting', false, { fontSize: 15, fontWeight: '600' }),
            text('Playback status and help with reporting a problem.', true, { marginTop: 4, lineHeight: 18 })),
          text(expanded[0] ? '\u2212' : '+', true, { fontSize: 23, fontFamily: 'sans-serif' })),
        expanded[0] ? h(RN.View, { key: 'details', style: { padding: 16, paddingTop: 0, gap: 6 } },
          detail('Version', '1.1.0-beta1'),
          detail('Frame player', data && data.decorationState === 'ready' ? 'Ready' : loading[0] ? 'Checking' : 'Unavailable'),
          detail('Frame images loaded', data && data.decorationLoaded || 0),
          detail('Playback errors', (data && data.errors || 0) + (data && data.decorationErrors || 0) + (stats.errors || 0)),
          h(RN.View, { style: { flexDirection: 'row', gap: 10, marginTop: 10 } },
            h(RN.View, { style: { flex: 1 } }, button('Copy report', copyReport, loading[0])),
            h(RN.View, { style: { flex: 1 } }, button(loading[0] ? 'Refreshing\u2026' : 'Refresh status', readStatus, loading[0]))),
          notice[0] ? text(notice[0], true, { marginTop: 6, lineHeight: 18 }, { accessibilityLiveRegion: 'polite' }) : null,
          h(RN.Pressable, { onPress: function () { fullReport[1](!fullReport[0]); }, accessibilityRole: 'button',
            accessibilityLabel: fullReport[0] ? 'Hide full report' : 'Show full report', accessibilityState: { expanded: fullReport[0] },
            style: { paddingVertical: 13 } }, text(fullReport[0] ? 'Hide full report' : 'Show full report', true, { fontSize: 13, textDecorationLine: 'underline' })),
          fullReport[0] ? h(RN.ScrollView, { nestedScrollEnabled: true, style: { maxHeight: 260 }, contentContainerStyle: { paddingVertical: 4 } },
            text(report(), true, { fontFamily: 'monospace', fontSize: 11, lineHeight: 16 }, { selectable: true })) : null) : null
      ], 'support'),
      text('Always Animate \u00b7 1.1 beta1', true, { fontSize: 11, textAlign: 'center', marginTop: 22 }));
  }

  return { default: plugin({
    jsonStorage: { load: true, default: defaults },
    init: function (api) {
      storage = api.jsonStorage;
      stats = { jsx: 0, urls: 0, rows: 0, direct: 0, errors: 0 };
      if (api.plugin && api.plugin.startedLate) api.plugin.requireReload();
      var active = true;
      api.cleanup(function () { active = false; mediaTypes = new WeakMap(); urlCache.clear(); });
      var finders = valenced.modules.finders;
      var filters = finders.filters;
      var patcher = valenced.patcher;
      var hooked = new WeakMap();
      var rowHooked = new WeakSet();
      var emojiStore;
      function hook(target, key, kind, callback) {
        if (!target || typeof target[key] !== 'function') return;
        var keys = hooked.get(target);
        if (!keys) { keys = new Set(); hooked.set(target, keys); }
        if (keys.has(key)) return;
        try {
          api.cleanup(patcher[kind](target, key, callback));
          keys.add(key);
          return true;
        } catch (error) {
          stats.errors++;
          stats.lastError = 'Could not attach ' + key + ': ' + String(error.message || error);
          if (api.plugin && api.plugin.reportError) api.plugin.reportError(error);
          return false;
        }
      }
      var imageManager, imageManagerDesired, sendingImageFlag = false;
      var imageManagers = new WeakSet();
      function connectImageManager(mod) {
        if (!active || !mod || typeof mod.setFastImageApngEnabled !== 'function') return;
        imageManager = mod;stats.apngManager = true;
        if (!imageManagers.has(mod)) {
          imageManagers.add(mod);
          if (hook(mod, 'setFastImageApngEnabled', 'before', function (args) {
            if (sendingImageFlag || !active) return args;
            if (typeof args[0] === 'boolean') imageManagerDesired = args[0];
            if (!enabled('images')) return args;
            stats.apngOverrides = (stats.apngOverrides || 0) + (args[0] === true ? 0 : 1);
            var next = args.slice(); next[0] = true; return next;
          })) stats.apngHook = true;
        }
      }
      function enableImageDecoder() {
        if (!active) return;
        if (!imageManager) {
          try { connectImageManager(valenced.modules.native.getNativeModule('NativeImageManagerModule')); } catch (_) {}
          var RN = valenced.react && valenced.react.ReactNative;
          try { connectImageManager(RN && RN.NativeModules && RN.NativeModules.NativeImageManagerModule); } catch (_) {}
          try { if (RN && RN.TurboModuleRegistry && typeof RN.TurboModuleRegistry.get === 'function')
            connectImageManager(RN.TurboModuleRegistry.get('NativeImageManagerModule')); } catch (_) {}
        }
        if (!imageManager) return;
        var value = enabled('images') ? true : imageManagerDesired;
        if (typeof value !== 'boolean') return;
        try {
          sendingImageFlag = true;
          var result = imageManager.setFastImageApngEnabled(value);
          stats.apngCalls = (stats.apngCalls || 0) + 1;stats.apngLastSent = value;stats.apngError = '';
          if (result && typeof result.catch === 'function') result.catch(function (error) { stats.apngError = String(error.message || error); });
        } catch (error) { stats.apngError = String(error.message || error); }
        finally { sendingImageFlag = false; }
      }
      retryNativeImage = enableImageDecoder;
      api.cleanup(finders.getModules(filters.withProps('setFastImageApngEnabled'), function (mod) {
        connectImageManager(mod);enableImageDecoder();
      }));
      enableImageDecoder();
      var imageDecoderTimers = [];
      if (typeof setTimeout === 'function') [1000,3000,8000].forEach(function (ms) { imageDecoderTimers.push(setTimeout(enableImageDecoder,ms)); });
      api.cleanup(function () {
        if (typeof clearTimeout === 'function') imageDecoderTimers.forEach(clearTimeout);
        // Restore Discord's last observed request; do not guess an unreadable
        // experiment value if Discord never called this API during our lifetime.
        if (imageManager && typeof imageManagerDesired === 'boolean') {
          try{sendingImageFlag=true;imageManager.setFastImageApngEnabled(imageManagerDesired);}catch (_){}finally{sendingImageFlag=false;}
        }
        retryNativeImage=undefined;
      });
      var userStore, memberStore;
      api.cleanup(finders.getModules(filters.withProps('getUser', 'getCurrentUser'), function (mod) {
        if (active) { userStore = mod; stats.decorationUserStore = true; }
      }));
      api.cleanup(finders.getModules(filters.withProps('getMember', 'getMembers'), function (mod) {
        if (active) { memberStore = mod; stats.decorationMemberStore = true; }
      }));
      function decorationAsset(data) {
        if (!data || typeof data !== 'object') return null;
        var asset = data.asset;
        return typeof asset === 'string' && /^[a-z0-9_]+$/i.test(asset) ? asset : null;
      }
      function decorationData(object) {
        if (!object || typeof object !== 'object') return undefined;
        if (object.avatarDecorationData !== undefined) return object.avatarDecorationData;
        if (object.avatar_decoration_data !== undefined) return object.avatar_decoration_data;
        if (object.avatarDecoration !== undefined) return object.avatarDecoration;
        return undefined;
      }
      function withChatDecoration(message) {
        if (!enabled('images') || !message || typeof message !== 'object' || Array.isArray(message)) return message;
        // Only native message records: never add schema fields to arbitrary
        // author objects, text AST nodes, image attachments or embeds.
        if (!Object.prototype.hasOwnProperty.call(message, 'avatarURL') &&
            !Object.prototype.hasOwnProperty.call(message, 'avatar_url') &&
            !Object.prototype.hasOwnProperty.call(message, 'avatarDecorationURL')) return message;
        stats.decorationMessages = (stats.decorationMessages || 0) + 1;
        // createMessageContent deliberately omits both avatar URLs on grouped
        // continuations. A cached asset must never create a floating frame.
        var shownAvatar = message.avatarURL || message.avatar_url;
        if (message.isFirst === false || message.showAvatar === false || message.shouldShowAvatar === false ||
            typeof shownAvatar !== 'string' || !shownAvatar.length) return message;
        var current = message.avatarDecorationURL;
        if (typeof current === 'string' && current.length) return message;
        var author = message.author || message.user;
        var id = message.authorId || message.author_id || message.userId || message.user_id || (author && author.id);
        if (!id) {
          var avatar = message.avatarURL || message.avatar_url || '';
          var match = /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/avatars\/(\d+)\//.exec(avatar) ||
            /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/guilds\/\d+\/users\/(\d+)\/avatars\//.exec(avatar);
          if (match) id = match[1];
        }
        var data = decorationData(message);
        if (data === undefined) data = decorationData(author);
        try {
          var guild = message.guildId || message.guild_id;
          if (data === undefined && id && guild && memberStore) {
            var memberData = decorationData(memberStore.getMember(guild, id));
            // Null per-server data falls back to the global decoration.
            if (memberData != null) data = memberData;
          }
          if (data === undefined && id && userStore) {
            var cachedUser = userStore.getUser(id);
            if (cachedUser) stats.decorationUserHits = (stats.decorationUserHits || 0) + 1;
            data = decorationData(cachedUser);
          }
        } catch (_) { stats.decorationLookupErrors = (stats.decorationLookupErrors || 0) + 1; }
        var asset = decorationAsset(data);
        var sku = data && (data.skuId || data.sku_id);
        var address = sku && /^\d+$/.test(String(sku)) ?
          'https://cdn.discordapp.com/media/v1/collectibles-shop/' + sku + '/animated' :
          asset ? 'https://cdn.discordapp.com/avatar-decoration-presets/' + asset + '.png?size=256&passthrough=true' : null;
        if (!address) return message;
        stats.decorationAssets = (stats.decorationAssets || 0) + 1;
        stats.decorationInjected = (stats.decorationInjected || 0) + 1;
        return Object.assign({}, message, { avatarDecorationURL: address });
      }
      // The final handoff is independent of RowManager's cached generated rows.
      // Current clients use updateRows(ref, { rows }); older NativeChatModule /
      // DCDChatManager clients use updateRows(ref, JSON.stringify(rows)).
      function rewriteChatPayload(payload) {
        var asJSON = typeof payload === 'string';
        var root = payload;
        if (asJSON) {
          if (!/^\s*[\[{]/.test(payload)) return payload;
          try { root = JSON.parse(payload); } catch (_) { return payload; }
        }
        if (!root || typeof root !== 'object') return payload;
        var budget = 20000;
        var ancestors = new WeakSet();
        function walk(value, avatarContext, depth, fieldName) {
          if (--budget < 0 || depth > 20) return value;
          if (typeof value === 'string') {
            // Some native wrappers serialize rows inside their rows/data field.
            if (/^(?:rows|data)$/i.test(fieldName || '') && /^\s*[\[{]/.test(value)) {
              try { var decoded = JSON.parse(value); var nested = walk(decoded, false, depth + 1);
                return nested === decoded ? value : JSON.stringify(nested);
              } catch (_) { return value; }
            }
            if (!enabled('images')) return value;
            if (avatarContext) {
              stats.bridgeAvatarFields = (stats.bridgeAvatarFields || 0) + 1;
              if (/^a_[a-z0-9_]+$/i.test(value)) stats.bridgeHashes = (stats.bridgeHashes || 0) + 1;
              if (/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/(?:avatars\/|guilds\/[^/]+\/users\/[^/]+\/avatars\/)/i.test(value) && !/\/a_/.test(value)) stats.bridgeStatic = (stats.bridgeStatic || 0) + 1;
            }
            if (avatarContext) {
              var decoratedURL = animatedDecorationURL(value);
              if (decoratedURL !== value) { stats.decorationURLChanges = (stats.decorationURLChanges || 0) + 1; return decoratedURL; }
            }
            if (!avatarContext || !/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/(?:avatars\/|guilds\/[^/]+\/users\/[^/]+\/avatars\/)/i.test(value) || !/\/a_[a-z0-9_]+\./i.test(value)) return value;
            stats.bridgeAnimated = (stats.bridgeAnimated || 0) + 1;
            var url = animatedURL(value);
            if (/\.gif(?:[?#]|$)/i.test(url)) stats.bridgeGifs = (stats.bridgeGifs || 0) + 1;
            if (url !== value) stats.bridgeChanges = (stats.bridgeChanges || 0) + 1;
            return url;
          }
          if (!value || typeof value !== 'object' || ancestors.has(value)) return value;
          ancestors.add(value);
          var copy = value;
          if (Array.isArray(value)) {
            value.forEach(function (item, i) {
              var next = walk(item, avatarContext, depth + 1);
              if (next !== item) { if (copy === value) copy = value.slice(); copy[i] = next; }
            });
          } else {
            if (fieldName === 'message' || Object.prototype.hasOwnProperty.call(value, 'avatarURL'))
              copy = mapMessage(value, 0);
            copy = withChatDecoration(copy);
            var avatarNode = avatarContext || value.type === 'avatar';
            Object.keys(value).forEach(function (key) {
              // Chat text, attachments and embeds must keep their exact contents.
              if (/^(?:content|attachments|embeds)$/i.test(key)) return;
              var next = walk(value[key], avatarNode || /avatar/i.test(key), depth + 1, key);
              if (next !== value[key]) { if (copy === value) copy = Object.assign({}, value); copy[key] = next; }
            });
          }
          ancestors.delete(value);
          return copy;
        }
        var result = walk(root, false, 0);
        return result === root ? payload : asJSON ? JSON.stringify(result) : result;
      }
      function attachChatBridge(mod) {
        if (!active || !mod || typeof mod.updateRows !== 'function') return;
        if (hook(mod, 'updateRows', 'before', function (args) {
          if (!active || (!enabled('images') && !enabled('emojis') && !enabled('stickers'))) return args;
          stats.bridgeCalls = (stats.bridgeCalls || 0) + 1;
          try {
            var payload = rewriteChatPayload(args[1]);
            if (payload === args[1]) return args;
            var next = args.slice(); next[1] = payload; return next;
          } catch (error) {
            stats.errors++;
            stats.lastError = 'Avatar handoff: ' + String(error.message || error);
            return args;
          }
        })) stats.bridges = (stats.bridges || 0) + 1;
      }
      api.cleanup(finders.getModules(filters.withProps('updateRows', 'clearRows', 'scrollToBottom'), attachChatBridge));
      retryNativeBridges = function () {
        if (!active) return;
        ['NativeChatModule', 'DCDChatManager'].forEach(function (name) {
          try { attachChatBridge(valenced.modules.native.getNativeModule(name)); } catch (_) {}
        });
      };
      retryNativeBridges();
      api.cleanup(function () { retryNativeBridges = undefined; });
      // User.getAvatarURL is an instance method, so withProps('getAvatarURL')
      // does not find it on the constructor export.
      if (typeof filters.createFilterGenerator === 'function') {
        var withUserAvatarModel = filters.createFilterGenerator(function (_, id, mod) {
          return !!(mod && mod.prototype && typeof mod.prototype.getAvatarURL === 'function');
        }, function () { return 'alwaysAnimate.userAvatarModel'; });
        api.cleanup(finders.getModules(withUserAvatarModel(), function (User) {
          if (hook(User.prototype, 'getAvatarURL', 'after', function (result) {
            return active && enabled('images') ? mapSource(result) : result;
          })) stats.userModels = (stats.userModels || 0) + 1;
        }));
      }
      // Patch the actual mobile Avatar memo component, including when the
      // caller captured its reference before a JSX factory could be patched.
      api.cleanup(finders.getModules(filters.withProps('getStatusSize'), function (mod) {
        if (!active) return;
        var avatar = mod.default;
        if (avatar && typeof avatar.type === 'function') {
          if (hook(avatar, 'type', 'before', function (args) {
            if (!active || !enabled('images') || !args[0]) return args;
            var next = args.slice();
            next[0] = Object.assign({}, args[0], { animate: true });
            stats.renders = (stats.renders || 0) + 1;
            return next;
          })) stats.direct++;
        }
      }));
      api.cleanup(finders.getModules(filters.withName('GuildIcon'), function (GuildIcon) {
        if (!active || !GuildIcon.prototype) return;
        if (hook(GuildIcon.prototype, 'render', 'instead', function (args, original) {
          if (!active || !enabled('images')) return original.apply(this, args);
          var previous = this.props;
          this.props = Object.assign({}, previous, { animate: true });
          stats.renders = (stats.renders || 0) + 1;
          try { return original.apply(this, args); }
          finally { this.props = previous; }
        })) stats.direct++;
      }));
      // The mobile ImageResolver uses an explicit second argument for user
      // avatars and canAnimate in the other two options objects.
      ['getUserAvatarURL', 'getGuildMemberAvatarURLSimple', 'getAvatarDecorationURL'].forEach(function (key) {
        api.cleanup(finders.getModules(filters.withProps(key), function (mod) {
          if (!active) return;
          // Use a separate registration key so before and after may coexist.
          var unpatch;
          try {
            unpatch = patcher.before(mod, key, function (args) {
              if (!active || !enabled('images')) return args;
              var next = args.slice();
              if (key === 'getUserAvatarURL') next[1] = true;
              else if (args[0] && typeof args[0] === 'object')
                next[0] = Object.assign({}, args[0], { canAnimate: true });
              return next;
            });
            api.cleanup(unpatch);
            stats.direct++;
          } catch (error) {
            stats.errors++;
            stats.lastError = 'Could not attach ' + key + ': ' + String(error.message || error);
          }
        }));
      });
      // Match Discord's normal emoji setting path. Do not change relationship
      // stores, block filtering, visibility flags or the static emoji fallback.
      api.cleanup(finders.getModules(filters.withProps('AnimateEmoji'), function (mod) {
        var root = mod && (mod.AnimateEmoji ? mod : mod.default);
        var target = root && root.AnimateEmoji;
        if (!target) return;
        ['getSetting', 'useSetting'].forEach(function (method) {
          if (hook(target, method, 'after', function (result) {
            return active && enabled('emojis') ? true : result;
          })) stats.emojiSettings = (stats.emojiSettings || 0) + 1;
        });
      }));
      api.cleanup(finders.getModules(filters.withProps('getCustomEmojiById'), function (mod) {
        if (active) emojiStore = mod;
      }));
      function isAnimatedEmoji(node) {
        if (node.animated === true || /\.gif(?:[?#]|$)/i.test(node.src || '')) return true;
        try { return !!(emojiStore && node.id && emojiStore.getCustomEmojiById(node.id)?.animated); }
        catch (_) { return false; }
      }
      function mapNodes(nodes, depth, emojiInfo) {
        if (!Array.isArray(nodes) || depth > 16) return nodes;
        var next = nodes;
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (!node || typeof node !== 'object') continue;
          // Leave spoiler subtrees hidden until Discord reveals them.
          if (/spoiler/i.test(node.type || '')) continue;
          var out = node;
          if (enabled('emojis') && node.type === 'customEmoji' && isAnimatedEmoji(node)) {
            if (emojiInfo) emojiInfo.animated = true;
            var src = node.src;
            if (typeof src === 'string' && /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/emojis\/\d+\.(?:png|webp|gif)(?:[?#]|$)/i.test(src)) {
              src = src.replace(/\.(?:png|webp)(?=[?#]|$)/i, '.gif');
              if (node.src !== src) out = Object.assign({}, node, { src: src });
            }
          }
          var content = mapNodes(node.content, depth + 1, emojiInfo);
          if (content !== node.content) out = Object.assign({}, out, { content: content });
          if (out !== node) { if (next === nodes) next = nodes.slice(); next[i] = out; }
        }
        return next;
      }
      function mapMessage(message, depth) {
        if (!message || depth > 4) return message;
        var out = message;
        function set(key, value) {
          if (value === message[key]) return;
          if (out === message) out = Object.assign({}, message);
          out[key] = value;
        }
        if (enabled('images')) {
          ['avatarURL', 'guildAvatarURL', 'avatarDecorationURL'].forEach(function (key) {
            if (typeof message[key] === 'string') set(key, animatedURL(message[key]));
          });
        }
        if (enabled('emojis')) {
          var emojiInfo = { animated: false };
          set('content', mapNodes(message.content, 0, emojiInfo));
          if ('animateEmoji' in message || emojiInfo.animated) set('animateEmoji', true);
        }
        if (enabled('stickers') && Array.isArray(message.stickers)) {
          var changed = false;
          var stickers = message.stickers.map(function (sticker) {
            if (!sticker || [2, 3, 4].indexOf(sticker.format_type) < 0 || sticker.renderMode === 0) return sticker;
            changed = true;
            return Object.assign({}, sticker, { renderMode: 0 });
          });
          if (changed) set('stickers', stickers);
        }
        var reply = message.referencedMessage;
        if (reply && reply.message) {
          var transformed = mapMessage(reply.message, depth + 1);
          if (transformed !== reply.message) set('referencedMessage', Object.assign({}, reply, { message: transformed }));
        }
        return out;
      }
      // Native Android chat rows bypass React; use the same RowManager hook
      // used by Valenced community plugins, and preserve cached row objects.
      api.cleanup(finders.getModules(filters.withName('RowManager'), function (RowManager) {
        if (!active || !RowManager.prototype || rowHooked.has(RowManager.prototype)) return;
        var proto = RowManager.prototype;
        if (typeof proto.generate !== 'function') return;
        rowHooked.add(proto);
        hook(proto, 'generate', 'after', function (row) {
          if (!active || !row || !row.message || (row.type !== 1 && row.rowType !== 1)) return row;
          var message = mapMessage(row.message, 0);
          if (message !== row.message) stats.rowChanges = (stats.rowChanges || 0) + 1;
          return message === row.message ? row : Object.assign({}, row, { message: message });
        });
        stats.rows++;
      }));
      // A constant-time factory dispatch remains necessary for anonymous image
      // exports. Classify each component type once; inspect sources only on media
      // candidates. Never walk the screen/component tree or start a polling loop.
      api.cleanup(finders.getModules(filters.withProps('jsx', 'jsxs'), function (runtime) {
        if (!active) return;
        ['jsx', 'jsxs'].forEach(function (key) {
          hook(runtime, key, 'before', function (args) {
            if (!active) return args;
            var props = mediaProps(args[0], args[1]);
            if (props === args[1]) return args;
            var next = args.slice(); next[1] = props; return next;
          });
        });
        stats.jsx++;
      }));
      api.cleanup(finders.getModules(filters.withProps('createElement', 'useState'), function (React) {
        if (!active) return;
        hook(React, 'createElement', 'before', function (args) {
          if (!active) return args;
          var props = mediaProps(args[0], args[1]);
          if (props === args[1]) return args;
          var next = args.slice(); next[1] = props; return next;
        });
      }));
      IMAGE_METHODS.forEach(function (key) {
        api.cleanup(finders.getModules(filters.withProps(key), function (mod) {
          if (!active) return;
          if (hook(mod, key, 'after', function (result) {
            var next = active && enabled('images') ? mapSource(result) : result;
            if (next !== result) stats.urlChanges = (stats.urlChanges || 0) + 1;
            return next;
          })) stats.urls++;
        }));
      });
      // getEmojiURL's options.animated is deliberately left intact: forcing
      // static emoji IDs to GIF would request files which do not exist.
    },
    start: async function (api) {
      storage = api.jsonStorage;
      if (storage && typeof storage.get === 'function') await storage.get();
      if (retryNativeBridges) retryNativeBridges();
      if (retryNativeImage) retryNativeImage();
    },
    SettingsComponent: SettingsComponent
  }) };
})()
