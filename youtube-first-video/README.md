# YouTube First Video

A Revenge mobile plugin by **fluttershy_simper** that finds a YouTube channel’s oldest available public upload. It checks the channel’s Videos, Shorts, and completed Live tabs, reads each oldest candidate’s publication date, and shows the earliest result.

## Install

In Revenge, open **Settings → Plugins → Add**, then paste this **folder URL**:

```
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/youtube-first-video/
```

Enable **YouTube First Video**. If your Revenge version offers an install-from-link prompt, opening the URL may offer installation directly. Do not install `index.js` or `manifest.json` separately.

## Use

- **Tap a YouTube channel link** in Discord to search instead of opening the channel. This is enabled by default and can be switched off in Configure. Video links open normally.
- **Long-press a message** containing a YouTube channel or video link, then choose **Find oldest YouTube video**.
- Use **`/ytfirst link:<YouTube URL or @handle>`**. The command opens a local result page; it does not send the result to the channel.
- Open the plugin’s **Configure** page to paste a link, search again, or cancel a running search.

The result includes the video title, channel, publication date in UTC, thumbnail, and Open/Copy buttons. **Open channel normally** bypasses tap interception.

Accepted links include `youtube.com/@handle` (including `?si=...` sharing parameters), `/channel/UC...`, `/user/...`, `/c/...`, mobile URLs, video URLs, Shorts, livestream links, and `youtu.be` links. A video link identifies its uploader first. Playlist and search links are rejected.

## What “first” means

The result is the **oldest public upload YouTube currently exposes in the channel’s Videos, Shorts and Live tabs**, based on YouTube’s Oldest sort and the publication dates available at lookup time. Deleted, private, unlisted, members-only, and region-hidden uploads cannot be found. It cannot establish which video the creator originally made, recorded, or uploaded privately.

There is no API key, login, third-party proxy, or backend to configure. Requests go directly to YouTube. No Discord message or account token is sent to YouTube. Lookups are requested by the user; the plugin does not scan chat history in the background. It does not post messages or automatically play a video.

YouTube’s page and internal browse format can change. The plugin reads the live **Oldest** control; it does not assume the old `sort=da` URL works. It fails visibly if it cannot confirm a date, a tab, or a sorting response. A channel with a single page and no sort control can be checked by comparing the dates of all uploads on that page; a longer unsorted feed is rejected instead of returning a partial result. A blocked or age-restricted candidate may prevent confirmation.

Discord’s link and message-menu modules also vary by version. Configure and `/ytfirst` provide alternate entry points if a tap or menu hook is unavailable. The code targets Revenge’s Vendetta compatibility API. It has not been tested on a physical Android device.

## Development and validation

No dependencies are required; Node.js 18+ is sufficient.

```
npm test
npm run test:live
```

`npm test` builds the evaluable Vendetta bundle, updates its SHA-256 manifest hash, and runs parsing, resolver, and lifecycle tests. `test:live` makes a real lookup of the Mobile Legends example; it downloads page metadata only, not video files.

Live validation on 11 October 2026 UTC found:

| Tab | Oldest available upload | Published (UTC) |
| --- | --- | --- |
| Videos | Mobile Legends Bang Bang New Skin Onimusha Commander - Alpha! (`pPFMh1zatn0`) | 2017-03-29 |
| Shorts | 5 more days to go until M3! (`WykUB7f0G-A`) | 2021-12-01 |
| Live | (ENGLISH) MPL-PH S11 Week 1 Day 1 (`k6ScFLNwtVo`) | 2023-02-17 |

The earliest of these was the Alpha skin video. Results can change if the creator removes or makes videos public.
