(() => {
  "use strict";

  // SaveAsSticker for Revenge / Vendetta-compatible Discord mobile clients.
  // Long-press an image -> Save as Sticker -> choose server -> name/crop -> upload.

  const V = globalThis.vendetta ?? globalThis.revenge ?? globalThis.bunny
    ?? globalThis.kettu ?? globalThis.voxi;
  if (!V) throw new Error("SaveAsSticker: compatible runtime not found");

  const { find, findByProps, findByStoreName } = V.metro;
  const { React, ReactNative, constants } = V.metro.common;
  const { before, after } = V.patcher;
  const { getAssetIDByName } = V.ui.assets;
  const { showToast } = V.ui.toasts;
  const { findInReactTree } = V.utils;
  const { Forms, ErrorBoundary } = V.ui.components;
  const { FormRow, FormIcon, FormDivider } = Forms;

  const LazySheet = findByProps("openLazy", "hideActionSheet") ?? findByProps("hideActionSheet");
  const Row = findByProps("ActionSheetRow")?.ActionSheetRow;
  const Sheet = findByProps("ActionSheet")?.ActionSheet ?? find(m => m?.render?.name === "ActionSheet");
  const TitleHeader = findByProps("ActionSheetTitleHeader")?.ActionSheetTitleHeader
    ?? findByProps("BottomSheetTitleHeader")?.BottomSheetTitleHeader;
  const CloseButton = findByProps("ActionSheetCloseButton")?.ActionSheetCloseButton;
  const FlatList = findByProps("BottomSheetScrollView")?.BottomSheetFlatList ?? ReactNative.FlatList;

  const AlertHost = findByProps("openAlert", "dismissAlert");
  const AlertParts = findByProps("AlertModal", "AlertActions");
  const AlertModal = AlertParts?.AlertModal;
  const AlertActions = AlertParts?.AlertActions;
  const AlertButton = AlertParts?.AlertActionButton;

  const GuildStore = findByStoreName("GuildStore");
  const PermissionStore = findByStoreName("PermissionStore");
  const StickerStore = findByStoreName("StickersStore") ?? findByStoreName("StickerStore");
  const UserStore = findByStoreName("UserStore");

  const StickerActions = findByProps("createGuildSticker", "updateGuildSticker")
    ?? findByProps("createGuildSticker");
  const Files = findByProps("writeFile", "removeFile", "readFile")
    ?? findByProps("writeFile", "removeFile");
  const ImagePicker = findByProps("launchCropper", "cleanSingle")
    ?? findByProps("launchCropper");

  const GuildIconMod = findByProps("GuildIconSizes");
  const GuildIcon = GuildIconMod?.default;
  const GuildIconSizes = GuildIconMod?.GuildIconSizes;

  const stickerIcon = getAssetIDByName("ic_sticker_24px")
    ?? getAssetIDByName("StickerIcon")
    ?? getAssetIDByName("StickerIcon-primary");
  const addIcon = getAssetIDByName("ic_add_24px")
    ?? getAssetIDByName("CirclePlusIcon-primary");
  const okIcon = getAssetIDByName("Check")
    ?? getAssetIDByName("CircleCheckIcon-primary");
  const badIcon = getAssetIDByName("Small")
    ?? getAssetIDByName("CircleXIcon-primary");

  const MAX_BYTES = 512 * 1024;
  const SLOT_LIMITS = { 0: 5, 1: 15, 2: 30, 3: 60 };
  const unpatches = [];
  const hooked = new WeakSet();
  let retry = null;

  const log = (...a) => {
    try { V.logger?.error?.("[SaveAsSticker]", ...a); }
    catch { console.error("[SaveAsSticker]", ...a); }
  };
  const toast = (text, icon = stickerIcon) => {
    try { showToast(text, icon); }
    catch { console.log("[SaveAsSticker]", text); }
  };
  const str = value => typeof value === "string" && value ? value : null;

  function cleanName(value) {
    let n = String(value ?? "sticker")
      .replace(/\.[A-Za-z0-9]{1,6}$/i, "")
      .replace(/[\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30);
    if (n.length < 2) n = "sticker";
    return n;
  }

  function errorText(e) {
    for (const x of [e?.body?.message, e?.message, e?.text]) {
      if (!x || typeof x !== "string") continue;
      try { return JSON.parse(x)?.message ?? x; }
      catch { return x; }
    }
    return "Unknown error";
  }

  function isImage(a) {
    const type = str(a?.content_type) ?? str(a?.contentType);
    if (type?.startsWith("image/")) return true;
    const name = str(a?.filename) ?? str(a?.url) ?? "";
    return /\.(png|jpe?g|webp|gif|avif|bmp)(\?|$)/i.test(name);
  }

  function resolveImage(props) {
    const ctx = props?.analyticsLocation ?? props;
    const selected = ctx?.selectedMedia;
    if (selected?.mediaType === "image" && str(selected.mediaUrl)) {
      const src = selected.source ?? {};
      return {
        url: selected.mediaUrl,
        filename: src.filename ?? src.name ?? "sticker.png",
        contentType: src.content_type ?? src.contentType ?? null,
        id: src.id ?? null,
      };
    }

    const attachments = ctx?.message?.attachments;
    if (Array.isArray(attachments)) {
      const a = attachments.find(isImage);
      if (a) return {
        url: a.url ?? a.proxy_url ?? a.proxyURL,
        filename: a.filename ?? "sticker.png",
        contentType: a.content_type ?? a.contentType ?? null,
        id: a.id ?? null,
      };
    }
    return null;
  }

  function canCreate(guild) {
    const me = UserStore?.getCurrentUser?.()?.id;
    if (guild?.ownerId === me || guild?.owner_id === me) return true;
    const perms = [
      constants?.Permissions?.CREATE_GUILD_EXPRESSIONS,
      constants?.Permissions?.MANAGE_GUILD_EXPRESSIONS,
      constants?.Permissions?.MANAGE_EMOJIS_AND_STICKERS,
    ].filter(x => x != null);
    for (const p of perms) {
      try { if (PermissionStore?.can?.(p, guild)) return true; }
      catch {}
    }
    return false;
  }

  function hasSlot(guild) {
    try {
      const tier = Number(guild?.premiumTier ?? guild?.premium_tier ?? 0);
      let max = SLOT_LIMITS[tier] ?? 5;
      const f = guild?.features;
      const more = Array.isArray(f) ? f.includes("MORE_STICKERS") : Boolean(f?.has?.("MORE_STICKERS"));
      if (more && tier === 3) max = 120;
      const list = StickerStore?.getStickersByGuildId?.(guild.id);
      return !list || list.length < max;
    } catch { return true; }
  }

  function guilds() {
    return Object.values(GuildStore?.getGuilds?.() ?? {})
      .filter(canCreate)
      .filter(hasSlot)
      .sort((a, b) => String(a?.name ?? "").localeCompare(String(b?.name ?? "")));
  }

  function blobDataUrl(blob) {
    return new Promise((resolve, reject) => {
      try {
        const r = new FileReader();
        r.onerror = () => reject(r.error ?? new Error("Failed to read image"));
        r.onloadend = () => resolve(String(r.result));
        r.readAsDataURL(blob);
      } catch (e) { reject(e); }
    });
  }

  function b64Bytes(base64) {
    const v = String(base64 ?? "").replace(/\s/g, "");
    if (!v) return 0;
    const pad = v.endsWith("==") ? 2 : v.endsWith("=") ? 1 : 0;
    return Math.floor(v.length * 3 / 4) - pad;
  }

  function getSize(uri) {
    const Image = ReactNative?.Image;
    if (!Image?.getSize) return Promise.resolve(null);
    return new Promise(resolve => {
      try { Image.getSize(uri, (width, height) => resolve({ width, height }), () => resolve(null)); }
      catch { resolve(null); }
    });
  }

  async function download(image) {
    const response = await fetch(image.url);
    if (!response.ok) throw new Error("HTTP " + response.status + " while downloading image");
    const blob = await response.blob();
    const dataUrl = await blobDataUrl(blob);
    const comma = dataUrl.indexOf(",");
    return {
      blob,
      dataUrl,
      base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
      mime: blob.type || image.contentType || "image/png",
    };
  }

  async function prepare(image) {
    const source = await download(image);
    const size = await getSize(image.url);

    if (source.mime === "image/png" && size?.width === 320 && size?.height === 320
      && source.blob.size <= MAX_BYTES) {
      return { uri: source.dataUrl, cleanup() {} };
    }

    if (!Files?.writeFile || !ImagePicker?.launchCropper) {
      throw new Error("Image cropper unavailable. Use a 320x320 PNG under 512 KB.");
    }

    const ext = source.mime.includes("jpeg") ? "jpg"
      : source.mime.includes("webp") ? "webp"
      : source.mime.includes("gif") ? "gif"
      : source.mime.includes("avif") ? "avif" : "png";
    const rel = "save_as_sticker_" + Date.now() + "_" + Math.random().toString(36).slice(2) + "." + ext;
    let croppedPath = null;

    try {
      const localUri = await Files.writeFile("cache", rel, source.base64, "base64");
      const result = await ImagePicker.launchCropper({
        uri: localUri,
        width: 320,
        height: 320,
        mimeType: "image/png",
        includeBase64: true,
        freeStyleCropEnabled: false,
        cropperCircleOverlay: false,
      });

      croppedPath = result?.path ?? null;
      const data = str(result?.data) ?? str(result?.base64);
      if (!data) throw new Error("Cropper did not return image data");
      const raw = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
      const bytes = b64Bytes(raw);
      if (bytes > MAX_BYTES) {
        throw new Error("Cropped sticker is " + Math.round(bytes / 1024) + " KB; max is 512 KB");
      }
      return {
        uri: data.startsWith("data:") ? data : "data:image/png;base64," + raw,
        cleanup() {
          if (croppedPath && ImagePicker?.cleanSingle) {
            try { ImagePicker.cleanSingle(croppedPath); } catch {}
          }
        },
      };
    } finally {
      try { await Files.removeFile?.("cache", rel); } catch {}
    }
  }

  async function upload(guild, image, name) {
    if (!StickerActions?.createGuildSticker) throw new Error("Native sticker upload action not found");
    const made = await prepare(image);
    try {
      return await StickerActions.createGuildSticker({
        guildId: guild.id,
        name: cleanName(name),
        tags: "\uD83D\uDE42",
        description: "",
        uri: made.uri,
        mimeType: "image/png",
        platform: "mobile",
        originalMd5: null,
      });
    } finally {
      try { made.cleanup?.(); } catch {}
    }
  }

  async function save(guild, image, name) {
    try {
      toast("Crop the image for your sticker");
      await upload(guild, image, name);
      toast("Sticker added to " + guild.name, okIcon);
    } catch (e) {
      if (e?.code === "E_PICKER_CANCELLED" || /cancel/i.test(String(e?.message ?? ""))) return;
      log("upload failed", e);
      toast("Sticker failed: " + errorText(e), badIcon);
    }
  }

  function NameDialog({ guild, image, alertKey }) {
    const [value, setValue] = React.useState(cleanName(image.filename));
    const [error, setError] = React.useState("");
    const dark = ReactNative.Appearance?.getColorScheme?.() !== "light";

    const confirm = () => {
      if (String(value ?? "").trim().length < 2) {
        setError("Use a name between 2 and 30 characters.");
        return;
      }
      try { AlertHost?.dismissAlert?.(alertKey); } catch {}
      void save(guild, image, cleanName(value));
    };

    const input = React.createElement(ReactNative.View, { style: { width: "100%", gap: 8 } },
      React.createElement(ReactNative.TextInput, {
        value,
        autoFocus: true,
        selectTextOnFocus: true,
        maxLength: 30,
        placeholder: "Sticker name",
        placeholderTextColor: dark ? "#949ba4" : "#5c5e66",
        returnKeyType: "done",
        onChangeText: t => { setValue(t); if (error) setError(""); },
        onSubmitEditing: confirm,
        style: {
          minHeight: 44,
          borderWidth: 1,
          borderColor: error ? "#da373c" : (dark ? "#4e5058" : "#c4c9ce"),
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: dark ? "#f2f3f5" : "#1e1f22",
          backgroundColor: dark ? "#1e1f22" : "#f2f3f5",
        },
      }),
      error ? React.createElement(ReactNative.Text, { style: { color: "#da373c", fontSize: 12 } }, error) : null
    );

    const primary = React.createElement(AlertButton, {
      text: "Add to " + guild.name,
      variant: "primary",
      onPress: confirm,
    });
    const cancel = React.createElement(AlertButton, {
      text: "Cancel",
      variant: "secondary",
      onPress: () => { try { AlertHost?.dismissAlert?.(alertKey); } catch {} },
    });

    return React.createElement(AlertModal, {
      title: "Sticker name",
      content: input,
      actions: AlertActions
        ? React.createElement(AlertActions, null, primary, cancel)
        : React.createElement(ReactNative.View, { style: { gap: 8 } }, primary, cancel),
    });
  }

  function askName(guild, image) {
    const fallback = cleanName(image.filename);
    if (!AlertHost?.openAlert || !AlertModal || !AlertButton) {
      void save(guild, image, fallback);
      return;
    }
    const key = "save-as-sticker-" + guild.id + "-" + (image.id ?? Date.now());
    AlertHost.openAlert(key, React.createElement(NameDialog, { guild, image, alertKey: key }));
  }

  function GuildRow({ guild, image }) {
    const leading = GuildIcon
      ? React.createElement(GuildIcon, { guild, size: GuildIconSizes?.MEDIUM, animate: false })
      : React.createElement(FormIcon, { source: stickerIcon });
    return React.createElement(FormRow, {
      leading,
      label: guild.name,
      trailing: React.createElement(FormIcon, { style: { opacity: 1 }, source: addIcon }),
      onPress: () => {
        try { LazySheet?.hideActionSheet?.(); } catch {}
        askName(guild, image);
      },
    });
  }

  function Picker({ image }) {
    const data = guilds();
    const header = TitleHeader
      ? React.createElement(TitleHeader, {
          title: "Save as Sticker",
          leading: React.createElement(FormIcon, {
            style: { marginRight: 12, opacity: 1 },
            source: { uri: image.url },
            disableColor: true,
          }),
          trailing: CloseButton
            ? React.createElement(CloseButton, { onPress: () => LazySheet?.hideActionSheet?.() })
            : undefined,
        })
      : null;

    const list = React.createElement(FlatList, {
      style: { flex: 1 },
      contentContainerStyle: { paddingBottom: 24 },
      data,
      renderItem: ({ item }) => React.createElement(GuildRow, { guild: item, image }),
      ItemSeparatorComponent: FormDivider,
      keyExtractor: g => g.id,
      ListEmptyComponent: React.createElement(FormRow, {
        label: "No eligible servers",
        subLabel: "You need Create Expressions permission and a free sticker slot.",
      }),
    });

    return React.createElement(React.Fragment, null, header, list);
  }

  function openPicker(image) {
    if (!LazySheet?.openLazy || !Sheet) {
      toast("Could not open the server picker on this Discord build", badIcon);
      return;
    }
    const body = ErrorBoundary
      ? React.createElement(ErrorBoundary, null, React.createElement(Picker, { image }))
      : React.createElement(Picker, { image });
    const element = React.createElement(Sheet, { scrollable: true }, body);
    LazySheet.openLazy(Promise.resolve({ default: () => element }), "SaveAsStickerServerPicker");
  }

  function saveRow(image) {
    if (!Row) return null;
    const p = {
      label: "Save as Sticker",
      onPress: () => {
        try { LazySheet?.hideActionSheet?.(); } catch {}
        openPicker(image);
      },
    };
    if (stickerIcon != null) {
      if (Row.Icon) p.icon = React.createElement(Row.Icon, { source: stickerIcon });
      else p.iconSource = stickerIcon;
    }
    return React.createElement(Row, { key: "save-as-sticker-action", ...p });
  }

  function isRow(c) {
    return c?.type === Row || c?.type?.name === "ActionSheetRow"
      || c?.type?.displayName === "ActionSheetRow";
  }

  function rowsIn(rendered) {
    const media = findInReactTree(rendered, n =>
      Array.isArray(n) && n.some(isRow)
      && n.some(c => /save image|copy image link/i.test(String(c?.props?.label ?? "")))
    );
    if (media) return media;
    return findInReactTree(rendered, n => Array.isArray(n) && n.some(isRow));
  }

  function inject(props, rendered) {
    try {
      const image = resolveImage(props);
      if (!image?.url || !Row) return;
      const rows = rowsIn(rendered);
      if (!rows?.push) return;
      if (rows.some(r => r?.key === "save-as-sticker-action" || r?.props?.label === "Save as Sticker")) return;
      const row = saveRow(image);
      if (!row) return;
      const i = rows.findIndex(r => /save image/i.test(String(r?.props?.label ?? "")));
      if (i >= 0) rows.splice(i + 1, 0, row);
      else rows.push(row);
    } catch (e) { log("inject failed", e); }
  }

  function hook(mod) {
    if (!mod || hooked.has(mod)) return false;
    const d = mod.default;

    if (d && typeof d === "object" && typeof d.type === "function") {
      hooked.add(mod);
      unpatches.push(after("type", d, (args, rendered) => inject(args?.[0], rendered)));
      return true;
    }

    if (typeof d === "function") {
      hooked.add(mod);
      const unpatch = after("default", mod, (args, rendered) => {
        try {
          if (rendered?.type && typeof rendered.type === "function") {
            let inner;
            inner = after("type", rendered, (innerArgs, innerRendered) => {
              inject(innerArgs?.[0] ?? args?.[0], innerRendered);
              React.useEffect?.(() => () => { try { inner?.(); } catch {} }, []);
            });
            unpatches.push(inner);
          } else inject(args?.[0], rendered);
        } catch (e) { log("sheet patch failed", e); }
      });
      unpatches.push(unpatch);
      return true;
    }
    return false;
  }

  function findDirect() {
    try {
      const registry = globalThis.modules ?? globalThis.window?.modules;
      const req = globalThis.__r ?? globalThis.window?.__r;
      if (!registry || !req) return null;
      const entries = registry instanceof Map ? [...registry.entries()]
        : typeof registry.entries === "function" ? [...registry.entries()] : Object.entries(registry);
      for (const [id, factory] of entries) {
        const path = factory?.__filePath ?? factory?.definition?.__filePath;
        if (typeof path !== "string" || !/(^|\/)LongPressMessageActionSheet\.tsx?$/.test(path)) continue;
        try {
          const mod = req(Number(id));
          if (mod?.default) return mod;
        } catch {}
      }
    } catch (e) { log("direct lookup failed", e); }
    return null;
  }

  function patchMessageSheet() {
    if (LazySheet?.openLazy) {
      unpatches.push(before("openLazy", LazySheet, ([promise, name]) => {
        const key = String(name ?? "");
        if (key === "SaveAsStickerServerPicker" || !/MessageLongPressActionSheet/i.test(key)) return;
        Promise.resolve(promise).then(hook).catch(e => log("lazy hook failed", e));
      }));
    }

    const tryDirect = () => hook(findDirect());
    if (!tryDirect()) {
      let attempts = 0;
      retry = setInterval(() => {
        attempts++;
        if (tryDirect() || attempts >= 30) {
          clearInterval(retry);
          retry = null;
        }
      }, 1000);
    }
  }

  function onLoad() {
    if (!LazySheet || !Row || !GuildStore || !PermissionStore) {
      throw new Error("SaveAsSticker: required Discord modules were not found");
    }
    patchMessageSheet();
    toast("SaveAsSticker enabled");
  }

  function onUnload() {
    if (retry) { clearInterval(retry); retry = null; }
    for (const fn of unpatches.splice(0).reverse()) {
      try { fn?.(); } catch (e) { log("unpatch failed", e); }
    }
  }

  return { onLoad, onUnload };
})()