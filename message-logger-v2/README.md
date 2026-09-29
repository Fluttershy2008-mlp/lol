# Message Logger V2 2.0.3 for Revenge

Mobile adaptation of Vencord MessageLogger's deleted messages, edit history,
attachment history and ignore filters. Extends the existing Revenge 1.2.0
retention engine and its deferred-update crash safeguards.

This separate install URL uses its own plugin settings. Keep only this copy
enabled if you previously installed the original Message Logger.

## Install or update

Paste this **folder URL** into Revenge Settings → Plugins → Add:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/message-logger-v2/
```

If already installed from this URL, update the plugin and fully close and reopen
Revenge. Check that it shows **2.0.3**. If the old version remains cached, remove
it and reinstall using the URL above. Keep only one Message Logger enabled.

### 2.0.3 crash safeguards

- After a Discord build rejects the `[deleted]` label, real message edits are
  passed through without adding that rejected label again. Deleted messages
  remain cached with their original text and in the history viewer.
- Limit unfinished synthetic dispatches to ten, in addition to the existing
  per-tick and queue limits. Work resumes when an update finishes; it does not
  spin timers or keep submitting updates while the native dispatcher is stalled.
- Contain errors in the logger's event transformation, forwarding the original
  event exactly once. Errors from Discord's own dispatcher retain their normal
  behavior.
- Guard the PluralKit timeout's abort call and final promise cleanup against
  exceptions. Session changes also reset unfinished-work tracking.

This source replaces the unsafe message-record/RowManager patches in the
original Vendetta ZIP. Keep only one Message Logger installation enabled.

### 2.0.2 settings shortcut

A **Message Logger** row appears in Discord Settings' **Revenge** section, below
RelationshipNotifier when installed, alongside CustomRPC and Profile Status
Presets. It opens the full Message Logger settings page, with the **Open message
history** button. Update the plugin, restart Revenge and reopen Settings to see it.

The shortcut uses Revenge's existing settings section and registers a valid
native renderer before exposing the row. Unloading removes only its own row and
keeps stale native keys safe, avoiding the earlier `.parent` settings crash.
Unsupported settings APIs leave the existing plugin settings and command usable.

The separate **Message Logger V2** installation is also updated at:
`https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/message-logger-v2/`.

### 2.0.1 chat retention fix

- Handles `dispatch`, `dirtyDispatch` and `maybeDispatch`, including forwarding
  between them, so mobile deletion paths cannot bypass the hook through these APIs.
- A failed `[deleted]` label update now leaves the original message in chat.
  The old fallback incorrectly dispatched a real deletion when adding the label
  failed. Both synchronous errors and rejected dispatch promises are handled.
- Accepts mobile `channelId` records and channel IDs supplied by the event, and
  tries another cache if one lookup throws.
- Settings show **Deletions seen**, **Kept in chat** (session counts) and **Last
  deletion**, including reasons such as ignored bots, a disabled retention option
  or an uncached message. No message content or IDs are included in this status.

For a new test, keep **Log deleted messages** and **Keep deleted messages in chat**
on. If testing a bot message, switch **Ignore bots** off. This update preserves
your existing filter choices.

## Use

- Deleted messages stay in chat with a `[deleted]` prefix by default. If the
  current Discord build rejects that cosmetic update, the original text remains
  and the plugin stops attempting the label for the rest of that session.
- Run **`/messagelogger`** in a chat to open its local history. The command opens
  a screen and does not send anything to the channel.
- Or use **Discord Settings → Revenge section → Message Logger → Open message
  history**, or **Plugins → Message Logger → settings → Open message history**.
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
directory, alongside this README. Publish the same bundle and hash to
`message-logger-v2/` too, retaining that manifest's **Message Logger V2** name.

56 automated checks execute the distributed bundle with the real spitroast
patcher and simulated Discord stores, Flux dispatch and timers. They cover
the prior crash regressions, bulk/burst deletes, edits and empty text, removed
attachments, filters, local commands, history limits and cleanup, plus alternate
mobile event paths and synchronous/asynchronous label failures. The label-error,
alternate-dispatch and mobile-record regression cases fail against 2.0.0 and
pass against 2.0.1 and later. Shortcut checks cover native navigation, row order,
safe unload/re-enable and renderer replacement. Four new regression cases fail
against 2.0.2 and pass against 2.0.3, covering rejected labels on real edits,
unfinished dispatch limits, event-transform errors, and abort-timeout errors.
A real Android
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
