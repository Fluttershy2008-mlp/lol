# Fluttershy Chat Background

By **Fluttershy2008** · Version **1.0.0**.

A companion for the [Fluttershy theme](../Fluttershy_Pink_Yellow_Theme.json) on Revenge Classic/Vendetta-compatible clients. It draws the Fluttershy wallpaper directly behind messages when a theme background is missing.

## Install

1. Import and select the [updated theme](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/Fluttershy_Pink_Yellow_Theme.json?v=2.0.1).
2. Under Settings > Revenge > Plugins, add this URL and enable the plugin:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/fluttershy-background/
```

3. Reopen the chat or fully restart Discord.

The plugin always draws the Fluttershy wallpaper while enabled. Disable it to remove the companion wallpaper. It does not edit the theme selection or the built-in Show Chat Background preference.

## Implementation

- Looks for MessagesConnected, Messages, and the named ChatView export.
- Resolves callable function, class, memo and forwardRef renderers before patching. It does not assume every component has a callable `.render` method.
- Adds a noninteractive image behind the message view. Only the outer shell and containers on the message-surface path are made transparent. Attachment cards, event handlers, refs and message data are preserved.
- Removes its patch on unload and notifies mounted wrappers to restore their original output. It does not modify the global patcher or React APIs.
- Reports unsupported renderers and image-download errors rather than silently claiming a working background.

The built-in Revenge background implementation and its visibility setting are documented in the upstream source:

- [Background renderer](https://github.com/revenge-mod/revenge-bundle/blob/main/src/lib/addons/themes/colors/patches/background.tsx)
- [Show Chat Background setting](https://github.com/revenge-mod/revenge-bundle/blob/main/src/core/ui/settings/pages/Themes/index.tsx)

The screenshot alone cannot identify which renderer or preference blocked the original background. This companion is a fallback for the rendering path; it does not repair Revenge's core or claim device validation.

## Build and verify

```sh
node fluttershy-background/build.mjs
node --test fluttershy-background/background.test.mjs
```

The build script refreshes the manifest hash for the readable, directly installable `index.js`. The 13 tests use simulated public Revenge/React APIs to cover renderer shapes, read-only exports, lifecycle cleanup, noninteractive image layout, and preservation of message content. No on-device test was available.

Wallpaper provenance and font resources are listed in the [theme notes](../Fluttershy_Theme_README.md).
