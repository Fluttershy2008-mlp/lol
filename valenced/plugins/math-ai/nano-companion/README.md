# Math Nano Android companion

This is the foreground Android app used by Math AI 2.0.0 for key-free Gemini Nano inference. The Valenced plugin passes one question in an explicit Activity intent, and receives one nonce-matched answer through Android's Activity result. The ML Kit SDK and its libraries stay in this app's process instead of Discord's class loader.

## Build

Use JDK 17, Gradle 8.13, Android SDK Platform 35 and Build Tools 35.0.0:

```sh
gradle :app:assembleDebug --no-daemon
```

The installable development APK is `app/build/outputs/apk/debug/app-debug.apk`. The checked-in download is `../Math_Nano_Companion_v1.0.0.apk`. No keystore, credentials, local proxy configuration, downloaded SDK cache or build folder is committed.

The app pins Android Gradle Plugin 8.13.2 for Kotlin 2.3 SDK compatibility, ML Kit `genai-prompt:1.0.0-beta4`, and all coroutines artifacts to `1.11.0` for Google's documented download fix. The Google SDK's merged manifest provides AICore package visibility and component initialization; the app explicitly declares the AICore binding permission. It requires Android API 26+, a supported device, Android AICore and its model.

The app does not implement a cloud AI fallback, collect questions into files, or provide API keys. Native SDK/system components may have diagnostics/network activity. Model preparation requires internet; inference is on-device. Availability is checked at runtime and is not assumed from the device name.

## Verify

CI compiles this app against the real SDK and packages it. The Valenced workflow separately compiles the small Android bridge and verifies its DEX/source fingerprints. Plugin tests cover identified jobs, result handling, cancellation, missing bridge/helper, settings, maths and package loading. Real device inference cannot be validated on a host build runner.

SDK documentation and terms:

- https://developers.google.com/ml-kit/genai/prompt/android/get-started
- https://developers.google.com/ml-kit/known-issues
- https://developers.google.com/ml-kit/terms
- https://developer.android.com/build/releases/agp-8-13-0-release-notes
