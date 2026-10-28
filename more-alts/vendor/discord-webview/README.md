# Bundled Android WebView component

MIT-licensed sources from Discord's [react-native-webview fork](https://github.com/discord/react-native-webview/tree/6960a1903c3c32e1e77be11e6370f1c384ed7ee4), pinned to commit `6960a1903c3c32e1e77be11e6370f1c384ed7ee4`.

`node build.mjs` uses the repository's pinned esbuild 0.28.2 to produce `../../src/webview-sdk.mjs`. The generated module is checked in, so ordinary plugin builds need no compiler install. It contains the Android component, shared hook and styles. Native view creation, commands, native module and callable messaging are supplied through React Native's APIs by `src/native-webview.mjs`; Discord's Metro WebView module is not required.

Two adaptations give this plugin its own callable-module prefix and remove its callback references on component unmount. Registration uses unique names and does not replace Discord's existing handlers. The QR HTML, HTTPS origin, cryptography and approval protocol remain in `src/qr-html.mjs` and `src/qr-runtime.mjs`.

Native API references: React Native's [requireNativeComponent](https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/ReactNative/requireNativeComponent.js), [UIManager command dispatcher](https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/ReactNative/UIManager.js) and [callable-module registration](https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/Core/registerCallableModule.js). Those APIs support legacy and Fabric/bridgeless hosts. Device compatibility still requires the installed native `RNCWebView` view and module.
