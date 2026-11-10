# HideBlockedAndIgnoredMessages for Vencord

Version **1.0.0-beta1**. Desktop port of Fluttershy2008-mlp's Valenced plugin,
including the beta16 filtering optimisations.

## Windows CMD installation

Paste this into **Command Prompt**:

```bat
curl -fL "https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/vencord-hide-blocked-and-ignored-messages/Install-HideBlockedAndIgnoredMessages.cmd" -o "%TEMP%\Install-HideBlockedAndIgnoredMessages.cmd" && call "%TEMP%\Install-HideBlockedAndIgnoredMessages.cmd"
```

Requires **Node.js 22+** and an existing **Vencord source checkout**. It checks the
current directory, `%USERPROFILE%\Vencord`, Documents, Desktop and Downloads.
If your checkout is elsewhere, run the downloaded CMD with its path as an argument:

```bat
call "%TEMP%\Install-HideBlockedAndIgnoredMessages.cmd" "D:\My Mods\Vencord"
```

The CMD contains all plugin files, verifies their hashes, backs up only recognised
previous copies, preserves other custom plugins, installs the checkout's pinned
pnpm dependencies, builds Vencord with `--dev`, then uses Vencord's official CLI
installer with `--branch auto`. Discord may close during the installation. Keep
the CMD window open until **SUCCESS**, then reopen Discord.

Enable **HideBlockedAndIgnoredMessages** under **Settings → Vencord → Plugins**.
Restart Discord when Vencord asks. Open the plugin settings or the new **Hidden
users & servers** chat button and paste your server IDs. Mobile settings are
separate; server IDs must be added once on desktop. The same panel is available
from Vencord Toolbox. Turn off the built-in **NoBlockedMessages** plugin if you
use this replacement, so it does not independently hide whitelist exceptions.

Backups and the install log are in the source checkout's
`HideBlockedAndIgnoredMessages-Backups/` and
`HideBlockedAndIgnoredMessages-install.log`. Build errors stop before Discord is
patched. A corrupt embedded payload stops before your current plugin is moved.
The installer does not alter PowerShell execution policy or request admin access.

[Download the CMD](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/vencord-hide-blocked-and-ignored-messages/Install-HideBlockedAndIgnoredMessages.cmd)
· [Manual plugin ZIP](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/vencord-hide-blocked-and-ignored-messages/HideBlockedAndIgnoredMessages-Vencord.zip)

## Features

- Hide blocked/ignored messages, their mentions, replies to them and bot commands
  attributed to them. The user-ID whitelist allows exceptions.
- Hide all chat messages in selected server IDs, including threads. A whitelisted
  user does not override a server you hid.
- Hide their channel/sidebar entries, including categories, voice and forums.
  This follows the main server-message switch and its own channel switch.
- Independently hide server icons in the server bar and folder previews. OFF
  brings them back, keeping your saved IDs.
- Independently hide Recent Mentions/notification-center entries and mention
  badges from selected servers. The desktop notification policy suppresses their
  client-generated alerts/sounds while this Vencord instance is running. This
  does not silence notifications on your phone or another client.
- Keep explicit message search available. Native event payloads, history caches,
  folder persistence, permission metadata and read/ack state remain intact.
- Reuse notification snapshots, mention-ID indexes and channel ownership until
  native data changes. Settings update live; nothing continuously scans the DOM.

## Manual installation / first source checkout

Follow Vencord's [source-build guide](https://docs.vencord.dev/installing/) and
[custom-plugin guide](https://docs.vencord.dev/installing/custom-plugins/).
With Git and Node.js installed, create a source checkout if you do not have one:

```bat
git clone https://github.com/Vendicated/Vencord.git "%USERPROFILE%\Vencord"
```

Then run the CMD above. For manual plugin placement, extract the ZIP so the entry
file is `Vencord/src/userplugins/hideBlockedAndIgnoredMessages/index.tsx`, with all
the included JS dependencies alongside it. From the source checkout run:

```bat
pnpm install --frozen-lockfile
pnpm build --dev
pnpm inject
```

For Vesktop, build as above and select this checkout's `dist` directory under
**Vesktop Settings → Developer Settings → Vencord Location**. The automatic CMD
patches installed Discord desktop branches, not Vesktop.

## Verification / development

Checked against Vencord **1.15.17**, commit
`795ed0ff5b7e6b8db7488d0fcc95512a58edc919`: `pnpm test:ts` and
`pnpm build --dev`. Automated checks cover desktop store integration, preserved
history/search, whitelist and switch restoration, native cache invalidation,
repeat-read overhead, the actual settings panel and chat button, notification
policy replacement, installer backups/rollback, payload hashes, failure handling
and the embedded CMD launcher. Windows execution and a signed-in desktop Discord
session were not available; actual patch matching and client behaviour still
need checking on the installed Discord build.

From this folder, use pnpm to install development dependencies and run tests.
`VENCORD_SOURCE` may point to a Vencord checkout for the UI test's esbuild host;
otherwise locally installed esbuild is used. Rebuild the self-contained installer
with `node build-installer.mjs`, then the ZIP/checksums with `python3 build.py`.

Desktop integration and installer: GPL-3.0-or-later. Portable `.js` filters retain
CC0-1.0; see `hideBlockedAndIgnoredMessages/NOTICE.txt` and `LICENSE`.
