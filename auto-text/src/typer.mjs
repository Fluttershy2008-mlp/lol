/* SPDX-License-Identifier: MIT */

export function typingCharacters(text) {
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

export function createTyper({ read, insert, send, allowed, maxLength, changed = () => {}, schedule = setTimeout, cancel = clearTimeout, now = Date.now }) {
  let disposed = false, timer = null, status = 'idle', message = '', chunks = [], position = 0, total = 0;
  let expected = '', pending = null, interval = 70;
  let autoSend = false, sendIssued = false, sendStarted = 0, runId = 0;
  const state = () => ({ status, message, position, total, autoSend,
    running: status === 'running', sending: status === 'sending', busy: status === 'running' || status === 'sending' });
  const announce = () => { try { changed(state()); } catch {} };
  const clearTimer = () => { if (timer !== null) cancel(timer); timer = null; };
  function finish(nextStatus, reason) {
    runId++;
    clearTimer(); status = nextStatus; message = reason;
    chunks = []; pending = null; expected = ''; announce();
  }
  function stop(reason = 'Stopped. The text already typed stays in your message box.') {
    if (status === 'running') finish('stopped', reason);
    else if (status === 'sending') finish('done', 'Auto-send was already requested. Check Discord for delivery.');
  }
  function ack() {
    expected = pending.after; pending = null; position++; announce();
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
      let actual = read();
      if (pending) {
        if (actual === pending.after) ack();
        else if (actual === pending.before) {
          if (now() - pending.started >= 1500) { finish('error', 'Typing stopped: Discord did not confirm the text change.'); return; }
          later(25); return;
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
      pending = { before: expected, after: expected + char, started: now() };
      if (!insert(char, expected)) { stop('Stopped because the draft changed or could not be edited.'); return; }
      if (status === 'running') later(interval);
    } catch { finish('error', 'Typing stopped because the composer could not be updated.'); }
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
      clearTimer(); runId++; autoSend = settings.autoSend === true; sendIssued = false;
      chunks = typingCharacters(normalized); position = 0; total = chunks.length;
      expected = initial; pending = null; status = 'running'; message = 'Typing your prepared message…';
      announce(); later(400); return state();
    },
    observe(text, selection) {
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
    },
    stop,
    dispose() { if (disposed) return; stop(); disposed = true; clearTimer(); chunks = []; pending = null; expected = ''; },
  };
}
