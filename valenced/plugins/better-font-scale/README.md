# Better Font Scale for Valenced Android

Refresh Fluttershy’s Valenced repository and install **Better Font Scale** from **Browse Plugins**. Enable the plugin, fully restart Discord, then open the plugin’s settings from its card.

Tap a setting to open its slider, exact value, and preview. Font sliders use whole scaled points from 8 to 48, and the number field also accepts decimals. **Use default** restores Discord’s current size for one field, and **Reset all** restores every field. Tap **Save**, then restart Discord to apply updates to all existing screens. Previously saved sizes carry over.

**Word Spacing** adjusts the width of regular gaps between words in chat messages. Move its slider or enter a percentage from −50% to +100%. **0%** restores Discord’s spacing. This setting changes the display and keeps the original message text intact.

The native hooks target Discord’s Android message renderer and composer. The React Native hooks apply to profile text, member activity, and server channel lists. This beta was checked against Discord Android 353.11 native code and 355.5 React Native module layouts. An on-device run is still pending.

Inspired by [RazerTexz’s Aliucord plugin](https://github.com/RazerTexz/my-plugins/tree/main/BetterFontScale).

## Build

Regenerate the native JAR with an Android SDK JAR, a D8 JAR, and a JDK (Java 17 or later).

```sh
ANDROID_JAR=/path/to/android.jar D8_JAR=/path/to/r8.jar python3 source/build.py
```

Run `python3 valenced/build.py` from the repository root to regenerate the catalog and ZIP.
