# ViewIcons for Revenge

View avatars, profile banners, server avatars, avatar decorations, server icons/banners, and group DM icons from supported Discord mobile menus.

## Install

In **Revenge Settings → Plugins**, tap **+**, then paste this entire URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/view-icons/
```

Use the folder URL above, including the trailing slash. The GitHub `github.com/.../tree/main/view-icons` page is a web page and cannot serve as a plugin install URL. Do not append `index.js` or `manifest.json`.

If ViewIcons is already installed, enable plugin updates and reload Revenge. If a failed entry was installed using another URL, remove that entry and install using the URL above.

Open a profile's overflow menu or a supported server/group DM menu and choose **View Avatar**, **View Banner**, or another available image action. Images open in Discord's media viewer, with a browser fallback when that viewer is unavailable.

## 1.0.2

- Missing optional Discord modules and icon assets no longer abort plugin evaluation or startup.
- URL helpers are resolved separately, with Discord CDN fallbacks for available image hashes.
- Menu patches load independently, so one unsupported menu does not disable the others.
- Pending action sheets cannot add patches after the plugin is disabled; reused sheets use the current image targets.
- The manifest includes a new version and a SHA-256 hash of the shipped JavaScript so existing installs fetch the fix.

## Validation

Run `node --test view-icons/tests/runtime.test.mjs` from the repository root. Tests execute the shipped file through Revenge's Vendetta evaluation wrapper and mocked Discord modules. Actual menu availability still depends on the Discord/Revenge version; these tests do not replace testing on an Android device.
