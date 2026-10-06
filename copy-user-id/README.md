# Copy User ID

Long-press a Discord message to see **Copy User ID** followed by the message author's ID. Tap the row to copy only the ID to your clipboard. Works for messages in servers and DMs, including your own messages. Developer Mode is not required.

You can also open someone's profile and tap **⋯** to see **Copy User ID** beside **Copy Username**. The profile option displays that person's ID and copies only the ID when tapped. Supports regular and bot profile overflow menus. Both options are included in the same plugin.

## Install in Revenge

Copy this entire folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/copy-user-id/
```

Open **Settings → Revenge → Plugins → +**, paste/import the URL, install, and enable **Copy User ID**. Then long-press a message and tap the new row beside the copy-text actions.

Already installed? Update the plugin and restart Discord to load version **1.1.0**. The install URL is unchanged.

## Compatibility

Targets classic Revenge's Vendetta-compatible plugin API, `MessageLongPressActionSheet`, `UserProfileOverflowMenu`, `BotUserProfileOverflowMenu`, and user context menus. Supports function, memo, forward-ref and class message sheet components, plus nested menu components. Discord updates can change these internal menus. Automated tests cover simulated message/profile menus and clipboard behavior; an Android device test has not been performed. Revenge Next's different plugin API is not targeted.

If the row does not appear, restart Discord and check that the plugin is enabled. Share your Discord and Revenge versions if it still fails.

## Development

No dependencies are required. With Node.js installed:

```sh
npm run build
npm test
```

Commit both `index.js` and `manifest.json` after building. The manifest hash updates automatically. The install URL points at the folder, not `manifest.json` or `index.js`.

The ID is read from the selected message author and kept as a string. No extra Discord requests, permissions, or persistent storage are used. Disabling the plugin removes its menu patch and makes any already-open row inactive.
