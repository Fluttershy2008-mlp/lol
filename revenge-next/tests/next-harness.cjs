'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const React = require('react');
const Renderer = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const TARGET = process.env.PLUGIN_TEST_TARGET === 'valenced' ? 'valenced' : 'revenge-next';
const ROOT = path.resolve(__dirname, '../..', TARGET);
const HOST_ID = TARGET === 'valenced' ? 'valenced' : 'revenge';
const ACCOUNT = '200000000000000001', FRIEND = '100000000000000001', BLOCKED = '100000000000000002';
const IGNORED = '100000000000000003', CHANNEL = '300000000000000001', GUILD = '400000000000000001';

function nextPatcher() {
    function compile(name, internals) {
        const source = stripTypeScriptTypes(fs.readFileSync(path.join(ROOT, 'tests/vendor', TARGET === 'valenced' ? 'valenced-patcher' : 'next-patcher', name), 'utf8'));
        const exports = [...source.matchAll(/export\s+(?:const|let|function)\s+(\w+)/g)].map(x => x[1]);
        const body = source.replace(/import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/_internal['"]/g, 'const {$1} = internals')
            .replace(/export\s+(?=const|let|function)/g, '');
        return new Function('internals', body + '\nreturn {' + exports.join(',') + '};')(internals);
    }
    return compile('instead.ts', compile('_internal.ts')).instead;
}

function createWorld(options = {}) {
    const calls = [], errors = [], logs = [], alerts = [], toasts = [], clipboard = [], openedSheets = [], subscriptions = new Map();
    const appListeners = new Set(), timers = new Map(), registeredScreens = new Map(), settingsSubscriptions = new Set();
    let now = 1800000000000, serial = 0, settingsLoaded = true;
    const host = {
        AbortController,
        setTimeout(fn, delay = 0, ...args) { const id = ++serial; timers.set(id, { fn: () => fn(...args), at: now + Number(delay || 0) }); return id; },
        clearTimeout: id => timers.delete(id),
        setInterval(fn, delay = 1, ...args) { const id = ++serial; timers.set(id, { fn: () => fn(...args), at: now + delay, interval: delay }); return id; },
        clearInterval: id => timers.delete(id),
        fetch: async (...args) => { calls.push(['fetch', ...args]); if (options.fetch) return options.fetch(...args); throw new Error('A test must stub an expected fetch explicitly'); },
    };
    const native = name => React.forwardRef(function NativeComponent(props, ref) { return React.createElement(name, { ...props, ref }, props.children); });
    const RN = Object.fromEntries(['View', 'Text', 'TextInput', 'ScrollView', 'Pressable', 'TouchableOpacity', 'TouchableWithoutFeedback',
        'SafeAreaView', 'Switch', 'ActivityIndicator', 'KeyboardAvoidingView'].map(name => [name, native(name)]));
    const NativeButton = native('Button');
    Object.defineProperty(RN, 'Button', { get: () => NativeButton, enumerable: true });
    RN.Image = Object.assign(native('Image'), { getSize: (_url, yes) => yes?.(320, 320), resolveAssetSource: id => ({ uri: 'asset:' + id }) });
    RN.Modal = function Modal(props) { return props.visible === false ? null : React.createElement('Modal', props, props.children); };
    RN.FlatList = function FlatList({ data = [], renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent, ...props }) {
        const asElement = value => typeof value === 'function' ? React.createElement(value) : value;
        return React.createElement('FlatList', props, asElement(ListHeaderComponent),
            data.length ? data.map((item, index) => React.createElement(React.Fragment, { key: String(item.id ?? index) }, renderItem({ item, index }))) : asElement(ListEmptyComponent),
            asElement(ListFooterComponent));
    };
    Object.assign(RN, {
        Alert: { alert: (...args) => alerts.push(args) },
        ToastAndroid: { SHORT: 0, LONG: 1, show: value => toasts.push(value) },
        AppState: { currentState: 'active', addEventListener(_type, fn) { appListeners.add(fn); return { remove: () => appListeners.delete(fn) }; } },
        StyleSheet: { create: value => value, flatten: value => Object.assign({}, ...(Array.isArray(value) ? value : [value])), absoluteFillObject: {} },
        Appearance: { getColorScheme: () => 'dark' }, useColorScheme: () => 'dark', useWindowDimensions: () => ({ width: 480, height: 900 }),
        Dimensions: { get: () => ({ width: 480, height: 900 }) }, Platform: { OS: 'android', select: value => value.android ?? value.default },
        Linking: { openURL: async url => calls.push(['openURL', url]) }, Keyboard: { dismiss() {} },
        InteractionManager: { runAfterInteractions(fn) { const id = host.setTimeout(fn, 0); return { cancel: () => host.clearTimeout(id) }; } },
        NativeModules: {}, PixelRatio: { get: () => 2 }, findNodeHandle: () => 1,
    });
    const users = {
        [ACCOUNT]: { id: ACCOUNT, username: 'test-owner', globalName: 'Test Owner', premiumType: 2 },
        [FRIEND]: { id: FRIEND, username: 'friend', globalName: 'Test Friend' },
        [BLOCKED]: { id: BLOCKED, username: 'blocked', globalName: 'Blocked User' },
        [IGNORED]: { id: IGNORED, username: 'ignored', globalName: 'Ignored User' },
    };
    const relationships = { [FRIEND]: 1, [BLOCKED]: 2, [IGNORED]: 5 };
    const guilds = { [GUILD]: { id: GUILD, name: 'Test Guild', ownerId: ACCOUNT, premiumTier: 2, features: [], memberCount: 2 } };
    const channels = { [CHANNEL]: { id: CHANNEL, name: 'test-chat', guild_id: GUILD, guildId: GUILD, type: 0, lastMessageId: '900000000000000001',
        isDM: () => false, isGroupDM: () => false, isThread: () => false } };
    const messages = [{ id: '900000000000000001', channel_id: CHANNEL, author: users[FRIEND], content: 'A test message', attachments: [], timestamp: new Date(now).toISOString() }];
    const makeStore = (name, values) => {
        const listeners = new Set();
        return { ...values, getName: () => name, listeners,
            addChangeListener: fn => listeners.add(fn), removeChangeListener: fn => listeners.delete(fn),
            emitChange: () => { for (const fn of [...listeners]) fn(); } };
    };
    let accountId = ACCOUNT;
    const stores = {
        UserStore: makeStore('UserStore', { getCurrentUser: () => users[accountId], getUser: id => users[id], getUsers: () => users }),
        RelationshipStore: makeStore('RelationshipStore', { getRelationships: () => relationships,
            isBlocked: id => relationships[id] === 2, isIgnored: id => relationships[id] === 5, isFriend: id => relationships[id] === 1,
            getFriendIDs: () => Object.keys(relationships).filter(id => relationships[id] === 1),
            getBlockedIDs: () => Object.keys(relationships).filter(id => relationships[id] === 2) }),
        MessageStore: makeStore('MessageStore', { getMessages: id => id === CHANNEL ? messages : [], getMessage: (_c, id) => messages.find(m => m.id === id) }),
        GuildStore: makeStore('GuildStore', { getGuilds: () => guilds, getGuild: id => guilds[id] }),
        ChannelStore: makeStore('ChannelStore', { getChannel: id => channels[id], getChannels: () => channels,
            getPrivateChannels: () => ({}), getDMFromUserId: () => undefined }),
        GuildChannelStore: makeStore('GuildChannelStore', { getChannels: () => ({ SELECTABLE: [{ channel: channels[CHANNEL] }] }),
            getMutableGuildChannelsForGuild: () => channels }),
        ThemeStore: makeStore('ThemeStore', { theme: 'dark' }),
        PermissionStore: makeStore('PermissionStore', { can: () => true }),
        SelectedChannelStore: makeStore('SelectedChannelStore', { getChannelId: () => CHANNEL, getVoiceChannelId: () => null }),
        SelectedGuildStore: makeStore('SelectedGuildStore', { getGuildId: () => GUILD }),
        ConnectionStore: makeStore('ConnectionStore', { isConnected: () => true }),
        ReadStateStore: makeStore('ReadStateStore', { hasUnread: id => id === CHANNEL, hasUnreadPins: () => false, lastMessageId: () => messages.at(-1)?.id }),
        PresenceStore: makeStore('PresenceStore', { getActivities: () => [], getStatus: () => 'online' }),
        UserSettingsStore: makeStore('UserSettingsStore', { getSetting: () => undefined, getSettings: () => ({}) }),
        UserSettingsProtoStore: makeStore('UserSettingsProtoStore', { settings: { status: { status: { value: 'online' } } } }),
        AuthenticationStore: makeStore('AuthenticationStore', { getToken: () => 'fake-test-session-token-only' }),
        GuildMemberStore: makeStore('GuildMemberStore', { getMembers: () => [], getMember: () => undefined }),
        GuildEmojiStore: makeStore('GuildEmojiStore', { getGuildEmoji: () => [], getEmojis: () => ({}) }),
        GuildStickerStore: makeStore('GuildStickerStore', { getStickers: () => [] }),
    };
    const dispatcher = {
        dispatch(event) { calls.push(['dispatch', event]); for (const fn of [...(subscriptions.get(event.type) ?? [])]) fn(event); return Promise.resolve(); },
        subscribe(type, fn) { if (!subscriptions.has(type)) subscriptions.set(type, new Set()); subscriptions.get(type).add(fn); },
        unsubscribe(type, fn) { subscriptions.get(type)?.delete(fn); }, isDispatching: () => false,
    };
    const design = Object.fromEntries(['Button', 'Text', 'TextInput', 'TableRow', 'TableRowGroup', 'TableSwitchRow', 'TableRowIcon',
        'ActionSheet', 'ActionSheetRow', 'ActionSheetRowGroup', 'ActionSheetSwitchRow', 'ActionSheetCloseButton', 'BottomSheetTitleHeader',
        'AlertModal', 'AlertActionButton', 'AlertActions', 'FormSwitch'].map(name => [name, native(name)]));
    design.createStyles = factory => typeof factory === 'function' ? factory() : factory;
    const openLazy = (promise, key, context) => { calls.push(['openLazy', key, context]); openedSheets.push({ promise, key, context }); return promise; };
    const sheets = { openLazy, hideActionSheet: key => calls.push(['hideSheet', key]) };
    const alertActions = { openAlert: (key, content) => { calls.push(['openAlert', key]); alerts.push([key, content]); }, dismissAlert: key => calls.push(['dismissAlert', key]) };
    const navigation = { navigate: (...args) => calls.push(['navigate', ...args]), goBack: () => calls.push(['goBack']),
        push: (...args) => calls.push(['push', ...args]), isReady: () => true };
    const http = Object.fromEntries(['get', 'post', 'patch', 'put', 'del'].map(method => [method, async input => {
        calls.push(['http', method, input]);
        if (options.http) return options.http(method, input);
        if (method === 'get' && input.url?.includes('/mentions')) return { status: 200, ok: true, body: messages };
        if (method === 'get' && input.url?.startsWith('/users/')) return { status: 200, ok: true, body: users[input.url.split('/').at(-1)] };
        return { status: method === 'del' ? 204 : 200, ok: true, body: { id: '800000000000000001' } };
    }]));
    const commands = { getBuiltInCommands: () => [{ id: '-1', name: 'existing', type: 1 }] };
    const modules = [
        ...Object.values(stores),
        ...(!options.curatedOnly ? [design, sheets, alertActions] : []),
        options.splitHTTP ? { HTTP: http, getAPIBaseURL: () => 'https://discord.test/api' } : { ...http, getAPIBaseURL: () => 'https://discord.test/api' },
        commands,
        { getRootNavigationRef: () => navigation },
        { getToken: () => 'fake-test-session-token-only' }, { switchAccountToken: async token => calls.push(['switchAccount', token]) },
        { getMaxMessageLength: () => 4000 },
        { getCanUseMultiAccountMobile: () => false },
        { showUserProfile: input => calls.push(['showProfile', input]) },
        { showUserProfileActionSheet: input => calls.push(['showProfileSheet', input]) },
        { openUrl: url => calls.push(['jumpURL', url]), openURL: url => calls.push(['openURL', url]) },
        { sendMessage: async (channelId, body) => { calls.push(['sendMessage', channelId, body]); return { ok: true }; }, receiveMessage: (...args) => calls.push(['receiveMessage', ...args]),
            sendBotMessage: (channelId, body) => calls.push(['botMessage', channelId, body]) },
        { createBotMessage: body => ({ id: '700000000000000001', author: { id: '1', username: 'Revenge' }, ...body }) },
        { removeRelationship: async id => { calls.push(['unblock', id]); delete relationships[id]; stores.RelationshipStore.emitChange(); },
            addRelationship: async value => { calls.push(['block', value]); relationships[value.userId] = value.type; stores.RelationshipStore.emitChange(); } },
        { getUserProfile: () => ({}), fetchProfile: async id => users[id] },
        { getEmojiURL: value => 'https://cdn.discord.test/emojis/' + value.id + '.png', uploadEmoji: async (...args) => { calls.push(['uploadEmoji', ...args]); return { id: '800000000000000002' }; } },
        { createGuildSticker: async (...args) => { calls.push(['uploadSticker', ...args]); return { id: '800000000000000003' }; }, fetchSticker: async () => ({}) },
        { getMaxEmojiSlots: () => 50 }, { openMediaModal: (...args) => calls.push(['openMedia', ...args]), downloadMediaAsset: (...args) => calls.push(['downloadMedia', ...args]) },
        { getConstants: () => ({}) },
        { flushText() {}, replaceRange() {}, getText() {} },
    ];
    function ChatView(props) { return React.createElement(RN.View, null, props.children); }
    function Composer(props) { return React.createElement(RN.TextInput, props); }
    modules.push({ type: ChatView }, { default: ChatView }, { default: Composer });
    const filters = {
        withProps: (...keys) => Object.assign((_, value) => value && keys.every(key => key in value), { key: 'props.' + keys.join('.') }),
        withName: name => Object.assign((_, value) => value?.name === name, { key: 'name.' + name }),
        createFilterGenerator: (fn, key) => (...args) => Object.assign((id, value) => fn(args, id, value, true), { key: key(args) }),
    };
    function* lookupModules(filter, opts = {}) {
        for (let id = 0; id < modules.length; id++) {
            const ns = modules[id], value = ns?.default && filter(id, ns.default) ? ns.default : ns;
            if (filter(id, value)) yield [opts.returnNamespace ? ns : value, id];
        }
    }
    const moduleWaiters = new Set();
    const finders = { filters, lookupModules, lookupModule: (filter, opts) => [...lookupModules(filter, opts)][0] ?? [],
        getModules(filter, cb, opts) { const current = this.lookupModule(filter, opts); if (current.length) cb(...current);
            else { const entry = { filter, cb, opts }; moduleWaiters.add(entry); return () => moduleWaiters.delete(entry); } return () => {}; },
    };
    const settings = {
        onSettingsModulesLoaded(fn) { if (settingsLoaded) fn(); else settingsSubscriptions.add(fn); return () => settingsSubscriptions.delete(fn); },
        registerSettingsItem(key, value) { registeredScreens.set(key, value); return () => registeredScreens.delete(key); },
        refreshSettings: () => calls.push(['refreshSettings']),
    };
    const U = { react: { React, ReactNative: RN }, modules: { finders, metro: {
        getInitializedModuleExports: id => modules[Number(id)], isModuleInitialized: id => modules[Number(id)] !== undefined,
    }, native: { callNativeMethod: async name => name === HOST_ID + '.plugins.list'
        ? { result: [...loaded.values()].map(x => ({ manifest: x.manifest, source: { repo: 'https://example.test/index.json' } })) }
        : { error: { code: 'UNKNOWN_METHOD', message: 'Unexpected native call in test: ' + name } } } },
        patcher: { instead: nextPatcher() }, discord: { common: { flux: { Dispatcher: dispatcher }, constants: { Constants: { Permissions: { CREATE_GUILD_EXPRESSIONS: 1n << 43n }, ActivityTypes: {} } } },
            flux: { Stores: stores }, design: { Design: design }, actions: { ActionSheetActionCreators: sheets, AlertActionCreators: alertActions }, modules: { settings } },
        externals: { Gorhom: { BottomSheet: { BottomSheetScrollView: native('BottomSheetScrollView') } },
            ReactNativeClipboard: { Clipboard: { setString: value => clipboard.push(value), setImage: value => calls.push(['copyImage', value]) } },
            ReactNavigation: { ReactNavigationNative: { useNavigation: () => navigation } } },
        assets: { getAssetIdByName: () => 1, getAssetByName: () => ({ id: 1 }) }, utils: {},
    };
    const loaded = new Map();
    async function start(slug, initial = {}) {
        const directory = path.join(ROOT, '.build/plugins', slug);
        const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
        const cleanups = [], writes = [];
        const api = { unscoped: U, cleanup: fn => cleanups.push(fn),
            logger: { error: (...args) => errors.push([slug, ...args]), warn: (...args) => logs.push([slug, ...args]), log() {} },
            plugin: { manifest, startedLate: false, requireReload: () => calls.push(['requireReload', slug]), reportError: error => errors.push([slug, error]) },
            jsonStorage: { loaded: true, cache: initial, async get() { this.loaded = true; return this.cache; },
                async set(value, replace) { if (!replace) throw new Error('Expected replace storage write'); this.cache = structuredClone(value); writes.push(this.cache); } },
        };
        let plugin;
        const sandbox = { ...host, console: { log() {}, warn() {}, error: (...args) => errors.push([slug, ...args]) },
            ...(HOST_ID === 'valenced' ? { HOST_API: U } : { revenge: U }), plugin: value => value, Promise, AbortController, TextEncoder, TextDecoder,
            Blob, Response, Headers, Uint8Array, URL, atob, btoa,
            Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
        };
        const script = fs.readFileSync(path.join(directory, 'index.js'), 'utf8');
        const expression = HOST_ID === 'valenced' ? '(function(valenced, plugin) { return ' + script + '\n})(HOST_API, plugin)' : script;
        plugin = vm.runInNewContext(expression, sandbox, { filename: TARGET + ':' + slug }).default;
        const item = { slug, manifest, options: plugin, api, cleanups, writes };
        loaded.set(slug, item);
        await plugin.start?.(api);
        return item;
    }
    async function stop(item) { await item.options.stop?.(item.api); for (const fn of item.cleanups.splice(0).reverse()) await fn(); loaded.delete(item.slug); }
    async function advance(ms, budget = 400) {
        const target = now + ms;
        while (budget--) {
            const next = [...timers.entries()].filter(([,v]) => v.at <= target).sort((a,b) => a[1].at-b[1].at)[0];
            if (!next) break;
            const [id, timer] = next; now = timer.at; timers.delete(id);
            if (timer.interval) timers.set(id, { ...timer, at: now + timer.interval });
            await timer.fn(); await Promise.resolve();
        }
        now = target; await Promise.resolve();
    }
    async function render(item) {
        let renderer;
        await Renderer.act(async () => { renderer = Renderer.create(React.createElement(item.options.SettingsComponent, { api: item.api })); });
        return renderer;
    }
    return { U, RN, React, Renderer, calls, errors, logs, alerts, toasts, clipboard, openedSheets, modules, subscriptions, appListeners, timers,
        stores, users, relationships, guilds, channels, messages, dispatcher, sheets, navigation, commands, registeredScreens, loaded,
        start, stop, render, advance, host, accountId: () => accountId, setAccount: id => { accountId = id; stores.UserStore.emitChange(); },
        setSettingsLoaded(value) { settingsLoaded = value; if (value) for (const fn of [...settingsSubscriptions]) fn(); },
        moduleWaiters,
        addModule(module) {
            const id = modules.push(module) - 1;
            for (const entry of [...moduleWaiters]) {
                const value = module?.default && entry.filter(id, module.default) ? module.default : module;
                if (entry.filter(id, value)) {
                    moduleWaiters.delete(entry);
                    entry.cb(entry.opts?.returnNamespace ? module : value, id);
                }
            }
            return id;
        },
    };
}

module.exports = { createWorld, React, Renderer, nextPatcher, ACCOUNT, FRIEND, BLOCKED, IGNORED, CHANNEL, GUILD };
