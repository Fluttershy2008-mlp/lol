# Vencord Translate for Valenced — 2.0.5

This is a source-derived mobile port of **Vendicated/Vencord → Translate**, replacing the earlier Translate Message 1.0 plugin. The upstream provider logic, language tables, language settings, message text selection and translate glyph are included with their original attribution and GPL-3.0-or-later licence.

Chat Buttons integration: a fixed button ID and the translation glyph are exposed to the menu, preserving tap-to-toggle and hold-for-settings.

## Install or update

1. Download `Vencord_Translate_Valenced_v2.0.5.zip`. Keep it zipped.
2. Open **Discord Settings → Valenced → Plugins → Install from file** and select it.
3. Confirm the update of **Translate Message** if prompted, then fully restart Discord.
4. Enable **Translate (Vencord port)**. It uses the same plugin ID as the previous ZIP, preventing duplicate menu buttons.

Your incoming target language and feedback preference are preserved. Incoming translations replace the local message text, like v1.0.2, on fresh installs and when updating from v2.0.0. Successful incoming translations are silent. Auto Translate starts **off** unless you explicitly enable it.

## Vencord features ported

- **Four independent language selectors:** incoming from/to and your outgoing messages from/to. Source languages support automatic detection; destination selectors exclude autodetection.
- **Chat-bar Translate button** beside the right-side composer actions. Tap it once to toggle outgoing Auto Translate on or off. Hold it to open the mobile Translate settings panel. When enabled, the translate icon lights up bright green on a dark green tile with a green status dot. Turning it off restores the normal theme colour. The icon updates independently of native icon memoization and ignores inherited tint overrides while active.
- **Auto Translate before sending:** translates the content of a message after you press Send and before handing it to Discord. Attachments, reply metadata, nonce and allowed mentions are preserved.
- **Google Translate, DeepL Free, DeepL Pro and Kagi Translate.** Provider requests are adapted from Vencord’s `utils.ts` and Electron `native.ts` to React Native fetch. DeepL and Kagi require your own credentials; Google is the default.
- **Upstream language tables:** 133 Google targets, 127 DeepL targets and 274 Kagi targets, with searchable pickers and provider-specific language codes.
- **Incoming translation and dismissal:** hold a text message and choose Translate. The same button becomes **Revert Message** after translating, or **Cancel Translation** while waiting; you never get two separate rows. Forwarded message snapshots and moderation text use Vencord’s message-content selection.

## Mobile adaptations

Vencord’s desktop HTML/CSS, mouse context menus, hover buttons and Electron IPC cannot execute directly in Discord Android. They have been replaced with native React Native controls, scoped Valenced lifecycle hooks and the mobile composer’s lazy module API. The chat-bar button uses a single tap to toggle outgoing Auto Translate, and a long press to open translation settings.

Incoming translations replace the local message text directly, as in Translate Message v1.0.2, without appending the original or a “Translated from…” line. Restore it using the same menu button, which becomes Revert Message. Saved v2.0.0 `below` display preferences also use this inline display. Provider requests and the other Vencord features remain unchanged.

Incoming translations update only your local display. Other people see the original. They are invalidated by edits, deletions, channel reloads or account changes, and loaded translations are restored when the plugin stops. Message text is never sent through Discord’s edit endpoint.

## Outgoing behaviour

Auto Translate is opt-in. When it is enabled, pressing Discord’s Send button sends the translated text to the selected recipient through Discord’s normal send function. Selecting languages or opening the Translate panel does not send a message.

If translation fails, the message is not handed to Discord. The plugin tries to restore the original draft without replacing any new text you have started typing. If the native draft API cannot restore it, the original is available as selectable text under **Unsent originals** in the Translate panel during the current plugin session. Disabling the plugin cancels pending translations; it does not retry or send failed messages automatically.

## Privacy and provider credentials

Ordinary selected message text, or outgoing text when Auto Translate is enabled, goes to the chosen translation provider over HTTPS. Code, spoilers, mentions, emoji IDs, link destinations and reserved broadcast/silent markers are replaced with opaque placeholders and restored exactly. A missing or duplicated placeholder rejects the translation.

No Discord token, password, author/channel ID or attachment data is sent to a translation provider. The current user ID is read locally to discard work after an account switch. Originals, translations, cached results and unsent recovery text are held in memory, not saved in this plugin’s settings file.

Language preferences, switches and any DeepL/Kagi credential you enter are saved in the plugin’s local settings. Credential fields are masked in the UI. The plugin does not contact DeepL or Kagi until you select that provider and request a translation. Following Vencord, a missing DeepL key or exhausted DeepL quota falls back to Google with a notice. An invalid key or expired Kagi session does not fall back silently.

## Compatibility and validation

Built against **Valenced API 1**, commit `730ed4815a5ab77fe5e867eb6dc915d093721e33`. Vencord source commit: `8d64c8be7e68616f8f116a6fff9480051aa2a0c5`. The composer integration uses Discord’s `ChatInputRightActions.tsx` lazy import and a direct React Native Pressable. Owning the touch surface preserves long-press handling when Discord’s private action button drops that callback. Holding for 450 ms opens settings, and releasing the hold does not toggle auto-translation. The panel reports whether the composer is connected.

Automated validation uses the actual upstream Valenced patcher plus React native UI fixtures. It covers native menu wrappers, the composer button/modal, four language pickers, provider payloads and authentication, DeepL fallback, protected markup, outgoing send interception, draft recovery, account switching, cancellation and archive integrity. Full results are in `VALIDATION.json`.

**Not tested on a physical Android device, and live provider calls were unavailable in the restricted build environment.** Private Discord modules and provider availability can change. Google uses the same public client endpoint and client key as the pinned Vencord source. Native functionality is checked with fixtures rather than a running Discord process.

## Source, licences and rebuilding

- `src/`: complete runtime source for this mobile port.
- `upstream/vencord/`: original Translate plugin files.
- `upstream/SOURCE.json`: pinned repository, commit and file hashes.
- `LICENSE`: GPL-3.0; the work is offered under GPL-3.0-or-later.
- `THIRD_PARTY_NOTICES.md`: upstream and adaptation credits.
- `test/`: reproducible automated tests; upstream Valenced patcher test sources retain their CC0 licence.

Run `python3 build.py` to build the installation ZIP using Python’s standard library. For tests, use Node 24+, install the development dependencies with `npm install`, and run `npm test`. React test dependencies are development-only and are not loaded by Discord. No separate APK, Electron installation, CSS injector or Vencord desktop install is required.

Independent community port; not an official Vencord, Discord or Valenced release.
