# ValidUser for Revenge

Install URL (paste the entire folder URL into Revenge's plugin installer):

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/valid-user/
```

Disable the old ValidUser first, install this version, then restart Revenge.

## Use

- Automatic resolution is on by default. It starts when Revenge loads, waits for Discord's account/channel/message cache to be ready, and looks up unknown mentions in the channel you are viewing, including embeds, component text and forwarded messages.
- Message and channel store changes, reconnection, and returning to the app trigger further automatic scans. Startup retries stop after 30 seconds; later cache changes are detected through store listeners. No long-press or pop-up confirmation is needed for automatic lookups.
- Long-press a message and choose **Resolve mentions / Open profile**. The result explains whether Discord returned a real user and offers **Open profile** on success. For several users, tap **Next**.
- The plugin's settings also accept a user ID, `<@mention>`, or Discord user link. Automatic lookup can be switched off there.
- If an already-rendered mention still shows the old ID after resolution, switch channels and return. Some Discord builds cache the parsed message independently of the user store.

## What changed in 2.1.0

- Reliable startup scans even when the selected channel, account or messages load after the plugin.
- Debounced store listeners and bounded startup retries catch cache hydration without constant polling.
- Automatically scans again when you return to Revenge or reconnect.
- Reconnection on the same account preserves lookup cooldowns. Logout, account changes and plugin disable still cancel stale work.

## What changed in 2.0.0

- Reads both raw API and Discord MessageRecord fields, including embed descriptions/fields and both snapshot spellings.
- One bounded request queue, duplicate suppression, request timeouts, rate-limit cooldown and short-lived failure caching.
- Failed access, network errors and unknown-user responses are kept distinct. None creates a fake Deleted User or fake profile.
- Menu integration wraps each opening rather than accumulating render patches and conditional hooks.
- Disabling the plugin or switching accounts cancels queued work and ignores late replies.
- Removed the global avatar interceptor, gateway requests and fabricated MESSAGE_UPDATE refreshes. Original message content, attachments and embeds are left intact.

This fixes client-side missing user information when Discord returns it. It cannot make unavailable profiles accessible. Profile opening uses Discord's normal profile sheet and permissions.

## Development

```sh
npm run build
npm test
```

The dependency-free build generates `index.js` and its SHA-256 manifest hash. Tests cover parser inputs, queue/rate-limit behaviour, lifecycle cancellation and mocked Revenge integration. A live Android Revenge session is still needed to confirm behaviour on a particular Discord build.

Adapted from the supplied [fshinz/Revenge-Plugins ValidUser](https://github.com/fshinz/Revenge-Plugins/tree/master/plugins/ValidUser). Original authors: fshin, o.oer and kmmiio99o. CC0-1.0; see LICENSE.
