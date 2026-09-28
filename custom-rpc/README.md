# CustomRPC for Revenge

A mobile adaptation of **Vencord CustomRPC** for Discord with Revenge/Vendetta plugin support.

## Install

In **Revenge → Plugins → +**, paste this whole URL, including the final slash:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/custom-rpc/
```

Use the folder URL, not the GitHub source page or `manifest.json`. `manifest.json` and the ready-to-run `index.js` are included here. This is separate from the SaveAsSticker plugin at the repository root.

## Set up

1. Enable CustomRPC. In Discord settings, open **Revenge → CustomRPC**, directly below **Plugins**. The plugin's own settings button opens the same editor.
2. Enter an **Application name** and choose Playing, Streaming, Listening, Watching, or Competing.
3. Add details, state, images, buttons, a timer or party size if wanted.
4. Tap **Save & apply**. Use **Stop activity** to remove it without deleting your settings.

A name is enough for a basic text activity. For your own application assets, create an application at <https://discord.com/developers/applications>, copy the **Application ID**, and upload images in its Rich Presence section. Enter their asset keys or IDs in the plugin. Direct image URLs are also accepted; Discord must be able to fetch them. For external-image failures, try your own Application ID. Imgur/Tenor gallery pages are not direct images. GIF rendering and clickable text/image fields depend on Discord's current renderer.

Each button needs a label and an `http://` or `https://` link. Either button slot can be used independently. Discord may hide buttons on your own profile; verify from another account. Keep activity sharing enabled and use an online status for others to see the activity.

The plugin resumes the applied configuration when it reloads and refreshes it after a reconnect/foreground event. Unsaved edits remain a separate draft. It does not run a separate background service: force-closing Discord or Android suspending the app can stop the presence. Turn off other custom RPC plugins if they compete with this one.

### Updating / recovery from the 1.1.0 settings crash

Version **1.1.1** fixes `Cannot read property 'parent' of undefined` from `getAncestors` when opening Settings. With plugin updates enabled, fully close and reopen Discord to fetch the update. If the Plugins page is accessible, you can also update CustomRPC there. Keep using the same install URL; no data reset is needed.

The shortcut remains below Plugins. The fix registers its native renderer before its menu key, preserves existing renderer getters, and repairs its own entry if another sidebar plugin replaces that getter. It does not disable native settings blocking or catch unrelated settings errors. A hidden, parentless renderer record remains after unload so cached native lists can safely resolve the old key. This small bridge is reused on re-enable. If native registration is unavailable, the plugin leaves out the unsafe shortcut and retains the plugin-card settings editor.

Your saved activity and draft are retained. Disabling CustomRPC removes the shortcut; stopping only the activity keeps it available.

## Features

- All five Vencord activity types, including Twitch/YouTube streaming links.
- A **CustomRPC** row directly below **Plugins** in the main Revenge settings section.
- Application name/ID, two text lines and optional text links.
- Large and small images, hover text and optional click links.
- Two independently validated buttons.
- No timer, elapsed time since plugin startup, elapsed time since local midnight at startup, or custom millisecond timestamps.
- Party size for Playing activities.
- Native React Native settings controls; no legacy `FluxContainer(Alert)` dependency.
- Per-plugin activity socket, matched apply/clear identity, cleanup on unload, and cancellation of pending work when stopped.
- Cached image resolution through Discord's own asset manager/HTTP client. No token entry or extraction.
- Coalesced reconnect handling and a five-second minimum between normal activity updates. Stop clears immediately.

The desktop Vencord profile-button visibility patch and embedded desktop preview cannot be reused on mobile. Settings use native mobile controls, and activity rendering is handled by Discord.

## Build and checks

```sh
cd custom-rpc
npm ci
npm run check
```

`npm run build` produces an expression bundle in Revenge's loader format and updates the manifest SHA-256. Node tests exercise activity payloads, validation, asset resolution, asynchronous cancellation, lifecycle cleanup, shortcut placement/navigation/removal, and evaluation of the actual install bundle. A regression fixture reproduces the reported `.parent` error with a captured renderer map and checks both registration and unload. Tests also cover late sidebar overrides, cached keys, native setters, and preserving unrelated blocking behavior. These tests use mocked Discord modules and do not replace an on-device check. The shortcut uses the settings registry and page contract from Revenge commit `1b1d297`, the version shown in the user's screenshot. Version 1.1.1 has **not been verified on a physical Revenge/Discord Android client**.

Suggested phone check: apply a Playing activity; confirm it from another account; try one image and one button; stop; reapply; reconnect; disable the plugin. Stop/disable should remove only CustomRPC's activity. If Discord updates break module lookup, the settings screen reports the failure; image failures are reported while the text activity is still applied.

## Credits and license

Adapted from the user-provided Vencord `src/plugins/customRPC` source:

- Vencord / Vendicated and contributors (copyright 2023–2025).
- Original CustomRPC authors: captain, AutumnVN, nin0dev.
- Mobile adaptation: Fluttershy2008-mlp (2026).

Licensed **GPL-3.0-or-later**, with the full license in [LICENSE](LICENSE). Editable corresponding source is in [src](src); `build.mjs`, dependency lockfile and tests are included.

Mobile API behavior was checked against the upstream [Revenge loader](https://github.com/revenge-mod/revenge-bundle), [nexpid CustomRPC](https://github.com/nexpid/RevengePlugins/tree/main/src/plugins/customrpc) (CC-BY-4.0), and [shipwr3ckd RichPresence](https://github.com/shipwr3ckd/revengeplugin/tree/master/plugins/RichPresence) (CC0-1.0). The mobile UI, resolver and lifecycle code here are new implementations; the activity feature mapping is adapted from Vencord (GPL-3.0-or-later).
