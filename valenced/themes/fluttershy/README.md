# Fluttershy - Pink & Yellow (Valenced)

Version **1.0.0-beta2** replaces the online pastel background with the user's supplied Fluttershy collage. The JPEG ships unchanged inside the plugin and works offline. The existing colours and identifiers are preserved, so this updates the original theme.

The wallpaper uses Valenced's screen-aligned, centred `cover` renderer. It scales proportionally, fills the screen and shares the same crop across the chat and main-screen layers. Some outer-edge cropping is expected on screens with a different aspect ratio. Rotation and window resizing are handled by the Themes API. No global React, image, navigation or touch hooks are added.

Image opacity is 1, blur is 0, and surface dimming is 0.65 for readable messages. Existing user background overrides still take precedence.

## Install

1. Refresh the existing Fluttershy's Valenced Repository and update this theme to **1.0.0-beta2**, or import its ZIP through Valenced's plugin ZIP installer.
2. Fully restart Discord.
3. Under Valenced's Themes settings, select **Fluttershy - Pink & Yellow**. If a custom wallpaper is selected, choose the theme background under Background.

No Classic Fluttershy Chat Background companion is required on Valenced.

## Source and validation

- `index.js` keeps the original colour data and theme registration.
- `assets/backgrounds/fluttershy-collage.jpg` is the unchanged 864 × 1536 user attachment.
- The existing `valenced/build.py` native-theme path packages these files deterministically and maintains release history.
- Local checks verify registration, palette equality, asset byte equality, ZIP integrity, catalogue hashes, and unchanged unrelated catalogue entries. No physical Android test was available.

The official API defines local asset paths in [types.ts](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/api.themes/js/types.ts) and centres proportional screen-sized image layers in [background.tsx](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/api.themes/js/background.tsx).
