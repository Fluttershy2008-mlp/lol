/* SPDX-License-Identifier: GPL-3.0-or-later */
import { createActivity, normalizeConfig, validateConfig } from './activity.js';

export const SOCKET_ID = 'CustomRPC@Fluttershy2008-mlp';

export function createController({ storage, dispatcher, resolveAsset, appState, log = () => {}, now = Date.now, minInterval = 5000 }) {
  let loaded = false, revision = 0, startedAt = now(), midnightAt;
  let lastSentAt = -Infinity, delay, reconnectTimer, appSubscription;
  let hadActivity = false;
  let status = { busy: false, running: false, message: 'Ready. Add your activity and tap Save & apply.', warnings: [] };
  const listeners = new Set(), subscriptions = [];

  function update(next) {
    status = { ...status, ...next };
    for (const listener of listeners) { try { listener(status); } catch {} }
  }
  function cancelWaiting() {
    if (delay) { clearTimeout(delay.timer); delay.resolve(false); delay = undefined; }
    clearTimeout(reconnectTimer); reconnectTimer = undefined;
  }
  function send(activity) {
    if (typeof dispatcher?.dispatch !== 'function') throw new Error('The activity dispatcher is unavailable on this Discord version.');
    dispatcher.dispatch({ type: 'LOCAL_ACTIVITY_UPDATE', activity, socketId: SOCKET_ID });
    lastSentAt = now();
  }
  function clearActivity() {
    // Null removes only our own socket's activity, including on unload/reload.
    try { if (hadActivity || storage.enabled) send(null); }
    catch (error) { log(error); }
    hadActivity = false;
  }
  async function waitForSlot() {
    const ms = Math.max(0, lastSentAt + minInterval - now());
    if (!ms) return true;
    return new Promise(resolve => {
      delay = { resolve, timer: setTimeout(() => { delay = undefined; resolve(true); }, ms) };
    });
  }

  async function apply(input = storage.config, { persist = true } = {}) {
    if (!loaded) return false;
    const checked = validateConfig(input);
    if (!checked.valid) { update({ message: Object.values(checked.errors).join('\n') }); return false; }
    const ticket = ++revision;
    cancelWaiting();
    update({ busy: true, message: 'Preparing activity…', warnings: [] });
    try {
      const result = await createActivity(checked.config, { resolveAsset, startedAt, midnightAt, now: now() });
      if (!loaded || ticket !== revision) return false;
      if (!(await waitForSlot()) || !loaded || ticket !== revision) return false;
      send(result.activity);
      hadActivity = true;
      if (persist) {
        storage.config = checked.config;
        storage.enabled = true;
      }
      update({ busy: false, running: true, message: 'Activity applied. Check your profile from another account.', warnings: result.warnings });
      return true;
    } catch (error) {
      if (loaded && ticket === revision) {
        log(error);
        update({ busy: false, message: error?.message || 'Could not apply the activity. Try again.' });
      }
      return false;
    }
  }

  function stop() {
    ++revision; cancelWaiting(); clearActivity();
    storage.enabled = false;
    update({ busy: false, running: false, message: 'Activity stopped. Your settings are saved.', warnings: [] });
  }

  function reconnect() {
    if (!loaded || !storage.enabled) return;
    clearTimeout(reconnectTimer);
    // Defer out of the Flux dispatch and coalesce reconnect/foreground events.
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      if (loaded && storage.enabled && !status.busy) void apply(storage.config, { persist: false });
    }, 750);
  }
  const foreground = state => { if (state === 'active') reconnect(); };

  return {
    getStatus: () => status,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    apply,
    stop,
    restartTimer() {
      startedAt = now();
      if (storage.enabled) return apply(storage.config, { persist: false });
      update({ message: 'Timer reset. Tap Save & apply to start your activity.' });
      return Promise.resolve(true);
    },
    load() {
      if (loaded) return;
      loaded = true; startedAt = now();
      const date = new Date(startedAt); date.setHours(0, 0, 0, 0); midnightAt = date.getTime();
      storage.config = normalizeConfig(storage.config);
      storage.draft = normalizeConfig(storage.draft ?? storage.config);
      storage.enabled = storage.enabled === true;
      for (const event of ['CONNECTION_OPEN', 'CONNECTION_RESUMED']) {
        try {
          if (typeof dispatcher?.subscribe === 'function' && typeof dispatcher?.unsubscribe === 'function') {
            dispatcher.subscribe(event, reconnect); subscriptions.push(event);
          }
        } catch {}
      }
      try { appSubscription = appState?.addEventListener?.('change', foreground); } catch {}
      if (storage.enabled) void apply(storage.config, { persist: false });
    },
    unload() {
      loaded = false; ++revision; cancelWaiting(); clearActivity();
      for (const event of subscriptions.splice(0)) { try { dispatcher.unsubscribe(event, reconnect); } catch {} }
      try {
        if (appSubscription?.remove) appSubscription.remove();
        else appState?.removeEventListener?.('change', foreground);
      } catch {}
      appSubscription = undefined;
      resolveAsset?.clear?.();
      update({ busy: false, running: false });
      listeners.clear();
    },
  };
}
