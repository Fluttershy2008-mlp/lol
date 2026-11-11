# Message Bubbles

Your Discord messages use blue bubbles on the left. Other people’s messages
use plum, indigo or berry bubbles on the right, based on their Discord user ID.
The palette adjusts for dark text. Discord renders links, mentions and inline
emoji inside each bubble.

Reply previews and reactions follow their message side for regular text rows.
Your own text messages use the compact header. Emoji-only messages keep
Discord’s large emoji presentation.

Refresh Fluttershy’s Valenced repository, install **Message Bubbles**, then fully
close and reopen Discord. Enable or disable it from **Settings → Valenced → Plugins**.

The plugin targets Discord’s Android message renderer in channels, DMs and threads.
Incoming avatars and attachments use their native layout. The updated hook targets were checked against Discord
Android 352.6 Alpha. The beta3 layout still needs phone testing.

## Rebuild the Android payload

Run `python3 source/build.py` with `ANDROID_JAR` set to the Android SDK platform
36 JAR, `XPOSED_JAR` set to the Xposed API JAR, `KOTLIN_STDLIB` set to Kotlin’s
stdlib JAR and `D8_JAR` set to the D8 or R8 JAR. The compile-only Valenced ABI
declarations are excluded from the payload.
