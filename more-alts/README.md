# More Alts! for Revenge — 3.1.16

An updated account manager based on the More Alts! plugin in Apex-Plugins. Includes source, a dependency-free build, tests and the installable Revenge/Vendetta bundle.

## Install

Disable the old More Alts! plugin first. Keep it installed until you finish importing any saved accounts.

In **Revenge → Plugins → +**, paste this complete folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/more-alts/
```

Restart Revenge, then open **Settings → Revenge → More Alts!**. The plugin's settings button and `/morealts` also open the manager. The sidebar shortcut is optional and falls back to the plugin settings button if the current Discord build does not support it.

## Stable16: SMS verification

On the Two-Factor Authentication dialog, choose **Send SMS code** if Discord reports SMS authentication enabled for the account. Discord sends the code to its linked phone number; More Alts does not accept a replacement destination during MFA. Enter the **SMS Code** and press **Verify**. The destination is shown only as a masked suffix. The SMS request uses the existing login ticket, and the returned account is verified and saved using stable14's storage readback.

**Resend SMS code** has a 30-second local cooldown and respects longer Discord rate limits. No SMS is sent automatically on opening the dialog, changing methods, retrying a failed code, or restarting. You can return to an authenticator/backup code and use an already sent SMS without requesting another one. SMS-only challenges are supported. Tickets, login instance IDs, SMS codes, and phone destination details remain temporary and are never written to saved account storage. Closing, Back, and disabling the plugin cancel the pending challenge and countdown.

SMS authentication must already be enabled in Discord, as explained in [Discord's MFA setup guide](https://support.discord.com/hc/en-us/articles/219576828-Setting-up-Multi-Factor-Authentication). Linking a phone number alone does not enable SMS MFA. If unavailable, sign into the account using another supported method, then enable SMS authentication in Discord's account settings. Existing accounts, the Valenced settings switcher, and the no-QR interface are retained. Update to **1.0.0-stable16** and restart Discord. Classic is **3.1.16**. Tests use synthetic responses; actual SMS delivery still needs to be checked on the installed app.

Protocol reference: [Userdoccers' authentication documentation](https://docs.discord.food/authentication), an unofficial description of Discord's login MFA endpoints and response flags.

## Stable15: account switcher in Valenced settings

Open **Settings → Valenced → Switch accounts** for a compact account picker. Tap a saved account to switch; the current account appears first with a checkmark. **Add another account** uses the existing sign-in and two-factor dialog. **Save current account** retains stable14's verified file persistence. **Manage accounts** opens the full manager for removal, search, importing and preferences, with a button back to the picker. An unsaved current account is labelled clearly and is not silently added. Expired accounts offer **Re-sign in** without deleting their saved entry.

Update More Alts! to **1.0.0-stable15**, then restart Discord. Existing accounts and settings are retained, and QR login stays removed. The Valenced shortcut uses its native settings API; it remains available through the plugin's settings button if direct settings registration is unavailable. Classic **3.1.15** and Next **stable15** retain the full account manager as their default screen. Automated tests use simulated Discord sessions; a physical-device check is still required for the installed Discord build.

## Stable14: verified account saving (3.1.14 / Valenced stable14 / Next stable14)

**Save current account** reads the active AuthenticationStore session, verifies its account identity with Discord, and saves the full session and profile. Valenced and Next wait for the storage write and read the file back before showing **Saved @username successfully.** This catches native storage failures even when the host reports a successful write. A failed save leaves the existing in-memory account records unchanged, reports the failure, and prevents switching away before the outgoing account is saved. Password and MFA sign-in use the same persistence check.

Saving an existing account replaces its old session without creating a duplicate or changing other saved accounts. Account cards show **Last saved**, and this timestamp survives restarting. Refresh the repository, update More Alts! to **1.0.0-stable14**, and fully restart Discord. Sign into each account and press **Save current account** once. Keep plugin data. QR login remains removed. Tests use synthetic sessions and simulated native storage; a physical-device sign-in and switch still need to be checked on the user's build.

## Stable13: saved-session recovery (3.1.13 / Valenced stable13 / Next stable13)

Discord may reject a previously saved session with HTTP 401. This **cannot be bypassed or silently repaired**. Stable13 identifies which saved account needs attention, offers **Re-sign in** on its account card, and updates the stored session only after Discord verifies the account. A different account signing in never overwrites the target's record. Password-login and MFA errors no longer masquerade as expired saved sessions. Current-account verification errors recommend signing in through Discord and using **Save current account** afterward. The QR feature stays removed, and existing saved accounts persist when updating without clearing data.

## Stable12: native Add Account without QR (3.1.12 / Valenced stable12 / Revenge Next stable12)

The QR login and Discord web-style account panel were removed after repeated unavailable-native-WebView reports. Add Account now uses a smaller native dialog for email/password and Discord two-factor verification, plus a shortcut explaining how to sign in through Discord's normal account menu. There is no QR button or QR code placeholder. Account storage and switching remain unchanged, and existing saved accounts are retained when updating without clearing plugin data. Only More Alts! is labelled stable12; the other repository plugins remain on their previous versions. The stable12 package replaces the beta QR interface, not the local account data. Package tests cover the login and absence of QR UI, but physical-device testing is not guaranteed.

## View-only WebView fallback (3.1.11 / Valenced beta11 / Next beta12)

The QR login plugin now probes the Android RNCWebView native *view* even when its separate native *module* is inaccessible. If the view exists, a narrow, CSP-restricted HTML QR view uses callable message callbacks and direct view commands. If the view is missing too, the plugin still reports an unavailable QR login. This fallback has simulated tests but still needs physical-device verification. The plugin never substitutes a static, nonfunctional QR code.

## Valenced native-module lookup (3.1.10 / Valenced beta10 / Next beta11)

Valenced's external plugin API is passed as a function argument, not exposed as a global. The QR loader now gets this scoped API through the Valenced compatibility adapter and can look up registered native WebView modules even when React Native's legacy NativeModules map hides them. The native module and Android view must still exist in the installed Discord build. This change cannot add missing Android code. QR login on a physical device has not been verified.

## Discord-style web login panel (3.1.9 / Valenced beta9)

The Add another account dialog now has the familiar Welcome back! heading, email and password fields alongside the QR sign-in area, and a vertical layout on narrow phones. QR generation remains opt-in, and the pane never shows a static or re-used QR as an authentication token. MFA and saved sessions are unaffected.

**Native limitation:** QR sign-in still requires an actual Android WebView native module in the installed Discord build. The error `MA-QR-NATIVE-MODULE/NATIVE` means the required component is unavailable; changing the plugin's JavaScript layout cannot install native modules. The fallback is the email/password sign-in or Discord's own account menu followed by Save current account. Browser login by itself does not transfer a session into More Alts.

## QR panel and public RN messaging (3.1.8 / Valenced beta8 / Next beta9)

The QR screen uses a Discord-style layout: a square white code above **Log in with QR Code**, mobile scan-and-approve instructions and live connection/approval status. Every attempt obtains a fresh fingerprint from Discord and renders its own QR code with the bundled encoder; no uploaded code image is included in the plugin. After approval, the verified account is saved for selection in the account manager.

The bundled Android browser now prefers React Native’s public `registerCallableModule` API, which chooses the active legacy or bridgeless implementation. The previous global-bridge paths remain as fallbacks. This supports hosts that expose the public API while hiding the bridge globals. Native browser failures include the loaded version alongside the stage code: the native plugin version on Valenced, or the Classic source version exposed by Next’s compatibility adapter. Older metadata-loader releases report only `MA-QR-NATIVE`; current builds include the bundled browser path and both failure stages.

Refresh the [Valenced repository](https://fluttershy2008-mlp.github.io/lol/valenced/index.json), update **More Alts! to 1.0.0-beta8**, then fully close and reopen Discord. Next receives **1.0.0-beta9** and Classic **3.1.8**. Keep existing saved plugin data. Open Add another account → Log in with QR Code, scan from Discord on another device already signed into the desired account, and approve there. Refresh generates a new attempt; Back and Close cancel it.

Three new native cases fail on the previous package and pass on this release: public-API-only browser setup and approved-account saving, the square panel/instructions/live status with Back, and installed-version diagnostics. There are **33 native QR cases per host** and **92 More Alts source/protocol checks**. The existing exact-HTML RSA handshake, real QR SVG generation, approval verification, refresh, Close, disable, stale-session rejection and credential/MFA cases remain included. Native touch and real Discord sign-in remain unverified on a physical phone; an installed native WebView view/module and secure Web Crypto are still required.

Primary references: [React Native 0.86 callable-module registration](https://github.com/facebook/react-native/blob/v0.86.0/packages/react-native/Libraries/Core/registerCallableModule.js) and [Discord’s QR login instructions](https://support.discord.com/hc/en-us/articles/360039213771-QR-Code-Login-FAQ).

## Bundled Android QR browser (3.1.7 / Valenced beta7 / Next beta8)

The Android QR button no longer needs to locate Discord’s WebView JavaScript package. More Alts now ships the Android component, shared hook and styles from the pinned MIT-licensed Discord fork, and connects them to the installed native `RNCWebView` through React Native. This avoids both initialized-module lookup and the cold dependency fingerprint that still failed on the reported build. Native APIs are accessed only on the QR click. The existing package resolver remains available as a fallback for other hosts.

The wrapper uses `requireNativeComponent`, UIManager’s legacy/Fabric command dispatcher, and the active legacy or bridgeless callable-module API. An already registered native view is reused. Each browser gets a plugin-owned messaging name; rerenders update callback references without duplicate native registration. Close, refresh and plugin stop release those references, and unrelated Discord handlers are preserved. The shipped HTML still runs the same RSA-OAEP/SHA-256 flow in Web Crypto with its pinned HTTPS origin, CSP, session checks and approved-account verification. No new server or external crypto service is involved.

Refresh the [Valenced repository](https://fluttershy2008-mlp.github.io/lol/valenced/index.json), update **More Alts! to 1.0.0-beta7**, then fully close and reopen Discord. Next receives **1.0.0-beta8** and Classic **3.1.7**. Keep the existing saved plugin data.

Seven new native integration cases run with no Discord WebView JS package or dependency metadata installed; all seven fail against Valenced beta6 and pass against beta7. They cover both native messaging architectures, numeric/string commands, Close, refresh, stale callbacks, stop and a pre-registered native view. One executes the exact delivered HTML with real Web Crypto: it generates the key, verifies a nonce proof, renders a QR SVG, handles simulated Discord approval and saves only the verified account. The shared QR suite now has **30 cases per host**. Seven native-provider source checks bring More Alts source/protocol checks to **91**. Physical phone verification remains pending; the installed app must still contain the native `RNCWebView` view and module.

[Bundled source, adaptations, license and primary API references](vendor/discord-webview/README.md). The ordinary build includes the checked-in generated SDK; regenerating it uses the repository’s pinned esbuild. The native SDK never initializes unrelated Metro factories.

## Discord WebView fork (3.1.6 / Valenced beta6 / Next beta7)

Beta5 still missed Discord’s WebView fork: it only probed `RNCWebViewModule` and required an EventEmitter import. Discord’s pinned fork instead requests `RNCWebView` and imports BatchedBridge. The loader now accepts either native-module name and both messaging layouts, including a still-unloaded BatchedBridge singleton whose MessageQueue constructor is known. The complete SDK graph must still identify one candidate before any package factory runs. Discovery does not invoke messaging registration, component rendering or native navigation methods.

Refresh the [Valenced repository](https://fluttershy2008-mlp.github.io/lol/valenced/index.json), update **More Alts! to 1.0.0-beta6**, then fully close and reopen Discord. Next receives **1.0.0-beta7**, Classic **3.1.6**. Failure messages now include a short `MA-QR-…` lookup code so a remaining mismatch can be located from the error itself. Codes do not contain account, credential or QR data.

Four new native checks execute the [actual MIT-licensed Discord fork](tests/vendor/discord-webview/README.md), with its component, shared hook and native spec retained. They derive dependencies from the package’s compiled imports and cover loaded/cold callable bridges, approval through the SDK’s native callback, blocked external navigation, Close and stale approval after Close/Refresh. All four fail against Valenced beta5 and pass against beta6. The SDK registers its own handlers and retains its own instance names. Only native host views, native commands and network responses are mocked. The QR suite now has **23 cases per host**, and all **84 More Alts source/protocol checks** pass. Six new source cases separately cover the native aliases and messaging layouts. Phone verification remains pending.

Primary source: Discord’s [Android component](https://github.com/discord/react-native-webview/blob/6960a1903c3c32e1e77be11e6370f1c384ed7ee4/src/WebView.android.tsx) and [`RNCWebView` TurboModule spec](https://github.com/discord/react-native-webview/blob/6960a1903c3c32e1e77be11e6370f1c384ed7ee4/src/NativeRNCWebView.ts). The cold singleton follows React Native’s [BatchedBridge](https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/BatchedBridge/BatchedBridge.js) and [MessageQueue](https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/BatchedBridge/MessageQueue.js). Prior translation rejection, QR-local error recovery, protocol cryptography and saved-account behavior remain unchanged.

## QR browser loading (3.1.5 / Valenced beta5 / Next beta6)

The previous rendering fix only searched components Discord had already initialized. That could leave QR login showing “WebView unavailable” when the installed browser package was still unloaded. QR login now checks the native browser bridge and inspects dependency metadata to locate the Android WebView package, then initializes only a unique matching module when the QR button is pressed. Current and older native-bridge import layouts, compiled commands and minified codegen helpers are supported, without hard-coded module IDs. Settings startup does not load the browser.

The SDK graph is checked for React, React Native, EventEmitter, the generated view/commands, shared hook, native bridge and styles. Ambiguous or incomplete matches are not executed. A failed package initialization is attempted once per plugin session. Translation rejection, component validation and the QR rendering boundary remain in place. The plugin uses Discord's installed WebView implementation; no browser event handlers or native messaging modules are replaced by the plugin.

For Valenced, refresh the [existing repository](https://fluttershy2008-mlp.github.io/lol/valenced/index.json), update **More Alts! to 1.0.0-beta5**, then fully close and reopen Discord. Next receives **1.0.0-beta6**; Classic receives **3.1.5**. Keep the existing plugin data when updating.

Nineteen shared native QR checks pass on each host, including two new cases that fail against Valenced beta4 when the whole browser package starts unloaded. Approval verifies and saves the account without switching accounts. Ten new source checks cover the graph layouts, compiled/minified commands, initialized native view descriptors, ambiguous/incomplete graphs, missing native support and failed initialization. All 78 More Alts source/protocol checks pass. These tests simulate the SDK and native bridge; phone verification remains pending.

The loading API was checked against [Valenced d3e17fe's module API](https://github.com/Valenced/valenced/blob/d3e17fe0416c3dc5f4b4d783b465eeb4a99caec1/bundle/lib/plugins/src/apis/modules.ts). The dependency graph follows the package's [v13 Android component](https://github.com/react-native-webview/react-native-webview/blob/v13.13.5/src/WebView.android.tsx), [current Android component](https://github.com/react-native-webview/react-native-webview/blob/master/src/WebView.android.tsx), [generated native view](https://github.com/react-native-webview/react-native-webview/blob/master/src/RNCWebViewNativeComponent.ts), and native bridge/shared/styles imports. Release command detection follows React Native’s [command helper](https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/Utilities/codegenNativeCommands.js) and [generated view config](https://github.com/facebook/react-native/blob/main/packages/react-native-codegen/src/generators/components/GenerateViewConfigJs.js).

## QR rendering fix (3.1.4 / Valenced beta4 / Next beta5)

Fixes the QR login crash `Objects are not valid as a React child` with `{locale, ast}`. A bare `WebView` property can match Discord's translation exports. QR discovery now prefers the imported `react-native-webview` package and validates the component type and package/platform export shape before rendering it. Function, memo, forward-ref and older class exports are supported. It only inspects initialized modules and does not call a candidate component to validate it.

A QR-only error boundary keeps unexpected browser rendering failures inside the Add Account dialog, cancels that attempt and leaves Back, Close and Refresh available. A failed export is skipped on refresh; a newly loaded healthy package can be discovered immediately without the general lookup cooldown. Frozen exports remain untouched. The existing QR handshake, approval verification, saved-account storage, settings entry and credential/MFA paths are retained. Do not clear plugin data to update.

For Valenced, refresh the [existing repository](https://fluttershy2008-mlp.github.io/lol/valenced/index.json), update **More Alts! to 1.0.0-beta4**, then fully close and reopen Discord. Next receives **1.0.0-beta5**; Classic receives **3.1.4** through the same folder URL.

Twelve shared native integration cases run through the real Add Account dialog on both Valenced and Next. They cover translation objects/functions ahead of the real browser, memo/forward-ref exports, imported/platform discovery, verified QR approval without switching accounts, late package loading, refresh, Back/Close/Android Back, disable/restart, and recovery from a rendering failure. Two discovery cases fail against Valenced beta3, including the exact reported `{locale, ast}` error, and pass against beta4. Nine additional resolver checks verify shapes, initialized-only lookup, caching and failed-export invalidation. Phone verification remains pending.

The component checks follow the package's [named/default exports](https://github.com/react-native-webview/react-native-webview/blob/master/index.js) and [Android platform component](https://github.com/react-native-webview/react-native-webview/blob/master/src/WebView.android.tsx).

## Startup stability (3.1.1)

- Startup no longer calls Vendetta's eager Discord module finders. On current Revenge, lookups inspect already initialized, healthy Metro modules without running module factories.
- Optional native menu, settings row and command setup starts after a short delay and waits for current UI interactions to finish when supported. Module discovery yields every 64 records so it does not occupy one long JavaScript task.
- Successful lookups are reused, and missing modules have a five-second retry cooldown. Session polling does not repeat an entire search every 250 ms.
- Saved sessions with an unchanged token do not make a background validation request. Changed tokens are still verified once, and manual Save and Switch still validate sessions.
- Disabling the plugin cancels delayed/idle setup and sliced discovery, removes listeners and patches, and rejects stale initialization callbacks after re-enabling.

Optional shortcuts use modules Discord has already loaded. If a shortcut is unavailable, open **Revenge → Plugins → More Alts! → Settings**. Older loaders without the Metro registry defer compatibility setup until this manager is opened. Login, QR sign-in, MFA and saved accounts remain available. Do not clear plugin storage to update.

This addresses startup work and lifecycle hazards found in the code. The tests use a simulated runtime; an Android/Revenge device run is still needed to confirm the reported crash is resolved on your specific Discord version.

## Add Account design

Version 3.1.0 uses a Discord-style Add Account dialog adapted for phones: a dimmed background, email/phone and password fields, close/back controls, a Continue button, an inline 2FA step, and a working QR sign-in option. The dialog scrolls above the keyboard and also works in landscape. Password reset opens Discord’s official login page, where you can choose Forgot your password.

Choose **Add another account → Log in with QR Code**. Scan the fresh code with Discord on a second device already signed into the account you want to add, then approve the sign-in in Discord. More Alts verifies and saves that approved account without changing the currently active account. You can then select it in the saved-account list.

Use **Refresh QR code** if it expires. Back, Close, disabling the plugin, or rejecting the sign-in stops the attempt. Refresh respects Discord’s rate-limit response. This needs the WebView component included with Discord and secure Web Crypto support; Android System WebView/Chrome may need updating. A code displayed on a phone should be scanned by another device.

Passkey login is still handled through Discord’s normal sign-in. CAPTCHA or additional verification imposed by Discord cannot be bypassed by either login option.

## Add and switch accounts

- **Save current account** saves the signed-in account or refreshes its existing saved session. Wait for the account's chats to load first.
- **Add another account** accepts email/phone and password. Authenticator and backup-code challenges open the verification step inside the dialog.
- **Switch account** checks the saved session with Discord before changing accounts. It also saves the outgoing account. Expired or mismatched sessions do not trigger a switch.
- **Import accounts from old More Alts** reads the original installed Apex MoreAlts plugin's local storage only when pressed. It keeps newer entries already saved here and does not delete the original data. Original install URL: `https://apexteampl.github.io/Apex-Plugins/MoreAlts/`.
- **Remove saved account** removes that entry from this plugin without signing it out of Discord.

