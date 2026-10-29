# Altitude for Valenced

High Altitude and Low Altitude by [nyraki / myumichi](https://github.com/myumichi/altitude), ported to Valenced's native Themes API. Both palettes and the Lexend Deca font pack are included in one plugin.

## Install

1. Open **Settings → Valenced → Themes → Manage theme plugins**, then tap **+**.
2. Add this repository if it is not already present:

   ```text
   https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/valenced/index.json
   ```

3. Search for **Altitude**, install it and enable it. Keep **Themes API** enabled and the default **Valenced Community Plugins** repository available. Discord **352.2 or newer** is required.
4. Fully restart Discord. Open **Themes → Colors → Altitude**, then choose **High Altitude** or **Low Altitude**.
5. Under **Themes → Fonts**, choose **Altitude · Lexend Deca** and reload once more to apply the fonts.

Colours, fonts, icons and emojis are separate selections in Valenced. Choosing the colour theme does not select a font pack automatically.

## Background

Both backgrounds use their original images from a pinned revision of the source repository, with blur 25 and dimming 95/255. Internet access is required to load them. If you previously selected a custom background or **None**, open **Colors → Background** and switch the source to **Theme**. Valenced also lets you change the blur and dimming there.

The warm cream accents, blue-grey surfaces, link colours, icon tints, mention highlight and status colours come from the original JSON. Modern cards, inputs, floating bars and opacity tokens are mapped to those colours. Select Discord's Dark or Ash base for the closest result.

## Differences from Aliucord

- The original body font, Lexend Deca, is included under its SIL Open Font License. Rawson Pro heading fonts are not included; headings use Lexend.
- Valenced blends an image behind coloured translucent surfaces. Aliucord darkens the image with a black overlay, so the result is not pixel identical.
- BetterChatbox, SquareAvatars, BetterStatusIndicators, NoBurnIn and LayoutController are separate Aliucord plugins. This port supplies the theme and fonts; those plugins' layout changes are outside its scope.
- Discord's icon shapes, Noto Sans fallback, code fonts and emojis are retained.

## Build and checks

From the repository root:

```sh
python3 valenced/build.py
python3 valenced/build.py --check
node --test valenced/tests/altitude.test.cjs
python3 -m unittest discover -s valenced/tests -p 'test_*.py'
```

The source uses no Discord module searches, UI patches or timers. The Themes API owns registration, applying selections and cleanup. The port has not been tested on a physical phone.
