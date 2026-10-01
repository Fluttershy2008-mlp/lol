import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { setImmediate as flushPromises } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const code = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

function runtime({ helpers = [], throwLookups = false, noMenus = false, brokenContextPatch = false } = {}) {
    const images = [], notices = [], errors = [], patches = new Set();
    const context = { showContextMenu: menu => menu, hideContextMenu() {} };
    const lazy = { openLazy() {}, hideActionSheet() {} };
    const row = function ActionSheetRow() {};
    const profile = { default: () => ({ props: { items: [{ label: 'Existing action' }] } }) };
    const modules = [...helpers, ...(noMenus ? [] : [context, lazy, { ActionSheetRow: row }]),
        { openMediaModal: value => images.push(value) }];
    const patch = (kind, key, object, callback) => {
        if (brokenContextPatch && object === context) throw new Error('unpatchable context menu');
        const original = object[key];
        object[key] = function (...args) {
            if (kind === 'before') callback(args);
            const result = original.apply(this, args);
            return kind === 'after' ? callback(args, result) ?? result : result;
        };
        const undo = () => { object[key] = original; patches.delete(undo); };
        patches.add(undo);
        return undo;
    };
    const treeFind = (value, predicate) => {
        if (predicate(value)) return value;
        if (!value || typeof value !== 'object') return;
        for (const child of Object.values(value)) {
            const found = treeFind(child, predicate);
            if (found) return found;
        }
    };
    const V = {
        metro: {
            findByProps: (...keys) => {
                if (throwLookups) throw new Error('module unavailable');
                return modules.find(module => keys.every(key => key in module));
            },
            findByName: name => {
                if (throwLookups) throw new Error('module unavailable');
                return !noMenus && name === 'UserProfileOverflowMenu' ? profile : undefined;
            },
            findByStoreName: () => {
                if (throwLookups) throw new Error('store unavailable');
            },
            common: {
                React: {
                    createElement: (type, props) => ({ type, props }),
                    useEffect: () => { throw new Error('must not inject React hooks into patched components'); }
                },
                ReactNative: { Image: { getSize: (_, ok) => ok(640, 480) } }
            }
        },
        patcher: { before: (...args) => patch('before', ...args), after: (...args) => patch('after', ...args) },
        ui: {
            assets: { getAssetIDByName: () => { if (throwLookups) throw new Error('asset unavailable'); return 1; } },
            toasts: { showToast: message => notices.push(message) }
        },
        utils: { findInReactTree: treeFind },
        logger: { error: (...args) => errors.push(args) }
    };
    // Matches VdPluginManager.evalPlugin, including the immediate `return` expression.
    const evaluate = source => vm.runInNewContext(`vendetta=>{return ${source}}`, { URL, console })(V);
    const plugin = evaluate(code);
    return { V, evaluate, plugin, context, lazy, row, profile, images, notices, errors, patches };
}

test('manifest references a runnable expression and the exact shipped bytes', () => {
    assert.equal(manifest.main, 'index.js');
    assert.equal(manifest.version, '1.0.2');
    assert.equal(manifest.hash, createHash('sha256').update(code).digest('hex'));
    const h = runtime();
    assert.equal(typeof h.plugin.onLoad, 'function');
    assert.equal(typeof h.plugin.onUnload, 'function');
});

test('missing or throwing optional modules do not abort installation/startup', () => {
    for (const options of [{ noMenus: true }, { throwLookups: true }]) {
        const h = runtime(options);
        assert.doesNotThrow(() => h.plugin.onLoad());
        assert.match(h.notices.at(-1), /no supported menus/);
        h.plugin.onUnload();
        assert.equal(h.patches.size, 0);
    }
});

