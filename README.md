# Fluttershy's Revenge plugins

## Valenced

Paste this into Valenced's **Repository URL** field:

```text
https://fluttershy2008-mlp.github.io/lol/valenced/index.json
```

All **21 unique plugins**, including **InfoCommands, AutoText and Valid User**, plus four native colour themes are available as Valenced previews. Update **InfoCommands to 1.0.0-beta5** for the Server Info Close fix. **Copy User ID, Addon List and Valid User stay at 1.0.0-beta3**, and **AutoText stays at 1.0.0-beta2**. Refresh the existing repository, update InfoCommands, then force-close and reopen Discord. [Valenced setup, raw fallback and validation notes](valenced/README.md).

## Revenge Next

Paste this into **Plugins > Settings > Advanced > Repository URL**:

```text
https://fluttershy2008-mlp.github.io/lol/index.json
```

Tap **Add repository**, then open Browse Plugins. If you already added the Pages root or raw repository, refresh that entry instead of adding a duplicate.

The catalogue contains **21 plugin ports** and **four native themes**. **InfoCommands is at 1.0.0-beta12**, with the shared source for Valenced's Server Info Close fix; Next retains its existing sheet. **Copy User ID and Addon List are at 1.0.0-beta5**, **Valid User at 1.0.0-beta7**, and **AutoText at 1.0.0-beta6**. Other plugin ports remain at **1.0.0-beta4**. Update the plugins you use, then fully restart Discord. Keep Revenge Community Plugins enabled for the Themes API dependency.

Beta4 fixes Addon List's native response handling and repository links. All plugin ports also remove patches and timers immediately when stopped. Automated checks cover all ports and package downloads. Physical Android testing is still required, including Samsung S26 Ultra with Android 17 / One UI 9.

- [Setup and included plugins](revenge-next/README.md)
- [Per-plugin compatibility and test results](revenge-next/COMPATIBILITY.md)
- [Repository catalogue](https://fluttershy2008-mlp.github.io/lol/index.json)
- [Raw fallback URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/revenge-next/index.json)

## Classic Revenge

Existing Classic plugin URLs still serve their original bundles. [Classic setup and compatibility notes](compatibility/README.md) describe those installs. Next uses the repository URL above and separate settings storage.
