(() => {
'use strict';
const YT_ORIGIN = 'https://www.youtube.com';
const YT_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const YT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Keep parsing independent of React Native's incomplete URL implementation.
function parseYouTubeLink(input) {
  let value = String(input ?? '').trim().replace(/^<|>$/g, '');
  if (/^@[^\s/?#]+$/.test(value)) value = `${YT_ORIGIN}/${value}`;
  if (/^(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be)\//i.test(value)) value = `https://${value}`;
  const match = /^https?:\/\/((?:(?:www|m|music)\.)?youtube\.com|youtu\.be)\/(.*)$/i.exec(value);
  if (!match) throw new Error('Paste a YouTube channel or video link, or an @handle.');
  const host = match[1].toLowerCase();
  const rawPath = match[2].split(/[?#]/)[0].replace(/\/+$/, '');
  let path;
  try { path = decodeURIComponent(rawPath); } catch { throw new Error('This YouTube link is malformed.'); }
  const parts = path.split('/');
  let id;
  if (host === 'youtu.be') id = parts.length === 1 ? parts[0] : null;
  else if (parts[0] === 'watch') {
    const query = match[2].split('?')[1]?.split('#')[0] ?? '';
    const video = /(?:^|&)v=([^&]+)/.exec(query);
    try { id = video ? decodeURIComponent(video[1]) : null; } catch { id = null; }
  } else if (['shorts', 'live', 'embed'].includes(parts[0]) && parts.length === 2) id = parts[1];
  if (YT_VIDEO_ID.test(id ?? '')) return { kind: 'video', id, url: `${YT_ORIGIN}/watch?v=${id}` };
  const allowedSuffix = parts.length === 1 || (parts.length === 2 && ['videos', 'shorts', 'streams', 'featured', 'playlists', 'about', 'community', 'posts'].includes(parts[1]));
  if (parts[0]?.startsWith('@') && parts[0].length > 1 && allowedSuffix && !/[\s\\<>]/.test(parts[0])) {
    const channel = `@${encodeURIComponent(parts[0].slice(1))}`;
    return { kind: 'channel', url: `${YT_ORIGIN}/${channel}` };
  }
  if (['channel', 'user', 'c'].includes(parts[0]) && parts[1] && parts.length <= 3
      && (parts.length === 2 || ['videos', 'shorts', 'streams', 'featured', 'playlists', 'about', 'community', 'posts'].includes(parts[2]))
      && !/[\s\\<>]/.test(parts[1]) && (parts[0] !== 'channel' || YT_CHANNEL_ID.test(parts[1]))) {
    return { kind: 'channel', url: `${YT_ORIGIN}/${parts[0]}/${encodeURIComponent(parts[1])}` };
  }
  throw new Error('Use a channel, @handle, or video link. Playlist and search links are not supported.');
}

function findYouTubeLinks(...sources) {
  const links = new Map();
  for (const source of sources) {
    if (typeof source !== 'string') continue;
    const candidates = [...source.matchAll(/(?:^|[\s<(\[`])((?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"`]+)/gi)].map(match => match[1]);
    for (const candidate of candidates) {
      try {
        const link = parseYouTubeLink(candidate.replace(/[.,!;)\]]+$/, ''));
        links.set(link.url, link);
      } catch {}
    }
  }
  return [...links.values()].slice(0, 10);
}

function ytWalk(value, visit, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 80) return;
  if (visit(value) === false) return;
  for (const child of Object.values(value)) ytWalk(child, visit, depth + 1);
}

function ytText(value) {
  if (typeof value === 'string') return value;
  return value?.content ?? value?.simpleText ?? value?.runs?.map(run => run.text ?? '').join('') ?? '';
}

// Read a balanced object instead of using a greedy regexp across adjacent scripts.
function readScriptJSON(html, marker) {
  const patterns = marker === 'ytcfg'
    ? [/ytcfg\.set\(\s*/g]
    : [new RegExp(`(?:var\\s+${marker}\\s*=|window\\["${marker}"\\]\\s*=|${marker}\\s*=)\\s*`, 'g')];
  let result = null;
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      const start = match.index + match[0].length;
      if (html[start] !== '{') continue;
      let braces = 0, quoted = false, escaped = false;
      for (let i = start; i < html.length; i++) {
        const ch = html[i];
        if (quoted) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') quoted = false;
        } else if (ch === '"') quoted = true;
        else if (ch === '{') braces++;
        else if (ch === '}' && --braces === 0) {
          try {
            const parsed = JSON.parse(html.slice(start, i + 1));
            if (marker !== 'ytcfg') return parsed;
            result = { ...result, ...parsed };
          } catch {}
          break;
        }
      }
    }
  }
  return result;
}

function channelTabs(data) {
  const tabs = [];
  ytWalk(data?.contents, node => {
    const tab = node.tabRenderer ?? node.expandableTabRenderer;
    if (tab) { tabs.push(tab); return false; }
  });
  return tabs;
}

function tabSlug(tab) {
  const url = tab?.endpoint?.commandMetadata?.webCommandMetadata?.url ?? '';
  return url.split(/[?#]/)[0].split('/').pop();
}

function feedRoots(data) {
  const selected = channelTabs(data).find(tab => tab.selected);
  if (selected) return selected.content ? [selected.content] : [];
  const roots = [];
  for (const key of ['onResponseReceivedActions', 'onResponseReceivedEndpoints', 'onResponseReceivedCommands']) {
    for (const action of data?.[key] ?? []) {
      const command = action.reloadContinuationItemsCommand ?? action.appendContinuationItemsAction;
      if (command?.continuationItems) roots.push(command.continuationItems);
    }
  }
  if (data?.continuationContents) roots.push(data.continuationContents);
  return roots;
}

function commandPayload(value) {
  let payload;
  ytWalk(value, node => {
    if (payload) return false;
    if (node.continuationCommand?.token) { payload = { continuation: node.continuationCommand.token }; return false; }
    if (node.browseEndpoint?.browseId) {
      payload = { browseId: node.browseEndpoint.browseId,
        ...(node.browseEndpoint.params ? { params: node.browseEndpoint.params } : {}) };
      return false;
    }
  });
  return payload;
}

function oldestControl(roots) {
  let control;
  for (const root of roots) ytWalk(root, node => {
    const item = node.chipViewModel ?? node.chipCloudChipRenderer ?? node.listItemViewModel;
    const legacy = node.title && (node.serviceEndpoint || node.continuation) ? node : null;
    const entry = item ?? legacy;
    if (!entry || !/^(?:oldest|date added \(oldest\))$/i.test(ytText(entry.text ?? entry.title).trim())) return;
    const endpoint = entry.tapCommand ?? entry.navigationEndpoint ?? entry.serviceEndpoint
      ?? entry.rendererContext?.commandContext?.onTap ?? entry;
    control = { selected: entry.selected === true || entry.isSelected === true, payload: commandPayload(endpoint) };
    return false;
  });
  return control;
}

function feedVideos(roots) {
  const found = new Map();
  for (const root of roots) ytWalk(root, node => {
    const video = node.videoRenderer ?? node.gridVideoRenderer ?? node.playlistVideoRenderer ?? node.reelItemRenderer;
    const lockup = node.lockupViewModel;
    const short = node.shortsLockupViewModel ?? node.shortsLockupViewModelV2;
    const row = video ?? lockup ?? short;
    if (!row) return;
    if (lockup && lockup.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return false;
    let id = row.videoId ?? row.contentId;
    if (short && !id) ytWalk(short, child => {
      if (child.reelWatchEndpoint?.videoId) { id = child.reelWatchEndpoint.videoId; return false; }
    });
    if (YT_VIDEO_ID.test(id ?? '')) {
      const title = ytText(row.title ?? row.metadata?.lockupMetadataViewModel?.title ?? row.overlayMetadata?.primaryText);
      let ongoing = false;
      ytWalk(row, child => {
        if (child.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE' || child.upcomingEventData
          || /^(?:LIVE|UPCOMING)$/.test(child.thumbnailBadgeViewModel?.text ?? '')) ongoing = true;
      });
      if (!found.has(id)) found.set(id, { id, title, ongoing });
    }
    // Menu actions inside a tile can reference unrelated videos.
    return false;
  });
  return [...found.values()];
}

function feedContinuation(roots) {
  let token;
  for (const root of roots) ytWalk(root, node => {
    if (node.continuationItemRenderer) {
      token ??= commandPayload(node.continuationItemRenderer.continuationEndpoint)?.continuation;
      return false;
    }
    if (node.nextContinuationData?.continuation) token ??= node.nextContinuationData.continuation;
    // Filter buttons have continuation tokens too; they are not pagination.
    if (node.chipBarViewModel || node.chipCloudRenderer || node.feedFilterChipBarRenderer) return false;
  });
  return token;
}

function ytCancellation(signal) {
  if (signal?.aborted) { const error = new Error('Search cancelled.'); error.name = 'AbortError'; throw error; }
}

function createYouTubeResolver(fetchFn, { timeout = 20000 } = {}) {
  if (typeof fetchFn !== 'function') throw new Error('Network requests are unavailable on this Discord build.');
  async function request(url, init, signal) {
    ytCancellation(signal);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer, cancel;
    try {
      const stop = new Promise((_, reject) => {
        cancel = () => { controller?.abort(); const e = new Error('Search cancelled.'); e.name = 'AbortError'; reject(e); };
        signal?.addEventListener?.('abort', cancel, { once: true });
        timer = setTimeout(() => { controller?.abort(); reject(new Error('YouTube took too long to respond. Try again.')); }, timeout);
      });
      const work = (async () => {
        const response = await fetchFn(url, {
          ...init, headers: { 'User-Agent': YT_UA, 'Accept-Language': 'en-US,en;q=0.9', ...init?.headers },
          credentials: 'omit', ...(controller ? { signal: controller.signal } : {}),
        });
        if (!response.ok) throw new Error(response.status === 429
          ? 'YouTube is limiting requests. Wait a little and try again.'
          : `YouTube returned HTTP ${response.status}. Try again later.`);
        const text = await response.text();
        if (text.length > 15000000) throw new Error('YouTube returned an unexpectedly large page.');
        return text;
      })();
      const result = await Promise.race([work, stop]);
      ytCancellation(signal);
      return result;
    } finally { clearTimeout(timer); signal?.removeEventListener?.('abort', cancel); }
  }

  async function page(url, signal) {
    const html = await request(`${url}${url.includes('?') ? '&' : '?'}hl=en&gl=SG`, {}, signal);
    const data = readScriptJSON(html, 'ytInitialData');
    if (!data) throw new Error('YouTube did not return channel data. A consent page or network restriction may be blocking it.');
    const cfg = readScriptJSON(html, 'ytcfg') ?? {};
    const client = cfg.INNERTUBE_CONTEXT?.client;
    if (!client?.clientVersion) throw new Error('YouTube changed its channel page. Please check for a plugin update.');
    return { data, client: { clientName: client.clientName ?? 'WEB', clientVersion: client.clientVersion,
      hl: 'en', gl: 'SG', ...(client.visitorData ? { visitorData: client.visitorData } : {}) },
    clientID: String(cfg.INNERTUBE_CONTEXT_CLIENT_NAME ?? 1), html };
  }

  async function browse(payload, session, signal) {
    const text = await request(`${YT_ORIGIN}/youtubei/v1/browse?prettyPrint=false`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YouTube-Client-Name': session.clientID,
        'X-YouTube-Client-Version': session.client.clientVersion },
      body: JSON.stringify({ context: { client: session.client }, ...payload }),
    }, signal);
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('YouTube returned an unreadable response. Try again.'); }
    if (data.error) throw new Error('YouTube could not sort this channel. Try again later.');
    return data;
  }

  async function videoDetails(video, signal) {
    const html = await request(`${YT_ORIGIN}/watch?v=${video.id}&hl=en`, {}, signal);
    const player = readScriptJSON(html, 'ytInitialPlayerResponse');
    const micro = player?.microformat?.playerMicroformatRenderer;
    const details = player?.videoDetails;
    const channelID = details?.channelId ?? micro?.externalChannelId;
    let published = micro?.publishDate;
    if (!published) {
      const date = /<meta\s+itemprop="datePublished"\s+content="([^"]+)"/i.exec(html);
      published = date?.[1];
    }
    if (!YT_CHANNEL_ID.test(channelID ?? '')) throw new Error('Could not confirm the video’s channel. It may be unavailable.');
    const live = micro?.liveBroadcastDetails;
    if (details?.isLiveNow || details?.isUpcoming || (live?.isLiveNow) || (live?.startTimestamp && !live.endTimestamp)) return { ongoing: true, channelID };
    const timestamp = Date.parse(published ?? '');
    if (!Number.isFinite(timestamp)) throw new Error('Could not confirm an upload date. YouTube may be blocking this video.');
    return { id: video.id, title: details?.title || video.title || ytText(micro?.title) || 'YouTube video',
      channelID, channel: details?.author ?? micro?.ownerChannelName ?? '', timestamp,
      date: new Date(timestamp).toISOString().slice(0, 10),
      url: `${YT_ORIGIN}/watch?v=${video.id}`, thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` };
  }

  async function tabOldest(tab, session, channelID, kind, signal, progress) {
    let roots = tab?.content ? [tab.content] : [];
    let videos = feedVideos(roots);
    const hadCompletedTiles = videos.some(video => !video.ongoing);
    const oldest = oldestControl(roots);
    let ordered = false;
    if (oldest) {
      if (oldest.selected) ordered = true;
      else if (oldest.payload) {
        roots = feedRoots(await browse(oldest.payload, session, signal));
        if (!roots.length) throw new Error(`YouTube did not return its oldest ${kind}.`);
        ordered = true;
      }
    }
    if (!ordered && feedContinuation(roots)) {
      throw new Error(`YouTube did not offer an Oldest filter for this channel’s ${kind}. The first upload could not be confirmed.`);
    }
    let pages = 0;
    const seenTokens = new Set();
    const seenVideos = new Set();
    const candidates = [];
    while (true) {
      ytCancellation(signal);
      videos = feedVideos(roots);
      for (const video of videos) {
        if (video.ongoing || seenVideos.has(video.id)) continue;
        seenVideos.add(video.id);
        progress(`Checking oldest ${kind}…`);
        const details = await videoDetails(video, signal);
        if (details.channelID !== channelID) throw new Error('YouTube returned a video from another channel. Search stopped.');
        if (details.ongoing) continue;
        candidates.push({ ...details, kind });
        if (ordered) return candidates[0];
      }
      const token = feedContinuation(roots);
      if (!token) break;
      // Without an Oldest control we cannot claim a partial feed is the first upload.
      if (!ordered) throw new Error(`YouTube did not offer an Oldest filter for this channel’s ${kind}. The first upload could not be confirmed.`);
      if (++pages > 5 || seenTokens.has(token)) throw new Error(`Could not find a completed public upload in this channel’s oldest ${kind}.`);
      seenTokens.add(token);
      roots = feedRoots(await browse({ continuation: token }, session, signal));
      if (!roots.length) throw new Error('YouTube pagination changed. Please check for a plugin update.');
    }
    if (!candidates.length && hadCompletedTiles) {
      throw new Error(`YouTube returned an empty oldest ${kind} feed even though the channel has public uploads. The first upload could not be confirmed.`);
    }
    return candidates.sort((a, b) => a.timestamp - b.timestamp)[0] ?? null;
  }

  async function lookup(input, { signal, progress = () => {} } = {}) {
    const link = parseYouTubeLink(input);
    progress('Finding the channel…');
    let channelURL = link.url;
    if (link.kind === 'video') {
      const video = await videoDetails(link, signal);
      channelURL = `${YT_ORIGIN}/channel/${video.channelID}`;
    }
    const home = await page(channelURL, signal);
    let metadata;
    ytWalk(home.data.metadata, node => { if (node.channelMetadataRenderer) metadata = node.channelMetadataRenderer; });
    const channelID = metadata?.externalId;
    if (!YT_CHANNEL_ID.test(channelID ?? '')) throw new Error('Could not find this YouTube channel. Check the handle or link.');
    const tabs = channelTabs(home.data);
    const supported = [['videos', 'video'], ['shorts', 'Short'], ['streams', 'livestream']];
    const candidates = [];
    const checked = [];
    for (const [slug, kind] of supported) {
      const tab = tabs.find(item => tabSlug(item) === slug);
      if (!tab) continue;
      progress(`Sorting ${slug === 'streams' ? 'past livestreams' : slug} by oldest…`);
      let session = home, selected = tab;
      if (!tab.selected || !tab.content) {
        session = await page(`${YT_ORIGIN}/channel/${channelID}/${slug}`, signal);
        selected = channelTabs(session.data).find(item => item.selected && tabSlug(item) === slug);
        if (!selected) throw new Error(`YouTube did not load the channel’s ${slug} tab. The oldest upload could not be confirmed.`);
      }
      const result = await tabOldest(selected, session, channelID, kind, signal, progress);
      checked.push(slug);
      if (result) candidates.push(result);
    }
    if (!checked.length || !candidates.length) throw new Error('This channel has no available public videos, Shorts, or completed livestreams.');
    candidates.sort((a, b) => a.timestamp - b.timestamp);
    ytCancellation(signal);
    return { ...candidates[0], channel: metadata.title || candidates[0].channel,
      channelURL: `${YT_ORIGIN}/channel/${channelID}`, checked, searchedAt: Date.now() };
  }
  return { lookup };
}

function createPlugin(V, host = globalThis) {
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

return createPlugin(vendetta);
})()
