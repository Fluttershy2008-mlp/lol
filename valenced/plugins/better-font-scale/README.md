# Better Font Scale for Valenced Android

Refresh Fluttershy’s Valenced repository and install **Better Font Scale** from **Browse Plugins**. Enable the plugin, fully restart Discord, then open the plugin’s settings from its card.

Set an individual size for Messages, Chatbox, Username, About Me, Game Status, Profile Status, Timestamp, Channel Category Name, Channel Name, Voice Channel Name, or Channel Thread Name. Sizes are in scaled points (8–48), with decimals supported. **0** uses Discord’s current default for that field. Tap **Save**, then restart Discord to apply updates to all existing screens. **Reset all** fills in zero for every field. Tap **Save** to confirm the reset.

The native hooks target Discord’s Android message renderer and composer. The React Native hooks apply to profile text, member activity, and server channel lists. This beta was checked against Discord Android 353.11 native code and 355.5 React Native module layouts. An on-device run is still pending.

Inspired by [RazerTexz’s Aliucord plugin](https://github.com/RazerTexz/my-plugins/tree/main/BetterFontScale).

## Build

Regenerate the native JAR with an Android SDK JAR, a D8 JAR, and a JDK (Java 17 or later).

```sh
ANDROID_JAR=/path/to/android.jar D8_JAR=/path/to/r8.jar python3 source/build.py
```

Run `python3 valenced/build.py` from the repository root to regenerate the catalog and ZIP.
