# Always Animate for Valenced — 1.1.0-beta1

Android adaptation of [Vencord AlwaysAnimate](https://github.com/Vendicated/Vencord/tree/main/src/plugins/alwaysAnimate), based on the supplied Always Animate beta17.

## Install

1. Open Discord → Settings → Valenced → Plugins.
2. Choose the install-from-ZIP/file option and select this ZIP without extracting it.
3. Enable Always Animate and fully restart Discord to load the native helper.

The plugin keeps the existing `fluttershy2008.always-animate` ID so it can update beta17 and retain its four switches. If your Valenced build reports a duplicate ID, uninstall the older copy and install this ZIP.

## Animation switches

| Switch | What it controls |
| --- | --- |
| Avatars & frames | Supported chat/profile avatars, avatar decorations, server icons and banners |
| Emoji | Animated custom emoji in chat and custom statuses |
| Stickers | Animated native chat stickers and recognised React sticker components |
| Nameplates & roles | Recognised nameplate/gradient-role components and explicit gradient animation flags |

All four switches start enabled. Reopen the relevant chat or profile after changing one. Troubleshooting in the plugin settings can copy a diagnostic report.

## Changes from beta17

- Handles `CustomStatus` and `UserStatus` components through the emoji switch.
- Handles recognised React sticker components through the sticker switch.
- Enables explicit `canAnimate`, `animateEmoji` and `animateGradient` flags on anonymous/minified components, with separate settings for images, emoji and roles.
- Enables nameplate looping even when Discord omits the `loop` prop.
- Keeps hidden/invisible elements untouched and leaves generic animation props on unrelated components alone.

The existing Android chat avatar/decoration helper is unchanged. Component names and URL rewrites remain cached; anonymous animation flags use fixed property checks, without a component-tree scan or recurring JavaScript polling timer.

## Scope

This enables playback for animated assets that Discord already exposes. Static assets stay static. It does not unlock paid cosmetics or create an animation for a static image. Nameplate and role-gradient coverage depends on the mobile Discord build exposing compatible render components/flags; native-only variants may need a further adaptation. Desktop webpack patches cannot run directly on Android.

No live Android device was available for this release. Local checks do not establish phone FPS, battery use or complete cosmetic support on every Discord build.

## Source and validation

- Upstream reference: `Vendicated/Vencord/src/plugins/alwaysAnimate/index.ts`, Git blob `483599484e4fd44db06c1be168c01b6d93bfccf6`, retrieved 9 November 2026.
- `index.js` and `source/plugin.js` are identical, readable JavaScript.
- Valenced's current expression/default-export loader contract and before-hook API were checked against its source.
- `node tests/smoke.cjs`: loader, media URL rules, native row handoff, hidden/grouped messages, frozen inputs, emoji fallback, new status/role/nameplate/sticker hooks, independent switches and unload cleanup.
- `node tests/apng-gate.cjs`: native/RN/TurboModule image-manager routes, delayed discovery, live switch and cleanup.
- `node tests/render-performance.cjs`: 10,000 ordinary renders classify a type once; anonymous source reuse, switches and bounded startup retries. This is a structural regression check, not an Android benchmark.
- `sh tests/run-native.sh`: ten JVM smoke suites using Android/Fresco stubs, covering request metadata caching, avatar/decorations, frame decoding, view recycling, visibility and cleanup. Requires a JDK with its compiler module.
- Optional `tests/hider-interoperability.cjs` requires the separate HideBlocked plugin repository harness through `HIDER_TEST_HARNESS`; that external integration test was not rerun for this release.

Android source and compile stubs are included under `source/android`. `source/android/build.sh` rebuilds the helper with a JDK supporting Java 7 compilation (for example JDK 17) and Android `dx.jar` supplied as `DX_JAR`. No native rebuild was needed for this JavaScript update.

GPL-3.0-or-later. Original Vencord concept by FieryFlames, Vendicated and contributors. Mobile adaptation credits are retained in the manifest and source.
