export const validID = value => typeof value === 'string' && /^[1-9]\d{16,19}$/.test(value);

export function parseIDs(text) {
  if (typeof text !== 'string') throw new Error('Protected IDs must be text.');
  const tokens = text.trim() ? text.trim().split(/[\s,;]+/) : [];
  const invalid = tokens.filter(id => !validID(id));
  if (invalid.length) throw new Error(`Invalid server ID: ${invalid[0]}. Paste full server IDs, separated by spaces, commas or new lines.`);
  return [...new Set(tokens)];
}

export function guildRows(store) {
  if (typeof store?.getGuilds !== 'function') throw new Error('Your server list is not ready. Tap Refresh.');
  const raw = store.getGuilds();
  if (!raw || typeof raw !== 'object') throw new Error('Your server list is still loading.');
  const entries = raw instanceof Map ? [...raw.entries()] : Object.entries(raw);
  const rows = entries.map(([key, guild]) => {
    const id = guild?.id ?? key;
    if (!validID(id) || !guild || typeof guild !== 'object') throw new Error('Discord returned an incomplete server list. Tap Refresh.');
    return { id, name: String(guild.name || id), owner: guild.ownerId ?? guild.owner_id,
      unavailable: guild.unavailable === true };
  });
  return [...new Map(rows.map(row => [row.id, row])).values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function keepReason(row, account, protectedIDs) {
  if (protectedIDs.has(row.id)) return 'Protected';
  if (row.owner === account) return 'You own this server';
  if (row.unavailable) return 'Server unavailable';
  if (!validID(row.owner)) return 'Ownership unavailable';
  return null;
}

export function makePlan(rows, account, text) {
  if (!validID(account)) throw new Error('Your Discord account is still loading.');
  const ids = parseIDs(text), protectedIDs = new Set(ids);
  const joined = new Set(rows.map(row => row.id));
  const missing = ids.filter(id => !joined.has(id));
  // A mistyped but well-formed ID must never silently leave the intended server.
  if (missing.length) throw new Error(`Protected ID ${missing[0]} is not in your server list. Check the ID or remove it before continuing.`);
  const kept = [], targets = [];
  for (const row of rows) {
    const reason = keepReason(row, account, protectedIDs);
    if (reason) kept.push({ ...row, reason }); else targets.push({ ...row });
  }
  return { account, ids, targets, kept };
}

export function samePlan(a, b) {
  const signature = plan => JSON.stringify([plan.account, [...plan.ids].sort(),
    plan.targets.map(row => row.id).sort(), plan.kept.map(row => [row.id, row.reason]).sort()]);
  return signature(a) === signature(b);
}

// Requests are serial. Any uncertain result stops the queue; no automatic retries.
export async function runQueue({ plan, alive, getRows, getIDs, leave, wait, update }) {
  const result = { left: [], skipped: [], failed: [], stopped: null };
  const publish = () => update({ ...result, left: [...result.left], skipped: [...result.skipped], failed: [...result.failed] });
  for (const original of plan.targets) {
    if (!alive()) { result.stopped = 'Stopped. No more leave requests will be sent.'; break; }
    let row;
    try {
      row = getRows().find(item => item.id === original.id);
      // Retain all IDs protected at confirmation even if saved settings later change.
      const ids = new Set([...plan.ids, ...parseIDs(getIDs())]);
      if (!row || keepReason(row, plan.account, ids)) {
        result.skipped.push(original); publish(); continue;
      }
    } catch (error) { result.stopped = error.message; break; }
    // Recheck immediately before dispatch, after consulting live stores/settings.
    if (!alive()) { result.stopped = 'Stopped. No more leave requests will be sent.'; break; }
    try {
      const response = await leave(row.id);
      const status = Number(response?.status ?? response?.statusCode);
      if (status !== 204) throw new Error(`Leave was not confirmed (HTTP ${Number.isFinite(status) ? status : 'unknown'}). Refresh your server list before trying again.`);
      result.left.push(original);
    } catch (error) {
      result.failed.push({ ...original, error: error?.message ?? 'Leave failed.' });
      result.stopped = 'Stopped after an error. Refresh before trying again.';
      publish(); break;
    }
    publish();
    if (!alive()) { result.stopped = 'Stopped. No more leave requests will be sent.'; break; }
    await wait();
  }
  publish();
  return result;
}
