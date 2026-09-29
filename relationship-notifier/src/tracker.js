/*
 * RelationshipNotifier for Revenge, adapted from Vencord RelationshipNotifier.
 * Copyright (c) 2023 Vendicated and contributors; original plugin by nick.
 * Mobile adaptation Copyright (c) 2026 Fluttershy2008-mlp.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const DEFAULTS = Object.freeze({
  friends: true, friendRequestCancels: true, servers: true,
  groups: true, offlineRemovals: true, notices: false,
});

const CATEGORIES = ['friends', 'requests', 'guilds', 'groups'];
const OPTIONS = { friends: 'friends', requests: 'friendRequestCancels', guilds: 'servers', groups: 'groups' };

export function createTracker({ storage, notify, changed = () => {}, now = Date.now }) {
  let accountId = null;
  if (!storage.options || typeof storage.options !== 'object') storage.options = { ...DEFAULTS };
  if (!storage.accounts || typeof storage.accounts !== 'object') storage.accounts = {};
  const options = () => ({ ...DEFAULTS, ...storage.options });
  const account = id => storage.accounts[id] ?? { snapshots: {}, history: [], manual: {} };
  const save = (id, value) => { storage.accounts = { ...storage.accounts, [id]: value }; };

  function select(id) { accountId = id ? String(id) : null; }
  function markManual(category, id, owner = accountId) {
    if (!owner || !id) return null;
    const key = `${category}:${id}`;
    const data = account(owner);
    const stamp = now();
    // Account-scoped and persisted so a quick reload cannot turn a local action
    // into a removal alert. Failed requests undo their own marker below.
    const token = `${stamp}:${Math.random()}`;
    save(owner, { ...data, manual: { ...data.manual, [key]: { expires: stamp + 120000, token } } });
    return { owner, key, token };
  }

  function cancelManual(marker) {
    if (!marker) return;
    const data = account(marker.owner);
    if (data.manual?.[marker.key]?.token !== marker.token) return;
    const manual = { ...data.manual };
    delete manual[marker.key];
    save(marker.owner, { ...data, manual });
  }

  function completeManual(marker) {
    if (!marker) return;
    const data = account(marker.owner);
    if (data.manual?.[marker.key]?.token !== marker.token) return;
    const [category, id] = marker.key.split(':');
    const snapshots = { ...data.snapshots };
    const categories = category === 'relationships' ? ['friends', 'requests'] : [category];
    for (const key of categories) {
      if (!snapshots[key]) continue;
      snapshots[key] = { ...snapshots[key] };
      delete snapshots[key][id];
    }
    save(marker.owner, { ...data, snapshots });
  }

  function reconcile(snapshot, { offline = false } = {}) {
    if (!snapshot?.accountId) return [];
    select(snapshot.accountId);
    const data = account(accountId);
    const settings = options();
    const old = data.snapshots ?? {};
    const next = { ...old };
    const manual = Object.fromEntries(Object.entries(data.manual ?? {}).filter(([, value]) => value.expires > now()));
    const events = [];
    const unavailable = new Set(snapshot.unavailableIds ?? []);
    for (const category of CATEGORIES) {
      const isOffline = offline === true || Array.isArray(offline) && offline.includes(category);
      // null means unsupported/not ready, never an empty list of memberships.
      if (snapshot[category] == null) continue;
      const current = { ...snapshot[category] };
      if (category === 'guilds') {
        for (const id of unavailable) if (old.guilds?.[id]) current[id] = old.guilds[id];
      }
      if (old[category] && (!isOffline || settings.offlineRemovals) && settings[OPTIONS[category]]) {
        for (const [id, item] of Object.entries(old[category])) {
          if (current[id]) continue;
          const markerKey = `${category === 'friends' || category === 'requests' ? 'relationships' : category}:${id}`;
          if (manual[markerKey]) continue;
          // Accepting a request and blocking are state transitions, not a
          // cancelled request. Blocks never produce an unfriend alert.
          const relation = snapshot.relationshipTypes?.[id];
          if (category === 'requests' && relation && relation !== 3) continue;
          if (category === 'friends' && relation === 2) continue;
          const name = item.name || id;
          const text = category === 'friends' ? `You are no longer friends with ${name}.`
            : category === 'requests' ? `The friend request from ${name} is no longer pending.`
            : category === 'guilds' ? `You are no longer in the server ${name}.`
            : `You are no longer in the group ${name}.`;
          events.push({ id, category, name, text, at: now(), offline: isOffline, icon: item.icon ?? null });
        }
      }
      next[category] = current;
    }
    // Save before delivering alerts. A UI failure or reload must not replay the
    // same event, and history remains available when Android suspends the app.
    const history = [...events].reverse().concat(Array.isArray(data.history) ? data.history : []).slice(0, 100);
    save(accountId, { snapshots: next, history, manual, updatedAt: now() });
    changed();
    if (events.length) notify(events, settings);
    return events;
  }

  return {
    select, options, reconcile, markManual, cancelManual, completeManual,
    getAccountId: () => accountId,
    history: () => accountId ? (account(accountId).history ?? []) : [],
    counts: () => Object.fromEntries(CATEGORIES.map(key => [key, Object.keys(accountId ? account(accountId).snapshots?.[key] ?? {} : {}).length])),
    setOption(key, value) {
      if (!(key in DEFAULTS)) return;
      storage.options = { ...options(), [key]: Boolean(value) };
      changed();
    },
    clearHistory() {
      if (!accountId) return;
      save(accountId, { ...account(accountId), history: [] });
      changed();
    },
  };
}
