# AutoText for Revenge

Automatically type a prepared message into Discord **letter by letter**. Paste your full message, choose a speed, and watch it appear in the chat composer. Bullet points, emojis and line breaks are preserved. Choose whether to leave the result as a draft or automatically send the complete message once when typing finishes.

Built for Revenge's Vendetta-compatible mobile plugins. No AI service, account token or API key is needed.

## Install

In **Revenge → Plugins → +**, paste this whole folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/auto-text/
```

Enable AutoText, then reopen a chat. The compact AutoText bar appears inside the composer, above the typing row. Tap **AutoType** to prepare the message you want typed.

Updating from an earlier version: update the plugin to **1.2.1**, then fully restart Revenge. Keep plugin updates enabled. Your saved phrases stay in place.

## Automatic typing

1. Open the chat where you want to type.
2. Tap **▶ AutoType** in the message box.
3. Paste or enter your full message in **Message to type**. Multiline bullet lists work as entered.
4. Choose **Very slow**, **Slow**, **Normal**, or **Fast**.
5. For automatic sending, turn on **Auto-send when finished**, then tap **Start typing & send**. Otherwise tap **Start typing**.
6. Watch the message appear character by character. Tap **■ Stop** to stop early and cancel pending auto-send.
7. With auto-send on, the full draft is submitted once after the last character. With it off, tap Discord's **Send** button yourself.

The text is appended to the end of the current draft; clear the message box first if you want to start empty. Stopping keeps the partial draft. Starting again begins a new run with the prepared text, so clear or edit the message box before repeating it.

| Speed | Time per visible character |
| --- | --- |
| Very slow | 500 ms (half a second) |
| Slow | 150 ms |
| Normal | 70 ms |
| Fast | 25 ms |

There is a short initial delay so the editor can close. Discord's native updates may slow this down. AutoType waits for confirmation before inserting another character and stops if the composer cannot confirm an edit.

It stops on manual edits, cursor movement, channel/account changes, backgrounding, plugin unload, or a user-initiated Send. It never starts another message automatically. The prepared message is held only in memory for the current composer; your selected speed and auto-send preference are saved.

### Auto-send behavior

Auto-send is off initially. Your selection is remembered after starting a run. The button says **Start typing & send** and the typing bar shows **Auto-send on** when enabled.

It sends the **whole current draft once**, including any existing text, replies and attachments. It does not split the message at sentence endings or between bullet points. The final native text update must be confirmed, and the active account, channel and exact draft are checked again immediately before submitting.

The plugin uses the composer's normal `handleSend()` action. Discord's usual validation and reply/attachment handling apply. Stop, cursor movement, manual edits, leaving the chat, backgrounding, disabling the plugin, or manually tapping Send cancels a pending automatic submission. Once the native Send action has been called, stopping cannot recall it.

Automatic sending is never retried. The status reports that sending was requested, rather than claiming server delivery. If the draft remains or Discord reports an error, check the chat before sending manually. If the composer lacks the supported send action, the plugin explains that auto-send is unavailable and lets you turn it off.

The whole run is checked against your available message length before starting. Emoji sequences and common combined characters are typed together. Existing shortcut expansion and automatic bullet continuation are suspended during a run so the prepared message stays literal.

## Optional typing helpers

The previous saved-phrase and list helpers remain available through **Phrases** and the settings cog.

| Action | Result |
| --- | --- |
| Finish typing `;brb` | Expands to `Be right back!` without a trailing space |
| Finish typing `;ty` | Expands to `Thank you so much!` |
| Finish typing `;rules` | Inserts a three-line bullet list |
| Type `;br` | Shows matching saved shortcuts; tap one to insert it |
| Type `Thank` | Suggests the saved phrase `Thank you so much!` |
| Type `- First point`, then Enter | Adds the next `- ` |
| Type `1. First point`, then Enter | Adds `2. ` |
| Press Enter on an empty list item | Ends the list |
| Tap **• List** / **1. List** | Starts a list at the end of your draft |
| Tap **Undo** | Reverts the latest AutoText change, if you have not typed more |
| Tap **Pause** | Stops typing assistance until you resume |

You can save up to 100 custom phrases, including multiline messages and bullet lists. Use a shortcut beginning with `;`, such as `;intro`. Phrases are saved on this device and shared by accounts using this installation; chat history and typed drafts are not collected or stored by AutoText.

List support includes `-`, `*`, `+`, `•`, numbered markers ending in `.` or `)`, indentation and checklists. Suggestions preserve the current bullet or number. The `•` character is a visual bullet; `- ` produces Discord Markdown bullets.

Automatic changes trigger only when a single character is added at the end of a draft. With **Expand without a space** enabled (the default), a complete shortcut expands immediately. If one shortcut is a prefix of another, add a space or tap its suggestion. Disable that option to require a trailing space for every automatic expansion. Paste operations, earlier-line edits and code blocks are not automatically rewritten. The current Discord message limit is respected, with 2,000 characters used when the limit cannot be found. Overlong suggestions leave the draft unchanged.

## Compatibility and troubleshooting

This uses `ChatInputGuardWrapper`, the native `onSelectionOrTextChange` event, and the composer's `getText` and `insertText` methods. The old `handleTextChanged` hook is retained as a compatibility path. Hooks are restricted to mounted chat composers and removed when the plugin is disabled. The small range edits preserve native mention nodes outside the replacement range.

Version 1.0.1 puts the toolbar inside the measured floating input column, rather than beside the guard, and bounds each toolbar strip to 44 layout units. It fixes the old overlapping controls and oversized blank area. Native events are observed after Discord updates its own state, including cursor movement that cancels a pending automatic edit.

Discord can change these internal APIs. If the bar is missing, reopen the chat or restart Revenge and check the status in AutoText settings. If the live composer is unsupported, settings still include a practice editor and **Copy draft** button. No message is sent by using that editor.

Automated tests cover optional auto-send, final-character acknowledgment, single submission, native send failures, cancellation immediately before submission, automatic typing speed, literal multiline messages, Stop, delayed native acknowledgments, emoji clusters, user-initiated Send, backgrounding, text formatting, stale-draft protection, rapid typing, native event echoes, native-only input events, cursor movement, toolbar placement within a floating composer, unload cleanup, settings phrase editing, loader evaluation and the manifest hash. **The 1.2.1 update has not yet been verified in a physical Android/Revenge session.**

## Development

Node.js 18 or newer; no npm dependencies.

```sh
npm run build
npm test
```

Commit `index.js` and `manifest.json` alongside the source. The build regenerates the SHA-256 manifest hash used for plugin updates. The bundle is a self-contained expression compatible with Revenge's plugin evaluator.

API references used for integration:

- [Revenge's Vendetta plugin loader](https://github.com/revenge-mod/revenge-bundle/blob/main/src/core/vendetta/plugins.ts)
- [Revenge's compatibility API](https://github.com/revenge-mod/revenge-bundle/blob/main/src/core/vendetta/api.tsx)
- [Message Preview's composer hook](https://github.com/nexpid/RevengePlugins/blob/main/src/plugins/message-preview/src/stuff/patcher.ts)

Original implementation, MIT licensed.
