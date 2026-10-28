# Stealmoji for Revenge

Install this folder URL in **Revenge → Plugins → Install a plugin**:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/stealmoji/
```

Disable the old Stealmoji copy before installing this one, then reload Revenge.

## Valenced page picker in 2.1.7

Valenced **1.0.0-beta6** replaces Stealmoji's popup with a **regular Valenced navigation page**. The picker never opens an alert host, RN Modal or second action sheet on this client. Discord's original message menu is dismissed before the page opens. This removes the stacked native-window dependency that can leave input blocked even after the inner picker is hidden.

The page retains server search, one virtualized list, name editing and emoji tools. Successful upload/copy/save, Close and Android Back return through normal navigation. A unique route marker prevents late results from popping another Discord screen. A closed page kept in the native stack removes only itself when focused again. Queued openings are cancelled on stop, and a page that never mounts has an eight-second deadline. If navigation is unavailable, Stealmoji directs you to its normal plugin settings; it does not fall back to another popup on Valenced.

Refresh the repository and update **Stealmoji to 1.0.0-beta6**, then force-close and reopen Discord to clear a window retained by an older version. The new picker should fill a normal settings page with a native Back button. Prior upload-response parsing, single-write guards, preparation cancellation and operation deadlines remain included.

Nine native page-flow cases fail against beta5 and pass here. They cover zero popup/window calls, repeated uploads and responsive underlying controls, Android Back, late results over another screen, queued/cold registration, a mount deadline, nested route state and settings fallback. A separate React test covers a cached page regaining focus. The complete run passes **890 Node checks and 16 Python checks**, with one optional unrelated Hermes test skipped and both deterministic package checks passing. Tests model the native APIs; physical phone verification remains pending. Next **1.0.0-beta8** and Classic **2.1.7** carry the shared source while retaining their existing picker presentation.

The page uses the existing Valenced custom settings route and [React Navigation's container ref](https://reactnavigation.org/docs/navigation-container/) for focus ownership and Back. [Implementation](src/page.mjs).

## Picker cleanup in 2.1.6

Valenced **1.0.0-beta5**, Next **1.0.0-beta7** and Classic **2.1.6** close the menu picker after a confirmed emoji upload, clipboard copy or save action. Closing removes Stealmoji's owned modal/alert entry and releases its listeners. This also works with a retaining or throwing native alert dismiss method, without removing unrelated alerts. The plugin settings page remains open and shows its result.

**Close stays available while uploading or copying.** Closing during image preparation aborts the download and prevents a later write. A request already handed to Discord is not retried or claimed to be cancelled; the single-upload guard remains until it settles or reaches a 45-second deadline. A fresh picker shows an explicit in-progress message while that happens. Clipboard/save actions have a 15-second deadline. Late results cannot display stale success, reopen a closed picker or close a newer one.

View emoji dismisses the picker before opening Discord's native viewer, avoiding stacked modal windows. Disabling Stealmoji, switching accounts or opening another picker cancels a queued viewer. A keyboard-dismiss error cannot prevent the picker from closing.

Refresh the existing repository, update **Stealmoji**, then force-close and reopen Discord. Tests cover both native hosts, owned alert-store removal, copy link/image/save, Close during writes/downloads, timeouts, one write in flight, stale results and viewer ordering. All 14 new integration scenarios fail against the preceding packages and pass with this change. Two source tests also check download cancellation. Physical phone verification remains pending. [React Native Modal reference](https://reactnative.dev/docs/0.86/modal).

## Confirmation and scrolling in 2.1.5

Valenced **1.0.0-beta4**, Next **1.0.0-beta6** and Classic **2.1.5** accept JSON text, nested data/body envelopes and Fetch-style upload responses. When a successful REST response has no created ID, the plugin compares the server's emoji list before and after the single POST. Exactly one new matching ID confirms the upload. An existing same-name emoji, another user's creation or ambiguous matches cannot produce a false success. Failed or uncertain writes are never retried automatically.

The menu picker uses a bounded native modal with one virtualized server list, a fixed title/search area and a separate form scroll view. It dismisses the originating message sheet. Close, Android Back, backdrop, disable and reopen release the picker, including when native alert dismissal retains a node or throws. Legacy sheets remain available when a native modal cannot be opened.

Refresh the repository, update Stealmoji and fully restart Discord. Native integration checks cover a 196-server picker, search, choosing/back navigation, dismissal and reopening, and exactly one POST with empty/text/enveloped responses. Tests simulate Valenced and Next; physical phone uploads and gesture scrolling remain unverified.

## Upload compatibility in 2.1.4

Valenced **1.0.0-beta3**, Next **1.0.0-beta5** and Classic **2.1.4** fix the missing emoji upload module error. Add emoji resolves the native action at submission time. If it is absent, the prepared image data is posted to Discord’s guild emoji endpoint using the signed-in HTTP client. PNG and animated GIF bytes and the edited name are retained; uploads do not read or expose account tokens.

The plugin rechecks its session, the current account, permissions and emoji slots after downloading. One route is chosen before dispatch, and a failed or uncertain POST is never retried through a second uploader. REST creation requires a returned emoji ID before showing success. Existing native actions that dispatch success and return void remain supported. The picker follows Discord’s theme even when the system theme differs.

Refresh the existing repository, update **Stealmoji**, then fully restart Discord. Native picker tests run on both Valenced and Next; physical phone uploads remain unverified. The JSON fields follow [Discord’s Create Guild Emoji endpoint](https://docs.discord.com/developers/resources/emoji#create-guild-emoji). The shared helper is [compatibility/expression-upload.mjs](../compatibility/expression-upload.mjs).

## Use

- Tap a custom emoji, then choose **Stealmoji · Add / save emoji**.
- Long-press a message containing custom emoji to find the same action. Messages
  with multiple emoji show a selection list (up to 25 unique emoji).
- Long-press a custom emoji tab in the reactions sheet to open its tools.
- Scroll the **Stealing [emoji name]** server list, or use **Search servers**.
  Each server has an icon and a **+** button. Tap the row or **+**, edit the name,
  and press **Add emoji**. Full servers stay visible with **No slots available**.
- Tap **Emoji tools** to view, copy the link, save the image/GIF, or change the
  animated setting. Static images also have Copy image on iOS. Tap **Browse
  servers** to return to the list.
- If your Discord build uses a different menu layout, open **Stealmoji's plugin
  settings** and paste a custom emoji such as `<:name:123456789012345678>`, an
  emoji CDN URL, or its ID. For an animated ID that Discord has not cached, turn
  on **Animated emoji (GIF)**. Unicode emoji cannot be copied into server slots.

## Changes in 2.1.1

- Plain text long-press menus keep Discord's original promise and component tree
  when there are no custom emoji to act on.
- Emoji menu edits preserve untouched branches, avoid wrapping React Native
  controls, and bound fallback tree traversal.
- Repeated action presses open only one Stealmoji picker. Closing or swiping it
  away releases the guard; disabling the plugin invalidates pending pickers.
- Regression tests cover ordinary messages, repeated picker presses, dismissal,
  and reopening. Native phone testing is still required for your Discord build.

## Changes in 2.1.0

- Dedicated scrolling server picker matching the original Stealmoji layout:
  emoji thumbnail, title, server icons, plus buttons, and dimmed full servers.
- Title and search stay above the list while servers scroll. The list uses
  Discord's BottomSheetFlatList when available, RN FlatList outside the sheet,
  and a ScrollView fallback on builds without either list component.
- Server rows are rendered in batches, keeping large server lists manageable.
- Rechecks permission and free slots when a row is selected, as well as before
  uploading. Emoji tools and the settings paste tool are still available.

## Changes in 2.0.0

- Safe module discovery with bounded startup retries and an app-resume retry.
- Independent settings tool even when Discord's menu hook is unavailable.
- Immutable React tree edits and per-opening wrappers, including memo/forwardRef
  components. No nested patch accumulation or hooks inserted into render patches.
- Searchable server picker, separate static/animated slot checks when available,
  permission checks before and after downloading, and name validation.
- Preserves GIF animation; requests smaller CDN sizes if the file exceeds the
  upload limit. Download and FileReader failures/timeouts are shown in the UI.
- Prevents overlapping uploads. No automatic retry of upload requests, and no
  upload starts if the plugin was disabled during the download.
- Modern sheet UI and AlertModal fallback; no legacy FluxContainer(Alert) lookup.
- Unload removes patches, startup timers, and the app-resume listener. Pending
  downloads time out and cannot initiate an upload after unloading. An upload
  already sent to Discord may still complete.

Discord still decides which uploads are allowed. You need Create Expressions
permission and a free slot. Unknown slot counts are left to Discord rather than
guessing a limit. Very large GIFs may still be too large even at 32 pixels.

API reference: https://docs.discord.com/developers/resources/emoji#create-guild-emoji
(256 KiB maximum, Create Expressions permission).

## Build and tests

Node 20+; no packages to install:

```sh
npm run build
npm test
```

`index.js` is a Vendetta-compatible expression bundle. `manifest.json` points to
it and includes its SHA-256 hash. Source lives in `src/`; all source and build
files are published alongside the install files.

Automated tests cover parsing, GIF preservation, download failures and size
limits, permissions, upload locks, unload races, menu injection, and cleanup.
They use mocked Discord/React Native modules. An actual Android/iOS Revenge
session is still needed to verify each Discord version's native menu and upload
behavior; no phone test is claimed.

GPL-3.0; see LICENSE and NOTICE. Original authors: Fiery, pylix, aliernfrog.
