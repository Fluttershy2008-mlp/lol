# SaveAsSticker

Revenge / Vendetta-compatible Discord mobile plugin that adds **Save as Sticker** to image message action sheets.

## How to use

1. Long-press an image in chat.
2. Tap **Save as Sticker**.
3. Pick a server where you have **Create Expressions** permission.
4. Enter the sticker name.
5. Crop the image in Discord's native cropper.
6. The plugin uploads it as a 320x320 PNG sticker.

The selected server also needs a free sticker slot. Images that are already valid 320x320 PNG stickers can skip the crop step.

## Install

Add this plugin URL in Revenge:

`https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/save-as-sticker/`

## Notes

- Built for current Revenge/Vendetta-compatible Discord mobile runtimes.
- Uses Discord's own cropper and native `createGuildSticker` action.
- Static image workflow: animated GIF/APNG input may be converted to a static PNG during cropping.
- No external image-processing service is used.

### 1.0.1

Fixes current Discord Android message-menu injection by reading the selected image directly from the MessageLongPressActionSheet context and patching the lazy-loaded sheet per open.
