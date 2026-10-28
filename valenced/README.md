# Fluttershy's Valenced plugins

Paste this exact URL into Valenced's **Repository URL** field:

```text
https://fluttershy2008-mlp.github.io/lol/valenced/index.json
```

Tap **Add repository**, open **Browse Plugins**, install the plugins you want, then fully restart Discord.

Raw GitHub fallback, serving the same catalogue:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/valenced/index.json
```

Use an address ending in `index.json`. A GitHub repository page or a `github.com/.../blob/...` page returns HTML and causes the JSON error shown in your screenshot.

## Included

All **21 unique Revenge plugins** have a Valenced package at **1.0.0-beta1**:

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

- **InfoCommands:** uses Valenced's scoped API, native action sheets and scrolling components. Server Info attaches to menus that load after startup. If the sheet fails to appear, a native popup shows cached server details. User information commands keep local output local.
- **AutoText:** supports function, memo, forwardRef and nested composer exports. The toolbar, shortcuts, phrase editor, list continuation and prepared typing use the normal composer. Auto-send remains opt-in.
- **Valid User:** uses Discord's authenticated HTTP module with the correct method receiver. Raw, wrapped and string JSON user responses resolve. Missing users, denied access, rate limits and timeouts retain their respective outcomes. It never creates a user when Discord cannot supply one.
- **All ports:** use `valenced.api`, Valenced's native registry, separate plugin storage and cleanup of patches, listeners, timers and pending requests.

The first release does not import Classic Revenge or Revenge Next settings automatically.

## Validation

Automated checks cover every plugin's startup, settings, shutdown and restart, all ports running together, native menus, commands and ZIP metadata. The fixture uses Valenced's actual patcher sources pinned in `tests/vendor/valenced-patcher/SOURCE.json`. Plugins evaluate with the same lexical `valenced` parameter used by the upstream loader; no global Valenced or Vendetta object is required.

These are preview ports. Automated fixtures cannot verify the Discord UI on your physical Android device. Some Discord versions can change internal menus or composer layouts. Valid User can only show accounts Discord makes available to your session; an inaccessible or nonexistent ID cannot be resolved by a plugin.

Build and validate with Node 24 and Python 3:

```sh
npm ci --ignore-scripts --no-audit --no-fund --prefix revenge-next
python3 valenced/build.py --check
PLUGIN_TEST_TARGET=valenced node --test revenge-next/tests/plugins.test.cjs revenge-next/tests/features.test.cjs valenced/tests/*.test.cjs
python3 -m unittest discover -s valenced/tests -p 'test_*.py'
```

The Valenced catalogue lives under `/valenced/index.json`. The existing root catalogue continues to serve Revenge Next.
