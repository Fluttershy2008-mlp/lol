/* SPDX-License-Identifier: GPL-3.0-or-later */
import { userMention } from './tracker.js';

const HISTORY_FILTERS = [['all', 'All'], ['friends', 'Friends'], ['requests', 'Requests'], ['guilds', 'Servers'], ['groups', 'Groups']];
const HISTORY_LABELS = { friends: 'Lost friend', requests: 'Request cancelled', guilds: 'Server removal', groups: 'Group removal' };

export function createSettings({ React, RN, tracker, getStatus, subscribe, testNotification, getTheme, copyMention, openProfile, profileSession }) {
  const h = React.createElement;
  const Pressable = RN.Pressable ?? RN.TouchableOpacity;
  const choices = [
    ['friends', 'Lost friends', 'When someone leaves your friends list.'],
    ['friendRequestCancels', 'Cancelled requests', 'When an incoming request disappears.'],
    ['servers', 'Server removals', 'When you are no longer in a server.'],
    ['groups', 'Group removals', 'When you are no longer in a group DM.'],
    ['offlineRemovals', 'Check after reconnecting', 'Include changes made while Discord was offline.'],
    ['notices', 'Persistent popup', 'Keep an alert visible until you dismiss it.'],
  ];

  return function RelationshipNotifierSettings() {
    const [, refresh] = React.useState(0);
    const [view, setView] = React.useState({ owner: tracker.getAccountId(), filter: 'all', query: '', limit: 20 });
    React.useEffect(() => subscribe(() => refresh(value => value + 1)), []);
    const scheme = typeof RN.useColorScheme === 'function' ? RN.useColorScheme() : 'dark';
    const dark = (getTheme() ?? scheme) !== 'light';
    const colors = dark
      ? { bg: '#15161b', card: '#22242c', inset: '#1b1d24', text: '#f3f4fa', muted: '#adb3c4', accent: '#a7afff', selected: '#343c69', border: '#353947', green: '#88dfb0', danger: '#ffb0b9' }
      : { bg: '#f2f3f8', card: '#ffffff', inset: '#e9ecf5', text: '#202332', muted: '#596277', accent: '#454fbd', selected: '#e4e7ff', border: '#d7dce8', green: '#206d48', danger: '#b12d46' };
    const text = (value, style = {}, props = {}) => h(RN.Text, { ...props, style: { color: colors.text, fontSize: 15, lineHeight: 21, ...style } }, value);
    const note = (value, style = {}) => text(value, { color: colors.muted, fontSize: 13, lineHeight: 19, ...style });
    const card = { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' };
    const button = (label, onPress, props = {}) => h(Pressable, {
      accessibilityRole: 'button', accessibilityLabel: label, onPress,
      ...props, style: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, backgroundColor: colors.inset, ...props.style },
    }, text(label, { color: colors.accent, fontWeight: '700', textAlign: 'center', fontSize: 13 }));
    const heading = (title, detail) => h(RN.View, { style: { marginTop: 24, marginBottom: 10 } },
      text(title, { fontSize: 18, lineHeight: 24, fontWeight: '800' }), detail ? note(detail, { marginTop: 3 }) : null);
    const status = getStatus();
    const options = tracker.options();
    const history = tracker.history();
    const counts = tracker.counts();
    const owner = tracker.getAccountId();
    const profileContext = profileSession?.();
    // Account changes must never keep a previous account's search or pagination.
    const activeQuery = view.owner === owner ? view.query : '';
    const activeFilter = view.owner === owner ? view.filter : 'all';
    const updateSearch = (nextFilter, nextQuery) => {
      setView({ owner, filter: nextFilter, query: nextQuery, limit: 20 });
    };
    const term = activeQuery.trim().toLocaleLowerCase();
    const filtered = history.filter(entry => (activeFilter === 'all' || entry.category === activeFilter)
      && (!term || [entry.name, entry.id, entry.text, HISTORY_LABELS[entry.category]].some(value => String(value ?? '').toLocaleLowerCase().includes(term))));
    const limit = view.owner === owner ? view.limit : 20;
    const visible = filtered.slice(0, limit);
    const colorFor = category => category === 'friends' ? colors.danger : category === 'requests' ? colors.accent : colors.green;
    let lastDay = null;
    const historyNodes = visible.map((entry, index) => {
      const date = new Date(entry.at);
      const day = Number.isNaN(date.getTime()) ? 'Earlier' : date.toLocaleDateString();
      const dayHeading = day !== lastDay ? note(day, { fontWeight: '700', marginTop: 14, marginBottom: 8 }) : null;
      lastDay = day;
      const mention = userMention(entry);
      return h(RN.View, { key: `${entry.at}:${entry.category}:${entry.id}:${index}` }, dayHeading,
        h(RN.View, { style: { ...card, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: colorFor(entry.category) } },
          h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 } },
            entry.icon && RN.Image ? h(RN.Image, { source: { uri: entry.icon }, accessibilityIgnoresInvertColors: true, style: { width: 36, height: 36, borderRadius: 12, marginRight: 10 } })
              : h(RN.View, { style: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.inset, alignItems: 'center', justifyContent: 'center', marginRight: 10 } }, text((entry.name || '?').slice(0, 1).toUpperCase(), { color: colorFor(entry.category), fontWeight: '800' })),
            h(RN.View, { style: { flex: 1 } }, text(entry.name || HISTORY_LABELS[entry.category] || 'Relationship change', { fontWeight: '700' }),
              note(HISTORY_LABELS[entry.category] || 'Relationship change', { color: colorFor(entry.category), fontSize: 12 }))),
          text(entry.text),
          mention ? h(Pressable, {
            accessibilityRole: 'button', accessibilityLabel: `Open profile for ${entry.name || entry.id}`,
            accessibilityHint: 'Opens the Discord profile. Long-press to copy the user mention.',
            onPress: () => openProfile(entry.id, profileContext), onLongPress: () => copyMention(mention), style: { paddingVertical: 10, minHeight: 44 },
          }, text(`User ID: ${mention}`, { color: colors.accent, fontSize: 13 }, { selectable: true }), text('View profile ›', { color: colors.accent, fontWeight: '700', fontSize: 13 })) : null,
          mention ? button('Copy mention', () => copyMention(mention), { accessibilityLabel: `Copy ${mention}`, style: { alignSelf: 'flex-start', marginBottom: 10 } }) : null,
          note(`${Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${entry.offline ? ' · After reconnecting' : ' · While connected'}`, { fontSize: 12 }),
        ));
    });
    const rows = list => h(RN.View, { style: card }, ...list.map(([key, title, detail], index) => h(RN.View, {
      key, style: { paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: index ? 1 : 0, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center' },
    }, h(RN.View, { style: { flex: 1, paddingRight: 12 } }, text(title, { fontWeight: '700' }), note(detail, { marginTop: 3 })),
    h(RN.Switch, { accessibilityLabel: title, value: Boolean(options[key]), onValueChange: value => tracker.setOption(key, value), trackColor: { true: '#5865f2', false: colors.border } }))));

    return h(RN.ScrollView, { style: { flex: 1, backgroundColor: colors.bg }, keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: 16, paddingBottom: 80 } },
      text('Relationship Notifier', { fontSize: 26, lineHeight: 32, fontWeight: '800' }),
      note('Your friends, requests and communities — in one place.', { marginTop: 4 }),
      h(RN.View, { style: { ...card, padding: 16, marginTop: 16 } },
        h(RN.View, { style: { flexDirection: 'row', alignItems: 'center' } },
          h(RN.View, { style: { width: 8, height: 8, borderRadius: 4, backgroundColor: status.message.startsWith('Monitoring') ? colors.green : colors.muted, marginRight: 8 } }),
          text(status.message, { fontWeight: '700', fontSize: 13, flex: 1 }, { accessibilityLiveRegion: 'polite' })),
        h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 } },
          ...[['friends', 'Friends'], ['requests', 'Requests'], ['guilds', 'Servers'], ['groups', 'Groups']].map(([key, label]) => h(RN.View, { key, style: { width: '50%', padding: 8 } },
            text(String(counts[key]), { fontSize: 24, lineHeight: 30, fontWeight: '800' }), note(label)))),
        ...status.warnings.map((warning, i) => h(RN.View, { key: i, style: { marginTop: 8 } }, note(warning, { color: colors.danger }))),
      ),
      heading('What to watch', 'Choose which changes send you an alert.'), rows(choices.slice(0, 4)),
      heading('How to notify'), rows(choices.slice(4)),
      button('Test notification', testNotification, { style: { backgroundColor: colors.selected, marginTop: 12 } }),
      heading('Recent notifications', `${history.length} / 100 saved · Current account only`),
      RN.TextInput ? h(RN.TextInput, {
        accessibilityLabel: 'Search notification history', placeholder: 'Search names, IDs or notifications', placeholderTextColor: colors.muted,
        value: activeQuery, onChangeText: value => updateSearch(activeFilter, value), autoCorrect: false, autoCapitalize: 'none', clearButtonMode: 'while-editing',
        style: { color: colors.text, backgroundColor: colors.card, borderRadius: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
      }) : null,
      h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 } }, ...HISTORY_FILTERS.map(([key, label]) => button(label, () => updateSearch(key, activeQuery), {
        key, accessibilityLabel: `Filter ${label.toLowerCase()} notifications`, accessibilityState: { selected: activeFilter === key },
        style: { backgroundColor: activeFilter === key ? colors.selected : colors.card, marginRight: 6, marginBottom: 6 },
      }))),
      activeQuery ? button('Clear search', () => updateSearch(activeFilter, '')) : null,
      filtered.length ? note(`Showing ${Math.min(limit, filtered.length)} of ${filtered.length}`, { marginTop: 8 }) : h(RN.View, { style: { ...card, padding: 20, marginTop: 12 } },
        text(history.length ? 'No matching notifications' : 'All quiet for now', { fontWeight: '700', textAlign: 'center' }),
        note(history.length ? 'Try another search or category.' : 'Your first check saves a starting list. Future changes appear here.', { textAlign: 'center', marginTop: 6 })),
      ...historyNodes,
      filtered.length > limit ? button('Show more notifications', () => setView({ owner, filter: activeFilter, query: activeQuery, limit: limit + 20 }), { style: { marginTop: 8 } }) : null,
      history.length ? button('Clear notification history', () => RN.Alert.alert('Clear history?', 'This removes the saved notifications for this account.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => { if (tracker.getAccountId() === owner) tracker.clearHistory(); } },
      ]), { style: { marginTop: 16 } }) : null,
      note('Alerts appear inside Discord. Reconnect checks catch changes while you were away. Discord does not reveal whether a server removal was a kick, ban or deletion.', { marginTop: 20 }),
      note('Version 1.2.1 · Adapted from Vencord by nick and contributors · GPL-3.0-or-later', { fontSize: 11, marginTop: 16 }),
    );
  };
}
