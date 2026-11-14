/** Data hook adapted from the supplied Server Info 1.2.2 implementation. */
import { runtime } from "../runtime";
import { watchStores } from "../store-refresh";
import { assetUrl, normalizeGuild, countChannels, countRoles, creationLabel } from "../data";
import {
  getBasicGuildStore, getGuildChannelStore, getGuildHeaderCountsStore,
  getGuildMemberCountStore, getGuildMemberStore, getGuildRoleStore,
  getGuildStore, getHTTPUtils, getRelationshipStore, getRequestMembersById, getUserStore,
} from "../modules";

export interface GuildInfo {
  guild: any; isLoading: boolean; error: string | null; cachedOnly: boolean;
  ownerId: string | null; ownerDisplayName: string | null; ownerAvatarUri?: string;
  iconUri?: string; bannerUri?: string; memberCount?: number; onlineCount?: number;
  roleCount?: number; channelCount?: number; boostLabel?: string; premiumTier: number;
  createdLabel?: string;
  friendsPending: boolean;
  friends: Array<{ userId: string; displayName: string; avatarHash?: string; nick?: string }>;
}
function cachedGuild(id: string) {
  return getGuildStore()?.getGuild?.(id) ?? getBasicGuildStore()?.getGuild?.(id);
}
function optional(fn: () => any) { try { return fn(); } catch { return undefined; } }

function readChannelCount(store: any, guildId: string) {
  const channels = optional(() => store?.getMutableGuildChannelsForGuild?.(guildId));
  const grouped = optional(() => store?.getChannels?.(guildId));
  return channels == null && grouped == null ? undefined : countChannels([channels, grouped], guildId);
}

