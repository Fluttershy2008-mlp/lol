# Fluttershy's Revenge Next Repository

Add this **complete URL** to the **Repository URL** field in Revenge Next, then tap **Add repository**:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/revenge-next/index.json
```

Open Browse Plugins after adding it. Enable a plugin after installing it and restart Discord when Revenge asks. The existing Revenge Community Plugins repository should stay enabled so the native themes can resolve their Themes API dependency. If that API is pending an update, restart Discord before selecting a theme.

This catalogue contains **21 plugin preview ports and four native theme packages**, all labelled **Next preview**. They are experimental: package validation and simulated runtime checks passed, but they have not been tested on a physical Android device. Install the plugins you use, one at a time.

## Included plugins

Addon List, AutoText, Blocked User List, Copy User ID, CustomRPC, ExpressionCloner, Friends List, HideBlockedAndIgnoredMessages, InfoCommands, Message Logger, More Alts!, Nitro Auto Claim, PingJumper, Profile Status Presets, ReadAllNotificationsButton, RelationshipNotifier, SaveAsSticker, Server Leaver, Stealmoji, ValidUser and ViewIcons.

These are packaged with an isolated compatibility adapter. It translates module lookups, patcher calling conventions, local commands, clipboard access and JSON storage to the documented Next APIs. It maps `onLoad`/`onUnload` and settings to the Next lifecycle, tracks patches and timers, and keeps notifications on the Android toast API. It does not replace global Vendetta, React or Discord APIs. Discord's private modules can still change, and individual UI features may be unavailable.

Open each plugin's settings through its entry in the Next Plugins page. Shortcuts written for the Classic settings sidebar do not carry over. Classic settings, history and saved accounts are not imported automatically. More Alts' optional import from the original Classic Apex plugin is unavailable; add your own accounts through its normal login flow. Discord's account verification and gift redemption checks still apply.

Message Logger and Message Logger V2 are the same original implementation, so the catalogue offers one Message Logger entry. Addon List reports an item as **Installed** when the native list does not expose its enabled or selected state.

## Included native themes

| Theme | Source |
| --- | --- |
| Fluttershy — Pink & Yellow | [Theme JSON](../Fluttershy_Pink_Yellow_Theme.json) |
| Rainbow Dash — Sonic Rainboom | [Theme JSON](../Rainbow_Dash_Sonic_Rainboom.json) |
| Sunset Shimmer — Ember & Gold | [Theme JSON](../Sunset_Shimmer_Theme.json) |
| Tokyo Nights | [Theme JSON](../Tokyo_Nights_Theme.json) |

These register colours and backgrounds through Next's Themes API. Pick the colour theme in Next's Themes settings after installation. The Classic Fluttershy/Rainbow Dash/Sunset wallpaper companion plugins are unnecessary for these packages. Font packs are separate; these packages do not install the optional legacy fonts.

Host requirements: Revenge Next API **1.2.1 or newer, below 2**. Native themes additionally need Themes API **1.5 or newer, below 2**, and Discord **352.2 or newer**. The dependency resolver checks these requirements before installation.

## Build and verify

Python 3.12+ and Node.js 24+ are sufficient; no npm packages are needed. From the repository root:

```sh
python3 revenge-next/build.py --check
node --test revenge-next/tests/runtime.test.cjs
python3 -m unittest discover -s revenge-next/tests -p 'test_*.py'
```

To publish a source or adapter change, bump `portVersion` in `repo.config.json` (or `themeVersion` for theme changes), then run `python3 revenge-next/build.py`. Commit the changed sources, configuration, `pool/`, `sources.json` and `index.json` together. Keep old ZIPs in `pool/`; they are the release history. The script preserves old versions, compares numeric version components and digit runs in labels, and creates default and beta channel pointers. Optional per-plugin channel overrides can be set under `channels` in the config.

Each ZIP contains its Next manifest and compiled script. The index records the exact byte size, SHA-256, absolute HTTPS URL and required dependencies. Builds are deterministic. `.build/` holds regenerated scripts for local tests and is not published. Original plugin credits and available licence notices are included in the ZIPs. `sources.json` records the exact original source hashes and versions used for each build.

Validation covers all 25 package checksums/manifests, all script expressions, all 21 original plugin factories against a simulated Next API, native theme registration, a Copy User ID message-menu integration, patch teardown, storage persistence, commands, timers and failure cleanup. It is not an on-device compatibility claim for all features or for a particular One UI/Android version.

Format and API references: [Revenge publishing guide](https://revenge.palmdevs.me/docs/plugin-development/getting-started/publishing-your-plugin/), [Plugin API](https://revenge.palmdevs.me/docs/plugin-development/api-reference/plugin-api/), [official Next source](https://github.com/revenge-mod/revenge-bundle-next), [Themes API source](https://github.com/revenge-mod/revenge-community-plugins/tree/main/plugins/api.themes).
