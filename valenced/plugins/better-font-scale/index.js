(() => {
    // SPDX-License-Identifier: MIT
    const MIN = 60, MAX = 180, STEP = 5, DEFAULT = 100;
    const bridgeMethod = 'dev.fluttershy2008.better-font-scale.update';
    const groups = [
        ['Chat', [
            ['messages', 'Messages', 'Hey, are you free later?', 16],
            ['chatbox', 'Chatbox', 'Write a message…', 16],
            ['username', 'Username', 'Strawberry Whirl', 16],
            ['timestamps', 'Timestamps', 'Today at 9:24 AM', 12],
        ]],
        ['Profiles', [
            ['bio', 'About Me', 'I like baking strawberry treats.', 14],
            ['game', 'Game Status', 'Playing Minecraft', 12],
            ['status', 'Profile Status', 'Currently baking', 14],
        ]],
        ['Channel list', [
            ['category', 'Category Names', 'COMMUNITY', 14],
            ['channel', 'Text Channel Names', '# general', 16],
            ['voice', 'Voice Channel Names', 'Voice Lounge', 16],
            ['thread', 'Thread Names', 'Weekend plans', 16],
        ]],
    ];
    const defaults = Object.fromEntries(groups.flatMap(([, rows]) => rows.map(([key]) => [key, DEFAULT])));
    const nativeKeys = ['messages', 'chatbox', 'username', 'timestamps'];
    const nativeChannelLabel = props => props.experimental_useNativeText && props.lineClamp === 1;
    const launchpadLabel = props => props.maxFontSizeMultiplier === 1.75 && props.lineClamp === 1;
    const categoryLabel = props => nativeChannelLabel(props) && props.variant === 'body-sm/semibold';
    const biographyText = props => /^(body|heading|text|code)-/.test(props.variant ?? '');
    const statusText = props => typeof props.onTextLayout === 'function' || props.color === 'text-default';
    const gameText = props => props.lineClamp === 1 && props.color === 'text-muted';
    const usernameText = props => props.color === 'mobile-text-heading-primary' || props.lineClamp === 2;
    const channelTypes = new Map([[2, 'voice'], [13, 'voice'], [10, 'thread'], [11, 'thread'], [12, 'thread'],
        [0, 'channel'], [5, 'channel'], [15, 'channel'], [16, 'channel']]);
    const listeners = new Set();
    let session;
    let pendingWrite = Promise.resolve();

    function scale(value) {
        return typeof value === 'number' && Number.isFinite(value)
            ? Math.max(MIN, Math.min(MAX, Math.round(value / STEP) * STEP))
            : DEFAULT;
    }

    function settingsOf(value) {
        return Object.fromEntries(Object.keys(defaults).map(key => [key, scale(value?.[key])]));
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    function notify() {
        for (const listener of listeners) listener();
    }

    async function setAndroid(state) {
        const api = state.api;
        const values = nativeKeys.map(key => state.values[key]);
        if (state.lastNative?.every((value, index) => value === values[index])) return;
        state.lastNative = values;
        try {
            const ok = await api.unscoped.modules.native.callNativeMethod(bridgeMethod, values);
            if (ok !== true) throw new Error('Android font scale bridge is inactive');
            if (session === state && state.lastNative === values && state.nativeUnavailable) {
                state.nativeUnavailable = false;
                notify();
            }
        } catch (error) {
            if (session !== state || state.lastNative !== values) return;
            state.lastNative = null;
            state.nativeUnavailable = true;
            notify();
            if (session === state && !state.reportedNativeError) {
                state.reportedNativeError = true;
                api.logger?.warn?.('Better Font Scale Android text hooks are unavailable', error);
            }
        }
    }

    function installTextHooks(state) {
        const { api } = state;
        const U = api.unscoped;
        const { React, ReactNative: RN, jsxRuntime } = U.react;
        const finders = U.discord.utils?.modules?.finders;
        if (!finders?.getModuleWithImportedPath || !jsxRuntime?.afterJSX) return;
        const h = React.createElement;
        const FontScope = React.createContext(null);
        const seen = new Set();
        const rules = [
            ['channel', nativeChannelLabel], ['voice', nativeChannelLabel], ['thread', nativeChannelLabel],
            ['category', categoryLabel], ['channel', launchpadLabel], ['voice', launchpadLabel],
            ['bio', biographyText], ['status', statusText], ['game', gameText], ['username', usernameText],
        ];

        function watch(path, name, callback) {
            api.cleanup(finders.getModuleWithImportedPath(path, exports => {
                const type = exports?.[name];
                if (session !== state || !type || seen.has(type)) return;
                seen.add(type);
                api.cleanup(jsxRuntime.afterJSX(type, callback));
            }));
        }

        function Scope({ element, kind, match }) {
            const read = () => session === state ? state.values[kind] : DEFAULT;
            const percent = React.useSyncExternalStore(subscribe, read, read);
            const context = React.useMemo(() => ({ percent, match }), [percent, match]);
            // Recreate the subtree when crossing 100% so existing elements pick up the JSX hook.
            return h(FontScope.Provider, { value: context, key: percent === DEFAULT ? 'default' : 'scaled' }, element);
        }

        function scope(path, name, kind, match) {
            watch(path, name, element => {
                const key = typeof kind === 'function' ? kind(element.props) : kind;
                return key ? h(Scope, {
                    key: element.key ?? undefined, element, kind: key, match,
                }) : element;
            });
        }

        api.cleanup(finders.getModuleWithImportedPath('design/components/Text/native/Text.tsx', exports => {
            if (session !== state || !exports?.Text || !exports.TextStyleSheet) return;
            const variants = exports.TextStyleSheet;

            function ScaledText({ element }) {
                const context = React.useContext(FontScope);
                if (!context || context.percent === DEFAULT) return element;
                const props = element.props;
                if (!context.match(props)) return element;
                const typography = variants[props.variant];
                const style = RN.StyleSheet.flatten(props.style);
                const fontSize = style?.fontSize ?? typography?.fontSize;
                const lineHeight = style?.lineHeight ?? typography?.lineHeight;
                if (!Number.isFinite(fontSize) || fontSize <= 0) return element;
                const ratio = context.percent / DEFAULT;
                const sizes = { fontSize: Math.round(fontSize * ratio * 10) / 10 };
                if (Number.isFinite(lineHeight) && lineHeight > 0) sizes.lineHeight = Math.ceil(lineHeight * ratio);
                return React.cloneElement(element, { style: [props.style, sizes] });
            }

            api.cleanup(jsxRuntime.afterJSX(exports.Text, element => {
                // Render the wrapper only for styles used by supported surfaces.
                if (session !== state ||
                    !rules.some(([kind, match]) => state.values[kind] !== DEFAULT && match(element.props))) return element;
                return h(ScaledText, { key: element.key ?? undefined, element });
            }));
        }));

        const profile = 'modules/user_profile/native/';
        const sidebar = 'modules/channel_list_v2/native/items/';
        const launchpad = 'modules/launchpad/native/shared/';
        scope(profile + 'UserProfilePrimaryInfo.tsx', 'DisplayName', 'username', usernameText);
        scope('modules/profile_customization/native/BioText.tsx', 'default', 'bio', biographyText);
        scope(profile + 'UserProfileCustomStatusBubble.tsx', 'default', 'status', statusText);
        scope('modules/activity_status/native/ActivityStatusText.tsx', 'default', 'game', gameText);
        scope(sidebar + 'RedesignCategory.tsx', 'CategoryChannel', 'category', categoryLabel);
        scope(sidebar + 'TextChannel.tsx', 'default', 'channel', nativeChannelLabel);
        scope('modules/guild_sidebar/native/ChannelItem.tsx', 'default',
            props => channelTypes.get(props.channel?.type), nativeChannelLabel);
        scope(launchpad + 'TextChannel.tsx', 'default', 'channel', launchpadLabel);
        scope(launchpad + 'VoiceOrStageChannel.tsx', 'default', 'voice', launchpadLabel);
    }

    function start(api) {
        const storage = api.jsonStorage;
        const state = session = { api, values: settingsOf(storage.cache), ready: storage.loaded };
        installTextHooks(state);
        setAndroid(state);
        if (!state.ready) void Promise.resolve(storage.get()).then(value => {
            if (session !== state) return;
            state.values = settingsOf(value);
            state.ready = true;
            setAndroid(state);
            notify();
        }).catch(error => {
            if (session !== state) return;
            state.ready = true;
            state.error = 'Saved settings could not be loaded.';
            api.logger?.warn?.('Better Font Scale settings could not be loaded', error);
            notify();
        });
    }

    function update(state, values) {
        if (session !== state || !state.ready) return;
        state.values = settingsOf({ ...state.values, ...values });
        setAndroid(state);
        notify();
        const next = state.values;
        pendingWrite = pendingWrite.catch(() => {}).then(() => state.api.jsonStorage.set(next, true));
        void pendingWrite.catch(error => {
            if (session !== state) return;
            state.error = 'Your new sizes could not be saved.';
            state.api.logger?.warn?.('Better Font Scale settings could not be saved', error);
            notify();
        });
    }

    function SettingsComponent({ api }) {
        const U = api.unscoped;
        const { React, ReactNative: RN } = U.react;
        const { Design } = U.discord.design;
        const h = React.createElement;
        const state = session;
        const [, refresh] = React.useReducer(version => version + 1, 0);
        React.useEffect(() => subscribe(refresh), []);
        const read = state?.values ?? defaults;
        const ready = !!state?.ready;
        const { Text, Button, Slider } = Design;

        function sliderRow([key, label, sample, size]) {
            return h(SliderRow, {
                key, label, sample, size, value: read[key], ready, Slider, React, RN, Text, Button,
                onCommit: value => update(state, { [key]: value }),
            });
        }

        return h(RN.ScrollView, { contentContainerStyle: { padding: 16, paddingBottom: 36, gap: 22 } },
            h(RN.View, { style: { gap: 8 } },
                h(Text, { variant: 'body-sm/normal', color: 'text-muted' },
                    '100% follows Discord’s default size. Drag a slider to preview the change.'),
                state?.nativeUnavailable && h(Text, { variant: 'body-sm/normal', color: 'text-muted' },
                    'The Android chat controls are unavailable. Fully restart Valenced after installing the plugin.'),
                state?.error && h(Text, { variant: 'body-sm/normal', color: 'text-danger' }, state.error)),
            groups.map(([label, rows]) => h(RN.View, { key: label, style: { gap: 12 } },
                h(Text, { variant: 'heading-md/semibold' }, label),
                rows.map(sliderRow))),
            h(Button, { text: 'Reset all to default', variant: 'secondary',
                disabled: !ready || Object.values(read).every(value => value === DEFAULT),
                onPress: () => update(state, defaults) }));
    }

    function SliderRow({ React, RN, Text, Button, Slider, label, sample, size, value, ready, onCommit }) {
        const h = React.createElement;
        const [draft, setDraft] = React.useState(value);
        React.useEffect(() => setDraft(value), [value]);
        const commit = next => {
            const rounded = scale(next);
            setDraft(rounded);
            if (rounded !== value) onCommit(rounded);
        };
        return h(RN.View, { style: { gap: 4, paddingVertical: 4 } },
            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 } },
                h(Text, { variant: 'body-md/semibold' }, label),
                h(Text, { variant: 'body-sm/medium', color: 'text-muted' }, draft === DEFAULT ? 'Default · 100%' : draft + '%')),
            Slider
                ? h(Slider, { accessibilityLabel: label, minValue: MIN, maxValue: MAX, step: STEP, value,
                    formatValue: next => scale(next) + '%', onChange: next => setDraft(scale(next)),
                    onChangeEnd: commit, disabled: !ready })
                : h(RN.View, { style: { flexDirection: 'row', gap: 8 } },
                    h(Button, { text: '−', accessibilityLabel: 'Decrease ' + label, variant: 'secondary',
                        disabled: !ready || draft <= MIN, onPress: () => commit(draft - STEP) }),
                    h(Button, { text: '+', accessibilityLabel: 'Increase ' + label, variant: 'secondary',
                        disabled: !ready || draft >= MAX, onPress: () => commit(draft + STEP) })),
            h(Text, { variant: 'body-md/normal', color: 'text-muted',
                style: { fontSize: size * draft / DEFAULT, lineHeight: Math.ceil(size * 1.28 * draft / DEFAULT) } }, sample));
    }

    return { default: {
        jsonStorage: { load: true, default: defaults },
        start,
        stop() { session = null; notify(); },
        SettingsComponent,
    } };
})()
