'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { execFileSync } = require('node:child_process');
const React = require('react');
const Renderer = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement, ROOT = path.resolve(__dirname, '..');
const CHANNEL = '300000000000000001', MESSAGE = '400000000000000001', ACCOUNT = '200000000000000001';
const REF = { channelId: CHANNEL, messageId: MESSAGE };
const MENU = 'MessageLongPressActionSheet';
function tapComposer(button) { button.props.onPressIn(); return button.props.onPress(); }
const deferred = () => { let resolve; const promise = new Promise(a => { resolve = a; }); return { promise, resolve }; };

function officialPatcher() {
    function compile(file, internals) {
        const original = fs.readFileSync(path.join(__dirname, 'vendor', file), 'utf8');
        const names = [...original.matchAll(/export\s+(?:const|let|function)\s+(\w+)/g)].map(match => match[1]);
        const source = stripTypeScriptTypes(original)
            .replace(/import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/_internal['"]/g, 'const {$1} = internals')
            .replace(/export\s+(?=const|let|function)/g, '');
        return new Function('internals', source + '\nreturn {' + names.join(',') + '}')(internals);
    }
    return { instead: compile('instead.ts', compile('_internal.ts')).instead };
}

function makeWorld(t, options = {}) {
    const messages = new Map([[CHANNEL + ':' + MESSAGE, Object.freeze({ id: MESSAGE, channel_id: CHANNEL,
        content: 'Bonjour', author: { id: '100000000000000001' }, attachments: [{ id: 'keep' }], editedTimestamp: null })]]);
    const requests = [], toasts = [], dispatched = [], writes = [], cleanups = [], renderers = [], hides = [];
    const importedModules = new Map(), importedWaiters = new Map(), moduleWaiters = new Set(), sent = [], drafts = new Map();
    const watchers = new Set(), userWatchers = new Set(), appWatchers = new Set(), storageWatchers = new Set(), timers = new Map();
    let account = ACCOUNT, serial = 0;
    const env = {
        AbortController,
        setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
        async fetch(url, init) {
            requests.push({ url, init });
            if (options.fetch) return options.fetch(url, init);
            return { ok: true, status: 200, json: async () => ({ translation: 'Hello', sourceLanguage: 'fr' }) };
        },
    };
    const RN = Object.fromEntries(['View', 'Text', 'TextInput', 'ScrollView', 'SafeAreaView', 'Pressable', 'TouchableOpacity', 'Switch', 'Image'].map(name => [name, name]));
    RN.Modal = props => props.visible ? h('Modal', props, props.children) : null;
    RN.FlatList = ({ data, renderItem, ListEmptyComponent, ...props }) => h('FlatList', props,
        data.length ? data.map((item, index) => h(React.Fragment, { key: item[0] }, renderItem({ item, index }))) : ListEmptyComponent);
    RN.useColorScheme = () => options.light ? 'light' : 'dark';
    RN.ToastAndroid = { SHORT: 0, show: text => toasts.push(text) };
    RN.AppState = { addEventListener(_event, fn) { appWatchers.add(fn); return { remove() { appWatchers.delete(fn); } }; } };
    const Row = props => h('ActionSheetRow', props, props.icon, h(RN.Text, null, props.label), h(RN.Text, null, props.subLabel));
    Row.Icon = props => h('RowIcon', props);
    const originalOpen = async function (lazy, key, context) {
        assert.equal(this, host, 'native receiver preserved');
        return { module: await lazy, key, context };
    };
    const host = { openLazy: originalOpen, hideActionSheet: key => hides.push(key) };
    const stores = {
        MessageStore: { getMessage: (channelId, messageId) => messages.get(channelId + ':' + messageId) },
        UserStore: { getCurrentUser: () => account ? { id: account } : undefined,
            addChangeListener: fn => userWatchers.add(fn), removeChangeListener: fn => userWatchers.delete(fn) },
        ThemeStore: { theme: options.light ? 'light' : 'dark' },
    };
    const dispatcher = { dispatch(event) {
        dispatched.push(event);
        let next = event;
        for (const watch of watchers) { next = watch(next); if (!next) return; }
        if (next.type === 'MESSAGE_UPDATE') {
            const key = next.message.channel_id + ':' + next.message.id;
            if (messages.has(key)) messages.set(key, Object.freeze({ ...messages.get(key), ...next.message }));
        } else if (next.type === 'MESSAGE_DELETE') messages.delete((next.channelId ?? CHANNEL) + ':' + next.id);
        return Promise.resolve();
    } };
    const storage = {
        loaded: false, cache: { ...(options.fresh ? {} : { target: 'en', showToasts: true }), ...options.settings },
        async get() { this.loaded = true; return { ...this.cache }; },
        async set(value) { writes.push(JSON.parse(JSON.stringify(value))); this.cache = { ...this.cache, ...value }; for (const fn of storageWatchers) fn(value); },
        subscribe(fn) { storageWatchers.add(fn); return () => storageWatchers.delete(fn); },
    };
    const modules = [host, { ActionSheetRow: Row }];
    const nativeSender = { sendMessage(channelId, message, ...rest) {
        assert.equal(this, nativeSender);
        sent.push({ channelId, message, rest });
        return Promise.resolve({ id: 'native-result' });
    }, deleteMessage() {} };
    const draftActions = { saveDraft(channelId, content) { drafts.set(channelId, content); }, clearDraft(channelId) { drafts.set(channelId, ''); } };
    stores.DraftStore = { getDraft: channelId => drafts.get(channelId) ?? '' };
    modules.push(draftActions);
    if (options.composer || options.sender) modules.push(nativeSender);
    const nativeAction = { default: props => {
        const Icon = React.useMemo(() => options.memoizedIcon ? React.memo(props.IconComponent) : props.IconComponent, [props.IconComponent]);
        return h('ChatInputActionButton', props, h(Icon, { color: '#E7B7D0', style: { tintColor: '#E7B7D0' } }));
    } };
    const originalComposerRows = Object.freeze([h('GiftButton', {key:'gift'}), h('EmojiButton', {key:'emoji'}), h('MicButton', {key:'mic'})]);
    const composer = { default: React.memo(function NativeRightActions() { React.useState(1); return h(RN.View, null, originalComposerRows); }) };
    const originalComposerRender = composer.default.type;
    const BUTTON_PATH = 'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx';
    const ACTIONS_PATH = 'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx';
    if (options.composer) { importedModules.set(BUTTON_PATH, nativeAction); importedModules.set(ACTIONS_PATH, composer); }

    const U = {
        react: { React, ReactNative: RN }, patcher: officialPatcher(),
        modules: { finders: {
            filters: { withProps: (...props) => props },
            lookupModule: props => [modules.find(item => props.every(prop => item[prop] != null))],
            getModules(props, callback) {
                const match = modules.find(item => props.every(prop => item[prop] != null));
                const item = { props, callback, active: true }; moduleWaiters.add(item);
                if (match) Promise.resolve().then(() => { if (item.active) callback(match); });
                return () => { item.active = false; moduleWaiters.delete(item); };
            },
        } },
        assets: { getAssetIdByName: name => name === 'TranslateIcon' ? 91 : name === 'HistoryIcon' ? 92 : undefined },
        discord: { utils: { modules: { finders: {
                lookupModuleWithImportedPath: path => [importedModules.get(path)],
                getModuleWithImportedPath(path, callback) {
                    if (importedModules.has(path)) { callback(importedModules.get(path)); return () => {}; }
                    const entry = { path, callback }; importedWaiters.set(entry, entry);
                    return () => importedWaiters.delete(entry);
                },
            } } }, flux: { Stores: stores, onAnyFluxEventDispatched(fn) { watchers.add(fn); return () => watchers.delete(fn); } },
            common: { flux: { Dispatcher: dispatcher } },
            actions: { get ActionSheetActionCreators() { return options.delayedHost && !w.hostReady ? undefined : host; } },
            design: { Design: { ActionSheetRow: Row } } },
    };
    const api = { unscoped: U, cleanup(fn) { cleanups.push(fn); }, jsonStorage: storage, logger: { warn() {} } };
    const script = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    const plugin = new Function('globalThis', 'return ' + script)(env).default;
    let started = false;
    const w = { api, plugin, U, Row, RN, nativeSender, sent, drafts, composer, originalComposerRows, importedModules, importedWaiters, moduleWaiters, originalComposerRender, host, originalOpen, requests, toasts, dispatched, writes, storage, messages, hides,
        timers, watchers, userWatchers, appWatchers, hostReady: !options.delayedHost,
        addImported(path, module) {
            importedModules.set(path, module);
            for (const [entry] of [...importedWaiters]) if (entry.path === path) { importedWaiters.delete(entry); entry.callback(module); }
        },
        loadComposer() { this.addImported(BUTTON_PATH, nativeAction); this.addImported(ACTIONS_PATH, composer); },
        read: () => messages.get(CHANNEL + ':' + MESSAGE),
        async start() { await plugin.start(api); started = true; },
        async stop() { await plugin.stop(); for (const fn of cleanups) await fn(); started = false; },
        account(value) { account = value; for (const fn of userWatchers) fn(); },
        remote: event => dispatcher.dispatch(event),
        async render(component, props) {
            let ui; await Renderer.act(async () => { ui = Renderer.create(h(component, props)); });
            renderers.push(ui); return ui;
        },
        async menu(shape = 'plain', context = { message: this.read() }, key = MENU, props = {}) {
            const originalRows = Object.freeze([
                h(Row, { key: 'copy', label: 'Copy Text', onPress() {} }),
                h(Row, { key: 'mark', label: 'Mark Unread', onPress() {} }),
                h(Row, { key: 'edit', label: 'Edit Message', onPress() { w.editDraft = w.read()?.content; } }),
            ]);
            const content = () => h(RN.View, null, originalRows);
            let Component = function NativeMessageSheet() { React.useState(1); return content(); };
            if (shape === 'memo') Component = React.memo(Component);
            if (shape === 'forward') Component = React.forwardRef(Component);
            if (shape === 'nested') Component = React.memo(React.forwardRef(Component));
            if (shape === 'class') Component = class NativeMessageSheet extends React.Component { render() { return content(); } };
            if (shape === 'children') {
                const Inner = Component;
                Component = () => h(RN.View, null, h(Inner));
            }
            const originalModule = Object.freeze({ default: Component, extra: 'keep metadata' });
            const result = await host.openLazy(Promise.resolve(originalModule), key, context);
            const ui = await w.render(result.module.default, props);
            return { ui, result, originalRows, originalModule, Component,
                rows: () => ui.root.findAllByType('ActionSheetRow'),
                row: label => ui.root.findAllByType('ActionSheetRow').find(node => node.props.label === label) };
        },
    };
    if (options.delayedHost) {
        modules.length = 0;
        w.ready = () => { w.hostReady = true; modules.push(host, { ActionSheetRow: Row }); };
    }
    t.after(async () => {
        for (const ui of renderers.reverse()) await Renderer.act(async () => ui.unmount());
        if (started) await w.stop();
        assert.equal(host.openLazy, originalOpen);
        assert.equal(watchers.size, 0); assert.equal(userWatchers.size, 0); assert.equal(appWatchers.size, 0);
        assert.equal(timers.size, 0); assert.equal(storageWatchers.size, 0);
        assert.equal(importedWaiters.size, 0); assert.equal(moduleWaiters.size, 0);
        assert.equal(composer.default.type, originalComposerRender);
    });
    return w;
}

for (const shape of ['plain', 'memo', 'forward', 'nested', 'class', 'children'])
    test('native long-press integration for ' + shape + ' sheets with upstream patcher', async t => {
        const w = makeWorld(t); await w.start();
        const menu = await w.menu(shape);
        assert.deepEqual(menu.rows().map(row => row.props.label), ['Copy Text', 'Translate', 'Mark Unread', 'Edit Message']);
        assert.equal(menu.row('Revert Message'), undefined);
        assert.equal(menu.originalRows.length, 3);
        assert.equal(menu.originalModule.default, menu.Component);
        assert.equal(menu.result.module.extra, 'keep metadata');
        assert.notEqual(menu.result.module, menu.originalModule);
        await menu.row('Translate').props.onPress();
        assert.equal(w.read().content, 'Hello'); assert.equal(w.requests.length, 1);
        assert.equal(w.hides[0], MENU);
        const translated = await w.menu(shape);
        assert.equal(translated.row('Translate'), undefined);
        assert.equal(translated.rows().length, 4);
        await translated.row('Revert Message').props.onPress();
        assert.equal(w.read().content, 'Bonjour');
        assert.equal(w.toasts.filter(text => text.startsWith('Translated to')).length, 0);
        assert.ok((await w.menu(shape)).row('Translate'));
    });

test('context IDs resolve text and the selected message wins over reply previews', async t => {
    const w = makeWorld(t); await w.start();
    const menu = await w.menu('plain', { channelId: CHANNEL, messageId: MESSAGE }, MENU,
        { message: { id: '400000000000000002', channel_id: CHANNEL, content: 'other reply' } });
    await menu.row('Translate').props.onPress();
    assert.equal(w.read().content, 'Hello');
    assert.equal(new URL(w.requests[0].url).searchParams.get('query.text'), 'Bonjour');
});

test('nested render props can resolve the message when opening context is absent', async t => {
    const w = makeWorld(t); await w.start();
    const menu = await w.menu('plain', {}, MENU, { message: w.read() });
    assert.ok(menu.row('Translate'));
});

test('non-message sheets, blank messages and unrelated IDs are left unchanged', async t => {
    const w = makeWorld(t); await w.start();
    for (const [context, key] of [[{ message: w.read() }, 'UserProfileActionSheet'], [{ author: w.read().author }, MENU],
        [{ channelId: CHANNEL, messageId: Number(MESSAGE) }, MENU]]) {
        const menu = await w.menu('plain', context, key);
        assert.equal(menu.row('Translate'), undefined);
    }
    w.messages.set(CHANNEL + ':' + MESSAGE, { ...w.read(), content: '', attachments: [{ id: 'image' }] });
    assert.equal((await w.menu()).row('Translate'), undefined);
    assert.equal(w.requests.length, 0);
});

test('native Edit action restores original text before constructing an edit draft', async t => {
    const w = makeWorld(t); await w.start();
    await (await w.menu()).row('Translate').props.onPress();
    const menu = await w.menu();
    await menu.row('Edit Message').props.onPress();
    assert.equal(w.editDraft, 'Bonjour'); assert.equal(w.read().content, 'Bonjour');
});

test('a failed local revert cannot open an edit draft containing translated text', async t => {
    const w = makeWorld(t); await w.start();
    await (await w.menu()).row('Translate').props.onPress();
    const menu = await w.menu(), dispatcher = w.U.discord.common.flux.Dispatcher;
    const original = dispatcher.dispatch;
    try {
        dispatcher.dispatch = () => { throw new Error('Temporary local failure'); };
        await menu.row('Edit Message').props.onPress();
        assert.equal(w.editDraft, undefined);
        assert.ok(w.toasts.some(text => text.includes('before editing')));
    } finally { dispatcher.dispatch = original; }
});

test('other message-menu wrappers coexist without duplicate translation rows', async t => {
    const w = makeWorld(t);
    const remove = w.U.patcher.instead(w.host, 'openLazy', function (args, original) {
        const next = [...args];
        next[0] = Promise.resolve(args[0]).then(module => {
            const Original = module.default;
            return { ...module, default: function OtherMenuPlugin(props) {
                return h(w.RN.View, null, h(Original, props), h('OtherPluginRow', { label: 'Copy User ID' }));
            } };
        });
        return Reflect.apply(original, this, next);
    });
    try {
        await w.start();
        const menu = await w.menu();
        assert.equal(menu.rows().filter(row => row.props.label === 'Translate').length, 1);
        assert.equal(menu.rows().filter(row => row.props.label === 'Revert Message').length, 0);
        assert.equal(menu.ui.root.findAllByType('OtherPluginRow').length, 1);
        await menu.row('Translate').props.onPress();
        assert.equal(w.read().content, 'Hello');
        await w.stop();
    } finally { remove(); }
});

test('a genuine message edit cancels requests through the official Flux API', async t => {
    const response = deferred();
    const w = makeWorld(t, { fetch: () => response.promise }); await w.start();
    const menu = await w.menu();
    const work = menu.row('Translate').props.onPress();
    await w.remote({ type: 'MESSAGE_UPDATE', message: { id: MESSAGE, channel_id: CHANNEL, content: 'Edited now' } });
    response.resolve({ ok: true, status: 200, json: async () => ({ translation: 'Stale', sourceLanguage: 'fr' }) });
    await work;
    assert.equal(w.read().content, 'Edited now');
    assert.equal(w.dispatched.filter(e => Object.getOwnPropertySymbols(e).length).length, 0);
});

test('switching accounts aborts work before a provider response can be displayed', async t => {
    const response = deferred(), w = makeWorld(t, { fetch: () => response.promise }); await w.start();
    const work = (await w.menu()).row('Translate').props.onPress();
    w.account('200000000000000002');
    response.resolve({ ok: true, status: 200, json: async () => ({ translation: 'Stale', sourceLanguage: 'fr' }) });
    await work;
    assert.equal(w.read().content, 'Bonjour'); assert.equal(w.timers.size, 0);
});

test('stop restores messages and stale menu actions cannot make new requests', async t => {
    const w = makeWorld(t); await w.start();
    const first = await w.menu(); await first.row('Translate').props.onPress();
    assert.equal(w.read().content, 'Hello');
    await w.stop();
    assert.equal(w.read().content, 'Bonjour');
    await first.row('Translate').props.onPress();
    assert.equal(w.requests.length, 1); assert.equal(w.host.openLazy, w.originalOpen);
});

test('late menu modules connect on retry and stop removes pending retry timers', async t => {
    const w = makeWorld(t, { delayedHost: true }); await w.start();
    assert.equal(w.timers.size, 1); w.ready();
    const [id, task] = [...w.timers][0]; w.timers.delete(id); task.fn();
    assert.ok((await w.menu()).row('Translate'));
    await w.stop(); assert.equal(w.timers.size, 0);
});

test('start-stop-start installs only one set of hooks and produces no startup toast', async t => {
    const w = makeWorld(t); await w.start(); await w.plugin.start(w.api);
    assert.equal(w.watchers.size, 1); assert.equal(w.toasts.length, 0);
    await w.stop(); await w.start();
    assert.equal(w.watchers.size, 1); assert.equal(w.toasts.length, 0);
    assert.equal((await w.menu()).rows().filter(row => row.props.label === 'Translate').length, 1);
});

for (const light of [false, true]) test('settings render and searchable picker saves only preferences, light=' + light, async t => {
    const w = makeWorld(t, { light }); await w.start();
    const ui = await w.render(w.plugin.SettingsComponent, { api: w.api });
    const presses = () => ui.root.findAllByType('Pressable');
    const target = presses().find(node => node.props.accessibilityLabel === 'Incoming messages to. English');
    assert.ok(target);
    await Renderer.act(async () => target.props.onPress());
    assert.equal(ui.root.findAllByType('Modal').length, 1);
    const search = ui.root.findByType('TextInput');
    await Renderer.act(async () => search.props.onChangeText('malay'));
    const list = ui.root.findByType('FlatList');
    assert.equal(list.props.data, undefined, 'data consumed by native list fixture');
    const choice = presses().find(node => node.props.accessibilityLabel === 'Malay. ms');
    assert.ok(choice);
    await Renderer.act(async () => choice.props.onPress());
    assert.equal(w.storage.cache.receivedOutput, 'ms');
    assert.equal(ui.root.findAllByType('Modal').length, 0);
    const toggle = ui.root.findAllByType('Switch').find(node => node.props.accessibilityLabel === 'Message translation notices');
    await Renderer.act(async () => toggle.props.onValueChange(false));
    assert.equal(w.storage.cache.receivedOutput, 'ms'); assert.equal(w.storage.cache.showToasts, false);
    for (const write of w.writes) { assert.equal(write.receivedOutput, 'ms'); assert.equal(JSON.stringify(write).includes('Bonjour'), false); }
    const menu = await w.menu();
    assert.equal(menu.row('Translate').props.subLabel, 'Auto-detect → Malay');
    await Renderer.act(async () => menu.row('Translate').props.onPress());
    assert.equal(new URL(w.requests[0].url).searchParams.get('query.targetLanguage'), 'ms');
    assert.equal(w.toasts.length, 0);
    const restore = presses().find(node => node.props.accessibilityLabel?.startsWith('Revert all messages.'));
    await Renderer.act(async () => restore.props.onPress());
    assert.equal(w.read().content, 'Bonjour');
});

test('Android back/Done closes the language modal without changing preferences', async t => {
    const w = makeWorld(t); await w.start();
    const ui = await w.render(w.plugin.SettingsComponent, { api: w.api });
    const open = () => ui.root.findAllByType('Pressable').find(n => n.props.accessibilityLabel === 'Incoming messages to. English');
    await Renderer.act(async () => open().props.onPress());
    await Renderer.act(async () => ui.root.findByType('Modal').props.onRequestClose());
    assert.equal(ui.root.findAllByType('Modal').length, 0);
    assert.equal(w.writes.length, 0);
});

test('native composer button opens all four Vencord language controls and closes with Android back', async t => {
    const w = makeWorld(t, { composer: true, fresh: true }); await w.start();
    const ui = await w.render(w.composer.default);
    assert.equal(ui.root.findAllByType('GiftButton').length, 1);
    assert.equal(ui.root.findAllByType('EmojiButton').length, 1);
    assert.equal(ui.root.findAllByType('MicButton').length, 1);
    assert.equal(w.originalComposerRows.length, 3);
    const button = ui.root.findByProps({ testID: 'valenced.translate.composer-button' });
    assert.equal(button.props.accessibilityLabel, 'Auto Translate');
    await Renderer.act(async () => button.props.onLongPress());
    assert.equal(w.storage.cache.autoTranslate, undefined, 'holding opens settings without enabling auto-translation');
    assert.equal(ui.root.findAllByType('Modal').length, 1);
    const labels = ui.root.findAllByType('Pressable').map(node => node.props.accessibilityLabel);
    for (const label of ['Incoming messages from. Detect language', 'Incoming messages to. English', 'Your messages from. Detect language', 'Your messages to. English'])
        assert.ok(labels.includes(label), label);
    await Renderer.act(async () => ui.root.findByType('Modal').props.onRequestClose());
    assert.equal(ui.root.findAllByType('Modal').length, 0);
    assert.equal(w.sent.length, 0); assert.equal(w.requests.length, 0);
});

test('hold opens language settings and a single tap toggles outgoing translation on and off', async t => {
    const w = makeWorld(t, { composer: true, fresh: true }); await w.start();
    const ui = await w.render(w.composer.default), button = ui.root.findByProps({ testID: 'valenced.translate.composer-button' });
    await Renderer.act(async () => button.props.onLongPress());
    const outgoing = ui.root.findAllByType('Pressable').find(n => n.props.accessibilityLabel === 'Your messages to. English');
    await Renderer.act(async () => outgoing.props.onPress());
    const search = ui.root.findByType('TextInput');
    await Renderer.act(async () => search.props.onChangeText('dutch'));
    const dutch = ui.root.findAllByType('Pressable').find(n => n.props.accessibilityLabel === 'Dutch. nl');
    await Renderer.act(async () => dutch.props.onPress());
    await Renderer.act(async () => ui.root.findByType('Modal').props.onRequestClose());
    await Renderer.act(async () => tapComposer(button));
    assert.equal(w.storage.cache.autoTranslate, true);
    assert.equal(ui.root.findAllByType('Modal').length, 0, 'tapping does not open settings');
    assert.equal(button.props.accessibilityState.checked, true);
    assert.equal(w.storage.cache.sentOutput, 'nl'); assert.equal(w.storage.cache.receivedOutput, 'en');
    const source = Object.freeze({ content: 'Bonjour', nonce: 'native-1', attachments: [{ id: 'file' }] });
    let result;
    await Renderer.act(async () => { result = await w.nativeSender.sendMessage(CHANNEL, source, { reply: true }); });
    assert.equal(result.id, 'native-result'); assert.equal(w.sent.length, 1);
    assert.equal(w.sent[0].message.content, 'Hello'); assert.equal(source.content, 'Bonjour');
    assert.equal(w.sent[0].message.attachments, source.attachments);
    assert.equal(new URL(w.requests[0].url).searchParams.get('query.targetLanguage'), 'nl');
    await Renderer.act(async () => tapComposer(button));
    assert.equal(w.storage.cache.autoTranslate, false);
    assert.equal(button.props.accessibilityState.checked, false);
    assert.equal(ui.root.findAllByType('Modal').length, 0);
});

for (const light of [false, true]) for (const memoizedIcon of [false, true])
test('direct composer icon stays visibly lit: ' + JSON.stringify({ light, memoizedIcon }), async t => {
    const w = makeWorld(t, { composer: true, fresh: true, light, memoizedIcon, settings: { autoTranslate: true } });
    await w.start();
    const ui = await w.render(w.composer.default), button = ui.root.findByProps({ testID: 'valenced.translate.composer-button' });
    const image = () => ui.root.findAllByType('Image')[0];
    const indicators = () => ui.root.findAllByProps({ testID: 'valenced.translate.active-indicator' });
    assert.equal(image().props.style.tintColor, '#62FFAD', 'saved on state is visibly enabled');
    assert.equal(image().parent.props.style.at(-1).backgroundColor, '#145A3A');
    assert.equal(indicators().length, 1);
    await Renderer.act(async () => tapComposer(button));
    assert.equal(w.storage.cache.autoTranslate, false);
    assert.equal(image().props.style.tintColor, light ? '#535461' : '#B9B8C6', 'off returns to the normal theme colour');
    assert.equal(image().parent.props.style.at(-1).backgroundColor, 'transparent');
    assert.equal(indicators().length, 0);
    await Renderer.act(async () => tapComposer(button));
    assert.equal(image().props.style.tintColor, '#62FFAD');
    assert.equal(indicators().length, 1);
    await Renderer.act(async () => button.props.onLongPress());
    assert.equal(w.storage.cache.autoTranslate, true, 'opening settings leaves the enabled indicator on');
    assert.equal(indicators().length, 1);
    assert.equal(w.requests.length, 0); assert.equal(w.sent.length, 0);
});

for (const enabled of [false, true])
test('holding the direct touch control opens settings and release never toggles: ' + enabled, async t => {
    const w = makeWorld(t, { composer: true, fresh: true, settings: { autoTranslate: enabled } });
    await w.start();
    const ui = await w.render(w.composer.default);
    const button = ui.root.findByProps({ testID: 'valenced.translate.composer-button' });
    assert.equal(button.type, 'Pressable', 'gestures attach directly to the RN touch surface');
    assert.equal(ui.root.findAllByType('ChatInputActionButton').length, 0, 'does not depend on the private button forwarding long presses');
    assert.equal(button.props.delayLongPress, 450);
    await Renderer.act(async () => { button.props.onPressIn(); button.props.onLongPress(); });
    assert.equal(ui.root.findAllByType('Modal').length, 1);
    await Renderer.act(async () => button.props.onPress());
    assert.equal(w.storage.cache.autoTranslate, enabled, 'a release after holding does not toggle');
    assert.equal(w.writes.length, 0);
    assert.equal(button.props.accessibilityState.checked, enabled);
    await Renderer.act(async () => ui.root.findByType('Modal').props.onRequestClose());
    assert.equal(ui.root.findAllByType('Modal').length, 0);
    await Renderer.act(async () => tapComposer(button));
    assert.equal(w.storage.cache.autoTranslate, !enabled, 'the next short tap still toggles normally');
    assert.equal(w.requests.length, 0); assert.equal(w.sent.length, 0);
});

test('auto-translation off sends the original through Discord without contacting a provider', async t => {
    const w = makeWorld(t, { composer: true, fresh: true }); await w.start();
    await w.nativeSender.sendMessage(CHANNEL, { content: 'Bonjour' });
    assert.equal(w.sent.length, 1); assert.equal(w.sent[0].message.content, 'Bonjour');
    assert.equal(w.requests.length, 0);
});

test('failed outgoing translation restores the native draft and does not send', async t => {
    const w = makeWorld(t, { composer: true, settings: { autoTranslate: true }, fetch: async () => ({ ok: false, status: 503 }) });
    await w.start();
    await assert.rejects(w.nativeSender.sendMessage(CHANNEL, { content: 'Bonjour' }), { code: 'TRANSLATION_SEND_FAILED' });
    assert.equal(w.sent.length, 0); assert.equal(w.drafts.get(CHANNEL), 'Bonjour');
});

test('an existing new draft is preserved and failed original appears in the translation panel', async t => {
    const w = makeWorld(t, { composer: true, settings: { autoTranslate: true }, fetch: async () => ({ ok: false, status: 503 }) });
    await w.start(); w.drafts.set(CHANNEL, 'New text typed meanwhile');
    await assert.rejects(w.nativeSender.sendMessage(CHANNEL, { content: 'Original to keep' }));
    assert.equal(w.sent.length, 0); assert.equal(w.drafts.get(CHANNEL), 'New text typed meanwhile');
    const ui = await w.render(w.plugin.SettingsComponent, { api: w.api });
    assert.ok(ui.root.findAllByType('Text').some(node => node.props.selectable && node.props.children === 'Original to keep'));
});

test('composer imports arriving after startup are hooked and cleanly restored', async t => {
    const w = makeWorld(t, { sender: true, fresh: true }); await w.start();
    assert.ok(w.importedWaiters.size > 0);
    w.loadComposer();
    const ui = await w.render(w.composer.default);
    assert.equal(ui.root.findAllByProps({ testID: 'valenced.translate.composer-button' }).length, 1);
    await Renderer.act(async () => w.stop());
    assert.equal(w.composer.default.type, w.originalComposerRender);
    assert.equal(ui.root.findAllByProps({ testID: 'valenced.translate.composer-button' }).length, 0);
});

test('provider selection resets the four language controls and masks entered credentials', async t => {
    const w = makeWorld(t, { composer: true, fresh: true }); await w.start();
    const ui = await w.render(w.plugin.SettingsComponent, { api: w.api });
    const provider = () => ui.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel?.startsWith('Translation provider.'));
    await Renderer.act(async () => provider().props.onPress());
    const deep = ui.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === 'DeepL Free. deepl');
    await Renderer.act(async () => deep.props.onPress());
    assert.equal(w.storage.cache.service, 'deepl'); assert.equal(w.storage.cache.sentInput, '');
    assert.equal(w.storage.cache.sentOutput, 'en-us');
    const key = ui.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === 'DeepL API key');
    assert.equal(key.props.secureTextEntry, true);
    await Renderer.act(async () => key.props.onChangeText('test-only-key'));
    const edited = ui.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === 'DeepL API key');
    await Renderer.act(async () => edited.props.onBlur());
    assert.equal(w.storage.cache.deeplApiKey, 'test-only-key'); assert.equal(w.requests.length, 0);
});

