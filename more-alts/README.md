# More Alts! for Revenge — 3.0.0

An updated account manager based on the More Alts! plugin in Apex-Plugins. Includes source, a dependency-free build, tests and the installable Revenge/Vendetta bundle.

## Install

Disable the old More Alts! plugin first. Keep it installed until you finish importing any saved accounts.

In **Revenge → Plugins → +**, paste this complete folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/more-alts/
```

Restart Revenge, then open **Settings → Revenge → More Alts!**. The plugin's settings button and `/morealts` also open the manager. The sidebar shortcut is optional and falls back to the plugin settings button if the current Discord build does not support it.

## Add and switch accounts

- **Save current account** saves the signed-in account or refreshes its existing saved session. Wait for the account's chats to load first.
- **Add another account** accepts email/phone and password. Authenticator and backup-code challenges open a second verification screen.
- **Switch account** checks the saved session with Discord before changing accounts. It also saves the outgoing account. Expired or mismatched sessions do not trigger a switch.
- **Import accounts from old More Alts** reads the original installed Apex MoreAlts plugin's local storage only when pressed. It keeps newer entries already saved here and does not delete the original data. Original install URL: `https://apexteampl.github.io/Apex-Plugins/MoreAlts/`.
- **Remove saved account** removes that entry from this plugin without signing it out of Discord.

More Alts does not impose Discord's native menu's five-account limit on its own saved list. The native menu remains controlled by Discord.

## Login failures

The original credential path trimmed passwords, assumed every successful login immediately returned a token, and reported a generic failure for MFA challenges. This version preserves passwords exactly, handles authenticator/backup-code verification, classifies failures, respects rate-limit cooldowns and cancels requests after 20 seconds.

CAPTCHA, passkeys, SMS-only MFA, email/device verification and account restrictions still require Discord's normal login. Save your current account, open Discord's native account menu if available, choose Add account, and complete the required steps. After the new account's chats load, use **Save current account** here. This plugin does not solve or bypass challenges. Native menu availability and account switching depend on Discord's internal APIs and can change between builds.

Automatic session refresh only applies to accounts you have already saved and makes one validation attempt per observed account/token pair. It does not sign into accounts automatically or add every account you use. An expired saved session must be renewed by signing in again.

## Storage and privacy

Saved session tokens are necessary for switching and remain in Revenge's local plugin storage, as in the original plugin. That storage is not an encrypted password vault. Passwords, email/phone login fields, MFA tickets and verification codes are never written to plugin storage or diagnostic logs. They are sent only to Discord's HTTPS API during the requested sign-in. Avatar images load from Discord's CDN.

This version removes fake-token logout, token-copying controls, raw-token exports and unsafe notification-store property replacement. Removing an account does not revoke it; signing out through Discord or changing its password can invalidate its saved session. No accounts, screenshots, passwords or session data are included in this repository.

## Build and tests

Requires Node.js 18 or newer; no npm dependencies are needed.

```sh
cd more-alts
npm run build
npm test
```

Tests use synthetic sessions and mocked Discord responses. They cover credentials, MFA, challenge expiry, CAPTCHA handling, cooldowns, slow responses, duplicate submissions, cancellation, account/session mismatches, failed switches, session refresh, legacy import, settings compatibility, lifecycle cleanup and the installable bundle/hash. This is not a live Android/Revenge device test.

## Credits and license

Original More Alts!: Win8.1VMUser, John and cocobo1, distributed in [ApexTeamPL/Apex-Plugins](https://github.com/ApexTeamPL/Apex-Plugins). Original CC0 license retained in `LICENSE.upstream`.

This version is GPL-3.0-or-later (`LICENSE`); the settings shortcut is adapted from this repository's GPL-licensed Profile Status Presets compatibility code. The account manager and test coverage were rebuilt for this version. Revenge API compatibility was checked against the [Revenge bundle source](https://github.com/revenge-mod/revenge-bundle).
