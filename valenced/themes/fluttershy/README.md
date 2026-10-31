# Fluttershy - Pink & Yellow (Valenced)

Version **1.0.0-beta3** refines the wallpaper appearance after beta2 made the collage too prominent behind channel names.

- A dark plum base replaces the neutral-grey fallback on newer Discord surfaces.
- Navigation is less transparent, with clearer pale-pink text and icons.
- The same collage remains centred and proportional, with image opacity 0.65, surface dimming 0.86 and blur 2.
- Input fields, cards and popups have solid backgrounds for readability.
- The original pink/yellow accent family and all plugin/theme identifiers remain in place.

The original 864 × 1536 JPEG ships unchanged inside the plugin. There is no remote image dependency. Valenced's screen-aligned cover renderer handles rotation and resizing, with possible outer-edge cropping on different screen shapes. No custom React, image, navigation or touch hooks are installed.

## Update

1. Refresh Fluttershy's Valenced Repository and update the existing Fluttershy theme to **1.0.0-beta3**, or import the ZIP.
2. Fully restart Discord and select **Fluttershy - Pink & Yellow**.
3. If previous background slider values are still applied, reset Background to the theme defaults.

No Classic Fluttershy Chat Background companion is required.

## Build and validation

The existing `valenced/build.py` packages the local theme source and image deterministically. Release history is retained.

Local verification checks theme registration, unchanged asset bytes, manifest/ZIP validity, package hashes, preservation of unrelated catalogue entries, and modern-label contrast over sidebar surfaces. Physical Android appearance still requires device verification.

The official API describes [background options](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/api.themes/js/types.ts), [screen alignment](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/api.themes/js/background.tsx), and [surface dimming](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/api.themes/js/colors.ts).
