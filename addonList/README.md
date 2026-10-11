# Addon List for Revenge

Updated from Kitomanari's `vendetta-stuff` addonList plugin. Original credit and CC0 license are preserved.

## Install

In Revenge, open Settings → Plugins → Add plugin and paste:

```
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/addonList/
```

Disable the old Addon List first, to avoid duplicate commands. This build uses a separate URL and does not automatically migrate the old URL's settings.

## Commands

- `/plugins`: upgrades Revenge's existing built-in command while Addon List is enabled. Shows details and visible install URLs by default, with the same splitting and copy options as `/plugin-list`. Use `detailed: false` for the compact list.
- `/plugin-list`: your installed Vendetta-compatible plugins, including enabled/disabled status.
- `/theme-list`: your installed themes, including selected status.
- `detailed: true`: include descriptions, authors and visible install URLs. URLs appear once as `URL: <https://...>` so they are readable, clickable and do not create link previews.
- `private: true`: show the list as local bot messages visible only to you.
- `copy: true`: copy the list without posting. If the list is long, part 1 is copied and a picker shows a separate copy button and character count for each part. This takes priority over private preview.
- `part: 2` with `copy: true`: copy only part 2, without opening the picker. Parts start at 1; invalid part numbers leave the clipboard unchanged.
- `/plugins ephemeral: true`: preserves Revenge's original private-preview option. An explicit `private` option overrides it, and `copy` takes priority over both.

Settings provide defaults for detailed lists and private previews, plus buttons to copy either list. An explicit command option overrides the saved default.

For a long copied list, choose a part, tap **Done**, then paste and send it in Discord. Reopen copy to choose the next part, or use `/plugin-list detailed:true copy:true part:2` (and then part 3, etc.). Copy never posts the list for you.

For the command shown in Revenge's composer, use `/plugins copy:true` or `/plugins copy:true part:2`. No second `/plugins` command is registered. The original core command is restored when Addon List is disabled. Server/application commands named `plugins` are left unchanged.

## Fixes

- Discord sending modules and the current user are looked up when needed, rather than during plugin startup. No current-user or Nitro lookup at startup.
- Missing authors, manifests and theme descriptions have safe fallbacks; null stale entries are skipped.
- Built-in splitting keeps each sent, previewed or copied part at or below 2,000 characters, or 4,000 with full Nitro. Free, Nitro Basic, Nitro Classic and unavailable user data use 2,000. Detection is refreshed on every action. Split Large Messages is no longer required. Lists are sent sequentially and multi-message public posts require confirmation.
- Splitting keeps whole addon details together when practical and avoids breaking URL lines. A URL that cannot fit in one message produces an error instead of a broken or shortened link. Invalid entry IDs fall back to the registry URL.
- Unicode pairs remain intact at message boundaries. Addon metadata is escaped and mentions are disabled.
- Sending errors stop the list and report how many messages were sent. No automatic resend. Simultaneous sends to the same channel are blocked.
- Commands are cleaned up on disable, including after a partial registration failure. Disabling the plugin stops further chunks and invalidates pending confirmations.
- The `/plugins` enhancement preserves the existing command ID and `ephemeral` option and reuses Addon List's formatting, limits and copy controls. It does not call the original sender while enabled, avoiding duplicate posts.
- Settings use basic React Native controls instead of legacy Forms and asset names.

## Compatibility and warning

This is a Vendetta-format plugin for Revenge's compatibility API. It lists that API's plugin registry and theme registry; it does not enumerate experimental Bunny-format plugins. It requires Revenge's command registration API. Unavailable Discord APIs produce local errors where possible.

The built-in `/plugins` enhancement additionally requires the patcher and Discord command-list module exposed by current Revenge. If that hook is unavailable in an older client, `/plugin-list` remains available.

The warning in the original listing is a third-party compatibility notice, not a diagnosis of a specific error. Publishing this fork does not remove or alter that listing's warning. Actual compatibility still depends on your installed Revenge and Discord versions.

Validated against the current Revenge compatibility API source and a mocked runtime. Not tested on a physical Android device. Report the Discord/Revenge versions and error log if a device-specific problem remains.

Message limits follow [Discord's account caps](https://support.discord.com/hc/en-us/articles/33694251638295-Discord-Account-Caps-Server-Caps-and-More).

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
