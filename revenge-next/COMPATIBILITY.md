# Revenge Next compatibility audit: InfoCommands beta6 / other ports beta4

All **21 plugin ports** pass the dedicated automated Next suite. Every port is started, mounted with real React, unmounted, stopped and restarted; tests check that timers, AppState subscriptions and store/Flux listeners are released. All 21 are also started together with curated menu APIs and split HTTP exports, then stopped in a different order. This is an automated simulation, **not confirmation from a physical Android device**.

The suite uses React 19.2.0 and the actual Revenge Next `instead` patcher from [`fa6cb81897b3b2649e7d8600d70d2b945daf041f`](https://github.com/revenge-mod/revenge-bundle-next/tree/fa6cb81897b3b2649e7d8600d70d2b945daf041f). Discord stores, React Native views, REST, downloads, account sessions and native modules are fixtures. Tests never use real credentials, redeem gifts, leave real servers, post messages or upload files.

## Per-plugin coverage

All rows below pass automated checks in addition to the lifecycle/settings checks above.

| Plugin | Feature checked in the packaged Next port | Still needs a phone |
| --- | --- | --- |
| Addon List | Read current native response envelopes, copy installed metadata and repository URLs, surface errors; no public send during copy | Native registry on the installed client; public sends and long-list confirmation |
| AutoText | Save a phrase, expand it in the practice editor, copy the draft | Live composer connection, native text insertion and auto-send |
| Blocked User List | Render blocked users; confirm before a simulated unblock | Live relationship updates and local APP/webhook filtering |
| Copy User ID | Inject a lazy message-menu row and copy the exact mention | Current Discord message/profile menu layouts |
| CustomRPC | Edit, apply and stop an activity through Flux | Activity visibility on another account and image assets |
| ExpressionCloner | Inject Clone Sticker; open server picker with working row icons | Emoji/sticker uploads and permission/slot handling on real servers |
| Friends List | Search and open a cached user's profile | Live profile sheet and relationship-store variants |
| HideBlockedAndIgnoredMessages | Filter blocked/ignored authors without deleting source records; restore on stop | Native message collections, pagination and reply layouts |
| InfoCommands | Late guild-menu initialization; immutable context/lazy menus; memo, forwardRef and nested class components; correct guild per opening; no duplicate row; curated native popup selection; deferred opening; sheet render, native scroll, ID copy and close; native fallback for void/no-layout/failed presentation; stale actions/subscriptions cleaned up; local user info output | Current Discord menu layouts, native sheet presentation and real user/invite/server responses |
| Message Logger | Retain a cached deletion; open the channel's history via a registered Next route | Native message normalization, edit history and retention limits |
| More Alts! | Initialize command before opening settings; open Next route; verify and save a simulated current session | Real login, MFA/QR WebView, account switching and Android session persistence |
| Nitro Auto Claim | Simulated redemption using split HTTP; duplicate protection | Real server redemption responses and reconnect behavior |
| PingJumper | Fetch recent mentions and open the correct message URL | Native chat arrows and navigation on the current Discord build |
| Profile Status Presets | Save/apply a preset using split HTTP; command opens Next route | Server persistence, emoji rendering and expiry |
| ReadAllNotificationsButton | `/readall` dispatches native BULK_ACK without direct REST | Real unread/thread collections and floating button placement |
| RelationshipNotifier | Establish a baseline and detect a friend removal | Reconnect/account transitions and real notifications |
| SaveAsSticker | Add image-menu action and render eligible server rows | Native image processing, file handling, GIF conversion and uploads |
| Server Leaver | Keep the 22 main IDs and owned servers; preserve extra IDs and require confirmation before a simulated leave request | Real server updates, cancellation and rate-limit responses |
| Stealmoji | Inject cloning action into a message menu | Picker, CDN downloads and uploads on a real guild |
| ValidUser | Resolve a cached mention and open a native profile action | Uncached lookups, changed message layouts and real access restrictions |
| ViewIcons | Inject avatar action and open native media | Current profile/server menus, decorations and image downloads |

The four native theme packages also pass registration, color/background and package checks. They remain at beta1 because this update changes InfoCommands only.

## InfoCommands beta6

- Prefer Next's curated `ActionSheetActionCreators` and Design components over ambiguous raw property matches. Resolve the native actions again when the button is tapped.
- Open on the next event-loop turn after the floating menu handler finishes dismissing, with explicit native stacking behavior.
- Track each opening until it renders a positive-size layout. Discord's `openLazy` returns void, so the old successful-call check could leave an invisible sheet marked as open indefinitely.
- After 1.5 seconds without a visible layout, or an opening/rendering failure, hide the failed sheet and show a native Android details popup. Use the selected guild's cached data immediately when available; otherwise retain the bounded guild request and display any unavailable-data error visibly.
- Keep Copy Server ID and View Owner Profile in the fallback. Cancel pending work on dismissal, disable or replacement; ignore late components from failed openings. Native dismissal callbacks cannot cancel the replacement popup.

Four new regressions failed against beta5: an ambiguous raw sheet module, a void opener that never mounts, a zero-height sheet, and a rendering exception. A further regression covers a sheet dismissed before its first layout. The release passes **86 Next runtime/integration tests**, **21 InfoCommands Classic tests**, **10 Python package tests**, and the deterministic package check. Tests now cover presentation failure rather than treating an `openLazy` invocation as proof of a visible popup. They still simulate Discord and React Native; no on-phone verification is claimed.

The shared InfoCommands source and Classic bundle are **1.2.4**, and the Next port is **1.0.0-beta8**. Other packages remain unchanged. The native call contract is checked against the [official Next action-sheet types](https://github.com/revenge-mod/revenge-bundle-next/blob/fa6cb81897b3b2649e7d8600d70d2b945daf041f/lib/discord/src/types/index.ts) and [native module resolver](https://github.com/revenge-mod/revenge-bundle-next/blob/fa6cb81897b3b2649e7d8600d70d2b945daf041f/lib/discord/src/actions.ts).

## InfoCommands beta5

- Subscribe to Next's module initialization so the server-menu button works when Discord loads the menu after plugin startup.
- Clone context-menu items and React elements instead of mutating frozen values. Each lazy opening receives its own component wrapper and guild ID; Discord's cached exports stay unchanged.
- Handle function, memo, forwardRef and nested class menu components, including single-row and grouped layouts. Do not add duplicate Server Info items or inject into user/channel menus.
- Use Next's curated BottomSheetScrollView export. Cancel module subscriptions on stop and ignore stale actions after re-enabling.
- Release InfoCommands separately at **1.0.0-beta5**; keep the other 20 plugin ports at beta4 and retain every previous ZIP.

Five new menu regressions failed against beta4 before the fix. The beta5 suite passed **75 Node runtime/integration tests**, **10 Python package tests**, and **21 InfoCommands Classic tests**. These include pressing the button, rendering cached server details, copying the ID and closing the sheet. The deterministic build check covers all 25 current packages. Physical-device testing is still required.

The shared InfoCommands source and Classic bundle are updated to **1.2.3**. Its Classic fixture now models the existing safe Android toast adapter and checks the returned lazy module instead of expecting Discord's export to be mutated.

## Fixes and checks in beta4

- Unwrap the plugin system's `{ result }` response after the generic native bridge unwraps its transport response. Accept older direct arrays too.
- Surface native error codes and messages instead of incorrectly reporting an empty installed list. Preserve the previous successful registry after a failed refresh.
- Preserve third-party repository links. Do not attach this repository's URL to sideloaded plugins.
- Use `https://fluttershy2008-mlp.github.io/lol/index.json` in setup instructions and new packages. The Pages root and raw URL remain valid aliases.
- Stop hooks, timers and pending adapter fetches immediately. Do not wait for an asynchronous legacy unload before disabling them. Next's subsequent cleanup remains idempotent.
- Include the original `NOTICE` and `THIRD_PARTY_NOTICES.md` files where supplied.
- Audit every published top-level Classic manifest against the Next catalogue or its explicit replacement. Keep the root SaveAsSticker and Message Logger V2 aliases mapped to one package each.

The corrected registry fixture and new shutdown regressions failed before the fixes. Beta4 passes **68 Node runtime/integration tests** and **10 Python package tests**, with no skips. The deterministic build check passes for all 25 current packages.

The native contract was checked against [`lib/plugins/src/_internal/native.ts`](https://github.com/revenge-mod/revenge-bundle-next/blob/fa6cb81897b3b2649e7d8600d70d2b945daf041f/lib/plugins/src/_internal/native.ts), together with the native list and lifecycle implementations at that revision. The tests simulate that contract. They do not run an Android native bridge.

## Catalogue coverage

The 22 published Classic plugin directories become 21 distinct Next ports because Message Logger V2 is an alias. The root SaveAsSticker URL is also an alias. The three wallpaper companion plugins are replaced by native theme packages. Tokyo Nights adds the fourth native theme.

The old source-only fork under `vendetta-plugins/plugins` is not a set of published installs from this repository. Except for Message Logger, those archived sources are outside this catalogue and are not certified for Next. Desktop Vencord plugins are separate from the Android client.

No physical-device compatibility is claimed for Samsung S26 Ultra, One UI 9 or Android 17. The remaining device checks in the table still apply.

## Fixes in beta3

- Resolve menu components and action-sheet actions through Next's curated APIs when raw Metro barrels are still lazy.
- Support both flat HTTP exports and `{ HTTP, getAPIBaseURL }`, preserving the HTTP method receiver.
- Translate `BUNNY_CUSTOM_PAGE` into a scoped native Next settings route. Preserve the requested renderer, including Message Logger's channel history; wait for settings modules and unregister routes on stop.
- Supply an initialized-only Metro registry view for More Alts, so its command initializes without first opening its settings. No arbitrary Metro factories are run by the scan.
- Use the actual `ReactNavigationNative` export and map legacy row icons to Next's `icon` prop. Add the missing FormIcon fallback.
- Render InfoCommands output as local bot messages. Interaction-style ephemeral responses never become public message sends.
- Separate AutoText card and suggestion keys to avoid React reusing the wrong row.
- Enforce legacy safeFetch timeouts and cancel its pending requests on plugin stop.
- Show an accurate page for enabled plugins without settings. Classic sidebar-unavailable diagnostics are warnings; other errors remain errors.
- Keep beta2's getter-only/frozen React Native Button regression covered.

## Reproduce

```sh
python3 revenge-next/build.py --check
npm ci --ignore-scripts --no-audit --no-fund --prefix revenge-next
node --test revenge-next/tests/*.test.cjs
python3 -m unittest discover -s revenge-next/tests -p 'test_*.py'
```

GitHub Actions runs the Next checks and the affected InfoCommands Classic suite for future port changes. Other Classic suites are separate; their previously documented baseline failures are not counted as passing Next checks.

## Update and device check

Refresh `https://fluttershy2008-mlp.github.io/lol/index.json` in Revenge Next, update **InfoCommands to 1.0.0-beta6** and the other plugin ports to **1.0.0-beta4**, then fully restart Discord. Existing Pages-root and raw repository entries receive the same releases. Open settings through each plugin's entry in the Next Plugins page. Enable the ports you use one at a time and try the feature you need before enabling the next one.

If a feature still fails, include the plugin name, Discord version, Revenge Next version, Android version, the action you took and the full error. A passing simulation cannot establish compatibility with every private Discord module or device build.

Valenced has a separate catalogue at https://fluttershy2008-mlp.github.io/lol/valenced/index.json. See [Valenced setup](../valenced/README.md). This change also publishes AutoText and Valid User 1.0.0-beta5 for Next, with the shared composer and response fixes.

## Valenced beta2 follow-up and shared source changes

Valenced now uses the canonical nested HTTP client and imported-path chat-input hooks. Its Server Info action uses a native cached-details popup. Three fixtures fail against Valenced beta1 and pass against beta2. Next retains the rich sheet path and its existing regression suite. Shared source changes are released as Next InfoCommands 1.0.0-beta9, AutoText 1.0.0-beta6 and Valid User 1.0.0-beta6. Older sections above describe their original release audits.

## Profile-opening follow-up

Valenced InfoCommands and Valid User beta3 resolve the default profile opener by imported path, namespace markers and Valenced's selective dependency fingerprint. Native owner-profile and result-dialog fixtures fail against beta2 and pass against beta3. The shared change ships as Next InfoCommands beta10 and Valid User beta7. AutoText is unchanged.

## Addon List command-loading follow-up

Valenced Addon List beta3 waits for the command module through Valenced's module subscriptions instead of rejecting startup while it is cold. Settings copy works immediately, including without command discovery. Six integration fixtures cover late loading, native registry copies, command execution, cleanup, queued callbacks and imported-path fallback. The shared source ships as Next Addon List beta5; Next's registration path and all other packages are unchanged. The Classic Addon List fixture now supplies Android's native toast API, matching the existing compatibility guard.

## Copy User ID profile-menu follow-up

Valenced Copy User ID beta3 resolves profile overflow menus by imported path and keeps a subscription until a late module loads. It shows the full ID and copies `<@ID>`, upgrading an existing English native copy-ID row when present. Ten Valenced regressions cover five component forms, late loading, frozen groups, native-row replacement, separate user/bot callbacks and teardown. The shared source ships as Next Copy User ID beta5. Existing name-based hooks and message long-press support are retained.

## Valenced Server Info panel

Valenced InfoCommands beta4 uses a themed React Native Modal bottom panel mounted through Valenced's React alert host. It reuses the banner/header, Overview, Server and Friends components, renders cached data immediately, fits short windows and scrolls all content. ID copying and owner/friend profile callbacks are scoped to the active panel and cancelled on stop. The shared source ships as Next InfoCommands beta11; Next retains its existing native sheet and fallback behavior. All other packages are unchanged.

## Server Info Close follow-up

Valenced InfoCommands beta5 directly controls panel visibility, adds a press handler to the Close text, and removes only its owned alert-store entry if native dismissal retains it. Each opening has a unique host key. Five regressions cover native retention/errors/delays, immediate disappearance, preserved unrelated alerts, cancelled listeners/timers, stale Close callbacks and reopening. The shared source ships as Next InfoCommands beta12, with Next's existing sheet retained.

## List profile buttons

Friends List and Blocked User List beta5 share the native profile resolver used by Valid User and InfoCommands. Valenced receives the same fix as beta4 for both lists, retaining their native settings entries. Fourteen Valenced cases cover anonymous cold/imported/namespace-only openers, both blocked-user controls, exact IDs, unchanged relationships, stale callbacks after stop/restart or account changes, and late failures. Six discovery cases fail against the prior Valenced beta3 packages. Classic Friends List 1.0.3 and Blocked User List 1.3.3 retain named legacy openers. All unrelated current packages and older ZIPs are preserved.

## ExpressionCloner sticker uploads

ExpressionCloner beta5 resolves native sticker actions at clone time without requiring unrelated exports. If absent, it uploads multipart data through the canonical signed-in REST client. Mobile payloads use owned temporary files and local URIs; browser FormData is retained. Seventeen shared full-flow tests run on both Next and Valenced (beta3), covering PNG/APNG/GIF, late/missing actions, HTTP selection, file cleanup, single-attempt failures, duplicate confirmations, stale sessions/accounts, permission loss and size/format limits. Four discovery cases fail against the previous Valenced beta2 package. The same source ships as Classic 1.1.3. All other current packages and previous ZIPs are preserved; physical Android verification remains pending.

## More Alts QR rendering

More Alts beta5 shares Valenced beta4's validated WebView discovery and QR-only rendering boundary. Translation objects/functions cannot win a bare property lookup, and failed component exports can be replaced on refresh. Twelve native QR cases run on each host; the two translation fixtures fail against the previous Valenced beta3 package, including the exact reported `{locale, ast}` React error. Nine additional resolver checks cover component shapes, imported/platform discovery, initialized-only scanning and invalidation. The existing QR cryptography, credentials, MFA, account storage and settings shortcuts are retained. Classic receives 3.1.4. CI generates the bundled QR asset before source tests. All other current packages and older ZIPs are preserved.

## More Alts unloaded browser

More Alts beta6 shares Valenced beta5's on-demand browser loading. A native bridge probe and read-only dependency graph identify a unique Android SDK module before initialization. Current/older bridge imports, compiled/minified commands, loaded-component preference, opaque platform exports and initialization failure are covered. The two fully unloaded native fixtures fail against Valenced beta4 and pass against beta5. The suite now has 19 shared QR cases per host and 78 More Alts source/protocol checks, including ten new metadata-loader cases. No unrelated factory is initialized, and ambiguous/incomplete matches are skipped. Classic receives 3.1.5. The previous crash protection and all unrelated packages remain intact.


### More Alts beta7 — Discord WebView fork

Shares Valenced beta6’s support for `RNCWebView` / `RNCWebViewModule` and BatchedBridge / EventEmitter messaging imports, including an unloaded BatchedBridge wrapper. Four new native cases execute the actual pinned Discord fork and derive its dependencies from compiled package imports. They fail against Valenced beta5 and pass against beta6, covering loaded/cold messaging bridges, QR approval, navigation rejection, Close, Refresh and stale callbacks. There are now 23 QR cases per host and 84 More Alts source/protocol checks. Lookup failures include a short stage code without credentials, account data or QR contents. Classic receives 3.1.6; other packages and all previous ZIPs are preserved. [Sources and test fixture](../more-alts/README.md#discord-webview-fork-316--valenced-beta6--next-beta7). Phone verification remains pending.


### More Alts beta8 — bundled Android QR browser

Shares Valenced beta7’s packaged Android SDK and direct React Native bindings. No Discord JS WebView package or dependency graph is needed for the Android QR path. Native view reuse, legacy/bridgeless callable messaging, numeric/string commands and callback cleanup are covered. Seven new full UI cases fail against Valenced beta6 and pass against beta7, including execution of the exact HTML through a real RSA nonce proof, QR SVG generation and a simulated approved login. There are 30 QR cases per host and 91 More Alts source/protocol checks. The native view/module must still be installed; physical verification remains pending. Classic receives 3.1.7. Other packages and previous ZIPs remain unchanged. [Sources and API references](../more-alts/README.md#bundled-android-qr-browser-317--valenced-beta7--next-beta8).


### Server Leaver beta5 — main protected IDs

Shares Valenced beta4’s fixed main list of 22 exact snowflake strings. Main protection is checked in preview and immediately before each request, independently of storage. Saving restores removed main IDs; extra saved IDs remain scoped to each account. Main IDs not joined by that account do not block preview, while unknown additional IDs still do. Twenty-eight source/runtime tests and three shared native UI cases per host cover the list, upgrades, account changes, locked rows and a confirmed simulated queue. Classic receives 1.0.3. All other packages and prior ZIPs are preserved. [Protected IDs and behavior](../server-leaver/README.md#main-protected-list).

### Server Leaver beta6 — stable scrolling

Shares Valenced beta5’s preview fix: Protect/Remove protection keep rows in name order, the ID editor stays bounded and actions release keyboard focus, guild/theme listeners replace polling, and Android native clipping is disabled while virtualization remains enabled. Three new UI regressions fail against beta5 and pass against beta6; six native cases run per host along with 28 source/runtime checks. Existing main protections, account isolation and confirmed leave behavior are preserved. Classic receives 1.0.4. Actual native touch scrolling still needs device verification.

### More Alts beta9 — QR panel and public messaging

Shares Valenced beta8’s Discord-style square QR panel, scan instructions and native live status. Each attempt renders a fresh Discord fingerprint; the reference screenshot is not bundled. Public RN registerCallableModule is preferred before the existing global bridge paths, and missing-browser errors show the installed version. Three new native cases fail on beta8 and pass on beta9; 33 QR cases run per host and all 92 More Alts source/protocol checks pass. Phone login remains unverified. Classic receives 3.1.8.
