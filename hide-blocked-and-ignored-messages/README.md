# HideBlockedAndIgnoredMessages 1.1.0

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
- Retains independent switches for blocked users, ignored users, replies, and
  bot commands. All four default to enabled.
- Reads cached reply targets without making network requests.
- Observes incoming interaction IDs in a bounded, memory-only cache when a
  Discord build drops metadata during MessageRecord normalization. Partial
  edits retain that attribution; account changes/unloading clear the ID cache.
- Preserves Discord's original messages, event payloads, pagination state,
  collection prototype, and direct message lookup. Unblocking a user or
  disabling the plugin restores the underlying cached messages.
- Removes the old fake startup messages, channel-ID rewrites, and native
  RowManager field mutations. No REST requests, message deletions, or automatic
  read acknowledgements are sent.

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
Thirteen regression tests cover cached/live messages, fully hidden history
pages and pagination flags, interaction variants, other users' commands,
replies, partial edits, frozen records, bounded/cyclic metadata, restoring
messages, installation format, and cleanup after a failed startup.

For a device smoke test: open a channel containing a blocked/ignored user's
message and slash-command response, then compare with a friend's command to
the same bot. Verify the friend's response stays visible; disable the plugin
and reopen the channel to confirm the original messages return. Check an older
history page and toggle each setting.

Interaction field definitions:
[Discord's message API documentation](https://docs.discord.com/developers/resources/message#message-interaction-metadata-object).

Distributed under CC0-1.0; see [LICENSE](LICENSE).
