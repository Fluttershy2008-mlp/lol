# InfoCommands

Revenge / Vendetta-compatible Discord mobile plugin with userinfo/inviteinfo commands by fshin and a Server Info screen adapted from the uploaded kmmiio99o Server Info 1.2.2 source.

## Install

In Revenge, open **Settings → Plugins → Add (+)** and paste:

https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/info-commands/

The existing install URL is unchanged. Disable/remove another installed copy of InfoCommands before enabling this copy to avoid duplicate commands.

## Use

Press and hold a server icon, then tap **Server Info**. The replacement interface includes the server banner/icon and description, member/online/role/channel counts, boost level, creation date, owner name and avatar, and friends in that server. Tap **Owner** or a friend to open their profile. Tap **ID** to copy the server ID. A friends list shows five entries initially and expands with **Show all**.

The original `/userinfo` and `/inviteinfo` commands keep their options and output behavior. Server information opens privately rather than sending a message to a channel.

The uploaded replacement originally targets Revenge Next and depends on `dev.kmmiio99o.lib`. This version adapts its UI to the existing Vendetta-compatible install, so that additional library is not required. The original uploaded files are preserved under `vendor/revenge-next-server-info`; adapted files are under `src/server-info`. See THIRD_PARTY_NOTICES.md for attribution.

Guild requests and friend-member requests happen only when opening the screen. Guild fetches time out after eight seconds; cached guild data remains visible with a notice. Unknown counts display an em dash. Friends that have not been returned to the local member store are not presented as confirmed members. Store listeners and timers are removed when the sheet closes.

The guild menu generator, native context menu, and lazy guild action sheets are supported. Clients without custom action sheets retain the earlier native-alert fallback. Actual device testing is still needed; automated tests simulate Discord modules and render the replacement components.

## Development

Requires Node.js 18+.

```sh
npm ci
npm run build
npm test
```

The pinned esbuild dependency compiles the TypeScript/TSX replacement with the local compatibility adapter and embeds everything in index.js. The build updates the SHA-256 hash in manifest.json. Do not edit the generated index.js directly.
