# SaveAsSticker for Vencord

Version **1.1.0** · Desktop custom plugin by Fluttershy2008-mlp.

Right-click an image or animated GIF → **Save as Sticker** → choose a server → **Add sticker**.

The picker shows a preview, editable name, searchable server list, server icons and available slots. Full servers stay visible with **No slots available**. The final Add sticker button confirms the destination before uploading.

## Download

**Windows automatic install/repair:** [Download Install-SaveAsSticker.cmd](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/vencord-save-as-sticker/Install-SaveAsSticker.cmd), save it in Downloads, and double-click it. Keep the window open until it says SUCCESS. Discord may close during installation; reopen it afterwards and enable **SaveAsSticker** under Vencord's Plugins settings.

This uses your existing Vencord source checkout (including `%USERPROFILE%\Vencord`) and Node.js 22+. If your checkout is elsewhere, drag that Vencord folder onto the `.cmd` file. It downloads the complete plugin from a pinned release, checks their SHA-256 hashes, repairs the loose-files and duplicate-wrapper layouts, installs dependencies, builds, and runs Vencord's official installer. Discord Stable is selected when present, followed by Canary or PTB, using the official installer's `--branch auto` option.

Misplaced/previous SaveAsSticker files are moved to `Vencord/SaveAsSticker-Backups/`, outside the plugin folders. Other plugins are preserved. An existing unrelated loose file is never moved merely because its name matches a plugin dependency. Build failure stops before patching Discord. Details are saved to `Vencord/SaveAsSticker-install.log`. The installer does not change PowerShell execution policy or request administrator access.

The generated CMD is self-contained. Its editable source and pinned file hashes are in `installer/`; rebuild it with `npm run build:installer`. Folder repair, download validation, rollback, build/patch failure handling, and the embedded payload are covered by automated tests. The Windows launcher and actual Discord patching require testing on Windows; they were not executed in the development environment.

For manual installation:

**[Download SaveAsSticker-Vencord.zip](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/vencord-save-as-sticker/SaveAsSticker-Vencord.zip)**

The ZIP contains the complete `saveAsSticker` folder. The GIF converter is included; there are no extra plugin dependencies to install inside Vencord.

## Install on Vencord (Discord desktop)

