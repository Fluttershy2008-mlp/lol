# Quick Delete

Tap the text or empty area of a message to open **Delete Message** and, when the
message has visible embeds, **Remove Embeds**. Choose an action to apply it
immediately, without confirmation. **Cancel**, the backdrop and Android Back
close the native action sheet. Hold a message to keep Discord's full message menu.

The settings page also offers **One-tap delete**: tapping an eligible message
deletes it immediately. This is off by default so Remove Embeds stays accessible.
Deletion removes the message for everyone. Remove Embeds keeps its text and files.

Both DMs and server messages work. Your own sent messages are eligible; another
person's server messages require Manage Messages permission. Turn off
**Include moderation actions** to restrict Quick Delete to your own messages.
Links, images, avatars, scroll gestures, swipes, and system messages retain their
normal actions. Draft, failed and pending messages are excluded.

Separate switches control the native Delete Message and Remove Embeds
confirmation prompts in Discord's full message menu. Other prompts are unchanged.
Success toasts can be disabled. Duplicate taps produce one request; failures are
reported without automatic retries. Account changes, stopping and stale controls
cannot start new quick actions.

## Install

Refresh `https://fluttershy2008-mlp.github.io/lol/valenced/index.json`, find
**Quick Delete**, install and enable it, then reopen the chat. Its settings are
available from its card in Valenced's Plugins page.

## Validation

Run `python3 valenced/build.py --check` and
`PLUGIN_TEST_TARGET=valenced node --test valenced/tests/quick-delete.test.cjs`.
The automated fixture uses Valenced's real patcher and native event shape.
On-device Android taps and sheet layout still require handset verification.
