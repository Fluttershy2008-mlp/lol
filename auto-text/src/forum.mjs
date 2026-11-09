/* SPDX-License-Identifier: MIT */

// ForumComposer uses a React Native TextInput, not ChatInput's native commands.
// Only inspect this specific composer's tree. Its autocomplete holds the raw
// message (including mention markup); the title uses onChange, not onChangeText.
export function decorateForumComposer(React, root, renderInput) {
  let input = null, text = null, visited = 0;
  function scan(node) {
    if (++visited > 1500 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(scan); return; }
    const props = node.props;
    if (!props) return;
    if (props.multiline && typeof props.onChangeText === 'function'
      && typeof props.onSelectionChange === 'function') {
      // Ambiguous layouts must not attach to an arbitrary field.
      input = input === null ? node : false;
    }
    if (typeof props.onPressAutocompleteItem === 'function' && typeof props.text === 'string') text = props.text;
    scan(props.children);
  }
  scan(root);
  if (!input) return root;
  if (text === null) {
    if (typeof input.props.value === 'string') text = input.props.value;
    else if (typeof input.props.children === 'string') text = input.props.children;
  }
  if (text === null) return root;
  visited = 0;
  function map(node) {
    if (++visited > 1500 || !node || typeof node !== 'object') return node;
    if (node === input) return renderInput(node, text);
    if (Array.isArray(node)) {
      const next = node.map(map);
      return next.every((child, i) => child === node[i]) ? node : next;
    }
    if (!node.props) return node;
    const children = map(node.props.children);
    return children === node.props.children ? node : React.cloneElement(node, { children });
  }
  return map(root);
}

export function createForumTarget() {
  let input = null, text = '', desiredSelection = null;
  const target = {
    getText: () => text,
    focus() { input?.ref?.current?.focus?.(); },
    insertText(insert, start, space, nodes, end = start) {
      const next = text.slice(0, start) + insert + text.slice(end);
      desiredSelection = { text: next, selection: { start: start + insert.length, end: start + insert.length } };
      // Use Discord's own change handler to update its React state and draft.
      // Confirmation comes from the subsequent render, never this request.
      input.onChangeText(next);
    },
  };
  return {
    target,
    update(props, next) { input = props; text = next; },
    observe(next) { text = next; desiredSelection = null; },
    commit() {
      const selection = desiredSelection?.text === text ? desiredSelection.selection : null;
      desiredSelection = null;
      const ref = input?.ref?.current;
      if (selection && typeof ref?.setSelection === 'function') ref.setSelection(selection.start, selection.end);
      else if (selection) ref?.setNativeProps?.({ selection });
    },
  };
}
