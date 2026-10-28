/** Replace Revenge Next's kmmiio library dependency with the existing client API. */
import { openUserProfile } from "../../../compatibility/user-profile.mjs";
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
  actions?.hideActionSheet?.(`info-commands-server-info-${options.guildId}`);
  openUserProfile(vendetta, options).then(opened => {
    if (!opened) notify("Profiles are unavailable on this Discord version");
  }).catch(() => notify("Unable to open profile. Try again."));
}
export function notify(text: string) { optional(() => vendetta.ui.toasts.showToast(text)); }
export function copyServerId(id: string) {
  const clipboard = vendetta.metro.common.clipboard;
  if (clipboard?.setString) { clipboard.setString(id); notify("Server ID copied"); }
}
