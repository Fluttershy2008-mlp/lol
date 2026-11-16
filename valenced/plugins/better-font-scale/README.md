# Better Font Scale for Valenced Android

Refresh Fluttershy’s Valenced repository and install **Better Font Scale** from **Browse Plugins**. Enable the plugin, fully restart Discord, then open the plugin’s settings from its card.

Tap a setting to open its slider, exact value, and preview. Font sliders use whole scaled points from 8 to 48, and the number field also accepts decimals. **Use default** restores Discord’s current size for one field, and **Reset all** restores every field. Tap **Save**, then restart Discord to apply updates to all existing screens. Previously saved sizes carry over.

**Compact OpenDyslexic** loads suggested sizes and spacing for a font you already use. It sets Messages and Chatbox to 14 sp, Reply Preview to 12 sp, Word Spacing to −35%, Letter Spacing to −4% of font size, and Line Spacing to −12%. Review or adjust the values, tap **Save**, and restart Discord. The preset keeps the active typeface and your other settings.

**Word Spacing** applies to messages and reply previews. **Letter Spacing** and **Line Spacing** apply to messages, reply previews, and the chatbox. **0%** restores the current spacing from Discord or your font setup. The plugin keeps the text of your messages intact.

The native hooks target Discord’s Android message renderer and composer. The React Native hooks apply to profile text, member activity, and server channel lists. This beta was checked against Discord Android 353.11 native code and 355.5 React Native module layouts. An on-device run is still pending.

Inspired by [RazerTexz’s Aliucord plugin](https://github.com/RazerTexz/my-plugins/tree/main/BetterFontScale).

## Build

Regenerate the native JAR with an Android SDK JAR, a D8 JAR, and a JDK (Java 17 or later).

```sh
ANDROID_JAR=/path/to/android.jar D8_JAR=/path/to/r8.jar python3 source/build.py
```

Run `python3 valenced/build.py` from the repository root to regenerate the catalog and ZIP.
