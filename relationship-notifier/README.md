# RelationshipNotifier for Revenge

Mobile adaptation of Vencord's **RelationshipNotifier**, originally by nick and
the Vencord contributors. Built for Revenge's Vendetta-compatible plugin loader.

## Install

In **Revenge → Plugins → +**, paste this complete folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/relationship-notifier/
```

The URL must end with the plugin folder, not `index.js`, `manifest.json`, a ZIP,
or a GitHub `tree`/`blob` page. Enable the plugin and open its settings from the
plugin card. Tap **Test notification** to check alerts on your phone.

With the plugin enabled, **RelationshipNotifier** also appears in Discord's
**Revenge** settings section, below **CustomRPC** if installed (otherwise below
**Plugins**). Tap it to open the same settings and notification history directly.
After updating, restart Discord and reopen Settings to refresh the menu.

The first successful check saves your starting lists. It cannot recover removals
from before installation. Future updates use the same install URL; leave plugin
updates enabled and restart Discord to download them.

## Features

- Alerts for lost friends, disappearing incoming friend requests, server removals
  and group DM removals, with a separate switch for each.
- Optional checks after starting Discord or reconnecting, using snapshots saved
  separately for each Discord account.
- In-app toast alerts, an optional popup that stays until dismissed, and the
  latest 100 notifications in plugin settings. Multiple changes are grouped in
  one alert, with every detected change retained in history.
- Filters for your own unfriending, blocking, request acceptance/rejection and
  server/group leaves where Discord's action or REST modules can be identified.
- Skips temporary server outages, accepted requests and ordinary 1-to-1 DM
  closures. Failed actions clear their suppression markers.
- A direct shortcut in the Revenge settings section, using the existing mobile
  settings page. The row and its native renderer are registered together to
  prevent the earlier missing `.parent` settings crash.
- Native React Native settings components; no deprecated `FluxContainer(Alert)`.

## Behavior and limits

This plugin observes the normal Discord client's stores and events. It does not
send messages, leave servers, modify relationships, make additional Discord API
requests or upload your relationship history anywhere. It stores IDs, display
names, membership snapshots and timestamps locally in Revenge's plugin storage.

Alerts describe changes, not their cause. Discord does not reveal whether a
server disappearance was a kick, a ban, a deletion or an action on another
device. Requests that disappear are described as no longer pending. Actions
you take on a different device may be detected as changes here.

Notifications are **inside Discord**, not Android push notifications. Android
can stop or suspend the plugin when Discord is closed. Reconnect checks compare
the last saved list with the next available list and cannot recover changes
that happen and reverse completely while the app is offline.

Checks wait until Discord is connected and allow its stores to settle for five
seconds. Missing/unavailable list APIs preserve existing snapshots instead of
treating them as empty. If a category or manual-action filter is unavailable on
your Discord build, the settings page displays a warning. Discord updates can
change its internal APIs, so physical-device testing is still required.

## Source, build and tests

No npm dependencies or installation are required. Use a recent Node.js release:

```sh
cd relationship-notifier
npm run build
npm test
```

- `src/tracker.js`: account-scoped snapshots, comparisons, manual-action
  suppression, options and bounded notification history.
- `src/plugin.js`: Revenge/Discord store adapters, subscriptions, alerts,
  action observation, reconnect handling and unload cleanup.
- `src/settings.js`: mobile settings, test alert and notification history.
- `src/shortcut.js`: Revenge settings shortcut, navigation and safe renderer
  registration, compatible with CustomRPC and other existing menu entries.
- `build.mjs`: dependency-free fixed-module bundler. Produces the expression
  evaluated by Revenge's loader and updates the manifest's SHA-256 hash.
- `tests/`: automated tests covering real bundle evaluation with the Revenge
  loader's wrapper, all four categories, account isolation, local actions and
  failures, outages, reconnects, history, UI fallback, settings shortcut and
  cleanup. Runtime tests
  simulate Discord stores and events; they are not physical Android app tests.

The committed `index.js` is the installable build. Do not edit it directly;
edit `src/`, rebuild and commit the updated manifest and build together.

## Attribution and license

Adapted from the RelationshipNotifier source in the supplied Vencord archive:
[upstream plugin](https://github.com/Vendicated/Vencord/tree/main/src/plugins/relationshipNotifier).
Original plugin author: **nick** (Discord ID `347884694408265729`).

Copyright (c) 2023 Vendicated and contributors.
Mobile adaptation copyright (c) 2026 Fluttershy2008-mlp.
Licensed under **GPL-3.0-or-later**; see [LICENSE](LICENSE). Corresponding source,
build instructions and tests are included in this directory.

Revenge compatibility was checked against its public source:
[Vendetta API](https://github.com/revenge-mod/revenge-bundle/blob/main/src/core/vendetta/api.tsx),
[plugin loader](https://github.com/revenge-mod/revenge-bundle/blob/main/src/core/vendetta/plugins.ts),
and [toast API](https://github.com/revenge-mod/revenge-bundle/blob/main/src/lib/ui/toasts.ts).
