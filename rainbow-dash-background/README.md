# Rainbow Dash Chat Background

Companion version **1.0.0** for Rainbow Dash Sonic Rainboom **1.3.0**.
Theme and companion by **Fluttershy_simper67**.

This update addresses a solid grey chat with no wallpaper on the user's Samsung Galaxy S26 Ultra running One UI 9 / Android 17. The theme now makes the chat background surfaces transparent, and the companion draws the image directly behind the messages when Revenge Classic's own wallpaper renderer cannot.

## Install the update

1. Turn off **Fluttershy Chat Background** and **Sunset Shimmer Chat Background** if either is enabled. Use only one wallpaper companion at a time.
2. In **Settings > Revenge > Themes**, import and select this updated theme URL:

   ```text
   https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/Rainbow_Dash_Sonic_Rainboom.json?v=1.3.0
   ```

3. Use Discord's dark appearance. Enable **Show Chat Background** in the theme options if that setting is available.
4. In **Settings > Revenge > Plugins > +**, install this folder URL, including the final slash:

   ```text
   https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/rainbow-dash-background/
   ```

5. Enable **Rainbow Dash Chat Background**, then fully close and reopen Discord. Select the 1.3.0 theme if the older entry is still present.

The original theme URL continues to work. The version query requests a fresh copy instead of a cached 1.2.0 theme.

## Compatibility and behaviour

The companion targets the **Revenge Classic/Vendetta plugin API** used by the other wallpaper companions in this repository. It handles callable exports, React memo/forwardRef components, class renderers, and a named ChatView fallback. It reports an error if it cannot find a supported renderer. It does not use Discord's legacy toast service.

The wallpaper is a static PNG with 32% visibility and no blur. It fills the current chat viewport using `cover`, so there are no fixed phone dimensions, keyboard offsets, or manual system-bar insets. Tall or landscape views crop the image as needed. The decorative image cannot capture touches or appear as a screen-reader item. Welcome cards, attachments, message content, and their handlers stay intact.

A React Native StatusBar component requests light status icons while this background is mounted. It uses `barStyle` without the deprecated Android background-colour or translucency properties. Disabling the companion restores its original renderers and hides the wallpaper.

One UI and Android version numbers do not identify the installed Discord renderer. This code is intended for the reported One UI 9 / Android 17 setup, but **has not been verified on a physical Galaxy S26 Ultra**. It is not a Revenge Next plugin. If the background remains grey after both installations, capture **Revenge > About** with the Revenge and Discord versions so the actual renderer can be matched.

## Verification

From the repository root:

```sh
node rainbow-dash-background/build.mjs
node --test rainbow-dash-background/background.test.mjs rainbow-dash-background/theme.test.mjs
```

The focused checks cover renderer variants, cleanup, image errors, no toast access, the empty-channel welcome screen, non-intercepting viewport-sized artwork, status-icon props, matching theme and companion resources, contrast, PNG integrity, and the manifest hash. These are mocked renderer and configuration checks, not an on-device test.

## Artwork and API references

- [Original wallpaper source on WallpaperSafari](https://wallpapersafari.com/w/1A6Dch). The portrait is mirrored unchanged at `assets/rainbow-dash-portrait.png` so the theme and plugin use the same GitHub-hosted image. Artwork and My Little Pony characters belong to their respective owners; the author credit above refers to the theme and companion code.
- [React Native Image](https://reactnative.dev/docs/image).
- [React Native StatusBar](https://reactnative.dev/docs/statusbar).
