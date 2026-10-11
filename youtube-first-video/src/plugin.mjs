export function createPlugin(V, host = globalThis) {
  const { React, ReactNative: RN, clipboard } = V.metro.common;
  const h = React.createElement;
  const optional = fn => { try { return fn(); } catch { return undefined; } };
  const byProps = (...keys) => optional(() => V.metro.findByProps(...keys));
  const storage = V.plugin?.storage ?? {};
  const listeners = new Set(), unpatches = [];
  const resolver = createYouTubeResolver(host.fetch?.bind(host));
  const sheetHost = byProps('openLazy', 'hideActionSheet');
  const Row = byProps('ActionSheetRow')?.ActionSheetRow;
  let active = false, job = 0, abort, bypass = false, fallbackAlert = false;
  let state = { input: '', busy: false, progress: '', error: '', result: null, tapHooks: 0 };
  const snapshot = () => ({ ...state });
  const emit = () => { for (const fn of listeners) optional(fn); };
  const change = update => { state = { ...state, ...update }; emit(); };
  const toast = text => optional(() => V.ui?.toasts?.showToast?.(text));

  function cancel() {
    job++;
    abort?.abort(); abort = undefined;
    change({ busy: false, progress: '' });
  }

  function alertResult(result) {
    RN.Alert?.alert?.('Oldest public YouTube upload', `${result.channel}\n${result.title}\nPublished: ${result.date}\n${result.url}`, [
      { text: 'Close', style: 'cancel' },
      { text: 'Copy link', onPress: () => copy(result) },
      { text: 'Open video', onPress: () => { void openURL(result.url); } },
    ]);
  }

  async function run(input) {
    if (!active) { change({ error: 'Enable YouTube First Video to search.' }); return; }
    cancel();
    const current = ++job;
    const controller = typeof host.AbortController === 'function' ? new host.AbortController()
      : typeof AbortController === 'function' ? new AbortController() : null;
    abort = controller;
    change({ input: String(input ?? '').trim(), busy: true, result: null, error: '', progress: 'Finding the channel…' });
    try {
      const result = await resolver.lookup(input, { signal: controller?.signal,
        progress: text => { if (active && current === job) change({ progress: text }); } });
      if (!active || current !== job) return;
      change({ result, busy: false, progress: '' });
      if (fallbackAlert) alertResult(result);
      return result;
    } catch (error) {
      if (!active || current !== job || error?.name === 'AbortError') return;
      change({ error: error?.message ?? 'The oldest video could not be confirmed.', busy: false, progress: '' });
      if (fallbackAlert) RN.Alert?.alert?.('YouTube First Video', state.error);
    } finally { if (current === job) abort = undefined; }
  }

  async function openURL(url) {
    if (!active) return;
    bypass = true;
    try {
      if (typeof RN.Linking?.openURL === 'function') await RN.Linking.openURL(url);
      else if (typeof V.metro.common.url?.openURL === 'function') await V.metro.common.url.openURL(url);
      else throw new Error('Link opening is unavailable on this Discord version. Use Copy video link.');
    } catch (error) { RN.Alert?.alert?.('Could not open YouTube', error?.message ?? 'Use Copy video link.'); }
    finally { bypass = false; }
  }

  function copy(result = state.result) {
    if (!active || !result) return;
    try {
      if (typeof clipboard?.setString !== 'function') throw new Error('Clipboard is unavailable on this Discord version.');
      clipboard.setString(result.url); toast('Video link copied');
    } catch (error) { RN.Alert?.alert?.('Copy video link', error?.message); }
  }

  function openPage(input = state.input, search = false) {
    if (!active) return;
    change({ input: String(input ?? '').trim() });
    fallbackAlert = false;
    try {
      const navigation = byProps('getRootNavigationRef')?.getRootNavigationRef?.();
      if (typeof navigation?.navigate !== 'function') throw new Error('Settings navigation is unavailable.');
      navigation.navigate('BUNNY_CUSTOM_PAGE', { title: 'YouTube First Video', render: Settings });
    } catch {
      fallbackAlert = true;
      if (search) toast('Finding the oldest public upload…');
      else RN.Alert?.alert?.('YouTube First Video', 'Open this plugin’s Configure button on the Plugins page to paste a link.');
    }
    if (search) void run(input);
  }

  function Settings() {
    const [, redraw] = React.useState(0);
    const [input, setInput] = React.useState(state.input);
    React.useEffect(() => {
      const listener = () => redraw(value => value + 1);
      listeners.add(listener); listener();
      return () => listeners.delete(listener);
    }, []);
    React.useEffect(() => { setInput(state.input); }, [state.input]);
    const scheme = typeof RN.useColorScheme === 'function' ? RN.useColorScheme() : 'dark';
    const theme = optional(() => V.metro.findByStoreName?.('ThemeStore')?.theme);
    const dark = (theme ?? scheme) !== 'light';
    const c = dark ? { bg: '#111214', card: '#202226', text: '#f2f3f5', muted: '#b5bac1', border: '#41434a', accent: '#ed4545' }
      : { bg: '#f2f3f5', card: '#fff', text: '#1e1f22', muted: '#5c6068', border: '#d4d7dc', accent: '#bd2020' };
    const Pressable = RN.Pressable ?? RN.TouchableOpacity;
    const text = (value, style = {}, props = {}) => h(RN.Text,
      { style: { color: c.text, fontSize: 15, lineHeight: 21, ...style }, ...props }, value);
    const button = (label, onPress, disabled = false, primary = false) => h(Pressable, {
      accessibilityRole: 'button', accessibilityLabel: label, disabled, onPress,
      style: { minHeight: 46, padding: 13, marginTop: 10, borderRadius: 10,
        backgroundColor: primary ? c.accent : c.card, borderWidth: primary ? 0 : 1,
        borderColor: c.border, opacity: disabled ? 0.45 : 1 },
    }, text(label, { textAlign: 'center', fontWeight: '700', color: primary ? '#fff' : c.text }));
    const result = state.result;
    return h(RN.ScrollView, {
      style: { flex: 1, backgroundColor: c.bg }, contentContainerStyle: { padding: 18, paddingBottom: 70 },
      keyboardShouldPersistTaps: 'handled', keyboardDismissMode: 'on-drag',
    },
    text('YouTube First Video', { fontSize: 25, lineHeight: 32, fontWeight: '800' }),
    text('Find a channel’s oldest available public upload, including Shorts and past livestreams.', { color: c.muted, marginTop: 8 }),
    text('Channel or video link', { fontWeight: '700', marginTop: 22, marginBottom: 8 }),
    h(RN.TextInput, { value: input, onChangeText: setInput,
      accessibilityLabel: 'YouTube channel or video link', placeholder: 'https://youtube.com/@mobilelegends5v5moba',
      placeholderTextColor: c.muted, autoCorrect: false, autoCapitalize: 'none', keyboardType: 'url',
      returnKeyType: 'search', onSubmitEditing: () => { if (!state.busy) void run(input); },
      style: { color: c.text, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10,
        minHeight: 48, padding: 12, fontSize: 14 },
    }),
    button('Paste link', () => {
      void Promise.resolve(optional(() => clipboard?.getString?.())).then(value => {
        if (active && typeof value === 'string') setInput(value.trim());
      }).catch(() => toast('Could not read the clipboard'));
    }, state.busy),
    button(state.busy ? 'Searching…' : result ? 'Search again / Refresh' : 'Find oldest video', () => { void run(input); }, state.busy || !input.trim(), true),
    state.busy ? h(RN.View, { style: { marginTop: 14 } },
      h(RN.ActivityIndicator, { color: c.accent }),
      text(state.progress, { color: c.muted, marginTop: 8, textAlign: 'center' }, { accessibilityLiveRegion: 'polite' }),
      button('Cancel search', cancel)) : null,
    state.error ? h(RN.View, { style: { padding: 15, borderRadius: 12, backgroundColor: c.card, marginTop: 16 } },
      text('Could not confirm the oldest upload', { fontWeight: '700' }),
      text(state.error, { color: c.muted, marginTop: 7 }),
      button('Open channel / original link', () => { try { void openURL(parseYouTubeLink(input).url); } catch {} })) : null,
    result ? h(RN.View, { style: { marginTop: 20, padding: 15, backgroundColor: c.card, borderRadius: 12 } },
      text('Oldest available public upload', { color: c.muted, fontSize: 13, fontWeight: '700' }),
      h(RN.Image, { source: { uri: result.thumbnail }, resizeMode: 'cover', accessibilityLabel: 'Video thumbnail',
        style: { width: '100%', aspectRatio: 16 / 9, borderRadius: 8, marginTop: 12 } }),
      text(result.title, { fontSize: 18, lineHeight: 25, fontWeight: '800', marginTop: 12 }),
      text(result.channel, { color: c.muted, marginTop: 6 }),
      text(`Published: ${result.date} (UTC) · ${result.kind}`, { color: c.muted, marginTop: 4 }),
      text(result.url, { color: c.muted, fontSize: 12, marginTop: 9 }, { selectable: true }),
      button('Open video in YouTube', () => { void openURL(result.url); }, false, true),
      button('Copy video link', () => copy(result)),
      button('Open channel normally', () => { void openURL(result.channelURL); }),
    ) : null,
    h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, marginTop: 12 } },
      h(RN.View, { style: { flex: 1, paddingRight: 14 } },
        text('Search when I tap a channel link', { fontWeight: '700' }),
        text('Regular video links still open normally.', { color: c.muted, fontSize: 13, marginTop: 4 })),
      h(RN.Switch, { accessibilityLabel: 'Search when tapping YouTube channel links', value: storage.interceptChannels !== false,
        onValueChange: value => { storage.interceptChannels = value; redraw(value => value + 1); } })),
    state.tapHooks === 0 ? text('Tap integration is unavailable on this Discord build. Use this page, /ytfirst, or long-press a message.',
      { color: c.muted, fontSize: 13, marginBottom: 12 }) : null,
    text('You can also long-press a message containing a YouTube link and choose “Find oldest YouTube video”, or use /ytfirst link:<URL>. Results are shown only to you.',
      { color: c.muted, fontSize: 13 }),
    text('Private, deleted, unlisted, members-only and region-hidden videos cannot be included. If YouTube blocks a date or sorting control, the plugin reports it instead of guessing.',
      { color: c.muted, fontSize: 12, marginTop: 14 }));
  }

  function linkFromArgs(args) {
    for (const value of args.slice(0, 2)) {
      const raw = typeof value === 'string' ? value : value?.url ?? value?.href ?? value?.targetUri;
      if (typeof raw !== 'string') continue;
      try { const link = parseYouTubeLink(raw); if (link.kind === 'channel') return link; } catch {}
    }
  }

  function attachTapHooks() {
    const patched = new Map();
    let count = 0;
    for (const [module, methods] of [
      [RN.Linking, ['openURL']],
      [V.metro.common.url, ['openURL', 'handleSupportedURL', 'handleMessageLinking']],
      [byProps('openURL', 'openDeeplink'), ['openURL', 'handleSupportedURL']],
      [byProps('handleContentLinking'), ['handleContentLinking']],
      [byProps('handleMessageLinking'), ['handleMessageLinking']],
    ]) {
      if (!module) continue;
      for (const method of methods) {
        if (typeof module[method] !== 'function' || patched.get(module)?.has(method)) continue;
        try {
          const dispose = V.patcher.instead(method, module, function (args, original) {
            const link = !bypass && active && storage.interceptChannels !== false ? linkFromArgs(args) : null;
            if (!link) return original.apply(this, args);
            openPage(link.url, true);
            return Promise.resolve();
          });
          if (typeof dispose === 'function') unpatches.push(dispose);
          if (!patched.has(module)) patched.set(module, new Set());
          patched.get(module).add(method); count++;
        } catch {}
      }
    }
    change({ tapHooks: count });
  }

  function menuLinks(props, context) {
    const values = [props, context, props?.message, context?.message, props?.analyticsLocation, context?.analyticsLocation];
    const strings = values.flatMap(value => [value?.url, value?.href, value?.content,
      ...(value?.embeds ?? []).flatMap(embed => [embed.url, embed.author?.url])]);
    return findYouTubeLinks(...strings);
  }

  function addMenuRow(tree, links, key) {
    const rowKey = 'youtube-first-video-action';
    let best, score = 0, duplicate = false;
    const isRow = node => node?.props && typeof node.props.onPress === 'function'
      && (node.type === Row || node.props.label != null || node.props.message != null);
    function inspect(node, depth = 0) {
      if (!node || depth > 40) return;
      if (Array.isArray(node)) {
        const rows = node.filter(isRow);
        if (rows.length > score) { best = node; score = rows.length; }
        for (const child of node) inspect(child, depth + 1);
      } else if (node.props) {
        if (node.key === rowKey || node.props.label === 'Find oldest YouTube video') duplicate = true;
        inspect(node.props.children, depth + 1);
      }
    }
    inspect(tree);
    if (!best || duplicate) return tree;
    const row = h(Row, { key: rowKey, label: 'Find oldest YouTube video',
      onPress: () => {
        if (!active) return;
        optional(() => sheetHost.hideActionSheet(key));
        if (links.length === 1) openPage(links[0].url, true);
        else {
          // The input alert also works on Android, where native alerts allow only three buttons.
          optional(() => V.ui.alerts.showInputAlert({ title: 'Choose a YouTube link',
            initialValue: links[0].url, placeholder: 'Paste the channel or video link',
            confirmText: 'Find oldest', onConfirm: value => openPage(value || links[0].url, true) }));
        }
      } });
    function replace(node) {
      if (node === best) return [...best, row];
      if (Array.isArray(node)) return node.map(replace);
      if (node?.props?.children != null) return React.cloneElement(node, { children: replace(node.props.children) });
      return node;
    }
    return replace(tree);
  }

  function wrapMenu(component, context, key, generation) {
    const transform = (props, tree) => {
      if (!active || generation !== loadGeneration) return tree;
      try { const links = menuLinks(props, context); return links.length ? addMenuRow(tree, links, key) : tree; }
      catch { return tree; }
    };
    if (typeof component === 'function' && !component.prototype?.isReactComponent)
      return function YouTubeFirstVideoMenu(...args) { return transform(args[0], component.apply(this, args)); };
    if (component?.$$typeof === Symbol.for('react.memo')) return React.memo(wrapMenu(component.type, context, key, generation), component.compare);
    if (component?.$$typeof === Symbol.for('react.forward_ref'))
      return React.forwardRef((props, ref) => transform(props, component.render(props, ref)));
    return component;
  }

  let loadGeneration = 0;
  return {
    onLoad() {
      if (active) return;
      active = true; loadGeneration++;
      attachTapHooks();
      if (typeof V.commands?.registerCommand === 'function') {
        const dispose = V.commands.registerCommand({ name: 'ytfirst', description: 'Show a YouTube channel’s oldest public upload (only you see it).',
          options: [{ name: 'link', description: 'YouTube channel link, video link, or @handle', type: 3, required: true }],
          execute: args => { openPage(args.find(arg => arg.name === 'link')?.value ?? '', true); },
        });
        if (typeof dispose === 'function') unpatches.push(dispose);
      }
      if (sheetHost?.openLazy && Row && V.patcher?.before) {
        unpatches.push(V.patcher.before('openLazy', sheetHost, args => {
          const [lazy, key, context] = args;
          if (key !== 'MessageLongPressActionSheet' || !lazy?.then) return;
          const generation = loadGeneration;
          args[0] = Promise.resolve(lazy).then(module => {
            if (!active || generation !== loadGeneration || !module?.default) return module;
            return { ...module, default: wrapMenu(module.default, context, key, generation) };
          });
        }));
      }
    },
    onUnload() {
      active = false; loadGeneration++; cancel();
      for (const dispose of unpatches.splice(0).reverse()) optional(dispose);
      listeners.clear(); change({ result: null, error: '', tapHooks: 0 });
    },
    settings: Settings,
    controller: { snapshot, run, cancel, openURL, copy },
  };
}
