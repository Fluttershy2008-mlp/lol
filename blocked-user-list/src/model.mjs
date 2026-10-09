export const BLOCKED = 2;
export const validID = value => typeof value === 'string' && /^\d{17,20}$/.test(value);

function entries(value) {
  if (value instanceof Map || (value && typeof value.entries === 'function' && !Array.isArray(value))) {
    return Array.from(value.entries());
  }
  if (Array.isArray(value)) return value.map(item => [item?.id ?? item?.user?.id, item?.type]);
  if (value && typeof value === 'object') return Object.entries(value);
  return null;
}

export function blockedIDs(store) {
  if (!store) throw new Error('Discord’s blocked-user list is not ready. Tap Refresh to try again.');
  for (const method of ['getRelationships', 'getMutableRelationships']) {
    if (typeof store[method] !== 'function') continue;
    const pairs = entries(store[method]());
    if (pairs) return [...new Set(pairs.filter(([id, value]) => validID(id)
      && Number(value?.type ?? value) === BLOCKED).map(([id]) => id))];
  }
  for (const method of ['getBlockedIDs', 'getBlockedIds']) {
    if (typeof store[method] !== 'function') continue;
    const ids = store[method]();
    if (Array.isArray(ids) || ids instanceof Set) return [...new Set([...ids].filter(validID))];
  }
  throw new Error('This Discord version does not expose its blocked-user list.');
}

export function isBlocked(store, id) {
  if (!validID(id)) return false;
  if (typeof store?.isBlocked === 'function') return Boolean(store.isBlocked(id));
  if (typeof store?.getRelationshipType === 'function') return Number(store.getRelationshipType(id)) === BLOCKED;
  return blockedIDs(store).includes(id);
}

export function makeRows(ids, getUser) {
  return ids.map(id => {
    let user;
    try { user = getUser?.(id); } catch {}
    const username = typeof user?.username === 'string' ? user.username : '';
    const name = user?.globalName || user?.global_name || username || 'Unknown user';
    const tag = username ? (user.discriminator && user.discriminator !== '0'
      ? `${username}#${user.discriminator}` : `@${username}`) : 'Profile not cached yet';
    const avatar = typeof user?.avatar === 'string' && /^[a-zA-Z0-9_]+$/.test(user.avatar)
      ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.png?size=128` : null;
    return { id, name: String(name), tag, avatar };
  }).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id));
}

export function searchRows(rows, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  return needle ? rows.filter(row => `${row.name}\n${row.tag}\n${row.id}`.toLowerCase().includes(needle)) : rows;
}
