# Profile Status Presets for Revenge

Save multiple Discord custom statuses and switch between them with one tap.

## Install

In **Discord Settings → Revenge → Plugins → +**, paste this entire URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/profile-status-presets/
```

Use the folder URL above, including the trailing slash. Enable **Profile Status Presets**.

## Use

- Open **Settings → Revenge → Profile Status Presets**, or the plugin's settings button.
- Use **New preset** to save a name, text, optional emoji and expiry.
- Use **Save current status** to copy your existing text and emoji into a new preset.
- Tap **Apply** on a preset to update your Discord profile.
- **Edit**, **Delete**, and **Clear current status** are available on the same page.
- Run the local **`/statuspresets`** command from a chat to open the page. It sends no chat message.

Presets are saved on this device separately for each Discord account. Saving, editing, deleting, enabling or disabling the plugin does not automatically change your status. Online, idle, Do Not Disturb and invisible are preserved when applying or clearing a custom status.

Expiry options: **Don't clear**, **30 minutes**, **1 hour**, **4 hours**, and **Today**. The countdown starts again whenever you apply a preset; Today uses your phone's next local midnight. Saving your current status copies its text and emoji and lets you choose a fresh expiry.

Unicode emoji can be pasted directly. Custom emoji can be captured from your current status or entered as `<:name:ID>` / `<a:name:ID>`. Discord's usual emoji access and Nitro restrictions apply. Discord limits status text to 128 characters.

## Compatibility

Targets Revenge Classic / Bunny / Vendetta-compatible plugin loading, including the current Revenge main bundle `1b1d297`. The optional settings shortcut is hidden when the native registry cannot be safely extended; the plugin's settings button remains available. The settings renderer preserves other plugins' rows and keeps a hidden record after disable to protect cached native settings lists.

Uses Discord's preloaded user settings updater when available. Older layouts can use Discord's authenticated REST client. Only `customStatus` / `custom_status` is changed. No token handling, external service, startup status change, rotation loop or background status writer is included.

Updates are serialized. Server errors and rate limits are shown, with no automatic retries. Saved presets remain available after failed updates. Restart Discord if modules or shortcuts are unavailable after installing an update.

## Development and verification

No dependency installation is required. Use Node.js 20 or later:

```sh
npm run build
npm test
```

`build.mjs` creates the self-contained `index.js` expression expected by Revenge's loader and refreshes the SHA-256 manifest hash. Commit source, tests, manifest and built bundle together.

Automated coverage includes preset persistence, account isolation, expiry, Unicode and custom emojis, native/REST payloads, preservation of presence settings, failures and rate limits, mobile UI interactions, the local command, lifecycle cleanup, settings-row safety, and loader evaluation. These use mocked Discord/React Native modules; installation and live account updates on a physical Android device have not been verified in this environment.

Compatibility references:

- [Revenge loader](https://github.com/revenge-mod/revenge-bundle/blob/main/src/core/vendetta/plugins.ts)
- [Revenge command API](https://github.com/revenge-mod/revenge-bundle/blob/main/src/lib/api/commands/index.ts)
- [Existing settings shortcut integration](https://github.com/Fluttershy2008-mlp/lol/blob/main/relationship-notifier/src/shortcut.js)

## License

GPL-3.0-or-later. Copyright (c) 2026 Fluttershy2008-mlp. See [LICENSE](LICENSE). The settings shortcut is adapted from this repository's GPL-licensed RelationshipNotifier integration.
