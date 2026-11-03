# Double Tap Edit

Double-tap the text of your own message to open Discord's normal message editor. Tap Send to save your changes. Works for normal text messages and replies in servers, group chats and DMs. Other people's messages keep their normal tap behaviour.

Refresh your Valenced repository, install **Double Tap Edit**, fully restart Discord and reopen the chat. Settings are available through the plugin settings page. Choose Fast (250 ms), Normal (350 ms) or Relaxed (500 ms).

If Quick Delete is enabled, turn off **Tap for quick actions** in its settings. Both plugins claim the message-tap gesture; which handles it first depends on their load order. Single taps on your own text are delayed by the double-tap interval. Long presses, media taps and swipes cancel a pending double tap and continue normally.

Only opens the editor: it never sends an edit automatically. Checks the current account, selected channel and message again at the second tap. Skips system messages, bots, webhooks, unsent/deleted messages and messages without text. Cleans up patches, listeners and pending taps on stop.

Validation uses Valenced's repository test harness and patcher. No physical Android device test was available; compatibility still needs confirmation on the user's Discord build.
