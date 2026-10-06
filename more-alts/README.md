# More Alts! for Revenge — 3.1.1

An updated account manager based on the More Alts! plugin in Apex-Plugins. Includes source, a dependency-free build, tests and the installable Revenge/Vendetta bundle.

## Install

Disable the old More Alts! plugin first. Keep it installed until you finish importing any saved accounts.

In **Revenge → Plugins → +**, paste this complete folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/more-alts/
```

Restart Revenge, then open **Settings → Revenge → More Alts!**. The plugin's settings button and `/morealts` also open the manager. The sidebar shortcut is optional and falls back to the plugin settings button if the current Discord build does not support it.

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
