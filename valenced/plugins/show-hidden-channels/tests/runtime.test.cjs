'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const context = { Map, setTimeout, clearTimeout };
vm.runInNewContext(source.replace('    return { default: {',
    '    globalThis.__createRuntime = createRuntime;\n    return { default: {'), context);
const createRuntime = context.__createRuntime;
const plain = value => JSON.parse(JSON.stringify(value));
const tests = [];
const test = (name, run) => tests.push({ name, run });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

function environment({ lazyRenderer = false, permissionAvailable = true, importedPaths = false, navigationAvailable = true, unknownUsers = [], profileAvailable = true } = {}) {
    const missingUsers = new Set(unknownUsers), fetchedUsers = new Map(), userUpdates = [], httpCalls = [], openedProfiles = [];
    const platformLinks = [], toasts = [], pathModules = new Map(), namedModules = new Map();
    const coldModules = [], initializedModules = [], copiedText = [];
    const storeIds = { UserStore: 20, RelationshipStore: 40, ChannelStore: 60, GuildStore: 70, MessageStore: 80 };
    let currentAccount = 'self';
    const records = {
        category: Object.freeze({ id: 'cat', guild_id: 'g1', type: 4, name: 'Staff', position: 1 }),
        visible: Object.freeze({ id: 'general', guild_id: 'g1', type: 0, name: 'general', parent_id: 'cat', position: 0 }),
        hidden: Object.freeze({ id: 'staff', guild_id: 'g1', type: 0, name: 'staff-chat', parent_id: 'cat', position: 1, topic: 'Cached staff topic',
            lastMessageId: String((BigInt(Date.parse('2026-10-29T14:50:00Z')) - 1420070400000n) << 22n),
            lastPinTimestamp: '2026-06-24T15:22:00Z',
            permissionOverwrites: Object.freeze({
                g1: { id: 'g1', type: 0, allow: '0', deny: '1024' },
                mod: { id: 'mod', type: 0, allow: '1024', deny: '0' },
                admin: { id: 'admin', type: 0, allow: '0', deny: '1024' },
                muted: { id: 'muted', type: 0, allow: '0', deny: '1024' },
                direct: { id: 'direct', type: 1, allow: '1024', deny: '0' },
            }),
        }),
        voice: Object.freeze({ id: 'voice', guild_id: 'g1', type: 2, name: 'Staff voice', parent_id: 'cat', position: 0, bitrate: 64000 }),
        forum: Object.freeze({ id: 'forum', guild_id: 'g1', type: 15, name: 'Staff forum', parent_id: 'cat', position: 2 }),
        uncategorized: Object.freeze({ id: 'unlisted', guild_id: 'g1', type: 5, name: 'Private news', position: 0 }),
        thread: Object.freeze({ id: 'thread', guild_id: 'g1', type: 12, name: 'Private thread', parent_id: 'staff', position: 3 }),
        other: Object.freeze({ id: 'other', guild_id: 'g2', type: 0, name: 'Other server', position: 1 }),
    };
    const visible = new Set(['general']);
    const allRecords = Object.fromEntries(Object.values(records).map(c => [c.id, c]));
    let guildRecords = { g1: { id: 'g1', name: 'First server', ownerId: 'owner' }, g2: { id: 'g2', name: 'Second server' } };
    const roles = {
        g1: { id: 'g1', name: '@everyone', permissions: '0', position: 0 },
        mod: { id: 'mod', name: 'Discord Mod', permissions: '0', color: 5793266, position: 4 },
        admin: { id: 'admin', name: 'The Mane 6', permissions: '8', color: 16717769, position: 5 },
        muted: { id: 'muted', name: 'Muted', permissions: '1024', color: 0, position: 1 },
    };
    const subscriptions = new Set(), waits = [], cleanups = [], patchHistory = [], alerts = [];
    const withStoreEvents = value => Object.assign(value, {
        addChangeListener: fn => subscriptions.add(fn),
        removeChangeListener: fn => subscriptions.delete(fn),
    });

    class Category {
        constructor(guild, id, entries, record) {
            this.guild = guild; this.id = id; this.record = record; this.isCollapsed = false; this.shownChannelIds = null;
            this.channels = Object.fromEntries(entries.map(record => [record.id, { id: record.id, record, threadIds: [], threadCount: 0 }]));
        }
        invalidate() { this.shownChannelIds = null; }
        getShownChannelIds() {
            if (this.shownChannelIds == null) this.shownChannelIds = this.isCollapsed ? []
                : Object.keys(this.channels).filter(id => visible.has(id));
            return this.shownChannelIds;
        }
        shouldShowEmptyCategory() { return false; }
        getRows() {
            const ids = this.getShownChannelIds();
            return !ids.length && this.shouldShowEmptyCategory() ? ['native-placeholder'] : ids;
        }
    }
    class GuildModel {
        constructor(id) {
            this.id = id; this.version = 1; this.rows = null; this.sections = null;
            this.categories = id === 'g1' ? { cat: new Category(this, 'cat',
                [records.visible, records.hidden, records.voice, records.forum, records.thread], records.category) } : {};
            this.noParentCategory = new Category(this, 'null', id === 'g1' ? [records.uncategorized] : [records.other]);
            this.favoritesCategory = new Category(this, 'favorites', id === 'g1' ? [records.hidden] : []);
            this.recentsCategory = new Category(this, 'recents', id === 'g1' ? [records.hidden] : []);
            this.voiceChannelsCategory = new Category(this, 'voice-category', id === 'g1' ? [records.voice] : []);
        }
        invalidate() { this.version++; this.rows = null; this.sections = null; }
        getCategories() {
            return [null, null, this.favoritesCategory, this.recentsCategory, this.noParentCategory,
                ...Object.values(this.categories), this.voiceChannelsCategory];
        }
        getRows() {
            if (!this.rows) this.rows = this.getCategories().map(c => c?.getRows() || []);
            return this.rows;
        }
        getSections() {
            if (!this.sections) this.sections = this.getRows().map(rows => rows.length);
            return this.sections;
        }
        getCategoryFromSection(section) { return this.getCategories()[section]; }
        getChannelFromSectionRow(section, row) {
            const category = this.getCategoryFromSection(section);
            const id = category?.getShownChannelIds()[row], channel = category?.channels[id];
            return channel ? { category, channel } : null;
        }
    }
    const models = { g1: new GuildModel('g1'), g2: new GuildModel('g2') };
    let emitCount = 0, nativeCalls = 0, reloads = 0;
    const listStore = {
        getGuild(id, opts) {
            const model = models[id]; model?.getSections(); // Emulate pre-existing cached layout.
            return { guildChannels: model, guildChannelsVersion: model?.version, originalOptions: opts };
        },
        getGuildWithoutChangingGuildActionRows(id) { return this.getGuild(id); },
        emitChange() { emitCount++; },
    };
    const permissionStore = withStoreEvents({ can(bit, record) {
        assert.equal(String(bit), '1024');
        return record.id === 'unknown' ? undefined : visible.has(record.id);
    } });
    const stores = {
        GuildStore: withStoreEvents({ getGuild: id => guildRecords[id], getGuilds: () => guildRecords }),
        ChannelStore: withStoreEvents({ getChannel: id => allRecords[id] }),
        ChannelListStore: listStore,
        GuildRoleStore: withStoreEvents({ getRoles: () => roles }),
        UserStore: withStoreEvents({
            getCurrentUser: () => ({ id: currentAccount }),
            getUser: id => fetchedUsers.get(id) || (missingUsers.has(id) ? undefined : { id, username: id === 'owner' ? 'Dylan' : 'Winter Shine' }),
        }),
        GuildMemberStore: withStoreEvents({ getMember: (_guild, id) => ({ userId: id, nick: id === 'direct' ? 'Winter' : undefined }) }),
        ...(permissionAvailable ? { PermissionStore: permissionStore } : {}),
    };
    const renderer = {
        receiver: 'native',
        renderChannelListItem(options) {
            nativeCalls++; assert.equal(this.receiver, 'native'); return { type: 'NativeRow', options };
        },
        getChannelListItemSize(options) { assert.equal(this.receiver, 'native'); return options.fontScale ? 300 : 37; },
    };
    const sizes = { getScaledChannelRowHeight: scale => 16 + 20 * scale + 0.5 };
    const gradient = { CustomThemedGradient() {}, validateColors() {},
        default: props => ({ type: 'ThemeGradient', props: { ...props, children: [] } }) };
    const profileModule = {
        getUserProfileActionSheetKey: id => 'UserProfile' + id,
        default: options => { openedProfiles.push(options); },
    };
    const registry = Object.values(stores).concat(sizes, gradient, profileAvailable ? [profileModule] : [], lazyRenderer || importedPaths ? [] : renderer);
    const React = {
        Fragment: 'Fragment',
        createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
        useState: value => [value, () => {}],
        useEffect() {},
    };
    const RN = {
        Text: 'Text', TextInput: 'TextInput', View: 'View', Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal', SafeAreaView: 'SafeAreaView',
        useColorScheme: () => 'dark', PixelRatio: { getFontScale: () => 1 },
        Alert: { alert: (...args) => alerts.push(args) },
        Linking: { openURL: async url => { platformLinks.push(url); } },
        ToastAndroid: { SHORT: 0, show: message => toasts.push(message) },
    };
    // Model Metro's dependency prefilter: ordinary name/property searches see
    // only initialized exports; a matching dependency filter may run a factory.
    const composable = filter => Object.assign(filter, { and(other) { return composable({ kind: 'and', base: filter, other }); } });
    const withDependencies = values => composable({ kind: 'dependencies', values });
    withDependencies.ordered = values => values;
    withDependencies.relative = offset => ({ relative: offset });
    function matchesExports(filter, module) {
        if (!module) return false;
        if (filter.kind === 'name') return [module, module.default].some(value => value?.name === filter.name);
        if (filter.kind === 'store') return module === stores[filter.name];
        return [module, module.default].some(value => value && filter.every(key => typeof value[key] !== 'undefined'));
    }
    function dependencyMatch(filter, candidate) {
        let cursor = 0;
        return filter.values.every(value => {
            const id = typeof value === 'number' ? value : candidate.id + value.relative;
            const at = candidate.dependencies.indexOf(id, cursor);
            if (at < 0) return false;
            cursor = at + 1; return true;
        });
    }
    const finders = {
        filters: { withProps: (...props) => composable(props), withName: name => composable({ kind: 'name', name }), withDependencies },
        lookupModule(filter, options = {}) {
            if (filter.kind === 'and') {
                for (const candidate of coldModules) {
                    if (!dependencyMatch(filter.other, candidate)) continue;
                    if (!candidate.module && options.initialize !== false) {
                        initializedModules.push(candidate.id);
                        candidate.module = candidate.factory();
                    }
                    if (matchesExports(filter.base, candidate.module)) return [candidate.module, candidate.id];
                }
                return [];
            }
            if (filter.kind === 'store') return [stores[filter.name], storeIds[filter.name]];
            if (filter.kind === 'name' && namedModules.has(filter.name)) return [namedModules.get(filter.name)];
            const module = registry.find(value => matchesExports(filter, value));
            return [module, Object.entries(stores).find(([, value]) => value === module)?.[0]
                && storeIds[Object.entries(stores).find(([, value]) => value === module)[0]]];
        },
        getModules(props, callback) {
            const wait = { props, callback, active: true }; waits.push(wait);
            return () => { wait.active = false; };
        },
    };
    const pathCallbacks = new Map();
    const pathFinders = {
        lookupModuleWithImportedPath: path => pathModules.has(path) ? [pathModules.get(path)] : [],
        getModuleWithImportedPath(p, callback) {
            const item = { callback, active: true }; pathCallbacks.set(p, item);
            if (importedPaths && p.endsWith('renderRedesignChannelListItem.tsx')) callback(renderer);
            return () => { item.active = false; };
        },
    };
    const patcher = {
        instead(owner, key, hook) {
            const original = owner[key], descriptor = Object.getOwnPropertyDescriptor(owner, key);
            function replacement(...args) { return hook.call(this, args, original); }
            Object.defineProperty(owner, key, { configurable: true, writable: true, value: replacement, enumerable: descriptor?.enumerable ?? false });
            patchHistory.push({ owner, key, original });
            let removed = false;
            return () => {
                if (removed) return; removed = true;
                if (descriptor) Object.defineProperty(owner, key, descriptor); else delete owner[key];
            };
        },
    };
    const routes = new Map(), visits = [];
    let currentRoute;
    const navigation = {
        isReady: () => true,
        navigate(name, params) { visits.push({ name, params }); currentRoute = { name, params }; },
        getCurrentRoute: () => currentRoute,
        goBack() { currentRoute = undefined; },
        setOptions() {},
    };
    const settings = {
        onSettingsModulesLoaded(fn) { fn(); return () => {}; },
        registerSettingsItem(key, value) { routes.set(key, value); return () => routes.delete(key); },
        refreshSettings() {},
    };
    const api = {
        cleanup: fn => cleanups.push(fn),
        plugin: { requireReload: () => reloads++, reportError: error => { throw error; } },
        unscoped: {
            react: { React, ReactNative: RN }, modules: { finders }, patcher,
            externals: { ReactNativeClipboard: { Clipboard: { setString: value => copiedText.push(value) } } },
            discord: {
                actions: { ActionSheetActionCreatorsModuleId: 30 },
                modules: navigationAvailable ? { settings, mainTabsV2: { RootNavigationRef: { getRootNavigationRef: () => navigation } } } : {},
                design: { Design: {} }, common: { logger: { LoggerModuleId: 10 }, importTracker: { ImportTrackerModuleId: 99 }, constants: { Constants: {} }, flux: { Dispatcher: {
                    dispatch(event) {
                        if (event.type === 'USER_UPDATE') { userUpdates.push(event); fetchedUsers.set(String(event.user.id), event.user); }
                    },
                } } },
                utils: { modules: { finders: pathFinders } },
                flux: {
                    Stores: stores,
                    withStoreName: name => composable({ kind: 'store', name }),
                    getStore(name, callback) {
                        const item = { active: true }; waits.push(item);
                        if (stores[name]) callback(stores[name]);
                        return () => { item.active = false; };
                    },
                },
            },
        },
    };
    return {
        api, models, records, stores, visible, renderer, React, RN, sizes, subscriptions, cleanups, waits, alerts, patchHistory,
        roles, routes, visits, navigation, gradient, httpCalls, openedProfiles, userUpdates, platformLinks, toasts, profileModule,
        initializedModules, copiedText,
        installCold(id, dependencies, factory) { coldModules.push({ id, dependencies, factory }); },
        installPath(path, module) {
            pathModules.set(path, module);
            const subscription = pathCallbacks.get(path);
            if (subscription?.active) subscription.callback(module);
        },
        installNamed(name, module) { namedModules.set(name, module); },
        installHTTP(handler) {
            const HTTP = { get(options) { assert.equal(this, HTTP); httpCalls.push(options); return handler(options); } };
            registry.push({ HTTP });
        },
        setOwner(id) { guildRecords.g1.ownerId = id; },
        changeAccount() { currentAccount = 'different-account'; },
        loadRenderer() {
            registry.push(renderer);
            for (const wait of waits) if (wait.active && wait.callback && wait.props?.every(key => key in renderer)) wait.callback(renderer);
        },
        changeRoles() { for (const fn of [...subscriptions]) fn(); },
        switchAccount() { currentAccount = 'different-account'; guildRecords = { g3: { id: 'g3', name: 'New account server' } }; },
        stats: () => ({ nativeCalls, emitCount, reloads }),
        addModel(id) { models[id] = new GuildModel(id); return models[id]; },
    };
}
function setup(options) {
    const e = environment(options), runtime = createRuntime(e.api);
    e.stores.ChannelListStore.getGuild('g1');
    return { e, runtime, model: e.models.g1, category: e.models.g1.categories.cat };
}
function findNode(node, predicate) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) return node;
    for (const child of node.props?.children || []) {
        if (Array.isArray(child)) { for (const item of child) { const found = findNode(item, predicate); if (found) return found; } }
        else { const found = findNode(child, predicate); if (found) return found; }
    }
}
function textOf(node) {
    if (node == null || node === false) return '';
    if (typeof node !== 'object') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join(' ');
    return (node.props?.children || []).map(textOf).join(' ');
}

