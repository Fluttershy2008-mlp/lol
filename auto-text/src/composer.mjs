/* SPDX-License-Identifier: MIT */

// Work only within the rendered chat-input subtree. In modern Discord the
// input is a floating column, so a sibling above the guard lives OUTSIDE its
// measured layout and can be covered by the text field.
export function decorateComposer(React, RN, root, { toolbar, onNativeEvent, nativeReader }) {
  let floating = null, legacy = null, scanned = 0;
  function scan(node) {
    if (++scanned > 1500 || !node || typeof node !== 'object') return false;
    if (Array.isArray(node)) {
      let found = false;
      for (const child of node) found = scan(child) || found;
      return found;
    }
    const props = node.props;
    if (!props) return false;
    const containsNative = scan(props.children) || typeof props.onSelectionOrTextChange === 'function';
    if (containsNative) {
      if (!floating && props.collapsable === false && typeof props.onStartShouldSetResponder === 'function'
        && typeof props.onResponderRelease === 'function') floating = node;
      if (!legacy && /LayoutOfInputContainer/.test(props.onLayout?.name ?? '')) legacy = node;
    }
    return containsNative;
  }
  scan(root);
  const anchor = floating ?? legacy;
  let eventCount = 0, toolbarCount = 0, mapped = 0;
  function map(node) {
    if (++mapped > 1500 || !node || typeof node !== 'object') return node;
    if (Array.isArray(node)) {
      const next = node.map(map);
      return next.every((child, i) => child === node[i]) ? node : next;
    }
    const props = node.props;
    if (!props) return node;
    const patch = {};
    if (typeof props.onSelectionOrTextChange === 'function') {
      const original = props.onSelectionOrTextChange;
      patch.onSelectionOrTextChange = function (...args) {
        const result = original.apply(this, args);
        // The original handler first updates Discord's text/selection state.
        try { onNativeEvent(args[0]); } catch {}
        return result;
      };
      eventCount++;
      if (nativeReader && typeof props.onTextFlushed === 'function') {
        // Support React 18's element.ref and React 19's props.ref without
        // invoking their development warning getters. Preserve Discord's ref.
        const originalRef = Object.getOwnPropertyDescriptor(props, 'ref')?.value
          ?? Object.getOwnPropertyDescriptor(node, 'ref')?.value;
        if (originalRef != null) patch.ref = nativeReader.ref(originalRef);
        const flushed = props.onTextFlushed;
        patch.onTextFlushed = function (...args) {
          const result = flushed.apply(this, args);
          try { nativeReader.observe(args[0]); } catch {}
          return result;
        };
      }
    }
    const children = map(props.children);
    if (children !== props.children) patch.children = children;
    if (node === anchor && toolbarCount === 0) {
      patch.children = [toolbar, ...(Array.isArray(children) ? children : [children])];
      toolbarCount++;
    }
    return Object.keys(patch).length ? React.cloneElement(node, patch) : node;
  }
  const tree = map(root);
  return { tree, hasEvents: eventCount > 0, hasToolbar: toolbarCount > 0 };
}