More Alts does not impose Discord's native menu's five-account limit on its own saved list. The native menu remains controlled by Discord.

## Login failures

The original credential path trimmed passwords, assumed every successful login immediately returned a token, and reported a generic failure for MFA challenges. This version preserves passwords exactly, handles authenticator/backup-code verification, classifies failures, respects rate-limit cooldowns and cancels requests after 20 seconds.

CAPTCHA, passkeys, SMS-only MFA, email/device verification and account restrictions still require Discord's normal login. Save your current account, open Discord's native account menu if available, choose Add account, and complete the required steps. After the new account's chats load, use **Save current account** here. This plugin does not solve or bypass challenges. Native menu availability and account switching depend on Discord's internal APIs and can change between builds.

Automatic session refresh verifies changed tokens and only applies to accounts you have already saved and makes one validation attempt per observed account/token pair. It does not sign into accounts automatically or add every account you use. An expired saved session must be renewed by signing in again.

## Storage and privacy

Saved session tokens are necessary for switching and remain in Revenge's local plugin storage, as in the original plugin. That storage is not an encrypted password vault. Passwords, email/phone login fields, MFA tickets and verification codes are never written to plugin storage or diagnostic logs. They are sent only to Discord's HTTPS API during the requested sign-in. Avatar images load from Discord's CDN.

