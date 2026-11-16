const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(require.resolve('../plugins/better-font-scale/index.js'), 'utf8');
const Text = Symbol('Discord Text');
const View = Symbol('View');
const element = (type, props, key = null) => ({ type, props, key });

async function load(cache) {
    const { default: plugin } = vm.runInNewContext(script);
    const cleanup = [];
    const requested = [];
    const watchers = new Map();
    const jsxHooks = new Map();
    const React = {
        isValidElement: node => !!node?.props,
        createElement: element,
        cloneElement: (node, props, ...children) => element(node.type, {
            ...node.props, ...props, ...(children.length && { children: children[0] }),
        }, node.key),
    };
    const api = {
        jsonStorage: { cache },
        cleanup: callback => cleanup.push(callback),
        unscoped: {
            discord: { utils: { modules: { finders: {
                getModuleWithImportedPath(path, callback) {
                    watchers.set(path, callback);
                    return () => watchers.delete(path);
                },
            } } } },
            modules: { native: { callNativeMethod: async (method, args) => {
                requested.push([method, [...args]]);
                return true;
            } } },
            patcher: { instead(owner, name, callback) {
                const original = owner[name];
                owner[name] = (...args) => callback(args, original);
                return () => { owner[name] = original; };
            } },
            react: {
                React,
                ReactNative: { Text, Platform: { OS: 'android' },
                    StyleSheet: { flatten: style => Array.isArray(style) ? Object.assign({}, ...style) : style } },
                jsxRuntime: { beforeJSX(type, callback) {
                    jsxHooks.set(type, callback);
                    return () => jsxHooks.delete(type);
                } },
            },
        },
    };
    await plugin.start(api);
    return {
        register(path, module) { watchers.get(path)(module); },
        jsx(type, props, key) { return element(...(jsxHooks.get(type)?.([type, props, key]) ?? [type, props, key])); },
        stop() { cleanup.reverse().forEach(callback => callback()); },
        requested,
    };
}

test('native controls share the four validated sizes and preserve zero defaults', async () => {
    const plugin = await load({ messages: 21, chatbox: '16,5', username: 99, timestamp: 0 });
    assert.deepEqual(plugin.requested, [['dev.fluttershy2008.better-font-scale.apply', [21, 16.5, 0, 0]]]);
});

test('channel label overrides preserve other props and expand the matching list rows', async () => {
    const plugin = await load({ channel: 25, voice: 20, thread: 24, category: 18 });
    const shared = { type: () => null };
    plugin.register('modules/guild_sidebar/native/ChannelItem.tsx', { default: shared });
    for (const [type, size] of [[0, 25], [2, 20], [13, 20], [10, 24], [11, 24], [12, 24]]) {
        const props = { channel: { type }, textStyle: { color: 'red' }, subtitle: 'keep' };
        const row = plugin.jsx(shared, props, 'channel-id');
        assert.equal(row.props.textStyle[1].fontSize, size);
        assert.equal(row.props.textStyle[0], props.textStyle);
        assert.equal(row.props.subtitle, 'keep');
        assert.equal(row.key, 'channel-id');
    }
    const dm = { channel: { type: 1 } };
    assert.equal(plugin.jsx(shared, dm).props, dm);

    const heights = { getChannelListItemSize: () => 38 };
    plugin.register('modules/channel_list_v2/native/renderRedesignChannelListItem.tsx', heights);
    const args = type => ({
        fontScale: 1,
        guildChannels: { getChannelFromSectionRow: () => ({ channel: { record: { type }, threadCount: 2 } }) },
    });
    assert.equal(heights.getChannelListItemSize(args(0)), 38 + 12 + 2 * 10);
    assert.equal(heights.getChannelListItemSize(args(4)), 38 + 6);
    assert.equal(heights.getChannelListItemSize(args(1)), 38);
    plugin.stop();
    assert.equal(heights.getChannelListItemSize(args(0)), 38);
    assert.equal(plugin.jsx(shared, dm).props, dm);
});

test('bio, category and profile text receive independent overrides without changing sibling content', async () => {
    const plugin = await load({ aboutMe: 24, category: 20, profileStatus: 18 });
    plugin.register('design/components/Text/native/Text.tsx', { Text });
    const heading = element(Text, { variant: 'heading-md/semibold' });
    const inline = element(Text, { children: 'link', style: { color: 'blue' } });
    function BioText() { return element(Text, { children: inline }); }
    function CategoryChannel() {
        return element(View, { children: [heading, element(Text, { variant: 'body-sm/semibold', children: 'General' })] });
    }
    function TextStatusContent() { return element(Text, { children: 'Online' }); }
    function UserProfileCustomStatusBubble() { return element(View, { children: element(TextStatusContent, {}) }); }
    plugin.register('modules/profile_customization/native/BioText.tsx', { default: BioText });
    plugin.register('modules/channel_list_v2/native/items/RedesignCategory.tsx', { CategoryChannel });
    plugin.register('modules/user_profile/native/UserProfileCustomStatusBubble.tsx', { default: UserProfileCustomStatusBubble });
    const bio = plugin.jsx(BioText, {}).type({});
    assert.equal(bio.props.style[1].fontSize, 24);
    assert.equal(bio.props.children.props.style[1].fontSize, 24);
    assert.equal(bio.props.children.props.style[0].color, 'blue');
    const category = plugin.jsx(CategoryChannel, {}).type({});
    assert.equal(category.props.children[0], heading);
    assert.equal(category.props.children[1].props.style[1].fontSize, 20);
    const status = plugin.jsx(UserProfileCustomStatusBubble, {}).type({}).props.children;
    assert.equal(status.type(status.props).props.style[1].fontSize, 18);
});
