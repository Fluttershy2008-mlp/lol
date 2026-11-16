# Streak Tracker for Valenced

Refresh the [Valenced repository](https://fluttershy2008-mlp.github.io/lol/valenced/index.json), install **Streak Tracker** from **Browse Plugins**, then fully restart Discord. Open **Settings → Valenced → Streak Tracker** for your stats and preferences.

- Send a message while the plugin is running to mark that day. Each tracked DM, group DM or server can gain one day per local calendar day. All channels and threads in a server share one streak. You have until your phone’s next local midnight to extend yesterday’s streak.
- **Who to track → DMs** accepts Discord user IDs or mentions. Tap **Add user IDs**, then enable **Only selected users** to limit one-to-one DMs to that list.
- **Who to track → Group DMs** accepts group DM channel IDs. **Servers** accepts server IDs. Both are opt-in. Add IDs to track selected chats, or enable **Track all group DMs** or **Track all servers**. Each Discord account has its own lists. Excluded chats stop earning days and their history retains the normal expiry rules.
- **Messages** shows a fire badge beside DM and group DM previews. Long-press a tracked server icon to see its streak in the server menu. DM badges are orange for days 1–49, purple for 50–99 and red for 100+. Counts over 999 appear as **999+** while the accessibility label reads the full count. Milestone notifications appear at 10, 50 and 100 days.
- When you miss a day, the DM or group DM badge fades into smoke the first time that preview renders on the day the streak expires. The effect follows Android’s reduce-motion setting and can be turned off in the plugin.
- The dashboard shows active streaks, how many need a message today, your personal best and the five longest active streaks. Use its switches to manage badges, smoke and milestone notifications separately, or clear the signed-in account’s streak history.
- Counting starts with new outgoing messages. Streak totals, Discord IDs and the latest known chat name or recipient username are stored on this device, separately for each signed-in account. Message text is never stored.

Inspired by [TermitJs’s Streak Tracker for Discord](https://github.com/TermitJs/Streak-Tracker-for-Discord).

The beta package has automated checks for tracking, settings, leaderboard names, compact badges and animation lifecycle. Badge layout and smoke rendering on a physical Android device still need verification.
