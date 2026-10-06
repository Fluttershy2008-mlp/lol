# Copy User ID

Long-press a Discord message to see **Copy User ID** followed by the message author's ID. Tap the row to copy only the ID to your clipboard. Works for messages in servers and DMs, including your own messages. Developer Mode is not required.

## Install in Revenge

Copy this entire folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/copy-user-id/
```

Open **Settings → Revenge → Plugins → +**, paste/import the URL, install, and enable **Copy User ID**. Then long-press a message and tap the new row beside the copy-text actions.

## Compatibility

Targets classic Revenge's Vendetta-compatible plugin API and `MessageLongPressActionSheet` menu. Supports function, memo, forward-ref and class sheet components, plus nested menu components. Discord updates can change this internal menu. Automated tests cover simulated menu and clipboard behavior; an Android device test has not been performed. Revenge Next's different plugin API is not targeted.

If the row does not appear, restart Discord and check that the plugin is enabled. Share your Discord and Revenge versions if it still fails.

## Development

No dependencies are required. With Node.js installed:

```sh
npm run build
npm test
```

Commit both `index.js` and `manifest.json` after building. The manifest hash updates automatically. The install URL points at the folder, not `manifest.json` or `index.js`.

The ID is read from the selected message author and kept as a string. No extra Discord requests, permissions, or persistent storage are used. Disabling the plugin removes its menu patch and makes any already-open row inactive.
