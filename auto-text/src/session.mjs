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
  if (current === null || typeof target.insertText !== 'function') {
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
  function observe(next, selection) {
    if (disposed || typeof next !== 'string') return;
    const previous = current;
    current = next;
    if (selection && (selection.start !== next.length || selection.end !== next.length)) {
      clearPending();
      if (next !== previous) undo = null;
      announce(); return;
    }
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
  }
  // Older versions call this public ref method for every edit. Newer builds
  // can bypass it, so the native onSelectionOrTextChange event is also wired
  // by the composer adapter. Duplicate events remain harmless.
  const unpatch = typeof target.handleTextChanged === 'function'
    ? patcher.after('handleTextChanged', target, args => { observe(args[0]); }) : () => {};
  return {
    get text() { return current; },
    get canUndo() { return Boolean(undo && current === undo.after); },
    apply,
    observeNative(event) {
      const data = event?.nativeEvent ?? event;
      if (typeof data?.text !== 'string') return;
      const selection = Number.isInteger(data.start) && Number.isInteger(data.end)
        ? { start: data.start, end: data.end } : null;
      observe(data.text, selection);
    },
    undo() {
      if (!undo) return false;
      const saved = undo;
      if (!apply(textEdit(saved.after, saved.before), saved.after, false)) return false;
      undo = null; announce(); return true;
    },
    dispose() { if (disposed) return; disposed = true; clearPending(); undo = null; unpatch(); },
  };
}
