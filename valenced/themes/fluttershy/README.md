# Fluttershy - Pink & Yellow (Valenced)

Version **1.0.0-beta5** pairs the Fluttershy scrapbook with Rainbow Dash-inspired colours. Chat text is pale sky blue, channel names are brighter, category labels are lavender, and links and icons use cyan. Mentions use sunny yellow, with a deep blue highlight for the selected channel.

The original 864 × 1536 JPEG featuring Fluttershy and Angel is bundled for offline use.

Valenced centres the image proportionally and uses a light blur (1) and 60% opacity over the plum base. Dark navigation uses 86% surface dimming to keep channel names readable. The cover renderer can crop the outer edges on taller screens.

## Update

1. Refresh Fluttershy's Valenced Repository and update the existing Fluttershy theme to **1.0.0-beta5**, or import the ZIP.
2. Fully restart Discord and select **Fluttershy - Pink & Yellow**.
3. If previous background slider values are still applied, reset Background to the theme defaults.

No Classic Fluttershy Chat Background companion is required.

## Build and validation

The existing `valenced/build.py` packages the local theme source and image deterministically. Release history is retained.

Local verification checks theme registration, bundled asset bytes, manifest/ZIP validity, package hashes, preservation of unrelated catalogue entries, and modern-label contrast over sidebar surfaces. Physical Android appearance still requires device verification.

The official API describes [background options](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/api.themes/js/types.ts), [screen alignment](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/api.themes/js/background.tsx), and [surface dimming](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/api.themes/js/colors.ts).
