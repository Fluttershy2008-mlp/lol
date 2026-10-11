const YT_ORIGIN = 'https://www.youtube.com';
const YT_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const YT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Keep parsing independent of React Native's incomplete URL implementation.
export function parseYouTubeLink(input) {
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

export function findYouTubeLinks(...sources) {
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

export function ytWalk(value, visit, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 80) return;
  if (visit(value) === false) return;
  for (const child of Object.values(value)) ytWalk(child, visit, depth + 1);
}

export function ytText(value) {
  if (typeof value === 'string') return value;
  return value?.content ?? value?.simpleText ?? value?.runs?.map(run => run.text ?? '').join('') ?? '';
}

// Read a balanced object instead of using a greedy regexp across adjacent scripts.
export function readScriptJSON(html, marker) {
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

export function channelTabs(data) {
  const tabs = [];
  ytWalk(data?.contents, node => {
    const tab = node.tabRenderer ?? node.expandableTabRenderer;
    if (tab) { tabs.push(tab); return false; }
  });
  return tabs;
}

export function tabSlug(tab) {
  const url = tab?.endpoint?.commandMetadata?.webCommandMetadata?.url ?? '';
  return url.split(/[?#]/)[0].split('/').pop();
}

export function feedRoots(data) {
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

export function oldestControl(roots) {
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

export function feedVideos(roots) {
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

export function feedContinuation(roots) {
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

export function createYouTubeResolver(fetchFn, { timeout = 20000 } = {}) {
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
