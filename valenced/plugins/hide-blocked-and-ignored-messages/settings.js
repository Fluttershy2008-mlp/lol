/* SPDX-License-Identifier: CC0-1.0 */
// Valenced settings for the shared HideBlockedAndIgnoredMessages filters.
const HIDER_SETTINGS_TITLE = 'Hidden users & servers';
let useHiderThemeStyles;

function useHiderColors(V) {
  const scheme = V.metro.common.ReactNative.useColorScheme?.();
  let theme;
  try { theme = V.metro.findByStoreName?.('ThemeStore')?.theme; } catch {}
  const fallback = (theme ?? scheme) === 'light'
    ? { light: true, background: '#F3F5FA', surface: '#FFFFFF', inset: '#EDF0F7', line: '#DFE4EE',
        text: '#182236', muted: '#4D5C73', accent: '#443CC1', accentSurface: '#EAE8FE',
        switchOff: '#737F94', switchOn: '#5349CF', danger: '#A52841' }
    : { light: false, background: theme === 'midnight' ? '#101116' : '#161A24', surface: '#202634', inset: '#181E2A', line: '#353F52',
        text: '#F2F5FC', muted: '#B1BCD0', accent: '#C5BCFF', accentSurface: '#383557',
        switchOff: '#657289', switchOn: '#7767DF', danger: '#FFA5B7' };
  if (!useHiderThemeStyles) {
    const tokens = valenced.discord.common?.tokens?.Tokens;
    const colors = (tokens?.default ?? tokens)?.colors;
    if (colors) {
      useHiderThemeStyles = V.metro.common.stylesheet?.createStyles?.({
        background: { color: colors.BACKGROUND_BASE_LOWER },
        surface: { color: colors.BACKGROUND_SURFACE_HIGHEST },
        inset: { color: colors.BACKGROUND_BASE_LOWEST },
        line: { color: colors.BORDER_SUBTLE },
        text: { color: colors.TEXT_DEFAULT },
        muted: { color: colors.TEXT_MUTED },
        danger: { color: colors.TEXT_DANGER },
      });
    }
  }
  const themed = useHiderThemeStyles?.();
  return { ...fallback,
    background: themed?.background?.color ?? fallback.background,
    surface: themed?.surface?.color ?? fallback.surface,
    inset: themed?.inset?.color ?? fallback.inset,
    line: themed?.line?.color ?? fallback.line,
    text: themed?.text?.color ?? fallback.text,
    muted: themed?.muted?.color ?? fallback.muted,
    danger: themed?.danger?.color ?? fallback.danger,
  };
}

