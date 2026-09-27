# ExpressionCloner for Revenge Mobile

A Revenge / Vendetta-compatible mobile port inspired by Vencord's ExpressionCloner.

## Features

- Clone custom emojis from the emoji action sheet.
- Long-press custom reactions to open the emoji action sheet.
- Clone PNG/APNG/GIF stickers from a message's long-press menu.
- Tap/press a sticker to get a direct **Clone Sticker** button, matching the emoji clone flow.
- Choose a destination server and rename before cloning.
- Filters servers by expression permissions and available slots.
- Automatically retries smaller CDN image sizes to stay under Discord upload limits.

Lottie stickers are currently not supported.

## Install

Paste this plugin folder URL into Revenge's plugin installer:

`https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/expression-cloner/`

If Revenge warns that the plugin is an unproxied external source, only continue if you trust the code in this repository.

## Credits

- Vencord ExpressionCloner contributors for the original desktop feature and cloning behavior.
- Stealmoji contributors for established Vendetta mobile action-sheet patterns.

This plugin is intended for managing expressions in servers where your account has permission to create guild expressions.

## Compatibility

Version 1.0.1 replaces the legacy Vendetta input alert with Discord's current AlertModal flow, fixing the `FluxContainer(Alert)` crash seen on Discord Android 346.13.

### 1.1.0

Sticker cloning now appears directly in the sticker detail action sheet, alongside the same server picker and rename flow used for emojis.
