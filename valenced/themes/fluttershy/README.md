# Fluttershy - Pink & Yellow (Valenced)

Version **1.0.0-beta6** appears as **Fluttershy · Rainbow Skies** in the Colors picker. It uses sky-blue chat text and icons, brighter channel labels, lavender categories, sunny mentions and navy panels. The original 864 × 1536 Fluttershy and Angel collage ships offline and stays centred behind the interface.

The theme refreshes a saved selection once Discord's colour tokens load. Valenced can otherwise keep the old colours when registration happens early in startup.

## Update

1. Update **Fluttershy - Pink & Yellow (Valenced)** to **1.0.0-beta6**, or import the ZIP using **Install from file** in Valenced's plugin settings. Fully restart Discord.
2. Open **Discord Settings → Valenced Themes → Colors** and look for **Fluttershy · Rainbow Skies**. If the palette is stale, select the default colours, then select **Fluttershy · Rainbow Skies** again.

## Build and validation

The existing `valenced/build.py` packages the local theme source and image deterministically. Release history is retained.

Local verification checks theme registration, bundled asset bytes, manifest/ZIP validity, package hashes, preservation of unrelated catalogue entries, and modern-label contrast over sidebar surfaces. Physical Android appearance still requires device verification.

The official API describes [background options](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/api.themes/js/types.ts), [screen alignment](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/api.themes/js/background.tsx), and [surface dimming](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/api.themes/js/colors.ts).
