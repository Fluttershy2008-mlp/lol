# Chat Buttons

Puts composer buttons in a single menu. Based on mlemception's Chat Buttons 1.0.6.

Install Chat Buttons from Fluttershy's Valenced repository, enable it, then reopen a chat.
Use **Manage buttons** to keep individual buttons on the bar or give them a nickname.
Tap Math AI to toggle auto solve; hold it to open its calculator/settings.
Tap Auto Translate to toggle translation; hold it to open its settings.
Update Math AI to 2.2.3 and Translate to 2.0.5 for stable entries and icons.
Tap **Hidden users & servers** to open HideBlockedAndIgnoredMessages settings directly.
This is a navigation shortcut; tapping it does not toggle the plugin or its hide settings.
The target plugin must be enabled. The shortcut supports nicknames and pinning through
**Manage buttons**, just like the other entries.
Send stays outside the menu. Other plugins that have no composer button keep their normal entry points.

The catalogue is checked with Chat Buttons enabled, including both Math AI/AutoText load orders.
The checks use React and Valenced patcher fixtures; they do not replace testing on an Android device.

## Loader fix (1.0.8)

The loader receives a plain options object during preInit; React/Discord imports are evaluated at startup. The final generated bundle is transformed for Hermes function scoping. This prevents the export getters from all capturing the last loop key, which made the 1.0.7 default export resolve to a function instead of the plugin options object. Refresh the repository, update Chat Buttons, and fully restart Discord.

## Direct settings panel (1.0.11)

Update **HideBlockedAndIgnoredMessages to beta14** and **Chat Buttons to 1.0.11**,
then fully restart Discord. The hider now supplies its own composer action, and
Chat Buttons collects it into **Buttons → Hidden users & servers**. Tapping opens
the hider's live settings in a native Modal attached to the composer, without
settings-route navigation or cross-plugin API helpers. There is only one entry,
and existing nicknames/pinning use the same ID. The shortcut disappears when the
hider stops; it also works directly on the composer without Chat Buttons.

Regression checks require the actual settings panel to render with navigation
silently doing nothing. They edit the live icon switch and server IDs, close and
reopen the panel, and cover both plugin load orders and cleanup.

## Previous settings shortcut (1.0.9)

Adds **Buttons → Hidden users & servers**, using Valenced's public
`api.pluginSettings.openPluginSettings` API to open the existing native settings
route with the target plugin's live storage. No copy of its settings or server list
is maintained in Chat Buttons. The entry works in either plugin load order and
offers the gear-icon fallback if native navigation is unavailable. Update Chat
Buttons and fully restart Discord once.

Checks cover menu navigation, unchanged hide settings on tap, the target settings
page's live icon switch, pinning, nicknames and cleanup. The original catalogue
coexistence and actual Hermes options-loader checks remain in place. Physical
Android testing remains needed.

## Settings opener compatibility fix (1.0.10)

The settings helper may be missing or attached after Chat Buttons starts on some
Valenced builds. The shortcut now reads the current host API when tapped, then
falls back to the same native navigation route used by the plugin's gear button.
It no longer mistakes a missing helper for a disabled HideBlockedAndIgnoredMessages
plugin. Pending navigation-readiness callbacks are removed when Chat Buttons stops.

Regressions cover a genuinely enabled target without the optional settings helper
and a helper added after Chat Buttons has started; both fail with 1.0.9 and pass
with 1.0.10. Update **Chat Buttons** and fully restart Discord once. Existing hide
settings, pinning and nicknames stay intact. Physical phone navigation still needs
verification.

## Development

`npm ci --ignore-scripts` at the repository root, then
`node valenced/plugins/chat-buttons/build.mjs` and `python3 valenced/build.py`.
Sources and upstream AGPL-3.0 licence are included in the installable ZIP.
