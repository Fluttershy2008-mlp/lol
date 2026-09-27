# PingJumper for Revenge Mobile

Quickly jump back to the latest message that directly @mentioned you.

## Features

- Long-press any chat message and tap **Jump to Last Ping**.
- Searches the current server for your newest direct @mention and opens the exact message.
- In DMs, searches the current conversation.
- Falls back to already-loaded messages if Discord search is unavailable.
- Also registers `/lastping` on Revenge/Vendetta builds that expose plugin command registration.
- Ignores messages sent by your own account.

## Install

Paste this plugin folder URL into Revenge's plugin installer:

`https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/ping-jumper/`

If your Revenge build asks for a manifest URL instead, use:

`https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/ping-jumper/manifest.json`

## Notes

This version targets **direct user mentions** (`@you`). Role mentions and `@everyone` / `@here` are not included in the server search.

Discord/Revenge internals can change between app versions, so the plugin includes fallbacks where practical.
