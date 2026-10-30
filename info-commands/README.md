# InfoCommands

Revenge / Vendetta-compatible Discord mobile plugin with userinfo/inviteinfo commands by fshin and a Server Info screen adapted from the uploaded kmmiio99o Server Info 1.2.2 source.

## Install

For **Valenced**, use the [Valenced repository](https://fluttershy2008-mlp.github.io/lol/valenced/index.json) and update **InfoCommands to 1.0.0-beta6**. Server Info opens a themed, scrollable bottom panel matching the supplied layout: banner, icon/name, Overview, Server and Friends in Server. Cached details appear immediately while fresh data loads. Tap **ID** to copy the server ID, or **Owner** / a friend to open their profile. Close, the backdrop and Android Back hide the panel immediately, even if Discord retains or delays removing the hosting alert. After updating, force-close and reopen Discord.

For **Revenge Next**, use the [Next repository](https://fluttershy2008-mlp.github.io/lol/index.json) and install **InfoCommands (Next preview) 1.0.0-beta13**. The shared source includes the Valenced panel and profile dismissal fix; Next retains its existing native sheet and emergency popup behavior. If that sheet never appears, cannot render, or has no visible layout, cached details appear in a native popup with copy/profile actions. After updating, fully restart Discord.

For **Revenge Classic / Vendetta**:

In Revenge, open **Settings → Plugins → Add (+)** and paste:

https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/info-commands/

The existing install URL is unchanged. Disable/remove another installed copy of InfoCommands before enabling this copy to avoid duplicate commands.

## Use

Press and hold a server icon, then tap **Server Info**. The replacement interface includes the server banner/icon and description, member/online/role/channel counts, boost level, creation date, owner name and avatar, and friends in that server. Tap **Owner** or a friend to open their profile. Tap **ID** to copy the server ID. A friends list shows five entries initially and expands with **Show all**.

The original `/userinfo` and `/inviteinfo` commands keep their options and output behavior. Server information opens privately rather than sending a message to a channel.

The uploaded replacement originally targets Revenge Next and depends on `dev.kmmiio99o.lib`. This version adapts its UI to the existing Vendetta-compatible install, so that additional library is not required. The original uploaded files are preserved under `vendor/revenge-next-server-info`; adapted files are under `src/server-info`. See THIRD_PARTY_NOTICES.md for attribution.

Guild requests and friend-member requests happen only when opening the screen. Guild fetches time out after eight seconds; cached guild data remains visible with a notice. Unknown counts display an em dash. Friends that have not been returned to the local member store are not presented as confirmed members. Store listeners and timers are removed when the sheet closes.

The guild menu generator, native context menu, and lazy guild action sheets are supported. Valenced mounts the bottom panel through its React alert host and React Native Modal, avoiding the earlier invisible lazy-sheet path. Its height is bounded to the window, and one scroll view contains the banner and all rows. The earlier native-alert fallback is retained only if the custom panel cannot be presented. Actual device testing is still needed; automated tests simulate Discord modules and render the replacement components.

The beta5 Close fix controls the panel's own rendering rather than depending on host removal. Both the text and its touch target close it. An owned host entry is removed from the alert store if normal dismissal fails; unrelated alerts are preserved. Each opening has a distinct key so delayed cleanup cannot close a reopened panel. Closing also releases the data listeners/timers and invalidates old actions.

Beta6 addresses the frozen home screen after closing the owner's profile. Owner/friend taps wait for both the Server Info content to unmount and its alert host to dismiss (or its owned store entry to be removed), then open the profile after interactions. The panel uses no native slide animation because Android does not provide Modal.onDismiss. A fixed 180 ms timer no longer opens a profile over a closing window. A stalled host cancels the tap after 2.5 seconds; a late dismissal, a new panel, disabling the plugin or switching accounts cannot revive it. The shared source is Classic 1.2.11 and Next beta13. Automated native-window and delayed-host fixtures reproduce the old overlap; physical-device verification is still needed.

## Development

Requires Node.js 18+.

```sh
npm ci
npm run build
npm test
```

The pinned esbuild dependency compiles the TypeScript/TSX replacement with the local compatibility adapter and embeds everything in index.js. The build updates the SHA-256 hash in manifest.json. Do not edit the generated index.js directly.
