/* MessageLogger mobile adaptation. SPDX-License-Identifier: GPL-3.0-or-later */
import { storage } from "@vendetta/plugin";
import { createHistory, defaults } from "./history";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let channelStore: any, userStore: any;
let clearRetained: ((channelId?: string, id?: string) => void) | undefined;
export const retentionStatus = { seen: 0, kept: 0, labelFailures: 0, last: "Waiting for a deletion", hooks: "" };
export function reportRetention(update: Partial<typeof retentionStatus>) {
  Object.assign(retentionStatus, update);
  notify();
}
export function resetRetentionStatus() {
  reportRetention({ seen: 0, kept: 0, labelFailures: 0, last: "Waiting for a deletion", hooks: "" });
}
function notify() {
  if (!listeners.size || timer !== undefined) return;
  timer = setTimeout(() => {
    timer = undefined;
    for (const listener of listeners) try { listener(); } catch { /* A closed view cannot break Flux. */ }
  }, 32);
}
export const history = createHistory({
  options: () => storage,
  channel: id => channelStore?.getChannel?.(id),
  selfId: () => userStore?.getCurrentUser?.()?.id,
  changed: notify,
});
export function configureHistory(channels: any, users: any, clear?: typeof clearRetained) {
  channelStore = channels; userStore = users; clearRetained = clear;
}
export function initOptions() {
  for (const [k, v] of Object.entries(defaults)) if (storage[k] == null) storage[k] = v;
}
export function subscribeLogs(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size && timer !== undefined) { clearTimeout(timer); timer = undefined; } };
}
export function clearHistory(channelId?: string, id?: string) {
  clearRetained?.(channelId, id);
  history.clear(channelId, id);
}
export function resetHistory() {
  history.clear();
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  // State is cleared immediately; mounted screens refresh outside dispatch.
  notify();
}
