/* SPDX-License-Identifier: MIT */
import { automaticEdit, applyEdit, textEdit } from './core.mjs';

// One session belongs to one mounted composer. No drafts are stored here persistently.
export function createSession({ target, patcher, options, phrases, maxLength, allowed = () => true, changed = () => {}, report = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
  let disposed = false, writing = false, timer = null, revision = 0, undo = null;
  const read = () => {
    const value = target.getText();
    return typeof value === 'string' ? value : null;
  };
  let current = read();
  if (current === null || typeof target.insertText !== 'function' || typeof target.handleTextChanged !== 'function') {
    throw new Error('This composer does not expose the supported text editing methods.');
  }
  const announce = () => { try { changed(); } catch {} };
  function clearPending() {
    revision++;
    if (timer !== null) cancel(timer);
    timer = null;
  }
  function apply(edit, expected, recordUndo = true) {
    if (disposed || !allowed() || !options().enabled || writing || read() !== expected) return false;
    const result = applyEdit(expected, edit);
    if (result.length > maxLength() || result === expected) return false;
    clearPending();
    writing = true;
    const previous = current;
    current = result;
    if (recordUndo) undo = { before: expected, after: result };
    try {
      // Native range edits retain mention/emoji nodes outside the changed range.
      // Never call sendMessage or replace a DraftStore record behind the composer.
      target.insertText(edit.insert, edit.start, false, undefined, edit.end);
    } catch (error) {
      current = previous; undo = null; report(error); return false;
    } finally { writing = false; announce(); }
    return true;
  }
  const unpatch = patcher.after('handleTextChanged', target, args => {
    if (disposed || typeof args[0] !== 'string') return;
    const next = args[0];
    const previous = current;
    current = next;
    if (writing || next === previous) { announce(); return; }
    clearPending();
    undo = null;
    if (allowed()) {
      const edit = automaticEdit(previous, next, options(), phrases(), maxLength());
      if (edit) {
        const token = revision;
        // Wait for Discord to finish processing the native change, then verify
        // both the live text and revision before applying the tiny range edit.
        timer = schedule(() => {
          timer = null;
          if (!disposed && token === revision) {
            try { apply(edit, next); } catch (error) { report(error); }
          }
        }, 0);
      }
    }
    announce();
  });
  return {
    get text() { return current; },
    get canUndo() { return Boolean(undo && current === undo.after); },
    apply,
    undo() {
      if (!undo) return false;
      const saved = undo;
      if (!apply(textEdit(saved.after, saved.before), saved.after, false)) return false;
      undo = null; announce(); return true;
    },
    dispose() { if (disposed) return; disposed = true; clearPending(); undo = null; unpatch(); },
  };
}
