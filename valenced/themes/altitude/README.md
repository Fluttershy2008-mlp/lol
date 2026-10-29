# Altitude for Valenced

High Altitude and Low Altitude by [nyraki / myumichi](https://github.com/myumichi/altitude), ported to Valenced's native Themes API. Both palettes, the original font files and native square avatars are included in one Android plugin.

## Install

1. Open **Settings → Valenced → Themes → Manage theme plugins**, then tap **+**.
2. Add this repository if it is not already present:

   ```text
   https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/valenced/index.json
   ```

3. Search for **Altitude**, install it and enable it. Keep **Themes API** enabled and the default **Valenced Community Plugins** repository available. Valenced **1.2.4 or newer**, Themes API **1.0.0** and Discord **352.2 or newer** are required.
4. Fully restart Discord. Open **Themes → Colors → Altitude**, then choose **High Altitude** or **Low Altitude**.
5. Under **Themes → Fonts**, choose **Altitude · Lexend Deca** and reload once more to apply the fonts.

Colours, fonts, icons and emojis are separate selections in Valenced. Choosing the colour theme does not select a font pack automatically.

## Background

**Beta3 adds the wallpaper behind Settings**, including the overview and theme picker. It uses the Themes API's existing wallpaper renderer, with transparent Settings screen containers. Menu cards, list scrolling, touch handlers and navigation stay intact. The backdrop follows the selected Altitude variant, custom image preferences and the **None** option; it stops when another colour theme is selected or Altitude is disabled.

**Beta2 removes the added blur** from High and Low Altitude so the stars, clouds and image details remain visible. Both backgrounds use the original images from a pinned source revision, at full opacity with dimming 95/255. Beta4 bundles both image files, so no network access is needed to load them.

After updating Altitude, restart Discord. If a saved background setting still applies the old blur, open **Themes → Colors → Background** and tap **Reset** to follow the updated theme defaults. For manual settings, choose **From theme**, set **Opacity** to **100%** and **Blur** to **0**. These preferences override a theme's defaults, even after changing or updating themes.

The warm cream accents, blue-grey surfaces, link colours, icon tints, mention highlight and status colours come from the original JSON. Modern cards, inputs, floating bars and opacity tokens are mapped to those colours. Select Discord's Dark or Ash base for the closest result.

## Differences from Aliucord

- The original body font, Lexend Deca, is included under its SIL Open Font License. The original Rawson Pro files are available as a separate display font pack.
- Valenced blends an image behind coloured translucent surfaces. Aliucord darkens the image with a black overlay, so the result is not pixel identical.
- Native chat and profile avatars use square 3dp corners. Classic chat typography is applied with bundled Lexend fonts. BetterChatbox, BetterStatusIndicators, NoBurnIn and LayoutController remain separate Aliucord features.
- Discord's icon shapes, Noto Sans fallback, code fonts and emojis are retained.

## Build and checks

From the repository root:

```sh
python3 valenced/build.py
python3 valenced/build.py --check
node --test valenced/tests/altitude.test.cjs
node --test valenced/tests/altitude-settings.test.cjs
python3 -m unittest discover -s valenced/tests -p 'test_*.py'
```

The Settings integration waits for imported Settings modules and initialized gradient exports; it does not force unrelated modules to load or poll with timers. Its patches and subscriptions are removed when the plugin stops. The Themes API owns the image, saved background preferences, colour selection and fonts. The port has not been tested on a physical phone.

### Version 1.0.0-beta4

Update the existing Altitude installation through the Valenced repository, then
reload Discord. This release adds square native chat and profile avatars with
3dp corners and classic chat typography. Original backgrounds and all five font
files are bundled. Existing High/Low choices, the Lexend Deca pack ID, the clear
background setting and Settings wallpaper integration remain available.

Requires Valenced 1.2.4 or later and Themes API 1.0.0. Select the optional
Rawson Pro display pack under individual fonts if desired. Native lifecycle
regressions run with `python3 valenced/themes/altitude/source/test_native.py`.
This is a prerelease checked with local fixtures; device rendering is unverified.
