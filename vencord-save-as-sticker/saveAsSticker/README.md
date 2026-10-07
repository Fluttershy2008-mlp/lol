# SaveAsSticker 1.0.0 — Vencord

Copy this complete folder into `Vencord/src/userplugins/saveAsSticker/`.
The entry point must be `Vencord/src/userplugins/saveAsSticker/index.tsx`.

From the Vencord source root, run:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm inject
```

Fully restart Discord and enable **SaveAsSticker** under **User Settings → Vencord → Plugins**.

Right-click an image/GIF → **Save as Sticker** → choose a server → **Add sticker**.
For local files, open the plugin's settings/about panel and press **Choose image or GIF**.

Actual animated GIFs are supported (up to 5 seconds, 512 KiB after conversion). MP4-only Tenor previews require the original GIF file. Animated APNG/WebP must be exported as GIF first. A server needs Create Expressions permission and an available sticker slot.

[Full installation and usage instructions](https://github.com/Fluttershy2008-mlp/lol/tree/main/vencord-save-as-sticker)

[Official Vencord custom-plugin guide](https://docs.vencord.dev/installing/custom-plugins/)

GPL-3.0-or-later. See LICENSE, NOTICE.txt and THIRD_PARTY_LICENSES.txt.
