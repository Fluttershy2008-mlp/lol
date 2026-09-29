# Message Logger 2.0.0 for Revenge

Mobile adaptation of Vencord MessageLogger's deleted messages, edit history,
attachment history and ignore filters. Extends the existing Revenge 1.2.0
retention engine and its deferred-update crash safeguards.

## Install or update

Paste this **folder URL** into Revenge Settings → Plugins → Add:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/message-logger/
```

If already installed from this URL, update the plugin and fully close and reopen
Revenge. Check that it shows **2.0.0**. If the old version remains cached, remove
it and reinstall using the URL above. Keep only one Message Logger enabled.

## Use

- Deleted messages stay in chat with a `[deleted]` prefix by default.
- Run **`/messagelogger`** in a chat to open its local history. The command opens
  a screen and does not send anything to the channel.
- Or open **Plugins → Message Logger → settings → Open message history**.
- Switch between all / deleted / edited entries, search text or IDs, and tap
  an entry for earlier versions, timestamps and attachment details.
- Clear one message, a channel, or all history. Clearing only affects local
  history and retained deleted chat rows; it does not delete live Discord messages.

## Settings

- Log deletes and edits independently; both default to on.
- Save attachment names and links, including attachments removed by edits.
  This does not download or permanently save files. Discord CDN links can expire.
- Keep deleted messages in chat, or switch this off to use only the log viewer.
- Ignore bots (on by default), yourself (off by default), or specific user,
  channel, category and server IDs. IDs match whole tokens, separated by commas
  or whitespace. Settings apply to future events.
- Optional **Ignore PluralKit originals** retains the previous plugin's opt-in
  lookup. It only applies to deletions retained in chat. It sends the message ID
  to `api.pluralkit.me`, never text or Discord credentials. It defaults to off;
  existing preferences are preserved. At most two requests run concurrently.

## Mobile behavior and limits

History exists in memory only and clears on restart, disable or account logout.
Settings persist. Messages deleted before the plugin can observe them, while
offline, or outside Discord's local cache cannot be recovered.

The viewer keeps up to **200 messages**, **50 per channel**, and **10 previous
versions plus the current version per message**. Each version stores at most
4,000 text characters and 10 attachment records. A separate 2,000,000-character
serialized-history budget can remove older records sooner. Native chat retention
has its own 200-total / 50-per-channel limits; no more than ten queued operations
are processed every 16 ms. Heavy deletion bursts may be logged only in the viewer.

This is a mobile adaptation, not Vencord's desktop CSS and Webpack patches.
Deleted text uses a plain label; earlier edits are shown in the viewer rather
than under each chat message. Desktop red overlays, clickable edited markers
and context-menu patches are not included. No RowManager/native highlight or
MessageRecord reconstruction hooks are installed. Ordinary updates pass through
to Discord; synthetic labels update only message ID, channel ID and content.

## Build and validation

The complete source is in `vendetta-plugins/plugins/message-logger/`.
From the repository's `vendetta-plugins/` directory:

```sh
npm install --ignore-scripts
npm run test:message-logger
```

The build emits `dist/message-logger/index.js`, a manifest with a SHA-256 hash,
`LICENSE` and `NOTICE`. Publish these together to the top-level `message-logger/`
directory, alongside this README.

41 automated checks execute the distributed bundle with the real spitroast
patcher and simulated Discord stores, Flux dispatch and timers. They cover
the prior crash regressions, bulk/burst deletes, edits and empty text, removed
attachments, filters, local commands, history limits and cleanup. A real Android
Revenge runtime was not available, so these checks do not guarantee that every
Discord build is compatible or free of native crashes.

## Credits and license

Vencord MessageLogger by Vendicated and contributors, including rushii, Ven,
AutumnVN, Nickyux, Kyuuhachi and sadan:
https://github.com/Vendicated/Vencord/tree/main/src/plugins/messageLogger

Mobile adaptation for Fluttershy2008-mlp, based on the existing redstonekasi
Vendetta logger and Revenge stability fixes. Distributed under GPL-3.0-or-later.
`NOTICE` preserves the BSD-3-Clause copyright and terms for the retained code.

Source: https://github.com/Fluttershy2008-mlp/lol/tree/main/vendetta-plugins/plugins/message-logger
