# ReadAllNotificationsButton for Revenge

A mobile adaptation of Vencord's `readAllNotificationsButton` by kemo.

## Install

In **Revenge → Plugins → +**, paste this entire URL, including the trailing slash:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/read-all-notifications/
```

Use the folder URL above. Revenge fetches `manifest.json` and `index.js` from it.
Reopen a chat after installing or reload Discord if the button has not appeared.

## Use

- Tap **✓ Read All** at the lower left of the chat view.
- Or open this plugin's settings and tap **Read all server notifications**.
- Or run the local **/readall** command. It does not send a chat message.

The settings let you hide the floating button, move it left/right, and optionally
require confirmation. The button hides while the keyboard is open. It defaults
to the left so it does not overlap PingJumper's right-side arrows.

## What gets marked as read

Unread server text/announcement channels, voice/stage text chats, and active
joined threads. Unread mention badges in those channels are included. This
matches the original plugin's server scope. DMs and group DMs stay unread.

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
- Checks guild membership, skips non-message channels, deduplicates channels,
  and only acknowledges known message IDs.
- Reads `GuildChannelStore`, with a guild-channel-record fallback, plus
  `ActiveJoinedThreadsStore`. Missing data is reported in plugin settings.
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
event shape, the loader contract, UI actions, missing modules, cancellation,
account changes, duplicate taps, offline/error paths and cleanup.

Tests use mocked Discord stores and native controls. They are not a live-device
test of the user's Revenge/Discord build or Discord's network acknowledgement.

## Credits and license

Original: [Vencord ReadAllNotificationsButton](https://github.com/Vendicated/Vencord/tree/main/src/plugins/readAllNotificationsButton)
by kemo, Copyright (c) 2022 Vendicated and contributors.

Mobile adaptation: Copyright (c) 2026 Fluttershy2008-mlp.

This plugin and its corresponding source are licensed under **GPL-3.0-or-later**.
See [LICENSE](LICENSE). It is provided without warranty under that license.
