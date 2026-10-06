# Addon List for Revenge

Updated from Kitomanari's `vendetta-stuff` addonList plugin. Original credit and CC0 license are preserved.

## Install

In Revenge, open Settings → Plugins → Add plugin and paste:

```
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/addonList/
```

Disable the old Addon List first, to avoid duplicate commands. This build uses a separate URL and does not automatically migrate the old URL's settings.

## Commands

- `/plugin-list`: your installed Vendetta-compatible plugins, including enabled/disabled status.
- `/theme-list`: your installed themes, including selected status.
- `detailed: true`: include descriptions, authors and install links.
- `private: true`: show the list as local bot messages visible only to you.
- `copy: true`: copy the complete list to your clipboard without posting. This takes priority over private preview.

Settings provide defaults for detailed lists and private previews, plus buttons to copy either list. An explicit command option overrides the saved default.

## Fixes

- Discord sending modules are looked up when needed, rather than during plugin startup. No current-user or Nitro lookup at startup.
- Missing authors, manifests and theme descriptions have safe fallbacks; null stale entries are skipped.
- Built-in splitting keeps each message at or below 2,000 characters. Split Large Messages is no longer required. Lists are sent sequentially and multi-message public posts require confirmation.
- Unicode pairs remain intact at message boundaries. Addon metadata is escaped and mentions are disabled.
- Sending errors stop the list and report how many messages were sent. No automatic resend. Simultaneous sends to the same channel are blocked.
- Commands are cleaned up on disable, including after a partial registration failure. Disabling the plugin stops further chunks and invalidates pending confirmations.
- Settings use basic React Native controls instead of legacy Forms and asset names.

## Compatibility and warning

This is a Vendetta-format plugin for Revenge's compatibility API. It lists that API's plugin registry and theme registry; it does not enumerate experimental Bunny-format plugins. It requires Revenge's command registration API. Unavailable Discord APIs produce local errors where possible.

The warning in the original listing is a third-party compatibility notice, not a diagnosis of a specific error. Publishing this fork does not remove or alter that listing's warning. Actual compatibility still depends on your installed Revenge and Discord versions.

Validated against the current Revenge compatibility API source and a mocked runtime. Not tested on a physical Android device. Report the Discord/Revenge versions and error log if a device-specific problem remains.

## Development

`index.js` is readable source and the installable bundle. It is a JavaScript expression returning the lifecycle object, as expected by Revenge. No build dependencies are required.

Run behavioral checks with Node 18+:

```
node --test addonList/tests/addonList.test.mjs
```

After editing `index.js`, update the manifest's SHA-256 hash:

```
node addonList/update-manifest.mjs
```
