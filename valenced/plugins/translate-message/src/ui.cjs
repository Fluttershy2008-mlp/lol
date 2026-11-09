/*
 * React Native adaptation of Vencord TranslateModal.tsx, settings.tsx and TranslateIcon.tsx.
 * Copyright (c) 2023-2026 Vendicated and contributors.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
'use strict';

function TranslationSettingsView({ api, getSession, subscribe, save, compact = false, onClose }) {
    const U = api.unscoped, { React, ReactNative: RN } = U.react, h = React.createElement;
    const [, refresh] = React.useState(0);
    const [picker, setPicker] = React.useState(null), [query, setQuery] = React.useState('');
    const [deepKey, setDeepKey] = React.useState(api.jsonStorage.cache?.deeplApiKey ?? '');
    const [kagiToken, setKagiToken] = React.useState(api.jsonStorage.cache?.kagiSession ?? '');
    const optional = fn => { try { return fn(); } catch { return undefined; } };
    const scheme = RN.useColorScheme?.(), theme = optional(() => U.discord.flux.Stores.ThemeStore.theme);
    const light = theme ? theme === 'light' : scheme === 'light';
    const C = light
        ? { bg: '#F3F3F7', card: '#FFFFFF', text: '#20212B', muted: '#656775', line: '#E6E5EE', accent: '#6750C8', soft: '#EEE9FF' }
        : { bg: '#18191F', card: '#25262E', text: '#F3F2F7', muted: '#B0AFBF', line: '#383842', accent: '#B5A4FF', soft: '#383049' };
    React.useEffect(() => {
        let mounted = true;
        const update = () => { if (mounted) refresh(value => value + 1); };
        const remove = subscribe(update), removeStorage = api.jsonStorage.subscribe?.(update);
        Promise.resolve(api.jsonStorage.loaded ? api.jsonStorage.cache : api.jsonStorage.get()).then(update).catch(() => {});
        return () => { mounted = false; remove?.(); removeStorage?.(); };
    }, [api]);
    const session = getSession(), config = session?.controller.settings() ?? normalizeSettings(api.jsonStorage.cache);
    const stats = session?.controller.stats() ?? { translated: 0, pending: 0, cached: 0 };
    const outgoing = session?.outgoing;
    const recoveries = outgoing?.recoveries() ?? [];
    const openPicker = key => { setQuery(''); setPicker(key); };
    const text = (value, style = {}, props = {}) => h(RN.Text, { ...props, style: { color: C.text, fontSize: 16, ...style } }, value);
    const detail = value => text(value, { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 4 });
    const card = (key, ...children) => h(RN.View, { key, style: { backgroundColor: C.card, borderRadius: 18, marginBottom: 16, overflow: 'hidden' } }, ...children);
    const line = key => h(RN.View, { key, style: { height: 1, marginHorizontal: 18, backgroundColor: C.line } });
    function row(key, label, description, press, trailing, disabled = false) {
        return h(RN.Pressable, { key, onPress: press, disabled,
            accessibilityRole: press ? 'button' : undefined,
            accessibilityLabel: description ? label + '. ' + description : label,
            accessibilityState: { disabled },
            style: ({ pressed }) => ({ padding: 17, flexDirection: 'row', alignItems: 'center', opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }),
        }, h(RN.View, { style: { flex: 1, marginRight: 12 } }, text(label, { fontWeight: '600' }), description ? detail(description) : null), trailing);
    }
    const switchRow = (key, label, description, value, change, disabled = false) => row(key, label, description, undefined,
        h(RN.Switch, { value, disabled, onValueChange: change, accessibilityLabel: label,
            trackColor: { false: C.line, true: '#7963CD' } }), disabled);
    const definitions = [
        ['receivedInput', 'Incoming messages from'], ['receivedOutput', 'Incoming messages to'],
        ['sentInput', 'Your messages from'], ['sentOutput', 'Your messages to'],
    ];
    const providers = [ ['google', 'Google Translate'], ['deepl', 'DeepL Free'], ['deepl-pro', 'DeepL Pro'], ['kagi', 'Kagi Translate'] ];
    const providerName = providers.find(([id]) => id === config.service)?.[1] ?? 'Google Translate';
    const sections = [];
    sections.push(card('languages', ...definitions.flatMap(([key, label], i) => [
        ...(i ? [line(key + '-line')] : []),
        row(key, label, languageName(config[key], config.service), () => openPicker(key), text('⌄', { color: C.accent, fontSize: 22 })),
    ])));
    sections.push(card('auto',
        switchRow('autoTranslate', 'Auto Translate', 'Automatically translate your messages before sending. Tap the chat-bar Translate button to toggle. Hold it to open settings.',
            config.autoTranslate, value => save({ autoTranslate: value }), Boolean(session && !session.outgoingConnected)),
        line('auto-line'), switchRow('tooltip', 'Auto-translation notice', 'Briefly show the target language after an outgoing translation.',
            config.showAutoTranslateTooltip, value => save({ showAutoTranslateTooltip: value })),
        !session?.outgoingConnected ? h(RN.View, { key: 'waiting', style: { padding: 17, paddingTop: 0 } }, detail('Open a chat to connect outgoing translation.')) : null));
    sections.push(card('provider', row('service', 'Translation provider', providerName, () => openPicker('service'), text('⌄', { color: C.accent, fontSize: 22 })),
        config.service.startsWith('deepl') ? h(RN.View, { key: 'deepl-key', style: { padding: 17, paddingTop: 0 } },
            detail('DeepL API key · stored in this plugin’s local settings'),
            h(RN.TextInput, { value: deepKey, onChangeText: setDeepKey, secureTextEntry: true,
                accessibilityLabel: 'DeepL API key', placeholder: 'Enter your DeepL API key', placeholderTextColor: C.muted,
                autoCapitalize: 'none', autoCorrect: false,
                onBlur: () => save({ deeplApiKey: deepKey }), onSubmitEditing: () => save({ deeplApiKey: deepKey }),
                style: { color: C.text, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 10 } }),
            detail('As in Vencord, a missing key or exhausted DeepL quota falls back to Google Translate.')) : null,
        config.service === 'kagi' ? h(RN.View, { key: 'kagi-key', style: { padding: 17, paddingTop: 0 } },
            detail('Kagi session token · stored in this plugin’s local settings'),
            h(RN.TextInput, { value: kagiToken, onChangeText: setKagiToken, secureTextEntry: true,
                accessibilityLabel: 'Kagi session token', placeholder: 'Enter your Kagi session token', placeholderTextColor: C.muted,
                autoCapitalize: 'none', autoCorrect: false,
                onBlur: () => save({ kagiSession: kagiToken }), onSubmitEditing: () => save({ kagiSession: kagiToken }),
                style: { color: C.text, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 10 } })) : null));
    sections.push(card('incoming-options',
        switchRow('feedback', 'Message translation notices', 'Brief notices when restoring originals or when no translation is needed. Successful translations are silent.',
            config.showToasts, value => save({ showToasts: value }))));
    sections.push(card('session', row('count', 'This session', stats.translated + ' translated · ' + (stats.pending + (outgoing?.count() ?? 0)) + ' in progress'),
        line('restore-line'), row('restore', 'Revert all messages', 'Restore incoming messages and cancel pending incoming translations.',
            () => session?.controller.restoreAll(), text('↶', { color: C.accent, fontSize: 25 }), !session || (!stats.translated && !stats.pending)),
        line('cache-line'), row('cache', 'Clear translation cache', stats.cached + ' incoming results kept in memory.',
            () => session?.controller.clearCache(), undefined, !session || !stats.cached)));
    if (recoveries.length) sections.push(card('recoveries',
        h(RN.View, { style: { padding: 17 } }, text('Unsent originals', { fontWeight: '700' }), detail('These messages were not sent because outgoing translation stopped. Select the text to copy it.')),
        ...recoveries.map((item, index) => h(RN.View, { key: index, style: { padding: 17, paddingTop: 0 } },
            text(item.content, { lineHeight: 23 }, { selectable: true }),
            h(RN.Pressable, { onPress: () => outgoing.forgetRecovery(index), accessibilityRole: 'button', accessibilityLabel: 'Dismiss unsent original', style: { paddingVertical: 10 } }, text('Dismiss', { color: C.accent }))))));
    if (!compact) sections.push(card('about', h(RN.View, { style: { padding: 17 } },
        text('Vencord Translate, on mobile', { fontWeight: '700', marginBottom: 8 }),
        detail('The language tables, provider requests, four language controls and outgoing auto-translation are ported from Vendicated/Vencord. The desktop modal and chat button are adapted to native mobile controls.'),
        text('Hold a received message', { fontWeight: '700', marginTop: 16 }),
        detail('Translate replaces the text locally, like Translate Message v1.0.2. The same menu button becomes Revert Message to restore the original, or Cancel Translation while waiting. Other people still see the original. Open this panel from the Translate icon beside the chat input.'),
        text('Text and privacy', { fontWeight: '700', marginTop: 16 }),
        detail('Only selected message text, or messages you send while Auto Translate is enabled, goes to your chosen service. Code, spoilers, mentions and links are replaced with placeholders. Your Discord token, identity and attachments are never sent to translation providers. Originals and translations are kept only in memory.'))));
    const title = h(RN.View, { style: { padding: compact ? 17 : 0, paddingBottom: 18, flexDirection: 'row', alignItems: 'center' } },
        h(RN.View, { style: { width: 50, height: 50, backgroundColor: C.soft, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 13 } },
            h(RN.Image, { source: { uri: TRANSLATE_ICON_URI }, style: { width: 27, height: 27, tintColor: C.accent } })),
        h(RN.View, { style: { flex: 1 } }, text('Translate', { fontSize: 25, fontWeight: '700' }), detail('Vencord → Valenced')),
        onClose ? h(RN.Pressable, { onPress: onClose, hitSlop: 12, accessibilityLabel: 'Close Translate', accessibilityRole: 'button', style: { padding: 8 } }, text('×', { fontSize: 30, color: C.muted })) : null);
    let choices = [];
    if (picker === 'service') choices = providers;
    else if (picker) choices = Object.entries(languageTable(config.service)).filter(([code]) => picker.endsWith('Input') || (code !== 'auto' && code !== ''));
    choices = choices.filter(([code, name]) => (name + ' ' + code).toLowerCase().includes(query.toLowerCase().trim()));
    function choose(code) {
        if (picker === 'service') {
            const defaults = normalizeSettings({ service: code });
            void save({ service: code, receivedInput: defaults.receivedInput, receivedOutput: defaults.receivedOutput,
                sentInput: defaults.sentInput, sentOutput: defaults.sentOutput });
        } else void save({ [picker]: code });
        setPicker(null);
    }
    return h(React.Fragment, null,
        h(RN.View, { style: { flex: 1, backgroundColor: C.bg } }, compact ? title : null,
            h(RN.ScrollView, { style: { flex: 1 }, keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: compact ? 16 : 20, paddingBottom: 36 } },
                compact ? null : title, ...sections,
                detail('Vencord Translate 2.0.4 · ' + (session?.composerConnected ? 'Chat-bar button connected' : 'Waiting for the chat composer')))),
        h(RN.Modal, { visible: picker !== null, transparent: true, animationType: 'slide', onRequestClose: () => setPicker(null) },
            h(RN.View, { style: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' } },
                h(RN.Pressable, { style: { flex: 1 }, onPress: () => setPicker(null), accessibilityLabel: 'Close language picker', accessibilityRole: 'button' }),
                h(RN.SafeAreaView, { style: { height: '76%', backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' } },
                    h(RN.View, { style: { padding: 20, flexDirection: 'row', alignItems: 'center' } },
                        text(picker === 'service' ? 'Translation provider' : definitions.find(([key]) => key === picker)?.[1] ?? 'Choose language', { flex: 1, fontSize: 21, fontWeight: '700' }),
                        h(RN.Pressable, { onPress: () => setPicker(null), accessibilityLabel: 'Close language picker', accessibilityRole: 'button', hitSlop: 12 }, text('Done', { color: C.accent, fontWeight: '600' }))),
                    h(RN.TextInput, { value: query, onChangeText: setQuery, placeholder: picker === 'service' ? 'Search providers' : 'Search languages',
                        placeholderTextColor: C.muted, accessibilityLabel: 'Search languages', autoCorrect: false, autoCapitalize: 'none',
                        style: { color: C.text, backgroundColor: C.card, borderRadius: 12, padding: 14, marginHorizontal: 20, marginBottom: 10 } }),
                    h(RN.FlatList, { data: choices, keyExtractor: item => item[0], keyboardShouldPersistTaps: 'handled',
                        contentContainerStyle: { paddingHorizontal: 20, paddingBottom: 30 }, ListEmptyComponent: detail('No matching option.'),
                        renderItem: ({ item: [code, name] }) => row(code, name, code || 'Automatic detection', () => choose(code),
                            code === config[picker] ? text('✓', { color: C.accent, fontSize: 22 }) : null) })))));
}

// NODE_EXPORTS
module.exports = { TranslationSettingsView };