for (const settings of [{}, { displayMode: 'below', receivedOutput: 'en', service: 'google' }])
test('fresh and saved v2 incoming settings use the v1 inline display: ' + JSON.stringify(settings), async t => {
    const w = makeWorld(t, { fresh: true, settings }); await w.start();
    const menu = await w.menu();
    await Renderer.act(async () => menu.row('Translate').props.onPress());
    assert.equal(w.read().content, 'Hello');
    assert.equal(w.toasts.length, 0);
    assert.deepEqual(menu.rows().map(row => row.props.label), ['Copy Text', 'Revert Message', 'Mark Unread', 'Edit Message']);
    await Renderer.act(async () => menu.row('Revert Message').props.onPress());
    assert.equal(w.read().content, 'Bonjour');
    assert.ok(menu.row('Translate'));
    await Renderer.act(async () => menu.row('Translate').props.onPress());
    assert.equal(w.read().content, 'Hello');
    assert.equal(w.requests.length, 1, 'translate again uses the cached original');
});

test('the single menu action cancels a pending translation without displaying a late response', async t => {
    const response = deferred(), w = makeWorld(t, { fetch: () => response.promise }); await w.start();
    const menu = await w.menu();
    let work;
    await Renderer.act(async () => { work = menu.row('Translate').props.onPress(); });
    assert.deepEqual(menu.rows().map(row => row.props.label), ['Copy Text', 'Cancel Translation', 'Mark Unread', 'Edit Message']);
    const pendingMenu = await w.menu();
    assert.ok(pendingMenu.row('Cancel Translation'));
    await Renderer.act(async () => pendingMenu.row('Cancel Translation').props.onPress());
    response.resolve({ ok: true, status: 200, json: async () => ({ translation: 'Stale', sourceLanguage: 'fr' }) });
    await Renderer.act(async () => work);
    assert.equal(w.read().content, 'Bonjour');
    assert.equal(w.timers.size, 0);
    assert.ok(menu.row('Translate')); assert.ok(pendingMenu.row('Translate'));
});

