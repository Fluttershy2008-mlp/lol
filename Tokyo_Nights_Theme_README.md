# Tokyo Nights — modern Discord Android colour update

Tokyo Nights 2.0.0 keeps the supplied Kuromi/vaporwave palette and adds colour coverage for newer Discord Android screens.

## Install

In Revenge, open **Settings → Revenge → Themes → +**, paste this URL, then select the theme and reload Discord:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/Tokyo_Nights_Theme.json
```

For the optional Kodchasan font, open **Settings → Revenge → Fonts → +**, paste this URL, select the font, and reload:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/Tokyo_Nights_Fonts.json
```

Labels may vary between Revenge builds. If Tokyo Nights is already installed from another URL, install the URL above to use this copy.

## What changed after older Discord versions

The current Decord extraction still includes some old colour names, but many modern components use other names and raw palettes. Defining an old name does not colour a component that now requests a different name.

| Area | Examples in the supplied theme | Current names added |
| --- | --- | --- |
| Main surfaces | `BACKGROUND_PRIMARY`, `BG_BASE_PRIMARY` | `BACKGROUND_BASE_LOW`, `BACKGROUND_BASE_LOWER`, `BACKGROUND_BASE_LOWEST` |
| Channels and sheets | `BACKGROUND_MOBILE_SECONDARY`, `BACKGROUND_FLOATING` | `CHANNEL_BACKGROUND_DEFAULT`, `MOBILE_ACTIONSHEET_BACKGROUND` |
| Text and icons | `TEXT_NORMAL`, `HEADER_PRIMARY`, `INTERACTIVE_NORMAL` | `TEXT_DEFAULT`, `TEXT_STRONG`, `ICON_DEFAULT`, `INTERACTIVE_ICON_DEFAULT` |
| Composer | `REDESIGN_CHAT_INPUT_BACKGROUND`, `CHANNELTEXTAREA_BACKGROUND` | `CHAT_INPUT_BACKGROUND`, `MOBILE_CHATINPUT_BACKGROUND_DEFAULT`, `INPUT_TEXT_DEFAULT` |
| Buttons | `REDESIGN_BUTTON_*` | `CONTROL_PRIMARY_*`, `CONTROL_SECONDARY_*` |
| Raw colours | `PRIMARY_*`, `PLUM_*`, `BRAND_*` | `NEUTRAL_1…100`, `BLURPLE_1…100`, opacity variants |

These are mappings chosen for this theme, not a claim that every old name was renamed one-to-one. The supplied file covers **117 semantic names**. This update has **390**, including **273 added names confirmed in the reference snapshots** and two corrected legacy names. New raw colour ramps also cover components that resolve colours directly.

Two independent errors were present in the supplied JSON:

- `RREDESIGN_BUTTON_PRIMARY_ON_BLURPLE_PRESSED_TEXT` and `RREDESIGN_ONLY_BACKGROUND_ACTIVE` have an extra leading `R`. Their corrected legacy spellings are retained alongside modern component names.
- `icon-qs-links` and `toast_copy_link` used `##ff00d9`; both now use `#ff00d9`.

The update also provides 19 current icon-name aliases. Old icon names and the `RC_*` references remain available for Themes+.

## Deliberate colour adjustments

The original palette is retained. These small changes address readability or inconsistent input styling:

| Field | Before | After |
| --- | --- | --- |
| `INTERACTIVE_HOVER` | `#061428` | `#fa8ce4` |
| `CHANNELTEXTAREA_BACKGROUND` | `#72afef` | `#1b0329`, matching the original redesign input |
| `REDESIGN_CHANNEL_NAME_MUTED_TEXT` | `#84118a` | `#da61a6` |
| `FOCUS_PRIMARY` | `#1b0122` | `#00b1dd` |
| Corrected pressed-button text key | `#9c1067`, matching its pressed background | `#fff0fb` |

Modern primary and critical button colours use readable text in their default and pressed states. The eleven checked text/control pairs range from **5.64:1 to 10.40:1** on their configured opaque surfaces. This is a limited static contrast check; it does not establish accessibility of every screen or text over the wallpaper.

Every semantic array now contains both dark and light entries. Both entries intentionally use this dark palette, as in the supplied two-entry arrays. This also fills the missing second entry on four original fields.

## Fonts, icons, and the background

The core Revenge spec-2 parser does not read the legacy `fonts` or `plus` sections. The old sections remain in the theme for loaders/addons that support them. Install the separate font pack above for core Revenge font support. The Rosiecord/Plumpy icon pack and per-icon recolours require a compatible Themes+ implementation; this update cannot make a discontinued icon-pack plugin work.

The Kuromi image URL and `alpha: 0.85` are unchanged. The image and all eight distinct referenced font files were present in LuckyJinx13/Public-Themes when inspected. Background rendering depends on the client mod's background hook. If colours work but the image does not appear, that is a separate loader/rendering issue; changing a colour token cannot repair that hook.

## Verification and sources

Checked on **24 October 2026** against the available [Decord canvas snapshot](https://github.com/everestmcarthur/decord/tree/9e84a4ec8a8ea48a04e9f75bc6d75bfbbb558f12):

| Channel | Extracted Discord build |
| --- | --- |
| Stable | `350008` |
| Beta | `351109` |
| Alpha | `352207` |

All 273 added modern semantic names and all 250 added raw names exist in those references. The parser, mode handling, font format, and optional-extension limits were checked against these implementation files:

- [Decord colour extractor](https://github.com/everestmcarthur/decord/blob/main/src/update/tasks/colors.ts)
- [Revenge theme parser](https://github.com/revenge-mod/revenge-bundle/blob/main/src/lib/addons/themes/colors/parser.ts)
- [Revenge colour resolver](https://github.com/revenge-mod/revenge-bundle/blob/main/src/lib/addons/themes/colors/patches/resolver.ts)
- [Revenge font pack implementation](https://github.com/revenge-mod/revenge-bundle/blob/main/src/lib/addons/fonts/index.ts)
- [Original image/font host](https://github.com/LuckyJinx13/Public-Themes)

This is static validation against available extracts, **not an Android device test** or proof of the exact Discord release that first changed a screen. One UI/Android version alone does not identify Discord's active colour tokens.

Run the reproducible validator with Python 3 from the repository:

```sh
python compatibility/tokyo-nights/validate_theme.py
```

It checks JSON, colour values, reference names, icon references, the font pack, preserved original settings, and eleven contrast pairs. It downloads the pinned reference JSON files. To use already-downloaded files offline, add `--reference-dir PATH` with `stable-semantic.json`, `beta-semantic.json`, `alpha-semantic.json`, and `stable-raw.json` in that directory.

The supplied theme, reformatted with its original values preserved, is backed up at [original-v298.json](compatibility/tokyo-nights/original-v298.json). [migration.json](compatibility/tokyo-nights/migration.json) records the exact reference commit, mappings, and deliberate edits.