test('native server sections include hidden channels in their own category', () => {
    const { e, runtime, model, category } = setup();
    assert.equal(runtime.ready, true);
    assert.deepEqual(plain(category.getShownChannelIds()), ['general', 'staff', 'forum', 'voice']);
    assert.equal(model.getSections()[5], 4);
    assert.equal(model.getChannelFromSectionRow(5, 1).channel.record, e.records.hidden);
    runtime.dispose();
});
test('uncategorized channels appear in the native uncategorized section', () => {
    const { runtime, model } = setup();
    assert.deepEqual(plain(model.noParentCategory.getShownChannelIds()), ['unlisted']);
    assert.equal(model.getSections()[4], 1);
    runtime.dispose();
});
test('favorites, suggested and combined voice sections do not duplicate hidden channels', () => {
    const { runtime, model } = setup();
    assert.equal(model.favoritesCategory.getShownChannelIds().length, 0);
    assert.equal(model.recentsCategory.getShownChannelIds().length, 0);
    assert.equal(model.voiceChannelsCategory.getShownChannelIds().length, 0);
    runtime.dispose();
});
test('private thread records do not become top-level channel rows', () => {
    const { runtime, category } = setup();
    assert.ok(!category.getShownChannelIds().includes('thread'));
    runtime.dispose();
});
test('native row render is replaced for hidden channels, with no default navigation', () => {
    const { e, runtime, model } = setup();
    const result = e.renderer.renderChannelListItem({ guildChannels: model, section: 5, row: 1 });
    assert.equal(typeof result.type, 'function');
    const row = result.type(result.props);
    const pressable = findNode(row, n => n.type === 'Pressable');
    assert.match(pressable.props.accessibilityLabel, /staff-chat/);
    assert.equal(e.stats().nativeCalls, 0);
    pressable.props.onPress();
    assert.equal(e.alerts.length, 0);
    assert.equal(e.visits.length, 1);
    assert.match(e.visits[0].name, /lock-screen$/);
    assert.equal(e.visits[0].params.channelId, 'staff');
    runtime.dispose();
});
test('visible rows, native actions and original receivers are preserved', () => {
    const { e, runtime, model } = setup();
    const options = { guildChannels: model, section: 5, row: 0 };
    assert.equal(e.renderer.renderChannelListItem(options).type, 'NativeRow');
    assert.equal(e.stats().nativeCalls, 1);
    assert.equal(e.renderer.getChannelListItemSize({ ...options, fontScale: 2 }), 300);
    assert.equal(e.renderer.renderChannelListItem({ guildChannels: model, section: 0, row: 0 }).type, 'NativeRow');
    runtime.dispose();
});
test('hidden text and voice rows use measured native height and font scaling', () => {
    const { e, runtime, model } = setup();
    assert.equal(e.renderer.getChannelListItemSize({ guildChannels: model, section: 5, row: 1, fontScale: 2 }), 56.5);
    assert.equal(e.renderer.getChannelListItemSize({ guildChannels: model, section: 5, row: 3, fontScale: 1 }), 36.5);
    const element = e.renderer.renderChannelListItem({ guildChannels: model, section: 5, row: 3 });
    assert.equal(findNode(element.type(element.props), n => n.type === 'Pressable').props.style.height, 36.5);
    runtime.dispose();
});
test('categories collapse and expand using native state', () => {
    const { runtime, model, category } = setup();
    category.isCollapsed = true; category.invalidate(); model.invalidate();
    assert.equal(category.getShownChannelIds().length, 0);
    assert.equal(category.shouldShowEmptyCategory(), true);
    assert.equal(model.getSections()[5], 1); // Native placeholder retains category header.
    category.isCollapsed = false; category.invalidate(); model.invalidate();
    assert.equal(model.getSections()[5], 4);
    runtime.dispose();
});
test('missing permissions fail closed instead of marking everything hidden', () => {
    const { runtime, category } = setup({ permissionAvailable: false });
    assert.deepEqual(plain(category.getShownChannelIds()), ['general']);
    assert.equal(runtime.permission({ id: 'unknown', guild_id: 'g1', type: 0 }), undefined);
    runtime.dispose();
});
test('no channel records or permission functions are changed', () => {
    const e = environment(), originalCan = e.stores.PermissionStore.can, originalFactory = e.React.createElement;
    const snapshot = JSON.stringify(e.records), runtime = createRuntime(e.api);
    e.stores.ChannelListStore.getGuild('g1').guildChannels.getSections();
    assert.equal(JSON.stringify(e.records), snapshot);
    assert.equal(e.stores.PermissionStore.can, originalCan);
    assert.equal(e.stores.PermissionStore.can(1024n, e.records.hidden), false);
    assert.equal(e.React.createElement, originalFactory);
    assert.ok(!source.includes('GuildsBarAnimatedItemWrapper'));
    runtime.dispose();
});
test('server membership guards prevent stale records after account switching', async () => {
    const { e, runtime, model, category } = setup();
    e.switchAccount(); e.changeRoles(); await tick();
    assert.equal(runtime.hiddenIds(category).length, 0);
    assert.equal(runtime.hiddenAt({ guildChannels: model, section: 5, row: 1 }), undefined);
    runtime.dispose();
});
test('role changes invalidate native section counts and return to normal row rendering', async () => {
    const { e, runtime, model } = setup();
    e.visible.add('staff'); e.changeRoles(); await tick();
    const row = model.categories.cat.getShownChannelIds().indexOf('staff');
    assert.equal(e.renderer.renderChannelListItem({ guildChannels: model, section: 5, row }).type, 'NativeRow');
    assert.equal(e.stores.PermissionStore.can(1024n, e.records.hidden), true);
    runtime.dispose();
});
test('lazy renderer installation refreshes previously cached native sections', async () => {
    const { e, runtime, model, category } = setup({ lazyRenderer: true });
    assert.equal(runtime.ready, false);
    assert.deepEqual(plain(category.getShownChannelIds()), ['general']);
    assert.equal(model.getSections()[5], 1);
    e.loadRenderer(); await tick();
    assert.equal(runtime.ready, true);
    assert.equal(model.getSections()[5], 4);
    assert.ok(e.stats().emitCount > 0);
    runtime.dispose();
});
test('Valenced imported-path discovery also installs the renderer', () => {
    const { runtime, model } = setup({ importedPaths: true });
    assert.equal(runtime.ready, true);
    assert.equal(model.getSections()[5], 4);
    runtime.dispose();
});
test('return envelope keeps native metadata and updates version after invalidation', () => {
    const { e, runtime, model } = setup();
    const options = { guildActionRows: ['channels-and-roles'] };
    const result = e.stores.ChannelListStore.getGuild('g1', options);
    assert.equal(result.originalOptions, options);
    assert.equal(result.guildChannelsVersion, model.version);
    assert.equal(result.guildChannels, model);
    const alternate = e.stores.ChannelListStore.getGuildWithoutChangingGuildActionRows('g1');
    assert.equal(alternate.guildChannels, model);
    runtime.dispose();
});
test('new native model instances are patched after channel changes', () => {
    const { e, runtime } = setup();
    const next = e.addModel('g1');
    assert.equal(e.stores.ChannelListStore.getGuild('g1').guildChannels, next);
    assert.equal(next.getSections()[5], 4);
    runtime.dispose();
});
test('stop restores original section counts and removes all hooks and listeners', async () => {
    const { e, runtime, model, category } = setup();
    runtime.dispose(); runtime.dispose(); await tick();
    assert.deepEqual(plain(category.getShownChannelIds()), ['general']);
    assert.equal(model.getSections()[5], 1);
    assert.equal(model.getSections()[4], 0);
    assert.equal(e.subscriptions.size, 0);
    assert.ok(e.waits.every(w => !w.active));
    for (const patch of e.patchHistory) assert.equal(patch.owner[patch.key], patch.original);
});
test('packaged source evaluates with the exact Valenced expression loader', () => {
    const options = new Function('valenced', 'plugin', 'return ' + source)({}, value => value).default;
    const e = environment();
    options.start(e.api);
    const settings = options.SettingsComponent({ api: e.api });
    assert.equal(typeof settings.type, 'function');
    assert.equal(settings.type().type, 'ScrollView');
    e.stores.ChannelListStore.getGuild('g1');
    options.stop({ plugin: e.api.plugin });
    for (const cleanup of e.cleanups) cleanup();
    assert.equal(e.stats().reloads, 1);
    assert.equal(options.SettingsComponent({ api: e.api }).type, 'Text');
});
test('locked channel opens a full screen with theme background, dates and role chips', () => {
    const { e, runtime } = setup();
    assert.equal(runtime.openLockScreen(e.records.hidden), true);
    const visit = e.visits[0], definition = e.routes.get(visit.name);
    const Screen = definition.screen.getComponent();
    const content = Screen({ route: visit, navigation: e.navigation });
    const tree = content.type(content.props);
    const text = textOf(tree);
    assert.match(text, /This is a hidden text channel/);
    assert.match(text, /Last message created:/);
    assert.match(text, /Last message pin:/);
    assert.match(text, /Discord Mod/);
    assert.match(text, /The Mane 6/);
    assert.match(text, /Dylan/);
    assert.match(text, /Winter/);
    assert.ok(findNode(tree, n => n.type === e.gradient.default));
    assert.ok(!findNode(tree, n => n.type === 'Modal'));
    assert.equal(e.alerts.length, 0);
    runtime.dispose();
    assert.equal(e.routes.size, 0);
    assert.equal(e.navigation.getCurrentRoute(), undefined);
});
test('channel timestamps support camelCase, snake_case and absent values honestly', () => {
    const { e, runtime } = setup();
    const data = runtime.detailsOf(e.records.hidden);
    assert.ok(!data.lastMessage.includes('Unavailable'));
    assert.ok(!data.lastPin.includes('Unavailable'));
    const snake = runtime.detailsOf({ guild_id: 'g1', last_message_id: e.records.hidden.lastMessageId, last_pin_timestamp: '2026-06-24T15:22:00Z' });
    assert.equal(snake.lastMessage, data.lastMessage);
    assert.equal(snake.lastPin, data.lastPin);
    assert.equal(runtime.detailsOf({ guild_id: 'g1' }).lastMessage, 'Unavailable');
    assert.equal(runtime.detailsOf({ guild_id: 'g1', lastPinTimestamp: 'broken' }).lastPin, 'Unavailable');
    assert.equal(runtime.snowflakeTime('broken'), undefined);
    assert.equal(runtime.snowflakeTime(e.records.hidden.lastMessageId), Date.parse('2026-10-29T14:50:00Z'));
    runtime.dispose();
});
test('role chips respect administrator, everyone overwrite and role overwrite precedence', () => {
    const { e, runtime } = setup();
    const entries = runtime.allowedEntries(e.records.hidden);
    assert.ok(entries.some(x => x.id === 'admin'));
    assert.ok(entries.some(x => x.id === 'mod'));
    assert.ok(!entries.some(x => x.id === 'muted'));
    assert.ok(!entries.some(x => x.id === 'g1'));
    e.roles.g1.permissions = '1024';
    const all = runtime.allowedEntries({ guild_id: 'g1' });
    assert.deepEqual(plain(all.filter(x => x.kind === 'role').map(x => x.id)), ['g1']);
    runtime.dispose();
});
test('unknown role and user identities use IDs instead of invented names', () => {
    const { e, runtime } = setup();
    delete e.stores.UserStore.getUser;
    const entries = runtime.allowedEntries({ guild_id: 'g1', permission_overwrites: [
        { id: 'not-cached', type: 0, allow: { bitfield: '1024' }, deny: '0' },
        { id: 'someone', type: 1, allow: '1024', deny: '0' },
    ] });
    assert.ok(entries.some(x => x.name === 'Role not-cached'));
    assert.ok(entries.some(x => x.name === 'User someone'));
    runtime.dispose();
});
test('native route back button returns to server and no channel chat is selected', () => {
    const { e, runtime } = setup();
    runtime.openLockScreen(e.records.hidden);
    const definition = e.routes.get(e.visits[0].name);
    const Screen = definition.screen.getComponent();
    const child = Screen({ route: e.visits[0], navigation: e.navigation });
    const tree = child.type(child.props);
    findNode(tree, n => n.props?.accessibilityLabel === 'Back to server').props.onPress();
    assert.equal(e.navigation.getCurrentRoute(), undefined);
    assert.equal(e.stats().nativeCalls, 0);
    assert.equal(e.alerts.length, 0);
    runtime.dispose();
});
test('full-screen modal fallback works when route APIs are unavailable', () => {
    const { e, runtime, model } = setup({ navigationAvailable: false });
    const element = e.renderer.renderChannelListItem({ guildChannels: model, section: 5, row: 1 });
    const state = []; let cursor = 0;
    e.React.useState = initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = value; }]; };
    const render = () => { cursor = 0; return element.type(element.props); };
    let tree = render();
    findNode(tree, n => n.type === 'Pressable').props.onPress();
    tree = render();
    const modal = findNode(tree, n => n.type === 'Modal');
    assert.ok(modal);
    assert.equal(modal.props.presentationStyle, 'fullScreen');
    assert.equal(modal.props.transparent, false);
    assert.equal(e.alerts.length, 0);
    modal.props.onRequestClose();
    assert.ok(!findNode(render(), n => n.type === 'Modal'));
    runtime.dispose();
});
test('open screen drops channel details after account membership changes', () => {
    const { e, runtime } = setup();
    e.switchAccount();
    const tree = runtime.LockScreenContent({ record: e.records.hidden, onBack() {} });
    assert.match(textOf(tree), /Channel details unavailable/);
    assert.ok(!textOf(tree).includes('Discord Mod'));
    assert.equal(runtime.openLockScreen(e.records.hidden), false);
    runtime.dispose();
});
test('unreachable nested navigator route uses the full-screen fallback', () => {
    const { e, runtime } = setup();
    e.navigation.getRootState = () => ({ routeNames: ['MainTabs', 'Settings'] });
    assert.equal(runtime.openLockScreen(e.records.hidden), false);
    assert.equal(e.visits.length, 0);
    runtime.dispose();
});
test('modern Libdiscore role snapshots resolve role names and colours', () => {
    const { e, runtime } = setup();
    delete e.stores.GuildRoleStore.getRoles;
    e.stores.GuildRoleStore.getRolesSnapshot = () => e.roles;
    const entries = runtime.allowedEntries(e.records.hidden);
    assert.equal(entries.find(x => x.id === 'mod').name, 'Discord Mod');
    assert.equal(entries.find(x => x.id === 'admin').name, 'The Mane 6');
    assert.notEqual(entries.find(x => x.id === 'mod').color, '#a7b1c2');
    runtime.dispose();
});
test('modern sorted roles and individual role getter are supported', () => {
    const { e, runtime } = setup();
    delete e.stores.GuildRoleStore.getRoles;
    e.stores.GuildRoleStore.getSortedRoles = () => Object.values(e.roles);
    assert.equal(runtime.allowedEntries(e.records.hidden).find(x => x.id === 'mod').name, 'Discord Mod');
    delete e.stores.GuildRoleStore.getSortedRoles;
    e.stores.GuildRoleStore.getRole = (guildId, id) => { assert.equal(guildId, 'g1'); return e.roles[id]; };
    assert.equal(runtime.allowedEntries(e.records.hidden).find(x => x.id === 'mod').name, 'Discord Mod');
    runtime.dispose();
});
test('uncached usernames resolve through Discord HTTP and update the rendered entry', async () => {
    const id = '399862294143696897';
    const { e, runtime } = setup({ unknownUsers: [id] });
    e.setOwner(id);
    e.installHTTP(async options => ({ body: { id, username: 'actual_username', global_name: 'Actual Display Name' } }));
    const before = runtime.allowedEntries(e.records.hidden).find(x => x.id === id);
    assert.equal(before.resolved, false);
    await runtime.hydrateDetails(e.records.hidden);
    const after = runtime.allowedEntries(e.records.hidden).find(x => x.id === id);
    assert.equal(after.name, 'Actual Display Name');
    assert.equal(after.username, 'actual_username');
    assert.equal(after.resolved, true);
    assert.equal(e.httpCalls.length, 1);
    assert.equal(e.httpCalls[0].url, '/users/' + id);
    assert.equal(e.userUpdates.length, 1);
    runtime.dispose();
});
test('simultaneous username requests share one lookup', async () => {
    const id = '399862294143696897';
    const { e, runtime } = setup({ unknownUsers: [id] });
    let finish;
    e.installHTTP(() => new Promise(resolve => { finish = resolve; }));
    const first = runtime.resolveUser(id, 'g1');
    const second = runtime.resolveUser(id, 'g1');
    assert.equal(first, second);
    await tick();
    finish({ body: { id, username: 'real_user' } });
    assert.equal((await first).username, 'real_user');
    assert.equal(e.httpCalls.length, 1);
    runtime.dispose();
});
test('username lookup respects rate limits and does not retry on each render', async () => {
    const id = '399862294143696897';
    const { e, runtime } = setup({ unknownUsers: [id] });
    e.installHTTP(async () => { throw { status: 429, body: { retry_after: 60 } }; });
    assert.equal(await runtime.resolveUser(id, 'g1'), null);
    assert.equal(await runtime.resolveUser(id, 'g1'), null);
    assert.equal(await runtime.resolveUser(id, 'g1', true), null);
    assert.equal(e.httpCalls.length, 1);
    runtime.dispose();
});
test('late username responses after stop do not write into Discord caches', async () => {
    const id = '399862294143696897';
    const { e, runtime } = setup({ unknownUsers: [id] });
    let finish;
    e.installHTTP(() => new Promise(resolve => { finish = resolve; }));
    const pending = runtime.resolveUser(id, 'g1');
    await tick(); runtime.dispose();
    assert.equal(await pending, null);
    finish({ body: { id, username: 'late_user' } });
    await tick();
    assert.equal(e.userUpdates.length, 0);
});
test('username responses from a previous account are discarded even in the same guild', async () => {
    const id = '399862294143696897';
    const { e, runtime } = setup({ unknownUsers: [id] });
    let finish;
    e.installHTTP(() => new Promise(resolve => { finish = resolve; }));
    const pending = runtime.resolveUser(id, 'g1');
    await tick(); e.changeAccount();
    finish({ body: { id, username: 'previous_account_data' } });
    assert.equal(await pending, null);
    assert.equal(e.userUpdates.length, 0);
    runtime.dispose();
});
test('guild nicknames from the modern getNick API are displayed with the username', () => {
    const { e, runtime } = setup();
    e.stores.GuildMemberStore.getMember = () => undefined;
    e.stores.GuildMemberStore.getNick = () => 'Server Nickname';
    const user = runtime.allowedEntries(e.records.hidden).find(x => x.id === 'owner');
    assert.equal(user.name, 'Server Nickname');
    assert.equal(user.username, 'Dylan');
    runtime.dispose();
});
test('user chips open the server member profile using an accessible channel', async () => {
    const id = '399862294143696897';
    const { e, runtime } = setup();
    e.setOwner(id);
    const tree = runtime.LockScreenContent({ record: e.records.hidden, onBack() {} });
    const chip = findNode(tree, node => node.props?.accessibilityLabel === 'Open profile: Winter Shine');
    assert.ok(chip);
    assert.equal(chip.type, 'Pressable');
    chip.props.onPress();
    await tick();
    assert.equal(e.openedProfiles.length, 1);
    assert.equal(e.openedProfiles[0].userId, id);
    assert.equal(e.openedProfiles[0].guildId, 'g1');
    assert.equal(e.openedProfiles[0].channelId, 'general');
    assert.ok(!('ignoreBlockedSpeedBump' in e.openedProfiles[0]));
    assert.equal(e.httpCalls.length, 0);
    runtime.dispose();
});
test('full-screen modal closes before the profile sheet opens', async () => {
    const id = '399862294143696897';
    const { e, runtime, model } = setup({ navigationAvailable: false });
    e.setOwner(id);
    const element = e.renderer.renderChannelListItem({ guildChannels: model, section: 5, row: 1 });
    const state = []; let cursor = 0;
    e.React.useState = initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = value; }]; };
    const render = () => { cursor = 0; return element.type(element.props); };
    findNode(render(), n => n.type === 'Pressable').props.onPress();
    const modal = findNode(render(), n => n.type === 'Modal');
    const content = modal.props.children[0];
    content.props.onUserPress(id);
    assert.ok(!findNode(render(), n => n.type === 'Modal'));
    assert.equal(e.openedProfiles.length, 0);
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(e.openedProfiles.length, 1);
    assert.equal(e.openedProfiles[0].userId, id);
    runtime.dispose();
});
test('preloaded profile URL handler receives a user payload when the profile module is absent', async () => {
    const id = '399862294143696897', calls = [];
    const { e, runtime } = setup({ profileAvailable: false });
    e.installPath('modules/links/native/handleSupportedURL.tsx', {
        default(options) { calls.push(options); return true; },
    });
    assert.equal(await runtime.openUserProfile(id, 'g1'), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.type, 'user-profile');
    assert.equal(calls[0].payload.userId, id);
    assert.equal(calls[0].safe, true);
    assert.equal(calls[0].payload.guildId, 'g1');
    assert.equal(calls[0].payload.channelId, 'general');
    assert.equal(e.platformLinks.length, 0);
    assert.equal(e.toasts.length, 0);
    runtime.dispose();
});
test('profile module loaded by the link handler is used on subsequent taps', async () => {
    const id = '399862294143696897'; let links = 0;
    const { e, runtime } = setup({ profileAvailable: false });
    e.installPath('modules/links/native/handleSupportedURL.tsx', { default() {
        links++;
        e.installPath('modules/user_profile/native/showUserProfileActionSheet.tsx', e.profileModule);
        return true;
    } });
    assert.equal(await runtime.openUserProfile(id, 'g1'), true);
    assert.equal(await runtime.openUserProfile(id, 'g1'), true);
    assert.equal(links, 1);
    assert.equal(e.openedProfiles.length, 1);
    runtime.dispose();
});
test('nested default exports and discord_app import path prefixes resolve', async () => {
    const id = '399862294143696897';
    const { e, runtime } = setup({ profileAvailable: false });
    e.installPath('../discord_app/modules/user_profile/native/showUserProfileActionSheet.tsx',
        { default: { default(options) { e.openedProfiles.push(options); } } });
    assert.equal(await runtime.openUserProfile(id, 'g1'), true);
    assert.equal(e.openedProfiles[0].userId, id);
    assert.equal(e.platformLinks.length, 0);
    runtime.dispose();
});
test('post-connection profile export is supported without a default export', async () => {
    const id = '399862294143696897';
    const { e, runtime } = setup({ profileAvailable: false });
    e.installPath('discord_app/modules/user_profile/native/showUserProfileActionSheet.tsx',
        { showUserProfileActionSheetPostConnection(options) { e.openedProfiles.push(options); } });
    assert.equal(await runtime.openUserProfile(id, 'g1'), true);
    assert.equal(e.openedProfiles.length, 1);
    runtime.dispose();
});
test('in-app profile URL handler is used with external browsing disabled', async () => {
    const id = '399862294143696897', calls = [];
    const { e, runtime } = setup({ profileAvailable: false });
    e.installPath('modules/links/native/handleSupportedURL.tsx', { default: () => false });
    e.installPath('modules/links/native/handleURL.tsx', { default(url, options) { calls.push({ url, options }); } });
    assert.equal(await runtime.openUserProfile(id, 'g1'), true);
    assert.equal(calls[0].url, 'https://discord.com/users/' + id);
    assert.equal(calls[0].options.allowExternal, false);
    assert.equal(e.platformLinks.length, 0);
    runtime.dispose();
});
test('Discord-only native URI opens a profile when JS profile and link modules are absent', async () => {
    const id = '399862294143696897';
    const { e, runtime } = setup({ profileAvailable: false });
    assert.equal(await runtime.openUserProfile(id, 'g1'), true);
    assert.equal(e.platformLinks.length, 1);
    assert.equal(e.platformLinks[0], 'discord://-/users/' + id);
    assert.equal(e.toasts.length, 0);
    assert.ok(!source.includes('Open a normal profile once'));
    runtime.dispose();
});
test('a throwing direct profile opener falls back to native routing', async () => {
    const id = '399862294143696897'; let routed = 0;
    const { e, runtime } = setup();
    e.profileModule.default = () => { throw new Error('Old profile export'); };
    e.installNamed('handleSupportedURL', { default() { routed++; return true; } });
    assert.equal(await runtime.openUserProfile(id, 'g1'), true);
    assert.equal(routed, 1);
    assert.equal(e.toasts.length, 0);
    runtime.dispose();
});
test('disabled plugin cannot open a fallback after an outstanding handler rejects', async () => {
    const id = '399862294143696897';
    const { e, runtime } = setup();
    let reject;
    e.profileModule.default = () => new Promise((_, fail) => { reject = fail; });
    const pending = runtime.openUserProfile(id, 'g1');
    await tick(); runtime.dispose();
    reject(new Error('Late profile error'));
    assert.equal(await pending, false);
    assert.equal(e.platformLinks.length, 0);
    assert.equal(e.toasts.length, 0);
});

