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
export function countChannels(value: any): number | undefined {
  if (value == null) return undefined;
  const ids = new Set<string>();
  const seen = new Set<any>();
  function walk(node: any) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    const channel = node.channel ?? node;
    if (typeof channel.id === "string") { ids.add(channel.id); return; }
    for (const child of Object.values(node)) walk(child);
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
