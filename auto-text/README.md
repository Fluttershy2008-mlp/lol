# AutoText for Revenge

An offline typing helper for Revenge's Vendetta-compatible mobile plugins. It suggests **phrases you save**, expands text shortcuts, and continues bullet points while you type. It does not generate AI responses or send messages automatically.

## Install

In **Revenge → Plugins → +**, paste this whole folder URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/auto-text/
```

Enable AutoText, then reopen a chat. The AutoText bar appears above the composer. Tap **Phrases** to edit your text shortcuts. The plugin's settings cog opens the same editor.

## Use it

| Action | Result |
| --- | --- |
| Type `;brb` and a space | Expands to `Be right back!` |
| Type `;ty` and a space | Expands to `Thank you so much!` |
| Type `;rules` and a space | Inserts a three-line bullet list |
| Type `;br` | Shows matching saved shortcuts; tap one to insert it |
| Type `Thank` | Suggests the saved phrase `Thank you so much!` |
| Type `- First point`, then Enter | Adds the next `- ` |
| Type `1. First point`, then Enter | Adds `2. ` |
| Press Enter on an empty list item | Ends the list |
| Tap **+ Bullet** / **+ Number** | Starts a list at the end of your draft |
| Tap **Undo** | Reverts the latest AutoText change, if you have not typed more |
| Tap **Pause** | Stops typing assistance until you resume |

You can save up to 100 custom phrases, including multiline messages and bullet lists. Use a shortcut beginning with `;`, such as `;intro`. Phrases are saved on this device and shared by accounts using this installation; chat history and typed drafts are not collected or stored by AutoText.

List support includes `-`, `*`, `+`, `•`, numbered markers ending in `.` or `)`, indentation and checklists. Suggestions preserve the current bullet or number. The `•` character is a visual bullet; `- ` produces Discord Markdown bullets.

Automatic changes trigger only when a single space or newline is added at the end of a draft. Paste operations, earlier-line edits and code blocks are not automatically rewritten. The current Discord message limit is respected, with 2,000 characters used when the limit cannot be found. Overlong suggestions leave the draft unchanged.

## Compatibility and troubleshooting

This uses `ChatInputGuardWrapper` and the native composer's `getText`, `handleTextChanged` and `insertText` methods. Hooks are restricted to mounted chat composers and removed when the plugin is disabled. The small range edits preserve native mention nodes outside the replacement range.

Discord can change these internal APIs. If the bar is missing, reopen the chat or restart Revenge and check the status in AutoText settings. If the live composer is unsupported, settings still include a practice editor and **Copy draft** button. No message is sent by using that editor.

Automated tests cover text formatting, stale-draft protection, rapid typing, native event echoes, unload cleanup, settings phrase editing, loader evaluation and the manifest hash. **A physical Android/Revenge session has not been tested.**

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
