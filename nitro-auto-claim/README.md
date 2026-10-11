# Nitro Auto Claim for Revenge

Automatically attempts to claim standard Discord gift links from **new messages** and **new edits** received by Revenge. Enabled by default when installed. Open its plugin settings to pause it, ignore your own links, control notifications and view the latest 50 results.

## Install

Revenge → Settings → Plugins → Add plugin. Paste this complete folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/nitro-auto-claim/
```

## Behavior and limits

- Recognizes `discord.gift/CODE`, `discord.com/gifts/CODE` and legacy `discordapp.com/gifts/CODE`, with or without HTTPS. Rejects lookalike hosts and redirect URLs.
- Claims through Discord's existing REST client for the currently signed-in account. No separate login, token extraction, webhook or outside service.
- Ignores your own gifts by default so gifts you send to friends stay theirs.
- Watches both servers and DMs. Does not scan message history or messages missed while the app was closed. Android can suspend Revenge in the background.
- Processes one request at a time, with 1.5 seconds between attempts and a bounded queue. Keeps the last 1,000 attempted codes per account on this device, including across reloads. Clearing result history keeps this duplicate protection.
- Cancels queued work on disconnect, account change, disable or unload. A request already sent cannot be undone. A successful claim cannot be transferred to a different account.
- Pauses on rate limits, verification/authentication blocks or unknown request outcomes. Re-enable in settings after resolving the issue. It never automatically retries a failed code.
- Expired, already claimed or ineligible gifts cannot be redeemed. Promotional trial/billing links, payment requirements and verification need manual action. No guarantee of winning a claim before someone else.
- Discord forbids automated normal-user-account activity and says it can lead to account termination. See [Discord's self-bot policy](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots). This plugin carries that account risk.

## Development

No dependencies required; Node 20 or newer:

```sh
npm test
npm run build
```

The build creates `index.js` in Vendetta/Revenge's expression format and updates the manifest SHA-256 hash. Tests use a mocked Discord REST client; they do not redeem real gifts. Compatibility must still be checked on the user's actual Discord/Revenge version.

MIT licensed. Independently implemented for this repository.
