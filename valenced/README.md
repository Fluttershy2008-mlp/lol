# Fluttershy's Valenced plugins

Paste this exact URL into Valenced's **Repository URL** field:

```text
https://fluttershy2008-mlp.github.io/lol/valenced/index.json
```

Tap **Add repository**, open **Browse Plugins**, install the plugins you want, then fully restart Discord.

**Altitude 1.0.0-beta3** adds the selected wallpaper behind **Settings**, including the overview and theme picker. Update Altitude and fully restart Discord. It retains beta2's clear backgrounds, the **Altitude · Lexend Deca** font pack and your background preferences. If needed, **Themes → Colors → Background → Reset** follows the theme defaults (full opacity, blur 0). [Altitude setup, backgrounds and differences from Aliucord](themes/altitude/README.md).

**Server Leaver 1.0.0-beta6 separates ID editing from the scrolling preview.** Tap **Edit protected IDs** to open the bounded editor; Save closes it and Cancel or Android Back discards unsaved changes. Protect updates rows in place without an editable ID field in the list. All 22 main IDs stay protected and existing additional protections remain scoped to their account. Refresh the repository, update Server Leaver and fully restart Discord.

**More Alts! 1.0.0-beta11 introduces an experimental WebView view-only fallback.** The previous beta10 error can occur when Discord registers `RNCWebView` as an Android view but does not expose `RNCWebViewModule`. The new QR loader probes that view and can render the local, CSP-restricted QR document directly without the separate module. This does not install a WebView. If the view itself is absent, real QR login remains unavailable. The existing password and native sign-in alternatives are retained. Back up your active sign-in and update from your existing repository. Physical-device QR approval is not yet verified.

**More Alts! 1.0.0-beta10 attempts Valenced's native WebView lookup before reporting a missing module.** The compatibility adapter now passes Valenced's actual module API to the QR loader. This can resolve Android WebView modules hidden from React Native's legacy `NativeModules` export. If the Discord build contains no registered WebView, QR login will still be unavailable; no JavaScript plugin can install that native component. The Discord-style login panel, email/password fallback, and saved accounts remain unchanged. Previous release: **More Alts! 1.0.0-beta9 redesigns Add another account to match Discord's web login.** The email/password form and QR sign-in panel appear side-by-side on wide screens and stack on phones. Tap **Log in with QR Code** to request a real, fresh sign-in code. It cannot create or import a real QR session on Android builds that omit the native `RNCWebView` module; the screen now explains that limitation instead of promising that restarting will fix it. Email/password and **Use Discord’s normal sign-in** remain available; the latter requires returning to More Alts and saving the active account. Refresh this repository and update the plugin after the release is merged. Existing saved accounts are preserved.

**ExpressionCloner 1.0.0-beta3 fixes sticker upload discovery.** Refresh the repository, update ExpressionCloner, then force-close and reopen Discord. It resolves a late-loaded native uploader when you clone and uses a multipart request through Discord's signed-in HTTP client when the old module is absent. Mobile uploads use a temporary local file, cleaned up afterward. Failed creation requests are not retried automatically.

**Friends List and Blocked User List 1.0.0-beta4 fix profile opening.** Refresh the repository, update and enable both plugins, then force-close Discord and reopen it. Their entries remain in the existing **Valenced section of Settings**, alongside CustomRPC, More Alts!, Server Leaver and the core Valenced entries. Tap a friend, a blocked user's card or its **Profile** button to open Discord's native profile.

InfoCommands remains at **1.0.0-beta5**; SaveAsSticker at **1.0.0-beta4** and Stealmoji at **1.0.0-beta6**; CustomRPC, ExpressionCloner, Copy User ID, Addon List and Valid User at **1.0.0-beta3**; AutoText and the remaining ports at **1.0.0-beta2**. The repository URL stays the same.

