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

### 1.1.3 / Valenced beta3 / Next beta5

Fixes `Discord's sticker upload module was not found`. The uploader is resolved when cloning, without requiring unrelated fetch/update exports. If it is absent, the plugin uses Discord's signed-in REST client with a multipart sticker request. On mobile, the image is written to an owned cache file and uploaded by local URI; PNG/APNG/GIF bytes and the selected sticker format are retained. The temporary file is removed after success, failure or cancellation. Browser FormData remains supported.

Repeated confirmations share one pending operation. Upload failures are reported without retrying through another uploader, and success requires a returned sticker ID. Plugin sessions, the signed-in account, permissions and available slots are checked before creation. Old prompts and pending preparation cannot upload after disabling, restarting or switching accounts. Lottie remains unsupported.

Valenced users: refresh the [Valenced repository](https://fluttershy2008-mlp.github.io/lol/valenced/index.json), update **ExpressionCloner to 1.0.0-beta3**, then fully close and reopen Discord. Next users receive **1.0.0-beta5**; Classic users can refetch **1.1.3** from the existing folder URL.

Seventeen shared integration cases exercise the real message menu, server picker, rename prompt and upload actions on Valenced and Next. They cover late native actions, missing actions, PNG/APNG/GIF, canonical HTTP selection, native cache files, one-attempt failures, duplicate confirmations, stale sessions/accounts, permission loss, size limits and unsupported metadata. The four uploader-discovery cases fail against Valenced beta2 and pass against beta3. Phone verification is still needed.

The multipart fields follow [Discord's sticker endpoint](https://github.com/discord/discord-api-docs/blob/7dfc89db5b951ec2fb2637a00d1422c341cef5d8/developers/resources/sticker.mdx#create-guild-sticker). Native cache access follows [Valenced's FileModule API](https://github.com/Valenced/valenced/blob/706dae437058922a10246a1df0a614328db79a5c/bundle/lib/discord/src/native.ts). The REST route and cache event follow the upstream [Vencord ExpressionCloner](https://github.com/Vendicated/Vencord/blob/main/src/plugins/expressionCloner/index.tsx) flow.

### 1.1.0

Sticker cloning now appears directly in the sticker detail action sheet, alongside the same server picker and rename flow used for emojis.
