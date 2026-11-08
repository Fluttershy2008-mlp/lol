# ShowHiddenChannels for Valenced
Version: **1.0.0-beta11**

Keeps beta10's features and preserves original channel-list names, as requested
from beta7. Includes the mobile detail inspector informed by Vencord’s
ShowHiddenChannels.

## Install / update
1. Keep `ShowHiddenChannels_Valenced_v1.0.0-beta11.zip` zipped.
2. Open **Settings → Valenced → Plugins → + → Install from ZIP** (or the plugins menu).
3. Install over your existing ShowHiddenChannels version, then fully close
   Discord and reopen it. The installed version should show `1.0.0-beta11`.

The plugin ID is unchanged. Requires Valenced API 1 and Discord 350.2 or later.

## Fixed in beta11
- **Original names first**: keeps the name supplied by the channel-list record,
  including emoji and Unicode. A different cache cannot replace a working name.
- **Native row text**: names render with React Native Text and an explicit colour
  and flexible width, independently of Discord's themed Text component.
- **Consistent detail headers**: the native detail route now retains the same
  original record used by the row and modal, instead of discarding its name and
  topic through another cache lookup. The retained record is account-scoped,
  bounded to the last opened channel and cleared when the plugin stops.
- **Missing-name fallback**: only when the original name is absent or blank, try
  already-received ChannelStore metadata with the same channel ID and server ID.
  This does not fetch names or change Discord's channel records. If neither
  source provides a name, the row still says "Name unavailable".

## Retained from beta10
- **Channel details**: channel creation time, age restriction, slowmode, thread
  slowmode and inactive thread/post archive duration, when supplied by Discord.
- **Voice details**: bitrate in kbps, user limit, region and video quality, when
  present. Opening this screen does not connect to voice.
- **Forum/media details**: available tags, moderator-only tags, required tags,
  default layout, post sorting and the default reaction. Custom reactions without
  a cached name are identified by their emoji ID.
- **Permission details**: a collapsed-by-default inspector of received role and
  member overrides. Each row separates explicitly allowed and denied permissions.
  Includes denied roles that are absent from the allowed-role chips. Unknown bits
  retain their hexadecimal value instead of receiving a guessed permission name.
- **Search**: when the allowed list has more than eight entries, search by name,
  username or ID. It filters the local list without fetching more members.
- **Copy buttons**: copy the channel ID or channel link. Hold a user chip to copy
  their ID; tapping still opens their native server profile.
- **Saved settings**: compact lock screen, show channel details, and expand users
  and roles by default. Change them in the plugin settings page. The default
  expansion setting applies the next time a channel screen opens.

Existing avatars, server profile navigation and native server list integration
are retained. No experiments or Discord account settings change.

## What the information means
Metadata only appears when it has been received. Missing values are omitted or
marked unavailable. Slowmode shows “Off” only when an actual zero is supplied;
unknown settings are not converted into defaults.

The permission inspector shows channel overrides, not a complete calculation of
a member’s final access. Server ownership, administrator permissions, other roles
and member-specific overrides can affect the final result. Allowed-role chips
show individual grants and are not a full server member list.

No hidden messages are fetched, no member enumeration is performed, and no new
network requests were added for the new inspector. Existing missing-user lookups
remain serialized, deduplicated, rate-limited, time-limited and account-scoped.
Profiles retain Discord’s normal blocked-user checks.

## Validation
76 automated checks passed in the mock Valenced runtime. These cover the existing
native list, timestamps, avatars, profile discovery/navigation, permissions,
account switches and cleanup, plus new metadata formats, missing values, forum
tags, high-bit permissions, permission-panel toggles, copying, persisted settings
and local search. The name checks cover native row text, Unicode names, original
record priority, missing-name fallbacks, foreign cache rejection, native and
modal detail headers, account changes and failed navigation cleanup.

This beta11 update has not been tested on a physical Android device. Automated
checks inspect data, generated native component props and handler behaviour;
they do not verify live Android rendering or Discord’s network responses.

Run the included checks with `node tests/runtime.test.cjs`.
If a profile fails, use **Copy profile diagnostics** in the plugin settings.

## Source and licence
`index.js` is the complete unminified source; no build step is required.
GPL-3.0-or-later. See `LICENSE` and `NOTICE.txt`.

References:
- https://github.com/Vendicated/Vencord/tree/main/src/plugins/showHiddenChannels
- https://github.com/Valenced/valenced
- https://github.com/discord/discord-api-docs/blob/main/developers/topics/permissions.mdx
