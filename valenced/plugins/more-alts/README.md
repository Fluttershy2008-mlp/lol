# More Alts! for Valenced

Open **Discord Settings → Valenced → More Alts!**. The **Accounts** tab shows your current session and your other accounts. Tap **Switch account** for the quick switcher or **Add account** for the current Discord session, credentials, or token sign-in. The **Preferences** tab contains switching options, storage and backup, and account management. For Discord MFA or CAPTCHA, complete Discord’s normal sign-in and choose **Save Currently Logged-in Account**.

Open **Inbox** and turn on **Save inbox summaries** to see unread DM chat and server mention counts across your added accounts. Each account updates while it is active and connected. Tap an account to open its newest unread DM or server mention, or tap **Open unread DMs** or **Open server mentions** to choose a category. More Alts waits for the selected account to connect before opening the conversation. When Discord has the exact server mention, it opens the message directly. Otherwise it opens the channel with the unread mention or Discord’s notifications tab. Choose **Review unread across accounts** to go through unread DM chats and server mentions in one pass. More Alts starts with the active account and moves through the other added accounts. On Android, the review controls float just below Discord’s toolbar. Use **Pause**, **Next**, or **Stop** there. Automatic advance waits eight seconds after Discord shows the item as read and only runs while the chat is active and the keyboard is closed. Summaries stay on this device. Turn the setting off or tap **Clear saved summaries** to erase them.

In **Preferences → Switching**, enable **Native Account Switcher** and **Other Account Push Notifications**. Discord registers accounts in its built-in switcher for push delivery, up to its five-account limit. If a saved account is missing there, sign in to it through Discord’s switcher. Tapping a Discord message notification switches to the receiving account and opens the message. The red dot on your You-bar profile picture marks recent pushes from another account. Opening that account clears its dot. Android notification permission and Discord’s notification settings still apply.

The update keeps the plugin ID and upgrades the old saved-account records in place. The Android vault is an app-private local copy of saved sessions. Turn on **Enable Account Export** to show **Export Accounts**, which copies session tokens to the clipboard. Treat exported JSON as sign-in credentials.

The `source` tree contains Rosie's linked More Alts implementation, its changelog helpers, and compile-only Valenced API sources. The app provides the API and Kotlin standard library at runtime.

- JavaScript: run `npm ci` at the repository root, then `node valenced/plugins/more-alts/build.mjs`.
- Android: run `sh valenced/plugins/more-alts/build-native.sh /path/to/tools` with JDK 21, Kotlin compiler 2.4.10 and its Maven runtime dependencies, Xposed API 82 as `xposed.jar`, R8 9.1.57 as `r8.jar`, and Android platform 36 as `android.jar` in that tools directory.
- Repository package: run `python3 valenced/build.py` from the repository root.

[Rosie's source](https://code.is-your.app/SheWhoReignsSupreme/Valenced-Plugins/src/commit/19b5f3267c05e24c12c65c59c5bcdaf3e21dc104/plugins/more-alts)
