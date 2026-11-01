# Long Video Share · 1.0.0-beta2

**Installation fix:** beta2 corrects the package's dependency declarations to
Valenced Plugin API **1.x** and Discord **any supported version**. Beta1
unnecessarily required API 1.2.4 and Discord 352.2, which could block installation
before the plugin ran. The native bridge and storage APIs used by this plugin
already exist in earlier Valenced 1.x builds. Both the ZIP manifest and repository
catalogue now use the corrected requirements. The native video encoder is unchanged.
Refresh the repository, install beta2, then fully close and reopen Valenced.

Compress a long video on your Android phone, save a smaller MP4, then attach it
using Discord's normal **+** button. There is no arbitrary 45-minute cut-off in
this plugin. Your video's size, the chosen target and Android's codec support
determine whether it can be compressed successfully.

## Install and use

1. Refresh `https://fluttershy2008-mlp.github.io/lol/valenced/index.json` and install
   **Long Video Share**. Fully close and reopen Valenced to load the native encoder.
2. Open **Settings → Valenced → Long Video Share** (or the plugin's settings button).
3. Choose a local video in Android's file picker.
4. Select the upload limit shown for your Discord account/channel. Presets are
   **20 MB**, **50 MB**, **500 MB** and **1 GB**, with a custom MB field.
   The initial preset is a conservative suggestion based on your Nitro tier;
   it is not a server entitlement check. Experiments and account limits can vary.
5. For a 45-minute video, start with **480p** or **720p**. Tap **Compress video**,
   keep Discord open, and allow enough free storage for a temporary and saved copy.
6. When ready, tap **Save MP4**, choose a save location, then attach that saved
   video in your Discord chat. This first version does not insert it into a draft
   or send messages automatically.

The plugin reserves 6% of the target size, subtracts the actual AAC sample bytes,
and budgets the remaining bitrate for video. It verifies the final MP4's byte
size, retries an overshoot up to twice, and refuses to label an oversized or
substantially truncated result as ready. Compressing reduces visual quality;
duration alone cannot guarantee good quality at a given size.

To keep the original quality, upload your video to YouTube as **Unlisted** or a
file host you trust, set its sharing permissions, and use the hosted-link field.
That option copies a link; the user performs the external upload. Whether Discord
shows an inline preview depends on the host and viewers' access.

## Requirements and limits

- **Android 9/API 28 or newer**, Valenced Plugin API **1.x**, and a Discord version supported by that Valenced build.
- Uses Android **MediaExtractor → MediaCodec → OpenGL ES → MediaMuxer** locally.
  The output is **H.264 MP4**, up to **30 fps**, with the first AAC audio track
  copied unchanged. No additional native library or compression server is needed.
- SDR video with AAC audio (or no audio) is supported. HDR videos, non-AAC audio
  and protected video require a suitable SDR MP4 export or a hosted link.
  Additional audio tracks, subtitles and other container tracks are not included.
- Keep Discord open while processing. An app/process kill interrupts the job.
  Native processing is off the React/UI thread; only small status maps cross the bridge.
- The original is never overwritten. **Clear temporary video** removes the
  current cached copy, not the original or an MP4 you saved elsewhere. Android
  can clear cached outputs when space is low; re-compress if that happens.
- File-size limits are checked by Discord's servers. This plugin does not spoof
  Nitro, disable upload validation or promise that a particular account may upload
  a chosen preset. Saved videos are still subject to Discord's normal checks.
- No network upload, token access, telemetry or startup popup. The hosted-link
  field and video selection are not saved in plugin settings.

## Validation and build

The beta is compiled against an Android SDK and tested for size budgeting,
45-minute calculations, audio reserves, retry maths, settings persistence,
native bridge interactions, cancellation controls, export gating and link copying.
The ZIP, DEX and catalogue checksums are verified. Hardware encoding and Android's
document picker still require testing on the actual handset; these checks do not
substitute for a successful phone conversion.

```sh
ANDROID_JAR=/path/to/platforms/android-35/android.jar \
DX_JAR=/path/to/dx.jar python3 valenced/plugins/long-video-share/source/build_native.py
ANDROID_JAR=/path/to/android.jar python3 valenced/plugins/long-video-share/source/build_native.py --check
node --test valenced/tests/long-video-share.test.cjs
python3 valenced/build.py --check
```

`D8_JAR` can be used instead of `DX_JAR`. Compile-only Valenced, Kotlin and Xposed
ABI declarations match their public APIs and are excluded from the DEX payload.
Native source hashes are recorded in `native-source.json`. Source: this repository.

Discord's current attachment FAQ: https://support.discord.com/hc/en-us/articles/25444343291031-File-Attachments-FAQ
Android API reference: https://developer.android.com/reference/android/media/MediaCodec
Valenced plugin APIs: https://github.com/Valenced/valenced/tree/main/android/api/src/main/kotlin/app/valenced