test('Valenced dependency lookup initializes the cold profile module on the first tap', async () => {
    const id = '399862294143696897', calls = [];
    const { e, runtime } = setup({ profileAvailable: false });
    e.installCold(45, [10, 20, 46, 47, 48, 98], () => { throw new Error('Wrong dependency decoy must remain unloaded'); });
    e.installCold(50, [10, 11, 20, 51, 52, 53, 99], () => ({
        default: function showUserProfileActionSheet(options, mode) { calls.push({ options, mode }); },
    }));
    assert.equal(await runtime.openUserProfile(id, 'g1'), true);
    assert.deepEqual(e.initializedModules, [50]);
    assert.equal(calls.length, 1);
    assert.deepEqual(plain(calls[0]), { options: { userId: id, guildId: 'g1', channelId: 'general' }, mode: 'stack' });
    assert.equal(e.platformLinks.length, 0);
    assert.match(runtime.profileDiagnostics(), /profile module initialised/);
    assert.equal(await runtime.openUserProfile(id, 'g1'), true);
    assert.deepEqual(e.initializedModules, [50]);
    runtime.dispose();
});
test('current action-sheet dependency anchors load an unnamed profile export', async () => {
    const id = '399862294143696897', calls = [];
    const { e, runtime } = setup({ profileAvailable: false });
    e.installCold(50, [10, 7, 8, 30, 9, 40, 99], () => ({
        getUserProfileActionSheetKey: userId => 'Profile' + userId,
        default(options, mode) { calls.push({ options, mode }); },
    }));
    assert.equal(await runtime.openUserProfile(id, 'g1'), true);
    assert.deepEqual(e.initializedModules, [50]);
    assert.deepEqual(plain(calls[0]), { options: { userId: id, guildId: 'g1', channelId: 'general' }, mode: 'stack' });
    assert.equal(e.platformLinks.length, 0);
    runtime.dispose();
});
test('dependency matches must still confirm a profile export before invocation', async () => {
    const id = '399862294143696897', calls = [];
    const { e, runtime } = setup({ profileAvailable: false });
    e.installCold(45, [10, 20, 46, 47, 48, 99], () => ({ default() { throw new Error('Unrelated default function'); } }));
    e.installCold(50, [10, 20, 51, 52, 53, 99], () => ({
        default: function showUserProfileActionSheet(options) { calls.push(options); },
    }));
    assert.equal(await runtime.openUserProfile(id, 'g1'), true);
    assert.deepEqual(e.initializedModules, [45, 50]);
    assert.equal(calls.length, 1);
    assert.equal(e.platformLinks.length, 0);
    runtime.dispose();
});
test('Valenced dependency lookup initializes the native link handler when no profile export matches', async () => {
    const id = '399862294143696897', calls = [];
    const { e, runtime } = setup({ profileAvailable: false });
    e.installCold(100, [101, 7, 60, 70, 102, 80, 99], () => ({
        handleClick(options) { calls.push(options); },
    }));
    assert.equal(await runtime.openUserProfile(id, 'g1'), true);
    assert.deepEqual(e.initializedModules, [100]);
    assert.equal(calls[0].href, 'https://discord.com/users/' + id);
    assert.equal(typeof calls[0].onConfirm, 'function');
    assert.equal(e.platformLinks.length, 0);
    runtime.dispose();
});
test('failed profile routes retain sanitized errors that can be copied from settings', async () => {
    const id = '399862294143696897';
    const { e, runtime } = setup();
    e.profileModule.default = () => { throw new Error('Profile init failed for ' + id); };
    e.RN.Linking.openURL = async () => { throw new Error('No handler for https://discord.com/users/' + id); };
    assert.equal(await runtime.openUserProfile(id, 'g1'), false);
    const details = runtime.profileDiagnostics();
    assert.match(details, /native profile sheet failed: Profile init failed for \[id\]/);
    assert.match(details, /Discord URI rejected: No handler for \[url\]/);
    assert.match(details, /all profile routes failed/);
    assert.ok(!details.includes(id));
    assert.equal(e.toasts.length, 1);
    const copy = findNode(runtime.Settings(), node => node.props?.accessibilityLabel === 'Copy profile diagnostics');
    assert.ok(copy);
    copy.props.onPress();
    assert.deepEqual(e.copiedText, [details]);
    runtime.dispose();
});
test('late profile errors after disable do not alter diagnostics or reopen the UI', async () => {
    const id = '399862294143696897';
    const { e, runtime } = setup();
    let reject;
    e.profileModule.default = () => new Promise((_, fail) => { reject = fail; });
    const pending = runtime.openUserProfile(id, 'g1');
    await tick();
    const before = runtime.profileDiagnostics();
    runtime.dispose(); reject(new Error('Late native error'));
    assert.equal(await pending, false);
    assert.equal(runtime.profileDiagnostics(), before);
    assert.equal(e.toasts.length, 0);
});

