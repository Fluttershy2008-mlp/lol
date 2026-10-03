/* SPDX-License-Identifier: GPL-3.0-or-later */

export function createUI({ React, RN, getState, subscribe, updateOptions, requestReadAll, refresh, getTheme }) {
  const h = React.createElement;
  const Pressable = RN.Pressable ?? RN.TouchableOpacity;
  function useState() {
    const [, redraw] = React.useState(0);
    React.useEffect(() => subscribe(() => redraw(value => value + 1)), []);
    return getState();
  }

  function ReadAllOverlay() {
    const state = useState();
    const [keyboard, setKeyboard] = React.useState(false);
    React.useEffect(() => {
      const show = RN.Keyboard?.addListener?.('keyboardDidShow', () => setKeyboard(true));
      const hide = RN.Keyboard?.addListener?.('keyboardDidHide', () => setKeyboard(false));
      return () => { show?.remove?.(); hide?.remove?.(); };
    }, []);
    if (!state.active || !state.options.showButton || keyboard) return null;
    return h(RN.View, {
      pointerEvents: 'box-none',
      style: { position: 'absolute', [state.options.side]: 12, bottom: 145, zIndex: 9999 },
    }, h(Pressable, {
      accessibilityRole: 'button', accessibilityLabel: 'Mark all server and DM notifications as read',
      accessibilityState: { disabled: state.busy, busy: state.busy },
      onPress: requestReadAll, disabled: state.busy,
      style: { minHeight: 44, minWidth: 92, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 22,
        backgroundColor: '#4752c4', opacity: state.busy ? 0.6 : 1, elevation: 6,
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
    }, h(RN.Text, { style: { color: '#fff', fontSize: 14, lineHeight: 22, fontWeight: '700', textAlign: 'center' } },
      state.busy ? 'Reading…' : '✓ Read All')));
  }

  function Settings() {
    const state = useState();
    const scheme = typeof RN.useColorScheme === 'function' ? RN.useColorScheme() : 'dark';
    const dark = (getTheme() ?? scheme) !== 'light';
    const colors = dark
      ? { bg: '#18191c', card: '#27292e', text: '#f3f4f6', muted: '#b6bcc7', border: '#4e535c' }
      : { bg: '#f2f3f5', card: '#fff', text: '#202227', muted: '#5b626f', border: '#c3c7cf' };
    const text = (value, style = {}) => h(RN.Text, { style: { color: colors.text, fontSize: 15, lineHeight: 22, ...style } }, value);
    const button = (label, onPress, primary = false) => h(Pressable, {
      accessibilityRole: 'button', onPress, disabled: state.busy || !state.active,
      accessibilityState: { disabled: state.busy || !state.active },
      style: { padding: 14, marginTop: 12, borderRadius: 10, backgroundColor: primary ? '#4752c4' : colors.card,
        borderColor: colors.border, borderWidth: primary ? 0 : 1, opacity: state.busy ? 0.6 : 1 },
    }, text(label, { color: primary ? '#fff' : colors.text, textAlign: 'center', fontWeight: '700' }));
    const toggle = (key, title, detail) => h(RN.View, { key,
      style: { flexDirection: 'row', alignItems: 'center', marginTop: 12, padding: 14, backgroundColor: colors.card, borderRadius: 10 },
    }, h(RN.View, { style: { flex: 1, marginRight: 12 } }, text(title, { fontWeight: '600' }), text(detail, { color: colors.muted, fontSize: 13 })),
    h(RN.Switch, { value: state.options[key], accessibilityLabel: title, onValueChange: value => updateOptions({ [key]: value }) }));
    return h(RN.ScrollView, { style: { flex: 1, backgroundColor: colors.bg }, contentContainerStyle: { padding: 16, paddingBottom: 60 } },
      text('Read All Notifications', { fontSize: 24, lineHeight: 30, fontWeight: '700' }),
      text('Mark unread server channels, forums, media channels, posts, threads, DMs and group DMs as read in one tap.', { color: colors.muted, marginTop: 8 }),
      text('Includes unfollowed forum posts and cached archived threads. Posts Discord has not loaded cannot be checked individually.',
        { color: colors.muted, marginTop: 8, fontSize: 13 }),
      text('This does not delete messages, mention history or Android notifications.',
        { color: colors.muted, marginTop: 8, fontSize: 13 }),
      button(state.busy ? 'Reading…' : '✓ Read all notifications', requestReadAll, true),
      button('Check unread channels', refresh),
      text(state.message, { marginTop: 14 }),
      ...state.warnings.map((warning, index) => h(RN.Text, { key: index, style: { color: colors.muted, marginTop: 8, fontSize: 13 } }, warning)),
      toggle('showButton', 'Show floating button', 'Display Read All in the chat view. It hides while typing.'),
      toggle('confirm', 'Confirm before reading', 'Ask before marking your current unread servers and DMs as read.'),
      button(`Button position: ${state.options.side === 'left' ? 'Left' : 'Right'} — tap to change`,
        () => updateOptions({ side: state.options.side === 'left' ? 'right' : 'left' })),
      text(state.overlay ? 'Floating button is ready. Reopen a chat if it is not visible yet.'
        : 'The floating button is unavailable in this layout. Use the button above or /readall.', { color: colors.muted, marginTop: 18, fontSize: 13 }),
      text('Based on Vencord ReadAllNotificationsButton by kemo, Vendicated and contributors. GPL-3.0-or-later.',
        { color: colors.muted, marginTop: 22, fontSize: 12 }),
    );
  }
  return { ReadAllOverlay, Settings };
}