Raw GitHub fallback, serving the same catalogue:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/valenced/index.json
```

Use an address ending in `index.json`. A GitHub repository page or a `github.com/.../blob/...` page returns HTML and causes the JSON error shown in your screenshot.

**SaveAsSticker 1.0.0-beta4 and Stealmoji 1.0.0-beta6 address cropping, scrolling, upload confirmation and picker presentation.** SaveAsSticker can fit PNG/JPEG into a 320×320 transparent PNG without Discord's cropper. SaveAsSticker uses its bounded modal; Stealmoji now opens a normal Valenced page with no alert/modal host. Both retain search and one virtualized server list. Uploads accept text/nested/Fetch responses and verify an empty success response against a newly created server entry, without repeating the POST. Stealmoji now closes after successful upload/copy/save, keeps Close available while busy and bounds stalled operations. Refresh the repository, update both plugins and fully restart Discord.

## Included

All **21 unique Revenge plugins** are included. More Alts! is at **1.0.0-beta8** and InfoCommands at **1.0.0-beta5**. Server Leaver is at **1.0.0-beta6**. Friends List and Blocked User List are at **1.0.0-beta4**. SaveAsSticker is at **1.0.0-beta4** and Stealmoji at **1.0.0-beta6**. CustomRPC, ExpressionCloner, Copy User ID, Addon List and Valid User are at **1.0.0-beta3**. The other ports are at **1.0.0-beta2**:

| Plugin | Plugin | Plugin |
| --- | --- | --- |
| Addon List | AutoText | Blocked User List |
| Copy User ID | Custom RPC | Expression Cloner |
| Friends List | Hide Blocked and Ignored Messages | InfoCommands |
| Message Logger | More Alts | Nitro Auto Claim |
| Ping Jumper | Profile Status Presets | Read All Notifications |
| Relationship Notifier | Save as Sticker | Server Leaver |
| Stealmoji | Valid User | View Icons |

Five native theme plugins are included: Altitude (High and Low), Fluttershy, Rainbow Dash, Sunset Shimmer and Tokyo Nights. Keep **Valenced Community Plugins** available so the `valenced.api.themes` dependency can be installed.

`message-logger-v2` duplicates Message Logger. The root Classic bundle duplicates Save as Sticker. The three Classic background companions are replaced by their native themes. No duplicate plugin installation is needed.

## Requested fixes

**More Alts! beta7:** ships its Android browser wrapper and binds it to React Native’s native view, command dispatcher and callable messaging APIs. The Android path no longer depends on finding Discord’s WebView JS package or matching its dependency graph. Existing native view registration is reused; plugin-owned messaging names and callback cleanup preserve other handlers. The QR HTML, secure crypto and approval verification remain unchanged. The same source ships as Classic 3.1.7 and Next beta8.

**More Alts! beta6:** fixes two upstream-only assumptions in beta5: Discord’s fork requests `RNCWebView` instead of `RNCWebViewModule` and imports BatchedBridge instead of EventEmitter. Both native aliases and messaging layouts are supported, including a cold BatchedBridge wrapper. A unique full dependency match is still required. The SDK owns its component and messaging callbacks; the plugin does not replace either. A remaining lookup failure includes a short stage code without account or QR data. The same source ships as Classic 3.1.6 and Next beta7.

**More Alts! beta5:** handles a browser package that is still uninitialized on the first QR click. It verifies the native browser bridge and a unique SDK dependency graph using Valenced's metadata API, then initializes that module on demand. Metadata inspection does not execute factories; ambiguous or incomplete matches remain inactive. Current and older bridge import layouts, compiled commands and minified codegen helpers are covered. An already loaded component is preferred, and a failed initialization is not repeatedly executed. The previous rendering boundary, Back/Close, QR approval verification and account storage remain intact. The same source ships as Classic 3.1.5 and Next beta6.

**More Alts! beta4:** replaces the ambiguous `WebView` property search with imported-path and validated package/platform discovery. Translation exports are never used as the QR browser. Validation handles memo/forward-ref components without invoking them, and does not initialize unrelated Metro factories. Unexpected browser render failures are contained inside the QR dialog and cancel the attempt; Back, Close and Refresh remain usable. Failed exports are excluded until plugin restart, and an available replacement can be selected immediately. The QR protocol and account storage are unchanged. The same source ships as Classic 3.1.4 and Next beta5.

**ExpressionCloner beta3:** looks up `createGuildSticker` at clone time and does not require `fetchSticker` or `updateGuildSticker` on the same export. When unavailable, it posts multipart data to `/guilds/{guild.id}/stickers` through the canonical signed-in HTTP client. PNG/APNG/GIF uploads retain their format and use an owned local cache file on mobile. Cleanup runs after success, failure and cancellation. Duplicate confirmations are suppressed; a failed or unconfirmed POST never causes a second creation request. Plugin/account checks and a final permission/slot check precede creation. The same source ships as Classic 1.1.3 and Next beta5; all other packages are unchanged.

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

Seventeen ExpressionCloner cases exercise the complete sticker clone flow on both Valenced and Next: late standalone upload actions, no old action module, PNG/APNG/GIF multipart uploads, canonical HTTP selection, local URI/file cleanup, failures without retries, unconfirmed responses, duplicate confirmations, cancellation, account changes, stale prompts, permission loss, oversized files, Lottie metadata and browser FormData. The four discovery cases fail against Valenced beta2 and pass against beta3. [Implementation and source references](../expression-cloner/README.md#113--valenced-beta3--next-beta5).

Twelve More Alts QR integration cases exercise the actual native dialog, browser selection, approved-account verification, refresh, cancellation and local error recovery. The translation-function fixture reproduces the exact `{locale, ast}` crash against beta3 and passes against beta4. Nine new resolver cases cover package/platform shapes, imported-path priority, initialized-only scanning, immediate discovery after a miss and failed-export invalidation. Existing credential, MFA, storage and real-crypto QR protocol tests still run. CI builds the deterministic QR asset before these source tests. [More Alts details and primary references](../more-alts/README.md#qr-rendering-fix-314--valenced-beta4--next-beta5).

Seven more native QR cases bring the suite to nineteen on each host. They cover initially unloaded browser packages with both bridge layouts and compiled/minified commands, verified approval after loading, preferring an existing component, an opaque platform export and an initialization failure. The two fully unloaded cases fail against beta4 and pass against beta5, without initializing the unrelated native-component fixture. Ten source checks cover native commands, initialized view descriptors, missing support, incomplete/ambiguous graphs and bounded retry behavior. All 78 More Alts source tests pass. [Loading details and primary references](../more-alts/README.md#qr-browser-loading-315--valenced-beta5--next-beta6).

The settings API and section key were checked against the build shown in the supplied screenshot, [Valenced d3e17fe](https://github.com/Valenced/valenced/blob/d3e17fe0416c3dc5f4b4d783b465eeb4a99caec1/bundle/lib/discord/src/modules/settings/index.ts), including its [VALENCED section registration](https://github.com/Valenced/valenced/blob/d3e17fe0416c3dc5f4b4d783b465eeb4a99caec1/bundle/src/plugins/start/settings/register.tsx).

These are preview ports. Automated fixtures cannot verify the Discord UI on your physical Android device. Some Discord versions can change internal menus or composer layouts. Valid User can only show accounts Discord makes available to your session; an inaccessible or nonexistent ID cannot be resolved by a plugin.

Build and validate with Node 24 and Python 3:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund --prefix revenge-next
node save-as-sticker/build.mjs
node stealmoji/build.mjs
python3 valenced/build.py --check
PLUGIN_TEST_TARGET=valenced node --test revenge-next/tests/plugins.test.cjs valenced/tests/*.test.cjs
PLUGIN_TEST_TARGET=valenced node --test --test-skip-pattern=InfoCommands revenge-next/tests/features.test.cjs
node more-alts/build.mjs
node --test compatibility/expression-upload.test.mjs save-as-sticker/tests/*.test.mjs stealmoji/tests/*.test.mjs compatibility/user-profile.test.mjs more-alts/tests/*.test.mjs friends-list/tests/*.test.mjs blocked-user-list/tests/*.test.mjs addonList/tests/*.test.mjs copy-user-id/tests/*.test.mjs info-commands/tests/*.test.mjs valid-user/tests/*.test.mjs
python3 -m unittest discover -s valenced/tests -p 'test_*.py'
```

