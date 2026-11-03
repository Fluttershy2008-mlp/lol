# Scrollbar (Valenced) · 1.0.0-beta2

This version expands Scrollbar's vertical list recognition beyond beta1 to support compatible Discord chat message histories, the DM home inbox and server channel lists. It fixes a first-render bug in which viewport and content size events arriving separately prevented the thumb from ever appearing.

Features: position left/right; custom thumb colour, width and direction; optional track; automatic other-list detection (on by default); virtualized-list size estimation; normal touch scrolling outside the narrow handle.

The plugin uses scroll methods supported by each component (scrollToOffset, scrollTo, scrollToPosition, scrollToIndex, scrollToEnd and scrollToTop) and preserves existing message click, swipe, layout and ref callbacks. No network requests or message changes. Settings show Chat/DM/Other detection counts and unsupported command reports.

## Install

Refresh https://fluttershy2008-mlp.github.io/lol/valenced/index.json, update **Scrollbar** to **1.0.0-beta2**, then fully restart Discord. Find plugin preferences under Valenced > Plugins > Scrollbar.

## Compatibility

This is an experimental client-side compatibility release. Some modern Discord chat views use private native list implementations with no exposed JS scroll ref or content dimensions. Those views may still lack a working scrollbar until their particular native interface is identified. Local tests cover mocked React Native chats, DM lists, ScrollViews, dragging and stop cleanup, **not live Android handset tests**.

If a list still doesn't show the handle, open plugin Settings and report the Status plus Chat/DM/Other counters, and send a screenshot of the missing view. Source code is bundled inside the release ZIP under index.js.
