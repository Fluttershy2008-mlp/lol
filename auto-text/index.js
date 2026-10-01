(() => {
"use strict";
/* SPDX-License-Identifier: MIT */
const DEFAULT_PHRASES = [
  { shortcut: ';brb', text: 'Be right back!' },
  { shortcut: ';ty', text: 'Thank you so much!' },
  { shortcut: ';hello', text: 'Hello everyone! How are you doing?' },
  { shortcut: ';rules', text: '- Be respectful.\n- Keep the chat friendly.\n- Have fun!' },
];
const DEFAULT_OPTIONS = { enabled: true, bullets: true, shortcuts: true, suggestions: true, expandOnMatch: true };

function validatePhrase(phrase, others = [], oldShortcut = null) {
  const shortcut = String(phrase?.shortcut ?? '').trim().toLowerCase();
  const text = String(phrase?.text ?? '').replace(/\r\n/g, '\n');
  if (!/^;[a-z0-9_-]{1,30}$/.test(shortcut)) throw new Error('Use a shortcut like ;brb (letters, numbers, - or _).');
  if (!text.trim() || text.length > 2000) throw new Error('Phrase text must contain 1–2,000 characters.');
  if (others.some(p => p.shortcut !== oldShortcut && p.shortcut === shortcut)) throw new Error('That shortcut already exists.');
  if (!oldShortcut && others.length >= 100) throw new Error('You can save up to 100 phrases.');
  return { shortcut, text };
}

function cleanPhrases(value) {
  if (!Array.isArray(value)) return DEFAULT_PHRASES.map(p => ({ ...p }));
  const clean = [];
  for (const item of value.slice(0, 100)) {
    try { clean.push(validatePhrase(item, clean)); } catch {}
  }
  return clean;
}

function inCode(text) {
  let fence = null, inline = 0;
  for (const line of text.split('\n')) {
    const match = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (match) {
      const marker = match[1];
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && !match[2].trim()) fence = null;
      inline = 0;
      continue;
    }
    if (fence) continue;
    // Backslash-escaped ticks are literal. Equal runs close inline code.
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\') { i++; continue; }
      if (line[i] !== '`') continue;
      let n = 1;
      while (line[i + n] === '`') n++;
      if (!inline) inline = n;
      else if (inline === n) inline = 0;
      i += n - 1;
    }
  }
  return Boolean(fence || inline);
}

function parseList(line) {
  const m = /^([ \t]*)([-*+•]|\d{1,6}[.)])([ \t]+)(.*)$/.exec(line);
  return m && { indent: m[1], marker: m[2], space: m[3], body: m[4], prefix: m[1] + m[2] + m[3] };
}

function applyEdit(text, edit) {
  return text.slice(0, edit.start) + edit.insert + text.slice(edit.end);
}

function textEdit(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length, newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  // Do not split UTF-16 surrogate pairs when editing emoji-containing phrases.
  if (start > 0 && /[\uD800-\uDBFF]/.test(before[start - 1])) start--;
  if (oldEnd < before.length && /[\uDC00-\uDFFF]/.test(before[oldEnd])) { oldEnd++; newEnd++; }
  return { start, end: oldEnd, insert: after.slice(start, newEnd) };
}

function automaticEdit(previous, next, options, phrases, maxLength = 2000) {
  if (!options.enabled || typeof previous !== 'string' || typeof next !== 'string') return null;
  // Only a single character appended by the keyboard triggers edits.
  // Pasting, deleting, selecting/replacing, and editing earlier lines are untouched.
  if (next.length !== previous.length + 1 || !next.startsWith(previous) || inCode(previous)) return null;
  const typed = next.slice(-1);
  let edit = null;
  if (typed === '\n' && options.bullets) {
    const start = previous.lastIndexOf('\n') + 1;
    const list = parseList(previous.slice(start));
    if (list) {
      if (!list.body.replace(/^\[[ xX]\] /, '').trim()) edit = { start, end: next.length, insert: '' };
      else {
        const number = /^(\d+)([.)])$/.exec(list.marker);
        const marker = number ? String(Number(number[1]) + 1) + number[2] : list.marker;
        // Reset checked task items when continuing a checklist.
        const task = /^\[[ xX]\] /.test(list.body) ? '[ ] ' : '';
        edit = { start: next.length, end: next.length, insert: list.indent + marker + list.space + task };
      }
    }
  } else if (typed === ' ' && options.shortcuts) {
    const token = /(?:^|\s)(;[a-zA-Z0-9_-]{1,30})$/.exec(previous);
    if (token) {
      const phrase = phrases.find(p => p.shortcut === token[1].toLowerCase());
      if (phrase) edit = { start: previous.length - token[1].length, end: next.length, insert: phrase.text + ' ' };
    }
  } else if (options.shortcuts && options.expandOnMatch && /[a-zA-Z0-9_-]/.test(typed)) {
    const token = /(?:^|\s)(;[a-zA-Z0-9_-]{1,30})$/.exec(next);
    if (token) {
      const key = token[1].toLowerCase();
      const phrase = phrases.find(p => p.shortcut === key);
      // Allow typing ;hello when ;he is also saved. Shared prefixes wait for
      // a space or a suggestion tap instead of consuming the shorter token.
      if (phrase && !phrases.some(p => p.shortcut !== key && p.shortcut.startsWith(key))) {
        edit = { start: next.length - token[1].length, end: next.length, insert: phrase.text };
      }
    }
  }
  return edit && applyEdit(next, edit).length <= maxLength ? edit : null;
}

