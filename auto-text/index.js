(() => {
"use strict";
/* SPDX-License-Identifier: MIT */
const DEFAULT_PHRASES = [
  { shortcut: ';brb', text: 'Be right back!' },
  { shortcut: ';ty', text: 'Thank you so much!' },
  { shortcut: ';hello', text: 'Hello everyone! How are you doing?' },
  { shortcut: ';rules', text: '- Be respectful.\n- Keep the chat friendly.\n- Have fun!' },
];
const DEFAULT_OPTIONS = { enabled: true, bullets: true, shortcuts: true, suggestions: true };

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
  // Only a single space or newline appended by the keyboard triggers edits.
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

// One session belongs to one mounted composer. No drafts are stored here persistently.
function createSession({ target, patcher, options, phrases, maxLength, allowed = () => true, changed = () => {}, report = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
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

/* SPDX-License-Identifier: MIT */

function createPlugin(api) {
  const { React, ReactNative: RN } = api.metro.common;
  const h = React.createElement;
  const storage = api.plugin.storage;
  const Button = RN.TouchableOpacity;
  let active = false, rootUnpatch = null, retry = null, attempts = 0;
  let connection = 'Open a chat after enabling AutoText.';
  const listeners = new Set(), sessions = new Set(), mountCleanups = new Set();
  const tell = () => { for (const listener of listeners) { try { listener(); } catch {} } };
  const getOptions = () => ({ ...DEFAULT_OPTIONS, ...storage.options });
  const getPhrases = () => cleanPhrases(storage.phrases);
  const tryFind = (method, ...args) => { try { return api.metro[method]?.(...args); } catch { return null; } };
  let selectedChannel = null, userStore = null, lengthModule = null;
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
        small('Saved words, ready while you type. Offline phrase matching; no AI service or API key.'),
        onClose ? button('Back to chat', onClose, colors) : null,
        small(active ? connection : 'Plugin disabled. Enable AutoText to connect live typing.'),
        ...[
          ['enabled', 'Typing assistance', 'Pause or resume AutoText.'],
          ['suggestions', 'Saved-phrase suggestions', 'Tap a suggestion to finish a saved phrase. Start with three letters or a shortcut like ;br.'],
          ['shortcuts', 'Expand shortcuts', 'Type a complete shortcut followed by a space. Example: ;brb → Be right back!'],
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
        small('A practice editor. Type ;brb and a space, or type - First point and press Enter. You can also copy a finished draft from here.'),
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
        small('Version 1.0.0'),
      ));
  }

  function AssistBar({ inputRef, channelId }) {
    useUpdates();
    const [, render] = React.useState(0);
    const [open, setOpen] = React.useState(false);
    const sessionRef = React.useRef(null);
    const colors = palette(), options = getOptions();
    const ownerAccount = accountNow();
    React.useEffect(() => {
      let closed = false, target = null, poll = null;
      const accountId = ownerAccount;
      const belongs = () => active && !closed && accountNow() === accountId
        && (!channelId || !channelNow() || channelNow() === channelId);
      const release = () => {
        const session = sessionRef.current;
        if (session) { session.dispose(); sessions.delete(session); }
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
            maxLength, allowed: belongs, changed: () => { if (!closed) render(n => n + 1); }, report: issue });
          sessionRef.current = session; sessions.add(session);
          connection = 'Connected to the chat composer.'; tell(); render(n => n + 1);
        } catch { issue(); }
      };
      bind();
      // Refs are populated after render and can be replaced without rerendering
      // the wrapper. Check only the ref identity; never poll/save draft content.
      poll = setInterval(bind, 600);
      const cleanup = () => {
        if (closed) return;
        closed = true; clearInterval(poll); release(); mountCleanups.delete(cleanup);
      };
      mountCleanups.add(cleanup);
      return cleanup;
    }, [inputRef, channelId, ownerAccount]);
    if (!active) return null;
    const session = sessionRef.current;
    const text = session?.text ?? '';
    const useEdit = edit => {
      try {
        if (!session?.apply(edit, text)) notify('Draft changed or message limit reached. Try again.');
      } catch { issue(); }
    };
    const suggestions = suggestionsFor(text, getPhrases(), options.enabled && options.suggestions);
    return h(RN.View, { style: { backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 8, paddingBottom: 5 } },
      suggestions.length ? h(RN.ScrollView, { horizontal: true, keyboardShouldPersistTaps: 'always', showsHorizontalScrollIndicator: false },
        ...suggestions.map(p => button(p.text.replace(/\n/g, ' · ').slice(0, 80), () => useEdit(p), colors, { key: p.shortcut, accessibilityLabel: 'Insert phrase ' + p.shortcut }))) : null,
      h(RN.ScrollView, { horizontal: true, keyboardShouldPersistTaps: 'always', showsHorizontalScrollIndicator: false },
        options.enabled && session ? button('+ Bullet', () => useEdit(startList(text)), colors) : null,
        options.enabled && session ? button('+ Number', () => useEdit(startList(text, true)), colors) : null,
        options.enabled && session?.canUndo ? button('Undo', () => { try { session.undo(); } catch { issue(); } }, colors) : null,
        button('Phrases', () => setOpen(true), colors),
        button(options.enabled ? 'Pause' : 'Resume', () => setOption('enabled', !options.enabled), colors)),
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
            return h(React.Fragment, null,
              h(BarBoundary, { key: 'auto-text-' + (channelId ?? '') }, h(AssistBar, { inputRef, channelId })), result);
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
      active = true; attempts = 0; hookComposer(); tell();
    },
    onUnload() {
      active = false;
      if (retry !== null) clearTimeout(retry);
      retry = null;
      for (const cleanup of [...mountCleanups]) { try { cleanup(); } catch {} }
      mountCleanups.clear();
      for (const session of sessions) { try { session.dispose(); } catch {} }
      sessions.clear();
      try { rootUnpatch?.(); } catch {}
      rootUnpatch = null; tell(); listeners.clear();
    },
    settings: Settings,
  };
}

return createPlugin(vendetta);
})()
