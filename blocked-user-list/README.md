# Blocked User List

A Revenge Discord mobile plugin by **fluttershy_simper**.

Shows the blocked users on your currently signed-in account. Search by display name, username or ID; tap a user or **Profile** to open Discord’s native profile; tap **Unblock** and confirm to remove the block.

## Install

In **Settings → Revenge → Plugins**, tap **+**, then paste this folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/blocked-user-list/
```

Enable the plugin, then open **Blocked User List → Configure** on the Plugins page. Older versions show a settings button (cog or sliders) instead.

## Details

- Shows avatars, display names, usernames and exact user IDs.
- Uses a virtualized list to keep long block lists responsive.
- Updates when Discord’s relationship/user stores change, and provides Refresh.
- Rechecks the account and block before an unblock request; repeated taps do not send duplicate requests while a request is pending.
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
