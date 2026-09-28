/*
 * Adapted from Vencord CustomRPC, Copyright (c) 2023-2025 Vendicated and contributors.
 * Mobile adaptation Copyright (c) 2026 Fluttershy2008-mlp.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const ACTIVITY_TYPES = [[0, 'Playing'], [1, 'Streaming'], [2, 'Listening'], [3, 'Watching'], [5, 'Competing']];
export const TIMESTAMP_MODES = [['none', 'None'], ['elapsed', 'Since plugin started'], ['midnight', 'Since midnight'], ['custom', 'Custom']];
export const DEFAULTS = Object.freeze({
  appID: '', appName: '', type: 0, details: '', detailsURL: '', state: '', stateURL: '', streamLink: '',
  imageBig: '', imageBigTooltip: '', imageBigURL: '', imageSmall: '', imageSmallTooltip: '', imageSmallURL: '',
  buttonOneText: '', buttonOneURL: '', buttonTwoText: '', buttonTwoURL: '',
  timestampMode: 'none', startTime: '', endTime: '', partySize: '', partyMaxSize: '',
});

export function normalizeConfig(input = {}) {
  const config = {};
  for (const [key, initial] of Object.entries(DEFAULTS)) {
    const value = input?.[key] ?? initial;
    config[key] = key === 'type' ? Number(value) : String(value).trim();
  }
  return config;
}

// Avoid depending on the incomplete URL implementation in older React Native.
export function httpURL(value) {
  if (typeof value !== 'string' || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  return /^https?:\/\/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?::\d{1,5})?(?:[/?#][^\s]*)?$/i.test(value);
}

export function validateConfig(input) {
  const c = normalizeConfig(input), errors = {};
  if (!c.appName) errors.appName = 'Enter an application name.';
  if (c.appID && !/^\d{16,21}$/.test(c.appID)) errors.appID = 'Use a Discord application ID (16–21 digits), or leave it empty for a text activity.';
  if (!ACTIVITY_TYPES.some(([type]) => type === c.type)) errors.type = 'Choose an activity type.';
  for (const [key, label] of [
    ['appName', 'Application name'], ['details', 'Details'], ['state', 'State'],
    ['imageBigTooltip', 'Large image text'], ['imageSmallTooltip', 'Small image text'],
  ]) if (c[key].length > 128) errors[key] = `${label} must be at most 128 characters.`;
  for (const key of ['detailsURL', 'stateURL', 'imageBigURL', 'imageSmallURL', 'buttonOneURL', 'buttonTwoURL']) {
    if (c[key] && (!httpURL(c[key]) || c[key].length > 512)) errors[key] = 'Enter a complete http:// or https:// link, up to 512 characters.';
  }
  if (c.type === 1 && (!/^https?:\/\/(?:www\.)?(?:twitch\.tv|youtube\.com)\/[^\s]+$/i.test(c.streamLink)
      || !httpURL(c.streamLink) || c.streamLink.length > 512)) {
    errors.streamLink = 'Streaming needs a Twitch or YouTube channel/video URL.';
  }
  for (const [textKey, urlKey] of [['buttonOneText', 'buttonOneURL'], ['buttonTwoText', 'buttonTwoURL']]) {
    if (c[textKey].length > 31) errors[textKey] = 'Button text must be at most 31 characters.';
    if (c[textKey] && !c[urlKey]) errors[urlKey] = 'Add a link for this button.';
    if (c[urlKey] && !c[textKey]) errors[textKey] = 'Add text for this button.';
  }
  for (const key of ['imageBig', 'imageSmall']) {
    const value = c[key];
    if (!value) continue;
    if (value.length > 2048) errors[key] = 'Image URL/key must be at most 2048 characters.';
    else if (/^https?:\/\//i.test(value)) {
      if (!httpURL(value)) errors[key] = 'Enter a valid direct image URL.';
      else if (/^https?:\/\/(?:www\.)?(?:imgur|tenor)\.com\//i.test(value)) errors[key] = 'Use the direct image link (i.imgur.com or media.tenor.com), not a gallery page.';
    } else if (/^mp:/.test(value)) {
      if (!/^mp:(?:external|attachments|app-assets)\/[^\s]+$/.test(value)) errors[key] = 'Enter a valid Discord media asset path.';
    } else if (!/^[\w.-]{1,256}$/.test(value)) errors[key] = 'Use a direct image URL or an uploaded application asset key.';
    else if (!c.appID) errors[key] = 'An application ID is required when using an asset key or asset ID.';
  }
  if (!TIMESTAMP_MODES.some(([mode]) => mode === c.timestampMode)) errors.timestampMode = 'Choose a timestamp mode.';
  if (c.timestampMode === 'custom') {
    for (const key of ['startTime', 'endTime']) {
      if (c[key] && (!/^\d{1,16}$/.test(c[key]) || !Number.isSafeInteger(Number(c[key])) || Number(c[key]) <= 0)) {
        errors[key] = 'Use a positive Unix timestamp in milliseconds, or leave empty.';
      }
    }
    if (!c.startTime && !c.endTime) errors.startTime = 'Enter a start or end timestamp, or choose None.';
    if (c.startTime && c.endTime && Number(c.endTime) <= Number(c.startTime)) errors.endTime = 'End time must be after the start time.';
  }
  if (c.type === 0 && (c.partySize || c.partyMaxSize)) {
    for (const key of ['partySize', 'partyMaxSize']) {
      if (!/^\d{1,9}$/.test(c[key]) || Number(c[key]) < 1) errors[key] = 'Enter a positive whole number for both party sizes.';
    }
    if (Number(c.partySize) > Number(c.partyMaxSize)) errors.partySize = 'Party size cannot exceed the maximum.';
  }
  return { config: c, errors, valid: Object.keys(errors).length === 0 };
}

export async function createActivity(input, { resolveAsset, startedAt, midnightAt, now = Date.now() } = {}) {
  const { config: c, errors, valid } = validateConfig(input);
  if (!valid) throw new Error(Object.values(errors).join('\n'));
  const activity = { application_id: c.appID || '0', name: c.appName, type: c.type, flags: 1 };
  const warnings = [];
  for (const [field, key] of [['details', 'details'], ['details_url', 'detailsURL'], ['state', 'state'], ['state_url', 'stateURL']]) {
    if (c[key]) activity[field] = c[key];
  }
  if (c.type === 1) activity.url = c.streamLink;
  const buttons = [['buttonOneText', 'buttonOneURL'], ['buttonTwoText', 'buttonTwoURL']].filter(([text]) => c[text]);
  if (buttons.length) {
    activity.buttons = buttons.map(([text]) => c[text]);
    activity.metadata = { button_urls: buttons.map(([, url]) => c[url]) };
  }
  if (c.timestampMode === 'elapsed') activity.timestamps = { start: startedAt ?? now };
  if (c.timestampMode === 'midnight') {
    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    activity.timestamps = { start: midnightAt ?? midnight.getTime() };
  }
  if (c.timestampMode === 'custom') {
    activity.timestamps = {};
    if (c.startTime) activity.timestamps.start = Number(c.startTime);
    if (c.endTime) activity.timestamps.end = Number(c.endTime);
  }
  if (c.type === 0 && c.partySize && c.partyMaxSize) activity.party = { size: [Number(c.partySize), Number(c.partyMaxSize)] };

  // A failed image should not prevent a text activity or the other image from working.
  const assets = {};
  await Promise.all([['large', 'imageBig'], ['small', 'imageSmall']].map(async ([size, key]) => {
    if (!c[key]) return;
    try {
      const id = await resolveAsset?.(activity.application_id, c[key]);
      if (!id || typeof id !== 'string') throw new Error('No image was returned.');
      assets[`${size}_image`] = id;
      if (c[`${key}Tooltip`]) assets[`${size}_text`] = c[`${key}Tooltip`];
      if (c[`${key}URL`]) assets[`${size}_url`] = c[`${key}URL`];
    } catch {
      warnings.push(`${size === 'large' ? 'Large' : 'Small'} image could not load. Check the application ID and use an uploaded asset key or a direct image URL.`);
    }
  }));
  if (Object.keys(assets).length) activity.assets = assets;
  return { activity, warnings };
}
