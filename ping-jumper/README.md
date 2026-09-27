# PingJumper for Revenge Mobile

Navigate your Discord pings with floating arrow buttons directly in chat.

## Features

- Adds two floating chat buttons:
  - **↑ Older ping**
  - **↓ Newer ping**
- Uses Discord's Recent Mentions history.
- Includes direct @mentions, role mentions, and everyone-style mentions when Discord returns them.
- Automatically loads another page of older pings when needed.
- Works across servers and supported DM/group-DM mentions.
- Long-press a message and use **Jump to Latest Ping**.
- /lastping still jumps straight to your newest ping on builds that expose plugin commands.
- Shows your current position, such as Ping 3 of 25+ loaded.

## Install

Paste this plugin folder URL into Revenge's plugin installer:

https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/ping-jumper/

If your Revenge build asks for a manifest URL instead, use:

https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/ping-jumper/manifest.json

## Controls

Press **↑** repeatedly to move backward through older pings.

Press **↓** to move forward toward newer pings. If you are already on the newest ping, pressing it again can refresh the recent-mentions list for newly received pings.

Discord/Revenge internals can change between app versions, so the plugin keeps the message-menu and command fallbacks if the floating ChatView overlay is unavailable.
