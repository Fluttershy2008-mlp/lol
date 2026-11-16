(() => {
    // SPDX-License-Identifier: MIT
    const fields = {
        messages: 'Messages',
        replyPreview: 'Reply Preview',
        chatbox: 'Chatbox',
        wordSpacing: 'Word Spacing',
        letterSpacing: 'Letter Spacing',
        lineSpacing: 'Line Spacing',
        username: 'Username',
        aboutMe: 'About Me',
        gameStatus: 'Game Status',
        profileStatus: 'Profile Status',
        timestamp: 'Timestamp',
        category: 'Channel Category Name',
        channel: 'Channel Name',
        voice: 'Voice Channel Name',
        thread: 'Channel Thread Name',
    };
    const defaults = Object.fromEntries(Object.keys(fields).map(key => [key, 0]));
    const groups = [
        ['Chat', ['messages', 'replyPreview', 'chatbox', 'wordSpacing', 'letterSpacing', 'lineSpacing', 'username', 'timestamp']],
        ['Profiles', ['aboutMe', 'gameStatus', 'profileStatus']],
        ['Channel list', ['category', 'channel', 'voice', 'thread']],
    ];
    const fontRange = [8, 48];
    const spacingControls = {
        wordSpacing: { range: [-50, 100], detail: 'Gaps between words in messages and reply previews.' },
        letterSpacing: { range: [-12, 15], detail: 'Adjusts the space between letters as a percentage of the current font size.' },
        lineSpacing: { range: [-20, 50], detail: 'Changes the space between lines in messages and the chatbox.' },
    };
    const openDyslexicPreset = {
        messages: '14', replyPreview: '12', chatbox: '14', wordSpacing: '-35', letterSpacing: '-4', lineSpacing: '-12',
    };
    const previews = {
        messages: [16, 'Hey, are you free later?'],
        replyPreview: [12, 'Yep, I can make it.'],
        chatbox: [16, 'Write a message…'],
        username: [16, 'Strawberry Whirl'],
        aboutMe: [14, 'I like baking strawberry treats.'],
        gameStatus: [12, 'Playing Minecraft'],
        profileStatus: [14, 'Currently baking'],
        timestamp: [12, 'Today at 9:24 AM'],
        category: [14, 'COMMUNITY'],
        channel: [16, '# general'],
        voice: [16, 'Voice Lounge'],
        thread: [16, 'Weekend plans'],
    };
    const nativeMethod = 'dev.fluttershy2008.better-font-scale.apply';
    const channelKinds = { 0: 'channel', 2: 'voice', 5: 'channel', 10: 'thread', 11: 'thread',
        12: 'thread', 13: 'voice', 15: 'channel', 16: 'channel' };
    let session;

    function readValue(key, value) {
        if (typeof value === 'string') {
            value = value.trim().replace(',', '.').replace('−', '-');
            if (spacingControls[key]) value = value.replace(/%$/, '').trim();
            if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)) return undefined;
            value = Number(value);
        }
        if (!Number.isFinite(value)) return undefined;
        const [min, max] = spacingControls[key]?.range ?? fontRange;
        return value === 0 || (value >= min && value <= max) ? value : undefined;
    }

    function readSettings(data) {
        return Object.fromEntries(Object.keys(fields).map(key => [key, readValue(key, data?.[key]) ?? 0]));
    }

    function installReactHooks(state) {
        const { api, values } = state;
        const { react, discord, patcher } = api.unscoped;
        const { React, ReactNative: RN, jsxRuntime } = react;
        const finders = discord.utils?.modules?.finders;
        if (!finders?.getModuleWithImportedPath) return;
        const hooked = new WeakSet();
        const wrapped = new WeakMap();
        const textTypes = new Set([RN.Text]);
        let variants = {};
        let scaleLineHeight = (height, fontScale) => height * (fontScale || 1);
        function watch(path, fn) {
            api.cleanup(finders.getModuleWithImportedPath(path, module => {
                if (!state.active) return;
                try {
                    fn(module);
                } catch (error) {
                    api.plugin?.reportError?.(error);
                }
            }));
        }
        watch('modules/screen/native/useScaledTextLineHeight.android.tsx', module => {
            if (typeof module.scaleLineHeight === 'function') scaleLineHeight = module.scaleLineHeight;
        });
        watch('design/components/Text/native/Text.tsx', module => {
            if (module.Text) textTypes.add(module.Text);
            variants = module.TextStyleSheet ?? variants;
        });

        function sizeStyle(style, size, variant = 'body-md/normal') {
            const flat = RN.StyleSheet.flatten(style);
            const base = variants[variant];
            const fontSize = flat?.fontSize ?? base?.fontSize ?? 16;
            const lineHeight = flat?.lineHeight ?? base?.lineHeight;
            return [style, { fontSize: size, lineHeight: Math.ceil(size * (
                typeof lineHeight === 'number' && fontSize > 0 ? Math.max(1, lineHeight / fontSize) : 1.25
            )) }];
        }
        function mapTree(node, project) {
            if (Array.isArray(node)) {
                const next = node.map(child => mapTree(child, project));
                return next.some((child, index) => child !== node[index]) ? next : node;
            }
            if (!React.isValidElement(node)) return node;
            const next = project(node);
            if (next !== node) return next;
            const children = mapTree(node.props.children, project);
            return children === node.props.children ? node : React.cloneElement(node, undefined, children);
        }
        function scaleText(tree, size, matches = () => true) {
            return mapTree(tree, node => {
                if (!textTypes.has(node.type) || !matches(node.props)) return node;
                const { children, style, variant } = node.props;
                return React.cloneElement(node, { style: sizeStyle(style, size, variant) }, scaleText(children, size));
            });
        }

        function wrap(type, project) {
            if (wrapped.has(type)) return wrapped.get(type);
            const render = typeof type === 'function' ? type : type.render;
            const component = typeof type === 'function'
                ? function ScaledTextSurface(props) {
                    const tree = render(props);
                    return state.active ? project(tree, props) : tree;
                }
                : React.forwardRef(function ScaledTextSurface(props, ref) {
                    const tree = render(props, ref);
                    return state.active ? project(tree, props) : tree;
                });
            wrapped.set(type, component);
            return component;
        }
        function onRender(type, project) {
            if (!type || hooked.has(type)) return;
            if (typeof type.type === 'function' && patcher?.instead) {
                api.cleanup(patcher.instead(type, 'type', (args, original) => {
                    const tree = original(...args);
                    return state.active ? project(tree, args[0]) : tree;
                }));
            } else if ((typeof type === 'function' || typeof type.render === 'function') && jsxRuntime?.beforeJSX) {
                const component = wrap(type, project);
                api.cleanup(jsxRuntime.beforeJSX(type, ([, props, key]) => [component, props, key]));
            } else return;
            hooked.add(type);
        }
        function beforeProps(type, project) {
            if (!type || !jsxRuntime?.beforeJSX) return;
            api.cleanup(jsxRuntime.beforeJSX(type, args => {
                const [element, props, key] = args;
                return state.active ? [element, project(props), key] : args;
            }));
        }
        function styledProps(props, key, property, variant) {
            const size = values[key];
            return size ? { ...props, [property]: sizeStyle(props[property], size, variant) } : props;
        }

        const itemPath = 'modules/channel_list_v2/native/items/';
        watch(itemPath + 'TextChannel.tsx', module => onRender(module.default, (tree, props) =>
            values.channel && channelKinds[props?.channel?.type] === 'channel'
                ? scaleText(tree, values.channel, text => text.experimental_useNativeText && text.lineClamp === 1 && !!text.style)
                : tree));
        watch(itemPath + 'RedesignCategory.tsx', module => onRender(module.CategoryChannel, tree =>
            values.category ? scaleText(tree, values.category, text => text.variant === 'body-sm/semibold') : tree));
        watch('modules/guild_sidebar/native/ChannelItem.tsx', module => beforeProps(module.default, props =>
            styledProps(props, channelKinds[props.channel?.type], 'textStyle', 'body-md/medium')));

        watch('modules/channel_list_v2/native/renderRedesignChannelListItem.tsx', module => {
            if (typeof module.getChannelListItemSize !== 'function') return;
            api.cleanup(patcher.instead(module, 'getChannelListItemSize', (args, original) => {
                const height = original(...args);
                if (!state.active || height <= 0 || !(values.category || values.channel || values.voice || values.thread)) return height;
                const { guildChannels, section, row, fontScale } = args[0];
                const channel = guildChannels?.getChannelFromSectionRow?.(section, row)?.channel;
                const type = channel?.record?.type;
                function extra(key) {
                    const size = values[key];
                    if (!size) return 0;
                    const lineHeight = Math.ceil(size * 20 / (key === 'category' ? 14 : 16));
                    return lineHeight <= 20 ? 0
                        : Math.max(0, scaleLineHeight(lineHeight, fontScale) - scaleLineHeight(20, fontScale));
                }
                return height + extra(type === 4 ? 'category' : channelKinds[type])
                    + (channelKinds[type] === 'channel' ? (channel.threadCount || 0) * extra('thread') : 0);
            }));
        });

        watch('modules/profile_customization/native/BioText.tsx', module => onRender(module.default, tree =>
            values.aboutMe ? scaleText(tree, values.aboutMe) : tree));
        watch('modules/activity_status/native/ActivityStatus.tsx', module => beforeProps(module.default, props =>
            styledProps(props, 'gameStatus', 'textStyle', 'body-xs/normal')));
        watch('modules/display_name_styles/native/UsernameWithEffects.tsx', module => beforeProps(module.default, props =>
            styledProps(props, 'username', 'style', props.variant)));
        watch('modules/main_tabs_v2/native/shared_components/user_list/UserRow.tsx', module => onRender(module.default, tree => {
            if (!values.username) return tree;
            const label = tree?.props?.label;
            if (React.isValidElement(label)) {
                const scaled = scaleText(label, values.username, text => text.variant === 'body-md/semibold');
                if (scaled !== label) return React.cloneElement(tree, { label: scaled });
            }
            return scaleText(tree, values.username, text => text.variant === 'body-md/semibold');
        }));
        watch('modules/user_profile/native/UserProfileCustomStatusBubble.tsx', module => onRender(module.default, tree => {
            if (!values.profileStatus) return tree;
            return mapTree(tree, node => {
                if (node.type?.name === 'TextStatusContent') {
                    const Status = wrap(node.type, result =>
                        values.profileStatus ? scaleText(result, values.profileStatus) : result);
                    return React.createElement(Status, { ...node.props, key: node.key });
                }
                if (textTypes.has(node.type) && node.props.lineClamp && node.props.onTextLayout) {
                    return React.cloneElement(node, { style: sizeStyle(node.props.style, values.profileStatus, node.props.variant) });
                }
                return node;
            });
        }));
    }

    async function syncNative(state, values) {
        const native = state.api.unscoped.modules.native;
        if (state.api.unscoped.react.ReactNative.Platform.OS !== 'android') return;
        const unavailable = 'Android font controls are unavailable. Restart Discord with the plugin enabled.';
        let result;
        try {
            result = await native?.callNativeMethod?.(nativeMethod,
                [values.messages, values.chatbox, values.username, values.timestamp, values.wordSpacing,
                    values.replyPreview, values.letterSpacing, values.lineSpacing]);
        } catch {
            throw new Error(unavailable);
        }
        if (result === 'word-spacing-unavailable') throw new Error('Word spacing is unavailable on this Discord build.');
        if (result !== true) throw new Error(unavailable);
    }

    async function start(api) {
        const state = { api, active: true, busy: false, nativeError: '', values: readSettings(api.jsonStorage.cache) };
        session = state;
        api.cleanup(() => { state.active = false; });
        installReactHooks(state);
        try {
            await syncNative(state, state.values);
        } catch (error) {
            state.nativeError = error.message;
        }
    }

    function RangeSlider({ React, RN, palette, label, range, value, format, disabled, onChange }) {
        const h = React.createElement;
        const [min, max] = range;
        const [width, setWidth] = React.useState(0);
        const touch = React.useRef(null);
        const inset = 10;
        const length = Math.max(0, width - inset * 2);
        const offset = length * (value - min) / (max - min);
        const clamp = next => Math.min(max, Math.max(min, next));

        function seek(x) {
            if (!length || !Number.isFinite(x)) return;
            const next = clamp(Math.round(min + (x - inset) / length * (max - min)));
            onChange(next);
        }

        function movement(event, release) {
            const drag = touch.current;
            if (!drag || drag.axis === 'vertical') return;
            const { pageX, pageY } = event.nativeEvent;
            const dx = pageX - drag.x;
            const dy = pageY - drag.y;
            if (!drag.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 5) {
                drag.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
            }
            if (drag.axis === 'horizontal' || (release && !drag.axis)) seek(drag.localX + dx);
        }

        return h(RN.View, {
            accessible: true, accessibilityRole: 'adjustable', accessibilityLabel: label + ' slider',
            accessibilityValue: { min, max, now: Math.round(value), text: format(value) },
            accessibilityState: { disabled },
            accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
            onAccessibilityAction: event => {
                if (disabled) return;
                const action = event.nativeEvent.actionName;
                if (action !== 'increment' && action !== 'decrement') return;
                const next = clamp(value + (action === 'increment' ? 1 : -1));
                if (next !== value) onChange(next);
            },
            onLayout: event => setWidth(event.nativeEvent.layout.width),
            onStartShouldSetResponder: () => !disabled,
            onResponderGrant: event => {
                const { locationX, pageX, pageY } = event.nativeEvent;
                touch.current = { localX: locationX, x: pageX, y: pageY, axis: null };
            },
            onResponderMove: event => movement(event, false),
            onResponderRelease: event => { movement(event, true); touch.current = null; },
            onResponderTerminate: () => { touch.current = null; },
            onResponderTerminationRequest: () => touch.current?.axis !== 'horizontal',
            style: { height: 44, justifyContent: 'center', direction: 'ltr', opacity: disabled ? 0.5 : 1 },
        }, h(RN.View, { pointerEvents: 'none', style: {
            marginHorizontal: inset, height: 4, borderRadius: 2, backgroundColor: palette.track,
        } }, length > 0 && h(RN.View, {
            style: { width: offset, height: 4, borderRadius: 2, backgroundColor: palette.accent },
        })), length > 0 && h(RN.View, { pointerEvents: 'none', style: {
            position: 'absolute', start: offset, top: 12, width: 20, height: 20, borderRadius: 10,
            backgroundColor: palette.accent,
        } }));
    }

    function SettingsComponent({ api }) {
        const { React, ReactNative: RN } = api.unscoped.react;
        const h = React.createElement;
        const state = session;
        const saved = state?.values ?? readSettings(api.jsonStorage.cache);
        const [draft, setDraft] = React.useState(() => Object.fromEntries(Object.keys(fields).map(key => [key, String(saved[key])])));
        const [open, setOpen] = React.useState(null);
        const [feedback, setFeedback] = React.useState('');
        const [saving, setSaving] = React.useState(false);
        const light = api.unscoped.discord.flux?.Stores?.ThemeStore?.theme === 'light';
        const palette = light
            ? { text: '#22242B', muted: '#4E5664', card: '#F0F2F5', input: '#FFFFFF',
                line: '#D2D6DE', track: '#B7BEC9', accent: '#4351CC', error: '#AF2136' }
            : { text: '#F2F4FA', muted: '#C1C8D5', card: '#222C40', input: '#172236',
                line: '#3A475E', track: '#495872', accent: '#ADB8FF', error: '#FFB3BE' };
        let SafeAreaView;
        try {
            SafeAreaView = api.unscoped.externals?.ReactNativeSafeAreaContext?.ReactNativeSafeAreaContext?.SafeAreaView;
        } catch {
            // Older Valenced builds may not expose the safe-area module.
        }
        const parsed = Object.fromEntries(Object.keys(fields).map(key => [key, readValue(key, draft[key])]));
        const invalid = Object.keys(fields).find(key => parsed[key] === undefined);
        const dirty = Object.keys(fields).some(key => parsed[key] !== saved[key]);

        function changeField(key, value) {
            setDraft(current => current[key] === String(value) ? current : { ...current, [key]: String(value) });
            setFeedback('');
        }

        function applyPreset() {
            RN.Keyboard.dismiss();
            setDraft(current => ({ ...current, ...openDyslexicPreset }));
            setOpen('messages');
            setFeedback('Compact settings ready. Tap Save to apply.');
        }

        async function save() {
            if (!state?.active || state.busy || invalid || !dirty) return;
            state.busy = true;
            setSaving(true);
            setFeedback('');
            RN.Keyboard.dismiss();
            try {
                await api.jsonStorage.set(parsed, true);
                Object.assign(saved, parsed);
                if (!state.active) return;
                await syncNative(state, saved);
                state.nativeError = '';
                setFeedback('Saved. Restart Discord to apply changes everywhere.');
            } catch (error) {
                setFeedback(error.message || 'Could not save Better Font Scale settings.');
            } finally {
                state.busy = false;
                setSaving(false);
            }
        }

        function button(label, action, disabled, primary) {
            return h(RN.Pressable, {
                accessibilityRole: 'button', accessibilityState: { disabled }, disabled, onPress: action,
                style: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46, borderRadius: 12,
                    paddingHorizontal: 8, backgroundColor: primary ? '#4D5ADE' : palette.card, opacity: disabled ? 0.46 : 1 },
            }, h(RN.Text, { style: { color: primary ? '#FFFFFF' : palette.text, fontSize: 15, fontWeight: '600' } }, label));
        }

        function renderField(key, index) {
            const label = fields[key];
            const spacing = spacingControls[key];
            const range = spacing?.range ?? fontRange;
            const [defaultSampleSize, sample] = previews[spacing ? 'messages' : key];
            const value = parsed[key];
            const previewSize = parsed[spacing ? 'messages' : key] || defaultSampleSize;
            const sliderValue = spacing ? value ?? 0 : previewSize;
            const format = number => spacing ? (number > 0 ? '+' : '') + number + '%' : number + ' sp';
            const isDefault = value === 0;
            const expanded = open === key;
            const summary = value === undefined ? 'Invalid' : isDefault ? 'Default' : format(value);
            const chatSample = spacing || key === 'messages' || key === 'replyPreview' || key === 'chatbox';
            const lineFactor = chatSample ? 1 + (parsed.lineSpacing ?? 0) / 100 : 1;
            const sampleStyle = { color: palette.text, fontSize: previewSize,
                lineHeight: Math.ceil(previewSize * 1.25 * lineFactor),
                ...(chatSample && { letterSpacing: previewSize * (parsed.letterSpacing ?? 0) / 100 }),
            };
            const preview = key === 'wordSpacing'
                ? h(RN.View, { accessible: true, accessibilityLabel: 'Word spacing preview', style: {
                    flexDirection: 'row', flexWrap: 'wrap', columnGap: previewSize * 0.28 * (1 + sliderValue / 100),
                } }, sample.split(' ').map((word, index) => h(RN.Text, { key: index, style: sampleStyle }, word)))
                : h(RN.Text, { style: sampleStyle },
                    key === 'lineSpacing' ? sample + '\nYep, I can make it.' : sample);
            return h(RN.View, { key, style: {
                borderTopWidth: index ? RN.StyleSheet.hairlineWidth || 1 : 0, borderColor: palette.line,
            } }, h(RN.Pressable, {
                accessibilityRole: 'button', accessibilityLabel: label, accessibilityHint: summary,
                accessibilityState: { expanded }, onPress: () => {
                    RN.Keyboard.dismiss();
                    setOpen(current => current === key ? null : key);
                },
                style: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 10,
                    flexDirection: 'row', alignItems: 'center', gap: 10 },
            }, h(RN.Text, { style: { flex: 1, color: palette.text, fontSize: 15, fontWeight: '600' } }, label),
            h(RN.Text, { style: { color: value === undefined ? palette.error : palette.muted, fontSize: 13 } }, summary),
            h(RN.Text, { accessible: false, style: { color: palette.muted, fontSize: 17 } }, expanded ? '⌄' : '›')),
            expanded && h(RN.View, { style: { paddingHorizontal: 14, paddingBottom: 14, gap: 5 } },
                spacing && h(RN.Text, { style: { color: palette.muted, fontSize: 13 } }, spacing.detail),
                h(RangeSlider, { React, RN, palette, label, range, value: sliderValue, format, disabled: saving,
                    onChange: next => changeField(key, next) }),
                h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', gap: 10 } },
                    h(RN.TextInput, { accessibilityLabel: label + (spacing ? ' exact percentage' : ' exact size'),
                        value: isDefault ? '' : draft[key], placeholder: format(sliderValue), placeholderTextColor: palette.muted,
                        keyboardType: spacing ? 'default' : 'decimal-pad', maxLength: 7,
                        selectTextOnFocus: true, editable: !saving,
                        onChangeText: next => changeField(key, next === '' ? 0 : next),
                        style: { color: value === undefined ? palette.error : palette.text, fontSize: 15,
                            backgroundColor: palette.input, borderRadius: 8, minWidth: 80, minHeight: 44, paddingHorizontal: 10 } }),
                    h(RN.Text, { style: { flex: 1, color: palette.muted, fontSize: 13 } }, spacing ? 'Exact %' : 'Exact size'),
                    h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Reset ' + label,
                        disabled: saving || isDefault, onPress: () => changeField(key, 0),
                        style: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, opacity: isDefault ? 0.45 : 1 } },
                        h(RN.Text, { style: { color: palette.accent, fontWeight: '600' } }, 'Use default'))),
                h(RN.View, { style: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
                    backgroundColor: palette.input, marginTop: 3 } }, preview)));
        }

        const bounds = spacingControls[invalid]?.range;
        const message = bounds ? fields[invalid] + ' needs a percentage from ' + bounds.join(' to ') + '.'
            : invalid ? fields[invalid] + ' needs a size from 8 to 48, or 0.' : feedback || state?.nativeError;
        return h(RN.View, { style: { flex: 1 } },
            h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', style: { flex: 1 },
                contentContainerStyle: { paddingHorizontal: 14, paddingVertical: 14, gap: 18 } },
                h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Compact OpenDyslexic',
                    accessibilityHint: 'Loads smaller chat sizes and tighter spacing', onPress: applyPreset, disabled: saving,
                    style: { borderRadius: 12, backgroundColor: palette.card, padding: 14, gap: 4 } },
                    h(RN.Text, { style: { color: palette.accent, fontSize: 15, fontWeight: '600' } }, 'Compact OpenDyslexic'),
                    h(RN.Text, { style: { color: palette.muted, fontSize: 13 } },
                        'Smaller chat text and tighter spacing for the font you already use.')),
                groups.map(([label, keys]) => h(RN.View, { key: label, style: { gap: 6 } },
                    h(RN.Text, { style: { color: palette.muted, fontSize: 13, fontWeight: '600', paddingHorizontal: 4 } }, label),
                    h(RN.View, { style: { borderRadius: 12, backgroundColor: palette.card, overflow: 'hidden' } },
                        keys.map(renderField))))),
            h(SafeAreaView || RN.View, { ...(SafeAreaView && { edges: ['bottom', 'left', 'right'] }),
                style: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: SafeAreaView ? 12 : 36, gap: 8 } },
                message && h(RN.Text, { accessibilityLiveRegion: 'polite',
                    style: { color: invalid ? palette.error : palette.muted, fontSize: 14 } }, message),
                h(RN.View, { style: { flexDirection: 'row', gap: 10 } },
                    button('Reset all', () => {
                        setDraft(Object.fromEntries(Object.keys(fields).map(key => [key, '0'])));
                        setFeedback('');
                    }, saving || Object.values(parsed).every(value => value === 0), false),
                    button(saving ? 'Saving…' : 'Save', save, saving || !!invalid || !dirty || !state?.active, true))));
    }

    return { default: { jsonStorage: { load: true, default: defaults }, start, SettingsComponent } };
})()
