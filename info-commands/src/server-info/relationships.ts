import { runtime } from "./runtime";
import { assetUrl } from "./data";
import { watchStores } from "./store-refresh";
import { getGuildMemberStore, getPresenceStore, getRelationshipStore, getRequestMembersById, getUserStore } from "./modules";

export const relationshipTabs = ["Friends", "Blocked", "Ignored"] as const;
export type RelationshipTab = typeof relationshipTabs[number];

const requestBatchSize = 100;
const waitBetweenBatches = 300;
const cacheWait = 4000;
const statuses: Record<string, string> = {
  online: "Online", idle: "Idle", dnd: "Do Not Disturb", offline: "Offline",
};

function optional(fn: () => any) { try { return fn(); } catch { return undefined; } }

function getIds(store: any, tab: RelationshipTab): string[] | undefined {
  const method = tab === "Friends" ? "getFriend" : tab === "Blocked" ? "getBlocked" : "getIgnored";
  const direct = optional(() => store?.[method + "IDs"]?.()) ?? optional(() => store?.[method + "Ids"]?.());
  if (Array.isArray(direct) || direct instanceof Set) return uniqueIds([...direct]);
  const relationships = optional(() => store?.getRelationships?.() ?? store?.getMutableRelationships?.());
  if (!relationships || typeof relationships !== "object") return;
  const entries = relationships instanceof Map ? [...relationships] : Object.entries(relationships);
  const predicate = tab === "Friends" ? "isFriend" : tab === "Blocked" ? "isBlocked" : "isIgnored";
  const hasPredicate = typeof store[predicate] === "function";
  if (!hasPredicate && tab === "Ignored") return;
  return uniqueIds(entries.filter(([id, value]) => hasPredicate
    ? optional(() => store[predicate](id)) === true
    : Number(value?.type ?? value) === (tab === "Friends" ? 1 : 2)).map(([id]) => id));
}

function uniqueIds(ids: unknown[]) {
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && /^\d{5,22}$/.test(id)))];
}

export function useServerRelationships(guildId: string, tab: RelationshipTab | undefined, canRequest: () => boolean) {
  const { React } = runtime.react;
  const [revision, redraw] = React.useReducer((value: number) => value + 1, 0);
  const [relationshipRevision, refreshRelationships] = React.useReducer((value: number) => value + 1, 0);
  const lookup = React.useRef(new Set<string>()).current;
  const [pending, setPending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const members = getGuildMemberStore();
  const relationships = getRelationshipStore();
  const users = getUserStore();
  const presence = tab ? getPresenceStore() : undefined;
  const ids = React.useMemo(() => tab && getIds(relationships, tab), [tab, relationships, relationshipRevision]);
  // Store changes can replace an array with the same contents.
  const key = React.useMemo(() => ids ? ids.join(",") : "", [ids]);
  const getMember = React.useCallback((id: string) => optional(() => members?.getMember?.(guildId, id)), [members, guildId]);

  React.useEffect(() => {
    if (!tab) return;
    const stopRelationships = watchStores([relationships], () => { if (canRequest()) refreshRelationships(); });
    const stopMembers = watchStores([members, users, presence], () => { if (canRequest()) redraw(); });
    return () => { stopRelationships(); stopMembers(); };
  }, [tab, relationships, members, users, presence, redraw, refreshRelationships, canRequest]);

  React.useEffect(() => {
    setPending(false);
    setFailed(false);
    if (!tab || !key || !members) return;
    const request = getRequestMembersById();
    const dispatcher = optional(() => vendetta.metro.common.FluxDispatcher);
    if (!request && typeof dispatcher?.dispatch !== "function") return;
    const missing = key.split(",").filter(id => !getMember(id) && optional(() => members.isMember?.(guildId, id)) !== true && !lookup.has(id));
    if (!missing.length) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let index = 0;
    function failedBatch(batch: string[]) {
      for (const id of batch) lookup.delete(id);
      if (!stopped) setFailed(true);
    }
    setPending(true);
    function sendBatch() {
      if (stopped || !canRequest()) return;
      const batch = missing.slice(index, index + requestBatchSize).filter(id => !getMember(id));
      index += requestBatchSize;
      for (const id of batch) lookup.add(id);
      if (batch.length) {
        try {
          const result = request ? request(guildId, batch, false)
            : dispatcher.dispatch({ type: "GUILD_MEMBERS_REQUEST", guildIds: [guildId], userIds: batch });
          Promise.resolve(result).catch(() => failedBatch(batch));
        } catch {
          failedBatch(batch);
        }
      }
      timer = index < missing.length ? setTimeout(sendBatch, waitBetweenBatches)
        : setTimeout(() => setPending(false), cacheWait);
    }
    sendBatch();
    return () => { stopped = true; clearTimeout(timer); };
  }, [guildId, tab, key, members, lookup, canRequest, getMember]);

  const rows = React.useMemo(() => (ids || []).flatMap(userId => {
    const member = getMember(userId);
    if (!member && optional(() => members?.isMember?.(guildId, userId)) !== true) return [];
    const user = optional(() => users?.getUser?.(userId)) ?? member?.user;
    const name = user?.globalName ?? user?.global_name ?? user?.username ?? userId;
    const label = member?.nick && member.nick !== name ? `${member.nick} (${name})` : name;
    const avatar = assetUrl(`guilds/${guildId}/users/${userId}/avatars`, member?.avatar, 64, false)
      ?? assetUrl(`avatars/${userId}`, user?.avatar, 64, false);
    const status = optional(() => presence?.getStatus?.(userId));
    return [{ userId, label, avatar, status: typeof status === "string" ? statuses[status] : undefined }];
  }), [ids, revision, users, presence, members, guildId, getMember]);
  return { rows, pending, failed, available: Boolean(ids && (typeof members?.getMember === "function" || typeof members?.isMember === "function")) };
}