test('an action saved from the original menu rechecks whether the message is translated', async t => {
    const w = makeWorld(t); await w.start();
    const menu = await w.menu(), press = menu.row('Translate').props.onPress;
    await Renderer.act(async () => press()); assert.equal(w.read().content, 'Hello');
    await Renderer.act(async () => press()); assert.equal(w.read().content, 'Bonjour');
    assert.equal(w.requests.length, 1);
});

test('ZIP manifest and script meet the current Valenced external loader contract', () => {
    const archive = process.env.VALENCED_TRANSLATE_ARCHIVE ?? path.join(ROOT, '..', 'output', 'Vencord_Translate_Valenced_v2.0.4.zip');
    const result = JSON.parse(execFileSync('python3', ['-c',
        'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({"names":z.namelist(),"manifest":json.loads(z.read("manifest.json")),"script":z.read("index.js").decode(),"bad":z.testzip()}))', archive], { encoding: 'utf8' }));
    assert.equal(result.bad, null);
    assert.equal(result.manifest.format, 1); assert.equal(result.manifest.dist.script, 'index.js');
    assert.ok(result.manifest.dependencies['valenced.api']); assert.ok(result.manifest.dependencies.discord);
    assert.equal(result.manifest.version, '2.0.4');
    assert.ok(result.names.includes('manifest.json')); assert.ok(result.names.includes('index.js'));
    assert.equal(result.names.some(name => name.includes('node_modules') || name.includes('..') || name.startsWith('/')), false);
    assert.equal(result.script.includes('module.exports'), false);
    assert.equal(/\brequire\s*\(/.test(result.script), false);
    assert.equal(/TokenStore|MessageSenderToken|editMessage\(/.test(result.script), false);
    assert.equal(result.script, fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8'));
});
