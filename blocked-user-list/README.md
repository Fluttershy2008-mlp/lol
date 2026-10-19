# Blocked User List

A Revenge Discord mobile plugin by **fluttershy_simper**.

Shows the blocked users on your currently signed-in account. Tap **Block User ID**, paste a copied Discord user ID, then tap **Block** to block that person. Search by display name, username or ID; tap a user or **Profile** to open Discord’s native profile; tap **Unblock** and confirm to remove the block.

## Install

In **Settings → Revenge → Plugins**, tap **+**, then paste this folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/blocked-user-list/
```

Enable the plugin, then open **Settings → Revenge → Blocked Users**. The new shortcut appears directly beneath **Plugins**, alongside Themes, Fonts and Account Switcher.

To update an existing installation, use **Refetch** on the plugin and reopen Settings (or restart Discord). The install URL stays the same.

The plugin’s **Configure/settings** button on the Plugins page also opens the list.

## Block APP / Tupperbox / webhook messages

Use **Block APP / Webhook ID** for APP messages such as Tupperbox proxies. These are hidden locally instead of being sent to Discord's user-block API. This support is included in this plugin; no separate message-hiding plugin is required.

1. Long-press the APP/proxy message and copy its **author's User ID**, not the message ID or the human sender's ID.
2. Open **Settings → Revenge → Blocked Users → Block APP / Webhook ID**.
3. Paste the copied ID. Plain numeric IDs and copied `<@ID>` / `<@!ID>` mentions are accepted.
4. Optionally enter the exact character name, such as **Allo**, then tap **Block**.

Tupperbox can share a webhook ID between characters. Adding the exact name restricts the rule to that name on that ID. Leaving it blank hides every message from that ID, including other characters sharing it. Names are case-sensitive; a renamed character needs a new matching rule. A different webhook ID in another channel needs its own rule.

Copy from the proxy message itself: Tupperbox's main bot ID or the real sender's ID cannot identify a proxy when Discord does not include that ID on the message. The plugin does not infer the human sender behind a webhook.

Local APP entries appear at the top of this list with an **Unblock** button. Rules are saved per signed-in account in plugin storage and survive restarts. They affect this device's chat list while the plugin is enabled. They do not change Discord's server-side block list, notifications, other devices, search results, or other plugins' independent message viewers. Unblocking or disabling restores the cached chat messages. If an open channel has not refreshed, switch channels and return.

Both cached and newly received messages are filtered before chat rows are built, without deleting messages, changing gateway events, or overwriting Discord's original message records. Arrays and Discord's `_array`/`_map` channel collections are supported, preserving pagination and collection prototypes. Unsupported formats stay unchanged and display a compatibility error in this screen.

Background: [Tupperbox's webhook explanation](https://tupperbox.app/guide/faq) and [Discord's message fields](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx).

## Block by user ID

1. Copy the person's Discord user ID (enable Discord's Developer Mode if needed).
2. Open **Settings → Revenge → Blocked Users** and tap **Block User ID**.
3. Long-press the input and paste the ID, then tap **Block**.

The ID stays as exact text. Invalid IDs, your own account and already-blocked users are rejected. Failed requests keep the form open so you can correct the ID or retry. New entries appear when Discord confirms the block in its relationship store; use **Refresh** if needed.

## Details

- Shows avatars, display names, usernames and exact user IDs.
- Adds a native **Blocked Users** settings row, preserving the existing section and other plugins’ rows. Disabling the plugin hides the shortcut.
- Uses a virtualized list to keep long block lists responsive.
- Updates when Discord’s relationship/user stores change, and provides Refresh.
- Rechecks the signed-in account before block/unblock actions; repeated taps do not send duplicate requests while a request is pending.
- Keeps users listed until Discord reports the block was removed. Failed requests leave the list intact.
- Only blocked relationships are included. Friends, requests and ignored users are excluded.
- Uncached users remain visible by ID. Opening their profile lets Discord load their details.
- No startup polling, automatic user-profile fetching or external telemetry. Native Discord blocks are read from its relationship store; only local APP rules are saved in plugin storage.

Targets the Revenge/Vendetta compatibility plugin API, using the same install format as this repository’s other plugins. The separate Revenge Next plugin API is not targeted. If a native API is unavailable, the screen/action reports it.

## Development

Requires Node.js 18+. No npm dependencies are needed.

```sh
npm test
npm run build
```

`build.mjs` produces the installable `index.js` and its SHA-256 `manifest.json`. Tests run the produced bundle against simulated Discord stores and native actions, and verify APP/webhook filtering, shared IDs with exact names, persistence, account isolation, restoring messages, frozen collections, and pagination. Live testing on Android is still needed to confirm compatibility with a specific Discord/Revenge build.

The collection projection helper is reused from this repository’s `hide-blocked-and-ignored-messages` plugin under CC0-1.0; its source attribution is preserved.
