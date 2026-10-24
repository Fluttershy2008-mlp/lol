# Sunset Shimmer ☀️ Ember & Gold

Theme by **fluttershy_simper**. Version **1.3.0**.

Ember-orange borders, warm red-brown cards and panels, cream text, and golden accents. Version 1.3.0 makes the main chat surfaces transparent and increases wallpaper visibility to 35%, with no blur. The existing Sunset wallpaper, text colours, accent palette, and author credit are preserved.

## Update the theme

In **Settings > Revenge > Themes**, import and select this versioned URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/Sunset_Shimmer_Theme.json?v=1.3.0
```

Use the dark appearance, enable **Show Chat Background** in the Themes options, then fully restart Discord. Select the new 1.3.0 entry if a cached copy remains installed. The original URL still works; the query string requests a fresh copy.

On a client with a **Legacy Themes** plugin, import the JSON URL there instead. This file remains a Vendetta-compatible spec-2 theme.

## Background companion for Revenge Classic

If your Samsung Galaxy S26 Ultra still shows a solid chat background, add **Sunset Shimmer Chat Background** under **Settings > Revenge > Plugins > +** with this folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/sunset-background/
```

Enable it, then reopen a chat or fully restart Discord. Disable **Fluttershy Chat Background** if it is enabled, so only the companion for your current theme draws a wallpaper. Disable the Sunset companion when switching away from Sunset.

The companion uses Revenge Classic/Vendetta plugin APIs. It draws the same image at 35% opacity behind messages, fills the current chat area using `cover`, and adapts to rotation, display scaling, and keyboard layout without fixed screen dimensions. A landscape image is cropped at the sides on a tall portrait screen. Messages, cards, input controls, and touch targets keep their content and handlers.

It supports callable exports, React memo/forwardRef components, class renderers, and the named ChatView fallback. It does not use the legacy toast service. If no supported chat renderer is found, startup reports an error rather than claiming the wallpaper was applied. It does not modify Revenge's core background patch.

This companion is for **Revenge Classic**, not the newer Revenge Next plugin format.

## Verification

The original wallpaper URL returned an actual 2000 × 1125 PNG with HTTP 200. Automated checks cover renderer variants, transparent message ancestors, touch handling, unload cleanup, image failures, no legacy toast access, matching theme/plugin resources, and the manifest hash. These checks do not substitute for testing on a physical Galaxy S26 Ultra.

Run the focused checks from the repository root:

```sh
node sunset-background/build.mjs
node --test sunset-background/background.test.mjs sunset-background/theme.test.mjs
```

## Wallpaper source

[Sunset Shimmer’s Radiant Glow by Light262](https://wall.alphacoders.com/big.php?i=872984). The theme and companion link to the original image host. The artwork is not bundled or re-uploaded. Artwork credit belongs to Light262; the hosting page lists personal-use terms.

## Licence

Adapted from [Glorious Sunset](https://github.com/eeriemyxi/glorious-sunset). Its required copyright and permission notice is preserved in [LICENSE](LICENSE). The displayed theme and companion author is fluttershy_simper.
