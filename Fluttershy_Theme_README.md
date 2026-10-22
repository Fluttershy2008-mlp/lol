# Fluttershy - Pink & Yellow

Theme by **Fluttershy2008**. Version **2.0.1**.

Soft pink messages, butter-yellow headings and mentions, dark rose panels, and a G4 Fluttershy chat wallpaper. The theme keeps the rounded Meloso headings and Roboto body font from the supplied theme.

## Install

Copy this URL into your theme import screen:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/Fluttershy_Pink_Yellow_Theme.json?v=2.0.1
```

On Revenge Classic, add the URL under Settings > Revenge > Themes, select the theme, and reload Discord. Open the Themes options menu and enable **Show Chat Background**. On versions with a **Legacy Themes** plugin, import the URL through that plugin instead.

The version query avoids an older cached copy. If an old copy remains selected, select the new **2.0.1** copy before reloading.

## Background missing on a newer Discord build

The wallpaper URL is live, but a reachable image alone does not prove that the client paints it. Version 2.0.1 makes the chat surfaces transparent, removes the blur, and increases the wallpaper visibility to 35%.

If the chat still has a solid background, install and enable **Fluttershy Chat Background** in **Plugins**, using this folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/fluttershy-background/
```

Then reopen a chat or fully restart Discord. Use companion version **1.0.1** or later; that version removes the legacy toast calls that could trigger a `useToastContainer` crash. The companion draws the same wallpaper directly behind the message view. It supports callable default/named exports, React memo/forwardRef, and class renderers, including the named ChatView fallback. Its image layer cannot intercept touches. It does not read messages or change global patching APIs.

This companion is for Revenge Classic/Vendetta-compatible plugin APIs. Leave it enabled while using the Fluttershy wallpaper; disable it to stop drawing that wallpaper. If no supported chat renderer is found, enabling it reports an error instead of claiming success.

## Design

| Element | Colour |
| --- | --- |
| Chat base | `#160F13` behind transparent chat surfaces |
| Message text | `#F9DDEA` |
| Headings and mentions | `#F6E59B` |
| Links and icons | `#FFE0EE` |
| Input and navigation | `#100B0E` |

The wallpaper uses 35% visibility and no blur. The JSON includes the original theme's optional Themes+ settings and both dark/light colour slots. The active client and installed theme extensions determine which optional features are supported.

## Resources

- [Wallpaper source](https://www.pinterest.com/pin/51087777004053989/) · [direct image](https://i.pinimg.com/736x/86/77/41/86774153818f84a1032f89f416728f26.jpg)
- [Meloso font files](https://github.com/Quinxxxx/Meloso)
- [Roboto font file](https://github.com/VodkaXMartini/images/blob/main/Roboto-Regular.ttf)
- [Revenge theme import documentation](https://revenge.palmdevs.me/docs/installing-plugins/)

The theme author credit refers to the theme design and configuration. Wallpaper, characters, and font resources belong to their respective owners.

Validation checks JSON syntax, colour formats, text contrast against a conservative bright wallpaper bound, resource responses, and the companion's renderer handling. All 15 companion tests pass, including zero toast-service access during startup and image-error handling. Appearance has not been tested on a physical Discord installation.
