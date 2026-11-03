# Scrollbar for Valenced — 1.0.0-beta3

Fixes for beta2's duplicate bars and non-functional drag handles. **Update in place**; the plugin ID and saved preferences remain the same.

## Changes

- Only one active, measurable scrollbar is rendered. Narrow server icon rails, horizontal carousels and nested non-active lists do not show extra handles.
- Requires a real list ref exposing scroll commands. No scrollbar is shown for a message tap handler or non-scrollable container.
- Correct RecyclerListView signatures: `scrollToOffset(x, y, animate)` and `scrollToIndex(index, animate)`, as distinct from React Native FlatList `scrollToOffset({offset, animated})`.
- Preserves original scroll callbacks including RecyclerListView's `(event, x, y)` and existing refs.
- Smooth thumb dragging without jumping at the start of the gesture; thumb tracks native scroll events.
- Detects ignored commands: if no actual `onScroll` event or current offset change is observed, hides the nonworking handle rather than pretending to scroll.
- Reduces ref reattachment by keeping a stable callback ref between React renders.
- Tracks scroll commands sent, movement confirmed, and failures in settings.

## Install

Refresh `https://fluttershy2008-mlp.github.io/lol/valenced/index.json`, update Scrollbar to **1.0.0-beta3**, and **fully close and reopen Valenced**. Do not keep beta2 running in the same process. Find preferences under Valenced > Plugins > Scrollbar > Settings.

## Compatibility and limitations

Tested with 11 automated mock interaction/regression cases, including FlatList, ScrollView, RecyclerListView, nested lists, native offset verification, cancelled ref detach and missing list refs. Physical Android handset testing has **not** been performed.

Valenced/Discord builds using private native chat renderers without an imperative scrolling ref cannot be forced to scroll by this JavaScript-only plugin; beta3 hides its handle on those screens rather than covering messages with broken controls. A device-specific native implementation would be needed for unsupported renderers. Reopen the plugin settings after attempting a drag to inspect the movement counters and status.

There are no network requests, remote scripts, or message changes.
