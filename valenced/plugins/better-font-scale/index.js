(() => {
    // SPDX-License-Identifier: MIT
    const fields = {
        messages: 'Messages',
        chatbox: 'Chatbox',
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
    const previews = {
        messages: [16, 'Hey, are you free later?'],
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

    function readSize(value) {
        if (typeof value === 'string') {
            value = value.trim().replace(',', '.');
            if (!/^(?:\d+\.?\d*|\.\d+)$/.test(value)) return undefined;
            value = Number(value);
        }
        return Number.isFinite(value) && (value === 0 || (value >= 8 && value <= 48)) ? value : undefined;
    }

    function readSettings(data) {
        return Object.fromEntries(Object.keys(fields).map(key => [key, readSize(data?.[key]) ?? 0]));
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
                [values.messages, values.chatbox, values.username, values.timestamp]);
        } catch {
            throw new Error(unavailable);
        }
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

    function SettingsComponent({ api }) {
        const { React, ReactNative: RN } = api.unscoped.react;
        const Slider = api.unscoped.discord.design?.Design?.Slider;
        const h = React.createElement;
        const state = session;
        const saved = state?.values ?? readSettings(api.jsonStorage.cache);
        const [draft, setDraft] = React.useState(() => Object.fromEntries(Object.keys(fields).map(key => [key, String(saved[key])])));
        const [feedback, setFeedback] = React.useState('');
        const [saving, setSaving] = React.useState(false);
        const light = api.unscoped.discord.flux?.Stores?.ThemeStore?.theme === 'light';
        const palette = light
            ? { text: '#191A20', muted: '#555665', card: '#EBEBF3', error: '#AF2136' }
            : { text: '#F5F4FA', muted: '#BCBAC9', card: '#292638', error: '#FFB3BE' };
        const parsed = Object.fromEntries(Object.keys(fields).map(key => [key, readSize(draft[key])]));
        const invalid = Object.keys(fields).find(key => parsed[key] === undefined);
        const dirty = Object.keys(fields).some(key => parsed[key] !== saved[key]);
        function changeField(key, value) {
            setDraft(current => ({ ...current, [key]: String(value) }));
            setFeedback('');
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
                setFeedback(error.message || 'Could not save font sizes.');
            } finally {
                state.busy = false;
                setSaving(false);
            }
        }
        const button = (label, action, disabled, primary) => h(RN.Pressable, {
            accessibilityRole: 'button', accessibilityState: { disabled }, disabled, onPress: action,
            style: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46, borderRadius: 10,
                backgroundColor: primary ? '#5865F2' : palette.card, opacity: disabled ? 0.5 : 1 },
        }, h(RN.Text, { style: { color: primary ? '#fff' : palette.text, fontSize: 15, fontWeight: '600' } }, label));

        function renderField([key, label]) {
            const [defaultSampleSize, sample] = previews[key];
            const previewSize = parsed[key] || defaultSampleSize;
            const isDefault = parsed[key] === 0;
            return h(RN.View, { key, style: { borderRadius: 10, padding: 14, gap: 4, backgroundColor: palette.card } },
                h(RN.Text, { style: { color: palette.text, fontSize: 15, fontWeight: '600' } }, label),
                Slider && h(Slider, { accessibilityLabel: label + ' slider', value: previewSize, minValue: 8,
                    maxValue: 48, step: 1, disabled: saving, formatValue: value => value + ' sp',
                    onChange: value => changeField(key, value) }),
                h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', gap: 10 } },
                    h(RN.TextInput, { accessibilityLabel: label + ' exact size', value: draft[key],
                        keyboardType: 'decimal-pad', maxLength: 7, selectTextOnFocus: true, editable: !saving,
                        onChangeText: value => changeField(key, value),
                        style: { color: parsed[key] === undefined ? palette.error : palette.text, fontSize: 16,
                            minWidth: 52, minHeight: 42, paddingVertical: 4 } }),
                    h(RN.Text, { style: { color: palette.muted, flex: 1 } }, isDefault ? 'Discord default' : 'sp'),
                    h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Reset ' + label,
                        disabled: saving || isDefault, onPress: () => changeField(key, 0),
                        style: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, opacity: isDefault ? 0.45 : 1 } },
                        h(RN.Text, { style: { color: palette.text } }, 'Default'))),
                h(RN.Text, { style: { color: palette.muted, fontSize: previewSize,
                    lineHeight: Math.ceil(previewSize * 1.25) } }, sample));
        }
        const message = invalid ? fields[invalid] + ' needs a size from 8 to 48, or 0.' : feedback || state?.nativeError;
        return h(RN.View, { style: { flex: 1 } },
            h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', style: { flex: 1 },
                contentContainerStyle: { padding: 16, gap: 10 } },
                h(RN.Text, { style: { color: palette.muted, fontSize: 14, marginBottom: 4 } },
                    'Drag a slider to preview a size or enter an exact value. Use 0 for Discord’s default.'),
                Object.entries(fields).map(renderField)),
            h(RN.View, { style: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 8 } },
                h(RN.View, { style: { flexDirection: 'row', gap: 10 } },
                    button('Reset all', () => {
                        setDraft(Object.fromEntries(Object.keys(fields).map(key => [key, '0'])));
                        setFeedback('');
                    }, saving, false),
                    button(saving ? 'Saving…' : 'Save', save, saving || !!invalid || !dirty || !state?.active, true)),
                message && h(RN.Text, { accessibilityLiveRegion: 'polite',
                    style: { color: invalid ? palette.error : palette.muted, fontSize: 14 } }, message)));
    }

    return { default: { jsonStorage: { load: true, default: defaults }, start, SettingsComponent } };
})()
