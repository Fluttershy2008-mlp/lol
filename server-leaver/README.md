# Server Leaver for Revenge

Leave your unprotected Discord servers from one settings page. Protect the servers you want to keep using their IDs or the Protect button beside each server.

Author: **fluttershy_simper**

## Install

In Revenge, open **Settings → Revenge → Plugins → +** and paste this whole folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/server-leaver/
```

Enable the plugin. Open **Server Leaver** in Revenge settings, or use the plugin card’s settings/configure button if the shortcut is unavailable.

This package targets Revenge’s Vendetta-compatible URL plugin loader, matching the other plugins in this repository. It is not a Revenge Next repository-format plugin.

## Use

1. Paste the **server IDs you want to KEEP**. Separate them with spaces, commas, semicolons or new lines. To copy a server ID, enable Discord Developer Mode and use the server menu’s Copy Server ID action. You can also tap **Protect** beside a server.
2. Tap **Save protected IDs**. The list is saved separately for each Discord account.
3. Check the preview: **KEEP** servers stay; **LEAVE** servers will be left. An ID not in your current server list blocks leaving until corrected or removed.
4. Tap **Leave unprotected servers**, read the confirmation, and confirm. The plugin leaves the listed targets one at a time. Keep Discord open.
5. Use **Stop leaving** to stop sending further requests. A request already sent may still finish.

Servers you own, unavailable servers and servers with missing ownership information are kept automatically. DMs and group DMs are excluded. Only servers in the confirmed preview are considered; newly joined servers are not added to a running operation. Protection and ownership are rechecked before each request.

Loading or enabling the plugin never leaves servers. Account changes, disabling the plugin, backgrounding Discord and request failures stop the queue. No requests are retried automatically. A timeout may still finish at Discord; refresh before starting a new operation. Leaving cannot be undone automatically; rejoining may require an invite.

## Build and checks

Requires Node.js; no dependencies.

```sh
cd server-leaver
npm run build
npm test
```

The build emits `index.js` and `manifest.json`, including the SHA-256 bundle hash used for plugin updates. Automated checks cover ID validation, account isolation, protected/owned servers, serial requests, confirmation changes, cancellation, failure handling and compatibility-loader evaluation. Tests use mocked Discord modules and send no real leave requests. On-device Revenge behavior remains untested.

The plugin uses Discord’s existing HTTP client for leave requests. It does not read or store your account token.

MIT license. The settings shortcut follows the existing Friends List shortcut in this repository.
