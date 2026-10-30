# InfoCommands

Revenge / Vendetta-compatible Discord mobile plugin with userinfo/inviteinfo commands by fshin and a Server Info screen adapted from the uploaded kmmiio99o Server Info 1.2.2 source.

## Install

For **Valenced**, use the [Valenced repository](https://fluttershy2008-mlp.github.io/lol/valenced/index.json) and update **InfoCommands to 1.0.0-beta7**. Server Info now opens an ordinary Discord navigation screen, keeping the banner, icon/name, Overview, Server and Friends in Server. Tap **ID** to copy the server ID, or **Owner** / a friend to open Discord's native profile above this screen. Closing the profile returns to Server Info; **Close** or Android Back then returns to the previous Discord screen. Force-close and reopen Discord after updating to release any window retained by beta6.

For **Revenge Next**, use the [Next repository](https://fluttershy2008-mlp.github.io/lol/index.json) and install **InfoCommands (Next preview) 1.0.0-beta14**. The shared source includes Valenced's replacement navigator screen; Next retains its existing native sheet and emergency popup behavior. If that sheet never appears, cannot render, or has no visible layout, cached details appear in a native popup with copy/profile actions. After updating, fully restart Discord.

For **Revenge Classic / Vendetta**:

In Revenge, open **Settings → Plugins → Add (+)** and paste:

https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/info-commands/

The existing install URL is unchanged. Disable/remove another installed copy of InfoCommands before enabling this copy to avoid duplicate commands.

## Use

Press and hold a server icon, then tap **Server Info**. The replacement interface includes the server banner/icon and description, member/online/role/channel counts, boost level, creation date, owner name and avatar, and friends in that server. Tap **Owner** or a friend to open their profile. Tap **ID** to copy the server ID. A friends list shows five entries initially and expands with **Show all**.

The original `/userinfo` and `/inviteinfo` commands keep their options and output behavior. Server information opens privately rather than sending a message to a channel.

The uploaded replacement originally targets Revenge Next and depends on `dev.kmmiio99o.lib`. This version adapts its UI to the existing Vendetta-compatible install, so that additional library is not required. The original uploaded files are preserved under `vendor/revenge-next-server-info`; adapted files are under `src/server-info`. See THIRD_PARTY_NOTICES.md for attribution.

Guild requests and friend-member requests happen only when opening the screen. Guild fetches time out after eight seconds; cached guild data remains visible with a notice. Unknown counts display an em dash. Friends that have not been returned to the local member store are not presented as confirmed members. Store listeners and timers are removed when the sheet closes.

The guild menu generator, native context menu, and lazy guild action sheets are supported. Valenced registers Server Info with its native SettingsNavigator, including when Settings modules are cold. It creates no React alert, RN Modal, private alert-store entry or backdrop. The owner profile uses Discord's normal native profile stack while Server Info stays underneath. Closing a route releases its data listeners, timers and pending navigation; stale controls, account changes and disabling the plugin cannot open an old profile or pop an unrelated screen.

The beta6 timing change did not resolve freezing on the affected phone. Beta7 removes the nested dialog structure entirely. Automated checks now reject both old dialog APIs and exercise the real registration/navigation contract, profile X and Android Back, returning to the app, cold Settings loading, cancellation and teardown. These are simulated module/native-host tests; beta7 still needs verification on the affected phone. The shared source ships as Classic 1.2.12 and Next beta14.

## Development

Requires Node.js 18+.

```sh
npm ci
npm run build
npm test
```

The pinned esbuild dependency compiles the TypeScript/TSX replacement with the local compatibility adapter and embeds everything in index.js. The build updates the SHA-256 hash in manifest.json. Do not edit the generated index.js directly.
