import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import patcher from 'spitroast';

const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(name, { modernChat = false } = {}) {
    const errors = [], warnings = [], timers = new Set(), commands = new Map();
    const host = { openLazy() {}, hideActionSheet() {} };
    const ActionSheetRow = function ActionSheetRow() {};
    const Button = function Button() {};
    const nativeChat = () => ({ type: 'Chat', props: {} });
    const chat = modernChat
        ? { default: { $$typeof: Symbol.for('react.memo'), type: { $$typeof: Symbol.for('react.forward_ref'), render: nativeChat } } }
        : { type: nativeChat };
    const api = { get: async () => ({ body: [] }), post() {} };
    const modules = [host, { ActionSheetRow }, { ActionSheet: function ActionSheet() {} }, { TableRow() {}, Button }, api];
    const stores = {
        UserStore: { getCurrentUser: () => ({ id: '111111111111111111' }) },
        GuildStore: {}, PermissionStore: {}, ChannelStore: {},
    };
    function findTree(value, predicate) {
        const queue = [value], seen = new Set();
        while (queue.length) {
            const node = queue.shift();
            if (predicate(node)) return node;
            if (!node || typeof node !== 'object' || seen.has(node)) continue;
            seen.add(node); queue.push(...Object.values(node));
        }
    }
    const React = {
        createElement: (type, props, ...children) => {
            assert.ok(type, 'a missing native control must not be rendered');
            return { type, props: { ...props, children } };
        },
        Fragment: 'Fragment', Children: { toArray: value => Array.isArray(value) ? value : value ? [value] : [] },
        useEffect() { throw new Error('must not insert hooks into Discord renders'); },
    };
    const V = {
        patcher, plugin: { storage: {} },
        metro: {
            findByProps: (...keys) => modules.find(module => keys.every(key => key in module)),
            findByStoreName: name => stores[name], find: () => undefined,
            findByTypeName: () => modernChat ? undefined : chat,
            findByName: () => modernChat ? chat : undefined,
            common: { React, ReactNative: { FlatList: 'List', Platform: { select: value => value.android ?? value.default } }, constants: {} },
        },
        ui: {
            components: { Forms: {}, General: { TouchableOpacity: 'Pressable' } },
            assets: { getAssetIDByName: () => 1 }, toasts: { showToast() {} },
        },
        commands: { registerCommand: command => { commands.set(command.name, command); return () => commands.delete(command.name); } },
        utils: { findInReactTree: findTree },
        logger: { error: (...args) => errors.push(args), warn: (...args) => warnings.push(args) },
    };
    const source = readFileSync(new URL('../' + name + '/index.js', import.meta.url), 'utf8');
    const plugin = vm.runInNewContext(source, {
        vendetta: V, console,
        setInterval: callback => { timers.add(callback); return callback; }, clearInterval: id => timers.delete(id),
    });
    return { plugin, host, errors, warnings, timers, commands, chat, nativeChat, ActionSheetRow };
}

for (const name of ['expression-cloner', 'ping-jumper']) {
    test(name + ': old menu promises cannot patch a later enable, and rejected menus are handled', async () => {
        const h = setup(name);
        const originalOpen = h.host.openLazy;
        h.plugin.onLoad(); const installedOpen = h.host.openLazy; h.plugin.onLoad();
        assert.equal(h.host.openLazy, installedOpen, 'repeated load must not duplicate hooks');
        let resolve;
        const pending = new Promise(value => { resolve = value; });
        const sheet = { default: () => ({ props: { children: [] } }) }, original = sheet.default;
        const key = name === 'expression-cloner' ? 'MessageEmojiActionSheet' : 'MessageLongPressActionSheet';
        h.host.openLazy(pending, key, { message: { id: '222222222222222222' } });
        h.plugin.onUnload(); assert.equal(h.timers.size, 0);
        h.plugin.onLoad(); resolve(sheet); await tick(); assert.equal(sheet.default, original);
        h.host.openLazy(Promise.reject(new Error('native sheet failed to load')), key, { message: { id: '222222222222222222' } });
        await tick(); assert.ok(h.errors.length > 0);
        h.plugin.onUnload(); assert.equal(h.host.openLazy, originalOpen); assert.equal(h.commands.size, 0); assert.equal(h.timers.size, 0);
    });

    test(name + ': memo/forwardRef menus retain injected actions without adding React hooks', async () => {
        const h = setup(name); h.plugin.onLoad();
        const buttons = [{ type: h.ActionSheetRow, props: { label: 'Existing action' } }];
        const renderer = { $$typeof: Symbol.for('react.forward_ref'), render: () => ({ props: { children: buttons } }) };
        const original = renderer.render;
        const sheet = { default: { $$typeof: Symbol.for('react.memo'), type: renderer } };
        h.host.openLazy(Promise.resolve(sheet), 'MessageLongPressActionSheet', {
            message: { id: '222222222222222222', stickerItems: [{ id: '333333333333333333', name: 'Pony', format_type: 1 }] },
        });
        await tick(); renderer.render({});
        const expected = name === 'expression-cloner' ? 'Clone Sticker' : 'Jump to Latest Ping';
        assert.ok(buttons.some(button => button.props?.label === expected));
        assert.equal(renderer.render, original, 'the per-opening renderer hook must remove itself');
        assert.equal(h.errors.length, 0);
        h.plugin.onUnload(); assert.equal(renderer.render, original);
    });
}

test('PingJumper finds the function-style ChatView export and split HTTP module', () => {
    const h = setup('ping-jumper', { modernChat: true });
    const renderer = h.chat.default.type;
    h.plugin.onLoad();
    const tree = renderer.render({});
    assert.equal(tree.type, 'Fragment'); assert.equal(tree.props.children[0].type, 'Chat');
    assert.ok(h.commands.has('lastping'));
    h.plugin.onUnload(); assert.equal(renderer.render, h.nativeChat);
});
