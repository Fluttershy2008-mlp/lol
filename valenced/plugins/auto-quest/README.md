# Auto Quest 1.2.1

Valenced compatibility fork of Rosie's [Auto Quest](https://code.is-your.app/SheWhoReignsSupreme/Valenced-Plugins/src/commit/0e4a47195e669278f0bdf60609ab043497933baf/plugins/auto-quest).

Add or refresh this repository in Valenced, then install **Auto Quest**:

```text
https://fluttershy2008-mlp.github.io/lol/valenced/index.json
```

Open **Settings → Valenced → Auto Quest**, or its settings button in the plugin manager. Disable the original Auto Quest if installed, so only one copy handles progress. This fork has its own plugin ID and settings; it does not import the original plugin's data.

Accept the video quests you want in Discord and keep Valenced in the foreground. **Every accepted video quest now runs at the same time**, with its own progress timer and requests. New acceptances join immediately, and a failed or delayed quest does not hold up the others. The settings page shows how many quests are active and each quest's progress.

Open Discord's Quests page once if the plugin is waiting for QuestStore to load. Only `WATCH_VIDEO` and `WATCH_VIDEO_ON_MOBILE` are supported. The mobile task is preferred when both appear. Progress follows elapsed time; quests do not complete instantly. This does not accept quests or claim rewards. Update the existing plugin to 1.2.1 and fully restart Discord; saved settings are preserved.

Changes from upstream 1.1.1:

- Finds flat, default-exported and nested `HTTP` clients, including modules loaded after startup. Uses Discord's signed-in client without copying or caching tokens.
- Handles Map, array and object quest collections, legacy/current task configs and camelCase/snake_case status fields.
- Pauses immediately when disabled, stopped, backgrounded, expired, unenrolled or switched to another account. Late responses cannot announce completion or navigate in another account.
- Runs all accepted video quests concurrently, with separate timers, requests, rate-limit waits and cancellation. Reports success only from Discord's completion response or QuestStore, and pauses an unconfirmed final result instead of inventing success.
- Limits request waits to 25 seconds and honors explicit rate-limit delays with at most two retries. Other failures pause until **Check again / retry paused quests**.
- Deduplicates new-quest notifications and adds live status/progress in Valenced settings, without startup or changelog popups.
- Optional auto-exit requires the exact quest ID and unchanged video route key. It remains inactive when Discord does not expose that information.

`index.js` is the complete editable source; it has no build-time JavaScript dependencies. From the repository root, run `python3 valenced/build.py` to rebuild the installable ZIP and catalogue, and `node --test valenced/tests/auto-quest.test.cjs` for mocked integration checks (requires the existing `revenge-next` test dependencies). GPL-3.0-only; original author and source revision are recorded in `NOTICE.txt`.

Version 1.2.1 has 53 Auto Quest integration checks, including simultaneous progress, independent saved progress/targets, a stalled request, rate limits, errors, mid-run acceptances, retry isolation and cancelling all jobs on pause/background/stop/account changes. The simultaneous-progress regression fails against the published 1.2.0 package. All previous release archives and other catalogue entries are preserved.

Validation on 2026-11-01: all 53 plugin checks, 364 Valenced integration checks and 7 package checks passed. Deterministic package rebuilding, JavaScript syntax and whitespace checks also passed.

Concurrency validation uses a simulated Valenced host. Multiple live quest completion still needs device testing.