Vencord custom plugins require a **source build**. A Revenge install URL, BetterDiscord `.plugin.js`, or Vencord's themes folder cannot install this plugin. See [Vencord's official custom-plugin guide](https://docs.vencord.dev/installing/custom-plugins/) and [source-build guide](https://docs.vencord.dev/installing/).

1. Install Git, Node.js (currently Vencord requires 22 or newer), and pnpm, as described in the source-build guide.
2. If you do not already have the Vencord source folder, run:

   ```sh
   git clone https://github.com/Vendicated/Vencord.git
   cd Vencord
   ```

3. Extract the downloaded ZIP into `Vencord/src/userplugins/`. Create `userplugins` if it is missing. The final path must be **`Vencord/src/userplugins/saveAsSticker/index.tsx`**. Copy the entire `saveAsSticker` folder, including `gif.js`, `gif.d.ts`, `media.ts`, `video.ts`, `upload.ts` and `styles.css`.
4. Run these commands **inside the Vencord source folder**, where its `package.json` is:

   ```sh
   pnpm install --frozen-lockfile
   pnpm build
   pnpm inject
   ```

5. Select your Discord installation in the installer, fully close Discord from the system tray, and reopen it.
6. Open **User Settings → Vencord → Plugins**, search **SaveAsSticker**, and enable it.

For Vesktop, use `pnpm build`, then choose your Vencord `dist` folder under **Vesktop Settings → Developer Settings → Vencord Location** and restart Vesktop, following the official source-build guide.

### Windows shortcut for step 3

In PowerShell, from your existing **Vencord source folder**:

```powershell
$stickerZip = Join-Path $env:TEMP 'SaveAsSticker-Vencord.zip'
Invoke-WebRequest 'https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/vencord-save-as-sticker/SaveAsSticker-Vencord.zip' -OutFile $stickerZip
New-Item -ItemType Directory -Force '.\src\userplugins' | Out-Null
Expand-Archive $stickerZip -DestinationPath '.\src\userplugins' -Force
pnpm install --frozen-lockfile
pnpm build
pnpm inject
```

To update, replace the `saveAsSticker` folder with the latest ZIP contents, rebuild and restart. If you switch back to a standard prebuilt Vencord installation, custom plugins will not be included in that build.

## Use

- Right-click an image/GIF in a message or the image viewer. If you right-click a message containing several images, choose the desired image from the submenu.
- Edit the name, select a server, then press **Add sticker**. Only servers where you can create expressions appear; full servers are disabled.
- If a host blocks downloading or a link is only a preview, use **Choose original file** in the picker. You can also open the plugin's settings/about panel and press **Choose image or GIF**.
- Uploads use Discord's existing signed-in session. The plugin never asks for a token. Conversion happens locally; the prepared file is uploaded only to your selected Discord server.

## Images and GIFs

- PNG, JPEG, static WebP and BMP are fitted onto a transparent 320 × 320 PNG without stretching.
- Actual GIF files are kept animated and fitted to 320 × 320. Frame timing, loop count, transparency and frame disposal are preserved. Color count may be reduced to meet the 512 KiB upload limit.
- Animation limit: 5 seconds, at most 250 frames. Source GIFs above 4 megapixels or 80 megapixels across all frames are rejected to avoid freezing Discord. Downloads are limited to 25 MiB.
- GIF attachments and GIF link embeds work, including Tenor/Giphy GIFV previews delivered as MP4 or WebM. The original GIF is preferred when exposed by Discord; otherwise the video is converted locally into an animated GIF at up to 25 FPS, preserving its full duration with transparent padding. Audio is omitted.
- Long or oversized animations produce an explanation; they are never silently trimmed. Real GIF files keep every frame. Video previews are sampled at up to 25 FPS and loop continuously.
- Download failures or still previews fall back to the embed’s animated media/proxy URL when available. Links without accessible animated media need **Choose original file**; a still thumbnail is never substituted for animation.
- Animated APNG/WebP must first be exported as GIF. They are rejected instead of silently flattened.
- Discord's permissions, rate limits and sticker limits still apply. Permissions and capacity are checked again before uploading. Failed uploads are not automatically retried.

## Verification and development

The release is checked against Vencord commit `3374b8a9d8f6b051c64204917360293aad7f5d75` (1.15.10), including its TypeScript check and desktop build. Automated tests cover the bundled GIF converter, media selection, downloads, multipart uploads, permission/slot checks, duplicate submission prevention, plugin lifecycle, and automatic installer upgrades. Real-browser MP4 and WebM checks verify animation, duration, transparent padding, cancellation, and the five-second limit. No live Discord account/server upload was performed in this development environment.

For plugin development only, from `vencord-save-as-sticker/`:

```sh
npm ci
npm run build
npm test
```

Optional browser regression check (requires ffmpeg plus Chrome/Chromium): set `SAS_CHROMIUM_PATH` to its executable, then run `npm run test:browser`. The browser tooling is only for development; plugin users need no additional dependencies.

`src/gif.js` is the editable GIF converter. `npm run build` bundles it and its pinned libraries into `saveAsSticker/gif.js`. Copy the updated `saveAsSticker` folder into your Vencord source checkout, then use **pnpm** there to build Vencord.

The Revenge version lives separately in [`save-as-sticker`](../save-as-sticker/).

License: GPL-3.0-or-later. Bundled GIF libraries are MIT-licensed; see `saveAsSticker/LICENSE`, `NOTICE.txt` and `THIRD_PARTY_LICENSES.txt`.
