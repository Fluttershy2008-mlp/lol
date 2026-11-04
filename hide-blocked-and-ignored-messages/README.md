# HideBlockedAndIgnoredMessages 1.3.0

Revenge/Vendetta-compatible update of the plugin supplied from
[shipwr3ckd/revengeplugin](https://github.com/shipwr3ckd/revengeplugin/tree/master/plugins/HideBlockedAndIgnoredMessages).
Original authors: Zykrah and シグマ siguma. Updated for Fluttershy2008-mlp.

## Install

1. Disable or remove the previous **HideBlockedAndIgnoredMessages** plugin.
2. In Revenge's **Plugins** page, press **+** and paste this complete folder URL:

   ```text
   https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/hide-blocked-and-ignored-messages/
   ```

3. Enable this version and restart Revenge. Restarting also clears message
   records that the old version may have overwritten.

Do not append `index.js` or `manifest.json` to the install URL. The folder
contains both files, ready to install; no GitHub Actions build is required.

## Valenced update

Valenced package **1.0.0-beta5** adds an optional **Show whitelisted users**
switch and **Manage whitelisted IDs** button in this plugin's settings.

1. Open **Manage whitelisted IDs**.
2. Paste Discord user IDs or user mentions, separated by spaces, commas,
   semicolons or new lines.
3. Press **Add and show** to save the IDs and enable the whitelist.

Only the selected IDs are exempt from this plugin's blocked/ignored filters.
Their messages, mentions, replies and attributed command responses are allowed
through; other blocked/ignored users remain hidden according to your existing
switches. An explicitly whitelisted author's own messages are allowed even when
they reply to another hidden user. Keep **Hide blocked users** and **Hide ignored
users** enabled to continue hiding everyone else.

These users remain blocked or ignored in Discord. Discord may still display
their messages inside its native blocked-message group: tap the group to expand
it, as usual. No relationship-store functions are changed or unblock requests
sent. Whitelisting only affects the local message display.

The whitelist defaults off on upgrade. IDs are stored locally as exact strings,
validated as 17–20 digit user IDs and deduplicated. Invalid input adds nothing.
Remove an ID to hide that user again, or switch the option off while keeping
your saved list. Changes refresh the chat and persist across plugin restarts.

### Previous history-loading fix

Valenced package **1.0.0-beta4** fixes history loading when filtering leaves a
page empty. Update this plugin in your Valenced repository, then restart Discord.

- Native history actions read the complete cached collection when choosing
  their cursors; chat readers still receive the filtered list, including
  synchronous Flux subscribers during loading.
- Older/newer requests anchored at the visible list edge advance from the
  corresponding real cached edge. Explicit jumps and arbitrary anchors stay
  unchanged.
- A fully hidden cached chat or older batch can continue through up to five
  additional native pages (50 messages each), only in the selected channel.
  This requires recognized native paging flags and the native history action;
  unsupported builds retain Discord's manual loading control.
- Stops on visible history, the true history boundary, repeated cursors,
  failures, channel/account changes or disable. Manual loading can start another
  bounded pass. Never hides the native loading control or invents an end flag.

**Hide mentions of them**, added in beta3, remains enabled by default.
A friend’s `<@blocked-user-id>` or `<@!ignored-user-id>` mention disappears from
the displayed message while the remaining text, attachments and other users’
mentions stay visible. The blocked/ignored switches decide which users this
applies to. Turn the new switch off to restore mentions. This is local display
filtering and does not stop the original message from pinging its recipient.

## Changes

- Removes entire blocked/ignored message entries before Discord builds chat
  rows. It never inserts `[Filtered message. Check plugin settings.]` or another
  replacement label.
- Hides bot responses when the interaction's initiating user is blocked or
  ignored. Supports current `interaction_metadata`, normalized
  `interactionMetadata`, legacy `interaction`, follow-up references, and nested
  modal metadata.
- Leaves unrelated bot posts and other people's commands visible. Mentioning
  a blocked user or targeting them with a command does not by itself count as
  that user running the command.
- Retains independent switches for blocked users, ignored users, mentions, replies, and
  bot commands. All five default to enabled.
- Reads cached reply targets without making network requests.
- Observes incoming interaction IDs in a bounded, memory-only cache when a
  Discord build drops metadata during MessageRecord normalization. Partial
  edits retain that attribution; account changes/unloading clear the ID cache.
- Preserves Discord's original messages, event payloads, pagination state,
  collection prototype, and underlying message cache. Direct lookups return display copies when mentions are hidden. Unblocking a user or
  disabling the plugin restores the underlying cached messages.
- Removes the old fake startup messages, channel-ID rewrites, and native
  RowManager field mutations. Automatic history loading uses Discord's native
  action; there are no direct REST calls, message deletions, or automatic read
  acknowledgements from the plugin.

## Scope and compatibility

This changes the local chat message list. It does not change what other users
see or control server-side notifications, search results, or other plugins'
separate message-history viewers.

Bot attribution requires Discord to supply an interaction initiator or a
resolvable original-response reference. Ordinary bot/webhook posts without
this information remain visible. An unloaded reply target cannot be filtered
by identity unless Discord embeds its author. A received metadata update is
used the next time the chat list is read.

The integration supports arrays and Discord's `ChannelMessages` collections
with `_array`/`_map` data. An unrecognized list shape is returned unchanged and
reported in the plugin log instead of altering native data. If a settings or
relationship change does not refresh an already open chat, switch channels
and return.

Android/Discord/Revenge was not available for an on-device test. The automated
checks below verify the bundle using simulated Discord stores and Revenge's
actual `spitroast` patcher; they do not certify every Discord release.

## Build and verify

Requires Node.js 18 or newer. Building uses only Node's standard library.

```sh
npm run build
npm install --ignore-scripts
npm test
```

The build writes `index.js` and updates the SHA-256 hash in `manifest.json`.
Regression tests cover cached/live messages, fully hidden history
pages and pagination flags, interaction variants, other users' commands,
replies, partial edits, frozen records, bounded/cyclic metadata, restoring
messages, installation format, and cleanup after a failed startup.
Paging tests also cover cursor repair, consecutive hidden pages, pending native
requests, network failures, repeated pages, five-page limits, cancelled timers,
late promises, channel/account changes and synchronous display subscriptions.
The Valenced package is exercised with its vendored native patcher and adapter:

```sh
node --test valenced/tests/hide-blocked-mentions.test.cjs valenced/tests/hide-blocked-pagination.test.cjs valenced/tests/hide-blocked-whitelist.test.cjs
```

For a device smoke test: open a channel containing a blocked/ignored user's
message and slash-command response, then compare with a friend's command to
the same bot. Verify the friend's response stays visible; disable the plugin
and reopen the channel to confirm the original messages return. Check an older
history page and toggle each setting.

Interaction field definitions:
[Discord's message API documentation](https://docs.discord.com/developers/resources/message#message-interaction-metadata-object).

Distributed under CC0-1.0; see [LICENSE](LICENSE).
