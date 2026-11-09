# RelationshipNotifier upstream

Adapted from Vencord RelationshipNotifier by nick, Vendicated and contributors.
Copyright (c) 2023 Vendicated and contributors. GNU GPL version 3 or later;
see LICENSE. Mobile adaptation copyright (c) 2026 Fluttershy2008-mlp.

Upstream inspected for mobile settings release 1.2.0:
https://github.com/Vendicated/Vencord/tree/main/src/plugins/relationshipNotifier

| Upstream file | Git blob inspected | Mobile equivalent |
| --- | --- | --- |
| index.ts | ddb432e4303b6660084e17fe16dd8e78de8dabff | src/plugin.js: Flux subscriptions and manual-action hooks |
| settings.ts | 91126f201d3203fad87292fff81b3380a6b4a335 | src/tracker.js defaults; src/settings.js controls |
| functions.ts | da7838b9ca83c0c322d492bdd4a1f398d630170c | src/tracker.js: removal alerts and manual-action suppression |
| utils.ts | 24c7cdefce4e2d4508f41b4a18d0a0ed45535eea | src/plugin.js snapshots/icons; src/tracker.js account checks |
| types.ts | 914f1a43b5b8a2029058c3d613582740f20f262f | Plain JavaScript snapshot/event objects |

The Valenced package uses the repository's mobile compatibility adapter in
valenced/runtime.cjs. Vencord desktop APIs are replaced with mobile stores,
Flux events, Discord toast alerts and optional native popups. The six upstream
options are preserved. Notification history, search, category filters, pagination,
date groups and native profile/copy actions are mobile additions.
