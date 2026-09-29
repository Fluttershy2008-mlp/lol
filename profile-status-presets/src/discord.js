/* SPDX-License-Identifier: GPL-3.0-or-later */
import { normalizeStatus } from './presets.js';

export function createDiscordAdapter(V, now = Date.now) {
  const byProps = (...keys) => { try { return V.metro.findByProps(...keys); } catch { return undefined; } };
  const byStore = name => { try { return V.metro.findByStoreName(name); } catch { return undefined; } };
  function protoActions() {
    const named = byProps('PreloadedUserSettingsActionCreators')?.PreloadedUserSettingsActionCreators;
    if (typeof named?.updateAsync === 'function') return named;
    // A frequent-settings or guild-settings serializer can also expose
    // updateAsync. Select the preloaded user schema explicitly.
    let candidates = [];
    try { candidates = V.metro.findByPropsAll?.('updateAsync', 'ProtoClass') ?? []; } catch {}
    candidates.push(byProps('updateAsync', 'ProtoClass'));
    return candidates.find(m => typeof m?.updateAsync === 'function'
      && /(^|\.)PreloadedUserSettings$/.test(m.ProtoClass?.typeName ?? ''));
  }
  function account() {
    try { return byStore('UserStore')?.getCurrentUser?.()?.id ?? null; } catch { return null; }
  }
  function currentStatus() {
    const proto = byStore('UserSettingsProtoStore');
    try {
      const group = proto?.settings?.status;
      // An empty group means the status was cleared. Do not resurrect a
      // stale presence activity from another store in that case.
      if (group != null) return normalizeStatus(group.customStatus, now());
      const legacy = byStore('UserSettingsStore');
      if (legacy && 'customStatus' in legacy) return normalizeStatus(legacy.customStatus, now());
      const ownId = account();
      if (!ownId) return null;
      const activities = byStore('PresenceStore')?.getActivities?.(ownId);
      return normalizeStatus(activities?.find(a => a?.type === 4), now());
    } catch { return null; }
  }
  function httpClient() { return V.metro.common?.RestAPI ?? byProps('getAPIBaseURL', 'get') ?? byProps('get', 'post', 'patch', 'del'); }
  function capability() {
    if (protoActions()) return 'native';
    return typeof httpClient()?.patch === 'function' ? 'rest' : null;
  }
  async function update(status, expectedAccount) {
    if (!expectedAccount || String(account()) !== String(expectedAccount)) throw new Error('Your Discord account changed. Open the presets page again.');
    if (byStore('ConnectionStore')?.isConnected?.() === false) throw new Error('Discord is offline. Reconnect and try again.');
    const actions = protoActions();
    let result;
    if (actions) {
      const value = status ? {
        text: status.text,
        emojiId: status.emojiId || '0', emojiName: status.emojiName || '',
        expiresAtMs: String(status.expiresAtMs || 0), createdAtMs: String(status.createdAtMs),
      } : undefined;
      // Only replace customStatus. Keep online/idle/DND/invisible and every
      // unrelated setting exactly as Discord supplied them.
      result = await actions.updateAsync('status', draft => {
        if (String(account()) !== String(expectedAccount)) throw new Error('Your Discord account changed. Open the presets page again.');
        draft.customStatus = value;
      }, 0);
    } else {
      const api = httpClient();
      if (typeof api?.patch !== 'function') throw new Error('Discord’s status update module is unavailable. Restart Discord and try again.');
      result = await api.patch({ url: '/users/@me/settings', body: { custom_status: status ? {
        text: status.text,
        emoji_id: status.emojiId || null, emoji_name: status.emojiName || null,
        expires_at: status.expiresAtMs ? new Date(status.expiresAtMs).toISOString() : null,
      } : null } });
    }
    // Some wrappers resolve non-2xx responses instead of rejecting them.
    if (result?.ok === false || Number(result?.status) >= 400) {
      const error = new Error(result?.body?.message || 'Discord could not update your status.');
      error.status = result.status; error.body = result.body;
      throw error;
    }
    // Never try a second writer after a request fails: that could duplicate a
    // write or bypass Discord's rate limit. Surface its failure to the user.
    return result;
  }
  return { account, currentStatus, capability, update, byProps, byStore };
}
