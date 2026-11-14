# Voice Messages

On Valenced for Android, tap the microphone in the composer when the message field is empty and the channel allows voice messages. Record or choose an audio file, listen to the preview, then tap **Send**. The clip appears in chat as a Discord voice message. An active reply is included when you send.

The recorder requires Android 10 or later and produces Ogg Opus. Imported audio uses Android’s codecs. Ogg Opus is the format to choose for playback on iOS. Clips can be up to 20 minutes long.

Based on [Vencord VoiceMessages](https://vencord.dev/plugins/VoiceMessages) by V, Vap0r1ze and Nickyux. The waveform normalization follows the upstream [GPL-3.0-or-later implementation](https://github.com/Vendicated/Vencord/tree/main/src/plugins/voiceMessages).

## Build from source

From the repository root, run `npm ci` and `node valenced/plugins/voice-messages/build.mjs` to rebuild the JavaScript bundle.

To rebuild the native JAR, use JDK 21 and run `sh valenced/plugins/voice-messages/build-native.sh /path/to/tools`. The tools directory needs Android 36’s `android.jar`, the Android build tools’ D8 JAR as `r8.jar`, Xposed API 82 as `xposed.jar`, Kotlin compiler 2.4.10 with its runtime dependencies, and `kotlinx-coroutines-core-jvm-1.11.0.jar`. The script compiles against this repository’s Valenced API sources.

Run `python3 valenced/build.py` to package the plugin and regenerate the repository index.