test('server profiles reject hidden, foreign and unavailable selected channel contexts', async () => {
    for (const selected of ['staff', 'other', 'missing']) {
        const e = environment();
        e.stores.SelectedChannelStore = { getChannelId: () => selected };
        const runtime = createRuntime(e.api);
        e.stores.ChannelListStore.getGuild('g1');
        assert.equal(await runtime.openUserProfile('399862294143696897', 'g1'), true);
        assert.equal(e.openedProfiles[0].guildId, 'g1');
        assert.equal(e.openedProfiles[0].channelId, 'general');
        runtime.dispose();
    }
});
test('a server with no accessible text channel sends guild context without a hidden channel', async () => {
    const { e, runtime } = setup();
    e.visible.clear();
    await runtime.openUserProfile('399862294143696897', 'g1');
    assert.deepEqual(plain(e.openedProfiles[0]), { userId: '399862294143696897', guildId: 'g1' });
    runtime.dispose();
});
test('selected accessible channel in this server is preferred', async () => {
    const e = environment();
    const other = { id: 'selected-chat', guild_id: 'g1', type: 0 };
    const getChannel = e.stores.ChannelStore.getChannel;
    e.stores.ChannelStore.getChannel = id => id === other.id ? other : getChannel(id);
    e.stores.SelectedChannelStore = { getChannelId: () => other.id };
    e.visible.add(other.id);
    const runtime = createRuntime(e.api);
    e.stores.ChannelListStore.getGuild('g1');
    await runtime.openUserProfile('399862294143696897', 'g1');
    assert.equal(e.openedProfiles[0].channelId, other.id);
    runtime.dispose();
});
test('native avatars use the server and preserve valid error-like display names', () => {
    const { e, runtime } = setup();
    const id = '399862294143696897', calls = [];
    e.setOwner(id);
    e.stores.UserStore.getUser = () => ({ id, username: 'ush1e', globalName: '405 Method Not Found',
        getAvatarURL(guildId, size) { calls.push({ guildId, size }); return 'https://cdn.discordapp.com/example.png'; } });
    const entry = runtime.allowedEntries(e.records.hidden).find(x => x.id === id);
    assert.equal(entry.name, '405 Method Not Found');
    assert.equal(entry.username, 'ush1e');
    assert.equal(entry.avatars[0].source.uri, 'https://cdn.discordapp.com/example.png');
    assert.deepEqual(plain(calls[0]), { guildId: 'g1', size: 64 });
    const tree = runtime.LockScreenContent({ record: e.records.hidden });
    const avatar = findNode(tree, n => typeof n.type === 'function' && n.props?.entry?.id === id);
    assert.equal(avatar.type(avatar.props).type, 'Image');
    runtime.dispose();
});
test('raw HTTP users get server, global and default avatars with image failure fallback', async () => {
    const id = '399862294143696897', guildHash = 'a_1234567890abcdef1234567890abcdef', userHash = 'abcdef1234567890abcdef1234567890';
    const { e, runtime } = setup({ unknownUsers: [id] });
    e.setOwner(id);
    e.installHTTP(async () => ({ body: { id, username: 'real_user', avatar: userHash, discriminator: '0' } }));
    await runtime.resolveUser(id, 'g1');
    e.stores.GuildMemberStore.getMember = () => ({ avatar: guildHash });
    const entry = runtime.allowedEntries(e.records.hidden).find(x => x.id === id);
    assert.equal(entry.avatars.length, 3);
    assert.ok(entry.avatars[0].source.uri.includes('/guilds/g1/users/' + id + '/avatars/' + guildHash));
    assert.ok(entry.avatars[1].source.uri.includes('/avatars/' + id + '/' + userHash));
    assert.ok(entry.avatars[2].source.uri.includes('/embed/avatars/'));
    const tree = runtime.LockScreenContent({ record: e.records.hidden });
    const component = findNode(tree, n => typeof n.type === 'function' && n.props?.entry?.id === id);
    let failed = [];
    e.React.useState = () => [failed, update => { failed = update(failed); }];
    for (const expected of entry.avatars) {
        const image = component.type(component.props);
        assert.equal(image.type, 'Image');
        assert.deepEqual(plain(image.props.source), plain(expected.source));
        image.props.onError();
    }
    assert.equal(component.type(component.props).type, 'View');
    runtime.dispose();
});
test('native numeric avatar assets are rendered without a URI wrapper', () => {
    const { e, runtime } = setup();
    const id = '399862294143696897';
    e.setOwner(id);
    e.stores.UserStore.getUser = () => ({ id, username: 'asset-user', getAvatarURL: () => 42 });
    const entry = runtime.allowedEntries(e.records.hidden).find(x => x.id === id);
    assert.equal(entry.avatars[0].source, 42);
    runtime.dispose();
});

