import { createCore } from './core.mjs';
import { createExpressionUpload } from '../../compatibility/expression-upload.mjs';
import { createExpressionPanel } from '../../compatibility/expression-panel.mjs';
import { createPickerPage } from './page.mjs';

export function createPlugin(V, env = globalThis) {
  const { React, ReactNative: RN, constants } = V.metro.common;
  const h = React.createElement, core = createCore(env);
  const uploads = createExpressionUpload(V, env);
  const panels = createExpressionPanel(V, 'StealmojiPicker');
  const pages = createPickerPage(V, env);
  const KEY = 'StealmojiPicker', ROW = 'stealmoji-actions';
  let active = false, generation = 0, pending = false, hooked = false, retryTimer, resume, pickerOpening;
  const unpatches = [], dialogs = new Set(), cancellations = new Set(), viewTimers = new Set();
  const byProps = (...keys) => { try { return V.metro.findByProps(...keys); } catch {} };
  const byStore = key => { try { return V.metro.findByStoreName(key); } catch {} };
  const toast = message => { try { V.ui?.toasts?.showToast?.(message); } catch {} };
  const host = () => byProps('openLazy', 'hideActionSheet') ?? byProps('openLazy');
  const canCreate = guild => core.canCreate(guild, byStore('UserStore')?.getCurrentUser?.(), byStore('PermissionStore'), constants);
  const slots = (guild, emoji) => core.slots(guild, emoji.animated, byStore('EmojiStore'), byProps('getMaxEmojiSlots'));
  const currentGuild = id => byStore('GuildStore')?.getGuild?.(id) ?? byStore('GuildStore')?.getGuilds?.()?.[id];
  const safe = fn => () => { if (active) Promise.resolve().then(fn).catch(error => toast(core.errorMessage(error))); };
  async function timed(task, control, duration, message) {
    let timer, done = false, rejectWaiting;
    const stop = () => {
      if (done) return;
      control.cancelled = true;
      rejectWaiting(Object.assign(new Error('Stealmoji action cancelled.'), { code: 'STEALMOJI_CANCELLED' }));
      try { control.controller?.abort(); } catch {}
    };
    const deadline = new Promise((_, reject) => {
      rejectWaiting = reject;
      timer = env.setTimeout(() => {
        control.expired = true;
        reject(new Error(message));
        try { control.controller?.abort(); } catch {}
      }, duration);
    });
    control.cancel = stop; cancellations.add(stop);
    try { return await Promise.race([Promise.resolve().then(task), deadline]); }
    finally {
      done = true; env.clearTimeout(timer); cancellations.delete(stop);
      if (control.cancel === stop) control.cancel = undefined;
    }
  }
  function colors() {
    const dark = (byStore('ThemeStore')?.theme ?? RN.Appearance?.getColorScheme?.()) !== 'light';
    return { text: dark ? '#f2f3f5' : '#202127', muted: dark ? '#b5bac1' : '#50535c', input: dark ? '#25262c' : '#e5e7ec' };
  }
  function text(value, style = {}) { return h(RN.Text, { style: { color: colors().text, fontSize: 15, ...style } }, value); }
  function button(label, onPress, disabled = false, key = label) {
    return h(RN.Pressable ?? RN.TouchableOpacity, {
      key, onPress, disabled, accessibilityRole: 'button', accessibilityLabel: label,
      accessibilityState: { disabled },
      style: { padding: 12, marginTop: 8, borderRadius: 8, backgroundColor: disabled ? '#626775' : '#5865f2' },
    }, text(label, { color: '#fff', fontWeight: '600', textAlign: 'center' }));
  }
  function input(value, onChangeText, placeholder, extra = {}) {
    return h(RN.TextInput, { value, onChangeText, placeholder, autoCapitalize: 'none', autoCorrect: false,
      placeholderTextColor: colors().muted, accessibilityLabel: placeholder,
      style: { color: colors().text, backgroundColor: colors().input, padding: 12, marginTop: 8, borderRadius: 8 }, ...extra });
  }
  function knownEmoji(value) {
    const parsed = core.parse(value);
    if (!parsed) return null;
    try {
      const store = byStore('EmojiStore');
      const cached = store?.getCustomEmojiById?.(parsed.id) ?? store?.getEmojiById?.(parsed.id);
      if (cached) return { ...parsed, name: core.name(cached.name ?? parsed.name), animated: Boolean(parsed.animated || cached.animated) };
    } catch {}
    return parsed;
  }
  function resolveEmoji(...values) {
    for (const value of values) {
      for (const candidate of [value?.emojiNode, value?.emoji, value?.reaction?.emoji, value?.nativeEvent?.node]) {
        const emoji = knownEmoji(candidate);
        if (emoji) return emoji;
      }
    }
    return null;
  }
  function messageEmojis(...values) {
    const result = [], seen = new Set();
    for (const value of values) {
      const message = value?.message;
      if (!message) continue;
      const matches = String(message.content ?? '').match(/<a?:[A-Za-z0-9_]+:\d{17,20}>/g) ?? [];
      for (const match of [...matches, ...(message.reactions ?? []).map(r => r.emoji)]) {
        const emoji = knownEmoji(match);
        if (emoji && !seen.has(emoji.id)) { seen.add(emoji.id); result.push(emoji); }
        if (result.length >= 25) return result;
      }
    }
    return result;
  }
  async function copyURL(emoji) {
    const clipboard = V.metro.common.clipboard ?? byProps('setString', 'getString');
    if (!clipboard?.setString) throw new Error('Clipboard is unavailable on this Discord build.');
    await clipboard.setString(core.url(emoji));
    return 'Emoji link copied.';
  }
  async function saveImage(emoji) {
    const media = byProps('downloadMediaAsset');
    if (!media?.downloadMediaAsset) throw new Error('Saving is unavailable on this build. Use Copy emoji link.');
    const result = media.downloadMediaAsset(core.url(emoji, 256), emoji.animated ? 1 : 0);
    if (result?.then) { await result; return 'Emoji saved.'; }
    return 'Save requested. Check Downloads or Photos.';
  }
  function viewImage(emoji) {
    const media = byProps('openMediaModal');
    if (!media?.openMediaModal) throw new Error('Image viewer is unavailable. Use Save image or Copy emoji link.');
    const uri = core.url(emoji, 256);
    host()?.hideActionSheet?.(KEY);
    return media.openMediaModal({ initialSources: [{ uri, sourceURI: uri, width: 256, height: 256 }], initialIndex: 0,
      originLayout: { width: 100, height: 100, x: 0, y: 0, resizeMode: 'contain' } });
  }
  async function copyImage(emoji, current, control) {
    const clipboard = V.metro.common.clipboard;
    if (!clipboard?.setImage) throw new Error('Copy image is unavailable. Use Copy emoji link.');
    const data = await core.imageData(emoji, current, control.controller?.signal);
    if (!current()) throw new Error('Image copy cancelled.');
    await clipboard.setImage(data.split(',')[1]);
    return 'Emoji image copied.';
  }
  async function upload(emoji, guildId, name, alive, control) {
    if (!active) throw new Error('Enable Stealmoji before uploading.');
    if (pending) throw new Error('An emoji upload is already in progress.');
    if (!core.validName(name)) throw new Error('Use 2–32 letters, numbers, or underscores.');
    const guild = currentGuild(guildId);
    if (!guild || !canCreate(guild)) throw new Error('You need Create Expressions permission in this server.');
    if (slots(guild, emoji).full) throw new Error('This server has no free slots for this emoji type.');
    const uploadImage = uploads.resolve('emoji');
    const session = generation;
    const account = byStore('UserStore')?.getCurrentUser?.()?.id;
    const current = () => active && generation === session && pending === control && !control.cancelled && !control.expired
      && alive() && !!account && byStore('UserStore')?.getCurrentUser?.()?.id === account;
    const check = () => { if (!current()) throw new Error('Upload cancelled because the plugin or Discord account changed.'); };
    pending = control;
    try {
      return await timed(async () => {
        check();
        const data = await core.imageData(emoji, current, control.controller?.signal);
        check();
        const latest = currentGuild(guildId);
        if (!latest || !canCreate(latest)) throw new Error('Your permission to upload has changed.');
        if (slots(latest, emoji).full) throw new Error('This server has no free slots for this emoji type.');
        // Once handed to the uploader, closing only detaches the UI. Keep the
        // single-write guard until the request settles or reaches its deadline.
        control.writing = true;
        await uploadImage({ guildId, name, image: data, roles: undefined }, check);
        check();
        return `${name} added to ${latest.name}.`;
      }, control, 45000, 'Discord’s upload response timed out. Check the server’s emoji before trying again.');
    } finally { if (pending === control) pending = false; }
  }
  function guildIcon(guild) {
    const style = { width: 44, height: 44, borderRadius: 14 };
    if (guild.icon) return h(RN.Image, { source: { uri: `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=96` },
      resizeMode: 'cover', style, accessible: false });
    const initials = String(guild.name ?? '?').trim().split(/\s+/).map(word => word[0]).join('').slice(0, 3);
    return h(RN.View, { style: { ...style, backgroundColor: '#5865f2', alignItems: 'center', justifyContent: 'center' } },
      text(initials, { color: '#fff', fontWeight: '600' }));
  }
  function Picker({ emojis = [], close, settings = false, inSheet = false, inPanel = false, isOpen }) {
    const [emoji, setEmoji] = React.useState(emojis.length === 1 ? emojis[0] : null);
    const [source, setSource] = React.useState(''), [name, setName] = React.useState(emojis[0]?.name ?? 'emoji');
    const [guildId, setGuild] = React.useState(null), [search, setSearch] = React.useState('');
    const [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false), [success, setSuccess] = React.useState('');
    const [toolsOpen, setToolsOpen] = React.useState(false);
    const [revision, refresh] = React.useState(0), mounted = React.useRef(true), lock = React.useRef(false);
    const closed = React.useRef(false), operation = React.useRef(), session = React.useRef(generation);
    const alive = () => mounted.current && !closed.current && active && session.current === generation && (!isOpen || isOpen());
    const cancelPreparation = () => { if (!operation.current?.writing) operation.current?.cancel?.(); };
    const dismiss = () => {
      if (closed.current) return;
      closed.current = true; cancelPreparation();
      try { RN.Keyboard?.dismiss?.(); } catch {}
      close?.();
    };
    const control = () => ({ controller: env.AbortController ? new env.AbortController() : undefined });
    React.useEffect(() => {
      mounted.current = true;
      const cleanups = [];
      const changed = () => { if (mounted.current) refresh(n => n + 1); };
      for (const key of ['GuildStore', 'PermissionStore', 'EmojiStore']) {
        try { const store = byStore(key); store?.addChangeListener?.(changed); cleanups.push(() => store?.removeChangeListener?.(changed)); } catch {}
      }
      return () => { mounted.current = false; cancelPreparation(); cleanups.forEach(fn => { try { fn(); } catch {} }); };
    }, []);
    const choose = next => { setEmoji(next); setName(next.name); setGuild(null); setToolsOpen(false); setSearch(''); setError(''); setSuccess(''); };
    const submit = async () => {
      if (lock.current || !alive()) return;
      lock.current = true; setBusy(true); setError(''); setSuccess('');
      const current = control(); operation.current = current;
      try {
        const message = await upload(emoji, guildId, name.trim(), alive, current);
        if (alive()) {
          if (close) dismiss(); else { setSuccess(message); setGuild(null); }
          toast(message);
        }
      } catch (e) { if (alive() && e?.code !== 'STEALMOJI_CANCELLED') setError(core.errorMessage(e)); }
      finally { if (operation.current === current) operation.current = undefined; lock.current = false; if (alive()) setBusy(false); }
    };
    const tool = action => async () => {
      if (lock.current || !alive()) return;
      lock.current = true; setBusy(true); setError('');
      const current = control(); operation.current = current;
      const usable = () => alive() && !current.cancelled && !current.expired;
      try {
        const message = await timed(() => {
          if (!usable()) throw Object.assign(new Error('Stealmoji action cancelled.'), { code: 'STEALMOJI_CANCELLED' });
          return action(usable, current);
        }, current, 15000, 'The emoji action timed out. You can close this window and try again.');
        if (alive()) { if (close) dismiss(); else setSuccess(message); toast(message); }
      } catch (e) { if (alive() && e?.code !== 'STEALMOJI_CANCELLED') setError(core.errorMessage(e)); }
      finally { if (operation.current === current) operation.current = undefined; lock.current = false; if (alive()) setBusy(false); }
    };
    const view = () => {
      if (lock.current || !alive()) return;
      if (!byProps('openMediaModal')?.openMediaModal) { setError('Image viewer is unavailable. Use Save image or Copy emoji link.'); return; }
      if (!close) { safe(() => viewImage(emoji))(); return; }
      const openingSession = generation, account = byStore('UserStore')?.getCurrentUser?.()?.id;
      dismiss();
      const timer = env.setTimeout(() => {
        viewTimers.delete(timer);
        if (active && generation === openingSession && !pickerOpening && byStore('UserStore')?.getCurrentUser?.()?.id === account)
          safe(() => viewImage(emoji))();
      }, 350);
      viewTimers.add(timer);
    };
    if (emoji && !guildId && !toolsOpen) {
      const palette = colors();
      const guilds = Object.values(byStore('GuildStore')?.getGuilds?.() ?? {}).filter(canCreate)
        .filter(g => String(g.name ?? '').toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      // Use the sheet's gesture-aware list inside a sheet, and a normal list in settings/alerts.
      const List = (inSheet ? byProps('BottomSheetFlatList')?.BottomSheetFlatList
        ?? byProps('BottomSheetScrollView')?.BottomSheetFlatList : null) ?? RN.FlatList;
      const row = guild => {
        const capacity = slots(guild, emoji), disabled = capacity.full || busy;
        const select = () => {
          if (!active || busy) return;
          if (pending) { setError('An emoji upload is already in progress. You can close this window while it finishes.'); return; }
          const latest = currentGuild(guild.id);
          if (!latest || !canCreate(latest)) { setError('You no longer have permission to add emoji to this server.'); return; }
          if (slots(latest, emoji).full) { setError('This server has no slots available for this emoji type.'); return; }
          RN.Keyboard?.dismiss?.(); setGuild(guild.id); setError(''); setSuccess('');
        };
        return h(RN.Pressable ?? RN.TouchableOpacity, { key: guild.id, onPress: select, disabled,
          accessibilityRole: 'button', accessibilityLabel: guild.name,
          accessibilityHint: capacity.full ? 'No slots available' : 'Choose emoji name and add to this server',
          accessibilityState: { disabled }, style: { minHeight: 80, paddingHorizontal: 28, paddingVertical: 14,
            flexDirection: 'row', alignItems: 'center', opacity: disabled ? 0.4 : 1 } },
          guildIcon(guild), h(RN.View, { style: { flex: 1, marginLeft: 18, marginRight: 16 } },
            h(RN.Text, { numberOfLines: 2, style: { color: palette.text, fontSize: 17, fontWeight: '600' } }, guild.name),
            capacity.full ? text('No slots available', { color: palette.muted, fontSize: 13, marginTop: 3 }) : null),
          text('+', { color: palette.muted, fontSize: 30, fontWeight: '300' }));
      };
      const empty = h(RN.View, { style: { padding: 24 } }, text(search.trim() ? 'No servers match your search.'
        : 'No servers available. You need Create Expressions permission to add emoji.', { color: palette.muted }));
      const listProps = { style: { flex: 1, minHeight: 0 }, contentContainerStyle: { paddingBottom: 36 },
        keyboardShouldPersistTaps: 'handled', keyboardDismissMode: 'on-drag', nestedScrollEnabled: true,
        showsVerticalScrollIndicator: true, removeClippedSubviews: false };
      const list = List ? h(List, { ...listProps, data: guilds, keyExtractor: guild => guild.id,
        renderItem: ({ item }) => row(item), extraData: `${revision}:${emoji.id}:${emoji.animated}:${busy}`,
        initialNumToRender: 8, maxToRenderPerBatch: 8, windowSize: 5, ListEmptyComponent: empty })
        : h(RN.ScrollView, listProps, ...(guilds.length ? guilds.map(row) : [empty]));
      const link = (label, onPress) => h(RN.Pressable ?? RN.TouchableOpacity, { onPress, accessibilityRole: 'button',
        accessibilityLabel: label, style: { paddingVertical: 12, paddingHorizontal: 16 } },
        text(label, { color: palette.muted, fontSize: 14, fontWeight: '600' }));
      const height = Math.min(680, (RN.Dimensions?.get?.('window')?.height ?? 800) * 0.72);
      // The list owns scrolling. A surrounding ScrollView would compete with the sheet gesture.
      return h(RN.View, { style: settings || inPanel ? { flex: 1, minHeight: 0 } : { height } },
        h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, minHeight: 72 } },
          h(RN.Image, { source: { uri: core.url(emoji) }, resizeMode: 'contain', accessible: false, style: { width: 30, height: 30 } }),
          h(RN.Text, { numberOfLines: 1, style: { flex: 1, color: palette.text, fontSize: 20, fontWeight: '700',
            textAlign: 'center', marginHorizontal: 12 } }, `Stealing ${emoji.name}`),
          close ? h(RN.Pressable ?? RN.TouchableOpacity, { onPress: dismiss, accessibilityRole: 'button', accessibilityLabel: 'Close',
            hitSlop: 8, style: { width: 36, height: 44, justifyContent: 'center', alignItems: 'center' } },
            text('×', { fontSize: 32, lineHeight: 36 })) : h(RN.View, { style: { width: 30 } })),
        h(RN.View, { style: { paddingHorizontal: 24, paddingBottom: 10 } }, input(search, setSearch, 'Search servers'),
          success ? text(success, { marginTop: 8 }) : null,
          error ? text(error, { color: '#e66b70', marginTop: 8 }) : null),
        list,
        h(RN.View, { style: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 12 } },
          link('Emoji tools', () => { setToolsOpen(true); setError(''); }),
          link('Use another emoji', () => { setEmoji(null); setSearch(''); setError(''); })));
    }
    const content = [text('Stealmoji', { fontSize: 22, fontWeight: '700' })];
    if (close) content.push(button('Close', dismiss));
    if (settings) content.push(text(hooked ? 'Emoji menu hook connected.' : 'Menu hook unavailable. Paste an emoji below.', { color: colors().muted, marginTop: 8 }));
    if (success) content.push(text(success, { marginTop: 12 }));
    if (!emoji) {
      content.push(text('Paste a custom emoji, Discord emoji link, or emoji ID.', { marginTop: 12 }));
      content.push(input(source, setSource, '<:emoji:123456789012345678>'));
      content.push(button('Use emoji', () => {
        const next = knownEmoji(source);
        if (!next) { setError('Enter a custom Discord emoji, emoji CDN link, or 17–20 digit emoji ID.'); return; }
        choose(next);
      }));
      emojis.forEach(item => content.push(button((item.animated ? 'GIF · ' : '') + item.name, () => choose(item), false, item.id)));
    } else {
      content.push(h(RN.Image, { key: 'preview', source: { uri: core.url(emoji) }, resizeMode: 'contain',
        accessibilityLabel: 'Emoji preview', style: { height: 100, width: '100%', marginTop: 16 } }));
      content.push(text(emoji.name, { textAlign: 'center', marginTop: 6 }));
      if (!guildId) {
        content.push(button('View emoji', view, busy));
        content.push(button('Copy emoji link', tool(() => copyURL(emoji)), busy));
        content.push(button('Save ' + (emoji.animated ? 'GIF' : 'image'), tool(() => saveImage(emoji)), busy));
        if (RN.Platform?.OS === 'ios' && !emoji.animated) content.push(button('Copy image', tool((current, task) => copyImage(emoji, current, task)), busy));
        content.push(h(RN.View, { key: 'animated', style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 } },
          text('Animated emoji (GIF)'), h(RN.Switch, { value: emoji.animated, disabled: busy, accessibilityLabel: 'Animated emoji',
            onValueChange: value => setEmoji({ ...emoji, animated: value }) })));
        content.push(button('Browse servers', () => { setToolsOpen(false); setError(''); }, busy));
        content.push(button('Use another emoji', () => { setEmoji(null); setError(''); }, busy));
      } else {
        content.push(text('Server: ' + (currentGuild(guildId)?.name ?? 'Unavailable'), { fontWeight: '600', marginTop: 12 }));
        content.push(input(name, setName, 'Emoji name', { maxLength: 32, editable: !busy }));
        content.push(text('Use 2–32 letters, numbers, or underscores.', { color: colors().muted, marginTop: 6 }));
        content.push(button(busy ? 'Uploading…' : 'Add emoji', submit, busy || !core.validName(name.trim())));
        content.push(button('Choose another server', () => setGuild(null), busy));
      }
    }
    if (error) content.push(text(error, { color: '#e66b70', marginTop: 12 }));
    return h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled',
      style: settings || inPanel ? { flex: 1 } : { maxHeight: (RN.Dimensions?.get?.('window')?.height ?? 800) * 0.66 },
      contentContainerStyle: { padding: 20, paddingBottom: 40 } }, ...content);
  }
  function guarded(element) {
    const Boundary = V.ui?.components?.ErrorBoundary;
    return Boundary ? h(Boundary, null, element) : element;
  }
  function openPicker(emojis, fromKey) {
    if (!active || pickerOpening) return;
    const opening = { session: generation };
    pickerOpening = opening;
    const release = () => { opening.closed = true; if (pickerOpening === opening) pickerOpening = undefined; };
    const live = () => active && generation === opening.session && !opening.closed && pickerOpening === opening;
    if (V.host?.id === 'valenced') {
      // Dismiss the native message sheet before pushing the normal page. This
      // path never opens an alert, an RN Modal or a second action sheet.
      try { host()?.hideActionSheet?.(fromKey); } catch {}
      if (pages.open((close, visible) => guarded(h(Picker, { emojis, close, inPanel: true,
        isOpen: () => live() && visible() })), release)) return;
      release(); toast('Open Stealmoji’s plugin settings to paste and add this emoji.'); return;
    }
    const modal = panels.open(close => guarded(h(Picker, { emojis, close, inPanel: true, isOpen: live })), 'emoji picker', release);
    if (modal) { host()?.hideActionSheet?.(fromKey); return; }
    function Content(props) {
      React.useEffect(() => release, []);
      return live() ? h(Picker, props) : null;
    }
    try {
      const sheetHost = host();
      let Sheet = byProps('ActionSheet')?.ActionSheet;
      if (!Sheet) { try { Sheet = V.metro.find(m => m?.render?.name === 'ActionSheet'); } catch {} }
      if (sheetHost?.openLazy && Sheet) {
        const close = () => { if (!live()) return; try { sheetHost.hideActionSheet?.(KEY); } finally { release(); } };
        const component = () => live() ? guarded(h(Sheet, { scrollable: true }, h(Content, { emojis, close, inSheet: true, isOpen: live }))) : null;
        sheetHost.hideActionSheet?.(fromKey);
        sheetHost.openLazy(Promise.resolve({ default: component }), KEY, {});
        return;
      }
      const manager = byProps('openAlert', 'dismissAlert'), alerts = byProps('AlertModal', 'AlertActions');
      if (manager?.openAlert && alerts?.AlertModal) {
        const close = () => { if (!live()) return; try { manager.dismissAlert(KEY); } finally { dialogs.delete(KEY); release(); } };
        dialogs.add(KEY);
        manager.openAlert(KEY, guarded(h(alerts.AlertModal, { title: 'Emoji tools', content: h(Content, { emojis, close, isOpen: live }) })));
        return;
      }
      release();
      toast('Open Stealmoji’s plugin settings to paste and add this emoji.');
    } catch (error) { release(); throw error; }
  }
  function action(emojis, key) {
    const Row = byProps('ActionSheetRow')?.ActionSheetRow;
    if (Row) return h(Row, { key: ROW, label: 'Stealmoji · Add / save emoji', onPress: safe(() => openPicker(emojis, key)) });
    return h(RN.View, { key: ROW, style: { paddingHorizontal: 16, paddingBottom: 8 } },
      button('Stealmoji · Add / save emoji', safe(() => openPicker(emojis, key))));
  }
  // Clone arrays/elements. Discord development builds freeze React elements.
  function inject(tree, emojis, key, allowContainer) {
    let best, score = -1, duplicate = false, visited = 0;
    const isAction = node => node?.props && (typeof node.props.onPress === 'function')
      && (node.props.label != null || node.props.text != null || node.props.accessibilityRole === 'button');
    function scan(node, depth = 0) {
      if (!node || depth > 24 || ++visited > 1000) return;
      if (Array.isArray(node)) {
        const count = node.filter(isAction).length;
        if (count && count + 100 > score) { best = node; score = count + 100; }
        node.forEach(item => scan(item, depth + 1));
      } else if (node.props) {
        if (node.key === ROW) duplicate = true;
        if (allowContainer && Array.isArray(node.props.children) && (node.type === RN.View || node.type === RN.ScrollView) && depth > score) {
          best = node.props.children; score = depth;
        }
        scan(node.props.children, depth + 1);
      }
    }
    scan(tree);
    if (duplicate) return { tree, done: true };
    if (!best) return { tree, done: false };
    let replacements = 0;
    function replace(node, depth = 0) {
      if (!node || depth > 24 || ++replacements > 1000) return node;
      if (node === best) return [...best, action(emojis, key)];
      if (Array.isArray(node)) {
        const children = node.map(item => replace(item, depth + 1));
        return children.some((child, i) => child !== node[i]) ? children : node;
      }
      if (node.props?.children != null) {
        const children = replace(node.props.children, depth + 1);
        return children === node.props.children ? node : React.cloneElement(node, { children });
      }
      return node;
    }
    return { tree: replace(tree), done: true };
  }
  function wrapSheet(component, context, key, session) {
    const caches = Array.from({ length: 6 }, () => new WeakMap());
    const nativeTypes = new Set([RN.View, RN.ScrollView, RN.Text, RN.Image, RN.Pressable,
      RN.TouchableOpacity, RN.TextInput, RN.FlatList, RN.Switch]);
    let visited = 0;
    let openingEmoji = resolveEmoji(context), openingEmojis = messageEmojis(context);
    const live = () => active && generation === session;
    function walk(node, props, level, depth = 0) {
      if (!node || depth > 24 || ++visited > 1000) return node;
      if (Array.isArray(node)) return node.map(child => walk(child, props, level, depth + 1));
      if (!node.props) return node;
      const next = { ...node.props };
      if (key === 'MessageReactions' && Array.isArray(next.tabs)) {
        next.tabs = next.tabs.map((tab, i) => {
          const emoji = resolveEmoji(tab?.props);
          if (!emoji) return tab;
          return h(RN.Pressable ?? RN.TouchableOpacity, { key: tab.key ?? String(i),
            onPress: () => next.onSelect?.(tab.props.index ?? i),
            onLongPress: safe(() => openPicker([emoji], key)), delayLongPress: 350,
            accessibilityRole: 'button', accessibilityLabel: 'Emoji ' + emoji.name }, tab);
        });
      }
      for (const field of ['children', 'header']) if (next[field] != null) next[field] = walk(next[field], props, level, depth + 1);
      if (level < 5 && !nativeTypes.has(node.type)) {
        const wrapped = wrap(node.type, level + 1);
        if (wrapped !== node.type) return h(wrapped, { ...next, key: node.key, ...(node.ref != null ? { ref: node.ref } : {}) });
      }
      return React.cloneElement(node, next);
    }
    function transform(props, tree, level) {
      if (!live()) return tree;
      try {
        const direct = resolveEmoji(props, context);
        if (direct) openingEmoji = direct;
        const messages = key === 'MessageLongPressActionSheet' ? messageEmojis(props, context) : [];
        if (messages.length) openingEmojis = messages;
        const emojis = openingEmoji ? [openingEmoji] : key === 'MessageLongPressActionSheet' ? openingEmojis : [];
        // Plain text menus need no Stealmoji component wrappers or tree edits.
        if (key === 'MessageLongPressActionSheet' && !emojis.length && (props?.message || context?.message)) return tree;
        if (emojis.length) {
          const changed = inject(tree, emojis, key, key !== 'MessageLongPressActionSheet');
          if (changed.done) return changed.tree;
        }
        visited = 0;
        return walk(tree, props, level);
      } catch { return tree; }
    }
    function wrap(original, level = 0) {
      if ((!original || !['function', 'object'].includes(typeof original)) || level > 5) return original;
      const cache = caches[level];
      if (cache.has(original)) return cache.get(original);
      let wrapped = original;
      if (typeof original === 'function' && !original.prototype?.isReactComponent) {
        wrapped = function StealmojiSheet(...args) { return transform(args[0], original.apply(this, args), level); };
      } else if (original.$$typeof === Symbol.for('react.memo')) {
        wrapped = React.memo(wrap(original.type, level), original.compare);
      } else if (original.$$typeof === Symbol.for('react.forward_ref')) {
        wrapped = React.forwardRef((props, ref) => transform(props, original.render(props, ref), level));
      }
      cache.set(original, wrapped);
      return wrapped;
    }
    return wrap(component);
  }
  function connect() {
    if (!active || hooked) return;
    try {
      const sheetHost = host();
      if (typeof sheetHost?.openLazy !== 'function') return;
      const unpatch = V.patcher.before('openLazy', sheetHost, args => {
        const [lazy, key, context] = args;
        if (!active || !['MessageEmojiActionSheet', 'MessageReactions', 'MessageLongPressActionSheet'].includes(key) || !lazy?.then) return;
        if (key === 'MessageLongPressActionSheet' && context?.message && !resolveEmoji(context) && !messageEmojis(context).length) return;
        const session = generation;
        args[0] = Promise.resolve(lazy).then(module => {
          if (!active || session !== generation || !module?.default) return module;
          try { return { ...module, default: wrapSheet(module.default, context, key, session) }; }
          catch { return module; }
        });
      });
      if (typeof unpatch === 'function') { unpatches.push(unpatch); hooked = true; }
    } catch {}
  }
  function onLoad() {
    if (active) return;
    active = true; generation++;
    connect();
    let tries = 0;
    const retry = () => {
      retryTimer = undefined;
      if (!active || hooked) return;
      connect();
      if (!hooked && ++tries < 30) retryTimer = env.setTimeout(retry, 2000);
    };
    if (!hooked) retryTimer = env.setTimeout(retry, 2000);
    try { resume = RN.AppState?.addEventListener?.('change', state => { if (state === 'active') connect(); }); } catch {}
  }
  function onUnload() {
    active = false; generation++; hooked = false; pickerOpening = undefined;
    pages.closeAll();
    panels.closeAll();
    for (const cancel of [...cancellations]) cancel();
    pending = false;
    for (const timer of viewTimers) env.clearTimeout(timer);
    viewTimers.clear();
    env.clearTimeout(retryTimer);
    try { resume?.remove?.(); } catch {}
    resume = undefined;
    for (const unpatch of unpatches.splice(0).reverse()) { try { unpatch(); } catch {} }
    try { host()?.hideActionSheet?.(KEY); } catch {}
    const manager = byProps('openAlert', 'dismissAlert');
    for (const key of dialogs) { try { manager?.dismissAlert?.(key); } catch {} }
    dialogs.clear();
  }
  function settings() { return guarded(h(Picker, { settings: true })); }
  return { onLoad, onUnload, settings };
}
