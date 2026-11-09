# HideBlockedAndIgnoredMessages 1.5.3

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

### Native server icon render fix (1.0.0-beta12)

Beta11's store-only filtering can leave icons visible when the mobile bar keeps
its own snapshot. Beta12 additionally projects the native server bar's rendered
list data, its props selector and individual server rows. Imported source paths
cover minified and later-loaded components. The original row's React hooks still
run in the same order; a separate visibility component hides its rendered icon
and streaming badge and responds to the existing icon visibility switch.

Existing server IDs and settings carry over. Update and fully restart Discord.
This does not replace the server bar, alter server membership or filter the
folder-save getters. A regression fixture with captured, unfiltered bar data
reproduces beta11's failure without reading any SortedGuildStore getter.
Phone testing is still required to confirm coverage on each Discord build.


### Hide server icons too (1.0.0-beta11)

**Hide selected server icons** now hides the saved server IDs from the server bar,
including expanded folders and collapsed folder previews. Existing IDs carry over,
and icon hiding starts enabled. Disable this switch or remove an ID in **Manage
hidden server IDs** to restore an icon. The main server hiding switch pauses all
server filters. Refresh the repository, update and fully restart Discord once.

Server bar lists are filtered before native layout. Guild membership, raw channel
metadata, permissions, and Discord's folder-save getters remain intact. Empty
folder shells are retained to keep native folder references valid. This does not
leave servers or mute notifications. Physical device verification is still needed.

Interface references used to identify the mobile display paths:
- [SortedGuildStore display and persistence methods](https://github.com/bleelblep/revenge-next-plugins/blob/main/plugins/hide-servers-drawer/js/patches/sortedGuilds.ts)
- [Mobile server bar notes](https://github.com/bleelblep/revenge-next-plugins/blob/main/plugins/hide-servers-drawer/js/patches/guildsBar.ts)


### Hide channel lists too (1.0.0-beta10)

The existing server IDs now hide their sidebar channels by default as well.
**Hide channel lists in selected servers** covers text, announcement, voice,
stage, category, forum, media and thread entries. It shares the server ID list;
you do not need to paste the IDs again. Turn this switch off to keep channel
names visible while hiding messages. The main server hiding switch pauses both.
Update and fully restart Discord once to refresh cached sidebar layouts.

Channel metadata and permissions remain intact. Other servers and explicit search
keep working. The server icon and server header remain visible. Tests cover
settings changes, late sidebar loading, cleanup and the actual ShowHiddenChannels
package in both plugin load orders. Physical phone testing is still needed.

### Hide servers by ID (1.0.0-beta9)

Open the plugin's settings, press **Manage hidden server IDs**, paste the server
ID and press **Add and hide servers**. Multiple IDs may be separated by spaces,
commas, semicolons or new lines. Turn on Developer Mode in Discord to access
**Copy Server ID** in the server menu.

**Hide messages from selected servers** pauses or enables the saved server list.
**Remove server** removes one entry. This hides all chat messages in those servers,
including threads and native message groups, even from whitelisted users. DMs from
server members and other servers still follow your existing user hide settings.
Explicit search stays available. Server hiding does not mute notifications, change
unread counts, remove the server icon or leave the server. Empty lists hide no servers.
Update and fully restart Discord once to rebuild cached native rows.

The server filter preserves original message history and avoids automatically
loading more history in a server whose entire chat is hidden. Tests cover the
packaged settings flow, restart, server/thread native rows, search, DMs, other
servers and unload. Physical Android testing is still needed.

### Search behaviour retained from beta8

Valenced package **1.0.0-beta8** allows blocked and ignored users in explicit
message search, including the **from:** author suggestions. Search visibility
is separate from chat hiding: the chat whitelist does not restrict search.
Update, restart Discord and run the search again. Your existing whitelist stays
saved and continues to control normal chat visibility.

- Removes beta7's search-result and autocomplete projections. Search getters
  return the complete original arrays/state, including context and mentions.
- Discord normally discards blocked messages during `SEARCH_MESSAGES_SUCCESS`.
  A synchronous exception for its combined blocked/ignored check lets returned
  messages enter the search cache.
- The same exception covers `AutocompleteScreen` while its native author
  suggestions are being rendered. It supports already loaded or later loaded
  stores/components and restores hooks on stop.
- Unrelated nested events and deferred callbacks use the real relationship
  checks. `isBlocked`, `isIgnored` and the relationship map remain unchanged.
  No unblock request or search-payload rewrite is sent.
- Server result totals, cursors, fetch state and the exact original cached
  results stay intact. Only messages actually returned by Discord can appear;
  this does not fetch deleted or inaccessible content.

### Normal whitelist messages

Valenced package **1.0.0-beta6** shows whitelisted users as normal messages,
without the **X blocked messages** or ignored-message group header. Update and
restart Discord once to rebuild already cached native rows. Existing whitelist
IDs and settings are kept.

The optional **Show whitelisted users** switch and **Manage whitelisted IDs**
button, introduced in beta5, are in this plugin's settings.

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

These users remain blocked or ignored in Discord. Whitelisted messages are
unwrapped from native blocked/ignored groups into ordinary message rows, so no
tap-to-expand bar is needed. Hidden users' rows are excluded even from a mixed
group. The stored relationships and ordinary blocking checks stay intact;
no unblock requests are sent. Whitelisting only affects the local chat display.

The native row hook supports an already loaded or later loaded `ChatManager`.
It calls Discord's original `createRow` for every permitted child so native row
indexing and changesets stay under Discord's control. It copies generated child
rows instead of changing cached message records or the original group. Unknown
native group layouts pass through rather than guessing their structure. The
schema follows Valenced's own [hide-blocked-messages plugin](https://github.com/Valenced/valenced-community-plugins/blob/998f55771c3fbb07c267f295eafccd4e25af24b3/plugins/hide-blocked-messages/index.ts).

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

This filters the local chat message list and allows blocked/ignored users in
explicit message search and search user suggestions. It does not change what other users see, server-side
notifications or other plugins' separate message-history viewers.

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
node --test valenced/tests/hide-blocked-*.test.cjs
```

For a device smoke test: open a channel containing a blocked/ignored user's
message and slash-command response, then compare with a friend's command to
the same bot. Verify the friend's response stays visible; disable the plugin
and reopen the channel to confirm the original messages return. Check an older
history page and toggle each setting.

Interaction field definitions:
[Discord's message API documentation](https://docs.discord.com/developers/resources/message#message-interaction-metadata-object).

Distributed under CC0-1.0; see [LICENSE](LICENSE).
