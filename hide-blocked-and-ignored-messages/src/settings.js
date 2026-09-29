/* SPDX-License-Identifier: CC0-1.0 */
export function createSettings(V, refresh) {
  return function HideBlockedSettings() {
    const { React, ReactNative: RN } = V.metro.common;
    const storage = V.plugin.storage;
    const [, redraw] = React.useState(0);
    const dark = (RN.useColorScheme?.() ?? 'dark') !== 'light';
    const text = dark ? '#f2f3f5' : '#202225';
    const muted = dark ? '#b9bec9' : '#505663';
    const rows = [
      ['blocked', 'Hide blocked users', 'Remove their messages from chat.'],
      ['ignored', 'Hide ignored users', 'Remove their messages from chat.'],
      ['removeReplies', 'Hide replies to them', 'Also hide messages replying to a blocked or ignored user.'],
      ['removeBotCommands', 'Hide their bot commands', 'Hide bot responses to slash commands and interactions they trigger.'],
    ];
    const h = React.createElement;
    return h(RN.ScrollView, { style: { flex: 1, backgroundColor: dark ? '#18191c' : '#f2f3f5' },
      contentContainerStyle: { padding: 18, paddingBottom: 40 } },
    h(RN.Text, { style: { color: text, fontSize: 22, fontWeight: '700', marginBottom: 10 } }, 'Hide blocked and ignored messages'),
    ...rows.map(([key, label, note]) => h(RN.View, { key, style: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: dark ? '#34363c' : '#d5d8df' } },
    h(RN.View, { style: { flex: 1, paddingRight: 14 } },
      h(RN.Text, { style: { color: text, fontSize: 16, fontWeight: '600' } }, label),
      h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 4 } }, note)),
    h(RN.Switch, { value: storage[key] !== false, accessibilityLabel: label,
      onValueChange(value) { storage[key] = value; redraw(n => n + 1); refresh(); } }))),
    h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 20, marginTop: 18 } },
      'Hidden messages leave no replacement text. If an open chat does not refresh, switch channels and return.'),
    h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 20, marginTop: 10 } },
      'Bot filtering needs Discord to identify who triggered the response. Ordinary bot posts without that information stay visible.'),
    h(RN.Text, { style: { color: muted, fontSize: 12, marginTop: 18 } }, 'Version 1.1.0'));
  };
}
