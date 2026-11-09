import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateForumComposer, createForumTarget } from '../src/forum.mjs';

const element = (type, props = {}, ...children) => Object.freeze({ type,
  props: Object.freeze({ ...props, children: children.length === 1 ? children[0] : children }) });
const React = { cloneElement: (node, props) => ({ ...node, props: { ...node.props, ...props } }) };

test('forum toolbar uses the raw body, retaining title, avatar, rich text and Post action', () => {
  const title = element('FormInput', { multiline: true, value: 'My title', onChange() {} });
  const body = element('TextInput', { multiline: true, onChangeText() {}, onSelectionChange() {} },
    element('Text', {}, 'Hello @Fluttershy'));
  const footer = element('Footer', { onSubmit() { throw new Error('Must not submit'); } });
  const root = element('View', {}, title, element('View', {}, body), footer,
    element('Autocomplete', { onPressAutocompleteItem() {}, text: 'Hello <@123>' }));
  const replacement = element('ForumInput');
  let calls = 0;
  const result = decorateForumComposer(React, root, (input, text) => {
    calls++; assert.equal(input, body); assert.equal(text, 'Hello <@123>'); return replacement;
  });
  assert.equal(calls, 1);
  assert.equal(result.props.children[0], title);
  assert.equal(result.props.children[1].props.children, replacement);
  assert.equal(result.props.children[2], footer);
  assert.equal(root.props.children[1].props.children, body);
});

test('ambiguous fields or rich content without raw text leave the editor intact', () => {
  const body = element('TextInput', { multiline: true, onChangeText() {}, onSelectionChange() {} }, element('Text', {}, 'rich'));
  for (const root of [body, element('View', {}, body, body)]) {
    assert.equal(decorateForumComposer(React, root, () => assert.fail('must not attach')), root);
  }
});

test('forum edits wait for Discord state to confirm, use fresh handlers, and retain cursor position', () => {
  const bridge = createForumTarget();
  let requested, cursor;
  const ref = { current: { setNativeProps: props => { cursor = props.selection; } } };
  bridge.update({ ref, onChangeText: next => { requested = next; } }, 'Hello');
  bridge.target.insertText('!', 5, false, undefined, 5);
  assert.equal(requested, 'Hello!');
  assert.equal(bridge.target.getText(), 'Hello', 'write request is not a confirmation');
  bridge.update({ ref, onChangeText: next => { requested = 'fresh:' + next; } }, 'Hello!');
  bridge.commit();
  assert.deepEqual(cursor, { start: 6, end: 6 });
  bridge.target.insertText('?', 6, false, undefined, 6);
  assert.equal(requested, 'fresh:Hello!?');
  bridge.observe('Manual change');
  bridge.commit();
  assert.equal(bridge.target.getText(), 'Manual change');
  assert.equal(bridge.target.handleSend, undefined);
});