The Valenced catalogue lives under `/valenced/index.json`. The existing root catalogue continues to serve Revenge Next.

The imported-path API and lifecycle were checked against [Valenced 1.2.1](https://github.com/Valenced/valenced/tree/706dae437058922a10246a1df0a614328db79a5c/bundle). Valenced's [Silent Typing plugin](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/silent-typing/index.tsx) uses the same imported-path API for chat controls.

The profile lookup follows Valenced's [profile action](https://github.com/Valenced/valenced/blob/706dae437058922a10246a1df0a614328db79a5c/bundle/src/plugins/start/settings.plugins/utils/contacts.ts). The shared implementation is in `compatibility/user-profile.mjs`.

Deferred command discovery follows the community library's [module subscriptions](https://github.com/Valenced/valenced-community-plugins/blob/faac957ba3e982e9bca6bc9778067224c82e8b56/plugins/cocos-command-lib/js/modules.ts) and [command registration](https://github.com/Valenced/valenced-community-plugins/blob/faac957ba3e982e9bca6bc9778067224c82e8b56/plugins/cocos-command-lib/js/commands.ts).

Four more native QR checks run Discord’s actual pinned WebView component, shared hook and native spec, deriving the graph from its compiled imports. All four fail against beta5 and pass against beta6. They cover loaded/cold callable bridges, native-message approval, external-navigation rejection, Close, Refresh and stale callbacks. The suite now has 23 QR cases per host and 84 More Alts source/protocol checks; six new source cases isolate native-name and messaging differences. Physical phone verification remains pending. [Fork sources and details](../more-alts/README.md#discord-webview-fork-316--valenced-beta6--next-beta7).

Seven more native QR checks run with no Discord WebView JavaScript package or usable dependency metadata. They fail against beta6 and pass against beta7, covering legacy/bridgeless messaging, commands, Close, refresh, stop, stale callbacks and an existing native view. One runs the exact HTML through a real RSA handshake and QR SVG generation against a simulated Discord service, then verifies and saves the approved account through the native SDK callback. There are now 30 QR cases per host and 91 More Alts source/protocol checks. Phone verification remains pending. [Bundled browser details](../more-alts/README.md#bundled-android-qr-browser-317--valenced-beta7--next-beta8).

Server Leaver beta4 protects the exact 22 main ID strings in both preview and the final per-request check, even if the stored list or a supplied plan omits them. Other saved protections survive the update. The field restores main IDs on save; main rows cannot be unprotected. Unknown additional IDs still block leaving until corrected. Twenty-eight source/runtime checks and three native-page cases per host cover defaults, account isolation, existing data, absent main guilds, confirmation and a simulated queue that leaves only an unprotected server. The existing Valenced settings entry is retained. Classic receives 1.0.3 and Next beta5. [Main protected list and details](../server-leaver/README.md#main-protected-list).

### Server Leaver beta5 — stable scrolling

Protect and Remove protection now update a server in place in name order. The ID editor stays 160 points tall rather than growing the header as IDs are added, and these actions dismiss any focused keyboard. Guild/theme subscriptions replace the 1.2-second refresh timer; manual Refresh and live queue progress remain available. Native Android clipping is disabled for this FlatList. Three new regression cases fail against beta4 and pass against beta5, covering a long preview, editor size/identity/focus, idle updates and store cleanup. Together with the existing main-ID checks, six native cases pass per host and all 28 source/runtime checks still pass. Actual Android touch scrolling remains to be verified on a device. Classic receives 1.0.4 and Next beta6.

### More Alts beta8 — QR panel and public messaging

The QR panel has a square white code, the Discord-style heading and scan instructions, and native live approval status. No uploaded QR image is reused. The bundled browser prefers RN’s public registerCallableModule API before the existing bridge-global fallbacks. Missing-browser errors include the installed plugin version. Three added native cases fail on beta7 and pass on beta8, covering public-only registration through approved-account saving, the panel/status/Back flow and version diagnostics. There are 33 QR cases per host and 92 More Alts source/protocol checks. Physical login remains unverified. Classic receives 3.1.8 and Next beta9. [Details and primary sources](../more-alts/README.md#qr-panel-and-public-rn-messaging-318--valenced-beta8--next-beta9).

### SaveAsSticker and Stealmoji beta3 — upload fallbacks

A shared helper resolves native actions at submission time and uses canonical authenticated HTTP when an action is missing. Stickers retain their prepared PNG/GIF local file in native multipart; emoji retain their image data in JSON. Native file APIs include the curated FileModule. No POST is retried through a second route. REST success requires a returned ID; account/session, permissions and slots are checked before creation. Both pickers respect Discord’s theme. Nineteen native cases per host cover the full menus/pickers, upload bytes, JPEG cropping, cleanup, late actions, rate limits, unconfirmed responses, account changes, permission loss, repeated taps and theme contrast. Four missing-action cases fail against beta2 and pass against beta3. Twelve helper contract checks and existing source/GIF tests also run. The Classic fixtures now expose the Android toast API used by their compatibility wrapper. Physical phone upload remains unverified; the optional Hermes test requires HERMES_BINARY. Classic receives SaveAsSticker 1.3.5 and Stealmoji 2.1.4; Next receives beta5 for both.

### SaveAsSticker/Stealmoji beta4 and Server Leaver beta6

SaveAsSticker bundles PNG/JPEG decoding, EXIF rotation and aspect-preserving 320×320 fitting when native cropping is absent or fails to open. PNG inflation and decoded dimensions are bounded. Private dependency text codecs avoid relying on browser TextEncoder/TextDecoder or installing global polyfills. GIF conversion and local-file cleanup remain covered. Both expression pickers own one native modal/list instead of nesting a scrolling list inside a draggable action sheet. Close/Back/backdrop/disable/reopen remain functional even with a retaining or throwing alert host. Upload confirmation unwraps JSON strings, data envelopes, promises and Fetch responses. A successful empty REST result is checked against a before/after list of IDs, requiring one new matching entry. Existing or ambiguous matches cannot report success, and no POST is retried.

Server Leaver uses a separate protected-ID modal so tapping Protect cannot alter or focus a text input in the scrolling preview. Save, Cancel, Android Back and account switches close it correctly. The 22 main IDs and existing account protections are unchanged.

Validation: **851 Node checks passed, one optional Hermes check skipped, and 16 Python checks passed**. Deterministic package checks cover both 25-entry catalogues. The expression suite now has 38 native cases per host, including real PNG/JPEG output without native cropping or browser codecs, 196-server lists, response variants and dismissal/reopening. Six Server Leaver cases per host cover the editor and protection behavior. These are simulated native hosts, not physical phone verification. Classic releases are SaveAsSticker 1.3.6, Stealmoji 2.1.5 and Server Leaver 1.0.5; Next releases are beta6, beta6 and beta7 respectively.

Seven selected cropping/response/picker/editor scenarios fail against each host's preceding published packages and pass against these builds. The scroll checks verify structure and component identity; they do not simulate Android touch physics.

### Stealmoji beta5 — cleanup after copying/uploading

The picker now closes after a confirmed upload or successful clipboard/save action instead of rebuilding its server list and keeping a modal window active. Its owned alert entry is removed even when native dismissal retains it or throws; unrelated alerts remain untouched. Close stays enabled while busy. Preparation is cancelled on dismissal, but a write already handed to Discord retains the single-request guard until completion or the 45-second deadline. A pending request shows an in-progress message instead of silently ignoring a server row. Clipboard/save actions have a 15-second deadline. Late results cannot affect a reopened picker. The native image viewer opens after picker dismissal and queued presentation is cancelled on disable, account change or another picker opening.

Fourteen new integration scenarios run on each host and fail against its preceding published Stealmoji package. Two additional source checks cover aborting image downloads and clearing their deadlines. The full run passes **881 Node checks and 16 Python checks**, with one optional Hermes check skipped; both deterministic catalogue checks pass. Physical phone behavior remains unverified. Only Stealmoji receives a new package: Valenced beta5, Next beta7 and Classic 2.1.6. Other current artifacts and all previous ZIPs are preserved.

### Stealmoji beta6 — normal Valenced page

The picker now uses Valenced's registered settings/navigation page instead of nesting an RN Modal inside Discord's alert system. It makes no picker alert/Modal/second-sheet call on Valenced, including when navigation is missing. Search, the server list, name editing, copying, saving and upload safeguards are retained. Successful actions and Close go back only when the current route carries this opening's marker. Android Back and external navigation deactivate the picker, and late responses cannot pop another screen. A cached closed page exits when focused again. Queued openings are cancelled on stop; cold registration and a page that never mounts are bounded. Plugin settings remain usable if navigation cannot open.

Nine new page-flow cases fail against beta5 and pass with this release; one additional test keeps a page mounted while it loses and regains focus. Both old upload/cancellation checks and the ordinary-page checks pass. The complete suite passes 890 Node checks and 16 Python checks, with one optional unrelated Hermes test skipped; both 25-entry deterministic checks pass. Physical device input behavior remains unverified. Only Stealmoji receives new packages: Valenced beta6, Next beta8 and Classic 2.1.7. Other current artifacts and all older archives remain unchanged. [Details and source references](../stealmoji/README.md#valenced-page-picker-in-217).
