# Double Tap Edit

Double-tap the text of your own message to open Discord's normal message editor. Tap Send to save your changes. Works for normal text messages and replies in servers, group chats and DMs. Other people's messages keep their normal tap behaviour.

Refresh your Valenced repository, install **Double Tap Edit**, fully restart Discord and reopen the chat. Settings are available through the plugin settings page. Choose Fast (250 ms), Normal (350 ms) or Relaxed (500 ms).

Update to **Double Tap Edit 1.0.1** and **Quick Delete 1.2.2** together, then fully restart Discord. Keep Quick Delete's **Tap for quick actions** enabled. Single-tap your own message to open Quick Actions after the double-tap interval; double-tap it to open **Editing Message** in the normal composer. Both plugin load orders are supported. One-tap reply/delete modes also wait for the double-tap interval on editable own messages. Other people's messages retain their immediate quick actions.

The plugin connects to native MessagesHandlers instances, including arrow callbacks captured before the React view is created, with React/JSX wrapping as a fallback. Long presses, media taps and swipes cancel a pending double tap and continue normally. Pooled React Native events are retained until the single tap is delivered.

Only opens the editor: it never sends an edit automatically. Checks the current account, selected channel and message again at the second tap. Skips system messages, bots, webhooks, unsent/deleted messages and messages without text. Cleans up patches, listeners and pending taps on stop.

Validation uses Valenced's repository test harness and patcher. The combined suite checks single and double taps in both plugin load orders, native callbacks, constructor/getter restoration, account/channel changes and pooled events. No physical Android device test was available; compatibility still needs confirmation on the user's Discord build.
