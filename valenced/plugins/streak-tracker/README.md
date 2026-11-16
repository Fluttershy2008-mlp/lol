# Streak Tracker for Valenced

Refresh the [Valenced repository](https://fluttershy2008-mlp.github.io/lol/valenced/index.json), install **Streak Tracker** from **Browse Plugins**, then fully restart Discord. Open **Settings → Valenced → Streak Tracker** for your stats and preferences.

- Send a message in a one-to-one DM while the plugin is running to mark that day. Each DM can gain one day per calendar day. You have until your phone’s next local midnight to extend a streak from yesterday. Sending after a missed day starts a new streak at one.
- **Messages** shows a compact fire badge alongside tracked DM previews. Badges are orange for days 1–49, purple for 50–99 and red for 100+. Counts over 999 appear as **999+** while the accessibility label reads the full count. Milestone notifications appear at 10, 50 and 100 days.
- When you miss a day, the badge fades into smoke the first time that preview renders on the day the streak expires. The effect follows Android’s reduce-motion setting and can be turned off in the plugin.
- The dashboard shows active streaks, how many need a message today, your personal best, and the five longest active streaks. Discord friend nicknames, display names and usernames help identify each DM. Tap the settings switches to manage badges, smoke and milestone notifications separately, or clear the signed-in account’s streak history.
- Tracking starts with new outgoing messages. Streak totals, Discord IDs and the last known recipient username are stored on this device, separately for each signed-in account. Message text is never stored.

Inspired by [TermitJs’s Streak Tracker for Discord](https://github.com/TermitJs/Streak-Tracker-for-Discord).

The beta package has automated checks for tracking, settings, leaderboard names, compact badges and animation lifecycle. Badge layout and smoke rendering on a physical Android device still need verification.