test('a masked main cache cannot replace the working list record name', () => {
    const { e, runtime, model } = setup();
    e.stores.ChannelStore.getChannel = id => ({ ...e.records.hidden, id, name: 'No Access' });
    const element = e.renderer.renderChannelListItem({ guildChannels: model, section: 5, row: 1 });
    const row = element.type(element.props);
    assert.ok(textOf(row).includes('staff-chat'));
    assert.ok(!textOf(row).includes('No Access'));
    runtime.dispose();
});
test('channel rows and detail headers preserve the supplied record without another name lookup', () => {
    const { e, runtime, model } = setup();
    let reads = 0;
    e.stores.ChannelStore.getChannel = () => { reads++; throw new Error('Different or masked cache'); };
    const element = e.renderer.renderChannelListItem({ guildChannels: model, section: 5, row: 1 });
    const row = element.type(element.props);
    assert.ok(textOf(row).includes('staff-chat'));
    const detail = runtime.LockScreenContent({ record: e.records.hidden });
    assert.ok(textOf(detail).includes('# staff-chat'));
    assert.equal(reads, 0);
    runtime.dispose();
});

test('hidden row labels use native text even when Discord supplies a themed text component', () => {
    const { e, runtime, model } = setup();
    e.api.unscoped.discord.design.Design.Text = function DiscordText() { return null; };
    const element = e.renderer.renderChannelListItem({ guildChannels: model, section: 5, row: 1 });
    const label = findNode(element.type(element.props), n => n.props?.children?.includes('staff-chat'));
    assert.ok(label);
    assert.equal(label.type, e.RN.Text);
    assert.equal(label.props.numberOfLines, 1);
    assert.equal(label.props.ellipsizeMode, 'tail');
    assert.equal(label.props.style.flex, 1);
    assert.equal(label.props.style.color, '#a8aabb');
    runtime.dispose();
});

