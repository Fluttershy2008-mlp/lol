# Rainbow Dash Chat Background

Companion version **1.0.0** for Rainbow Dash Sonic Rainboom **1.4.0**.
Theme and companion by **Fluttershy_simper67**.

This update addresses a solid grey chat with no wallpaper on the user's Samsung Galaxy S26 Ultra running One UI 9 / Android 17. The theme now makes the chat background surfaces transparent, and the companion draws the image directly behind the messages when Revenge Classic's own wallpaper renderer cannot.

Version 1.4.0 uses the Discord Android colour names found in the supplied [Decord repository](https://github.com/everestmcarthur/decord). Its ChatView sets the chat surface to `CHANNEL_BACKGROUND_DEFAULT`, which earlier versions of this theme omitted. The update sets that specific surface transparent and adds the current card, chat-input, message-highlight and feedback tokens. It also supplies the 100-colour `NEUTRAL` palette used by native surfaces and text, keeping those raw colours opaque and ordered by brightness.

## Install the update

1. Turn off **Fluttershy Chat Background** and **Sunset Shimmer Chat Background** if either is enabled. Use only one wallpaper companion at a time.
2. In **Settings > Revenge > Themes**, import and select this updated theme URL:

   ```text
   https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/Rainbow_Dash_Sonic_Rainboom.json?v=1.4.0
   ```

3. Use Discord's dark appearance. Enable **Show Chat Background** in the theme options if that setting is available.
4. In **Settings > Revenge > Plugins > +**, install this folder URL, including the final slash:

   ```text
   https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/rainbow-dash-background/
   ```

5. Enable **Rainbow Dash Chat Background**, then fully close and reopen Discord. Select the 1.4.0 theme if an older entry is still present. The companion remains version 1.0.0; this update changes the theme's colour definitions, not the plugin code.

The original theme URL continues to work. The version query requests a fresh copy instead of a cached older theme.

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

The focused checks cover renderer variants, cleanup, image errors, no toast access, the empty-channel welcome screen, non-intercepting viewport-sized artwork, status-icon props, matching theme and companion resources, current chat-surface tokens, the native neutral palette, contrast, PNG integrity, and the manifest hash. These are mocked renderer and configuration checks, not an on-device test.

The 62 newly added semantic tokens were checked against all three Decord colour snapshots: stable `350008`, beta `351109`, and alpha `352207`. The chat background token is also present in each channel's extracted ChatView source. These are reference snapshots, not a detection of the user's installed Discord version.

References used for the correction:

- [ChatView source, stable snapshot](https://github.com/everestmcarthur/decord/blob/f411b5cfbaa69e2faf3388d09ca0e23328169715/stable/source/modules/chat/native/ChatView.tsx).
- [Stable semantic colour definitions](https://github.com/everestmcarthur/decord/blob/9e84a4ec8a8ea48a04e9f75bc6d75bfbbb558f12/stable/semantic.json).
- [Native raw colour definitions](https://github.com/everestmcarthur/decord/blob/9e84a4ec8a8ea48a04e9f75bc6d75bfbbb558f12/stable/raw.json).

## Artwork and API references

- [Original wallpaper source on WallpaperSafari](https://wallpapersafari.com/w/1A6Dch). The portrait is mirrored unchanged at `assets/rainbow-dash-portrait.png` so the theme and plugin use the same GitHub-hosted image. Artwork and My Little Pony characters belong to their respective owners; the author credit above refers to the theme and companion code.
- [React Native Image](https://reactnative.dev/docs/image).
- [React Native StatusBar](https://reactnative.dev/docs/statusbar).
