# Message Bubbles

Round the text in Discord’s Android chat. Other people’s messages use plum,
indigo or berry based on their Discord user ID. Your messages use blue and align
to the right. The palette adjusts for dark text. Discord still renders links,
mentions and inline emoji inside each bubble.

For your own text messages, the reply preview and reactions sit on the right
and the repeated profile header is hidden. Emoji-only messages use Discord’s
large emoji presentation with a little vertical spacing.

Refresh Fluttershy’s Valenced repository, install **Message Bubbles**, then fully
close and reopen Discord. Enable or disable it from **Settings → Valenced → Plugins**.

The plugin targets Discord’s Android message renderer in channels, DMs and threads.
Incoming messages keep their native avatar and reply preview. Attachments use
their existing layout. The updated hook targets were checked against Discord
Android 352.6 Alpha. The beta2 layout still needs phone testing.

## Rebuild the Android payload

Run `python3 source/build.py` with `ANDROID_JAR` set to the Android SDK platform
36 JAR, `XPOSED_JAR` set to the Xposed API JAR, `KOTLIN_STDLIB` set to Kotlin’s
stdlib JAR and `D8_JAR` set to the D8 or R8 JAR. The compile-only Valenced ABI
declarations are excluded from the payload.
