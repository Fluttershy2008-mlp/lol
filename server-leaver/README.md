# Server Leaver for Revenge

Keep your 22 main servers and leave other unprotected Discord servers from one settings page. Add more protection using server IDs or the Protect button beside each server.

Author: **fluttershy_simper**

## Install

In Revenge, open **Settings → Revenge → Plugins → +** and paste this whole folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/server-leaver/
```

Enable the plugin. Open **Server Leaver** in Revenge settings, or use the plugin card’s settings/configure button if the shortcut is unavailable.

This package targets Revenge’s Vendetta-compatible URL plugin loader, matching the other plugins in this repository. It is not a Revenge Next repository-format plugin.

## Main protected list

Version **1.0.5** (Valenced **1.0.0-beta6**, Next **1.0.0-beta7**) includes the [22 requested main server IDs](src/main-protection.mjs). They remain protected when the field is cleared, plugin data is reset, or the Discord account changes. Main rows show a disabled **Main protected** button. Saving the field restores any main IDs removed from it. Existing additional IDs are preserved during the update and remain scoped to their account.

Main IDs for servers an account has not joined do not block the preview. Unknown additional IDs still require correction or removal. Every leave request rechecks main protection independently of the stored list and confirmation snapshot. Enabling or updating the plugin does not leave servers.

For Valenced, refresh the existing repository, update Server Leaver to **1.0.0-beta5**, and fully restart Discord. Its existing entry remains in Valenced settings.

## Scrolling fix

Version 1.0.5 (Valenced beta6, Next beta7) moves the protected-ID editor into an **Edit protected IDs** dialog. The scrolling preview has no editable ID field to focus or scroll toward after Protect is tapped. Save closes the dialog; Cancel or Android Back discards unsaved edits. Account switches close the editor. The native modal is separate from the preview list. Hosts without modal support retain the bounded inline editor. It keeps the preview in name order when Protect or Remove protection is tapped. The ID editor has a fixed 160-point height and scrolls internally, so adding IDs does not resize the list header. Protect and Save dismiss the keyboard before updating the editor. The preview listens for guild and theme changes instead of polling every 1.2 seconds; Refresh remains available. Android native clipping is disabled for this list while FlatList virtualization remains enabled.

## Use

1. Your 22 main IDs are already protected. Tap **Edit protected IDs** and paste any **additional server IDs you want to KEEP**. Separate them with spaces, commas, semicolons or new lines. To copy a server ID, enable Discord Developer Mode and use the server menu’s Copy Server ID action. You can also tap **Protect** beside a server.
2. Tap **Save protected IDs**. Additional protections are saved separately for each Discord account.
3. Check the preview: **KEEP** servers stay; **LEAVE** servers will be left. An additional ID not in your current server list blocks leaving until corrected or removed.
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

The build emits `index.js` and `manifest.json`, including the SHA-256 bundle hash used for plugin updates. The 28 source/runtime checks cover exact main IDs, preservation of existing lists, account isolation, protected/owned servers, protection independent of the saved list, serial requests, confirmation changes, cancellation, failure handling and compatibility-loader evaluation. Six native settings checks run on both Valenced and Next, covering the locked main rows, additional IDs, account switches, absent main guilds and a confirmed simulated queue that only targets an unprotected server. Regression checks also cover repeated Protect/Remove actions in a 197-server preview, stable row/list identity with no mounted ID editor while protecting, separate bounded editing, Save/Cancel/Android Back and account changes, keyboard dismissal, no periodic list updates, real guild/theme events and listener cleanup. Tests use mocked Discord modules and send no real leave requests. On-device Revenge behavior remains untested.

The plugin uses Discord’s existing HTTP client for leave requests. It does not read or store your account token.

MIT license. The settings shortcut follows the existing Friends List shortcut in this repository.
