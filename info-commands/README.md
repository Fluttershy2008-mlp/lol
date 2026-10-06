# InfoCommands

Revenge / Vendetta-compatible Discord mobile plugin, adapted from the supplied Revenge-Plugins project (fshin, CC0).

## Install

In Revenge, open **Settings → Plugins → Add (+)** and paste:

https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/info-commands/

Disable/remove another installed copy of InfoCommands before enabling this copy to avoid duplicate slash commands.

## Use

Press and hold a server icon in Discord's server list, then tap **Server Info**. A private, scrollable information sheet shows that server's name, description, owner ID, creation date, members/online counts, boosts, verification/security settings, features, icon/banner, and server ID. Tap the server ID to copy it.

The server-info slash command has been replaced by this menu entry. The existing `/userinfo` and `/inviteinfo` commands remain available with their original options/output behavior.

The menu fetches server details only after you tap it. If the request fails or takes more than eight seconds, cached guild details are used; unavailable counts are labelled Unknown. No server-info message is sent into a channel.

Discord versions use different menu components. This plugin supports the guild menu generator, native context menu, and lazy guild action sheets. Older clients without custom sheets use a native alert. Actual device testing is still needed; this repository's automated tests use mocked Discord modules.

## Development

Requires Node.js 18+ and no npm dependencies.

```sh
npm run build
npm test
```

The build bundles the local modules into one runtime expression and adds its SHA-256 hash to manifest.json. Do not edit the generated index.js directly.
