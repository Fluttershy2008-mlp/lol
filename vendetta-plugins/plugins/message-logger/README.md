# Message Logger 1.1.0

Compatibility repair of redstonekasi's Vendetta Message Logger.

## Install

Disable the old Message Logger first, then add this **folder URL** in your
Vendetta-compatible client's Plugins screen:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/message-logger/
```

Enable Message Logger and restart Discord. Test by deleting a message that was
visible while the plugin was enabled. Only messages already in Discord's local
cache can be retained. Deletions before installation or while offline cannot be
recovered. This build logs deletions; it does not add edit history. Retention is
temporary and clearing the plugin or restarting the app clears the log.

## Changes

- Supports single and bulk deletions, including batches containing uncached messages.
- Discovers modules on load and rolls back hooks if startup fails.
- Uses MessageStore with a legacy ChannelMessages fallback.
- Removes the dependency on the named MessageRecord constructor.
- Tracks deletion flags outside Discord's records, including frozen records.
- Keeps the red highlight where the RowManager renderer is available; otherwise
  shows a `[deleted]` text label.
- Removes all retained messages on unload without skipping adjacent entries.
- Handles PluralKit lookup failures and ignores responses from a previous session.

The optional **Ignore PluralKit** setting sends the message ID to PluralKit's
public API. It is off by default. Message text and Discord credentials are not sent.

## Build and tests

From the source project directory:

```sh
npm install --ignore-scripts
npm run test:message-logger
```

The build writes `dist/message-logger/index.js`, its hashed manifest, and the
license. Upload that directory to the install URL when updating this plugin.
The GitHub source copy is in `vendetta-plugins/`.

Twelve automated regression tests exercise the distributed bundle with
Vendetta's real spitroast patcher and simulated Discord stores/renderers.
An Android/Discord runtime was unavailable for device testing; compatibility
with every Discord or Vendetta fork version is not guaranteed. If the plugin
reports unsupported message modules, include your client name, Discord version,
and the error text when reporting it.

Original plugin by redstonekasi, BSD-3-Clause. See `LICENSE`.