function suggestionsFor(text, phrases, enabled = true) {
  if (!enabled || !text || inCode(text)) return [];
  const lineStart = text.lastIndexOf('\n') + 1;
  const line = text.slice(lineStart);
  const token = /(?:^|\s)(;[a-zA-Z0-9_-]*)$/.exec(line);
  if (token) return phrases.filter(p => p.shortcut.startsWith(token[1].toLowerCase())).slice(0, 3)
    .map(p => ({ ...p, start: text.length - token[1].length, end: text.length, insert: p.text }));
  const list = parseList(line);
  const prefix = list?.prefix ?? (/^\s*/.exec(line)?.[0] ?? '');
  const query = line.slice(prefix.length);
  if (query.length < 3 || !query.trim()) return [];
  // Complete a saved phrase at the start of the current line or list item.
  return phrases.filter(p => p.text.length > query.length && p.text.toLowerCase().startsWith(query.toLowerCase()))
    .slice(0, 3).map(p => ({ ...p, start: lineStart + prefix.length, end: text.length, insert: p.text }));
}

function startList(text, numbered = false) {
  return { start: text.length, end: text.length, insert: (text && !text.endsWith('\n') ? '\n' : '') + (numbered ? '1. ' : '- ') };
}

/* SPDX-License-Identifier: MIT */

function typingCharacters(text) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), item => item.segment);
  }
  // Hermes builds without Intl.Segmenter still keep common combined emoji,
  // flags, skin tones, accents and variation selectors together.
  const result = [];
  let joinNext = false, regionalCount = 0;
  for (const char of Array.from(text)) {
    const point = char.codePointAt(0);
    const regional = point >= 0x1f1e6 && point <= 0x1f1ff;
    const combining = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe00-\ufe0f\ufe20-\ufe2f]/.test(char)
      || (point >= 0x1f3fb && point <= 0x1f3ff) || (point >= 0xe0020 && point <= 0xe007f);
    if (result.length && (joinNext || point === 0x200d || combining || (regional && regionalCount % 2 === 1))) result[result.length - 1] += char;
    else result.push(char);
    joinNext = point === 0x200d;
    regionalCount = regional ? regionalCount + 1 : 0;
  }
  return result;
}

