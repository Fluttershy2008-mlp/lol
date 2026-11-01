# Auto Quest 1.2.0

Valenced compatibility fork of Rosie's [Auto Quest](https://code.is-your.app/SheWhoReignsSupreme/Valenced-Plugins/src/commit/0e4a47195e669278f0bdf60609ab043497933baf/plugins/auto-quest).

Add or refresh this repository in Valenced, then install **Auto Quest**:

```text
https://fluttershy2008-mlp.github.io/lol/valenced/index.json
```

Open **Settings → Valenced → Auto Quest**, or its settings button in the plugin manager. Disable the original Auto Quest if installed, so only one copy handles progress. This fork has its own plugin ID and settings; it does not import the original plugin's data.

Accept a video quest in Discord and keep Valenced in the foreground. Open Discord's Quests page once if the plugin is waiting for QuestStore to load. Only `WATCH_VIDEO` and `WATCH_VIDEO_ON_MOBILE` are supported. The mobile task is preferred when both appear. Progress follows elapsed time; quests do not complete instantly. This does not accept quests or claim rewards.

Changes from upstream 1.1.1:

- Finds flat, default-exported and nested `HTTP` clients, including modules loaded after startup. Uses Discord's signed-in client without copying or caching tokens.
- Handles Map, array and object quest collections, legacy/current task configs and camelCase/snake_case status fields.
- Pauses immediately when disabled, stopped, backgrounded, expired, unenrolled or switched to another account. Late responses cannot announce completion or navigate in another account.
- Processes one quest at a time. Reports success only from Discord's completion response or QuestStore, and pauses an unconfirmed final result instead of inventing success.
- Limits request waits to 25 seconds and honors explicit rate-limit delays with at most two retries. Other failures pause until **Check again / retry paused quests**.
- Deduplicates new-quest notifications and adds live status/progress in Valenced settings, without startup or changelog popups.
- Optional auto-exit requires the exact quest ID and unchanged video route key. It remains inactive when Discord does not expose that information.

`index.js` is the complete editable source; it has no build-time JavaScript dependencies. From the repository root, run `python3 valenced/build.py` to rebuild the installable ZIP and catalogue, and `node --test valenced/tests/auto-quest.test.cjs` for mocked integration checks (requires the existing `revenge-next` test dependencies). GPL-3.0-only; original author and source revision are recorded in `NOTICE.txt`.

Validation on 2026-11-01: 38 Auto Quest checks and all 349 Valenced integration checks passed, along with 7 package checks, deterministic rebuilding, JavaScript syntax and whitespace checks. The broader source/feature regressions also passed (496 checks; one optional Hermes check skipped). Existing release archives and other catalogue entries are unchanged.

Validation uses a simulated Valenced host. Physical Android behaviour and live quest completion require device testing.
