/* SPDX-License-Identifier: MIT */
import { automaticEdit, applyEdit, textEdit } from './core.mjs';
import { createTyper } from './typer.mjs';

// One session belongs to one mounted composer. No drafts are stored here persistently.
export function createSession({ target, patcher, options, phrases, maxLength, nativeReader, allowed = () => true, changed = () => {}, report = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
  let disposed = false, writing = false, timer = null, revision = 0, undo = null, typer = null, autoSending = false;
  let nativeText = null, cacheAtNative = null, nativeEditId = null;
  const cachedText = () => {
    const value = target.getText();
    return typeof value === 'string' ? value : null;
  };
  const read = () => {
    const cached = cachedText();
    if (nativeText !== null) {
      // A real native event/flush is confirmation; our optimistic UI text is
      // not. Keep it while getText still contains its previous cached value.
      if (cached === cacheAtNative || cached === nativeText) return nativeText;
      nativeText = null; nativeEditId = null;
    }
    return cached;
  };
  function confirmed(text, editId = null) {
    nativeText = text; cacheAtNative = cachedText(); nativeEditId = editId;
  }
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
  function apply(edit, expected, recordUndo = true, fromTyper = false) {
    if (disposed || !allowed() || !options().enabled || writing || read() !== expected) return false;
    if (typer?.state.busy && !fromTyper) return false;
    const result = applyEdit(expected, edit);
    if (result.length > maxLength() || result === expected) return false;
    clearPending();
    writing = true;
    const previous = current;
    current = result;
    undo = recordUndo ? { before: expected, after: result } : null;
    try {
      // Native range edits retain mention/emoji nodes outside the changed range.
      // Never call sendMessage or replace a DraftStore record behind the composer.
      if (nativeText === expected && typeof target.replaceRange === 'function') {
        // insertText can carry an old cached editId. Use the revision from the
        // actual native event, or the optional null revision after a flush.
        target.replaceRange({ location: edit.start, length: edit.end - edit.start,
          text: edit.insert, nodes: [], keepCursorPosition: false, editId: nativeEditId });
      } else target.insertText(edit.insert, edit.start, false, undefined, edit.end);
    } catch (error) {
      current = previous; undo = null; report(error); return false;
    } finally { writing = false; announce(); }
    return true;
  }
  function observe(next, selection) {
    if (disposed || typeof next !== 'string') return;
    const previous = current;
    current = next;
    if (typer?.state.busy) {
      // Prepared messages must be copied literally. Do not expand ;shortcuts
      // or manufacture an extra bullet when the runner types a newline.
      typer.observe(next, selection); clearPending(); announce(); return;
    }
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
  typer = createTyper({ read, allowed: () => !disposed && allowed() && options().enabled, maxLength,
    prepare: () => {
      // Runs after the AutoType modal closes, before the first character.
      try { if (target.isFocused?.() === false) target.focus?.(); } catch {}
    },
    refresh: callback => nativeReader?.read(text => {
      if (disposed) return;
      if (typer.state.running && allowed() && options().enabled && typeof text === 'string') {
        confirmed(text, text === nativeText ? nativeEditId : null);
        current = text;
      }
      callback(text);
    }),
    insert: (char, expected) => apply({ start: expected.length, end: expected.length, insert: char }, expected, false, true),
    send: typeof target.handleSend === 'function' ? expected => {
      // Re-check the exact composer and text immediately before the only send
      // call. Use Discord's normal validation/reply/attachment path.
      if (disposed || !allowed() || !options().enabled || read() !== expected) throw new Error('The active draft changed.');
      autoSending = true;
      try { return target.handleSend(); }
      finally { autoSending = false; }
    } : undefined,
    changed: announce, schedule, cancel });
  // A manual Send cancels pending auto-send. The single authorized completion
  // call passes through without treating itself as a user interruption.
  let unpatchSend = () => {};
  if (typeof target.handleSend === 'function' && typeof patcher.before === 'function') {
    unpatchSend = patcher.before('handleSend', target, () => { if (!autoSending) typer.stop('Stopped because you tapped Send.'); });
  }
  return {
    get text() { return current; },
    get canUndo() { return Boolean(undo && current === undo.after); },
    apply,
    get typing() { return typer.state; },
    get canAutoSend() { return typeof target.handleSend === 'function'; },
    startTyping(text, interval, settings) { clearPending(); undo = null; return typer.start(text, interval, settings); },
    stopTyping(reason) { typer.stop(reason); },
    observeNative(event) {
      const data = event?.nativeEvent ?? event;
      if (typeof data?.text !== 'string') return;
      const selection = Number.isInteger(data.start) && Number.isInteger(data.end)
        ? { start: data.start, end: data.end } : null;
      confirmed(data.text, typeof data.editId === 'string' ? data.editId : null);
      observe(data.text, selection);
    },
    undo() {
      if (!undo) return false;
      const saved = undo;
      if (!apply(textEdit(saved.after, saved.before), saved.after, false)) return false;
      undo = null; announce(); return true;
    },
    dispose() { if (disposed) return; disposed = true; typer.dispose(); clearPending(); undo = null; unpatchSend(); unpatch(); },
  };
}
