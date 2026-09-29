import { isGIF, prepareGIF } from "./gif.js";

export default (() => {
  "use strict";
  const V = typeof vendetta !== "undefined" ? vendetta : globalThis.vendetta;
  if (!V?.metro || !V?.patcher) throw new Error("SaveAsSticker needs Revenge's Vendetta plugin support.");
  const { React, ReactNative: RN, constants } = V.metro.common;
  const h = React.createElement;
  const SHEET_KEY = "SaveAsStickerPicker", ROW_KEY = "save-as-sticker-action";
  const MAX_BYTES = 512 * 1024, MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
  const LIMITS = [5, 15, 30, 60], unpatches = [];
  let active = false, generation = 0, saving = false;

  const byProps = (...keys) => {
    try { return V.metro.findByProps(...keys); } catch { return undefined; }
  };
  const byStore = name => {
    try { return V.metro.findByStoreName(name); } catch { return undefined; }
  };
  const asset = (...names) => {
    for (const name of names) {
      try { const id = V.ui.assets.getAssetIDByName(name); if (id != null) return id; } catch {}
    }
  };
  const log = (...args) => V.logger?.error?.("[SaveAsSticker]", ...args);
  const toast = message => {
    try { V.ui.toasts.showToast(message, asset("StickerIcon", "ic_sticker_24px")); }
    catch { console.log("[SaveAsSticker]", message); }
  };
  const sheetHost = byProps("openLazy", "hideActionSheet");
  const Row = byProps("ActionSheetRow")?.ActionSheetRow;
  const Forms = V.ui.components?.Forms ?? {};
  const TitleHeader = byProps("ActionSheetTitleHeader")?.ActionSheetTitleHeader
    ?? byProps("BottomSheetTitleHeader")?.BottomSheetTitleHeader;
  const CloseButton = byProps("ActionSheetCloseButton")?.ActionSheetCloseButton;
  const GuildIconModule = byProps("GuildIconSizes");
  const GuildIcon = GuildIconModule?.default;
  const GuildIconSizes = GuildIconModule?.GuildIconSizes;
  const ServerList = byProps("BottomSheetFlatList")?.BottomSheetFlatList
    ?? byProps("BottomSheetScrollView")?.BottomSheetFlatList ?? RN.FlatList;
  let Sheet = byProps("ActionSheet")?.ActionSheet;
  if (!Sheet) {
    try { Sheet = V.metro.find(m => m?.render?.name === "ActionSheet"); } catch {}
  }

  function filenameName(filename) {
    const name = String(filename || "sticker").replace(/\.[a-z0-9]{1,6}$/i, "")
      .replace(/[\u0000-\u001f]/g, "").trim().slice(0, 30);
    return name.length >= 2 ? name : "sticker";
  }

  function imageFrom(source, knownImage = false) {
    if (!source) return null;
    const mime = String(source.content_type ?? source.contentType ?? source.mimeType ?? "");
    const kind = source.mediaType ?? source.type;
    // GIF previews are sometimes labelled video by Discord. Prefer the original
    // .gif URL when available, preserving signed attachment query parameters.
    const candidates = [source.url, source.sourceURI, source.mediaUrl, source.uri, source.proxy_url, source.proxyURL,
      source.image?.url, source.thumbnail?.url, source.video?.url];
    const gifURL = candidates.find(url => typeof url === "string" && /\.gif(?:[?#]|$)/i.test(url));
    const animatedGIF = mime === "image/gif" || Boolean(gifURL);
    if (!animatedGIF && (/^(video|audio)\//i.test(mime) || /^(video|audio|file)$/i.test(String(kind)))) return null;
    let url = gifURL ?? source.mediaUrl ?? source.sourceURI ?? source.url ?? source.uri ?? source.proxy_url ?? source.proxyURL;
    if (gifURL) {
      // Discord's media proxy can request a static/video rendering of a GIF.
      // Remove only conversion parameters; authentication parameters stay intact.
      url = url.replace(/([?&])format=(?:webp|png|jpe?g|mp4)(?=&|$)/gi, "$1")
        .replace(/([?&])animated=false(?=&|$)/gi, "$1").replace(/\?&/, "?").replace(/&&+/g, "&").replace(/[?&]$/, "");
    }
    if (typeof url !== "string" || !/^https:\/\//i.test(url)) return null;
    const filename = source.filename ?? source.name ?? url.split(/[?#]/)[0].split("/").pop() ?? "sticker";
    if (!knownImage && kind !== "image" && !mime.startsWith("image/")
      && !/\.(png|apng|jpe?g|webp|gif|avif|bmp)(?:[?#]|$)/i.test(filename)
      && !/\.(png|apng|jpe?g|webp|gif|avif|bmp)(?:[?#]|$)/i.test(url)) return null;
    return { url, filename, contentType: animatedGIF ? "image/gif" : mime, id: source.id ?? source.attachmentId };
  }

  function resolveImages(...values) {
    const contexts = values.flatMap(value => {
      if (!value || typeof value !== "object") return [];
      const nested = value.analyticsLocation;
      return nested && typeof nested === "object" ? [value, nested] : [value];
    });
    // Explicit selections win, including videos. Do not choose another attachment.
    for (const ctx of contexts) {
      if (ctx.selectedMedia) {
        const s = ctx.selectedMedia;
        const image = imageFrom({ ...s.source, ...s }, s.mediaType === "image");
        return image ? [image] : [];
      }
    }
    for (const ctx of contexts) {
      let source = ctx.source;
      if (ctx.syncer?.sources) {
        const index = ctx.syncer.index?.value ?? ctx.syncer.index ?? 0;
        source = ctx.syncer.sources[index];
      }
      if (Array.isArray(source)) source = source[0];
      if (source) {
        const image = imageFrom(source);
        return image ? [image] : [];
      }
    }
    const images = [];
    for (const ctx of contexts) {
      for (const attachment of ctx.message?.attachments ?? []) {
        const image = imageFrom(attachment);
        if (image) images.push(image);
      }
      for (const embed of ctx.message?.embeds ?? []) {
        for (const source of [embed.image, ...(embed.images ?? []), embed.type === "image" ? embed : null,
          embed.type === "gifv" && /\.gif(?:[?#]|$)/i.test(embed.video?.url ?? "") ? { ...embed.video, contentType: "image/gif" } : null,
          embed.type === "gifv" && /\.gif(?:[?#]|$)/i.test(embed.thumbnail?.url ?? "") ? embed.thumbnail : null]) {
          const image = imageFrom(source, true);
          if (image) images.push(image);
        }
      }
    }
    return images.filter((image, i) => images.findIndex(other => other.url === image.url) === i);
  }

  function canCreate(guild) {
    if (!guild?.id || guild.unavailable) return false;
    const me = byStore("UserStore")?.getCurrentUser?.()?.id;
    if (me && (guild.ownerId === me || guild.owner_id === me)) return true;
    // Manage Expressions alone does not grant Create Expressions on current Discord.
    const permission = constants?.Permissions?.CREATE_GUILD_EXPRESSIONS ?? (1n << 43n);
    try { return Boolean(byStore("PermissionStore")?.can?.(permission, guild)); } catch { return false; }
  }

  function stickerSlots(guild) {
    const tier = Number(guild.premiumTier ?? guild.premium_tier ?? 0), features = guild.features;
    const more = Array.isArray(features) ? features.includes("MORE_STICKERS") : features?.has?.("MORE_STICKERS");
    const extra = Number(guild.premiumFeatures?.additionalStickerSlots ?? guild.premium_features?.additional_sticker_slots ?? 0);
    const base = more && tier === 3 ? 120 : LIMITS[tier] ?? LIMITS[0];
    const explicit = Number(guild.maxStickers ?? guild.max_stickers ?? 0);
    const max = Math.max(base + (Number.isFinite(extra) ? Math.max(0, extra) : 0), explicit || 0);
    const store = byStore("GuildStickersStore") ?? byStore("StickersStore") ?? byStore("StickerStore");
    let list = store?.getStickersByGuildId?.(guild.id) ?? guild.stickers;
    if (list && !Array.isArray(list)) list = Object.values(list);
    return { max, used: Array.isArray(list) ? list.length : null };
  }

  function eligibleGuilds() {
    // Keep full servers visible, like Discord's native expression picker.
    return Object.values(byStore("GuildStore")?.getGuilds?.() ?? {}).filter(canCreate)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  function errorText(error) {
    const code = Number(error?.body?.code ?? error?.code);
    if (code === 50013) return "You need Create Expressions permission in this server.";
    if (code === 30039) return "This server has no free sticker slots. Choose another server.";
    for (const value of [error?.body?.message, error?.message, error?.text]) {
      if (typeof value !== "string" || !value) continue;
      try { return JSON.parse(value)?.message ?? value; } catch { return value; }
    }
    return "Discord could not upload the sticker. Please try again.";
  }

  function nativeFiles() {
    const found = byProps("writeFile", "readFile", "removeFile");
    if (found) return found;
    for (const name of ["NativeFileModule", "RTNFileManager", "DCDFileManager"]) {
      try {
        const module = RN.NativeModules?.[name] ?? globalThis.nativeModuleProxy?.[name];
        if (module?.writeFile) return module;
      } catch {}
    }
  }

  function readBlob(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("Could not read the image."));
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(blob);
    });
  }
  function base64Bytes(data) {
    return Math.floor(data.length * 3 / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  }
  function pngSize(base64) {
    // Read the PNG signature/IHDR without atob (missing on some Hermes builds).
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", bytes = [];
    let bits = 0, buffer = 0;
    for (const ch of base64.slice(0, 44)) {
      const value = alphabet.indexOf(ch);
      if (value < 0) break;
      buffer = (buffer << 6) | value; bits += 6;
      if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 255); }
    }
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 24 || signature.some((v, i) => bytes[i] !== v)
      || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
    const number = i => bytes[i] * 16777216 + bytes[i + 1] * 65536 + bytes[i + 2] * 256 + bytes[i + 3];
    return { width: number(16), height: number(20) };
  }
  function fileUri(path) {
    if (typeof path !== "string" || !path) throw new Error("Discord did not return a local image path.");
    return /^(file|content):\/\//.test(path) ? path : "file://" + path;
  }

  async function prepare(image, session) {
    const files = nativeFiles();
    if (!files?.writeFile || !files?.removeFile) throw new Error("Discord's image file module is unavailable on this build.");
    const temporary = [], picker = byProps("launchCropper", "cleanSingle") ?? byProps("launchCropper");
    let cropPath;
    async function cleanup() {
      if (cropPath && picker?.cleanSingle) { try { await picker.cleanSingle(cropPath); } catch {} }
      for (const path of temporary) { try { await files.removeFile("cache", path); } catch {} }
    }
    const check = () => {
      if (!active || generation !== session) throw Object.assign(new Error("Cancelled"), { code: "E_PICKER_CANCELLED" });
    };
    try {
      let url = image.url;
      const refresh = byProps("maybeRefreshAttachmentUrl");
      if (/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//i.test(url)) {
        try { url = await refresh?.maybeRefreshAttachmentUrl?.(url) || url; } catch {}
      }
      const response = await (V.utils?.safeFetch ?? fetch)(url, {}, 20000);
      if (!response.ok) throw new Error("Image download failed (HTTP " + response.status + "). Reopen the image and try again.");
      if (Number(response.headers?.get?.("content-length")) > MAX_DOWNLOAD_BYTES) throw new Error("Choose an image smaller than 25 MB.");
      const blob = await response.blob();
      if (blob.size > MAX_DOWNLOAD_BYTES) throw new Error("Choose an image smaller than 25 MB.");
      let data = await readBlob(blob);
      check();
      if (!data) throw new Error("The image is empty.");
      const prefix = "save-as-sticker-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      if (isGIF(data)) {
        toast("Preparing animated GIF…");
        const gif = await prepareGIF(data, check);
        check();
        const output = prefix + "-sticker.gif";
        temporary.push(output);
        const uri = fileUri(await files.writeFile("cache", output, gif.base64, "base64"));
        check();
        return { uri, mimeType: gif.mimeType, cleanup };
      }
      if (image.contentType === "image/gif" || blob.type === "image/gif") {
        throw new Error("This link returned a video or still preview. Share the original .gif file and try again.");
      }
      const size = pngSize(data);
      if (!size || size.width !== 320 || size.height !== 320 || base64Bytes(data) > MAX_BYTES) {
        if (!picker?.launchCropper) throw new Error("Image cropping is unavailable. Choose a 320×320 PNG under 512 KiB.");
        const mime = blob.type || image.contentType || "image/png";
        const ext = /jpeg/i.test(mime) ? "jpg" : /webp/i.test(mime) ? "webp" : /gif/i.test(mime) ? "gif" : /avif/i.test(mime) ? "avif" : "png";
        const input = prefix + "." + ext;
        temporary.push(input);
        const local = fileUri(await files.writeFile("cache", input, data, "base64"));
        check();
        const result = await picker.launchCropper({
          uri: local, width: 320, height: 320, mimeType: "image/png", includeBase64: true, freeStyleCropEnabled: false,
        });
        cropPath = result?.path ?? result?.uri;
        check();
        data = result?.data ?? result?.base64;
        if (!data && cropPath && files.readFile) data = await files.readFile(cropPath.replace(/^file:\/\//, ""), "base64");
        if (typeof data !== "string" || !data) throw new Error("The cropper did not return an image.");
        data = data.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
      }
      const outputSize = pngSize(data);
      if (!outputSize || outputSize.width !== 320 || outputSize.height !== 320) {
        throw new Error("The cropper did not produce a 320×320 PNG. The sticker was not uploaded.");
      }
      if (base64Bytes(data) > MAX_BYTES) throw new Error("The cropped sticker is over 512 KiB. Try a simpler image.");
      const output = prefix + "-sticker.png";
      temporary.push(output);
      const uri = fileUri(await files.writeFile("cache", output, data, "base64"));
      check();
      return { uri, mimeType: "image/png", cleanup };
    } catch (error) { await cleanup(); throw error; }
  }

  async function save(guild, image, name) {
    if (saving || !active) return;
    saving = true;
    const session = generation;
    let prepared;
    try {
      if (name.length < 2 || name.length > 30) throw new Error("Use a sticker name between 2 and 30 characters.");
      const uploader = byProps("createGuildSticker");
      if (!uploader?.createGuildSticker) throw new Error("Discord's sticker upload module is unavailable on this build.");
      sheetHost.hideActionSheet(SHEET_KEY);
      RN.Keyboard?.dismiss?.();
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!active || generation !== session) return;
      toast("Preparing your sticker…");
      prepared = await prepare(image, session);
      if (!active || generation !== session) return;
      const currentGuild = byStore("GuildStore")?.getGuild?.(guild.id) ?? guild;
      if (!canCreate(currentGuild)) throw new Error("You no longer have Create Expressions permission in this server.");
      const slots = stickerSlots(currentGuild);
      if (slots.used != null && slots.used >= slots.max) throw new Error("This server has no free sticker slots. Choose another server.");
      toast("Adding sticker to " + guild.name + "…");
      // Android's native multipart uploader accepts a local file:// URI.
      // Never retry a POST automatically: a timeout may follow a successful creation.
      const result = await uploader.createGuildSticker({
        guildId: guild.id, name, tags: "slight_smile", description: "",
        uri: prepared.uri, mimeType: prepared.mimeType, platform: "mobile", originalMd5: null,
      });
      if (!result?.id && !result?.body?.id) throw new Error("Discord did not confirm the upload. Check the server's stickers before trying again.");
      if (active && generation === session) toast("Sticker added to " + guild.name);
    } catch (error) {
      if (error?.code === "E_PICKER_CANCELLED" || /cancel/i.test(String(error?.message ?? ""))) return;
      log("Upload failed", error);
      if (active && generation === session) {
        const message = errorText(error);
        if (RN.Alert?.alert) RN.Alert.alert("Sticker could not be added", message); else toast(message);
      }
    } finally { await prepared?.cleanup?.(); saving = false; }
  }

  function Picker({ images }) {
    const [image, setImage] = React.useState(images.length === 1 ? images[0] : null);
    const [guild, setGuild] = React.useState(null);
    const [name, setName] = React.useState(filenameName(images[0]?.filename));
    const [, setRevision] = React.useState(0);
    const dark = RN.Appearance?.getColorScheme?.() !== "light";
    const colors = { text: dark ? "#f2f3f5" : "#1e1f22", muted: dark ? "#b5bac1" : "#4e5058", input: dark ? "#1e1f22" : "#e3e5e8" };
    React.useEffect(() => {
      const stores = [byStore("GuildStore"), byStore("PermissionStore"), byStore("GuildStickersStore"), byStore("StickersStore")].filter(Boolean);
      const refresh = () => setRevision(value => value + 1);
      stores.forEach(store => store.addChangeListener?.(refresh));
      return () => stores.forEach(store => store.removeChangeListener?.(refresh));
    }, []);
    const text = (value, style = {}) => h(RN.Text, { style: { color: colors.text, fontSize: 16, ...style } }, value);
    const button = (label, onPress, disabled = false) => h(RN.Pressable, {
      accessibilityRole: "button", accessibilityLabel: label, disabled, onPress,
      style: { padding: 14, borderRadius: 8, backgroundColor: disabled ? "#555967" : "#5865f2", marginTop: 12 },
    }, text(label, { color: "#ffffff", fontWeight: "600", textAlign: "center" }));
    const inputStyle = { color: colors.text, backgroundColor: colors.input, borderRadius: 8, padding: 12, fontSize: 16, marginTop: 10 };
    const close = () => sheetHost.hideActionSheet(SHEET_KEY);
    const headerImage = image ? h(RN.Image, {
      source: { uri: image.url }, resizeMode: "contain", accessibilityLabel: "Sticker preview",
      style: { width: 26, height: 26, marginRight: 12 },
    }) : null;
    const title = guild ? "Sticker name" : image ? "Saving " + filenameName(image.filename) : "Choose image";
    const closeControl = CloseButton
      ? h(CloseButton, { onPress: close, accessibilityLabel: "Close" })
      : h(RN.Pressable, {
          onPress: close, accessibilityRole: "button", accessibilityLabel: "Close",
          hitSlop: 10, style: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
        }, text("×", { fontSize: 32, lineHeight: 36 }));
    const header = TitleHeader ? h(TitleHeader, { title, leading: headerImage, trailing: closeControl })
      : h(RN.View, { style: { flexDirection: "row", alignItems: "center", paddingHorizontal: 28, minHeight: 72 } },
          headerImage, h(RN.Text, {
            numberOfLines: 1, style: { flex: 1, color: colors.text, fontSize: 20, fontWeight: "600", textAlign: "center", paddingHorizontal: 8 },
          }, title), closeControl);
    const sheetHeight = Math.min(640, (RN.Dimensions?.get?.("window")?.height ?? 800) * 0.62);

    function serverIcon(item) {
      if (GuildIcon) return h(GuildIcon, { guild: item, size: GuildIconSizes?.MEDIUM, animate: false });
      if (item.icon) return h(RN.Image, {
        source: { uri: "https://cdn.discordapp.com/icons/" + item.id + "/" + item.icon + ".png?size=96" },
        style: { width: 44, height: 44, borderRadius: 14 }, resizeMode: "cover",
      });
      const initials = String(item.name).trim().split(/\s+/).map(word => word[0]).join("").slice(0, 3);
      return h(RN.View, { style: {
        width: 44, height: 44, borderRadius: 14, backgroundColor: "#5865f2", alignItems: "center", justifyContent: "center",
      } }, text(initials, { color: "#ffffff", fontWeight: "600" }));
    }
    function serverRow(item) {
      const slots = stickerSlots(item);
      const full = slots.used != null && slots.used >= slots.max;
      const subLabel = full ? "No slots available" : slots.used == null ? "Check slots on upload" : undefined;
      // Also guard the callback: the store may change before this row re-renders.
      const select = () => {
        const current = byStore("GuildStore")?.getGuild?.(item.id) ?? item;
        const now = stickerSlots(current);
        if (!canCreate(current) || (now.used != null && now.used >= now.max)) return;
        setGuild(current);
      };
      const plusAsset = asset("ic_add_24px", "PlusSmallIcon", "PlusIcon");
      const plus = Forms.FormIcon && plusAsset != null
        ? h(Forms.FormIcon, { source: plusAsset, style: { opacity: 1 } })
        : text("+", { color: colors.muted, fontSize: 30, fontWeight: "300" });
      if (Forms.FormRow) return h(Forms.FormRow, {
        key: item.id, leading: serverIcon(item), label: item.name, subLabel,
        trailing: plus, disabled: full, onPress: select, accessibilityLabel: item.name,
        accessibilityRole: "button", accessibilityState: { disabled: full },
      });
      return h(RN.Pressable, {
        key: item.id, accessibilityRole: "button", accessibilityLabel: item.name,
        accessibilityState: { disabled: full }, disabled: full, onPress: select,
        style: { minHeight: 80, paddingHorizontal: 32, flexDirection: "row", alignItems: "center", opacity: full ? 0.4 : 1 },
      }, serverIcon(item), h(RN.View, { style: { flex: 1, marginLeft: 18, marginRight: 16 } },
        text(item.name, { fontWeight: "600", fontSize: 18 }),
        subLabel ? text(subLabel, { color: colors.muted, fontSize: 13, marginTop: 3 }) : null), plus);
    }

    if (image && !guild) {
      const data = eligibleGuilds();
      const empty = h(RN.View, { style: { padding: 24 } }, text(
        "No servers available. You need Create Expressions permission to add a sticker.",
        { color: colors.muted, fontSize: 14 },
      ));
      const list = ServerList ? h(ServerList, {
        style: { flex: 1 }, contentContainerStyle: { paddingBottom: 32 }, data,
        renderItem: ({ item }) => serverRow(item), keyExtractor: item => item.id,
        extraData: data.map(item => item.id + ":" + stickerSlots(item).used).join(","),
        ListEmptyComponent: empty,
      }) : h(RN.ScrollView, { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 32 } },
        data.length ? data.map(serverRow) : empty);
      return h(Sheet, { scrollable: true }, h(RN.View, { style: { height: sheetHeight } }, header, list));
    }

    let content;
    if (!image) {
      content = images.map((item, i) => h(RN.Pressable, {
        key: item.url, accessibilityRole: "button", accessibilityLabel: "Use image " + (i + 1),
        onPress: () => { setImage(item); setName(filenameName(item.filename)); },
        style: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
      }, h(RN.Image, { source: { uri: item.url }, style: { width: 64, height: 64 }, resizeMode: "contain" }), text(item.filename, { flex: 1 })));
    } else {
      const valid = name.trim().length >= 2 && name.trim().length <= 30 && !/[\u0000-\u001f]/.test(name);
      content = h(RN.View, null,
        h(RN.Image, { source: { uri: image.url }, style: { height: 128, width: "100%", marginBottom: 12 }, resizeMode: "contain" }),
        text("Server: " + guild.name, { fontWeight: "600" }), text("Sticker name", { marginTop: 12 }),
        h(RN.TextInput, { value: name, onChangeText: setName, maxLength: 30, placeholder: "Sticker name", placeholderTextColor: colors.muted, style: inputStyle, selectTextOnFocus: true }),
        text(image.contentType === "image/gif" ? "GIFs keep their animation and resize automatically. Maximum 5 seconds and 512 KiB." : "Crop to 320×320 if needed. GIFs keep their animation.", { color: colors.muted, fontSize: 13, marginTop: 12 }),
        button("Add sticker", () => { void save(guild, image, name.trim()); }, !valid),
        button("Choose another server", () => setGuild(null))
      );
    }
    return h(Sheet, { scrollable: true }, header, h(RN.ScrollView, {
      keyboardShouldPersistTaps: "handled", style: { maxHeight: sheetHeight },
      contentContainerStyle: { padding: 20, paddingBottom: 40 },
    }, content));
  }

  function openPicker(images, fromKey) {
    if (!active) return;
    if (saving) { toast("A sticker upload is already in progress."); return; }
    if (!Sheet) { toast("The server picker is unavailable on this Discord build."); return; }
    sheetHost.hideActionSheet(fromKey);
    const ErrorBoundary = V.ui.components?.ErrorBoundary;
    const component = () => {
      const body = h(Picker, { images });
      return ErrorBoundary ? h(ErrorBoundary, null, body) : body;
    };
    sheetHost.openLazy(Promise.resolve({ default: component }), SHEET_KEY, {});
  }
  function makeRow(images, key) {
    const icon = asset("StickerIcon", "ic_sticker_24px");
    return h(Row, {
      key: ROW_KEY, label: "Save as Sticker",
      icon: Row.Icon && icon != null ? h(Row.Icon, { source: icon }) : undefined,
      iconSource: !Row.Icon ? icon : undefined, onPress: () => openPicker(images, key),
    });
  }

  function injectRow(tree, images, key) {
    let best = null, score = -1, duplicate = false;
    const label = row => String(row?.props?.label ?? row?.props?.message ?? "");
    const isAction = row => row?.props && typeof row.props.onPress === "function"
      && (row.type === Row || row.props.label != null || row.props.message != null);
    function inspect(node, depth = 0) {
      if (!node || depth > 40) return;
      if (Array.isArray(node)) {
        const actions = node.filter(isAction);
        if (actions.length) {
          const priority = actions.some(row => /save image/i.test(label(row))) ? 1000
            : actions.some(row => /copy image link/i.test(label(row))) ? 900 : 10;
          if (priority + actions.length > score) { best = node; score = priority + actions.length; }
        }
        node.forEach(child => inspect(child, depth + 1));
      } else if (node.props) {
        if (node.key === ROW_KEY || label(node) === "Save as Sticker") duplicate = true;
        inspect(node.props.children, depth + 1);
      }
    }
    inspect(tree);
    if (duplicate || !best) return tree;
    const row = makeRow(images, key), saveIndex = best.findIndex(item => /save image/i.test(label(item)));
    const insertion = saveIndex >= 0 ? saveIndex + 1 : best.length;
    function replace(node) {
      if (node === best) return [...best.slice(0, insertion), row, ...best.slice(insertion)];
      if (Array.isArray(node)) {
        const children = node.map(replace);
        return children.some((child, i) => child !== node[i]) ? children : node;
      }
      if (node?.props?.children != null) {
        const children = replace(node.props.children);
        return children !== node.props.children ? React.cloneElement(node, { children }) : node;
      }
      return node;
    }
    return replace(tree);
  }

  function wrapSheet(component, context, key, session) {
    const transform = (props, tree) => {
      if (!active || generation !== session) return tree;
      try {
        const images = resolveImages(props, context);
        return images.length ? injectRow(tree, images, key) : tree;
      } catch (error) { log("Could not add image menu action", error); return tree; }
    };
    if (typeof component === "function" && !component.prototype?.isReactComponent) {
      return function SaveAsStickerSheet(...args) { return transform(args[0], component.apply(this, args)); };
    }
    if (component?.$$typeof === Symbol.for("react.memo")) return React.memo(wrapSheet(component.type, context, key, session), component.compare);
    if (component?.$$typeof === Symbol.for("react.forward_ref")) return React.forwardRef((props, ref) => transform(props, component.render(props, ref)));
    return component;
  }
  function onLoad() {
    if (!sheetHost?.openLazy || !Row || !Sheet || !byStore("GuildStore")) throw new Error("SaveAsSticker: required menu modules were not found on this Discord build.");
    if (active) return;
    active = true; generation++;
    unpatches.push(V.patcher.before("openLazy", sheetHost, args => {
      const [lazy, key, context] = args;
      if (key !== "MessageLongPressActionSheet" && key !== "MediaShareActionSheet") return;
      if (!lazy?.then) return;
      const session = generation;
      // Wrap this opening's promise instead of mutating the cached sheet module.
      // No additional hooks or persistent render patches can leak across images.
      args[0] = Promise.resolve(lazy).then(module => {
        if (!active || session !== generation || !module?.default) return module;
        return { ...module, default: wrapSheet(module.default, context, key, session) };
      });
    }));
    toast("SaveAsSticker 1.3.1 enabled");
  }
  function onUnload() {
    active = false; generation++;
    for (const unpatch of unpatches.splice(0).reverse()) { try { unpatch(); } catch {} }
    try { sheetHost?.hideActionSheet?.(SHEET_KEY); } catch {}
  }
  return { onLoad, onUnload };
})()
