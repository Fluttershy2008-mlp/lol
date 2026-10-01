/* SPDX-License-Identifier: MIT */
export const DEFAULT_PHRASES = [
  { shortcut: ';brb', text: 'Be right back!' },
  { shortcut: ';ty', text: 'Thank you so much!' },
  { shortcut: ';hello', text: 'Hello everyone! How are you doing?' },
  { shortcut: ';rules', text: '- Be respectful.\n- Keep the chat friendly.\n- Have fun!' },
];
export const DEFAULT_OPTIONS = { enabled: true, bullets: true, shortcuts: true, suggestions: true, expandOnMatch: true };

export function validatePhrase(phrase, others = [], oldShortcut = null) {
  const shortcut = String(phrase?.shortcut ?? '').trim().toLowerCase();
  const text = String(phrase?.text ?? '').replace(/\r\n/g, '\n');
  if (!/^;[a-z0-9_-]{1,30}$/.test(shortcut)) throw new Error('Use a shortcut like ;brb (letters, numbers, - or _).');
  if (!text.trim() || text.length > 2000) throw new Error('Phrase text must contain 1–2,000 characters.');
  if (others.some(p => p.shortcut !== oldShortcut && p.shortcut === shortcut)) throw new Error('That shortcut already exists.');
  if (!oldShortcut && others.length >= 100) throw new Error('You can save up to 100 phrases.');
  return { shortcut, text };
}

export function cleanPhrases(value) {
  if (!Array.isArray(value)) return DEFAULT_PHRASES.map(p => ({ ...p }));
  const clean = [];
  for (const item of value.slice(0, 100)) {
    try { clean.push(validatePhrase(item, clean)); } catch {}
  }
  return clean;
}

export function inCode(text) {
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

export function parseList(line) {
  const m = /^([ \t]*)([-*+•]|\d{1,6}[.)])([ \t]+)(.*)$/.exec(line);
  return m && { indent: m[1], marker: m[2], space: m[3], body: m[4], prefix: m[1] + m[2] + m[3] };
}

export function applyEdit(text, edit) {
  return text.slice(0, edit.start) + edit.insert + text.slice(edit.end);
}

export function textEdit(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length, newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  // Do not split UTF-16 surrogate pairs when editing emoji-containing phrases.
  if (start > 0 && /[\uD800-\uDBFF]/.test(before[start - 1])) start--;
  if (oldEnd < before.length && /[\uDC00-\uDFFF]/.test(before[oldEnd])) { oldEnd++; newEnd++; }
  return { start, end: oldEnd, insert: after.slice(start, newEnd) };
}

export function automaticEdit(previous, next, options, phrases, maxLength = 2000) {
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

export function suggestionsFor(text, phrases, enabled = true) {
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

export function startList(text, numbered = false) {
  return { start: text.length, end: text.length, insert: (text && !text.endsWith('\n') ? '\n' : '') + (numbered ? '1. ' : '- ') };
}
