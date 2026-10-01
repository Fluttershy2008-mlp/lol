# Stealmoji for Revenge

Install this folder URL in **Revenge → Plugins → Install a plugin**:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/stealmoji/
```

Disable the old Stealmoji copy before installing this one, then reload Revenge.

## Use

- Tap a custom emoji, then choose **Stealmoji · Add / save emoji**.
- Long-press a message containing custom emoji to find the same action. Messages
  with multiple emoji show a selection list (up to 25 unique emoji).
- Long-press a custom emoji tab in the reactions sheet to open its tools.
- In the picker, copy the link, save the image/GIF, or select a server, edit the
  name, and press **Add emoji**. Static images also have Copy image on iOS.
- If your Discord build uses a different menu layout, open **Stealmoji's plugin
  settings** and paste a custom emoji such as `<:name:123456789012345678>`, an
  emoji CDN URL, or its ID. For an animated ID that Discord has not cached, turn
  on **Animated emoji (GIF)**. Unicode emoji cannot be copied into server slots.

## Changes in 2.0.0

- Safe module discovery with bounded startup retries and an app-resume retry.
- Independent settings tool even when Discord's menu hook is unavailable.
- Immutable React tree edits and per-opening wrappers, including memo/forwardRef
  components. No nested patch accumulation or hooks inserted into render patches.
- Searchable server picker, separate static/animated slot checks when available,
  permission checks before and after downloading, and name validation.
- Preserves GIF animation; requests smaller CDN sizes if the file exceeds the
  upload limit. Download and FileReader failures/timeouts are shown in the UI.
- Prevents overlapping uploads. No automatic retry of upload requests, and no
  upload starts if the plugin was disabled during the download.
- Modern sheet UI and AlertModal fallback; no legacy FluxContainer(Alert) lookup.
- Unload removes patches, startup timers, and the app-resume listener. Pending
  downloads time out and cannot initiate an upload after unloading. An upload
  already sent to Discord may still complete.

Discord still decides which uploads are allowed. You need Create Expressions
permission and a free slot. Unknown slot counts are left to Discord rather than
guessing a limit. Very large GIFs may still be too large even at 32 pixels.

API reference: https://docs.discord.com/developers/resources/emoji#create-guild-emoji
(256 KiB maximum, Create Expressions permission).

## Build and tests

Node 20+; no packages to install:

```sh
npm run build
npm test
```

`index.js` is a Vendetta-compatible expression bundle. `manifest.json` points to
it and includes its SHA-256 hash. Source lives in `src/`; all source and build
files are published alongside the install files.

Automated tests cover parsing, GIF preservation, download failures and size
limits, permissions, upload locks, unload races, menu injection, and cleanup.
They use mocked Discord/React Native modules. An actual Android/iOS Revenge
session is still needed to verify each Discord version's native menu and upload
behavior; no phone test is claimed.

GPL-3.0; see LICENSE and NOTICE. Original authors: Fiery, pylix, aliernfrog.
