/** Data hook adapted from the supplied Server Info 1.2.2 implementation. */
import { runtime } from "../runtime";
import { assetUrl, normalizeGuild, countChannels, creationLabel } from "../data";
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

export function useGuildInfo(guildId: string): GuildInfo {
  const { React } = runtime.react;
  const forceUpdate = runtime.utils.react.useReRender();
  const [remoteGuild, setRemoteGuild] = React.useState<any>(null);
  const [pending, setPending] = React.useState(true);
  const [ownerUser, setOwnerUser] = React.useState<any>(null);
  const [friendsPending, setFriendsPending] = React.useState(false);
  const guild = normalizeGuild(guildId, optional(() => cachedGuild(guildId)), remoteGuild);

  React.useEffect(() => {
    const stores = [getGuildStore(), getBasicGuildStore(), getUserStore(), getGuildRoleStore(),
      getGuildChannelStore(), getGuildMemberCountStore(), getGuildHeaderCountsStore(),
      getGuildMemberStore(), getRelationshipStore()].filter(Boolean);
    const distinct = [...new Set(stores)];
    for (const store of distinct) optional(() => store.addChangeListener?.(forceUpdate));
    return () => { for (const store of distinct) optional(() => store.removeChangeListener?.(forceUpdate)); };
  }, [guildId, forceUpdate]);

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
    const ids = getRelationshipStore()?.getFriendIDs?.() ?? [];
    const request = getRequestMembersById();
    if (!ids.length || !request) return;
    setFriendsPending(true);
    optional(() => request(guildId, ids, false));
    const timer = setTimeout(() => setFriendsPending(false), 1500);
    return () => clearTimeout(timer);
  }, [guildId]);

  const userStore = getUserStore();
  const memberStore = getGuildMemberStore();
  const owner = ownerId ? userStore?.getUser?.(ownerId) ?? ownerUser : null;
  const friendIds: string[] = getRelationshipStore()?.getFriendIDs?.() ?? [];
  const friends = friendIds.filter(id => memberStore?.getMember?.(guildId, id) != null).map(id => {
    const user = userStore?.getUser?.(id);
    return { userId: id, displayName: user?.globalName ?? user?.global_name ?? user?.username ?? "Unknown",
      avatarHash: user?.avatar, nick: memberStore?.getMember?.(guildId, id)?.nick };
  });
  const channelStore = getGuildChannelStore();
  const boostCount = guild?.premiumSubscriptionCount;
  return {
    guild, isLoading: !guild && pending,
    error: !guild && !pending ? "Server details are unavailable. Try again later." : null,
    cachedOnly: !pending && !remoteGuild,
    ownerId,
    ownerDisplayName: owner?.globalName ?? owner?.global_name ?? owner?.username ?? ownerId,
    ownerAvatarUri: assetUrl(`avatars/${ownerId}`, owner?.avatar, 64),
    iconUri: assetUrl(`icons/${guildId}`, guild?.icon, 128),
    bannerUri: assetUrl(`banners/${guildId}`, guild?.banner, 1024),
    memberCount: getGuildMemberCountStore()?.getMemberCount?.(guildId) ?? guild?.memberCount,
    onlineCount: getGuildHeaderCountsStore()?.getOnlineCount?.(guildId) ?? guild?.onlineCount,
    roleCount: getGuildRoleStore()?.getSortedRoles?.(guildId)?.length ?? (guild?.roles ? Object.keys(guild.roles).length : undefined),
    channelCount: countChannels(optional(() => channelStore?.getChannels?.(guildId))),
    boostLabel: boostCount != null ? `${boostCount.toLocaleString()} boost${boostCount === 1 ? "" : "s"}` : undefined,
    premiumTier: guild?.premiumTier ?? 0,
    createdLabel: guild ? creationLabel(guildId) : undefined,
    friends,
    friendsPending,
  };
}
