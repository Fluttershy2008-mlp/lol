# Quick Delete

**One-tap reply** opens Discord's reply bar and the current keyboard as soon as
you tap a message. Enable it at **Settings → Valenced → Quick Delete → One-tap
reply**. It switches off One-tap delete and enables message taps. Turning
One-tap delete on switches One-tap reply off, so a tap has one selected action.
One-tap reply starts off for existing users, preserving their current deletion
setting and menu behaviour.

When both one-tap options are off, the quick menu works as follows.

Tap the text or empty area of a message to open **Reply**, **Delete Message** and,
when permitted and the message has visible embeds, **Remove Embeds**. Delete and
Remove Embeds apply immediately, without confirmation. **Cancel**, the backdrop
and Android Back close the native action sheet. Hold a message to keep Discord's
full message menu.

**Reply** opens Discord's normal reply bar and the current chat keyboard. Your
existing draft stays in the composer; type your reply and press Send yourself.
You can reply to other people's messages in DMs and server channels without
Manage Messages permission. Discord's own reply eligibility is checked when
available, including when you choose Reply after opening the menu. The **Reply
in tap menu** switch controls this row and is separate from One-tap reply.
Reply uses the ordinary action-sheet source,
so plugins that replace swipe-to-reply do not mistake it for a delete gesture.

The settings page also offers **One-tap delete**: tapping an eligible message
deletes it immediately. This is off by default so Reply and Remove Embeds stay accessible.
Deletion removes the message for everyone. Remove Embeds keeps its text and files.

Both DMs and server messages work. Deletion is available for your own sent
messages; another person's server messages require Manage Messages permission.
Turn off **Include moderation actions** to restrict deletion to your own messages.
Links, images, avatars, scroll gestures, swipes, and system messages retain their
normal actions. Draft, failed and pending messages are excluded.

Separate switches control the native Delete Message and Remove Embeds
confirmation prompts in Discord's full message menu. Other prompts are unchanged.
Success toasts can be disabled. Duplicate taps produce one request; failures are
reported without automatic retries. Queued replies are cancelled on stop and
rechecked after account/channel changes. Stale controls cannot start new quick
actions after disabling the plugin.

## Install

Refresh `https://fluttershy2008-mlp.github.io/lol/valenced/index.json`, find
**Quick Delete**, update it to **1.2.0** and reopen the chat. Find its settings
directly at **Settings → Valenced → Quick Delete**, alongside Server Leaver and
Friends List. Its Plugins-page settings button remains available. Saved settings
and the plugin ID are retained. One-tap reply starts off; Reply in tap menu
retains the old Quick Reply preference. Turn off **Tap for quick actions** to
disable all plugin tap shortcuts without forgetting the selected one-tap mode.

## Validation

Run `python3 valenced/build.py --check` and
`PLUGIN_TEST_TARGET=valenced node --test valenced/tests/quick-delete.test.cjs valenced/tests/settings-shortcuts.test.cjs`.
The automated fixture uses Valenced's real patcher and native event shape.
The settings API was checked against Valenced `4fb12ba` (1.2.4). Automated checks
cover both native Reply and its pending-reply fallback, exact channel/message
identity, keyboard focus, unchanged drafts, permission changes, cancellation,
settings registration and coexistence with the other Valenced entries. One-tap
reply checks cover direct keyboard opening, mutually exclusive modes, conflicting
saved values, master switch, restart, duplicate taps and cancellation on mode changes.
The new direct one-tap interaction still requires handset verification.