QR sign-in creates an ephemeral RSA-OAEP/SHA-256 key pair inside an isolated, local HTML WebView with Discord’s HTTPS origin. The private key stays in that WebView. It connects only to Discord’s remote-auth gateway and ticket endpoint, using bundled QR rendering code (no third-party QR image service). The approved token crosses the in-app bridge only after Discord approval and is verified against the approved user ID before saving. WebView navigation and external scripts are blocked; QR data is not copied, exported or logged. Closing the dialog releases its connection, timers and key material.

This version removes fake-token logout, token-copying controls, raw-token exports and unsafe notification-store property replacement. Removing an account does not revoke it; signing out through Discord or changing its password can invalidate its saved session. No accounts, screenshots, passwords or session data are included in this repository.

## Build and tests

Requires Node.js 18 or newer; no npm dependencies are needed.

```sh
cd more-alts
npm run build
npm test
```

Tests use synthetic sessions and mocked Discord responses. They cover deferred startup, initialized-only module discovery, lookup caching, cancellation during startup, unchanged-session request suppression, credentials, MFA, challenge expiry, CAPTCHA handling, cooldowns, slow responses, duplicate submissions, cancellation, the real RSA-OAEP/SHA-256 QR handshake against a simulated Discord server, QR approval/expiry, stale WebView messages, account/session mismatches, failed switches, session refresh, legacy import, settings compatibility, lifecycle cleanup and the installable bundle/hash. This is not a live Android/Revenge device test.

## Credits and license

Original More Alts!: Win8.1VMUser, John and cocobo1, distributed in [ApexTeamPL/Apex-Plugins](https://github.com/ApexTeamPL/Apex-Plugins). Original CC0 license retained in `LICENSE.upstream`.

This version is GPL-3.0-or-later (`LICENSE`); the settings shortcut is adapted from this repository's GPL-licensed Profile Status Presets compatibility code. The account manager and test coverage were rebuilt for this version. Revenge API compatibility was checked against the [Revenge bundle source](https://github.com/revenge-mod/revenge-bundle).

The bundled QR encoder is [qrcode-generator 2.0.4](https://github.com/kazuhikoarase/qrcode-generator), copyright Kazuhiko Arase, under the MIT license retained in `vendor/LICENSE.qrcode`. `src/qr-assets.mjs` is generated by the build and is not committed. Remote-auth message order was checked against [Discord-QR-Auth-Client](https://github.com/malmeloo/Discord-QR-Auth-Client/blob/master/server.py); the implementation here uses browser Web Crypto and does not use that client’s logging or file-export code. See [Discord’s QR login FAQ](https://support.discord.com/hc/en-us/articles/360039213771-QR-Code-Login-FAQ) for the scan-and-approve flow.
