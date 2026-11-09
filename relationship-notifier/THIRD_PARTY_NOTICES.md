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

## Mobile profile resolver

compatibility/user-profile.mjs is included in the bundle under the MIT License.
Copyright (c) 2026 Fluttershy2008-mlp.

MIT License

Copyright (c) 2026 Fluttershy2008-mlp

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
