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
- No startup polling, automatic user-profile fetching, external telemetry or stored copies of your block list.

Targets the Revenge/Vendetta compatibility plugin API, using the same install format as this repository’s other plugins. The separate Revenge Next plugin API is not targeted. If a native API is unavailable, the screen/action reports it.

## Development

Requires Node.js 18+. No npm dependencies are needed.

```sh
npm test
npm run build
```

`build.mjs` produces the installable `index.js` and its SHA-256 `manifest.json`. Tests run the produced bundle against simulated Discord stores and native actions. Live testing on Android is still needed to confirm compatibility with a specific Discord/Revenge build.