test('original names including Unicode and literal access-like names are preserved', () => {
    for (const name of ['🌙┃staff・秘密', 'No Access', 'Hidden channel']) {
        const { e, runtime, model, category } = setup();
        category.channels.staff.record = Object.freeze({ ...e.records.hidden, name });
        let reads = 0;
        e.stores.ChannelStore.getChannel = () => { reads++; return { ...e.records.hidden, name: 'wrong-name' }; };
        const element = e.renderer.renderChannelListItem({ guildChannels: model, section: 5, row: 1 });
        const row = element.type(element.props);
        assert.ok(findNode(row, n => n.type === e.RN.Text && n.props.children.includes(name)));
        assert.equal(reads, 0);
        runtime.dispose();
    }
});

test('a missing list name can fall back to the matching local channel without mutating it', () => {
    const { e, runtime, model, category } = setup();
    const record = Object.freeze({ ...e.records.hidden, name: '   ' });
    category.channels.staff.record = record;
    const element = e.renderer.renderChannelListItem({ guildChannels: model, section: 5, row: 1 });
    const row = element.type(element.props);
    assert.ok(textOf(row).includes('staff-chat'));
    assert.match(findNode(row, n => n.type === 'Pressable').props.accessibilityLabel, /staff-chat/);
    assert.ok(textOf(runtime.LockScreenContent({ record })).includes('# staff-chat'));
    assert.equal(record.name, '   ');
    assert.equal(element.props.record, record);
    assert.equal(e.httpCalls.length, 0);
    runtime.dispose();
});

