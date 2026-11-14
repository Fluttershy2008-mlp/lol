# Read All Plus 2.1.1

An expanded version of Read All Servers for Valenced Discord, customised for fluttershy_simper67.

## Install

1. Refresh Fluttershy’s Valenced repository and install or update **Read All Plus**. You can also install the release ZIP from file.
2. Enable **Read All Plus**, then fully close and reopen Discord.
3. Hold the **Messages** icon in the server sidebar to open the panel. You can also open **Read All Plus** from the Valenced settings section, or use this plugin's **Settings** button in the plugin manager.

Button labels in Valenced may vary slightly by build. The plugin manager's Settings button is available even when a Discord UI change prevents the sidebar shortcut from appearing.

Tap **Close** or use Android **Back** to return to the Discord screen you opened the panel from.

## What you can do

- Mark every available unread conversation as read, including servers, individual channels, DMs, group chats and loaded active threads.
- Clear **servers only**, **DMs and groups only**, the **current channel**, or the **current server**.
- Search by channel, person, server or ID and select exactly which conversations to clear.
- Exclude whole servers or individual channels and conversations. A protected server also protects its threads; an excluded parent channel also protects its loaded child threads.
- Include or skip muted conversations, and protect any conversation with mentions.
- See how many conversations are ready, preview a bulk action, follow its progress, and stop the remaining batches.
- Review recent results, clear your activity history, and choose quiet completion.
- Keep exclusions separate for each signed-in Discord account.

## Defaults

Muted conversations and active threads are included. Mention protection is off, and the preview confirmation is on. Exclusions start empty. Nothing is marked as read simply by enabling the plugin or opening Discord.

## How it behaves

“Read” means **mark messages as read** and clear their unread markers. This plugin does not speak or summarise message content. It works with Discord's channel and read-state information and uses Discord's normal read acknowledgement flow.

Actions capture the latest known message for each target when you preview the action. Messages arriving afterwards stay unread. The queue sends at most 25 conversations per batch and pauses between batches. Stop cancels batches that have not been submitted; messages already marked as read cannot be undone.

Only channels available to your account and loaded into Discord can be included. Joined active threads and voice/stage text chats are included when their read state and latest message are available. Unavailable, hidden or unloaded conversations are skipped. This does not enumerate every archived forum post or download message history.

The result separates **confirmed**, **awaiting confirmation**, **failed** and **skipped** updates. A completed queue is not a guarantee that Discord has finished syncing every acknowledgement. If the app is offline or a new Discord build changes its read-state internals, unconfirmed items remain visible instead of being reported as successes.

Switching accounts or disabling the plugin stops the remaining queue. Saved history contains timestamps and counts, not message contents. The plugin makes no independent HTTP requests and loads no remote scripts.

## Compatibility and validation

Packaged for Valenced's format-1 manifest and `valenced.api` version 1. Uses the current supported plugin settings, storage, patcher, action-sheet and Flux APIs. The full-screen panel uses Discord theme colours where available. Tabs and the queue controls stay visible while the content scrolls. Channels and exclusions use virtualized lists, and the selection bar stays visible while you scroll the Channels tab.

The included automated tests cover channel discovery, private chats, thread inheritance, muted channels, mentions, message snapshots, queue batching, stop/disable, account changes, error reporting, plugin loading, settings access and the long-press shortcut. Tests use mocked Discord stores. This package has not been run on your Android device, so the live Discord UI and server synchronisation still need an on-device check.

## Source and rebuild

All source is included in `source/`. Node.js 20 or newer is sufficient; no dependencies are needed.

```sh
cd source
node build.cjs
node --test tests/*.test.cjs
```

The root `index.js` is the runnable installation script. `source/` is included for inspection and modification, not as a substitute for the compiled script.

## Credits

Original **Read All Servers 1.0.2**: sapphire / aeongdesu, <https://github.com/aeongdesu/slimplugins>.

The original Messages long-press hook informed this version. The server-channel bulk acknowledgement shape was cross-checked against the ReadAllNotificationsButton implementation in Vencord, <https://github.com/Vendicated/Vencord/tree/main/src/plugins/readAllNotificationsButton>. The native API and manifest were checked against <https://github.com/Valenced/valenced>.

Licensed under GPL-3.0-or-later. See `LICENSE` and `NOTICE.txt`.
