/* SPDX-License-Identifier: GPL-3.0-or-later */

export function createSettings({ React, RN, tracker, getStatus, subscribe, testNotification, getTheme }) {
  const h = React.createElement;
  const Pressable = RN.Pressable ?? RN.TouchableOpacity;
  const choices = [
    ['friends', 'Lost friends', 'Notify when someone is no longer on your friends list.'],
    ['friendRequestCancels', 'Cancelled friend requests', 'Watch incoming friend requests that disappear.'],
    ['servers', 'Server removals', 'Notify when you are no longer in a server.'],
    ['groups', 'Group chat removals', 'Notify when you are no longer in a group DM.'],
    ['offlineRemovals', 'Check after reconnecting', 'Compare with your last saved list after Discord connects.'],
    ['notices', 'Keep an alert on screen', 'Also show a popup that stays until you dismiss it.'],
  ];

  return function RelationshipNotifierSettings() {
    const [, refresh] = React.useState(0);
    React.useEffect(() => subscribe(() => refresh(value => value + 1)), []);
    const scheme = typeof RN.useColorScheme === 'function' ? RN.useColorScheme() : 'dark';
    const dark = (getTheme() ?? scheme) !== 'light';
    const colors = dark
      ? { bg: '#18191c', card: '#27292e', text: '#f3f4f6', muted: '#b6bcc7', accent: '#8992ff', border: '#4e535c' }
      : { bg: '#f2f3f5', card: '#ffffff', text: '#202227', muted: '#5b626f', accent: '#4752c4', border: '#c3c7cf' };
    const text = (value, style = {}) => h(RN.Text, { style: { color: colors.text, fontSize: 15, lineHeight: 21, ...style } }, value);
    const note = value => text(value, { color: colors.muted, marginTop: 6 });
    const action = (label, onPress) => h(Pressable, {
      accessibilityRole: 'button', onPress,
      style: { padding: 14, marginTop: 12, backgroundColor: colors.card, borderRadius: 10, borderColor: colors.border, borderWidth: 1 },
    }, text(label, { color: colors.accent, fontWeight: '700', textAlign: 'center' }));
    const status = getStatus();
    const options = tracker.options();
    const history = tracker.history();
    const counts = tracker.counts();
    return h(RN.ScrollView, { style: { flex: 1, backgroundColor: colors.bg }, contentContainerStyle: { padding: 16, paddingBottom: 60 } },
      text('RelationshipNotifier', { fontSize: 24, lineHeight: 30, fontWeight: '800' }),
      note('See changes to your friends, requests, servers and group chats.'),
      h(RN.View, { style: { padding: 16, marginVertical: 16, borderRadius: 12, backgroundColor: colors.card } },
        text(status.message, { fontWeight: '700' }),
        note(`${counts.friends} friends · ${counts.requests} requests · ${counts.guilds} servers · ${counts.groups} groups`),
        ...status.warnings.map((warning, i) => h(RN.Text, { key: i, style: { color: colors.muted, marginTop: 8, lineHeight: 20 } }, warning)),
      ),
      ...choices.map(([key, title, detail]) => h(RN.View, { key, style: { padding: 14, marginBottom: 8, borderRadius: 10, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center' } },
        h(RN.View, { style: { flex: 1, paddingRight: 12 } }, text(title, { fontWeight: '700' }), note(detail)),
        h(RN.Switch, { accessibilityLabel: title, value: Boolean(options[key]), onValueChange: value => tracker.setOption(key, value), trackColor: { true: '#5865f2', false: colors.border } }),
      )),
      action('Test notification', testNotification),
      text('Recent notifications', { fontSize: 20, fontWeight: '700', marginTop: 24, marginBottom: 8 }),
      note('Saved on this device for the current account. The latest 100 are kept.'),
      history.length ? null : note('No changes detected yet. The first check saves your starting list.'),
      ...history.map((entry, index) => h(RN.View, { key: `${entry.at}:${index}`, style: { padding: 14, marginTop: 10, borderRadius: 10, backgroundColor: colors.card } },
        text(entry.text), note(`${new Date(entry.at).toLocaleString()}${entry.offline ? ' · Detected after reconnecting' : ''}`),
      )),
      history.length ? action('Clear notification history', () => RN.Alert.alert('Clear history?', 'This removes the saved notifications for this account.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => tracker.clearHistory() },
      ])) : null,
      note('Alerts appear inside Discord. Android may pause the plugin when the app is closed. Changes made on another device can also appear here; Discord does not reveal whether a server removal was a kick, ban or deletion.'),
      text('1.1.0 · Adapted from Vencord by nick and contributors · GPL-3.0-or-later', { color: colors.muted, fontSize: 12, marginTop: 24 }),
    );
  };
}
