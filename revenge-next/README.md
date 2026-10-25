# Fluttershy's Revenge Next Repository

The recommended Repository URL is:

```text
https://fluttershy2008-mlp.github.io/lol/index.json
```

Open **Plugins > Settings > Advanced**, paste it into **Repository URL**, then tap **Add repository**. The explicit index URL, Pages root (`https://fluttershy2008-mlp.github.io/lol/`) and raw URL below serve the same catalogue. If you already added one, refresh it instead of adding another copy. ZIP downloads use the existing raw host.

GitHub Pages is enabled for this repository. The `.nojekyll` file serves the files directly. Future updates become available after GitHub's Pages deployment completes.

The existing raw address also works independently of Pages:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/revenge-next/index.json
```

Open Browse Plugins after adding it. Enable a plugin after installing it and restart Discord when Revenge asks. The existing Revenge Community Plugins repository should stay enabled so the native themes can resolve their Themes API dependency. If that API is pending an update, restart Discord before selecting a theme.

This catalogue contains **21 plugin preview ports and four native theme packages**, all labelled **Next preview**. They are experimental: package validation and simulated runtime checks passed, but they have not been tested on a physical Android device. Install the plugins you use, one at a time.

**InfoCommands 1.0.0-beta6:** fixes the button's popup path by preferring Next's curated native sheet actions and components, and opening after the floating server menu dismisses. A successful call to Discord's `openLazy` does not prove the sheet appeared. If it never mounts, renders with no visible layout, or throws, a native details popup shows cached information with copy/profile actions. Closing or disabling the plugin cancels pending presentation. The earlier lazy/frozen-menu fixes remain included. Refresh the repository, update InfoCommands, then fully restart Discord. Long-press a server icon and tap **Server Info**.

**Other plugin ports remain at 1.0.0-beta4:** this release fixes Addon List showing an empty list on current Next builds by reading the native plugin-system response envelope. Registry errors stay visible, and sideloaded plugins no longer receive this repository's URL. All ports remove hooks and timers immediately when stopped, even while asynchronous unload work is pending. Original third-party notices are included in the new ZIPs.

This release retains beta3's fixes for menus, split REST exports, custom pages, More Alts commands and InfoCommands local output, plus beta2's getter-only React Native Button fix. All 21 ports have automated startup, React settings, teardown/restart and feature checks. See the [per-plugin compatibility audit](COMPATIBILITY.md). Refresh the repository, update your plugins, then fully restart Discord.

## Included plugins

Addon List, AutoText, Blocked User List, Copy User ID, CustomRPC, ExpressionCloner, Friends List, HideBlockedAndIgnoredMessages, InfoCommands, Message Logger, More Alts!, Nitro Auto Claim, PingJumper, Profile Status Presets, ReadAllNotificationsButton, RelationshipNotifier, SaveAsSticker, Server Leaver, Stealmoji, ValidUser and ViewIcons.

These are packaged with an isolated compatibility adapter. It translates module lookups, patcher calling conventions, local commands, clipboard access and JSON storage to the documented Next APIs. It maps `onLoad`/`onUnload` and settings to the Next lifecycle, tracks patches and timers, and keeps notifications on the Android toast API. It does not replace global Vendetta, React or Discord APIs. Discord's private modules can still change, and individual UI features may be unavailable.

Open each plugin's settings through its entry in the Next Plugins page. Classic sidebar entries do not carry over, but commands and actions that open a custom plugin page now use a native Next settings route. Classic settings, history and saved accounts are not imported automatically. More Alts' optional import from the original Classic Apex plugin is unavailable; add your own accounts through its normal login flow. Discord's account verification and gift redemption checks still apply.

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

Building packages uses only Python's standard library. The runtime tests require Node.js 24+ and the pinned React test dependencies. From the repository root:

```sh
python3 revenge-next/build.py --check
npm ci --ignore-scripts --no-audit --no-fund --prefix revenge-next
node --test revenge-next/tests/*.test.cjs
python3 -m unittest discover -s revenge-next/tests -p 'test_*.py'
```

To publish a source or adapter change, set `pluginVersions["plugin-slug"]` in `repo.config.json` for a single-plugin update, bump `portVersion` for an adapter-wide release, or bump `themeVersion` for theme changes, then run `python3 revenge-next/build.py`. Commit the changed sources, configuration, `pool/`, `sources.json` and both generated `index.json` files together. Keep old ZIPs in `pool/`; they are the release history. The script preserves old versions, compares numeric version components and digit runs in labels, and creates default and beta channel pointers. A `pluginVersions` entry overrides the shared `portVersion`; remove or advance those overrides when publishing a later adapter-wide release. `sourceRefs` can override the baseline `sourceCommit` for a changed source; `sources.json` always records its exact bundle hash. Optional per-plugin channel overrides can be set under `channels` in the config.

Each ZIP contains its Next manifest and compiled script. The index records the exact byte size, SHA-256, absolute HTTPS URL and required dependencies. Builds are deterministic. `.build/` holds regenerated scripts for local tests and is not published. Original plugin credits and available licence notices are included in the ZIPs. `sources.json` records the exact original source hashes and versions used for each build.

Validation covers all package checksums/manifests, all script expressions, all 21 packaged ports with real React and Next's actual patcher, native theme registration, per-plugin actions, combined-plugin hooks, patch teardown, storage persistence, commands, timers and failure cleanup. Discord and React Native modules are simulated. It is not an on-device compatibility claim for all features or for a particular One UI/Android version. The native patcher fixture is pinned and credited in `tests/vendor/next-patcher/SOURCE.json`.

Format and API references: [Revenge publishing guide](https://revenge.palmdevs.me/docs/plugin-development/getting-started/publishing-your-plugin/), [Plugin API](https://revenge.palmdevs.me/docs/plugin-development/api-reference/plugin-api/), [official Next source](https://github.com/revenge-mod/revenge-bundle-next), [Themes API source](https://github.com/revenge-mod/revenge-community-plugins/tree/main/plugins/api.themes).
