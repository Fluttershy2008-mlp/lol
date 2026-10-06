/** Replace Revenge Next's kmmiio library dependency with the existing client API. */
const optional = (fn: () => any) => { try { return fn(); } catch { return undefined; } };
const store = (name: string) => optional(() => vendetta.metro.findByStoreName(name));
const props = (...keys: string[]) => optional(() => vendetta.metro.findByProps(...keys));
export const getGuildStore = () => store("GuildStore");
export const getBasicGuildStore = () => store("BasicGuildStore");
export const getUserStore = () => store("UserStore");
export const getGuildRoleStore = () => store("GuildRoleStore");
export const getGuildChannelStore = () => store("GuildChannelStore");
export const getGuildMemberStore = () => store("GuildMemberStore");
export const getRelationshipStore = () => store("RelationshipStore");
export const getGuildMemberCountStore = () => store("GuildMemberCountStore") ?? props("getMemberCount", "getOnlineCount");
export const getGuildHeaderCountsStore = () => store("GuildHeaderCountsStore") ?? getGuildMemberCountStore();
export function getHTTPUtils() {
  const http = props("get", "post");
  return http?.get ? { get: (url: string) => http.get({ url }) } : undefined;
}
export function getRequestMembersById() {
  const actions = props("requestMembersById");
  return actions?.requestMembersById ? (...args: any[]) => actions.requestMembersById(...args) : undefined;
}
export function openUserProfileSheet(options: Record<string, unknown>) {
  const actions = props("openLazy", "hideActionSheet") ?? props("hideActionSheet");
  for (const method of ["openUserProfileModal", "openUserProfile", "showUserProfile"]) {
    const module = props(method);
    if (typeof module?.[method] !== "function") continue;
    try {
      actions?.hideActionSheet?.(`info-commands-server-info-${options.guildId}`);
      Promise.resolve(module[method](options)).catch(() => notify("Unable to open profile. Try again."));
      return;
    } catch {}
  }
  notify("Profiles are unavailable on this Discord version");
}
export function notify(text: string) { optional(() => vendetta.ui.toasts.showToast(text)); }
export function copyServerId(id: string) {
  const clipboard = vendetta.metro.common.clipboard;
  if (clipboard?.setString) { clipboard.setString(id); notify("Server ID copied"); }
}
