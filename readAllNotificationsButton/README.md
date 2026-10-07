# ReadAllNotificationsButton — DM support

An updated version of Vencord's existing **Read All** button. Click it to mark unread DMs, group DMs, server text channels, voice chats, and active joined threads as read. Active joined forum posts are included through the thread store.

The button keeps its original appearance and plugin name. It also includes channels with unread mention badges, removes duplicate channel entries, skips channels without a known last message, and does nothing when everything is already read. It only runs when you click the button.

## Files

- [`index.tsx`](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/readAllNotificationsButton/index.tsx) — updated Vencord plugin source.
- [`style.css`](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/readAllNotificationsButton/style.css) — original button styling.

## Install on Discord desktop

This is a replacement for the built-in Vencord plugin, using its existing `index.tsx` and `style.css` format. It requires a Vencord source build; a raw GitHub URL alone does not install it in Discord.

1. Open your existing Vencord source folder. Use the folder containing `package.json` and `src`, preferably under your Windows user folder rather than `C:\Windows\System32`.
2. Save a backup of the current `src\plugins\readAllNotificationsButton\index.tsx` outside that plugin folder.
3. Download the two files above and put them in `src\plugins\readAllNotificationsButton\`, replacing the existing files. Keep the filenames exactly `index.tsx` and `style.css`.
4. Open a terminal in the Vencord source folder and run:

   ```sh
   pnpm install --frozen-lockfile
   pnpm build
   pnpm inject
   ```

5. Select your Discord installation in the installer, then fully close and restart Discord.
6. Open **Settings → Vencord → Plugins**, enable **ReadAllNotificationsButton**, and click **Read All** above the server list.

Because this replaces a built-in source file, keep a copy of the modified file; an upstream update may overwrite it or require resolving a Git conflict.

Official setup instructions: [Vencord source installation](https://docs.vencord.dev/installing/).

## Scope and validation

This uses Discord's existing bulk acknowledgement action and currently loaded channel/read-state data. It does not fetch closed or archived conversations, accept message requests, delete messages, or clear historical Inbox entries independently of channel read state.

Based on the supplied Vencord 1.15.10 source archive, commit `3374b8a9d8f6b051c64204917360293aad7f5d75`. Modified on 2026-10-07.

TSX transpilation and nine isolated behavior tests passed, covering private chats, mention-only badges, server/thread compatibility, duplicate entries, missing message IDs, empty work, unloaded guilds, current read state, and button lifecycle/accessibility. These tests use mocked Discord stores. A full Vencord build was not run because the required dependencies were unavailable in the offline cache, and live Discord verification remains necessary.

## License and attribution

Original plugin by kemo and the Vencord contributors, from [Vendicated/Vencord](https://github.com/Vendicated/Vencord/tree/main/src/plugins/readAllNotificationsButton). Copyright and author attribution are preserved. This modified version remains licensed under **GPL-3.0-or-later**; see [`LICENSE`](./LICENSE).
