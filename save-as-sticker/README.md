# SaveAsSticker 1.3.8

Save an image or animated GIF from Discord chat as a sticker in a server you choose. Built for Revenge's Vendetta-compatible plugin loader on Discord mobile.

## Install or update

In **Settings → Revenge → Plugins → +**, paste this entire URL, including the final `/`:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/save-as-sticker/
```

This is a plugin directory URL. Revenge appends `manifest.json` and `index.js` itself. Do not paste a GitHub `blob`/`tree` page or the URL of an individual JS/JSON file.

If already installed, open the plugin's menu, choose **Refetch**, and restart Discord. The root install URL (`https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/`) is kept as an identical legacy alias. Enable only one copy.

## Valenced upload and confirmation in 1.3.8

Valenced **1.0.0-beta6** uses Discord's signed-in HTTP client for the sticker's native multipart request, including when an internal `createGuildSticker` action is available. This avoids relying on an undocumented action's arguments or return value. A returned sticker ID confirms success. An empty successful response is checked against an authoritative server-list snapshot with up to four follow-up reads over a short propagation window; an existing same-name sticker, ambiguous IDs, or another user's sticker cannot confirm this upload. The creation request is sent exactly once and is never automatically repeated through another route.

The normal Valenced page introduced in **1.0.0-beta5** is retained. Errors stay on the page, Close remains usable, and Back cancels pending preparation or verification. Next **1.0.0-beta8** and Classic **1.3.8** retain their existing upload-action selection. PNG/GIF preparation, animation, permissions, cache cleanup and the legacy root alias are preserved. Automated tests mock Discord's APIs; physical phone uploads remain unverified.

## Cropping, scrolling and confirmation in 1.3.6

Valenced **1.0.0-beta4**, Next **1.0.0-beta6** and Classic **1.3.6** bundle PNG/JPEG decoding and resizing. When Discord has no working cropper, images fit inside a 320×320 transparent PNG while keeping their aspect ratio. JPEG EXIF rotation is applied. This path needs no browser, canvas, native image module or global text-encoding polyfill. Images above 16 megapixels are rejected before allocating full PNG pixels. GIF animation preparation is unchanged; animated APNG needing resizing is rejected rather than flattened by this fallback. Discord attachment WebP/AVIF can use Discord's media proxy to obtain PNG; unsupported external formats need an original PNG/JPEG or GIF.

The picker opens in a bounded native modal where available. A fixed title and search field sit above one virtualized server list; the message action sheet is dismissed. The form has its own scroll view. Close, Android Back, backdrop, disable and reopen dismiss the owned modal even if the native alert host retains its node. Hosts without native modal support retain the legacy picker.

Upload confirmation reads JSON strings, nested response envelopes and Fetch-style responses. If a successful REST response omits its body, the plugin compares the server list before and after the single POST. Only one new matching expression ID confirms success; an existing same-name entry or ambiguous result does not. No creation request is repeated automatically.

Refresh the repository, update SaveAsSticker and fully restart Discord. Regression checks decode real PNG/JPEG output with native cropping and browser text codecs absent, exercise 196-server pickers and verify one POST for different response shapes. Tests simulate both hosts; physical phone scrolling and uploads remain unverified.

## Upload compatibility in 1.3.5

Valenced **1.0.0-beta3**, Next **1.0.0-beta5** and Classic **1.3.5** fix the missing sticker upload module error. The uploader is resolved on Add sticker. If the native action is absent, the prepared PNG or animated GIF is sent as native multipart through Discord’s signed-in HTTP client. The file uses an owned local cache URI; crop/output files are cleaned on success, failure or cancellation. The curated Valenced/Next FileModule API is supported even when no file-module Metro export is available.

The current account, plugin session, server membership, permissions and slots are checked again before dispatch. Repeated taps share one operation. An uncertain or failed POST is not retried through another route, and success requires a returned sticker ID. Existing GIF preparation and animation are preserved. The picker follows Discord’s theme when it differs from the system theme.

Refresh the existing repository, update **SaveAsSticker**, and fully restart Discord. The legacy root install alias is kept in sync. Physical phone uploads remain unverified. The shared tests cover the real pickers on both native hosts, PNG/GIF data, static cropping, file cleanup, late native actions, REST failures, account changes, permission loss, duplicate taps and theme contrast. The optional Hermes check runs when HERMES_BINARY is provided.

The multipart fields follow [Discord’s Create Guild Sticker endpoint](https://docs.discord.com/developers/resources/sticker#create-guild-sticker). Uploads use Discord’s existing authentication without reading account tokens.

## Use

1. Long-press an image or GIF in chat and tap **Save as Sticker**. The option is also available in the full-screen image's share menu.
2. If a message has several images and Discord has not identified the selected one, choose the image from its preview.
3. Tap the **+** beside a server. You must own it or have **Create Expressions** permission. Full servers stay visible, greyed out and disabled, with **No slots available**.
4. Enter the sticker name, review the preview, and tap **Add sticker**.
5. Crop static images if prompted; otherwise PNG/JPEG fit automatically with transparent padding. GIFs resize automatically and stay animated. A successful upload shows **Sticker added to [server]**.

Servers with an unknown cached sticker count are marked **Check slots on upload**. Discord is the final authority for permissions and free slots. The plugin rechecks its local permission/slot state immediately before uploading and displays server errors.

## Image support

- PNG/JPEG resize locally if the native cropper is absent or cannot open. A working native cropper can also prepare supported image formats.
- Valid 320×320 PNGs under 512 KiB skip cropping. PNG signatures, dimensions and byte size are checked before upload.
- Animated GIFs keep their frames, timing, loop settings and transparency. GIFs are fitted inside a 320×320 canvas with transparent padding, preserving their aspect ratio. Well-formed, ready-to-upload GIFs are preserved byte-for-byte.
- GIF validation follows actual block boundaries. Extra bytes after the GIF trailer are removed; a missing trailer is repaired only when all image/extension blocks are complete. Truncated blocks are rejected without uploading a partial animation.
- GIFs must be at most **5 seconds** long. Color reduction is attempted if needed to fit Discord's **512 KiB** limit. Frames are never silently dropped or trimmed; an animation that still exceeds the limits shows an error.
- GIF attachments and embeds that expose an original `.gif` URL are supported. MP4-only GIFV/Tenor previews are not converted into GIFs; share the original GIF file instead. GIF links returning a still preview are rejected instead of silently flattening the animation.
- To keep conversion bounded on mobile, GIFs must contain no more than 250 frames and have a canvas no larger than 4 megapixels; resizing is limited to 80 megapixels across all frames. The converter yields between frames and avoids storing every decoded frame in memory.
- Animated APNG/WebP files are outside the GIF conversion path and may become still images when cropped.
- GIF conversion runs locally using bundled libraries. Static images use a working native cropper or the bundled PNG/JPEG converter. Both use local cache files and Discord's authenticated sticker action or multipart HTTP fallback. The plugin does not request your token or send images to an external converter.
- Canceling the crop or disabling the plugin before submission prevents the upload. An upload already submitted to Discord cannot be canceled by unloading the plugin.

## Changes in 1.3.2

- Fixes **undefined is not a function** during GIF conversion on mobile Hermes. Generated module-import getters captured the same loop variable, causing the base64 encoder to be called in place of the decoder. This also caused misleading invalid-GIF errors in 1.3.0.
- Runs Babel's block-scoping transform after bundling so each generated import getter retains the correct function. The transformation includes the generated helpers and bundled dependencies; no global runtime patches are installed.
- Adds a real Hermes regression test that loads the installation bundle, opens the picker and verifies resized, ready-to-upload, padded and partial-frame GIF uploads with mocked Discord APIs.

## Changes in 1.3.1

- Fixes the overly strict final-byte check that produced **This GIF is incomplete or invalid** for readable animations with trailing bytes or only a missing end marker.
- Normalizes the GIF stream before both direct uploads and resizing, and tolerates line breaks in base64 data.
- Checks palettes, descriptors and data-block boundaries so incomplete frames/extensions are not silently dropped.
- Adds regression tests for repaired animations, upload bytes, trailer-like bytes within data and genuinely truncated downloads.

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

To run the mobile-engine regression test, obtain the official Linux Hermes CLI from [Facebook's Hermes v0.13.0 release](https://github.com/facebook/hermes/releases/tag/v0.13.0) and set the executable path:

```sh
HERMES_BINARY=/absolute/path/to/hermes npm test
```

Without `HERMES_BINARY`, the Hermes test is explicitly skipped. The fix was reproduced and verified using the release's HBC 96 runtime. This runs the actual plugin bundle in Hermes; Discord's network, file and UI APIs remain mocked.

The tests encode and decode real GIFs to check animation frames, timing, looping, transparent padding, disposal modes, compression, limits and cancellation. Integration tests exercise Revenge's expression loader and mocked Discord/React Native modules, including GIF MIME types, original-source selection, frozen menu trees, server filtering, static crop/upload behavior, cleanup and unload. They do not run a Discord APK or verify rendering on a physical phone. Discord updates can change these internal APIs.

The source was checked against Revenge's loader (`revenge-mod/revenge-bundle`, `src/core/vendetta/plugins.ts`), its native file API, and the Discord mobile cropper/upload call shapes. Server limits and required permission follow Discord's [Create Guild Sticker documentation](https://docs.discord.com/developers/resources/sticker#create-guild-sticker).
