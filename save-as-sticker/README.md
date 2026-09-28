# SaveAsSticker 1.3.0

Save an image or animated GIF from Discord chat as a sticker in a server you choose. Built for Revenge's Vendetta-compatible plugin loader on Discord mobile.

## Install or update

In **Settings → Revenge → Plugins → +**, paste this entire URL, including the final `/`:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/save-as-sticker/
```

This is a plugin directory URL. Revenge appends `manifest.json` and `index.js` itself. Do not paste a GitHub `blob`/`tree` page or the URL of an individual JS/JSON file.

If already installed, open the plugin's menu, choose **Refetch**, and restart Discord. The root install URL (`https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/`) is kept as an identical legacy alias. Enable only one copy.

## Use

1. Long-press an image or GIF in chat and tap **Save as Sticker**. The option is also available in the full-screen image's share menu.
2. If a message has several images and Discord has not identified the selected one, choose the image from its preview.
3. Tap the **+** beside a server. You must own it or have **Create Expressions** permission. Full servers stay visible, greyed out and disabled, with **No slots available**.
4. Enter the sticker name, review the preview, and tap **Add sticker**.
5. Crop static images if prompted. GIFs resize automatically and stay animated. A successful upload shows **Sticker added to [server]**.

Servers with an unknown cached sticker count are marked **Check slots on upload**. Discord is the final authority for permissions and free slots. The plugin rechecks its local permission/slot state immediately before uploading and displays server errors.

## Image support

- Static images supported by Discord's native cropper, including JPEG, PNG and WebP, are converted to a 320×320 PNG.
- Valid 320×320 PNGs under 512 KiB skip cropping. PNG signatures, dimensions and byte size are checked before upload.
- Animated GIFs keep their frames, timing, loop settings and transparency. GIFs are fitted inside a 320×320 canvas with transparent padding, preserving their aspect ratio. Ready-to-upload GIFs are preserved byte-for-byte.
- GIFs must be at most **5 seconds** long. Color reduction is attempted if needed to fit Discord's **512 KiB** limit. Frames are never silently dropped or trimmed; an animation that still exceeds the limits shows an error.
- GIF attachments and embeds that expose an original `.gif` URL are supported. MP4-only GIFV/Tenor previews are not converted into GIFs; share the original GIF file instead. GIF links returning a still preview are rejected instead of silently flattening the animation.
- To keep conversion bounded on mobile, GIFs must contain no more than 250 frames and have a canvas no larger than 4 megapixels; resizing is limited to 80 megapixels across all frames. The converter yields between frames and avoids storing every decoded frame in memory.
- Animated APNG/WebP files are outside the GIF conversion path and may become still images when cropped.
- GIF conversion runs locally using bundled libraries. Static images use Discord's own cropper. Both use local cache files and Discord's authenticated sticker upload action. The plugin does not request your token or send images to an external converter.
- Canceling the crop or disabling the plugin before submission prevents the upload. An upload already submitted to Discord cannot be canceled by unloading the plugin.

## Changes in 1.3.0

- Adds animated GIF decoding, frame composition, resizing, color reduction and GIF uploads.
- Preserves transparent and partial animation frames, including clear/restore disposal modes.
- Prefers original GIF URLs over video/static previews while retaining attachment authentication parameters.
- Adds GIF limits and cancellation checks without changing the server picker or static image upload flow.
- Keeps readable source in `src/` and bundles dependencies into `index.js`; no extra runtime installation or external conversion service is needed.

## Changes in 1.2.0

- Matches the requested Discord expression-picker layout: image thumbnail, centered **Saving [name]** title and close button.
- Uses native Discord server icons, rows and trailing **+** controls, with a scrollable list.
- Keeps full servers greyed out with **No slots available**; disabled rows cannot begin an upload.
- Tapping a server opens the existing name-and-crop step. Capacity and permission are still rechecked before submission.
- Includes React Native fallbacks when individual native row/header components are unavailable.

## Changes in 1.1.0

- Handles message image selections, the current media share sheet and the older media viewer syncer.
- Wraps each menu opening without modifying cached sheet components, adding hooks, or retaining stale image selections.
- Inserts the action into frozen or nested React children without mutating them; supports memo and forwardRef sheet exports.
- Adds a reactive server picker, image preview and editable name form using React Native controls. No legacy alert components are used.
- Checks **Create Expressions**, sticker capacity, image type and size; rechecks permissions before submitting.
- Uses a temporary local PNG for Android's multipart uploader and cleans up after success, failure or cancellation.
- Prevents duplicate submissions and does not automatically retry ambiguous upload failures.

## Build and validation

Edit `src/plugin.js` or `src/gif.js`, then run from the repository root:

```sh
cd save-as-sticker
npm ci
npm run build
npm test
node --check index.js
```

The build updates the canonical plugin files, the legacy root alias and their SHA-256 manifest hashes. Commit the source, lockfile and both generated install locations together. Dependency license notices are in `THIRD_PARTY_LICENSES.txt` and included in the bundle.

The tests encode and decode real GIFs to check animation frames, timing, looping, transparent padding, disposal modes, compression, limits and cancellation. Integration tests exercise Revenge's expression loader and mocked Discord/React Native modules, including GIF MIME types, original-source selection, frozen menu trees, server filtering, static crop/upload behavior, cleanup and unload. They do not run a Discord APK or verify rendering on a physical phone. Discord updates can change these internal APIs.

The source was checked against Revenge's loader (`revenge-mod/revenge-bundle`, `src/core/vendetta/plugins.ts`), its native file API, and the Discord mobile cropper/upload call shapes. Server limits and required permission follow Discord's [Create Guild Sticker documentation](https://docs.discord.com/developers/resources/sticker#create-guild-sticker).