test('a missing name never falls back to another channel or server', () => {
    for (const fields of [{ id: 'wrong-id' }, { guild_id: 'g2' }, { guild_id: undefined }, { name: '' }, { name: null }]) {
        const { e, runtime, model, category } = setup();
        category.channels.staff.record = Object.freeze({ ...e.records.hidden, name: undefined });
        e.stores.ChannelStore.getChannel = () => ({ ...e.records.hidden, name: 'wrong-name', ...fields });
        const element = e.renderer.renderChannelListItem({ guildChannels: model, section: 5, row: 1 });
        const row = element.type(element.props);
        assert.ok(textOf(row).includes('Name unavailable'));
        assert.ok(!textOf(row).includes('wrong-name'));
        runtime.dispose();
    }
});

test('native detail navigation keeps the original list name when the main cache is masked or absent', () => {
    for (const getChannel of [() => undefined, () => { throw new Error('cache unavailable'); },
        id => ({ id, guild_id: 'g1', type: 0, name: 'No Access' })]) {
        const { e, runtime, model } = setup();
        let reads = 0;
        e.stores.ChannelStore.getChannel = (...args) => { reads++; return getChannel(...args); };
        const element = e.renderer.renderChannelListItem({ guildChannels: model, section: 5, row: 1 });
        const row = element.type(element.props);
        findNode(row, n => n.type === 'Pressable').props.onPress();
        const visit = e.visits[0], Screen = e.routes.get(visit.name).screen.getComponent();
        const content = Screen({ route: visit, navigation: e.navigation });
        assert.equal(content.props.record, e.records.hidden);
        const text = textOf(content.type(content.props));
        assert.ok(text.includes('# staff-chat'));
        assert.ok(text.includes('Cached staff topic'));
        assert.ok(text.includes('Permission details'));
        assert.ok(!text.includes('No Access'));
        assert.equal(reads, 0);
        assert.deepEqual(plain(visit.params), { channelId: 'staff', guildId: 'g1' });
        runtime.dispose();
    }
});

test('a native route cannot reuse the previous account channel snapshot in the same server', () => {
    const { e, runtime } = setup();
    runtime.openLockScreen(e.records.hidden);
    const visit = e.visits[0], Screen = e.routes.get(visit.name).screen.getComponent();
    e.changeAccount();
    const content = Screen({ route: visit, navigation: e.navigation });
    assert.equal(content.props.record, undefined);
    assert.ok(!textOf(content.type(content.props)).includes('staff-chat'));
    runtime.dispose();
});

test('modal details preserve the list name even when the main channel cache is masked', () => {
    const { e, runtime, model } = setup({ navigationAvailable: false });
    e.stores.ChannelStore.getChannel = id => ({ ...e.records.hidden, id, name: 'No Access' });
    const element = e.renderer.renderChannelListItem({ guildChannels: model, section: 5, row: 1 });
    const values = []; let cursor = 0;
    e.React.useState = initial => {
        const at = cursor++;
        if (!(at in values)) values[at] = initial;
        return [values[at], value => { values[at] = value; }];
    };
    const render = () => { cursor = 0; return element.type(element.props); };
    findNode(render(), n => n.type === 'Pressable').props.onPress();
    const modal = findNode(render(), n => n.type === 'Modal');
    const content = modal.props.children[0];
    const text = textOf(content.type(content.props));
    assert.ok(text.includes('# staff-chat'));
    assert.ok(!text.includes('No Access'));
    runtime.dispose();
});

test('failed native navigation does not retain an unopened channel record', () => {
    const { e, runtime } = setup();
    const cached = { ...e.records.hidden, name: 'current-cache-name' };
    e.stores.ChannelStore.getChannel = () => cached;
    e.navigation.navigate = () => { throw new Error('navigation unavailable'); };
    assert.equal(runtime.openLockScreen(e.records.hidden), false);
    const Screen = [...e.routes.values()][0].screen.getComponent();
    const content = Screen({ route: { params: { channelId: 'staff', guildId: 'g1' } }, navigation: e.navigation });
    assert.equal(content.props.record, cached);
    runtime.dispose();
});