test('separate icon helpers support profile avatars and banners', () => {
    const h = runtime({ helpers: [
        { getUserAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/from-helper.png' },
        { getUserBannerURL: () => 'https://cdn.discordapp.com/banners/123/a_banner.png' }
    ] });
    h.plugin.onLoad();
    const menu = h.profile.default({ user: { id: '123', avatar: 'avatar', banner: 'a_banner' } });
    const items = menu.props.items;
    assert.deepEqual(Array.from(items, item => item.label), ['Existing action', 'View Avatar', 'View Banner']);
    items[1].action(); items[2].action();
    assert.match(h.images[0].initialSources[0].uri, /from-helper.webp\?size=4096$/);
    assert.match(h.images[1].initialSources[0].uri, /a_banner.gif\?size=4096$/);
    h.plugin.onUnload();
});

test('CDN fallbacks keep avatar, banner, decoration, server and group images usable', () => {
    const h = runtime(); h.plugin.onLoad();
    const cases = [
        [{ user: { id: '123', avatar: 'a_avatar', banner: 'banner', avatarDecorationData: { asset: 'decoration' } } },
            ['View Avatar', 'View Banner', 'View Avatar Decoration'], ['/avatars/123/a_avatar.gif', '/banners/123/banner.webp', '/avatar-decoration-presets/decoration.png']],
        [{ guild: { id: '456', icon: 'icon', banner: 'a_banner' } },
            ['View Server Icon', 'View Server Banner'], ['/icons/456/icon.webp', '/banners/456/a_banner.gif']],
        [{ channel: { id: '789', icon: 'icon' } }, ['View Group DM Icon'], ['/channel-icons/789/icon.webp']]
    ];
    for (const [props, labels, paths] of cases) {
        const menu = { ...props, items: [] };
        h.context.showContextMenu(menu); h.context.showContextMenu(menu);
        assert.deepEqual(Array.from(menu.items, item => item.label), labels);
        menu.items.forEach((item, i) => {
            item.action();
            const url = new URL(h.images.at(-1).initialSources[0].uri);
            assert.equal(url.pathname, paths[i]);
            assert.equal(url.searchParams.get('size'), '4096');
            if (paths[i].endsWith('.png')) assert.equal(url.searchParams.get('passthrough'), 'true');
        });
    }
    h.plugin.onUnload();
});

test('one failed menu patch does not disable other menus; loading is idempotent', () => {
    const h = runtime({ brokenContextPatch: true });
    h.plugin.onLoad(); const count = h.patches.size; h.plugin.onLoad();
    assert.equal(h.patches.size, count);
    const menu = h.profile.default({ user: { id: '123', avatar: 'avatar' } });
    assert.ok(menu.props.items.some(item => item.label === 'View Avatar'));
    h.plugin.onUnload(); h.plugin.onUnload();
    assert.equal(h.patches.size, 0);
    h.plugin.onLoad(); assert.equal(h.patches.size, count); h.plugin.onUnload();
});

test('pending sheets cannot install patches after unload or a later enable', async () => {
    const h = runtime(); h.plugin.onLoad();
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    const module = { default: () => ({}) }, original = module.default;
    h.lazy.openLazy(pending, 'UserProfile', { user: { id: '123', avatar: 'avatar' } });
    h.plugin.onUnload(); h.plugin.onLoad(); const count = h.patches.size;
    resolve(module); await pending; await flushPromises();
    assert.equal(module.default, original); assert.equal(h.patches.size, count);
    h.plugin.onUnload(); assert.equal(h.patches.size, 0);
});

test('reused sheets update targets and restore the original renderer on unload', async () => {
    const h = runtime(); h.plugin.onLoad();
    const module = { default: () => ({ props: { children: [{ type: h.row, props: { label: 'Original' } }] } }) };
    const original = module.default;
    for (const id of ['111', '222']) {
        h.lazy.openLazy(Promise.resolve(module), 'UserProfile', { user: { id, avatar: 'avatar' } });
        await flushPromises();
        const result = module.default();
        result.props.children.find(row => row.props.label === 'View Avatar').props.onPress();
        assert.equal(new URL(h.images.at(-1).initialSources[0].uri).pathname, `/avatars/${id}/avatar.webp`);
    }
    h.lazy.openLazy(Promise.resolve(module), 'UserProfile', {});
    await flushPromises();
    assert.equal(module.default().props.children.length, 1);
    assert.equal(h.errors.length, 0);
    h.plugin.onUnload(); assert.equal(module.default, original); assert.equal(h.patches.size, 0);
});
