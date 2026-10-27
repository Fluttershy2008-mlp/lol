export function assetUrl(path: string, hash?: string | null, size = 128) {
  return hash ? `https://cdn.discordapp.com/${path}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=${size}` : undefined;
}
export function normalizeGuild(id: string, cached?: any, fetched?: any) {
  if (!cached?.name && !fetched?.name) return undefined;
  const guild = { ...cached, ...fetched, id };
  const aliases: Record<string, string> = {
    ownerId: "owner_id", memberCount: "approximate_member_count", onlineCount: "approximate_presence_count",
    premiumTier: "premium_tier", premiumSubscriptionCount: "premium_subscription_count",
  };
  for (const [key, snake] of Object.entries(aliases)) guild[key] = fetched?.[snake] ?? fetched?.[key] ?? cached?.[key] ?? cached?.[snake];
  guild.premiumSubscriptionCount ??= cached?.premiumSubscriberCount;
  return guild;
}
/** Count unique guild channels, including categories, but not threads or list metadata. */
export function countChannels(value: any, guildId?: string): number | undefined {
  if (value == null) return undefined;
  const ids = new Set<string>();
  const seen = new Set<any>();
  const guildTypes = new Set([0, 2, 4, 5, 13, 14, 15, 16]);
  function walk(node: any) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    const owner = node.guild_id ?? node.guildId;
    if (typeof node.id === "string" && guildTypes.has(node.type)
      && (!guildId || owner == null || owner === guildId)) ids.add(node.id);
    // Containers can have their own ID, or a category channel plus child channels.
    // Neither should terminate traversal of the remaining list.
    for (const child of node instanceof Map ? node.values() : Object.values(node)) walk(child);
  }
  walk(value);
  return ids.size;
}
export function creationLabel(id: string) {
  try {
    return new Date(Number((BigInt(id) >> 22n) + 1420070400000n)).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return undefined; }
}
