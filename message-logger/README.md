# Message Logger 1.2.0

Stability update of redstonekasi's Vendetta Message Logger for Revenge and other Vendetta-compatible clients.

## Update / install

Update the existing Message Logger plugin, then fully close and reopen Revenge.
Check that the plugin shows **1.2.0**. If it still shows an older version, remove
that plugin and reinstall using this folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/message-logger/
```

Keep only one Message Logger enabled. Restarting also removes any old renderer
hooks and temporarily retained messages from the previous version.

## What changed

- Replaced native chat-row highlighting with a plain `[deleted]` content label.
  The plugin no longer changes RowManager, native highlight fields, or the
  native `edited` field.
- Removed the MessageRecord reconstruction hook. Only `id`, `channel_id`, and
  `content` are sent in a partial update; Discord keeps its normalized author,
  attachment, reaction, and timestamp data.
- Deferred updates until after the deletion handler returns, with no more than
  ten operations every 16 ms. If Flux is still dispatching, work waits.
- Retains up to **50 deleted messages per channel and 200 total**. Oldest entries
  are removed. During extreme bursts, the bounded work queue lets new deletions
  proceed normally rather than growing without limit.
- Cancels queued work on logout and removes channel work when that channel is
  deleted. Unload also handles pending evictions and rapid re-enabling.
- Limits opt-in PluralKit lookups to two concurrent requests, with a ten-second
  abort deadline. Late responses cannot affect a new plugin session. Runtimes
  without AbortController skip these optional lookups.
- Uses React Native controls in settings instead of removed Discord Forms and
  icon components.

## Behavior

Single and bulk deletions are supported for messages already in Discord's local
cache. This is a temporary deletion logger; it does not recover messages deleted
before installation or while offline, and does not provide edit history.
Discord can evict cached messages independently. Disabling the plugin or
restarting the app clears retained history.

**Ignore PluralKit** is off by default. When enabled it sends message IDs to
PluralKit's public API, never message content or Discord credentials. Lookup
failures leave the retained message alone.

## Build and tests

From `vendetta-plugins/`:

```sh
npm install --ignore-scripts
npm run test:message-logger
```

The build produces `dist/message-logger/index.js` and a SHA-256-hashed manifest.
Publish them together to `message-logger/` when releasing an update.

28 automated tests execute the distributed bundle with Vendetta's real
spitroast patcher, strict simulated records/Flux dispatch, and a deterministic
scheduler. They cover single/bulk deletes, preservation of normalized records,
unchanged native row rendering, dispatch re-entry, a 2,000-deletion burst,
retention/queue bounds, unload/reload, and failed/cancelled/stale PluralKit work.
A regression check against 1.1.0 fails the deferred-update/record-safety test.

An Android/Revenge runtime was not available. These checks do not reproduce or
prove a fix for every native app exit. If Revenge still closes, include your
Discord version, Revenge version, the action preceding the exit, and its crash
log. Android crashes may require an Android crash report rather than a JS error
screen. Briefly disabling Message Logger can help establish whether it is the
cause.

Original plugin by redstonekasi, BSD-3-Clause. See `LICENSE`.
