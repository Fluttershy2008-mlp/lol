# Fluttershy's Valenced plugins

Paste this exact URL into Valenced's **Repository URL** field:

```text
https://fluttershy2008-mlp.github.io/lol/valenced/index.json
```

Tap **Add repository**, open **Browse Plugins**, install the plugins you want, then fully restart Discord.

**Friends List and Blocked User List 1.0.0-beta4 fix profile opening.** Refresh the repository, update and enable both plugins, then force-close Discord and reopen it. Their entries remain in the existing **Valenced section of Settings**, alongside CustomRPC, More Alts!, Server Leaver and the core Valenced entries. Tap a friend, a blocked user's card or its **Profile** button to open Discord's native profile.

InfoCommands remains at **1.0.0-beta5**; CustomRPC, More Alts!, Server Leaver, Copy User ID, Addon List and Valid User at **1.0.0-beta3**; AutoText and the remaining ports at **1.0.0-beta2**. The repository URL stays the same.

Raw GitHub fallback, serving the same catalogue:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/valenced/index.json
```

Use an address ending in `index.json`. A GitHub repository page or a `github.com/.../blob/...` page returns HTML and causes the JSON error shown in your screenshot.

## Included

All **21 unique Revenge plugins** are included. InfoCommands is at **1.0.0-beta5**. Friends List and Blocked User List are at **1.0.0-beta4**. CustomRPC, More Alts!, Server Leaver, Copy User ID, Addon List and Valid User are at **1.0.0-beta3**. The other ports are at **1.0.0-beta2**:

| Plugin | Plugin | Plugin |
| --- | --- | --- |
| Addon List | AutoText | Blocked User List |
| Copy User ID | Custom RPC | Expression Cloner |
| Friends List | Hide Blocked and Ignored Messages | InfoCommands |
| Message Logger | More Alts | Nitro Auto Claim |
| Ping Jumper | Profile Status Presets | Read All Notifications |
| Relationship Notifier | Save as Sticker | Server Leaver |
| Stealmoji | Valid User | View Icons |

Four native colour themes are included: Fluttershy, Rainbow Dash, Sunset Shimmer and Tokyo Nights. Keep **Valenced Community Plugins** available so the `valenced.api.themes` dependency can be installed.

`message-logger-v2` duplicates Message Logger. The root Classic bundle duplicates Save as Sticker. The three Classic background companions are replaced by their native themes. No duplicate plugin installation is needed.

## Requested fixes

**Friends List and Blocked User List beta4:** both now use the shared profile resolver already used by Valid User and InfoCommands. It resolves anonymous default exports by imported path or namespace markers, or selectively initializes the native opener on the first tap, and opens with `stack`. Profile actions preserve the exact user ID and recheck the active plugin session and signed-in account before opening. Stale callbacks and late failures after disabling or switching accounts stay inactive. Opening a profile does not block, unblock or alter a friendship.

**Five native settings entries (since beta3):** Blocked User List, CustomRPC, Friends List, More Alts! and Server Leaver use Valenced's native `registerSettingsItem` and `addSettingsItemToSection` APIs. The route is registered before its row is added to `VALENCED`. Settings loading can happen after plugin startup; pending callbacks are cancelled on disable. Disabling one plugin removes only its own row and route. Cached pages stop rendering that plugin after disable. The regular settings button on the Plugins page remains available.

The helper in `settings-shortcut.cjs` is bundled only into those five packages. The profile fix retains this helper and the common Valenced runtime. Only the two list plugins receive new packages; all older ZIPs and other current plugin/theme artifacts are preserved. The shared source also ships as Friends List 1.0.3 and Blocked User List 1.3.3 for Classic, and beta5 for both Next ports.

**InfoCommands beta5** fixes Close on the themed Server Info panel. Close text, its surrounding touch target, Android Back and the backdrop now update the panel's own visibility, so it disappears even when native alert dismissal is delayed or fails. Retained host entries are removed by exact ownership without clearing other alerts. Unique keys prevent an old dismissal from closing a reopened panel. Data listeners/timers and old profile/copy actions are released or disabled on close. The beta4 layout is retained.

**InfoCommands beta4** replaces the default white Android Server Info dialog with a themed bottom panel matching the supplied screenshots. It shows the banner, server icon/name, member/online/role/channel counts, boosts, owner/avatar, creation date, server ID and cached friends. The whole panel scrolls, including on short windows. ID copying stays local; owner/friend rows close the panel before opening the correct profile. Close, the backdrop and Android Back dismiss it. It uses Valenced's React alert host and React Native Modal, rather than the lazy sheet that previously failed to appear. An emergency OS dialog remains available if the custom panel cannot be shown. Other plugin artifacts are unchanged.

**Copy User ID beta3** attaches to `modules/user_profile/native/UserProfileOverflowMenu.tsx` through Valenced's imported-path API. It no longer depends on the component's function name or a one-minute discovery window. Open a profile, tap **⋯**, and use the row showing **Copy User ID** and the full ID. Tapping copies `<@ID>` locally. Existing English native copy-ID rows are upgraded instead of duplicated; other menu actions and frozen groups are preserved. Function, memo, forward-ref, nested and class exports are covered. Message long-press support is retained. All other previously published plugin artifacts are unchanged by this update.

**Addon List beta3** fixes `Local commands are unavailable on this Discord version` at startup. Following Valenced's community command library, it subscribes to `getBuiltInCommands` and registers `/plugin-list` and `/theme-list` when Discord loads that module. It does not poll or force unrelated modules to initialize. Settings can copy plugin and theme lists immediately, including on builds without command discovery. Pending subscriptions, commands and queued callbacks are cancelled or invalidated when stopped.

Beta3 fixes **View Owner Profile** and Valid User's **Open profile**. Both actions now resolve Discord's default profile-opener export by imported path or its namespace markers. If the opener is still unloaded, they use Valenced's dependency fingerprint to initialize that module on demand. This follows Valenced's own profile action and opens with `stack`. The native result-dialog button, settings button and rich-sheet profile rows use the same resolver. AutoText's beta2 artifact is unchanged.

- **InfoCommands:** finds the server menu by its imported path and opens the themed panel on Valenced. It renders cached details immediately, then refreshes them in the background. There is also an **Open current server info** button in the plugin's settings. User information commands keep local output local.
- **AutoText:** patches `modules/chat_input/native/ChatInput.tsx` through Valenced's imported-path API. The guard only renders a child component; it does not expose the full input tree. The new hook sees the floating input, native events and real composer reference. It keeps waiting when the input loads after thirty seconds. Native commands also resolve by imported path. Function, memo, forwardRef and nested exports remain supported. Auto-send remains opt-in.
- **Valid User:** selects the nested `HTTP` client before generic `get/post/del` matches. `TrackedHTTPUtils` exposes those methods too, but requires tracking arguments and cannot serve as a general REST client. User lookups use `oldFormErrors` and fail immediately when rate-limited, so a queued request is not mistaken for a connection timeout. Missing users, denied access, malformed responses and timeouts keep distinct outcomes. The plugin never creates a user when Discord cannot supply one.
- **All ports:** use `valenced.api`, Valenced's native registry, separate plugin storage and cleanup of patches, listeners, timers and pending requests.

The first release does not import Classic Revenge or Revenge Next settings automatically.

## Validation

Automated checks cover every plugin's startup, settings, shutdown and restart, all ports running together, native menus, commands and ZIP metadata. Three new fixtures fail against beta1 and pass against beta2: a tracked HTTP wrapper preceding the canonical client, a separately rendered unnamed chat input, and a late server menu that must open native details. The lookup fixture now checks namespace exports before default exports, matching Valenced's finder.

The fixture uses Valenced's actual patcher sources pinned in `tests/vendor/valenced-patcher/SOURCE.json`. Plugins evaluate with the same lexical `valenced` parameter used by the upstream loader; no global Valenced or Vendetta object is required. The old rich-sheet tests continue to run for Revenge Next. Valenced's native panel tests use a React alert-host fixture that mounts and unmounts real component trees.

The beta3 profile fixtures fail against beta2 and pass against beta3. They cover the first profile opened in a session, anonymous default exports, the native result dialog, preserved owner/server IDs, and cancellation after stopping a plugin. The cold-module fixture also checks that an unrelated module is not initialized.

Six Addon List regressions fail against its beta2 package and pass against beta3: startup and settings copy before commands load, command loading after a minute, stop/restart without duplicates, a queued callback after stop, imported-path fallback, and settings copy without command discovery. Both plugin/theme copies and command execution use the native registry. The Classic source fixture includes the native Android toast API used by the existing compatibility guard.

Ten Copy User ID profile regressions fail against beta2 and pass against beta3. They cover unnamed imported exports in five component forms, loading after two minutes, upgrading the existing copy row, per-user/bot callbacks, rejecting unrelated IDs, restoring hooks on stop/restart, and cancelling queued callbacks. Shared message-menu and Classic source tests continue to run.

Ten Server Info panel regressions fail against InfoCommands beta3 and pass against beta4. They cover the banner/icon/rows with a stalled network request, ID copying, light/dark appearance, a short window, owner and friend profiles, Back/backdrop/reopen, unavailable-server errors, and cancellation of queued and already-open actions on stop. The imported server-menu and settings entry points are also exercised. Closing the panel removes its listeners and data timers.

Five additional dismissal regressions fail against beta4 and pass against beta5. They cover retained and throwing native dismissal, direct text presses, delayed removal for Close/Back/backdrop, preserved unrelated alerts, stale Close callbacks, cleanup and reopening with distinct host keys.

Twelve native-settings checks cover all five real settings pages, coexistence with core settings, independent stop/restart for every entry, delayed settings loading, queued callback cancellation, cached pages, insertion rollback, asynchronous startup cancellation and startup failure. Package checks verify that the shortcut helper appears only in the five selected plugins and that its source hash matches the recorded metadata. The new Blocked User List page and coexistence checks fail against its beta2 package and pass against beta3.

Fourteen list-profile checks open the actual pages through their Valenced settings entries and cover cold, imported and namespace-only anonymous profile openers, exact string IDs, both blocked-user controls, unchanged relationships, no startup profile loading, independent stop/restart, account switches and late request failures. The six opener-discovery cases fail against both lists' beta3 packages and pass against beta4. No unrelated Metro factory is initialized.

The settings API and section key were checked against the build shown in the supplied screenshot, [Valenced d3e17fe](https://github.com/Valenced/valenced/blob/d3e17fe0416c3dc5f4b4d783b465eeb4a99caec1/bundle/lib/discord/src/modules/settings/index.ts), including its [VALENCED section registration](https://github.com/Valenced/valenced/blob/d3e17fe0416c3dc5f4b4d783b465eeb4a99caec1/bundle/src/plugins/start/settings/register.tsx).

These are preview ports. Automated fixtures cannot verify the Discord UI on your physical Android device. Some Discord versions can change internal menus or composer layouts. Valid User can only show accounts Discord makes available to your session; an inaccessible or nonexistent ID cannot be resolved by a plugin.

Build and validate with Node 24 and Python 3:

```sh
npm ci --ignore-scripts --no-audit --no-fund --prefix revenge-next
python3 valenced/build.py --check
PLUGIN_TEST_TARGET=valenced node --test revenge-next/tests/plugins.test.cjs valenced/tests/*.test.cjs
PLUGIN_TEST_TARGET=valenced node --test --test-skip-pattern=InfoCommands revenge-next/tests/features.test.cjs
node --test compatibility/user-profile.test.mjs friends-list/tests/*.test.mjs blocked-user-list/tests/*.test.mjs addonList/tests/*.test.mjs copy-user-id/tests/*.test.mjs info-commands/tests/*.test.mjs valid-user/tests/*.test.mjs
python3 -m unittest discover -s valenced/tests -p 'test_*.py'
```

The Valenced catalogue lives under `/valenced/index.json`. The existing root catalogue continues to serve Revenge Next.

The imported-path API and lifecycle were checked against [Valenced 1.2.1](https://github.com/Valenced/valenced/tree/706dae437058922a10246a1df0a614328db79a5c/bundle). Valenced's [Silent Typing plugin](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/silent-typing/index.tsx) uses the same imported-path API for chat controls.

The profile lookup follows Valenced's [profile action](https://github.com/Valenced/valenced/blob/706dae437058922a10246a1df0a614328db79a5c/bundle/src/plugins/start/settings.plugins/utils/contacts.ts). The shared implementation is in `compatibility/user-profile.mjs`.

Deferred command discovery follows the community library's [module subscriptions](https://github.com/Valenced/valenced-community-plugins/blob/faac957ba3e982e9bca6bc9778067224c82e8b56/plugins/cocos-command-lib/js/modules.ts) and [command registration](https://github.com/Valenced/valenced-community-plugins/blob/faac957ba3e982e9bca6bc9778067224c82e8b56/plugins/cocos-command-lib/js/commands.ts).
