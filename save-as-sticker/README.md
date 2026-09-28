# SaveAsSticker 1.1.0

Save an image from Discord chat as a sticker in a server you choose. Built for Revenge's Vendetta-compatible plugin loader on Discord mobile.

## Install or update

In **Settings → Revenge → Plugins → +**, paste this entire URL, including the final `/`:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/save-as-sticker/
```

This is a plugin directory URL. Revenge appends `manifest.json` and `index.js` itself. Do not paste a GitHub `blob`/`tree` page or the URL of an individual JS/JSON file.

If already installed, open the plugin's menu, choose **Refetch**, and restart Discord. The root install URL (`https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/`) is kept as an identical legacy alias. Enable only one copy.

## Use

1. Long-press the image in chat and tap **Save as Sticker**. The option is also available in the full-screen image's share menu.
2. If a message has several images and Discord has not identified the selected one, choose the image from its preview.
3. Search for and choose a server. You must own it or have **Create Expressions** permission. Full servers are excluded using Discord's sticker store.
4. Enter the sticker name, review the preview, and tap **Add sticker**.
5. Crop the image if prompted. A successful upload shows **Sticker added to [server]**.

Servers with an unknown cached sticker count are marked **Check slots on upload**. Discord is the final authority for permissions and free slots. The plugin rechecks its local permission/slot state immediately before uploading and displays server errors.

## Image support

- Static images supported by Discord's native cropper, including JPEG, PNG and WebP, are converted to a 320×320 PNG.
- Valid 320×320 PNGs under 512 KiB skip cropping. PNG signatures, dimensions and byte size are checked before upload.
- Animated GIF/APNG images may become a still image when cropped. This plugin does not convert or resize animations while preserving their frames.
- It uses Discord's own image cropper, local cache files and authenticated sticker upload action. It does not request your token or send images to an external converter.
- Canceling the crop or disabling the plugin before submission prevents the upload. An upload already submitted to Discord cannot be canceled by unloading the plugin.

## Changes in 1.1.0

- Handles message image selections, the current media share sheet and the older media viewer syncer.
- Wraps each menu opening without modifying cached sheet components, adding hooks, or retaining stale image selections.
- Inserts the action into frozen or nested React children without mutating them; supports memo and forwardRef sheet exports.
- Adds a searchable, reactive server picker, image preview and editable name form using React Native controls. No legacy alert components are used.
- Checks **Create Expressions**, sticker capacity, image type and size; rechecks permissions before submitting.
- Uses a temporary local PNG for Android's multipart uploader and cleans up after success, failure or cancellation.
- Prevents duplicate submissions and does not automatically retry ambiguous upload failures.

## Validation

```sh
node --check save-as-sticker/index.js
node --test save-as-sticker/tests/plugin.test.mjs
node save-as-sticker/sync.mjs
```

The 14 regression tests exercise Revenge's expression loader, frozen menu trees, modern/legacy image contexts, image selection, server filtering, crop/upload contracts, file cleanup, cancellation and unload behavior using mocked Discord/React Native modules. They do not run a Discord APK or verify rendering on a physical phone. Discord updates can change these internal APIs.

The source was checked against Revenge's loader (`revenge-mod/revenge-bundle`, `src/core/vendetta/plugins.ts`), its native file API, and the Discord mobile cropper/upload call shapes. Server limits and required permission follow Discord's [Create Guild Sticker documentation](https://docs.discord.com/developers/resources/sticker#create-guild-sticker).
