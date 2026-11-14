# HideBlockedAndIgnoredMessages for Vencord

Version **1.0.0-beta3**. Desktop port of Fluttershy2008-mlp's Valenced plugin,
including the beta16 filtering optimisations.

## Redesigned settings

The sidebar, chat button, Toolbox and plugin gear now share one compact panel:

- Users, Servers and Whitelist tabs replace the long list of duplicate controls.
- Theme-aware cards, dark ID fields, tighter spacing and descriptive switches.
- ID counts, validation messages, duplicate removal, Save IDs and Reset.
- Switches save immediately; ID drafts survive tab changes until saved or reset.
- Keyboard arrow navigation and layouts that adapt to narrow settings panels.
- Existing plugin identity, saved IDs, defaults and filtering behaviour are retained.

## Vencord settings sidebar

Open **User Settings → Vencord Settings → Hidden users & servers** to manage
server IDs, whitelist exceptions and all hiding switches directly in settings.
The sidebar button uses Vencord's custom-entry API and supports older builds'
custom-section API. It opens the same saved settings as the chat button. Plugin
shutdown removes only this entry; other Vencord settings entries remain intact.

Update from beta1 or beta2 by running the installer again and restarting Discord. Your
existing server IDs and switches are retained.

## Windows CMD installation

Paste this into **Command Prompt**:

```bat
curl -fL "https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/codex/hbim-ui-beta3/vencord-hide-blocked-and-ignored-messages/Install-HideBlockedAndIgnoredMessages.cmd" -o "%TEMP%\Install-HideBlockedAndIgnoredMessages.cmd" && call "%TEMP%\Install-HideBlockedAndIgnoredMessages.cmd"
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

If you use **PowerShell** (your prompt starts with `PS`), use this instead:

```powershell
curl.exe -fL "https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/codex/hbim-ui-beta3/vencord-hide-blocked-and-ignored-messages/Install-HideBlockedAndIgnoredMessages.cmd" -o "$env:TEMP\Install-Hidden.cmd"
if ($LASTEXITCODE -eq 0) { & "$env:TEMP\Install-Hidden.cmd" }
```

Enable **HideBlockedAndIgnoredMessages** under **Settings → Vencord → Plugins**.
Restart Discord when Vencord asks. Open **Vencord Settings → Hidden users &
servers**, the plugin settings, or the **Hidden users & servers** chat button and paste your server IDs. Mobile settings are
separate; server IDs must be added once on desktop. The same panel is available
from Vencord Toolbox. Turn off the built-in **NoBlockedMessages** plugin if you
use this replacement, so it does not independently hide whitelist exceptions.

Backups and the install log are in the source checkout's
`HideBlockedAndIgnoredMessages-Backups/` and
`HideBlockedAndIgnoredMessages-install.log`. Build errors stop before Discord is
patched. A corrupt embedded payload stops before your current plugin is moved.
The installer does not alter PowerShell execution policy or request admin access.

[Download the CMD](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/codex/hbim-ui-beta3/vencord-hide-blocked-and-ignored-messages/Install-HideBlockedAndIgnoredMessages.cmd)
· [Manual plugin ZIP](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/codex/hbim-ui-beta3/vencord-hide-blocked-and-ignored-messages/HideBlockedAndIgnoredMessages-Vencord.zip)

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
`d07030c0968e31e41caa0c35fda0ef8ae63a079e`: `pnpm test:ts` and
`pnpm build --dev` pass. All **54** automated tests pass, covering existing
filter behaviour, search preservation, notifications, sidebar registration,
tab navigation, shared settings, ID validation and saving, cross-panel edits,
installer backups/rollback and the self-contained CMD payload.

Windows CMD execution and a signed-in Discord session were not available.
A browser preview harness is included, using the real panel and Vencord's real
switch/text components. Its build succeeds, but browser execution was blocked
by this environment's socket restriction, so visual and live Discord checks
remain unverified.

From this folder, use pnpm to install development dependencies and run tests.
`VENCORD_SOURCE` may point to a Vencord checkout for the UI test's esbuild host;
otherwise locally installed esbuild is used. Rebuild the self-contained installer
with `node build-installer.mjs`, then the ZIP/checksums with `python3 build.py`.

Desktop integration and installer: GPL-3.0-or-later. Portable `.js` filters retain
CC0-1.0; see `hideBlockedAndIgnoredMessages/NOTICE.txt` and `LICENSE`.


Run the optional browser check with Playwright installed and `VENCORD_SOURCE`
pointing to a Vencord checkout: `node tests/browser-check.mjs`. `CHROMIUM_PATH`
can select a local Chromium executable; `PLAYWRIGHT_MODULE` can select an
installed Playwright module. The harness checks ID editing, independent
server switches, keyboard tabs and 320/420/760px layouts.
