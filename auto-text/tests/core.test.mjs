import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OPTIONS as options, DEFAULT_PHRASES as phrases, automaticEdit, applyEdit, suggestionsFor, validatePhrase, cleanPhrases, textEdit, startList } from '../src/core.mjs';
const type = (before, added = '\n', settings = options, max = 2000) => {
  const next = before + added;
  const edit = automaticEdit(before, next, settings, phrases, max);
  return edit ? applyEdit(next, edit) : next;
};
test('bullet, nested, numbered and task list continuation', () => {
  for (const marker of ['-', '*', '+', '•']) assert.equal(type(marker + ' item'), marker + ' item\n' + marker + ' ');
  assert.equal(type('  - nested'), '  - nested\n  - ');
  assert.equal(type('9. ninth'), '9. ninth\n10. ');
  assert.equal(type('3) item'), '3) item\n4) ');
  assert.equal(type('- [x] done'), '- [x] done\n- [ ] ');
});
test('Enter on an empty item exits and preserves prior paragraphs', () => {
  assert.equal(type('- one\n- '), '- one\n');
  assert.equal(type('1. '), '');
  assert.equal(type('hi\n  -   '), 'hi\n');
  assert.equal(type('- [ ] '), '');
});
test('pastes, replacement, deletions and earlier-line edits are unchanged', () => {
  for (const [before, next] of [['', '- pasted\n'], ['hey', 'hey ;brb '], ['- abc', '- ac'], ['- abc\n- def', '- a\nbc\n- def'], [';brb', ';brb\n']]) {
    assert.equal(automaticEdit(before, next, options, phrases), null);
  }
});
test('code, escaped code, fences and inline backtick runs', () => {
  assert.equal(type('```md\n- item'), '```md\n- item\n');
  assert.equal(type('~~~md\n- item'), '~~~md\n- item\n');
  assert.equal(type('` ;brb', ' '), '` ;brb ');
  assert.equal(type('``code ` ;brb', ' '), '``code ` ;brb ');
  assert.equal(type('```\ncode\n```\n- item'), '```\ncode\n```\n- item\n- ');
  assert.equal(type('\\` ;brb', ' '), '\\` Be right back! ');
  assert.equal(type('``example ` tick`` ;brb', ' '), '``example ` tick`` Be right back! ');
});
test('shortcut expansion is explicit, case-insensitive and multiline-safe', () => {
  assert.equal(type(';BRB', ' '), 'Be right back! ');
  assert.equal(type('Hi ;ty', ' '), 'Hi Thank you so much! ');
  assert.equal(type('https://x/;brb', ' '), 'https://x/;brb ');
  assert.equal(type(';unknown', ' '), ';unknown ');
  assert.equal(type(';rules', ' '), phrases[3].text + ' ');
});
test('options and message limits are enforced', () => {
  assert.equal(type('- item', '\n', { ...options, enabled: false }), '- item\n');
  assert.equal(type('- item', '\n', { ...options, bullets: false }), '- item\n');
  assert.equal(type(';brb', ' ', { ...options, shortcuts: false }), ';brb ');
  assert.equal(type(';brb', ' ', options, 8), ';brb ');
});
test('suggestions replace only the prefix and keep bullet markers', () => {
  let suggestion = suggestionsFor('- Thank', phrases)[0];
  assert.equal(applyEdit('- Thank', suggestion), '- Thank you so much!');
  suggestion = suggestionsFor('  2. ;br', phrases)[0];
  assert.equal(applyEdit('  2. ;br', suggestion), '  2. Be right back!');
  assert.equal(suggestionsFor('Th', phrases).length, 0);
  assert.equal(suggestionsFor('```\n;br', phrases).length, 0);
  assert.equal(suggestionsFor(';', phrases).length, 3);
});
test('validation rejects duplicate and invalid shortcuts and preserves empty phrase lists', () => {
  assert.throws(() => validatePhrase({ shortcut: 'brb', text: 'Hi' }));
  assert.throws(() => validatePhrase(phrases[0], phrases));
  assert.throws(() => validatePhrase({ shortcut: ';ok', text: 'x'.repeat(2001) }));
  assert.deepEqual(cleanPhrases([]), []);
  assert.equal(cleanPhrases(null).length, 4);
  assert.equal(validatePhrase({ shortcut: ' ;HELLO ', text: 'a\r\nb' }).text, 'a\nb');
});
test('minimal edits round-trip Unicode and list insertion', () => {
  for (const [a, b] of [['💙 hi', '💚 hi'], ['🌸 hi', '🌸 goodbye'], ['a😎x', 'a🙂y'], ['- 🍓\n- ', '- 🍓\n'], ['abc', '']]) {
    assert.equal(applyEdit(a, textEdit(a, b)), b);
  }
  assert.equal(applyEdit('Hello', startList('Hello')), 'Hello\n- ');
});
