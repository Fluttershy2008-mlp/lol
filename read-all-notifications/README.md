# ReadAllNotificationsButton for Revenge

A mobile adaptation of Vencord's `readAllNotificationsButton` by kemo. Version
1.2.0 adds forum/media channels and unfollowed posts alongside server chats and DMs.

## Install

In **Revenge → Plugins → +**, paste this entire URL, including the trailing slash:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/read-all-notifications/
```

Use the folder URL above. Revenge fetches `manifest.json` and `index.js` from it.
Reopen a chat after installing or reload Discord if the button has not appeared.

## Use

- Tap **✓ Read All** at the lower left of the chat view.
- Or open this plugin's settings and tap **Read all notifications**.
- Or run the local **/readall** command. It does not send a chat message.

The settings let you hide the floating button, move it left/right, and optionally
require confirmation. The button hides while the keyboard is open. It defaults
to the left so it does not overlap PingJumper's right-side arrows.

## What gets marked as read

Unread server text/announcement channels, voice/stage text chats, forum and
media channels, loaded posts and threads (including unfollowed posts and cached
archived threads), direct messages and group DMs. Unread mention badges in those
channels are included. All of these are included automatically after updating.

Forums have two read markers: the parent channel's new-post indicator and each
post's unread replies. Read All now includes both, even when a forum is absent
from the visible channel list or its posts have not been followed. It uses the
newest known post ID for the parent and the newest known message ID for each post.

Individual posts must be available in Discord's local stores. This does not
download a server's entire archived history or join threads. The parent marker
covers new posts up to its known latest post, but replies in uncached archived
threads cannot be checked individually. Missing store support is reported in
the plugin's settings instead of silently claiming full coverage.

This does not delete messages, clear Discord's recent-mention history, delete
notifications from the Activity tab, or dismiss Android system notifications.
It is a manual action: enabling the plugin does not mark anything as read.

The desktop plugin inserts a button above the server list. The mobile port uses
a floating chat button plus plugin settings because mobile has a different UI.
If Discord changes the ChatView component, the settings button and local command
remain available. Compatibility with future Discord changes cannot be guaranteed.

## Implementation

- Uses the native `BULK_ACK` event with `context: "APP"`, channel IDs,
  last-message IDs and `readStateType: 0`, as in the supplied Vencord source.
- Leaves acknowledgement networking to Discord's own handler and queue.
- Checks guild membership, skips categories and directory channels, deduplicates
  channels, and only acknowledges known message/post IDs. Snowflake IDs are
  compared as decimal strings to avoid JavaScript number precision loss.
- Merges `GuildChannelStore` with the full cached guild-channel index, plus
  joined/unjoined `ActiveJoinedThreadsStore` lists, `ActiveThreadsStore`,
  `ChannelStore.getAllThreadsForGuild` and resolvable channel read states.
  The private-channel lists still support records and ID arrays. Missing data
  is reported in plugin settings; missing optional helpers do not stop other reads.
- Includes forum-specific unread/new-post predicates and uses channel metadata
  when the read-state store has no last message ID. Forum parents use a thread
  creation ID, never a thread reply ID or a generated timestamp.
- Optional confirmation holds the original snapshot. It does not mark messages
  arriving after the snapshot as read. An account change or unloading the plugin
  invalidates the pending action.
- Uses React Native controls, including native Alert for optional confirmation.
  It does not register any custom Discord settings-tree row.
- Installs through Revenge's Vendetta-compatible plugin loader.

## Build and test

No third-party build dependencies are needed. With a current Node.js version:

```sh
cd read-all-notifications
npm run build
npm test
```

`build.mjs` builds the installable single-expression `index.js` and updates the
manifest's SHA-256 hash. The tests check channel selection, exclusions, native
event shape, forum parent/post snapshots, unfollowed and cached archived threads,
snowflake precision, the loader contract, UI actions, missing modules, cancellation,
account changes, duplicate taps, offline/error paths and cleanup.

Tests use mocked Discord stores and native controls. They are not a live-device
test of the user's Revenge/Discord build or Discord's network acknowledgement.

## Credits and license

Original: [Vencord ReadAllNotificationsButton](https://github.com/Vendicated/Vencord/tree/main/src/plugins/readAllNotificationsButton)
by kemo, Copyright (c) 2022 Vendicated and contributors.

Mobile adaptation: Copyright (c) 2026 Fluttershy2008-mlp.

This plugin and its corresponding source are licensed under **GPL-3.0-or-later**.
See [LICENSE](LICENSE). It is provided without warranty under that license.
