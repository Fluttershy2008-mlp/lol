# Revenge plugin compatibility update

This update covers the 22 published Revenge plugin folders in this repository, including the Message Logger V2 alias. The repository-root SaveAsSticker install alias is synchronized too. Existing install URLs stay the same.

## Changes

- Validate patch targets after lazy Discord modules resolve, so a missing UI method is skipped with a log warning instead of throwing through the module loader.
- Follow React memo and forwardRef exports to their callable renderer.
- Cancel pending subscriptions and remove each plugin's own patches on unload or failed startup. Separate plugins keep separate cleanup lists.
- Preserve visible startup errors for required data/action patches. An incompatible optional UI feature may be unavailable; the guard does not fabricate a working module.
- ExpressionCloner and PingJumper ignore menu promises from earlier enable sessions, handle rejected menu loads, and use one-time menu patches without inserting hooks into Discord's components.
- PingJumper also accepts the named ChatView export and the split HTTP module shape.

The guard is embedded into each bundle: no extra plugin, runtime download, global React modification, or shared configuration is required. Sources and build commands are included so future builds retain the guard.

## Update on your phone

Use the update action for each installed plugin in Revenge's Plugins settings, then fully restart the app. Keep the existing install URLs. Message Logger and Message Logger V2 are two install aliases of the same implementation; enable the one you use.

## Scope and verification

The reported client build is Discord 350.8 Stable. Validation uses the existing plugin tests, the real Spitroast patcher, and simulated lazy-module and React-component shapes. It is not a device test of every feature on 350.8.

Automated result: 594 tests passed, 0 failed; the optional Hermes execution test was skipped because `HERMES_BINARY` was not supplied.

From the repository root:

```sh
npm ci
npm run build:revenge
npm run test:revenge
```

The older source-only addons under `vendetta-plugins/plugins` are not part of the 22 published root-folder installs, except Message Logger, whose source lives there. Their build pipeline also embeds the shared guard, but they are not represented as device-validated ports.

## Separate Revenge core issue

The original `render is not a function in Function` stack offsets match the official Revenge 1.11.6 bundle's patcher and deferred module-loading code. Its built-in theme background patch requests `MessagesConnected.render` without validating that the resolved export has that method:

- [Official background patch](https://github.com/revenge-mod/revenge-bundle/blob/v1.11.6/src/lib/addons/themes/colors/patches/background.tsx)
- [Official patcher](https://github.com/revenge-mod/revenge-bundle/blob/v1.11.6/src/lib/api/patcher.ts)

These plugin updates do not change Revenge's internal theme implementation. The original crash can therefore persist independently of the plugin updates. The Fluttershy theme and its wallpaper are unchanged.

## Published releases

| Plugin | Version | Existing install URL |
| --- | --- | --- |
| Addon List | 2.2.1 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/addonList/) |
| AutoText | 1.2.3 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/auto-text/) |
| Blocked User List | 1.3.1 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/blocked-user-list/) |
| Copy User ID | 1.1.2 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/copy-user-id/) |
| CustomRPC | 1.1.2 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/custom-rpc/) |
| ExpressionCloner | 1.1.1 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/expression-cloner/) |
| Friends List | 1.0.1 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/friends-list/) |
| HideBlockedAndIgnoredMessages | 1.1.1 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/hide-blocked-and-ignored-messages/) |
| InfoCommands | 1.2.1 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/info-commands/) |
| Message Logger | 2.0.4 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/message-logger/) |
| Message Logger V2 | 2.0.4 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/message-logger-v2/) |
| More Alts! | 3.1.2 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/more-alts/) |
| Nitro Auto Claim | 1.0.1 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/nitro-auto-claim/) |
| PingJumper | 1.1.1 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/ping-jumper/) |
| Profile Status Presets | 1.0.1 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/profile-status-presets/) |
| ReadAllNotificationsButton | 1.2.1 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/read-all-notifications/) |
| RelationshipNotifier | 1.1.5 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/relationship-notifier/) |
| SaveAsSticker | 1.3.3 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/save-as-sticker/) |
| Server Leaver | 1.0.1 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/server-leaver/) |
| Stealmoji | 2.1.2 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/stealmoji/) |
| ValidUser | 2.1.1 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/valid-user/) |
| ViewIcons | 1.0.3 | [Install URL](https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/view-icons/) |
