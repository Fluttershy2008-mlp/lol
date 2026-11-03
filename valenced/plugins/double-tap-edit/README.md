# Tap To Edit

Tap your own text message **once** to open Discord's **Editing Message** composer. Tap Send to save the edit. Works for normal text messages and replies in servers, group chats and DMs.

Refresh your Valenced repository and update the existing Double Tap Edit plugin to **Tap To Edit 1.1.0**, then fully restart Discord. Its plugin ID stays the same, so this is an update to the existing installation.

Keep **Quick Delete 1.2.2** and **Tap for quick actions** enabled. Your own editable text messages open the editor immediately; other messages use Quick Actions immediately. Hold any message for Discord's full menu. One-tap edit takes priority over Quick Delete's one-tap delete/reply modes for your own editable text messages while this plugin is enabled. Turning it off restores Quick Delete's selected tap action.

Only opens the editor; it never sends an edit automatically. Rejects other accounts' messages, system messages, bots, webhooks, unsent/deleted messages and messages without text. Uses native MessagesHandlers callbacks and React/JSX fallbacks. Removes hooks and listeners when stopped. Old double-tap timing settings are no longer used.

Automated checks use the Valenced test harness and patcher, including both Quick Delete load orders and native callbacks. Physical Android testing remains necessary.
