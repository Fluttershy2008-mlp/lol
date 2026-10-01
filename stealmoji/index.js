(() => {
'use strict';
// Stealmoji Revenge adaptation, GPL-3.0. See LICENSE and NOTICE.
function createCore(env = globalThis) {
  const LIMIT = 256 * 1024;
  const idPattern = /^\d{17,20}$/;
  function name(value) {
    const clean = String(value || 'emoji').replace(/^:+|:+$/g, '').split('~')[0].replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32);
    return clean.length >= 2 ? clean : 'emoji_' + clean;
  }
  const validName = value => /^[A-Za-z0-9_]{2,32}$/.test(value);
  function parse(value) {
    if (!value) return null;
    if (typeof value === 'string') {
      const text = value.trim();
      const mention = /^<(a?):([A-Za-z0-9_]+):(\d{17,20})>$/.exec(text);
      if (mention) return { id: mention[3], name: name(mention[2]), animated: mention[1] === 'a' };
      const url = /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/emojis\/(\d{17,20})\.(png|gif|webp|jpe?g|avif)(?:[?#].*)?$/i.exec(text);
      if (url) return { id: url[1], name: 'emoji', animated: url[2].toLowerCase() === 'gif' || /[?&]animated=true(?:&|$)/i.test(text) };
      return idPattern.test(text) ? { id: text, name: 'emoji', animated: false } : null;
    }
    if (typeof value !== 'object') return null;
    const fromURL = typeof value.src === 'string' ? parse(value.src) : null;
    const id = String(value.id ?? fromURL?.id ?? '');
    if (!idPattern.test(id)) return null;
    return { id, name: name(value.name ?? value.alt), animated: Boolean(value.animated || fromURL?.animated) };
  }
  const url = (emoji, size = 128) => `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}?size=${size}&quality=lossless`;
  function errorMessage(error) {
    const status = error?.status ?? error?.statusCode ?? error?.response?.status;
    const code = error?.body?.code;
    if (status === 429) return 'Discord is rate limiting emoji uploads. Wait before trying again.';
    if (status === 403 || code === 50013) return 'You no longer have permission to add emoji to this server.';
    if (code === 30008) return 'This server has no free slots for this emoji type.';
    if (status === 413) return 'The emoji is too large to upload.';
    return String(error?.body?.message ?? error?.message ?? 'The action failed. Please try again.').slice(0, 260);
  }
  function slots(guild, animated, emojiStore, slotModule) {
    try {
      const max = guild.getMaxEmojiSlots?.() ?? slotModule?.getMaxEmojiSlots?.(guild);
      const entry = emojiStore?.getGuilds?.()?.[guild.id];
      const raw = entry?.emojis ?? emojiStore?.getGuildEmoji?.(guild.id);
      if (!raw || !Number.isFinite(max) || max <= 0) return { full: false, used: null, max: null };
      const list = Array.isArray(raw) ? raw : Object.values(raw);
      const used = list.filter(e => e && !e.managed && Boolean(e.animated) === animated).length;
      return { used, max, full: used >= max };
    } catch { return { full: false, used: null, max: null }; }
  }
  function canCreate(guild, user, permissions, constants) {
    if (!guild?.id) return false;
    if (user?.id && (guild.ownerId === user.id || guild.owner_id === user.id)) return true;
    const P = constants?.Permissions ?? {};
    // Old builds used Manage Emojis; only use that alias if Create Expressions is absent.
    const create = P.CREATE_GUILD_EXPRESSIONS ?? P.MANAGE_GUILD_EXPRESSIONS ?? P.MANAGE_EMOJIS_AND_STICKERS;
    for (const permission of [create, P.ADMINISTRATOR]) {
      if (permission == null) continue;
      try { if (permissions?.can?.(permission, guild)) return true; } catch {}
    }
    return false;
  }
  async function imageData(emoji, isCurrent = () => true) {
    let oversized = false;
    for (const size of [128, 64, 32]) {
      if (!isCurrent()) throw new Error('Stealmoji was disabled.');
      const controller = env.AbortController ? new env.AbortController() : null;
      let reader, timer, expired = false;
      try {
        const operation = (async () => {
          const response = await env.fetch(url(emoji, size), controller ? { signal: controller.signal } : undefined);
          if (!response.ok) throw Object.assign(new Error(`Could not download emoji (HTTP ${response.status}).`), { status: response.status });
          const length = Number(response.headers?.get?.('content-length'));
          if (length > LIMIT) return null;
          const blob = await response.blob();
          if (expired || !isCurrent()) throw new Error('Download cancelled.');
          if (blob.size > LIMIT) return null;
          if (!blob.size) throw new Error('Discord returned an empty image.');
          if (blob.type && blob.type !== 'application/octet-stream' && !/^image\/(png|gif|webp|jpe?g|avif)(?:;|$)/i.test(blob.type)) throw new Error('Discord did not return an emoji image.');
          const data = await new Promise((resolve, reject) => {
            reader = new env.FileReader();
            const done = () => typeof reader.result === 'string' && reader.result.startsWith('data:')
              ? resolve(reader.result) : reject(new Error('Could not read emoji image.'));
            reader.onload = done;
            reader.onloadend = done;
            reader.onerror = () => reject(new Error('Could not read emoji image.'));
            reader.onabort = () => reject(new Error('Image download cancelled.'));
            reader.readAsDataURL(blob);
          });
          // Some RN builds label Blob data as application/octet-stream.
          const match = /^data:[^,]*;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(data);
          if (!match) throw new Error('Could not encode the emoji image.');
          const payload = match[1].replace(/[\r\n]/g, '');
          const bytes = payload.length * 3 / 4 - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
          if (bytes > LIMIT) return null;
          const mime = payload.startsWith('R0lGOD') ? 'image/gif' : payload.startsWith('iVBORw0KGgo') ? 'image/png'
            : payload.startsWith('/9j/') ? 'image/jpeg' : payload.startsWith('UklGR') ? 'image/webp' : null;
          if (!mime) throw new Error('Discord did not return a supported emoji image.');
          // Animated downloads must never silently become still images.
          if (emoji.animated && mime !== 'image/gif') throw new Error('Discord returned a still image for this animated emoji.');
          return `data:${mime};base64,${payload}`;
        })();
        const timeout = new Promise((_, reject) => {
          timer = env.setTimeout(() => {
            expired = true;
            try { controller?.abort(); reader?.abort(); } catch {}
            reject(new Error('Emoji download timed out. Please try again.'));
          }, 15000);
        });
        const data = await Promise.race([operation, timeout]);
        if (data) return data;
        oversized = true;
      } finally { env.clearTimeout(timer); }
    }
    throw new Error(oversized ? 'This emoji is still larger than 256 KiB at the smallest size.' : 'Could not download emoji.');
  }
  return { LIMIT, name, validName, parse, url, errorMessage, slots, canCreate, imageData };
}



function createPlugin(V, env = globalThis) {
  const { React, ReactNative: RN, constants } = V.metro.common;
  const h = React.createElement, core = createCore(env);
  const KEY = 'StealmojiPicker', ROW = 'stealmoji-actions';
  let active = false, generation = 0, pending = false, hooked = false, retryTimer, resume;
  const unpatches = [], dialogs = new Set();
  const byProps = (...keys) => { try { return V.metro.findByProps(...keys); } catch {} };
  const byStore = key => { try { return V.metro.findByStoreName(key); } catch {} };
  const toast = message => { try { V.ui?.toasts?.showToast?.(message); } catch {} };
  const host = () => byProps('openLazy', 'hideActionSheet') ?? byProps('openLazy');
  const canCreate = guild => core.canCreate(guild, byStore('UserStore')?.getCurrentUser?.(), byStore('PermissionStore'), constants);
  const slots = (guild, emoji) => core.slots(guild, emoji.animated, byStore('EmojiStore'), byProps('getMaxEmojiSlots'));
  const currentGuild = id => byStore('GuildStore')?.getGuild?.(id) ?? byStore('GuildStore')?.getGuilds?.()?.[id];
  const safe = fn => () => { if (active) Promise.resolve().then(fn).catch(error => toast(core.errorMessage(error))); };
  function colors() {
    const dark = RN.Appearance?.getColorScheme?.() !== 'light';
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
    if (active) toast('Emoji link copied.');
  }
  async function saveImage(emoji) {
    const media = byProps('downloadMediaAsset');
    if (!media?.downloadMediaAsset) throw new Error('Saving is unavailable on this build. Use Copy emoji link.');
    const result = media.downloadMediaAsset(core.url(emoji, 256), emoji.animated ? 1 : 0);
    if (result?.then) { await result; if (active) toast('Emoji saved.'); }
    else toast('Save requested. Check Downloads or Photos.');
  }
  function viewImage(emoji) {
    const media = byProps('openMediaModal');
    if (!media?.openMediaModal) throw new Error('Image viewer is unavailable. Use Save image or Copy emoji link.');
    const uri = core.url(emoji, 256);
    host()?.hideActionSheet?.(KEY);
    media.openMediaModal({ initialSources: [{ uri, sourceURI: uri, width: 256, height: 256 }], initialIndex: 0,
      originLayout: { width: 100, height: 100, x: 0, y: 0, resizeMode: 'contain' } });
  }
  async function copyImage(emoji) {
    const clipboard = V.metro.common.clipboard;
    if (!clipboard?.setImage) throw new Error('Copy image is unavailable. Use Copy emoji link.');
    const session = generation;
    const data = await core.imageData(emoji, () => active && generation === session);
    if (!active || generation !== session) return;
    await clipboard.setImage(data.split(',')[1]);
    toast('Emoji image copied.');
  }
  async function upload(emoji, guildId, name) {
    if (!active) throw new Error('Enable Stealmoji before uploading.');
    if (pending) throw new Error('An emoji upload is already in progress.');
    if (!core.validName(name)) throw new Error('Use 2–32 letters, numbers, or underscores.');
    const guild = currentGuild(guildId);
    if (!guild || !canCreate(guild)) throw new Error('You need Create Expressions permission in this server.');
    if (slots(guild, emoji).full) throw new Error('This server has no free slots for this emoji type.');
    const actions = byProps('uploadEmoji');
    if (typeof actions?.uploadEmoji !== 'function') throw new Error('Discord’s emoji upload module is unavailable.');
    const session = generation;
    pending = true;
    try {
      const data = await core.imageData(emoji, () => active && generation === session);
      if (!active || generation !== session) throw new Error('Stealmoji was disabled before upload.');
      const latest = currentGuild(guildId);
      if (!latest || !canCreate(latest)) throw new Error('Your permission to upload has changed.');
      if (slots(latest, emoji).full) throw new Error('This server has no free slots for this emoji type.');
      // Exactly one write; never retry a POST with an uncertain result.
      await actions.uploadEmoji({ guildId, name, image: data, roles: undefined });
      return `${name} added to ${latest.name}.`;
    } finally { pending = false; }
  }
  function Picker({ emojis = [], close, settings = false }) {
    const [emoji, setEmoji] = React.useState(emojis.length === 1 ? emojis[0] : null);
    const [source, setSource] = React.useState(''), [name, setName] = React.useState(emojis[0]?.name ?? 'emoji');
    const [guildId, setGuild] = React.useState(null), [search, setSearch] = React.useState('');
    const [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false), [success, setSuccess] = React.useState('');
    const [, refresh] = React.useState(0), mounted = React.useRef(true), lock = React.useRef(false);
    React.useEffect(() => {
      mounted.current = true;
      const cleanups = [];
      const changed = () => { if (mounted.current) refresh(n => n + 1); };
      for (const key of ['GuildStore', 'PermissionStore', 'EmojiStore']) {
        try { const store = byStore(key); store?.addChangeListener?.(changed); cleanups.push(() => store?.removeChangeListener?.(changed)); } catch {}
      }
      return () => { mounted.current = false; cleanups.forEach(fn => { try { fn(); } catch {} }); };
    }, []);
    const choose = next => { setEmoji(next); setName(next.name); setGuild(null); setError(''); setSuccess(''); };
    const submit = async () => {
      if (lock.current) return;
      lock.current = true; setBusy(true); setError(''); setSuccess('');
      const session = generation;
      try {
        const message = await upload(emoji, guildId, name.trim());
        if (mounted.current && active && generation === session) { setSuccess(message); setGuild(null); toast(message); }
      } catch (e) { if (mounted.current && active && generation === session) setError(core.errorMessage(e)); }
      finally { lock.current = false; if (mounted.current) setBusy(false); }
    };
    const content = [text('Stealmoji', { fontSize: 22, fontWeight: '700' })];
    if (close) content.push(button('Close', close, busy));
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
        content.push(button('View emoji', safe(() => viewImage(emoji)), busy));
        content.push(button('Copy emoji link', safe(() => copyURL(emoji)), busy));
        content.push(button('Save ' + (emoji.animated ? 'GIF' : 'image'), safe(() => saveImage(emoji)), busy));
        if (RN.Platform?.OS === 'ios' && !emoji.animated) content.push(button('Copy image', safe(() => copyImage(emoji)), busy));
        content.push(h(RN.View, { key: 'animated', style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 } },
          text('Animated emoji (GIF)'), h(RN.Switch, { value: emoji.animated, disabled: busy, accessibilityLabel: 'Animated emoji',
            onValueChange: value => setEmoji({ ...emoji, animated: value }) })));
        content.push(text('Add to server', { fontSize: 18, fontWeight: '600', marginTop: 18 }));
        content.push(input(search, setSearch, 'Search servers'));
        const guilds = Object.values(byStore('GuildStore')?.getGuilds?.() ?? {}).filter(canCreate)
          .filter(g => String(g.name ?? '').toLowerCase().includes(search.toLowerCase()))
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        if (!guilds.length) content.push(text('No matching servers. You need Create Expressions permission to add emoji.', { color: colors().muted, marginTop: 12 }));
        guilds.forEach(guild => {
          const capacity = slots(guild, emoji);
          const detail = capacity.full ? ' · No free slots' : capacity.used == null ? '' : ` · ${capacity.max - capacity.used} slots free`;
          content.push(button(guild.name + detail, () => { setGuild(guild.id); setError(''); setSuccess(''); }, capacity.full || busy, guild.id));
        });
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
      style: settings ? { flex: 1 } : { maxHeight: (RN.Dimensions?.get?.('window')?.height ?? 800) * 0.66 },
      contentContainerStyle: { padding: 20, paddingBottom: 40 } }, ...content);
  }
  function guarded(element) {
    const Boundary = V.ui?.components?.ErrorBoundary;
    return Boundary ? h(Boundary, null, element) : element;
  }
  function openPicker(emojis, fromKey) {
    if (!active) return;
    const sheetHost = host();
    let Sheet = byProps('ActionSheet')?.ActionSheet;
    if (!Sheet) { try { Sheet = V.metro.find(m => m?.render?.name === 'ActionSheet'); } catch {} }
    if (sheetHost?.openLazy && Sheet) {
      const close = () => { try { sheetHost.hideActionSheet?.(KEY); } catch {} };
      const component = () => guarded(h(Sheet, { scrollable: true }, h(Picker, { emojis, close })));
      sheetHost.hideActionSheet?.(fromKey);
      sheetHost.openLazy(Promise.resolve({ default: component }), KEY, {});
      return;
    }
    const manager = byProps('openAlert', 'dismissAlert'), alerts = byProps('AlertModal', 'AlertActions');
    if (manager?.openAlert && alerts?.AlertModal) {
      const close = () => { manager.dismissAlert(KEY); dialogs.delete(KEY); };
      dialogs.add(KEY);
      manager.openAlert(KEY, guarded(h(alerts.AlertModal, { title: 'Emoji tools', content: h(Picker, { emojis, close }) })));
      return;
    }
    toast('Open Stealmoji’s plugin settings to paste and add this emoji.');
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
    function replace(node, depth = 0) {
      if (!node || depth > 24) return node;
      if (node === best) return [...best, action(emojis, key)];
      if (Array.isArray(node)) return node.map(item => replace(item, depth + 1));
      if (node.props?.children != null) return React.cloneElement(node, { children: replace(node.props.children, depth + 1) });
      return node;
    }
    return { tree: replace(tree), done: true };
  }
  function wrapSheet(component, context, key, session) {
    const caches = Array.from({ length: 6 }, () => new WeakMap());
    let openingEmoji = resolveEmoji(context), openingEmojis = messageEmojis(context);
    const live = () => active && generation === session;
    function walk(node, props, level, depth = 0) {
      if (!node || depth > 24) return node;
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
      if (level < 5 && node.type !== RN.View && node.type !== RN.ScrollView && node.type !== RN.Text && node.type !== RN.Image) {
        const wrapped = wrap(node.type, level + 1);
        if (wrapped !== node.type) return h(wrapped, { ...next, key: node.key });
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
        if (emojis.length) {
          const changed = inject(tree, emojis, key, key !== 'MessageLongPressActionSheet');
          if (changed.done) return changed.tree;
        }
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
    active = false; generation++; hooked = false;
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

return createPlugin(vendetta);
})()
