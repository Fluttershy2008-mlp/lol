# Better Font Scale for Valenced

Open **Settings → Valenced → Plugins → Better Font Scale → Settings**. Each slider previews its size as you drag and applies it when you release. Sizes range from 60% to 180% in 5% steps. **100%** follows Discord's default size, including its existing accessibility scaling. Use **Reset all to default** to restore all eleven settings.

| Group | Controls |
| --- | --- |
| Chat | Message bodies, chatbox, usernames and timestamps |
| Profiles | About Me, game activity text and profile status |
| Channel list | Category names, text and voice channel names, and thread names |

The username slider covers chat author names and profile display names. If Valenced prompts for a reload after installation, fully restart Discord. The beta targets Android and was checked against the native layouts and React Native components from Discord 355.5 (355205). Rendering on an Android handset still needs verification.

## Build

Set `ANDROID_JAR` to an Android SDK platform jar, `KOTLIN_STDLIB` to Kotlin's standard library jar, and `D8_JAR` to an R8 jar. Run `python3 valenced/plugins/better-font-scale/source/build.py` from the repository root, then `python3 valenced/build.py` to rebuild the package and catalog.