function createTyper({ read, insert, send, refresh, prepare, allowed, maxLength, changed = () => {}, schedule = setTimeout, cancel = clearTimeout, now = Date.now }) {
  let disposed = false, timer = null, status = 'idle', message = '', chunks = [], position = 0, total = 0;
  let expected = '', pending = null, interval = 70;
  let autoSend = false, sendIssued = false, sendStarted = 0, runId = 0;
  let verification = null, prepared = false;
  const state = () => ({ status, message, position, total, autoSend,
    running: status === 'running', sending: status === 'sending', busy: status === 'running' || status === 'sending' });
  const announce = () => { try { changed(state()); } catch {} };
  const clearTimer = () => { if (timer !== null) cancel(timer); timer = null; };
  function clearVerification() {
    const old = verification; verification = null;
    try { old?.cancel?.(); } catch {}
  }
  function finish(nextStatus, reason) {
    runId++;
    clearVerification();
    clearTimer(); status = nextStatus; message = reason;
    chunks = []; pending = null; expected = ''; announce();
  }
  function stop(reason = 'Stopped. The text already typed stays in your message box.') {
    if (status === 'running') finish('stopped', reason);
    else if (status === 'sending') finish('done', 'Auto-send was already requested. Check Discord for delivery.');
  }
  function ack() {
    clearVerification();
    expected = pending.after; pending = null; position++; announce();
  }
  function verifyPending() {
    if (!refresh || verification || !pending || now() - pending.lastProbe < 250) return;
    pending.lastProbe = now();
    const probe = { pending, token: runId, cancel: null };
    verification = probe;
    probe.cancel = refresh(text => {
      if (verification !== probe || disposed || runId !== probe.token || pending !== probe.pending) return;
      clearVerification();
      if (!allowed()) { stop('Stopped because this chat is no longer active or AutoText is paused.'); return; }
      if (typeof text === 'string') observe(text);
    });
    // The native bridge may reply synchronously or be unavailable.
    if (verification !== probe) probe.cancel?.();
    else if (typeof probe.cancel !== 'function') verification = null;
  }
  function verifyInitial() {
    if (!refresh) return false;
    const probe = { token: runId, cancel: null };
    let synchronous = true;
    verification = probe;
    probe.cancel = refresh(text => {
      if (verification !== probe || disposed || runId !== probe.token || status !== 'running') return;
      clearVerification();
      if (!allowed()) { stop('Stopped because this chat is no longer active or AutoText is paused.'); return; }
      if (typeof text === 'string' && text !== expected) { stop('Stopped because you changed the draft before typing began.'); return; }
      if (!synchronous) later(0);
    });
    synchronous = false;
    if (verification !== probe) probe.cancel?.();
    else if (typeof probe.cancel !== 'function') verification = null;
    return verification === probe;
  }
  function later(delay, callback = tick) {
    clearTimer();
    timer = schedule(() => { timer = null; callback(); }, delay);
  }
  function checkSend() {
    if (disposed || status !== 'sending') return;
    try {
      if (!allowed() || read() !== expected) {
        finish('done', 'Auto-send requested. Check the chat for delivery.'); return;
      }
      if (now() - sendStarted >= 3000) {
        finish('done', 'Auto-send was requested once. If the draft remains, check Discord and tap Send if needed.'); return;
      }
      later(100, checkSend);
    } catch { finish('done', 'Auto-send was requested. Check Discord for delivery.'); }
  }
  function requestSend() {
    if (sendIssued || disposed || status !== 'running') return;
    // No retries: native send may have succeeded even when its result is
    // missing or rejected. Mark the attempt before entering Discord's code.
    sendIssued = true; sendStarted = now(); status = 'sending'; message = 'Sending through Discord…';
    const token = runId;
    clearTimer(); announce();
    if (disposed || runId !== token || status !== 'sending') return;
    const failed = () => {
      if (!disposed && runId === token && status === 'sending') {
        finish('error', 'Auto-send could not be confirmed. Check the chat before sending manually.');
      }
    };
    try {
      const result = send(expected);
      if (result === false) { failed(); return; }
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).then(value => { if (value === false) failed(); }, failed);
      }
      if (!disposed && runId === token && status === 'sending') checkSend();
    } catch { failed(); }
  }
  function tick() {
    if (disposed || status !== 'running') return;
    try {
      if (!allowed()) { stop('Stopped because this chat is no longer active or AutoText is paused.'); return; }
      if (!prepared) {
        prepared = true; prepare?.();
        // Confirm the native starting draft before the first write as well.
        // This avoids inserting with a stale cached revision after a modal.
        if (verifyInitial() || status !== 'running') return;
      }
      let actual = read();
      if (pending) {
        if (actual === pending.after) ack();
        else if (actual === pending.before) {
          if (now() - pending.started >= 5000) { finish('error', 'Typing paused: the message box did not respond. Reopen the chat and check the partial draft before trying again.'); return; }
          later(25); verifyPending(); return;
        } else { stop('Stopped because you changed or sent the draft.'); return; }
      }
      if (actual !== expected) { stop('Stopped because you changed or sent the draft.'); return; }
      if (position >= total) {
        if (autoSend) requestSend();
        else finish('done', 'Finished typing. Review your message, then tap Send.');
        return;
      }
      const char = chunks[position];
      if (expected.length + char.length > maxLength()) { finish('error', 'Typing stopped at the message length limit.'); return; }
      // Set the expected echo BEFORE issuing the command: native updates can
      // be synchronous. Wait for confirmation before writing another letter.
      pending = { before: expected, after: expected + char, started: now(), lastProbe: now() };
      if (!insert(char, expected)) { stop('Stopped because the draft changed or could not be edited.'); return; }
      if (status === 'running') later(interval);
    } catch { finish('error', 'Typing stopped because the composer could not be updated.'); }
  }
  function observe(text, selection) {
    if (disposed) return;
    if (status === 'sending') {
      if (text !== expected) finish('done', 'Auto-send requested. Check the chat for delivery.');
      return;
    }
    if (status !== 'running') return;
    if (selection && (selection.start !== text.length || selection.end !== text.length)) {
      stop('Stopped because you moved the cursor.'); return;
    }
    if (pending && text === pending.after) { ack(); return; }
    if (text !== expected && text !== pending?.before) stop('Stopped because you changed or sent the draft.');
  }
  return {
    get state() { return state(); },
    start(text, milliseconds = 70, settings = {}) {
      if (disposed) throw new Error('Reopen the chat before starting AutoType.');
      if (status === 'running' || status === 'sending') throw new Error('Wait for the current run to finish or stop it first.');
      if (!allowed()) throw new Error('Open the chat and resume AutoText before starting.');
      if (typeof text !== 'string' || !text.trim()) throw new Error('Enter the message you want AutoType to type.');
      const normalized = text.replace(/\r\n?/g, '\n');
      const initial = read();
      if (typeof initial !== 'string') throw new Error('Could not read the current message box.');
      if (initial.length + normalized.length > maxLength()) throw new Error('Your message plus the current draft exceeds the message limit. Shorten it or clear the message box first.');
      if (settings.autoSend === true && typeof send !== 'function') throw new Error('Auto-send is unavailable on this Discord version. Turn it off to type normally.');
      const speed = Number(milliseconds);
      interval = Number.isFinite(speed) ? Math.max(25, Math.min(500, speed)) : 70;
      clearTimer(); clearVerification(); runId++; prepared = false; autoSend = settings.autoSend === true; sendIssued = false;
      chunks = typingCharacters(normalized); position = 0; total = chunks.length;
      expected = initial; pending = null; status = 'running'; message = 'Typing your prepared message…';
      announce(); later(400); return state();
    },
    observe,
    stop,
    dispose() { if (disposed) return; stop(); disposed = true; clearTimer(); chunks = []; pending = null; expected = ''; },
  };
}

/* SPDX-License-Identifier: MIT */

