# InfoCommands

Revenge / Vendetta-compatible Discord mobile plugin with userinfo/inviteinfo commands by fshin and a Server Info screen adapted from the uploaded kmmiio99o Server Info 1.2.2 source.

## Install

For **Valenced**, refresh the [Valenced repository](https://fluttershy2008-mlp.github.io/lol/valenced/index.json) and update **InfoCommands to 1.0.0-beta8**. Fully restart Discord, long-press a server icon and tap **Server Info**. The plugin also has an **Open current server info** button in its settings.

For **Revenge Next**, use the [Next repository](https://fluttershy2008-mlp.github.io/lol/index.json) and install **InfoCommands (Next preview) 1.0.0-beta15**. Next uses its native sheet and can show a cached details popup when the sheet cannot open.

For **Revenge Classic / Vendetta**:

In Revenge, open **Settings → Plugins → Add (+)** and paste:

https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/info-commands/

The existing install URL is unchanged. Disable/remove another installed copy of InfoCommands before enabling this copy to avoid duplicate commands.

## Use

Valenced's **Overview** shows the server banner, icon and description, member and online counts, channels, roles, boosts, owner, creation and join dates, language, and verification level. The role count excludes the default @everyone role. Tap the server icon or banner to open the image, **ID** to copy the server ID, or **Vanity invite** to copy the invite when the server has one.

**Friends**, **Blocked** and **Ignored** show confirmed members of the selected server. Each list checks missing membership when opened and loads new results as Discord returns them. Tap a member or the owner to open their Discord profile. Close or Android Back dismisses the Server Info screen. A profile opens above it so closing the profile returns to the same tab.

The original `/userinfo` and `/inviteinfo` commands retain their options and output. Classic and Next show the server banner and icon, counts, owner, creation date and server ID, with an expandable Friends in Server list.

Guild requests start only when opening Server Info. If the server request fails or times out, cached details remain visible. Unknown counts show an em dash. The native Valenced route releases store listeners, timers and pending actions when closed or when the plugin stops.

The design combines the supplied Server Info 1.2.2 layout by kmmiio99o with features from the [Vencord ServerInfo plugin](https://github.com/Vendicated/Vencord/tree/main/src/plugins/serverInfo) by V and Nuckyz. See [source attribution](THIRD_PARTY_NOTICES.md). Automated tests cover startup, navigation, commands, membership loading and cleanup. Physical Android testing is pending.

## Development

Requires Node.js 18+.

```sh
npm ci
npm run build
npm test
```

The pinned esbuild dependency compiles the TypeScript/TSX replacement with the local compatibility adapter and embeds everything in index.js. The build updates the SHA-256 hash in manifest.json. Do not edit the generated index.js directly.
