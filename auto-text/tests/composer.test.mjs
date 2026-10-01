import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateComposer } from '../src/composer.mjs';
const node = (type, props, ...children) => Object.freeze({ type, props: Object.freeze({ ...props, children }) });
const React = { cloneElement: (element, props) => ({ ...element, props: { ...element.props, ...props } }) };
const bar = node('AutoText', { key: 'bar' });

test('toolbar is a child of the floating column, not an outside sibling or native row', () => {
  let originalText = '', observed = '';
  const native = node('Native', { onSelectionOrTextChange(event) { originalText = event.nativeEvent.text; return 5; } });
  const row = node('View', { style: { flexDirection: 'row' } }, native);
  const floating = node('View', { collapsable: false, onStartShouldSetResponder() {}, onResponderRelease() {} }, row);
  const root = node('View', { style: { position: 'absolute', bottom: 0 } }, floating);
  const result = decorateComposer(React, {}, root, { toolbar: bar, onNativeEvent() { observed = originalText; } });
  assert(result.hasToolbar && result.hasEvents);
  assert.equal(result.tree.props.children.length, 1);
  const decoratedBox = result.tree.props.children[0];
  assert.equal(decoratedBox.props.children[0], bar);
  assert.equal(decoratedBox.props.children[1].props.children.length, 1);
  assert.equal(root.props.children[0].props.children.length, 1, 'original frozen tree remains unchanged');
  const callback = decoratedBox.props.children[1].props.children[0].props.onSelectionOrTextChange;
  assert.equal(callback({ nativeEvent: { text: ';br' } }), 5);
  assert.equal(observed, ';br', 'Discord handler runs before AutoText observes');
});
test('legacy measured input container receives one toolbar', () => {
  const root = node('View', { onLayout: function handleLayoutOfInputContainer() {} },
    node('Native', { onSelectionOrTextChange() {} }));
  const result = decorateComposer(React, {}, root, { toolbar: bar, onNativeEvent() {} });
  assert(result.hasToolbar);
  assert.equal(result.tree.props.children[0], bar);
});
test('unrecognized layouts do not add an overlay or alter unrelated inputs', () => {
  const root = node('View', {}, node('TextInput', { onChangeText() {} }));
  const result = decorateComposer(React, {}, root, { toolbar: bar, onNativeEvent() {} });
  assert.equal(result.tree, root);
  assert.equal(result.hasToolbar, false);
  assert.equal(result.hasEvents, false);
});
