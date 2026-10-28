# Fluttershy's Revenge plugins

## Valenced

Paste this into Valenced's **Repository URL** field:

```text
https://fluttershy2008-mlp.github.io/lol/valenced/index.json
```

All **21 unique plugins** plus four native colour themes are available as Valenced previews. **SaveAsSticker 1.0.0-beta4** and **Stealmoji 1.0.0-beta5** include a native modal server picker and accept Discord's different upload-response formats, verifying a new server entry when a successful response is empty. Stealmoji closes its picker after success or copying, keeps Close available while busy, and bounds stalled operations. SaveAsSticker also bundles PNG/JPEG resizing for builds without a working cropper. **Server Leaver 1.0.0-beta6** puts ID editing in a separate dialog so Protect cannot focus an editor in the scrolling preview. Your 22 main server IDs and additional protections are preserved. Refresh the repository, update these three plugins, then fully restart Discord.

More Alts! remains at **1.0.0-beta8**, InfoCommands at **1.0.0-beta5**, Friends List and Blocked User List at **1.0.0-beta4**; CustomRPC, ExpressionCloner, Copy User ID, Addon List and Valid User at **1.0.0-beta3**; AutoText and other ports at **1.0.0-beta2**. [Valenced setup, raw fallback and validation notes](valenced/README.md).

## Revenge Next

Paste this into **Plugins > Settings > Advanced > Repository URL**:

```text
https://fluttershy2008-mlp.github.io/lol/index.json
```

Tap **Add repository**, then open Browse Plugins. If you already added the Pages root or raw repository, refresh that entry instead of adding a duplicate.

The catalogue contains **21 plugin ports** and **four native themes**. **InfoCommands is at 1.0.0-beta12**, with the shared source for Valenced's Server Info Close fix; Next retains its existing sheet. **Server Leaver is at 1.0.0-beta7** with a separate protected-ID dialog. **SaveAsSticker is at 1.0.0-beta6** with cropping and scrolling fixes, and **Stealmoji at 1.0.0-beta7** with picker cleanup after copying/uploading and cancellable preparation. **ExpressionCloner, Friends List, Blocked User List, Copy User ID and Addon List are at 1.0.0-beta5**, **Valid User at 1.0.0-beta7**, **More Alts! at 1.0.0-beta9**, and **AutoText at 1.0.0-beta6**. Other plugin ports remain at **1.0.0-beta4**. Update the plugins you use, then fully restart Discord. Keep Revenge Community Plugins enabled for the Themes API dependency.

Beta4 fixes Addon List's native response handling and repository links. All plugin ports also remove patches and timers immediately when stopped. Automated checks cover all ports and package downloads. Physical Android testing is still required, including Samsung S26 Ultra with Android 17 / One UI 9.

- [Setup and included plugins](revenge-next/README.md)
- [Per-plugin compatibility and test results](revenge-next/COMPATIBILITY.md)
- [Repository catalogue](https://fluttershy2008-mlp.github.io/lol/index.json)
- [Raw fallback URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/revenge-next/index.json)

## Classic Revenge

Existing Classic plugin URLs still serve their original bundles. [Classic setup and compatibility notes](compatibility/README.md) describe those installs. Next uses the repository URL above and separate settings storage.
