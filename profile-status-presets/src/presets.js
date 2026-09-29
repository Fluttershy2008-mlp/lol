/* SPDX-License-Identifier: GPL-3.0-or-later */

export const EXPIRIES = [
  ['never', "Don't clear"], ['30m', '30 minutes'], ['1h', '1 hour'],
  ['4h', '4 hours'], ['today', 'Today'],
];

export function parseEmoji(input) {
  const value = String(input ?? '').trim();
  if (!value) return { emojiId: '', emojiName: '', animated: false };
  const custom = /^<(a?):([A-Za-z0-9_]{1,32}):([0-9]{17,20})>$/.exec(value);
  if (custom) return { emojiId: custom[3], emojiName: custom[2], animated: custom[1] === 'a' };
  if (value.length > 100 || /[<>:\s]/.test(value) || /^[\x00-\x7F]+$/.test(value)) {
    throw new Error('Paste a Unicode emoji or a custom emoji in <:name:ID> format.');
  }
  return { emojiId: '', emojiName: value, animated: false };
}

export function emojiInput(status) {
  if (!status?.emojiName && !status?.emojiId) return '';
  return status.emojiId ? `<${status.animated ? 'a' : ''}:${status.emojiName || 'emoji'}:${status.emojiId}>` : status.emojiName;
}

export function validatePreset(draft) {
  const name = String(draft.name ?? '').trim();
  const text = String(draft.text ?? '');
  if (!name || name.length > 40) throw new Error('Give your preset a name of 1–40 characters.');
  if (text.length > 128) throw new Error('Custom statuses can contain up to 128 characters.');
  const emoji = parseEmoji(draft.emoji ?? emojiInput(draft));
  if (!text.trim() && !emoji.emojiName && !emoji.emojiId) throw new Error('Add status text or an emoji. Use Clear current status to remove your status.');
  if (!EXPIRIES.some(([key]) => key === draft.clearAfter)) throw new Error('Choose when the status should clear.');
  return { name, text, ...emoji, clearAfter: draft.clearAfter };
}

export function expiration(clearAfter, now) {
  const minutes = { '30m': 30, '1h': 60, '4h': 240 }[clearAfter];
  if (minutes) return now + minutes * 60000;
  if (clearAfter === 'today') {
    const end = new Date(now);
    end.setHours(24, 0, 0, 0);
    return end.getTime();
  }
  return 0;
}

export function statusPayload(preset, now) {
  if (!preset) return null;
  return {
    text: preset.text, emojiId: preset.emojiId || '', emojiName: preset.emojiName || '',
    expiresAtMs: expiration(preset.clearAfter, now), createdAtMs: now,
  };
}

export function normalizeStatus(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const expires = raw.expiresAtMs != null ? Number(raw.expiresAtMs)
    : raw.expires_at ? Date.parse(raw.expires_at) : 0;
  if (Number.isFinite(expires) && expires > 0 && expires <= now) return null;
  const text = typeof raw.text === 'string' ? raw.text : typeof raw.state === 'string' ? raw.state : '';
  const id = raw.emojiId ?? raw.emoji_id ?? raw.emoji?.id;
  const emojiId = id != null && String(id) !== '0' ? String(id) : '';
  const emojiName = String(raw.emojiName ?? raw.emoji_name ?? raw.emoji?.name ?? '');
  if (!text && !emojiId && !emojiName) return null;
  return { text, emojiId, emojiName, animated: Boolean(raw.animated ?? raw.emoji?.animated), expiresAtMs: Number.isFinite(expires) ? expires : 0 };
}

export function sameStatus(a, b) {
  return Boolean(a && b && a.text === b.text && a.emojiId === b.emojiId && a.emojiName === b.emojiName);
}

export function createPresetStore(storage, changed = () => {}, now = Date.now) {
  if (!storage.accounts || typeof storage.accounts !== 'object' || Array.isArray(storage.accounts)) storage.accounts = {};
  let sequence = 0;
  function list(accountId) {
    const rows = accountId && storage.accounts[accountId]?.presets;
    return Array.isArray(rows) ? rows.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string') : [];
  }
  function write(accountId, presets) {
    if (!accountId || !/^[0-9]+$/.test(accountId)) throw new Error('Sign in to Discord first.');
    storage.accounts = { ...storage.accounts, [accountId]: { presets } };
    changed();
  }
  function save(accountId, draft, id) {
    const value = validatePreset(draft);
    const rows = list(accountId);
    if (rows.some(p => p.id !== id && p.name.toLowerCase() === value.name.toLowerCase())) throw new Error('A preset with that name already exists. Choose another name.');
    if (id && !rows.some(p => p.id === id)) throw new Error('This preset was removed. Add it as a new preset.');
    const preset = { ...value, id: id || `${now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 9)}` };
    write(accountId, id ? rows.map(p => p.id === id ? preset : p) : [...rows, preset]);
    return preset;
  }
  return {
    list, save,
    remove(accountId, id) { write(accountId, list(accountId).filter(p => p.id !== id)); },
  };
}
