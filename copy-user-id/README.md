# Copy User ID

Long-press a Discord message to see **Copy User ID** followed by the message author's ID. Tap the row to copy the ID in Discord mention format, such as `<@753962426407452713>`, to your clipboard. Works for messages in servers and DMs, including your own messages. Developer Mode is not required.

You can also open someone's profile and tap **⋯** to see **Copy User ID** beside **Copy Username**. The profile option displays that person's ID and copies it as `<@ID>` when tapped. Supports regular and bot profile overflow menus. Both options are included in the same plugin.

## Valenced

Use the [Valenced repository](https://fluttershy2008-mlp.github.io/lol/valenced/index.json) and update **Copy User ID (Valenced) to 1.0.0-beta3**. Force-close Discord and reopen it, then open a profile and tap **⋯**. The row shows **Copy User ID** followed by the full user ID; tapping it copies `<@ID>` without sending a message.

This version resolves profile menus by Valenced's imported-path API, including unnamed exports and menus opened for the first time after a minute. An existing English **Copy User ID** row is upgraded instead of duplicated. Without that native row, the plugin adds its own beside **Copy Username**, with a fallback placement for other languages. Developer Mode is not required. Disabling the plugin removes the hooks, cancels pending subscriptions and disables actions in already-open menus.

## Install in Revenge

Copy this entire folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/copy-user-id/
```

Open **Settings → Revenge → Plugins → +**, paste/import the URL, install, and enable **Copy User ID**. Then long-press a message and tap the new row beside the copy-text actions.

Already installed? Update the plugin and restart Discord to load version **1.1.4**. The install URL is unchanged.

## Compatibility

The Classic bundle targets Revenge's Vendetta-compatible API, `MessageLongPressActionSheet`, `UserProfileOverflowMenu`, `BotUserProfileOverflowMenu`, and user context menus. Separate Valenced and Revenge Next packages use their respective adapters. Supports function, memo, forward-ref and class components, plus nested menu components. Discord updates can change these internal menus. Automated tests cover simulated message/profile menus and clipboard behavior; an Android device test has not been performed.

If the row does not appear, restart Discord and check that the plugin is enabled. Share your Discord and Revenge versions if it still fails.

## Development

No dependencies are required. With Node.js installed:

```sh
npm run build
npm test
```

Commit both `index.js` and `manifest.json` after building. The manifest hash updates automatically. The install URL points at the folder, not `manifest.json` or `index.js`.

The ID is read from the selected message author and kept as a string. No extra Discord requests, permissions, or persistent storage are used. Disabling the plugin removes its menu patch and makes any already-open row inactive.
