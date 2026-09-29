(() => {
/*! Profile Status Presets for Revenge 1.0.0
 * Copyright (c) 2026 Fluttershy2008-mlp. SPDX-License-Identifier: GPL-3.0-or-later
 * https://github.com/Fluttershy2008-mlp/lol/tree/main/profile-status-presets
 */
'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later */

const EXPIRIES = [
  ['never', "Don't clear"], ['30m', '30 minutes'], ['1h', '1 hour'],
  ['4h', '4 hours'], ['today', 'Today'],
];

function parseEmoji(input) {
  const value = String(input ?? '').trim();
  if (!value) return { emojiId: '', emojiName: '', animated: false };
  const custom = /^<(a?):([A-Za-z0-9_]{1,32}):([0-9]{17,20})>$/.exec(value);
  if (custom) return { emojiId: custom[3], emojiName: custom[2], animated: custom[1] === 'a' };
  if (value.length > 100 || /[<>:\s]/.test(value) || /^[\x00-\x7F]+$/.test(value)) {
    throw new Error('Paste a Unicode emoji or a custom emoji in <:name:ID> format.');
  }
  return { emojiId: '', emojiName: value, animated: false };
}

function emojiInput(status) {
  if (!status?.emojiName && !status?.emojiId) return '';
  return status.emojiId ? `<${status.animated ? 'a' : ''}:${status.emojiName || 'emoji'}:${status.emojiId}>` : status.emojiName;
}

function validatePreset(draft) {
  const name = String(draft.name ?? '').trim();
  const text = String(draft.text ?? '');
  if (!name || name.length > 40) throw new Error('Give your preset a name of 1–40 characters.');
  if (text.length > 128) throw new Error('Custom statuses can contain up to 128 characters.');
  const emoji = parseEmoji(draft.emoji ?? emojiInput(draft));
  if (!text.trim() && !emoji.emojiName && !emoji.emojiId) throw new Error('Add status text or an emoji. Use Clear current status to remove your status.');
  if (!EXPIRIES.some(([key]) => key === draft.clearAfter)) throw new Error('Choose when the status should clear.');
  return { name, text, ...emoji, clearAfter: draft.clearAfter };
}

function expiration(clearAfter, now) {
  const minutes = { '30m': 30, '1h': 60, '4h': 240 }[clearAfter];
  if (minutes) return now + minutes * 60000;
  if (clearAfter === 'today') {
    const end = new Date(now);
    end.setHours(24, 0, 0, 0);
    return end.getTime();
  }
  return 0;
}

function statusPayload(preset, now) {
  if (!preset) return null;
  return {
    text: preset.text, emojiId: preset.emojiId || '', emojiName: preset.emojiName || '',
    expiresAtMs: expiration(preset.clearAfter, now), createdAtMs: now,
  };
}

function normalizeStatus(raw, now = Date.now()) {
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

function sameStatus(a, b) {
  return Boolean(a && b && a.text === b.text && a.emojiId === b.emojiId && a.emojiName === b.emojiName);
}

function createPresetStore(storage, changed = () => {}, now = Date.now) {
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

/* SPDX-License-Identifier: GPL-3.0-or-later */

function createDiscordAdapter(V, now = Date.now) {
  const byProps = (...keys) => { try { return V.metro.findByProps(...keys); } catch { return undefined; } };
  const byStore = name => { try { return V.metro.findByStoreName(name); } catch { return undefined; } };
  function protoActions() {
    const named = byProps('PreloadedUserSettingsActionCreators')?.PreloadedUserSettingsActionCreators;
    if (typeof named?.updateAsync === 'function') return named;
    // A frequent-settings or guild-settings serializer can also expose
    // updateAsync. Select the preloaded user schema explicitly.
    let candidates = [];
    try { candidates = V.metro.findByPropsAll?.('updateAsync', 'ProtoClass') ?? []; } catch {}
    candidates.push(byProps('updateAsync', 'ProtoClass'));
    return candidates.find(m => typeof m?.updateAsync === 'function'
      && /(^|\.)PreloadedUserSettings$/.test(m.ProtoClass?.typeName ?? ''));
  }
  function account() {
    try { return byStore('UserStore')?.getCurrentUser?.()?.id ?? null; } catch { return null; }
  }
  function currentStatus() {
    const proto = byStore('UserSettingsProtoStore');
    try {
      const group = proto?.settings?.status;
      // An empty group means the status was cleared. Do not resurrect a
      // stale presence activity from another store in that case.
      if (group != null) return normalizeStatus(group.customStatus, now());
      const legacy = byStore('UserSettingsStore');
      if (legacy && 'customStatus' in legacy) return normalizeStatus(legacy.customStatus, now());
      const ownId = account();
      if (!ownId) return null;
      const activities = byStore('PresenceStore')?.getActivities?.(ownId);
      return normalizeStatus(activities?.find(a => a?.type === 4), now());
    } catch { return null; }
  }
  function httpClient() { return V.metro.common?.RestAPI ?? byProps('getAPIBaseURL', 'get') ?? byProps('get', 'post', 'patch', 'del'); }
  function capability() {
    if (protoActions()) return 'native';
    return typeof httpClient()?.patch === 'function' ? 'rest' : null;
  }
  async function update(status, expectedAccount) {
    if (!expectedAccount || String(account()) !== String(expectedAccount)) throw new Error('Your Discord account changed. Open the presets page again.');
    if (byStore('ConnectionStore')?.isConnected?.() === false) throw new Error('Discord is offline. Reconnect and try again.');
    const actions = protoActions();
    let result;
    if (actions) {
      const value = status ? {
        text: status.text,
        emojiId: status.emojiId || '0', emojiName: status.emojiName || '',
        expiresAtMs: String(status.expiresAtMs || 0), createdAtMs: String(status.createdAtMs),
      } : undefined;
      // Only replace customStatus. Keep online/idle/DND/invisible and every
      // unrelated setting exactly as Discord supplied them.
      result = await actions.updateAsync('status', draft => {
        if (String(account()) !== String(expectedAccount)) throw new Error('Your Discord account changed. Open the presets page again.');
        draft.customStatus = value;
      }, 0);
    } else {
      const api = httpClient();
      if (typeof api?.patch !== 'function') throw new Error('Discord’s status update module is unavailable. Restart Discord and try again.');
      result = await api.patch({ url: '/users/@me/settings', body: { custom_status: status ? {
        text: status.text,
        emoji_id: status.emojiId || null, emoji_name: status.emojiName || null,
        expires_at: status.expiresAtMs ? new Date(status.expiresAtMs).toISOString() : null,
      } : null } });
    }
    // Some wrappers resolve non-2xx responses instead of rejecting them.
    if (result?.ok === false || Number(result?.status) >= 400) {
      const error = new Error(result?.body?.message || 'Discord could not update your status.');
      error.status = result.status; error.body = result.body;
      throw error;
    }
    // Never try a second writer after a request fails: that could duplicate a
    // write or bypass Discord's rate limit. Surface its failure to the user.
    return result;
  }
  return { account, currentStatus, capability, update, byProps, byStore };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */

function createController({ storage, discord, now = Date.now }) {
  const listeners = new Set();
  let active = false, busy = false, generation = 0, notice = '', error = '', noticeOwner = null, retryAt = 0;
  const emit = () => { for (const fn of listeners) { try { fn(); } catch {} } };
  const store = createPresetStore(storage, emit, now);
  function owner(expected) {
    const id = discord.account();
    if (!active) throw new Error('Enable Profile Status Presets first.');
    if (!id) throw new Error('Sign in to Discord first.');
    if (expected != null && String(id) !== String(expected)) throw new Error('Your Discord account changed. Open the presets page again.');
    return String(id);
  }
  function getState() {
    const rawId = discord.account(), accountId = rawId ? String(rawId) : null;
    return { active, busy, accountId, presets: store.list(accountId), current: discord.currentStatus(),
      notice: noticeOwner === accountId ? notice : '', error: noticeOwner === accountId ? error : '' };
  }
  async function apply(id, expectedAccount) {
    const accountId = owner(expectedAccount);
    if (busy) throw new Error('A status update is still in progress.');
    if (now() < retryAt) throw new Error(`Discord asked you to wait ${Math.ceil((retryAt - now()) / 1000)} seconds before trying again.`);
    const preset = id == null ? null : store.list(accountId).find(p => p.id === id);
    if (id != null && !preset) throw new Error('This preset is no longer available.');
    if (preset) validatePreset(preset);
    const run = generation;
    busy = true; error = ''; notice = 'Updating status…'; noticeOwner = accountId; emit();
    try {
      await discord.update(statusPayload(preset, now()), accountId);
      if (active && generation === run && String(discord.account()) === accountId) {
        notice = preset ? `Applied “${preset.name}”.` : 'Custom status cleared.';
      }
      return true;
    } catch (cause) {
      const limited = Number(cause?.status ?? cause?.statusCode) === 429;
      if (limited) retryAt = now() + Math.max(1, Number(cause?.body?.retry_after) || 5) * 1000;
      const message = limited ? `Discord is limiting status changes. Try again in ${Math.ceil((retryAt - now()) / 1000)} seconds.`
        : cause?.body?.message || cause?.message || 'Could not update your status. Please try again.';
      if (active && generation === run && String(discord.account()) === accountId) { notice = ''; error = message; }
      throw new Error(message);
    } finally { busy = false; emit(); }
  }
  return {
    getState, apply, refresh: emit,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start() { active = true; generation++; emit(); },
    stop() { active = false; generation++; notice = ''; error = ''; emit(); },
    save(draft, id, expectedAccount) { return store.save(owner(expectedAccount), draft, id); },
    remove(id, expectedAccount) { store.remove(owner(expectedAccount), id); },
    capture(expectedAccount) {
      owner(expectedAccount);
      const status = discord.currentStatus();
      if (!status) throw new Error('You do not have a custom status to save yet.');
      return { name: '', text: status.text, emoji: emojiInput(status), clearAfter: 'never' };
    },
  };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */

function createSettings({ React, RN, controller, getTheme }) {
  const h = React.createElement;
  const Pressable = RN.Pressable ?? RN.TouchableOpacity;
  const KeyboardView = RN.KeyboardAvoidingView ?? RN.View;
  const alertError = error => RN.Alert.alert('Profile Status Presets', error?.message || 'Please try again.');
  const run = callback => () => {
    try { const result = callback(); if (result?.catch) result.catch(alertError); } catch (error) { alertError(error); }
  };

  function AccountPage({ state }) {
    const [draft, setDraft] = React.useState(null);
    const [query, setQuery] = React.useState('');
    const scheme = typeof RN.useColorScheme === 'function' ? RN.useColorScheme() : 'dark';
    const dark = (getTheme() ?? scheme) !== 'light';
    const colors = dark
      ? { bg: '#18191c', card: '#27292e', input: '#1c1e22', text: '#f3f4f6', muted: '#bbc0cc', accent: '#a8b0ff', border: '#515764', danger: '#ff9a9f', success: '#79dbaa' }
      : { bg: '#f2f3f5', card: '#ffffff', input: '#f2f3f5', text: '#202227', muted: '#505866', accent: '#4752c4', border: '#b9bec9', danger: '#b22331', success: '#19663c' };
    const text = (value, style = {}, props = {}) => h(RN.Text, { ...props, style: { color: colors.text, fontSize: 15, lineHeight: 22, ...style } }, value);
    const note = (value, style) => text(value, { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5, ...style });
    const locked = !state.active || !state.accountId;
    const button = (label, onPress, { primary = false, danger = false, disabled = false, key, compact = false } = {}) => h(Pressable, {
      key, onPress: run(onPress), disabled: disabled || locked,
      accessibilityRole: 'button', accessibilityLabel: label,
      accessibilityState: { disabled: disabled || locked },
      style: { minHeight: 44, justifyContent: 'center', paddingVertical: 11, paddingHorizontal: compact ? 13 : 16,
        marginTop: 10, marginRight: compact ? 8 : 0, borderRadius: 10, borderWidth: primary ? 0 : 1,
        borderColor: colors.border, backgroundColor: primary ? '#4752c4' : colors.card,
        opacity: disabled || locked ? 0.45 : 1 },
    }, text(label, { color: primary ? '#ffffff' : danger ? colors.danger : colors.accent, textAlign: 'center', fontWeight: '700' }));
    const input = (label, value, onChangeText, extra = {}) => h(RN.View, { style: { marginTop: 15 } },
      text(label, { fontWeight: '600', marginBottom: 6 }),
      h(RN.TextInput, { accessibilityLabel: label, value, onChangeText,
        placeholderTextColor: colors.muted, selectionColor: colors.accent,
        style: { minHeight: 48, backgroundColor: colors.input, color: colors.text, borderWidth: 1,
          borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 }, ...extra }),
    );
    function preview(status) {
      if (!status) return note('No custom status set.');
      const emoji = status.emojiId
        ? h(RN.Image, { accessibilityLabel: status.emojiName || 'Custom emoji', source: { uri: `https://cdn.discordapp.com/emojis/${status.emojiId}.${status.animated ? 'gif' : 'png'}?size=64` }, style: { width: 24, height: 24, marginRight: 8 } })
        : status.emojiName ? text(status.emojiName, { fontSize: 23, lineHeight: 28, marginRight: 8 }) : null;
      return h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', marginTop: 7 } }, emoji,
        text(status.text || 'Emoji only', { flex: 1 }, { selectable: true }));
    }
    const openNew = () => setDraft({ id: null, name: '', text: '', emoji: '', clearAfter: 'never' });
    const openCurrent = () => {
      const current = controller.capture(state.accountId);
      setDraft({ ...current, name: current.text.slice(0, 40).trim() || 'Current status' });
    };
    const edit = preset => setDraft({ ...preset, emoji: emojiInput(preset) });
    const field = (key, value) => setDraft(previous => previous && ({ ...previous, [key]: value }));
    const filtered = state.presets.filter(p => `${p.name} ${p.text}`.toLowerCase().includes(query.toLowerCase()));
    const card = { backgroundColor: colors.card, padding: 16, borderRadius: 13, marginTop: 14 };

    return h(RN.View, { style: { flex: 1, backgroundColor: colors.bg } },
      h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: 16, paddingBottom: 60 } },
        text('Profile Status Presets', { fontSize: 24, lineHeight: 30, fontWeight: '800' }),
        note('Your statuses, ready when you are. Tap Apply to switch.'),
        locked ? note(state.active ? 'Sign in to Discord to use your presets.' : 'Enable the plugin to use your presets.', { color: colors.danger }) : null,
        h(RN.View, { style: card }, text('Current status', { fontWeight: '700' }), preview(state.current),
          h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
            button('Save current status', openCurrent, { compact: true, disabled: state.busy || !state.current }),
            button('Clear current status', () => RN.Alert.alert('Clear your status?', 'Your saved presets will stay available.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: run(() => controller.apply(null, state.accountId)) },
            ]), { compact: true, danger: true, disabled: state.busy || !state.current }),
          ),
        ),
        state.notice ? text(state.notice, { color: colors.success, marginTop: 12 }, { accessibilityLiveRegion: 'polite' }) : null,
        state.error ? text(state.error, { color: colors.danger, marginTop: 12 }, { accessibilityLiveRegion: 'polite' }) : null,
        button('+ New preset', openNew, { primary: true }),
        text(`Saved presets (${state.presets.length})`, { fontSize: 19, fontWeight: '700', marginTop: 24 }),
        note('Saved on this device, separately for each Discord account.'),
        state.presets.length > 5 ? input('Search presets', query, setQuery, { placeholder: 'Name or status text', autoCapitalize: 'none' }) : null,
        !state.presets.length ? h(RN.View, { style: card }, text('Add your first preset', { fontWeight: '700' }),
          note('Try Gaming, Studying or Sleeping. Add text, an optional emoji, and a clear-after time.')) : null,
        state.presets.length && !filtered.length ? note('No presets match your search.') : null,
        ...filtered.map(preset => h(RN.View, { key: preset.id, style: card },
          text(preset.name, { fontSize: 17, fontWeight: '700' }), preview(preset),
          note(`${EXPIRIES.find(([key]) => key === preset.clearAfter)?.[1] || "Don't clear"}${sameStatus(state.current, preset) ? ' · Current status' : ''}`),
          button(state.busy ? 'Updating…' : `Apply ${preset.name}`, () => controller.apply(preset.id, state.accountId), { primary: true, disabled: state.busy }),
          h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
            button(`Edit ${preset.name}`, () => edit(preset), { compact: true, disabled: state.busy }),
            button(`Delete ${preset.name}`, () => RN.Alert.alert('Delete preset?', `Remove “${preset.name}” from your saved presets? Your current status will stay as it is.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: run(() => controller.remove(preset.id, state.accountId)) },
            ]), { compact: true, danger: true, disabled: state.busy }),
          ),
        )),
        note('Quick access: Settings → Revenge → Profile Status Presets, or use /statuspresets in a chat.', { marginTop: 22 }),
        note('Expiry starts each time you apply a preset. “Today” clears at your phone’s next midnight. Custom emojis follow Discord’s normal access and Nitro rules.'),
        note('Version 1.0.0', { marginTop: 18 }),
      ),
      draft ? h(RN.Modal, { visible: true, animationType: 'slide', onRequestClose: () => setDraft(null), presentationStyle: 'pageSheet' },
        h(KeyboardView, { style: { flex: 1, backgroundColor: colors.bg }, behavior: RN.Platform?.OS === 'ios' ? 'padding' : undefined },
          h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: 20, paddingTop: 32, paddingBottom: 65 } },
            text(draft.id ? 'Edit preset' : 'New preset', { fontSize: 24, lineHeight: 30, fontWeight: '800' }),
            input('Preset name', draft.name, value => field('name', value), { maxLength: 40, placeholder: 'Gaming' }),
            input('Status text', draft.text, value => field('text', value), { maxLength: 128, placeholder: 'Playing with friends', multiline: true }),
            note(`${draft.text.length}/128 characters`),
            input('Emoji (optional)', draft.emoji, value => field('emoji', value), { maxLength: 100, placeholder: '🎮 or <:name:123456789012345678>', autoCapitalize: 'none', autoCorrect: false }),
            note('Paste an emoji, or save your current status to reuse its custom emoji.'),
            text('Clear after', { fontWeight: '700', marginTop: 20 }),
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
              ...EXPIRIES.map(([key, label]) => h(Pressable, { key,
                accessibilityRole: 'radio', accessibilityLabel: label, accessibilityState: { checked: draft.clearAfter === key },
                onPress: () => field('clearAfter', key),
                style: { minHeight: 44, marginTop: 8, marginRight: 8, padding: 12, borderRadius: 9, borderWidth: 1,
                  borderColor: draft.clearAfter === key ? '#4752c4' : colors.border, backgroundColor: draft.clearAfter === key ? '#4752c4' : colors.card },
              }, text(label, { color: draft.clearAfter === key ? '#ffffff' : colors.text }))),
            ),
            button('Save preset', () => { controller.save(draft, draft.id, state.accountId); setDraft(null); }, { primary: true }),
            button('Cancel', () => setDraft(null)),
            note('Saving keeps it ready for later. Tap Apply on the preset to update your Discord profile.'),
          ),
        ),
      ) : null,
    );
  }

  return function ProfileStatusPresetsSettings() {
    const [, refresh] = React.useState(0);
    React.useEffect(() => controller.subscribe(() => refresh(value => value + 1)), []);
    const state = controller.getState();
    // Closing an editor on account switch prevents saving account A's draft
    // into account B. Every mutation independently checks the account too.
    return h(AccountPage, { key: `${state.accountId || 'signed-out'}:${state.active}`, state });
  };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */

const SHORTCUT_KEY = 'PROFILE_STATUS_PRESETS_FLUTTERSHY_SETTINGS';
const CONFIG = 'SETTING_RENDERER_CONFIG';
const BRIDGE = Symbol.for('profile-status-presets.settings.renderer.v1');
const HIDDEN_ROW = Object.freeze({
  type: 'pressable', parent: null, title: () => 'Profile Status Presets', useTitle: () => 'Profile Status Presets',
  usePredicate: () => false, onPress: () => {}, withArrow: true,
});

// Keep the native renderer and the menu row in sync. Other sidebar plugins may
// have replaced Revenge's dynamic getter with a captured renderer map.
function connectSettingsRenderer(constants, renderer) {
  if (!constants) return undefined;
  let state;
  try {
    state = constants[BRIDGE];
    if (!state) {
      state = { row: HIDDEN_ROW, getter: undefined };
      Object.defineProperty(constants, BRIDGE, { value: state, configurable: true });
    }
  } catch { return undefined; }

  function ensure() {
    try {
      const previous = Object.getOwnPropertyDescriptor(constants, CONFIG);
      // Another plugin can wrap our getter and still preserve this entry. Do
      // not keep wrapping each other on every settings row render.
      if (constants[CONFIG]?.[SHORTCUT_KEY] === state.row) return true;
      if (previous?.configurable === false) return false;

      // Call the prior accessor on each read. Taking a snapshot here would hide
      // later rows from Revenge or other plugins, recreating this crash.
      let assigned = false, value = previous?.value ?? constants[CONFIG];
      const getter = () => ({
        ...(previous?.get && !assigned ? previous.get.call(constants) : value),
        [SHORTCUT_KEY]: state.row,
      });
      Object.defineProperty(constants, CONFIG, {
        configurable: true, enumerable: previous?.enumerable ?? true,
        get: getter,
        set(next) {
          if (previous?.set) previous.set.call(constants, next);
          else { assigned = true; value = next; }
        },
      });
      state.getter = getter;
      return constants[CONFIG][SHORTCUT_KEY] === state.row;
    } catch { return false; }
  }

  state.row = renderer;
  if (!ensure()) { state.row = HIDDEN_ROW; return undefined; }
  return {
    ensure,
    release() {
      if (state.row === renderer) state.row = HIDDEN_ROW;
      // Native settings can retain an old array of keys while the screen is
      // open. A hidden, parentless record keeps those keys valid after unload.
      // Reuse this one bridge on re-enable rather than stacking new accessors.
    },
  };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */


// Revenge exposes this registry at bunny.ui.settings.registeredSections.
// Extend the existing section; registerSection("Revenge") would replace its rows.
function registerSettingsShortcut({ settingsAPI, Settings, constants, treeManager, patcher,
  openSettings, renderIcon, getAssetID, log = () => {} }) {
  const sections = settingsAPI?.registeredSections;
  if (!sections || typeof sections !== 'object') {
    log('Settings shortcut is unavailable on this Revenge version. Use the plugin settings button.');
    return () => {};
  }
  // Match stable row keys so the shortcut also works with translated headings.
  const rows = Object.values(sections).find(items => Array.isArray(items)
    && items.some(item => item?.key === 'BUNNY_PLUGINS'));
  if (!rows || rows.some(item => item?.key === SHORTCUT_KEY)) return () => {};

  let icon;
  for (const name of ['StatusIcon', 'PencilIcon', 'WrenchIcon']) {
    try {
      const id = getAssetID?.(name);
      if (id != null) { icon = id; break; }
    } catch {}
  }
  let active = true;
  const renderer = {
    type: 'pressable', parent: null,
    title: () => 'Profile Status Presets', useTitle: () => 'Profile Status Presets', icon,
    IconComponent: icon != null && renderIcon ? () => renderIcon(icon) : undefined,
    usePredicate: () => active,
    onPress: () => { if (active) openSettings?.(); },
    withArrow: true,
  };
  // Do this BEFORE exposing the key in registeredSections. Otherwise Discord's
  // getAncestors reads .parent on an undefined renderer and crashes Settings.
  const bridge = connectSettingsRenderer(constants, renderer);
  if (!bridge) {
    active = false;
    log('Could not register a native settings row safely. Use the plugin settings button.');
    return () => {};
  }
  let unpatch;
  try {
    if (typeof treeManager?.getAncestors === 'function' && typeof patcher?.before === 'function') {
      unpatch = patcher.before('getAncestors', treeManager, args => {
        // Repair only our own entry if another plugin replaces the renderer
        // accessor later. Let the original tree/blocking logic run unchanged.
        if (args[0] === SHORTCUT_KEY) bridge.ensure();
      });
    }
  } catch {}
  const row = {
    key: SHORTCUT_KEY,
    title: () => 'Profile Status Presets',
    icon,
    usePredicate: renderer.usePredicate,
    rawTabsConfig: renderer,
    // Revenge supplies the native screen header, navigation and back button.
    render: async () => ({ default: Settings }),
  };
  try {
    const anchor = rows.findIndex(item => item?.key === 'BUNNY_PLUGINS');
    rows.splice(anchor + 1, 0, row);
  } catch {
    active = false; unpatch?.(); bridge.release();
    log('Could not add the settings shortcut. Use the plugin settings button.');
    return () => {};
  }

  return () => {
    active = false;
    // Some plugins replace the section array. Remove our row wherever it moved,
    // retaining every other row (including Account Switcher).
    for (const items of new Set([rows, ...Object.values(sections)])) {
      if (!Array.isArray(items)) continue;
      const index = items.indexOf(row);
      if (index !== -1) {
        try { items.splice(index, 1); } catch {}
      }
    }
    unpatch?.(); unpatch = undefined;
    bridge.release();
  };
}


/* SPDX-License-Identifier: GPL-3.0-or-later */

function createPlugin(V, host = globalThis) {
  if (!V?.metro?.common?.React || !V?.plugin?.storage) throw new Error('Profile Status Presets requires Revenge Vendetta plugin support.');
  const { React, ReactNative: RN } = V.metro.common;
  const discord = createDiscordAdapter(V);
  const controller = createController({ storage: V.plugin.storage, discord });
  const disposers = [];
  let active = false;
  const log = error => { try { V.logger?.warn?.('[Profile Status Presets]', error?.message || String(error)); } catch {} };
  const Settings = createSettings({ React, RN, controller, getTheme: () => discord.byStore('ThemeStore')?.theme });
  function openSettings() {
    if (!active) return;
    try {
      const navigation = discord.byProps('getRootNavigationRef')?.getRootNavigationRef?.();
      if (!navigation?.navigate) throw new Error('Open Revenge → Plugins → Profile Status Presets → Settings.');
      navigation.navigate('BUNNY_CUSTOM_PAGE', { title: 'Profile Status Presets', render: () => React.createElement(Settings) });
    } catch (error) { RN.Alert.alert('Profile Status Presets', error?.message || 'Could not open presets.'); }
  }
  function onLoad() {
    if (active) return;
    active = true;
    controller.start();
    // Refresh on profile updates and account switches; no polling or automatic
    // status changes run at startup, in the background, or during unload.
    for (const name of ['UserStore', 'UserSettingsProtoStore', 'UserSettingsStore', 'PresenceStore', 'ThemeStore']) {
      try {
        const store = discord.byStore(name);
        if (typeof store?.addChangeListener === 'function' && typeof store?.removeChangeListener === 'function') {
          store.addChangeListener(controller.refresh);
          disposers.push(() => store.removeChangeListener(controller.refresh));
        }
      } catch (error) { log(error); }
    }
    try {
      const subscription = RN.AppState?.addEventListener?.('change', state => { if (state === 'active') controller.refresh(); });
      if (subscription?.remove) disposers.push(() => subscription.remove());
    } catch (error) { log(error); }
    try {
      disposers.push(registerSettingsShortcut({
        settingsAPI: host.bunny?.ui?.settings ?? host.window?.bunny?.ui?.settings,
        Settings, constants: discord.byProps('SETTING_RENDERER_CONFIG'),
        treeManager: discord.byProps('getAncestors', 'isBlocked'), patcher: V.patcher, openSettings,
        renderIcon: source => React.createElement(RN.Image, { source, style: { width: 24, height: 24 } }),
        getAssetID: name => V.ui?.assets?.getAssetIDByName(name), log,
      }));
    } catch (error) { log(error); }
    try {
      const unregister = V.commands?.registerCommand?.({
        name: 'statuspresets', displayName: 'statuspresets',
        description: 'Open your saved profile statuses', displayDescription: 'Open your saved profile statuses',
        type: 1, inputType: 1, applicationId: '-1', options: [],
        execute: () => { openSettings(); return undefined; },
      });
      if (typeof unregister === 'function') disposers.push(unregister);
    } catch (error) { log(error); }
  }
  function onUnload() {
    active = false;
    controller.stop();
    for (const dispose of disposers.splice(0).reverse()) { try { dispose(); } catch (error) { log(error); } }
  }
  return { onLoad, onUnload, settings: Settings };
}

return createPlugin(vendetta);
})()
