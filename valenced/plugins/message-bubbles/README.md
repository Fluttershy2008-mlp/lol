# Message Bubbles

Round the text in Discord’s Android chat. Other people’s messages use plum or
indigo based on their Discord user ID. Your messages use blue and align to the
right. The colours have a lighter variation for dark text. Discord still renders
the message text, links, mentions, and inline emoji inside each bubble.

Refresh Fluttershy’s Valenced repository, install **Message Bubbles**, then fully
close and reopen Discord. Enable or disable it from **Settings → Valenced → Plugins**.

The plugin targets Discord’s Android message renderer in channels, DMs and threads.
Reply previews, avatars, reactions, and attachments use Discord’s normal layout.
The hook targets were checked against Discord Android 352.6 Alpha. On-device
rendering still needs verification.

## Rebuild the Android payload

Run `python3 source/build.py` with `ANDROID_JAR` set to the Android SDK platform
36 JAR, `XPOSED_JAR` set to the Xposed API JAR, `KOTLIN_STDLIB` set to Kotlin’s
stdlib JAR and `D8_JAR` set to the D8 or R8 JAR. The compile-only Valenced ABI
declarations are excluded from the payload.
