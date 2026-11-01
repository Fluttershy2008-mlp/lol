# Auto Quest 1.2.2

Valenced compatibility fork of Rosie's [Auto Quest](https://code.is-your.app/SheWhoReignsSupreme/Valenced-Plugins/src/commit/0e4a47195e669278f0bdf60609ab043497933baf/plugins/auto-quest).

Add or refresh this repository in Valenced, then install **Auto Quest**:

```text
https://fluttershy2008-mlp.github.io/lol/valenced/index.json
```

Open **Settings → Valenced → Auto Quest**, or its settings button in the plugin manager. Disable the original Auto Quest if installed, so only one copy handles progress. This fork has its own plugin ID and settings; it does not import the original plugin's data.

Accept the video quests you want in Discord and keep Valenced in the foreground. **Every accepted video quest now runs at the same time**, with its own progress timer and requests. New acceptances join immediately, and a failed or delayed quest does not hold up the others. The settings page shows how many quests are active and each quest's progress.

Open Discord's Quests page once if the plugin is waiting for QuestStore to load. Only `WATCH_VIDEO` and `WATCH_VIDEO_ON_MOBILE` are supported. The mobile task is preferred when both appear. Progress follows elapsed time; quests do not complete instantly. This does not accept quests or claim rewards. Update the existing plugin to 1.2.2 and fully restart Discord; saved settings are preserved.

Version 1.2.2 fixes request handling behind the generic “connection error” message:

- Prefer Discord's canonical imported HTTP module, including when it loads late. An unrelated module with `get`/`post` properties cannot override it.
- Read parsed JSON, native text, Fetch streams and nested response/error wrappers. Preserve HTTP status and rate-limit delays from headers, `retryAfter`, `response` and `cause`.
- Retry temporary network failures, timeouts and service errors at most twice (normally after 2 and 5 seconds). Retry the same progress timestamp; do not advance the local counter after an unsuccessful request. Keep acknowledged progress when reconnecting even if QuestStore is stale. Other quests keep running.
- Honor rate-limit delays, use the native request deadline and AbortSignal, and cancel pending requests/retry timers when paused, backgrounded, stopped or switched to another account.
- If network retries run out, resume after Discord subsequently disconnects/reconnects, or tap **Check again / retry paused quests**. Authentication/permission errors, unusable modules and malformed replies pause instead of repeatedly sending requests.
- Show safe categories in the affected quest card: `AQ-NETWORK`, `AQ-TIMEOUT`, `AQ-HTTP-<status>`, `AQ-RESPONSE` or `AQ-CLIENT`. Raw errors, response bodies, account tokens and URLs are not displayed or logged.

Changes from upstream 1.1.1:

- Finds flat, default-exported and nested `HTTP` clients, including modules loaded after startup. Uses Discord's signed-in client without copying or caching tokens.
- Handles Map, array and object quest collections, legacy/current task configs and camelCase/snake_case status fields.
- Pauses immediately when disabled, stopped, backgrounded, expired, unenrolled or switched to another account. Late responses cannot announce completion or navigate in another account.
- Runs all accepted video quests concurrently, with separate timers, requests, rate-limit waits and cancellation. Reports success only from Discord's completion response or QuestStore, and pauses an unconfirmed final result instead of inventing success.
- Limits request waits to 25 seconds, with a 20-second native timeout. Rate limits and temporary connection/service failures have a shared two-retry budget per progress update. Permanent failures pause until **Check again / retry paused quests**.
- Deduplicates new-quest notifications and adds live status/progress in Valenced settings, without startup or changelog popups.
- Optional auto-exit requires the exact quest ID and unchanged video route key. It remains inactive when Discord does not expose that information.

`index.js` is the complete editable source; it has no build-time JavaScript dependencies. From the repository root, run `python3 valenced/build.py` to rebuild the installable ZIP and catalogue, and `node --test valenced/tests/auto-quest.test.cjs` for mocked integration checks (requires the existing `revenge-next` test dependencies). GPL-3.0-only; original author and source revision are recorded in `NOTICE.txt`.

Version 1.2.2 has 81 Auto Quest integration checks, including concurrent progress, native response/error layouts, retry exhaustion/recovery, canonical module selection, cancellation and safe diagnostics. Three request/module regressions fail against the published 1.2.1 ZIP. The concurrency regression also fails against 1.2.0. All previous release archives and other catalogue entries are preserved.

The mobile request contract is checked against the [captured HTTPUtils source](https://github.com/Wumpus-Central/discord-mobile-datamining/blob/ba7734c84fbed39fde47c4aa3fc16e106fe90915/discord_common/js/packages/http-utils/HTTPUtils.tsx). The native wrappers in the tests model its fields; they do not send requests to a real Discord account.

Validation on 2026-11-01: all 81 Auto Quest checks, 392 Valenced integration checks and 7 package checks passed. Deterministic package generation, JavaScript syntax and whitespace checks also passed.

Validation uses a simulated Valenced host. The screenshot does not expose the original error, so the specific failure on the phone cannot be independently verified here. Device testing remains necessary.