// One session belongs to one mounted composer. No drafts are stored here persistently.
function createSession({ target, patcher, options, phrases, maxLength, nativeReader, allowed = () => true, changed = () => {}, report = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
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

/* SPDX-License-Identifier: MIT */

// Read the real native field when Discord's JavaScript text cache/echo lags.
// flushText is read-only; a probe must never retry an insert or a Send.
function createNativeReader(commands, { schedule = setTimeout, cancel = clearTimeout } = {}) {
  let target = null, serial = 0, disposed = false;
  const requests = new Map(), refs = new Map();
  const prefix = 'auto-text-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '-';
  function clear(notify = false) {
    const pending = [...requests.values()];
    requests.clear();
    for (const request of pending) {
      cancel(request.timer);
      if (notify) { try { request.callback(null); } catch {} }
    }
  }
  return {
    ref(original) {
      if (refs.has(original)) return refs.get(original);
      const callback = value => {
        if (target !== value) clear(true);
        target = value;
        const cleanup = typeof original === 'function' ? original(value) : undefined;
        if (original && typeof original === 'object') original.current = value;
        if (typeof cleanup === 'function') return () => {
          if (target === value) { target = null; clear(true); }
          cleanup();
        };
      };
      refs.set(original, callback);
      return callback;
    },
    read(callback) {
      if (disposed || !target || typeof commands?.flushText !== 'function') return null;
      const id = prefix + (++serial);
      const release = () => {
        const request = requests.get(id);
        if (request) cancel(request.timer);
        requests.delete(id);
      };
      requests.set(id, { callback, timer: schedule(() => { release(); callback(null); }, 1000) });
      try { commands.flushText(target, id); }
      catch { release(); return null; }
      return release;
    },
    observe(event) {
      const data = event?.nativeEvent ?? event;
      const request = requests.get(data?.requestId);
      if (!request) return;
      requests.delete(data.requestId); cancel(request.timer);
      request.callback(typeof data.text === 'string' ? data.text : null);
    },
    dispose() { disposed = true; target = null; clear(); refs.clear(); },
  };
}

/* SPDX-License-Identifier: MIT */

// Work only within the rendered chat-input subtree. In modern Discord the
// input is a floating column, so a sibling above the guard lives OUTSIDE its
// measured layout and can be covered by the text field.
function decorateComposer(React, RN, root, { toolbar, onNativeEvent, nativeReader }) {
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

/* SPDX-License-Identifier: MIT */

function createPlugin(api) {
  const { React, ReactNative: RN } = api.metro.common;
  const h = React.createElement;
  const storage = api.plugin.storage;
  const Button = RN.TouchableOpacity;
  let active = false, rootUnpatch = null, retry = null, attempts = 0, appStateSubscription = null;
  let connection = 'Open a chat after enabling AutoText.';
  const listeners = new Set(), sessions = new Set(), mountCleanups = new Set();
  const sessionsByRef = new Map(), mountedReaders = new Set();
  let nativeReaders = new WeakMap();
  const tell = () => { for (const listener of listeners) { try { listener(); } catch {} } };
  const getOptions = () => ({ ...DEFAULT_OPTIONS, ...storage.options });
  const getPhrases = () => cleanPhrases(storage.phrases);
  const tryFind = (method, ...args) => { try { return api.metro[method]?.(...args); } catch { return null; } };
  let selectedChannel = null, userStore = null, lengthModule = null, nativeCommands = null;
  const channelNow = () => { try { return selectedChannel?.getChannelId?.() ?? null; } catch { return null; } };
  const accountNow = () => { try { return userStore?.getCurrentUser?.()?.id ?? null; } catch { return null; } };
  const maxLength = () => {
    try {
      const n = lengthModule?.getMaxMessageLength?.();
      if (Number.isInteger(n) && n >= 2000 && n <= 10000) return n;
    } catch {}
    return 2000;
  };
  const setOption = (key, value) => { storage.options = { ...getOptions(), [key]: Boolean(value) }; tell(); };
  const notify = message => {
    try { api.ui.toasts.showToast(message); } catch { RN.Alert?.alert?.('AutoText', message); }
  };
  const issue = () => {
    connection = 'Live typing could not be connected on this Discord version. Try reopening the chat. The practice editor below still works.';
    tell();
  };
  function useUpdates() {
    const [, update] = React.useState(0);
    React.useEffect(() => {
      const listener = () => update(n => n + 1);
      listeners.add(listener);
      return () => listeners.delete(listener);
    }, []);
  }
  function palette() {
    let light = false;
    try { light = tryFind('findByStoreName', 'ThemeStore')?.theme === 'light'; } catch {}
    return light
      ? { bg: '#F4F4F8', card: '#FFFFFF', text: '#24252D', sub: '#54596A', border: '#B8BDCE', accent: '#4752C4' }
      : { bg: '#1B1D24', card: '#292D37', text: '#F7F8FC', sub: '#BDC4D7', border: '#626B80', accent: '#BDC4FF' };
  }
  const label = (text, colors, style = {}, props = {}) => h(RN.Text, {
    ...props, style: { color: colors.text, fontSize: 15, lineHeight: 21, ...style },
  }, text);
  function button(title, onPress, colors, extra = {}) {
    return h(Button, {
      accessibilityRole: 'button', accessibilityLabel: title, onPress, activeOpacity: 0.7,
      style: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8,
        marginRight: 7, marginTop: 5, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }, ...extra,
    }, label(title, colors, { color: colors.accent, fontWeight: '600' }));
  }

  function Settings({ onClose } = {}) {
    useUpdates();
    const colors = palette();
    const options = getOptions(), phrases = getPhrases();
    const [draft, setDraft] = React.useState(null);
    const [notice, setNotice] = React.useState('');
    const [practice, setPractice] = React.useState('');
    const [practiceUndo, setPracticeUndo] = React.useState(null);
    const small = text => label(text, colors, { fontSize: 13, color: colors.sub, marginTop: 5 });
    const row = { flexDirection: 'row', flexWrap: 'wrap' };
    const card = { padding: 14, marginTop: 12, borderRadius: 12, backgroundColor: colors.card };
    const input = (name, value, onChangeText, props = {}) => h(RN.View, { style: { marginTop: 12 } },
      label(name, colors, { marginBottom: 6, fontWeight: '600' }),
      h(RN.TextInput, { value, onChangeText, accessibilityLabel: name, placeholderTextColor: colors.sub,
        selectionColor: colors.accent, style: { minHeight: 48, borderWidth: 1, borderColor: colors.border,
          borderRadius: 8, padding: 12, color: colors.text, backgroundColor: colors.bg, fontSize: 16, textAlignVertical: 'top' }, ...props }));
    const save = () => {
      try {
        const valid = validatePhrase(draft, phrases, draft.oldShortcut);
        storage.phrases = draft.oldShortcut
          ? phrases.map(p => p.shortcut === draft.oldShortcut ? valid : p) : [...phrases, valid];
        setDraft(null); setNotice('Phrase saved.'); tell();
      } catch (error) { setNotice(error.message); }
    };
    const practiceChange = next => {
      const edit = automaticEdit(practice, next, options, phrases, maxLength());
      const result = edit ? applyEdit(next, edit) : next;
      setPracticeUndo(edit ? { before: next, after: result } : null);
      setPractice(result);
    };
    const practiceApply = edit => {
      const result = applyEdit(practice, edit);
      if (result.length > maxLength()) { setNotice('That text would exceed your message limit.'); return; }
      setPracticeUndo({ before: practice, after: result }); setPractice(result);
    };
    return h(RN.View, { style: { flex: 1, backgroundColor: colors.bg } },
      h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: 16, paddingBottom: 70 } },
        label('AutoText', colors, { fontSize: 26, lineHeight: 32, fontWeight: '800' }),
        small('Automatically type a prepared message, letter by letter. Open a chat → AutoType → paste your text → Start typing.'),
        small('Choose Very slow, Slow, Normal or Fast. Bullet points and line breaks are preserved. Enable Auto-send when finished to send the complete message once after typing.'),
        onClose ? button('Back to chat', onClose, colors) : null,
        small(active ? connection : 'Plugin disabled. Enable AutoText to connect live typing.'),
        ...[
          ['enabled', 'Typing assistance', 'Pause or resume AutoText.'],
          ['suggestions', 'Saved-phrase suggestions', 'Tap a suggestion to finish a saved phrase. Start with three letters or a shortcut like ;br.'],
          ['shortcuts', 'Expand shortcuts', 'Example: ;brb → Be right back! You can also tap a suggestion.'],
          ['expandOnMatch', 'Expand without a space', 'Expand a complete shortcut as soon as you finish typing it. Shared prefixes wait for a space or a suggestion tap.'],
          ['bullets', 'Continue lists', 'Enter adds the next bullet or number. Enter on an empty item ends the list.'],
        ].map(([key, title, hint]) => h(RN.View, { key, style: card },
          h(RN.View, { style: { flexDirection: 'row', alignItems: 'center' } },
            label(title, colors, { flex: 1, fontWeight: '700' }),
            h(RN.Switch, { value: Boolean(options[key]), onValueChange: value => setOption(key, value), accessibilityLabel: title })), small(hint))),
        label('Your phrases', colors, { fontSize: 20, fontWeight: '700', marginTop: 22 }),
        small('Saved on this device, shared between Discord accounts on this installation. Only phrases you explicitly save are kept.'),
        button('+ Add phrase', () => { setDraft({ shortcut: ';', text: '', oldShortcut: null }); setNotice(''); }, colors),
        notice ? label(notice, colors, { marginTop: 12, color: colors.accent }, { accessibilityLiveRegion: 'polite' }) : null,
        draft ? h(RN.View, { style: card },
          label(draft.oldShortcut ? 'Edit phrase' : 'New phrase', colors, { fontWeight: '700' }),
          input('Shortcut', draft.shortcut, shortcut => setDraft(old => ({ ...old, shortcut })), { autoCorrect: false, autoCapitalize: 'none', maxLength: 31, placeholder: ';hello' }),
          input('Phrase text — bullet points are supported', draft.text, text => setDraft(old => ({ ...old, text })), { multiline: true, maxLength: 2000, placeholder: '- First point\n- Second point' }),
          h(RN.View, { style: row }, button('Save phrase', save, colors), button('Cancel', () => setDraft(null), colors))) : null,
        ...phrases.map(phrase => h(RN.View, { key: phrase.shortcut, style: card },
          label(phrase.shortcut, colors, { color: colors.accent, fontWeight: '700' }),
          label(phrase.text, colors, { marginTop: 5 }, { selectable: true }),
          h(RN.View, { style: row },
            button('Edit ' + phrase.shortcut, () => { setDraft({ ...phrase, oldShortcut: phrase.shortcut }); setNotice(''); }, colors),
            button('Delete ' + phrase.shortcut, () => RN.Alert.alert('Delete phrase?', phrase.shortcut, [
              { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => {
                storage.phrases = getPhrases().filter(p => p.shortcut !== phrase.shortcut);
                if (draft?.oldShortcut === phrase.shortcut) setDraft(null);
                tell();
              } },
            ]), colors)))),
        label('Try it here', colors, { fontSize: 20, fontWeight: '700', marginTop: 24 }),
        small('A practice editor. Type ;brb, or type - First point and press Enter. You can also copy a finished draft from here.'),
        input('Practice draft', practice, practiceChange, { multiline: true, maxLength: maxLength(), placeholder: '- First point' }),
        ...suggestionsFor(practice, phrases, options.enabled && options.suggestions).map(p => button(p.text.slice(0, 90), () => practiceApply(p), colors, { key: p.shortcut })),
        h(RN.View, { style: row },
          button('+ Bullet', () => practiceApply(startList(practice)), colors),
          button('+ Number', () => practiceApply(startList(practice, true)), colors),
          practiceUndo && practiceUndo.after === practice ? button('Undo', () => { setPractice(practiceUndo.before); setPracticeUndo(null); }, colors) : null,
          button('Copy draft', () => {
            try { api.metro.common.clipboard.setString(practice); setNotice('Draft copied. Paste it into a chat when ready.'); }
            catch { setNotice('Clipboard unavailable. Long-press the draft to copy it.'); }
          }, colors)),
        small('Supports -, *, +, •, numbered items and nested indentation. Uses the current message limit (2,000 characters if unavailable).'),
        small('Automatic changes apply only when typing at the end of the draft. Pasted text, code blocks and earlier-line edits are left alone. Suggestions use your saved phrases; they do not generate new sentences.'),
        small('Version 1.2.2'),
      ));
  }

  function AssistBar({ inputRef, channelId, nativeReader }) {
    useUpdates();
    const [, render] = React.useState(0);
    const [open, setOpen] = React.useState(false);
    const [typingOpen, setTypingOpen] = React.useState(false);
    const [prepared, setPrepared] = React.useState('');
    const [typingSpeed, setTypingSpeed] = React.useState(() => [500, 150, 70, 25].includes(storage.typingInterval) ? storage.typingInterval : 70);
    const [typingError, setTypingError] = React.useState('');
    const [autoSend, setAutoSend] = React.useState(() => storage.autoSend === true);
    const sessionRef = React.useRef(null);
    const colors = palette(), options = getOptions();
    const ownerAccount = accountNow();
    React.useEffect(() => {
      let closed = false, target = null, poll = null;
      mountedReaders.add(nativeReader);
      const accountId = ownerAccount;
      const belongs = () => active && !closed && accountNow() === accountId
        && (!channelId || !channelNow() || channelNow() === channelId)
        && !['background', 'inactive'].includes(RN.AppState?.currentState);
      const release = () => {
        const session = sessionRef.current;
        if (session) { session.dispose(); sessions.delete(session); }
        if (sessionsByRef.get(inputRef) === session) sessionsByRef.delete(inputRef);
        sessionRef.current = null;
      };
      const bind = () => {
        if (closed || !active) { release(); return; }
        const next = inputRef?.current;
        if (next === target) return;
        release(); target = next;
        if (!next) return;
        try {
          const session = createSession({ target: next, patcher: api.patcher, options: getOptions, phrases: getPhrases,
            maxLength, nativeReader, allowed: belongs, changed: () => { if (!closed) render(n => n + 1); }, report: issue });
          sessionRef.current = session; sessions.add(session); sessionsByRef.set(inputRef, session);
          connection = 'Connected to the chat composer.'; tell(); render(n => n + 1);
        } catch { issue(); }
      };
      bind();
      // Refs are populated after render and can be replaced without rerendering
      // the wrapper. Check only the ref identity; never poll/save draft content.
      poll = setInterval(bind, 600);
      const cleanup = () => {
        if (closed) return;
        closed = true; clearInterval(poll); release(); mountCleanups.delete(cleanup); mountedReaders.delete(nativeReader);
      };
      mountCleanups.add(cleanup);
      return cleanup;
    }, [inputRef, channelId, ownerAccount]);
    if (!active) return null;
    const session = sessionRef.current;
    const text = session?.text ?? '';
    const typing = session?.typing;
    const running = Boolean(typing?.running);
    const busy = Boolean(typing?.busy);
    const useEdit = edit => {
      try {
        if (!session?.apply(edit, text)) notify('Draft changed or message limit reached. Try again.');
      } catch { issue(); }
    };
    const suggestions = suggestionsFor(text, getPhrases(), options.enabled && options.suggestions && !busy);
    function startTyping() {
      try {
        if (!session) throw new Error('The chat composer is not connected. Reopen this chat and try again.');
        session.startTyping(prepared, typingSpeed, { autoSend });
        storage.typingInterval = typingSpeed;
        storage.autoSend = autoSend;
        setTypingError(''); setTypingOpen(false);
      } catch (error) { setTypingError(error.message || 'Could not start typing.'); }
    }
    const compactButton = (title, onPress, accessibleName = title, key) => h(Button, {
      key, onPress, activeOpacity: 0.7, accessibilityRole: 'button', accessibilityLabel: accessibleName,
      style: { height: 44, justifyContent: 'center', paddingHorizontal: 10, flexShrink: 0 },
    }, label(title, colors, { color: colors.accent, fontSize: 13, lineHeight: 18, fontWeight: '600' }, { numberOfLines: 1, maxFontSizeMultiplier: 1.2 }));
    const stripProps = {
      horizontal: true, keyboardShouldPersistTaps: 'always', showsHorizontalScrollIndicator: false,
      style: { height: 44, maxHeight: 44, flexGrow: 0, flexShrink: 0 },
      contentContainerStyle: { alignItems: 'center' },
    };
    return h(RN.View, { testID: 'auto-text-toolbar', style: { flexGrow: 0, flexShrink: 0, alignSelf: 'stretch', borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 4 } },
      suggestions.length ? h(RN.ScrollView, stripProps,
        ...suggestions.map(p => compactButton(p.text.replace(/\n/g, ' · ').slice(0, 70), () => useEdit(p), 'Insert phrase ' + p.shortcut, p.shortcut))) : null,
      h(RN.ScrollView, stripProps,
        running ? compactButton('■ Stop', () => session.stopTyping(), 'Stop automatic typing')
          : typing?.sending ? label('Sending…', colors, { paddingHorizontal: 10 })
            : compactButton('▶ AutoType', () => { setTypingError(''); setTypingOpen(true); }, 'AutoType'),
        running ? label(`${typing.position}/${typing.total}${typing.autoSend ? ' · Auto-send on' : ''}`, colors, { fontSize: 13, marginHorizontal: 10 }, { accessibilityLabel: `Typed ${typing.position} of ${typing.total} characters${typing.autoSend ? ', auto-send on' : ''}` }) : null,
        !busy && options.enabled && session ? compactButton('• List', () => useEdit(startList(text)), 'Start bullet list') : null,
        !busy && options.enabled && session ? compactButton('1. List', () => useEdit(startList(text, true)), 'Start numbered list') : null,
        !busy && options.enabled && session?.canUndo ? compactButton('Undo', () => { try { session.undo(); } catch { issue(); } }) : null,
        !busy ? compactButton('Phrases', () => setOpen(true)) : null,
        !busy ? compactButton(options.enabled ? 'Pause' : 'Resume', () => setOption('enabled', !options.enabled)) : null),
      !busy && typing?.message ? label(typing.message, colors, { fontSize: 12, lineHeight: 16, color: colors.sub, paddingHorizontal: 8, paddingBottom: 4 }, { numberOfLines: 2, accessibilityLiveRegion: 'polite' }) : null,
      typingOpen ? h(RN.Modal, { visible: true, animationType: 'slide', onRequestClose: () => setTypingOpen(false) },
        h(RN.SafeAreaView ?? RN.View, { style: { flex: 1, backgroundColor: colors.bg } },
          h(RN.KeyboardAvoidingView ?? RN.View, { style: { flex: 1 }, behavior: RN.Platform?.OS === 'ios' ? 'padding' : undefined },
            h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: 20, paddingTop: 24, paddingBottom: 70 } },
              label('AutoType', colors, { fontSize: 26, lineHeight: 32, fontWeight: '800' }),
              label('Enter your full message. AutoType will type it into this chat one character at a time.', colors, { marginTop: 10 }),
              label('Message to type', colors, { marginTop: 20, marginBottom: 8, fontWeight: '700' }),
              h(RN.TextInput, { value: prepared, onChangeText: setPrepared, multiline: true, maxLength: maxLength(),
                accessibilityLabel: 'Message to type', placeholder: '- First point\n- Second point', placeholderTextColor: colors.sub,
                autoCorrect: false, style: { minHeight: 160, maxHeight: 340, padding: 12, borderWidth: 1, borderColor: colors.border,
                  borderRadius: 10, color: colors.text, backgroundColor: colors.card, fontSize: 16, textAlignVertical: 'top' } }),
              label(`${prepared.length} characters · ${text.length} already in the message box`, colors, { color: colors.sub, fontSize: 13, marginTop: 6 }),
              label('Typing speed', colors, { fontWeight: '700', marginTop: 20 }),
              h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
                ...[[500, 'Very slow'], [150, 'Slow'], [70, 'Normal'], [25, 'Fast']].map(([speed, name]) => button((typingSpeed === speed ? '✓ ' : '') + name,
                  () => setTypingSpeed(speed), colors, { key: speed, accessibilityLabel: name + ' typing speed',
                    accessibilityRole: 'radio', accessibilityState: { checked: typingSpeed === speed } }))),
              h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', marginTop: 20 } },
                label('Auto-send when finished', colors, { flex: 1, fontWeight: '700' }),
                h(RN.Switch, { value: autoSend, onValueChange: setAutoSend, accessibilityLabel: 'Auto-send when finished' })),
              label(autoSend
                ? 'Sends the entire draft once after the final character, including existing text, replies and attachments. Stop cancels it before sending starts.'
                : 'Leaves the finished message in the box so you can tap Send yourself.', colors, { color: colors.sub, fontSize: 13, marginTop: 6 }),
              autoSend && session && !session.canAutoSend ? label('Auto-send is unavailable here. Turn it off to type normally.', colors, { color: colors.accent, marginTop: 8 }) : null,
              label('Text is added at the end of your current draft. Bullet points, emojis and new lines are kept.', colors, { color: colors.sub, fontSize: 13, marginTop: 16 }),
              typingError ? label(typingError, colors, { marginTop: 12, color: colors.accent }, { accessibilityLiveRegion: 'polite' }) : null,
              button(autoSend ? 'Start typing & send' : 'Start typing', startTyping, colors),
              button('Cancel', () => setTypingOpen(false), colors),
            )))) : null,
      open ? h(RN.Modal, { visible: true, animationType: 'slide', onRequestClose: () => setOpen(false) },
        h(RN.SafeAreaView ?? RN.View, { style: { flex: 1, backgroundColor: colors.bg } },
          h(RN.KeyboardAvoidingView ?? RN.View, { style: { flex: 1 }, behavior: RN.Platform?.OS === 'ios' ? 'padding' : undefined },
            h(Settings, { onClose: () => setOpen(false) })))) : null);
  }
  class BarBoundary extends React.Component {
    constructor(props) { super(props); this.state = { failed: false }; }
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch() { issue(); }
    render() { return this.state.failed ? null : this.props.children; }
  }
  function findInput(root) {
    const queue = [root], seen = new Set();
    for (let visited = 0; queue.length && visited < 250; visited++) {
      const node = queue.shift();
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (Array.isArray(node)) { queue.push(...node); continue; }
      if (node.props?.chatInputRef) return node.props.chatInputRef;
      if (node.props?.children) queue.push(node.props.children);
    }
    return null;
  }
  function hookComposer() {
    if (!active || rootUnpatch) return;
    attempts++;
    try {
      let holder = tryFind('findByName', 'ChatInputGuardWrapper', false), method = 'default';
      if (typeof holder?.default !== 'function') {
        holder = tryFind('findByTypeName', 'ChatInputGuardWrapper'); method = 'type';
      }
      if (typeof holder?.[method] === 'function') {
        rootUnpatch = api.patcher.after(method, holder, (args, result) => {
          if (!active || !result) return;
          try {
            const inputRef = args[0]?.chatInputRef ?? findInput(result);
            if (!inputRef) return;
            const channelId = args[0]?.channel?.id ?? args[0]?.channelId ?? channelNow();
            if (!nativeReaders.has(inputRef)) nativeReaders.set(inputRef, createNativeReader(nativeCommands));
            const nativeReader = nativeReaders.get(inputRef);
            const toolbar = h(BarBoundary, { key: 'auto-text-' + (channelId ?? '') }, h(AssistBar, { inputRef, channelId, nativeReader }));
            const decorated = decorateComposer(React, RN, result, {
              toolbar, nativeReader,
              onNativeEvent: event => {
                if (active) sessionsByRef.get(inputRef)?.observeNative(event);
              },
            });
            if (!decorated.hasToolbar) connection = 'This composer layout is not supported. The practice editor in AutoText settings can prepare and copy a draft.';
            // Never fall back to the old sibling layout: floating composers
            // paint over it. Unsupported layouts retain Discord's original UI.
            return decorated.tree;
          } catch { /* A missing hook must never break Discord's composer. */ }
        });
        connection = 'Composer hook ready. Reopen your chat if the AutoText bar is not visible.'; tell(); return;
      }
    } catch {}
    if (attempts < 30) retry = setTimeout(hookComposer, 1000);
    else { connection = 'Live composer not found on this Discord version. Use the practice editor to prepare and copy a draft.'; tell(); }
  }
  return {
    onLoad() {
      if (active) return;
      storage.options = getOptions(); storage.phrases = getPhrases();
      selectedChannel = tryFind('findByStoreName', 'SelectedChannelStore');
      userStore = tryFind('findByStoreName', 'UserStore');
      lengthModule = tryFind('findByProps', 'getMaxMessageLength');
      nativeCommands = tryFind('findByProps', 'flushText', 'replaceRange', 'getText');
      try {
        appStateSubscription = RN.AppState?.addEventListener?.('change', state => {
          if (state !== 'active') for (const session of sessions) session.stopTyping('Stopped because Revenge moved to the background.');
        });
      } catch {}
      active = true; attempts = 0; hookComposer(); tell();
    },
    onUnload() {
      active = false;
      try { appStateSubscription?.remove?.(); } catch {}
      appStateSubscription = null;
      if (retry !== null) clearTimeout(retry);
      retry = null;
      for (const reader of mountedReaders) reader?.dispose();
      mountedReaders.clear();
      for (const cleanup of [...mountCleanups]) { try { cleanup(); } catch {} }
      mountCleanups.clear();
      for (const session of sessions) { try { session.dispose(); } catch {} }
      sessions.clear();
      sessionsByRef.clear();
      nativeReaders = new WeakMap();
      try { rootUnpatch?.(); } catch {}
      rootUnpatch = null; tell(); listeners.clear();
    },
    settings: Settings,
  };
}

return createPlugin(vendetta);
})()
