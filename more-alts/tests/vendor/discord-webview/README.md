# Discord WebView regression fixture

Unmodified MIT-licensed sources from [Discord's WebView fork](https://github.com/discord/react-native-webview/tree/6960a1903c3c32e1e77be11e6370f1c384ed7ee4), pinned to commit `6960a1903c3c32e1e77be11e6370f1c384ed7ee4`.

The Android component imports BatchedBridge rather than EventEmitter. Its TurboModule spec requests `RNCWebView`, not upstream's newer `RNCWebViewModule`. Those differences reproduce the QR lookup failure in More Alts beta5.

`lib/*.cjs` are generated from `src` with esbuild 0.28.2 by `node build.mjs`. They let the native integration tests execute the actual package and derive its dependency graph without installing a compiler in CI. The tests mock the RN host view, native commands and network, while retaining the package's component, shared hook, navigation checks and callable-module messaging. These files are test fixtures only and are not included in plugin packages.
