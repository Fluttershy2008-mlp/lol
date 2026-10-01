/* SPDX-License-Identifier: MIT */
import { DEFAULT_OPTIONS, cleanPhrases, validatePhrase, automaticEdit, applyEdit, suggestionsFor, startList } from './core.mjs';
import { createSession } from './session.mjs';
import { decorateComposer } from './composer.mjs';

export function createPlugin(api) {
  const { React, ReactNative: RN } = api.metro.common;
  const h = React.createElement;
  const storage = api.plugin.storage;
  const Button = RN.TouchableOpacity;
  let active = false, rootUnpatch = null, retry = null, attempts = 0, appStateSubscription = null;
  let connection = 'Open a chat after enabling AutoText.';
  const listeners = new Set(), sessions = new Set(), mountCleanups = new Set();
  const sessionsByRef = new Map();
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
        small('Version 1.2.1'),
      ));
  }

  function AssistBar({ inputRef, channelId }) {
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
            maxLength, allowed: belongs, changed: () => { if (!closed) render(n => n + 1); }, report: issue });
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
        closed = true; clearInterval(poll); release(); mountCleanups.delete(cleanup);
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
            const toolbar = h(BarBoundary, { key: 'auto-text-' + (channelId ?? '') }, h(AssistBar, { inputRef, channelId }));
            const decorated = decorateComposer(React, RN, result, {
              toolbar,
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
      for (const cleanup of [...mountCleanups]) { try { cleanup(); } catch {} }
      mountCleanups.clear();
      for (const session of sessions) { try { session.dispose(); } catch {} }
      sessions.clear();
      sessionsByRef.clear();
      try { rootUnpatch?.(); } catch {}
      rootUnpatch = null; tell(); listeners.clear();
    },
    settings: Settings,
  };
}
