export const FRIEND = 1;
export const validID = value => typeof value === 'string' && /^\d{17,20}$/.test(value);

function relationshipEntries(value) {
  if (value && typeof value.entries === 'function' && !Array.isArray(value)) return [...value.entries()];
  if (Array.isArray(value)) return value.map(item => Array.isArray(item)
    ? item : [item?.id ?? item?.user?.id, item?.type]);
  if (value && typeof value === 'object') return Object.entries(value);
  return null;
}

// Count relationships, not cached profiles or presence. Offline and uncached friends count too.
export function friendIDs(store) {
  if (!store) throw new Error('Discord’s friends list is not ready. Tap Refresh to try again.');
  for (const method of ['getFriendIDs', 'getFriendIds']) {
    if (typeof store[method] !== 'function') continue;
    const ids = store[method]();
    if (Array.isArray(ids) || ids instanceof Set) return [...new Set([...ids].filter(validID))];
  }
  for (const method of ['getRelationships', 'getMutableRelationships']) {
    if (typeof store[method] !== 'function') continue;
    const pairs = relationshipEntries(store[method]());
    if (pairs) return [...new Set(pairs.filter(([id, value]) => validID(id)
      && Number(value?.type ?? value) === FRIEND).map(([id]) => id))];
  }
  throw new Error('This Discord version does not expose its friends list.');
}

export function makeRows(ids, getUser) {
  return ids.map(id => {
    let user;
    try { user = getUser?.(id); } catch {}
    const username = typeof user?.username === 'string' ? user.username : '';
    const name = user?.globalName || user?.global_name || username || 'Unknown friend';
    const discriminator = String(user?.discriminator ?? '0');
    const tag = username ? (discriminator !== '0' && discriminator
      ? `${username}#${discriminator}` : `@${username}`) : 'Tap to load their profile';
    const avatar = typeof user?.avatar === 'string' && /^[a-zA-Z0-9_]+$/.test(user.avatar)
      ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.png?size=128` : null;
    return { id, name: String(name), tag, avatar };
  }).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id));
}

export function searchRows(rows, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  return needle ? rows.filter(row => `${row.name}\n${row.tag}\n${row.id}`.toLowerCase().includes(needle)) : rows;
}
