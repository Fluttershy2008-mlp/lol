/* SPDX-License-Identifier: CC0-1.0 */
// IDs remain strings: Discord snowflakes exceed JavaScript's safe integer range.
export const isDiscordUserId = value => typeof value === 'string' && /^[1-9]\d{16,19}$/.test(value);

export function normalizeWhitelist(value) {
  return Array.isArray(value) ? [...new Set(value.filter(isDiscordUserId))] : [];
}

export function parseWhitelistInput(value) {
  const tokens = String(value ?? '').trim().split(/[\s,;]+/).filter(Boolean);
  const ids = [], invalid = [];
  for (const token of tokens) {
    const id = token.replace(/^<@!?(\d+)>$/, '$1');
    (isDiscordUserId(id) ? ids : invalid).push(id);
  }
  return { ids: [...new Set(ids)], invalid };
}

export function isUserWhitelisted(storage, id) {
  return storage.whitelistEnabled === true && isDiscordUserId(id)
    && Array.isArray(storage.whitelistedIds) && storage.whitelistedIds.includes(id);
}
