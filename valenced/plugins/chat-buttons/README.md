# Chat Buttons

Puts composer buttons in a single menu. Based on mlemception's Chat Buttons 1.0.6.

Install Chat Buttons from Fluttershy's Valenced repository, enable it, then reopen a chat.
Use **Manage buttons** to keep individual buttons on the bar or give them a nickname.
Tap Math AI to toggle auto solve; hold it to open its calculator/settings.
Tap Auto Translate to toggle translation; hold it to open its settings.
Update Math AI to 2.2.3 and Translate to 2.0.5 for stable entries and icons.
Send stays outside the menu. Plugins that have no composer button keep their normal entry points.

The catalogue is checked with Chat Buttons enabled, including both Math AI/AutoText load orders.
The checks use React and Valenced patcher fixtures; they do not replace testing on an Android device.

## Development

`npm ci --ignore-scripts` at the repository root, then
`node valenced/plugins/chat-buttons/build.mjs` and `python3 valenced/build.py`.
Sources and upstream AGPL-3.0 licence are included in the installable ZIP.
