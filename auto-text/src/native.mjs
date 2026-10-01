/* SPDX-License-Identifier: MIT */

// Read the real native field when Discord's JavaScript text cache/echo lags.
// flushText is read-only; a probe must never retry an insert or a Send.
export function createNativeReader(commands, { schedule = setTimeout, cancel = clearTimeout } = {}) {
  let target = null, serial = 0, disposed = false;
  const requests = new Map(), refs = new Map();
  const prefix = 'auto-text-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '-';
  function clear(notify = false) {
    const pending = [...requests.values()];
    requests.clear();
    for (const request of pending) {
      cancel(request.timer);
      if (notify) { try { request.callback(null); } catch {} }
    }
  }
  return {
    ref(original) {
      if (refs.has(original)) return refs.get(original);
      const callback = value => {
        if (target !== value) clear(true);
        target = value;
        const cleanup = typeof original === 'function' ? original(value) : undefined;
        if (original && typeof original === 'object') original.current = value;
        if (typeof cleanup === 'function') return () => {
          if (target === value) { target = null; clear(true); }
          cleanup();
        };
      };
      refs.set(original, callback);
      return callback;
    },
    read(callback) {
      if (disposed || !target || typeof commands?.flushText !== 'function') return null;
      const id = prefix + (++serial);
      const release = () => {
        const request = requests.get(id);
        if (request) cancel(request.timer);
        requests.delete(id);
      };
      requests.set(id, { callback, timer: schedule(() => { release(); callback(null); }, 1000) });
      try { commands.flushText(target, id); }
      catch { release(); return null; }
      return release;
    },
    observe(event) {
      const data = event?.nativeEvent ?? event;
      const request = requests.get(data?.requestId);
      if (!request) return;
      requests.delete(data.requestId); cancel(request.timer);
      request.callback(typeof data.text === 'string' ? data.text : null);
    },
    dispose() { disposed = true; target = null; clear(); refs.clear(); },
  };
}
