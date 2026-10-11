// Compact fixtures preserve YouTube's 2026 wire shapes; no cookies or visitor tokens.
export const CHANNEL = 'UCqmld-BIYME2i_ooRTo1EOg';
export const OTHER_CHANNEL = 'UCxxxxxxxxxxxxxxxxxxxxxx';
export const IDS = { video: 'pPFMh1zatn0', Short: 'WykUB7f0G-A', livestream: 'k6ScFLNwtVo' };
export const DATES = { video: '2017-03-29T03:25:45-07:00', Short: '2021-12-01T04:00:28-08:00', livestream: '2023-02-17T04:50:08-08:00' };
export const config = { INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: '2.20261009.01.00', hl: 'en', gl: 'SG' } }, INNERTUBE_CONTEXT_CLIENT_NAME: 1 };
export const script = (name, value) => `var ${name} = ${JSON.stringify(value)};`;
export const html = data => `${script('ytInitialData', data)}ytcfg.set(${JSON.stringify(config)});`;
export const chip = (kind, selected = false) => ({ chipViewModel: { text: 'Oldest', selected,
  tapCommand: { innertubeCommand: { continuationCommand: { token: `oldest-${kind}`, request: 'CONTINUATION_REQUEST_TYPE_BROWSE' } } } } });
export const tile = (kind, id = IDS[kind]) => kind === 'Short'
  ? { richItemRenderer: { content: { shortsLockupViewModel: {
    overlayMetadata: { primaryText: { content: 'First Short' } },
    onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: id } } },
  } } } }
  : { richItemRenderer: { content: { lockupViewModel: { contentId: id, contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
    metadata: { lockupMetadataViewModel: { title: { content: kind === 'video' ? 'Alpha skin video' : 'First stream' } } } } } } };
export const grid = (kind, selected = false, items = []) => ({ richGridRenderer: {
  header: { chipBarViewModel: { chips: [chip(kind, selected)] } }, contents: items,
} });
export const tab = (slug, content, selected = false) => ({ tabRenderer: { selected, title: slug,
  endpoint: { commandMetadata: { webCommandMetadata: { url: `/channel/${CHANNEL}/${slug}` } } }, ...(content ? { content } : {}) } });
export const home = (selectedSlug, content, slugs = ['videos', 'shorts', 'streams']) => ({
  metadata: { channelMetadataRenderer: { externalId: CHANNEL, title: 'Mobile Legends: Bang Bang' } },
  contents: { twoColumnBrowseResultsRenderer: { tabs: slugs.map(slug => tab(slug, slug === selectedSlug ? content : null, slug === selectedSlug)) } },
});
export const sorted = (kind, items = [tile(kind)]) => ({ onResponseReceivedActions: [
  { reloadContinuationItemsCommand: { targetId: 'browse-feed-header', continuationItems: [chip(kind, true)] } },
  { reloadContinuationItemsCommand: { targetId: 'browse-feed', continuationItems: items } },
] });
export const player = (kind, overrides = {}) => ({
  videoDetails: { videoId: IDS[kind], channelId: CHANNEL, title: `First ${kind}`, author: 'Mobile Legends: Bang Bang' },
  microformat: { playerMicroformatRenderer: { externalChannelId: CHANNEL, publishDate: DATES[kind], ...overrides } },
});
export const response = body => ({ ok: true, status: 200, text: async () => body });

export function transport({ mutate = data => data, observe = () => {} } = {}) {
  return async (url, init) => {
    observe(url, init);
    if (url.includes('/watch?')) {
      const id = /[?&]v=([^&]+)/.exec(url)?.[1];
      const kind = Object.keys(IDS).find(kind => IDS[kind] === id);
      return response(script('ytInitialPlayerResponse', mutate(player(kind), 'player', kind)));
    }
    if (url.includes('/youtubei/')) {
      const body = JSON.parse(init.body);
      const kind = body.continuation?.replace('oldest-', '');
      return response(JSON.stringify(mutate(sorted(kind), 'sorted', kind)));
    }
    const slug = /\/(videos|shorts|streams)\?/.exec(url)?.[1];
    const kind = { videos: 'video', shorts: 'Short', streams: 'livestream' }[slug];
    return response(html(mutate(home(slug, kind ? grid(kind, false, [tile(kind)]) : null), 'page', kind)));
  };
}