function createSettings(V, refresh) {
  return function HideBlockedSettings({ onClose } = {}) {
    const { React, ReactNative: RN } = V.metro.common;
    const h = React.createElement, colors = useHiderColors(V);
    const storage = V.storage.useProxy(V.plugin.storage);
    const [manager, setManager] = React.useState(null);
    const [serverInput, setServerInput] = React.useState('');
    const [userInput, setUserInput] = React.useState('');
    const [feedback, setFeedback] = React.useState(null);
    const serverIds = normalizeServerIds(storage.hiddenServerIds);
    const userIds = normalizeWhitelist(storage.whitelistedIds);
    const text = (value, style, props) => h(RN.Text, { ...props, style: { color: colors.text, fontSize: 15, ...style } }, value);
    const detail = (value, style, props) => text(value, { color: colors.muted, fontSize: 13, lineHeight: 18, ...style }, props);
    const heading = value => text(value, { fontSize: 17, fontWeight: '700', marginBottom: 8, marginLeft: 2 }, { accessibilityRole: 'header' });
    const card = { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' };
    const row = { minHeight: 54, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' };
    const divider = { borderTopWidth: 1, borderTopColor: colors.line };
    const button = (label, onPress, { accessibilityLabel = label, style, labelStyle, ...props } = {}) => h(RN.Pressable, {
      ...props, onPress, accessibilityLabel, accessibilityRole: 'button',
      style: ({ pressed }) => [{ minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
        borderRadius: 10, opacity: pressed ? 0.72 : 1 }, style],
    }, text(label, { color: colors.accent, fontWeight: '700', ...labelStyle }));

    function setOption(key, value) {
      storage[key] = value;
      refresh();
    }
    function readName(isServer, id) {
      try {
        const store = V.metro.findByStoreName?.(isServer ? 'GuildStore' : 'UserStore');
        if (isServer) return store?.getGuild?.(id)?.name;
        const user = store?.getUser?.(id);
        return user?.globalName ?? user?.username;
      } catch { return undefined; }
    }
    function editList(isServer) {
      const key = isServer ? 'hiddenServerIds' : 'whitelistedIds';
      const ids = isServer ? serverIds : userIds;
      const input = isServer ? serverInput : userInput;
      const setInput = isServer ? setServerInput : setUserInput;
      const noun = isServer ? 'server' : 'user';
      const save = () => {
        const parsed = (isServer ? parseServerIds : parseWhitelistInput)(input);
        if (parsed.invalid.length || !parsed.ids.length) {
          const message = parsed.invalid.length
            ? `Enter ${noun} IDs with 17–20 digits${isServer ? '.' : ' or paste user mentions.'}`
            : `Paste a ${noun} ID first.`;
          setFeedback({ message, error: true });
          return;
        }
        storage[key] = [...new Set([...ids, ...parsed.ids])];
        setOption(isServer ? 'hideServers' : 'whitelistEnabled', true);
        setInput('');
        setFeedback({ message: isServer ? 'Server list saved. Message hiding is on.' : 'User list saved. The whitelist is on.' });
      };
      return h(RN.View, { style: { ...divider, padding: 14 } },
        detail(isServer ? 'Copy Server ID from the server menu in Developer Mode. Separate multiple IDs with commas or new lines.'
          : 'Paste user IDs or mentions, separated by commas or new lines.'),
        h(RN.TextInput, { value: input, onChangeText: value => { setInput(value); setFeedback(null); },
          accessibilityLabel: isServer ? 'Server IDs to hide' : 'User IDs to whitelist',
          placeholder: isServer ? 'Paste server IDs' : 'Paste user IDs or mentions',
          placeholderTextColor: colors.muted, multiline: true, autoCorrect: false, autoCapitalize: 'none',
          style: { color: colors.text, backgroundColor: colors.inset, minHeight: 58, fontSize: 15, padding: 11,
            marginTop: 10, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.line, borderRadius: 10 } }),
        button(isServer ? 'Add and hide servers' : 'Add and show', save, { style: { marginTop: 8, backgroundColor: colors.accentSurface } }),
        feedback ? detail(feedback.message, { color: feedback.error ? colors.danger : colors.muted, marginTop: 8 }, { accessibilityLiveRegion: 'polite' }) : null,
        ids.length ? h(RN.View, { style: { marginTop: 10 } }, ...ids.map(id => {
          const name = readName(isServer, id);
          return h(RN.View, { key: id, style: { ...divider, ...row, paddingHorizontal: 0, paddingVertical: 5 } },
            h(RN.View, { style: { flex: 1, marginRight: 6 } },
              name ? text(name, { fontWeight: '600' }) : null,
              detail(id, name ? undefined : { color: colors.text }, { selectable: true })),
            button('Remove', () => {
              storage[key] = ids.filter(value => value !== id);
              setFeedback({ message: isServer ? 'Server removed.' : 'User removed.' });
              refresh();
            }, { accessibilityLabel: `Remove ${isServer ? 'hidden server' : 'whitelisted user'} ${id}`,
              labelStyle: { fontSize: 13, color: colors.danger } }));
        })) : detail(isServer ? 'No saved servers.' : 'No whitelisted users.', { marginTop: 10 }));
    }

    function listRow(key, title, count, label) {
      const expanded = manager === key;
      return h(React.Fragment, { key },
        h(RN.Pressable, { accessibilityLabel: `${label} (${count})`, accessibilityRole: 'button',
          accessibilityState: { expanded }, onPress() { setManager(expanded ? null : key); setFeedback(null); },
          style: ({ pressed }) => [row, key === 'users' && divider, pressed && { backgroundColor: colors.inset }] },
          text(title, { flex: 1, marginRight: 10, fontWeight: '700' }),
          text(String(count), { minWidth: 28, textAlign: 'center', paddingHorizontal: 6, paddingVertical: 3,
            borderRadius: 8, backgroundColor: colors.accentSurface, color: colors.accent, fontSize: 13, fontWeight: '700' }),
          text(expanded ? '−' : '›', { marginLeft: 10, color: colors.muted, fontSize: 22 })),
        expanded ? editList(key === 'servers') : null);
    }
    function switches(title, options) {
      return h(RN.View, { style: { marginTop: 19 } }, heading(title), h(RN.View, { style: card },
        ...options.map(([key, label, description], index) => h(RN.View, { key, style: [row, index > 0 && divider] },
          h(RN.View, { style: { flex: 1, marginRight: 10 } }, text(label, { fontWeight: '600' }), detail(description, { marginTop: 3 })),
          h(RN.Switch, { value: key === 'whitelistEnabled' ? storage[key] === true : storage[key] !== false,
            accessibilityLabel: label, accessibilityHint: description, onValueChange: value => setOption(key, value),
            trackColor: { false: colors.switchOff, true: colors.switchOn }, thumbColor: '#FFFFFF', ios_backgroundColor: colors.switchOff })))));
    }
    const memberNote = 'Filters their chat messages and member lists.';
    const android = RN.Platform?.OS === 'android';
    const version = V.plugin.version;
    return h(RN.View, { style: { flex: 1, backgroundColor: colors.background } },
      onClose ? h(RN.View, { style: { backgroundColor: colors.surface, paddingTop: android ? RN.StatusBar?.currentHeight ?? 24 : 0 } },
        typeof RN.StatusBar === 'function' ? h(RN.StatusBar, { barStyle: colors.light ? 'dark-content' : 'light-content' }) : null,
        h(RN.View, { style: { ...row, borderBottomWidth: 1, borderBottomColor: colors.line } },
          text(HIDER_SETTINGS_TITLE, { fontSize: 20, fontWeight: '800', flex: 1, marginRight: 10 }, { accessibilityRole: 'header' }),
          button('Done', onClose, { accessibilityLabel: `Close ${HIDER_SETTINGS_TITLE}`, style: { backgroundColor: colors.accentSurface } }))) : null,
      h(RN.ScrollView, { style: { flex: 1 }, keyboardShouldPersistTaps: 'handled', keyboardDismissMode: 'on-drag',
        contentContainerStyle: { padding: 14, paddingBottom: 42, width: '100%', maxWidth: 620, alignSelf: 'center' } },
        onClose ? null : text(HIDER_SETTINGS_TITLE, { fontSize: 23, fontWeight: '800', marginBottom: 12 }, { accessibilityRole: 'header' }),
        h(RN.View, { style: card },
          listRow('servers', 'Hidden servers', serverIds.length, 'Manage hidden server IDs'),
          listRow('users', 'Whitelisted users', userIds.length, 'Manage whitelisted IDs')),
        switches('User filters', [
          ['blocked', 'Hide blocked users', memberNote],
          ['ignored', 'Hide ignored users', memberNote],
          ['removeMentions', 'Hide mentions of them', 'Removes their @mentions from other messages.'],
          ['removeReplies', 'Hide replies to them', 'Hides messages that reply to these users.'],
          ['removeBotCommands', 'Hide their bot commands', 'Hides bot responses when Discord identifies the user who triggered them.'],
          ['whitelistEnabled', 'Show whitelisted users', 'Shows users on your whitelist in chat.'],
        ]),
        switches('Server filters', [
          ['hideServers', 'Hide messages from selected servers', 'Hides chat and threads. DMs with members stay visible.'],
          ['hideServerChannels', 'Hide channel lists in selected servers', 'Hides the sidebar when message hiding is on.'],
          ['hideServerIcons', 'Hide selected server icons', 'Also hides icons in server folders.'],
          ['hideServerPings', 'Hide pings from selected servers', 'Hides in-app alerts, mention badges and Recent Activity.'],
        ]),
        detail('Message search stays available. Discord controls Android push notifications.', { marginTop: 15, marginHorizontal: 2 }),
        version && detail(`Version ${version}`, { marginTop: 7, marginHorizontal: 2 })));
  };
}

function createHiddenSettingsButton(V, Settings, isActive, listeners) {
  const { React, ReactNative: RN } = V.metro.common;
  const h = React.createElement;
  let source;
  function SettingsIcon({ style, color = '#B1BCD0' } = {}) {
    if (source == null) {
      for (const name of ['EyeSlashIcon', 'CircleSlashIcon', 'ic_block', 'WrenchIcon']) {
        try { source = V.ui.assets.getAssetIDByName(name); } catch {}
        if (source != null) break;
      }
    }
    return source != null ? h(RN.Image, { source, style: [{ width: 21, height: 21, tintColor: color }, style] })
      : h(RN.Text, { style: [{ fontSize: 22, color }, style] }, '⊘');
  }
  return function HiddenSettingsButton() {
    const [open, setOpen] = React.useState(false);
    const [, redraw] = React.useState(0);
    const colors = useHiderColors(V);
    React.useEffect(() => {
      const update = () => redraw(n => n + 1);
      listeners.add(update);
      return () => listeners.delete(update);
    }, []);
    if (!isActive()) return null;
    const close = () => setOpen(false);
    const android = RN.Platform?.OS === 'android';
    const Frame = android ? RN.View : RN.SafeAreaView ?? RN.View;
    return h(React.Fragment, null,
      h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: HIDER_SETTINGS_TITLE,
        accessibilityHint: 'Opens filter settings', chatButtonsId: 'dev.fluttershy2008.hide-blocked-and-ignored-messages',
        chatButtonsLabel: HIDER_SETTINGS_TITLE, IconComponent: SettingsIcon, testID: 'hide-blocked.settings-button',
        onPress() { if (isActive()) setOpen(true); }, hitSlop: 4,
        style: ({ pressed }) => ({ width: 36, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 }) },
      h(RN.View, { style: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.accentSurface,
        justifyContent: 'center', alignItems: 'center' } }, h(SettingsIcon, { color: colors.accent }))),
      open ? h(RN.Modal, { visible: true, animationType: 'slide', presentationStyle: 'fullScreen',
        statusBarTranslucent: android, onRequestClose: close, testID: 'hide-blocked.settings-panel' },
        h(Frame, { style: { flex: 1, backgroundColor: colors.surface } }, h(Settings, { onClose: close }))) : null);
  };
}
