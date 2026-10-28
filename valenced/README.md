# Fluttershy's Valenced plugins

Paste this exact URL into Valenced's **Repository URL** field:

```text
https://fluttershy2008-mlp.github.io/lol/valenced/index.json
```

Tap **Add repository**, open **Browse Plugins**, install the plugins you want, then fully restart Discord.

**Current plugin release: 1.0.0-beta2.** If you already added this repository, refresh it and update **InfoCommands, AutoText and Valid User** to beta2. Force-close Discord and reopen it. The repository URL stays the same.

Raw GitHub fallback, serving the same catalogue:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/valenced/index.json
```

Use an address ending in `index.json`. A GitHub repository page or a `github.com/.../blob/...` page returns HTML and causes the JSON error shown in your screenshot.

## Included

All **21 unique Revenge plugins** have a Valenced package at **1.0.0-beta2**:

| Plugin | Plugin | Plugin |
| --- | --- | --- |
| Addon List | AutoText | Blocked User List |
| Copy User ID | Custom RPC | Expression Cloner |
| Friends List | Hide Blocked and Ignored Messages | InfoCommands |
| Message Logger | More Alts | Nitro Auto Claim |
| Ping Jumper | Profile Status Presets | Read All Notifications |
| Relationship Notifier | Save as Sticker | Server Leaver |
| Stealmoji | Valid User | View Icons |

Four native colour themes are included: Fluttershy, Rainbow Dash, Sunset Shimmer and Tokyo Nights. Keep **Valenced Community Plugins** available so the `valenced.api.themes` dependency can be installed.

`message-logger-v2` duplicates Message Logger. The root Classic bundle duplicates Save as Sticker. The three Classic background companions are replaced by their native themes. No duplicate plugin installation is needed.

## Requested fixes

- **InfoCommands:** finds the server menu by its imported path and opens a native details popup on Valenced. It reads cached details without waiting for a network request or a sheet to appear. There is also an **Open current server info** button in the plugin's settings. User information commands keep local output local.
- **AutoText:** patches `modules/chat_input/native/ChatInput.tsx` through Valenced's imported-path API. The guard only renders a child component; it does not expose the full input tree. The new hook sees the floating input, native events and real composer reference. It keeps waiting when the input loads after thirty seconds. Native commands also resolve by imported path. Function, memo, forwardRef and nested exports remain supported. Auto-send remains opt-in.
- **Valid User:** selects the nested `HTTP` client before generic `get/post/del` matches. `TrackedHTTPUtils` exposes those methods too, but requires tracking arguments and cannot serve as a general REST client. User lookups use `oldFormErrors` and fail immediately when rate-limited, so a queued request is not mistaken for a connection timeout. Missing users, denied access, malformed responses and timeouts keep distinct outcomes. The plugin never creates a user when Discord cannot supply one.
- **All ports:** use `valenced.api`, Valenced's native registry, separate plugin storage and cleanup of patches, listeners, timers and pending requests.

The first release does not import Classic Revenge or Revenge Next settings automatically.

## Validation

Automated checks cover every plugin's startup, settings, shutdown and restart, all ports running together, native menus, commands and ZIP metadata. Three new fixtures fail against beta1 and pass against beta2: a tracked HTTP wrapper preceding the canonical client, a separately rendered unnamed chat input, and a late server menu that must open native details. The lookup fixture now checks namespace exports before default exports, matching Valenced's finder.

The fixture uses Valenced's actual patcher sources pinned in `tests/vendor/valenced-patcher/SOURCE.json`. Plugins evaluate with the same lexical `valenced` parameter used by the upstream loader; no global Valenced or Vendetta object is required. The old rich-sheet tests continue to run for Revenge Next. Valenced's native-popup tests replace them in the Valenced suite.

These are preview ports. Automated fixtures cannot verify the Discord UI on your physical Android device. Some Discord versions can change internal menus or composer layouts. Valid User can only show accounts Discord makes available to your session; an inaccessible or nonexistent ID cannot be resolved by a plugin.

Build and validate with Node 24 and Python 3:

```sh
npm ci --ignore-scripts --no-audit --no-fund --prefix revenge-next
python3 valenced/build.py --check
PLUGIN_TEST_TARGET=valenced node --test revenge-next/tests/plugins.test.cjs valenced/tests/*.test.cjs
PLUGIN_TEST_TARGET=valenced node --test --test-skip-pattern=InfoCommands revenge-next/tests/features.test.cjs
python3 -m unittest discover -s valenced/tests -p 'test_*.py'
```

The Valenced catalogue lives under `/valenced/index.json`. The existing root catalogue continues to serve Revenge Next.

The imported-path API and lifecycle were checked against [Valenced 1.2.1](https://github.com/Valenced/valenced/tree/706dae437058922a10246a1df0a614328db79a5c/bundle). Valenced's [Silent Typing plugin](https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/silent-typing/index.tsx) uses the same imported-path API for chat controls.