function statefulScreen(e, runtime, record) {
    const values = []; let cursor = 0;
    e.React.useState = initial => {
        const at = cursor++;
        if (!(at in values)) values[at] = initial;
        return [values[at], update => { values[at] = typeof update === 'function' ? update(values[at]) : update; }];
    };
    return () => { cursor = 0; return runtime.LockScreenContent({ record }); };
}
test('channel details read text settings in both native naming formats', () => {
    const { e, runtime } = setup();
    const id = String((BigInt(Date.parse('2026-01-01T00:00:00Z')) - 1420070400000n) << 22n);
    for (const fields of [
        { rateLimitPerUser: 90, defaultThreadRateLimitPerUser: 0, defaultAutoArchiveDuration: 1440 },
        { rate_limit_per_user: 90, default_thread_rate_limit_per_user: 0, default_auto_archive_duration: 1440 },
    ]) {
        const rows = Object.fromEntries(runtime.channelInfo({ ...e.records.hidden, id, nsfw: true, ...fields }).rows.map(r => [r.label, r.value]));
        assert.equal(rows.Slowmode, '1 minute 30 seconds');
        assert.equal(rows['Thread slowmode'], 'Off');
        assert.equal(rows['Archive inactive threads after'], '1 day');
        assert.equal(rows['Age restriction'], '18+');
        assert.notEqual(rows['Channel created'], 'Unavailable');
    }
    runtime.dispose();
});
test('missing and invalid metadata does not produce fabricated defaults', () => {
    const { e, runtime } = setup();
    const info = runtime.channelInfo({ ...e.records.voice, bitrate: -5, user_limit: -1, video_quality_mode: 99 });
    assert.equal(info.rows.length, 0);
    assert.deepEqual(plain(runtime.channelInfo(e.records.hidden).rows), []);
    assert.equal(runtime.duration(null), undefined);
    assert.equal(runtime.duration('invalid'), undefined);
    assert.equal(runtime.duration(-1), undefined);
    runtime.dispose();
});
test('voice details show kbps, unlimited users and automatic region only when supplied', () => {
    const { e, runtime } = setup();
    const info = runtime.channelInfo({ ...e.records.voice, bitrate: 96000, userLimit: 0, rtcRegion: null,
        videoQualityMode: 2, rateLimitPerUser: 40 });
    const rows = Object.fromEntries(info.rows.map(r => [r.label, r.value]));
    assert.equal(rows.Bitrate, '96 kbps');
    assert.equal(rows['User limit'], 'No limit');
    assert.equal(rows['Voice region'], 'Automatic');
    assert.equal(rows['Video quality'], '720p');
    assert.equal(rows.Slowmode, undefined);
    runtime.dispose();
});
test('forum metadata preserves tags, moderation, zero-valued layout and sort order', () => {
    const { e, runtime } = setup();
    const record = { ...e.records.forum, flags: '16', defaultForumLayout: 0, defaultSortOrder: 0,
        defaultReactionEmoji: { emojiName: '🍓' }, availableTags: [{ id: 'tag', name: 'Help', moderated: true, emoji_name: '❓' }] };
    const info = runtime.channelInfo(record), rows = Object.fromEntries(info.rows.map(r => [r.label, r.value]));
    assert.equal(rows['Default layout'], 'Not set');
    assert.equal(rows['Sort posts by'], 'Latest activity');
    assert.equal(rows['Default reaction'], '🍓');
    assert.equal(rows['Tags required'], 'Yes');
    assert.deepEqual(plain(info.tags), [{ id: 'tag', name: 'Help', moderated: true, emoji: '❓' }]);
    const tree = runtime.LockScreenContent({ record });
    assert.ok(textOf(tree).includes('Help · moderator only'));
    runtime.dispose();
});
test('permission inspector distinguishes empty, missing, high-bit and unknown flags', () => {
    const { runtime } = setup();
    assert.deepEqual(plain(runtime.permissionLabels('0')), ['None']);
    assert.deepEqual(plain(runtime.permissionLabels(undefined)), ['Unavailable']);
    assert.deepEqual(plain(runtime.permissionLabels(String((1n << 10n) | (1n << 52n)))), ['View channel', 'Bypass slowmode']);
    assert.match(runtime.permissionLabels(1n << 60n)[0], /Other permission flags/);
    runtime.dispose();
});
test('permission inspector includes denied roles and respects role/member overwrite identity', () => {
    const { e, runtime } = setup();
    const rules = runtime.permissionDetails(e.records.hidden);
    assert.deepEqual(plain(rules.find(r => r.id === 'g1').deny), ['View channel']);
    assert.equal(rules.find(r => r.id === 'g1').name, '@everyone');
    assert.equal(rules.find(r => r.id === 'direct').name, 'Winter');
    assert.equal(rules.find(r => r.id === 'direct').kind, 'user');
    assert.equal(rules.find(r => r.id === 'muted').name, 'Muted');
    assert.deepEqual(plain(rules.find(r => r.id === 'mod').allow), ['View channel']);
    runtime.dispose();
});
test('permission panel is collapsed initially and expands without any network request', () => {
    const { e, runtime } = setup();
    const render = statefulScreen(e, runtime, e.records.hidden);
    assert.ok(!textOf(render()).includes('Denied: View channel'));
    findNode(render(), n => n.props?.accessibilityLabel === 'Permission details').props.onPress();
    assert.ok(textOf(render()).includes('Denied: View channel'));
    assert.equal(e.httpCalls.length, 0);
    runtime.dispose();
});
test('copy actions write only the requested channel ID, link or user ID', () => {
    const { e, runtime } = setup();
    const tree = runtime.LockScreenContent({ record: e.records.hidden });
    findNode(tree, n => n.props?.accessibilityLabel === 'Copy channel ID').props.onPress();
    findNode(tree, n => n.props?.accessibilityLabel === 'Copy channel link').props.onPress();
    findNode(tree, n => n.props?.accessibilityLabel === 'Open profile: Dylan').props.onLongPress();
    assert.deepEqual(e.copiedText, ['staff', 'https://discord.com/channels/g1/staff', 'owner']);
    assert.equal(e.visits.length, 0);
    assert.equal(e.httpCalls.length, 0);
    runtime.dispose();
});
test('settings save through the native storage API and reload with validated values', () => {
    const e = environment(), writes = [];
    const cache = { compactScreen: true, showDetails: false, rolesExpanded: false };
    e.api.jsonStorage = { cache, set(patch) { writes.push(patch); Object.assign(cache, patch); } };
    let runtime = createRuntime(e.api);
    let tree = runtime.LockScreenContent({ record: e.records.hidden });
    assert.ok(!findNode(tree, n => typeof n.type === 'function' && n.type.name === 'LockArt'));
    assert.equal(findNode(tree, n => n.props?.accessibilityLabel === 'Allowed users and roles').props.accessibilityState.expanded, false);
    const toggle = findNode(runtime.Settings(), n => n.props?.accessibilityLabel === 'Compact lock screen');
    toggle.props.onPress();
    assert.deepEqual(plain(writes), [{ compactScreen: false }]);
    runtime.dispose(); runtime = createRuntime(e.api);
    tree = runtime.LockScreenContent({ record: e.records.hidden });
    assert.ok(findNode(tree, n => typeof n.type === 'function' && n.type.name === 'LockArt'));
    assert.equal(findNode(runtime.Settings(), n => n.props?.accessibilityLabel === 'Show channel details').props.accessibilityState.checked, false);
    runtime.dispose();
});
test('users and roles search filters by username and ID without changing cached records', () => {
    const { e, runtime } = setup();
    const extra = Object.fromEntries(Array.from({ length: 10 }, (_, i) => ['role' + i, { id: 'role' + i, type: 0, allow: '1024', deny: '0' }]));
    const record = { ...e.records.hidden, permissionOverwrites: { ...e.records.hidden.permissionOverwrites, ...extra } };
    const render = statefulScreen(e, runtime, record);
    findNode(render(), n => n.props?.accessibilityLabel === 'Search allowed users and roles').props.onChangeText('role7');
    assert.ok(textOf(render()).includes('Role role7'));
    assert.ok(!textOf(render()).includes('Role role8'));
    findNode(render(), n => n.props?.accessibilityLabel === 'Search allowed users and roles').props.onChangeText('Winter Shine');
    assert.ok(findNode(render(), n => n.props?.accessibilityLabel === 'Open profile: Winter'));
    findNode(render(), n => n.props?.accessibilityLabel === 'Search allowed users and roles').props.onChangeText('does-not-exist');
    assert.ok(textOf(render()).includes('No matching users or roles.'));
    assert.equal(runtime.allowedEntries(record).filter(x => x.kind === 'role').length, 12);
    runtime.dispose();
});

module.exports = { environment, createRuntime, setup, findNode, textOf };
if (require.main === module) (async () => {
    for (const { name, run } of tests) { await run(); console.log('PASS ' + name); }
    console.log(tests.length + ' native-list integration checks passed. Physical Android verification is still required.');
})().catch(error => { console.error(error); process.exitCode = 1; });
