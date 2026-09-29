/* SPDX-License-Identifier: GPL-3.0-or-later */
import { EXPIRIES, emojiInput, sameStatus } from './presets.js';

export function createSettings({ React, RN, controller, getTheme }) {
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
