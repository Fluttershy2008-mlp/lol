/* SPDX-License-Identifier: GPL-3.0-or-later */
import { createPresetStore, statusPayload, validatePreset, emojiInput } from './presets.js';

export function createController({ storage, discord, now = Date.now }) {
  const listeners = new Set();
  let active = false, busy = false, generation = 0, notice = '', error = '', noticeOwner = null, retryAt = 0;
  const emit = () => { for (const fn of listeners) { try { fn(); } catch {} } };
  const store = createPresetStore(storage, emit, now);
  function owner(expected) {
    const id = discord.account();
    if (!active) throw new Error('Enable Profile Status Presets first.');
    if (!id) throw new Error('Sign in to Discord first.');
    if (expected != null && String(id) !== String(expected)) throw new Error('Your Discord account changed. Open the presets page again.');
    return String(id);
  }
  function getState() {
    const rawId = discord.account(), accountId = rawId ? String(rawId) : null;
    return { active, busy, accountId, presets: store.list(accountId), current: discord.currentStatus(),
      notice: noticeOwner === accountId ? notice : '', error: noticeOwner === accountId ? error : '' };
  }
  async function apply(id, expectedAccount) {
    const accountId = owner(expectedAccount);
    if (busy) throw new Error('A status update is still in progress.');
    if (now() < retryAt) throw new Error(`Discord asked you to wait ${Math.ceil((retryAt - now()) / 1000)} seconds before trying again.`);
    const preset = id == null ? null : store.list(accountId).find(p => p.id === id);
    if (id != null && !preset) throw new Error('This preset is no longer available.');
    if (preset) validatePreset(preset);
    const run = generation;
    busy = true; error = ''; notice = 'Updating status…'; noticeOwner = accountId; emit();
    try {
      await discord.update(statusPayload(preset, now()), accountId);
      if (active && generation === run && String(discord.account()) === accountId) {
        notice = preset ? `Applied “${preset.name}”.` : 'Custom status cleared.';
      }
      return true;
    } catch (cause) {
      const limited = Number(cause?.status ?? cause?.statusCode) === 429;
      if (limited) retryAt = now() + Math.max(1, Number(cause?.body?.retry_after) || 5) * 1000;
      const message = limited ? `Discord is limiting status changes. Try again in ${Math.ceil((retryAt - now()) / 1000)} seconds.`
        : cause?.body?.message || cause?.message || 'Could not update your status. Please try again.';
      if (active && generation === run && String(discord.account()) === accountId) { notice = ''; error = message; }
      throw new Error(message);
    } finally { busy = false; emit(); }
  }
  return {
    getState, apply, refresh: emit,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start() { active = true; generation++; emit(); },
    stop() { active = false; generation++; notice = ''; error = ''; emit(); },
    save(draft, id, expectedAccount) { return store.save(owner(expectedAccount), draft, id); },
    remove(id, expectedAccount) { store.remove(owner(expectedAccount), id); },
    capture(expectedAccount) {
      owner(expectedAccount);
      const status = discord.currentStatus();
      if (!status) throw new Error('You do not have a custom status to save yet.');
      return { name: '', text: status.text, emoji: emojiInput(status), clearAfter: 'never' };
    },
  };
}
