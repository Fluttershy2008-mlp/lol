/* SPDX-License-Identifier: GPL-3.0-or-later */
import { httpURL } from './activity.js';

function timed(promise, delay) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Image lookup timed out.')), delay);
    Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

function assetPath(value) {
  if (typeof value !== 'string' || !value) return undefined;
  if (/^\d+$/.test(value) || /^mp:(?:external|attachments|app-assets)\//.test(value)) return value;
  const path = value.replace(/^https:\/\/(?:media\.discordapp\.net|cdn\.discordapp\.com)\//i, '');
  if (/^(?:external|attachments|app-assets)\//.test(path)) return `mp:${path}`;
}

export function createAssetResolver(byProps, { timeout = 12000 } = {}) {
  const cache = new Map();
  function getHTTP() {
    const candidates = [byProps('get', 'post', 'put'), byProps('getAPIBaseURL', 'get'), byProps('HTTP')?.HTTP];
    const http = candidates.find(value => typeof value?.get === 'function' && typeof value?.post === 'function');
    if (!http) throw new Error('This Discord version does not expose image lookup.');
    return http;
  }

  async function lookup(appID, key) {
    if (/^mp:/.test(key) || /^\d+$/.test(key)) return key;
    // Use Discord's own asset manager when available on this mobile build.
    const manager = byProps('fetchAssetIds') ?? byProps('getAssetIds');
    if (manager) {
      try {
        const cached = manager.getAssetIds?.(appID, [key]);
        const hit = assetPath(cached?.[0]);
        if (hit) return hit;
        if (typeof manager.fetchAssetIds === 'function') {
          const fetched = await manager.fetchAssetIds(appID, [key]);
          const resolved = assetPath(fetched?.[0]);
          if (resolved) return resolved;
        }
      } catch { /* Use Discord's existing HTTP client as a fallback. */ }
    }
    const http = getHTTP();
    if (httpURL(key)) {
      // Authentication stays inside Discord. Never read, store or request a token.
      const response = await http.post({ url: `/applications/${appID}/external-assets`, body: { urls: [key] } });
      const body = response?.body ?? response;
      const result = assetPath(body?.[0]?.external_asset_path);
      if (!result) throw new Error('Discord did not return an external image.');
      return result;
    }
    const response = await http.get({ url: `/oauth2/applications/${appID}/assets` });
    const body = response?.body ?? response;
    const match = Array.isArray(body) ? body.find(asset => asset.name === key || String(asset.id) === key) : undefined;
    if (!match?.id) throw new Error('Application image key was not found.');
    return String(match.id);
  }

  const resolve = (appID, key) => {
    // Only IDs validated by activity.js are ever interpolated into authenticated routes.
    if (!/^(?:0|\d{16,21})$/.test(appID)) return Promise.reject(new Error('Invalid application ID.'));
    const cacheKey = `${appID}:${key}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    const pending = timed(lookup(appID, key), timeout).catch(error => { cache.delete(cacheKey); throw error; });
    cache.set(cacheKey, pending);
    return pending;
  };
  resolve.clear = () => cache.clear();
  return resolve;
}
