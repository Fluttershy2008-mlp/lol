/* SPDX-License-Identifier: CC0-1.0 */
import { normalizeServerIds, parseServerIds } from './servers.js';
import { normalizeWhitelist, parseWhitelistInput } from './whitelist.js';
export function createSettings(V, refresh) {
  return function HideBlockedSettings() {
    const { React, ReactNative: RN } = V.metro.common;
    const storage = V.plugin.storage;
    const [, redraw] = React.useState(0);
    const [manageServers, setManageServers] = React.useState(false);
    const [serverInput, setServerInput] = React.useState('');
    const [serverFeedback, setServerFeedback] = React.useState('');
    const [manageIds, setManageIds] = React.useState(false);
    const [input, setInput] = React.useState('');
    const [feedback, setFeedback] = React.useState('');
    const dark = (RN.useColorScheme?.() ?? 'dark') !== 'light';
    const text = dark ? '#f2f3f5' : '#202225';
    const muted = dark ? '#b9bec9' : '#505663';
    const rows = [
      ['hideServerPings', 'Hide pings from selected servers', 'Hide their Recent Activity/mentions, mention badges and in-app notification banners. Uses your saved server IDs. OFF restores displayed mentions. Android push notifications while Discord is closed still depend on Discord’s notification settings.'],
      ['hideServerIcons', 'Hide selected server icons', 'ON hides the icons; OFF shows them again immediately. Uses your saved server IDs, including folder previews. This switch works independently of message and channel hiding.'],
      ['hideServerChannels', 'Hide channel lists in selected servers', 'Also hide their text channels, forums, media channels, categories, voice channels and threads from the sidebar. Uses the same server ID list below.'],
      ['hideServers', 'Hide messages from selected servers', 'Hide all chat messages in servers on your server ID list, including threads. Your user whitelist does not override this.'],
      ['blocked', 'Hide blocked users', 'Remove their messages from chat. You can still look them up in search.'],
      ['ignored', 'Hide ignored users', 'Remove their messages from chat. You can still look them up in search.'],
      ['removeMentions', 'Hide mentions of them', 'Remove their @mentions from other people’s messages. The rest of the message stays visible.'],
      ['removeReplies', 'Hide replies to them', 'Also hide messages replying to a blocked or ignored user.'],
      ['removeBotCommands', 'Hide their bot commands', 'Hide bot responses to slash commands and interactions they trigger.'],
      ['whitelistEnabled', 'Show whitelisted users', 'Show selected blocked or ignored users as normal chat messages, without the blocked-message bar. Add their Discord user IDs below.'],
    ];
    const h = React.createElement;
    const serverIds = normalizeServerIds(storage.hiddenServerIds);
    const ids = normalizeWhitelist(storage.whitelistedIds);
    const border = dark ? '#34363c' : '#d5d8df';
    const button = (label, action, props = {}) => h(RN.Pressable, {
      accessibilityRole: 'button', accessibilityLabel: label, onPress: action,
      style: { minHeight: 44, justifyContent: 'center', padding: 12,
        borderWidth: 1, borderColor: border, borderRadius: 8, marginTop: 10 }, ...props,
    }, h(RN.Text, { style: { color: text, fontSize: 15, fontWeight: '600' } }, label));
    function addServers() {
      const parsed = parseServerIds(serverInput);
      if (parsed.invalid.length) { setServerFeedback('Enter valid server IDs (17–20 digits). Nothing was added.'); return; }
      if (!parsed.ids.length) { setServerFeedback('Paste at least one server ID first.'); return; }
      storage.hiddenServerIds = [...new Set([...serverIds, ...parsed.ids])];
      storage.hideServers = true;
      setServerInput(''); setServerFeedback('Server list saved. Messages from these servers are now hidden.');
      redraw(n => n + 1); refresh();
    }
    function removeServer(id) {
      storage.hiddenServerIds = serverIds.filter(value => value !== id);
      setServerFeedback('Server removed. Its messages follow your user hide settings again.');
      redraw(n => n + 1); refresh();
    }
    function addIds() {
      const parsed = parseWhitelistInput(input);
      if (parsed.invalid.length) {
        setFeedback('Enter valid Discord user IDs (17–20 digits) or user mentions. Nothing was added.');
        return;
      }
      if (!parsed.ids.length) { setFeedback('Paste at least one Discord user ID first.'); return; }
      const next = [...new Set([...ids, ...parsed.ids])];
      storage.whitelistedIds = next;
      storage.whitelistEnabled = true;
      setInput(''); setFeedback('Whitelist saved and enabled.');
      redraw(n => n + 1); refresh();
    }
    function removeId(id) {
      storage.whitelistedIds = ids.filter(value => value !== id);
      setFeedback('ID removed. Their messages follow your hide settings again.');
      redraw(n => n + 1); refresh();
    }
    return h(RN.ScrollView, { style: { flex: 1, backgroundColor: dark ? '#18191c' : '#f2f3f5' },
      contentContainerStyle: { padding: 18, paddingBottom: 40 } },
    h(RN.Text, { style: { color: text, fontSize: 22, fontWeight: '700', marginBottom: 10 } }, 'Hide blocked and ignored messages'),
    ...rows.map(([key, label, note]) => h(RN.View, { key, style: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: dark ? '#34363c' : '#d5d8df' } },
    h(RN.View, { style: { flex: 1, paddingRight: 14 } },
      h(RN.Text, { style: { color: text, fontSize: 16, fontWeight: '600' } }, label),
      h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 4 } }, note)),
    h(RN.Switch, { value: key === 'whitelistEnabled' ? storage[key] === true : storage[key] !== false, accessibilityLabel: label,
      onValueChange(value) { storage[key] = value; redraw(n => n + 1); refresh(); } }))),
    button(`Manage hidden server IDs (${serverIds.length})`, () => setManageServers(value => !value),
      { accessibilityState: { expanded: manageServers } }),
    manageServers ? h(RN.View, { style: { marginTop: 12, padding: 14, borderWidth: 1, borderColor: border, borderRadius: 10 } },
      h(RN.Text, { style: { color: text, fontSize: 17, fontWeight: '700' } }, 'Hidden server IDs'),
      h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 6 } },
        'Enable Developer Mode in Discord, then open a server’s menu and copy its server ID. Paste IDs separated by spaces, commas or new lines. This hides messages in that server, not DMs from its members. Channel list hiding uses the switch above. It does not mute notifications or leave the server. Explicit search stays available.'),
      h(RN.TextInput, { value: serverInput, onChangeText: value => { setServerInput(value); setServerFeedback(''); },
        accessibilityLabel: 'Server IDs to hide', placeholder: 'Paste Discord server IDs',
        placeholderTextColor: muted, multiline: true, autoCorrect: false, autoCapitalize: 'none',
        style: { color: text, minHeight: 80, padding: 12, marginTop: 12, textAlignVertical: 'top', borderWidth: 1, borderColor: border, borderRadius: 8 } }),
      button('Add and hide servers', addServers),
      serverFeedback ? h(RN.Text, { accessibilityLiveRegion: 'polite', style: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 10 } }, serverFeedback) : null,
      ...serverIds.map(id => h(RN.View, { key: id, style: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: border } },
        h(RN.Text, { selectable: true, style: { color: text, fontSize: 14 } }, id),
        button('Remove server', () => removeServer(id), { accessibilityLabel: `Remove hidden server ${id}` }))),
      !serverIds.length ? h(RN.Text, { style: { color: muted, fontSize: 13, marginTop: 14 } }, 'No hidden servers. Add a server ID to hide its chat messages.') : null
    ) : null,
    button(`Manage whitelisted IDs (${ids.length})`, () => setManageIds(value => !value),
      { accessibilityState: { expanded: manageIds } }),
    manageIds ? h(RN.View, { style: { marginTop: 12, padding: 14, borderWidth: 1,
      borderColor: border, borderRadius: 10 } },
      h(RN.Text, { style: { color: text, fontSize: 17, fontWeight: '700' } }, 'Whitelisted user IDs'),
      h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 6 } },
        'Paste one or more IDs, separated by spaces, commas or new lines. Add and show enables the whitelist. These users remain blocked or ignored in Discord.'),
      h(RN.TextInput, { value: input, onChangeText: value => { setInput(value); setFeedback(''); },
        accessibilityLabel: 'User IDs to whitelist', placeholder: 'Paste Discord user IDs',
        placeholderTextColor: muted, multiline: true, autoCorrect: false, autoCapitalize: 'none',
        style: { color: text, minHeight: 80, padding: 12, marginTop: 12, textAlignVertical: 'top',
          borderWidth: 1, borderColor: border, borderRadius: 8 } }),
      button('Add and show', addIds),
      feedback ? h(RN.Text, { accessibilityLiveRegion: 'polite', style: {
        color: muted, fontSize: 13, lineHeight: 19, marginTop: 10 } }, feedback) : null,
      ids.length ? ids.map(id => h(RN.View, { key: id, style: { marginTop: 12, paddingTop: 12,
        borderTopWidth: 1, borderTopColor: border } },
        h(RN.Text, { selectable: true, style: { color: text, fontSize: 14 } }, id),
        button('Remove ID', () => removeId(id), { accessibilityLabel: `Remove whitelisted user ${id}` })))
        : h(RN.Text, { style: { color: muted, fontSize: 13, marginTop: 14 } }, 'No whitelisted IDs. All blocked and ignored users follow your hide settings.'),
      h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 14 } },
        'Whitelisted users appear as normal messages, without a blocked-message bar. Keep Hide blocked users and Hide ignored users enabled to hide everyone else.')
    ) : null,
    h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 20, marginTop: 18 } },
      'Search includes blocked and ignored users, including from: suggestions and message results. Your chat whitelist does not restrict search.'),
    h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 20, marginTop: 18 } },
      'Hidden messages leave no replacement text. If an open chat does not refresh, switch channels and return.'),
    h(RN.Text, { style: { color: muted, fontSize: 13, lineHeight: 20, marginTop: 10 } },
      'Bot filtering needs Discord to identify who triggered the response. Ordinary bot posts without that information stay visible.'),
    h(RN.Text, { style: { color: muted, fontSize: 12, marginTop: 18 } }, `Version ${V.plugin.manifest?.version ?? '1.5.6'}`));
  };
}