export function useGuildInfo(guildId: string, page?: { showOverview: boolean; canRefresh(): boolean }): GuildInfo {
  const showOverview = page?.showOverview ?? true;
  const canRefresh = page?.canRefresh;
  const loadFriends = !page;
  const { React } = runtime.react;
  const forceUpdate = runtime.utils.react.useReRender();
  const [remoteGuild, setRemoteGuild] = React.useState<any>(null);
  const [pending, setPending] = React.useState(true);
  const [ownerUser, setOwnerUser] = React.useState<any>(null);
  const [friendsPending, setFriendsPending] = React.useState(false);
  const guild = normalizeGuild(guildId, optional(() => cachedGuild(guildId)), remoteGuild);

  const channelStore = showOverview ? getGuildChannelStore() : undefined;
  const [channelCount, setChannelCount] = React.useState<number | undefined>(undefined);
  React.useEffect(() => {
    const guildStores = [getGuildStore(), getBasicGuildStore()];
    const overviewStores = showOverview ? [getUserStore(), getGuildRoleStore(), getGuildMemberCountStore(),
      getGuildHeaderCountsStore(), getGuildMemberStore()] : [];
    const stores = [...guildStores, ...overviewStores];
    if (!loadFriends) return watchStores(stores, () => { if (canRefresh?.()) forceUpdate(); });
    const distinct = [...new Set([...stores, channelStore, getRelationshipStore()])].filter(Boolean);
    for (const store of distinct) optional(() => store.addChangeListener?.(forceUpdate));
    return () => { for (const store of distinct) optional(() => store.removeChangeListener?.(forceUpdate)); };
  }, [guildId, forceUpdate, loadFriends, showOverview, channelStore, canRefresh]);

  React.useEffect(() => {
    if (loadFriends || !channelStore) return;
    const update = () => { if (canRefresh?.()) setChannelCount(readChannelCount(channelStore, guildId)); };
    const cleanup = watchStores([channelStore], update);
    update();
    return cleanup;
  }, [guildId, loadFriends, channelStore, canRefresh]);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setPending(true);
    const http = getHTTPUtils();
    const request = Promise.resolve().then(() => http?.get(`/guilds/${guildId}?with_counts=true`));
    Promise.race([request, new Promise(resolve => { timer = setTimeout(() => resolve(null), 8000); })])
      .then((response: any) => { if (!cancelled) setRemoteGuild(response?.body ?? null); })
      .catch(() => { if (!cancelled) setRemoteGuild(null); })
      .finally(() => { clearTimeout(timer); if (!cancelled) setPending(false); });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [guildId]);

  const ownerId = guild?.ownerId ?? null;
  React.useEffect(() => {
    let cancelled = false;
    setOwnerUser(null);
    if (!ownerId) return;
    const cached = getUserStore()?.getUser?.(ownerId);
    if (cached?.username || cached?.globalName) { setOwnerUser(cached); return; }
    Promise.resolve().then(() => getHTTPUtils()?.get(`/users/${ownerId}`))
      .then((response: any) => { if (!cancelled) setOwnerUser(response?.body ?? null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [ownerId]);

  React.useEffect(() => {
    if (!loadFriends) return;
    const ids = getRelationshipStore()?.getFriendIDs?.() ?? [];
    const request = getRequestMembersById();
    if (!ids.length || !request) return;
    setFriendsPending(true);
    optional(() => request(guildId, ids, false));
    const timer = setTimeout(() => setFriendsPending(false), 1500);
    return () => clearTimeout(timer);
  }, [guildId, loadFriends]);

  const userStore = showOverview ? getUserStore() : undefined;
  const memberStore = showOverview ? getGuildMemberStore() : undefined;
  const owner = ownerId ? userStore?.getUser?.(ownerId) ?? ownerUser : null;
  const friendIds: string[] = loadFriends ? getRelationshipStore()?.getFriendIDs?.() ?? [] : [];
  const friends = friendIds.filter(id => memberStore?.getMember?.(guildId, id) != null).map(id => {
    const user = userStore?.getUser?.(id);
    return { userId: id, displayName: user?.globalName ?? user?.global_name ?? user?.username ?? "Unknown",
      avatarHash: user?.avatar, nick: memberStore?.getMember?.(guildId, id)?.nick };
  });
  const boostCount = guild?.premiumSubscriptionCount;
  return {
    guild, isLoading: !guild && pending,
    error: !guild && !pending ? "Server details are unavailable. Try again later." : null,
    cachedOnly: !pending && !remoteGuild,
    ownerId,
    ownerDisplayName: owner?.globalName ?? owner?.global_name ?? owner?.username ?? ownerId,
    ownerAvatarUri: assetUrl(`guilds/${guildId}/users/${ownerId}/avatars`,
      optional(() => memberStore?.getMember?.(guildId, ownerId)?.avatar), 64, loadFriends)
      ?? assetUrl(`avatars/${ownerId}`, owner?.avatar, 64, loadFriends),
    iconUri: assetUrl(`icons/${guildId}`, guild?.icon, 128, loadFriends),
    bannerUri: assetUrl(`banners/${guildId}`, guild?.banner, loadFriends ? 1024 : 512, loadFriends),
    memberCount: showOverview ? optional(() => getGuildMemberCountStore()?.getMemberCount?.(guildId)) ?? guild?.memberCount : undefined,
    onlineCount: showOverview ? optional(() => getGuildHeaderCountsStore()?.getOnlineCount?.(guildId)) ?? guild?.onlineCount : undefined,
    roleCount: showOverview ? countRoles(optional(() => getGuildRoleStore()?.getSortedRoles?.(guildId)), guildId)
      ?? countRoles(guild?.roles, guildId) : undefined,
    channelCount: loadFriends ? readChannelCount(channelStore, guildId) : channelStore ? channelCount : undefined,
    boostLabel: boostCount != null ? `${boostCount.toLocaleString()} boost${boostCount === 1 ? "" : "s"}` : undefined,
    premiumTier: guild?.premiumTier ?? 0,
    createdLabel: guild ? creationLabel(guildId) : undefined,
    friends,
    friendsPending,
  };
}
