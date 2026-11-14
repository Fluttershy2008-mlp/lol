import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const upstreamRequire = createRequire(path.join(process.env.VENCORD_SOURCE || process.cwd(), 'package.json'));
const { build } = upstreamRequire('esbuild');
const React = require('react');
const JSX = require('react/jsx-runtime');
const Renderer = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function displayRuntime() {
    const listeners = { members: new Set(), previews: new Set() };
    let revision = 1, hide = true, active = false;
    return {
        start() { active = true; }, stop() { active = false; this.refresh(); },
        refresh() { revision++; for (const group of Object.values(listeners)) for (const listener of group) listener(); },
        subscribe(kind, callback) { listeners[kind].add(callback); return () => listeners[kind].delete(callback); },
        revision: () => revision,
        hiddenPreview: (props, native) => active ? hide && props?.message?.author?.id === 'blocked' : native,
        memberList: props => active && hide ? { ...props, rows: props.rows.filter(row => row !== 'blocked'), version: revision } : props,
        toggle(value) { hide = value; this.refresh(); }
    };
}
async function loadPlugin({ legacy = false, runtime } = {}) {
    const bridge = { runtime, modal: undefined, settings: undefined, settingsHost: legacy ? { customSections: [] } : { customEntries: [], customSections: [] } };
    globalThis.__HBIM_TEST__ = { React, JSX, bridge };
    const bundle = await build({ entryPoints: [fileURLToPath(new URL('../hideBlockedAndIgnoredMessages/index.tsx', import.meta.url))],
        bundle: true, format: 'cjs', platform: 'node', write: false, jsx: 'automatic', loader: { '.css': 'empty' },
        plugins: [{ name: 'vencord-test-host', setup(build) {
            build.onResolve({ filter: /^\.\/runtime\.js$/ }, () => ({ path: 'desktop-runtime', namespace: 'host' }));
            build.onResolve({ filter: /^(?:@|react)/ }, args => ({ path: args.path, namespace: 'host' }));
            build.onLoad({ filter: /.*/, namespace: 'host' }, ({ path: id }) => {
                const prefix = 'Object.defineProperty(exports,"__esModule",{value:true});const {React,JSX,bridge}=globalThis.__HBIM_TEST__;';
                if (id === 'desktop-runtime') return { contents: 'export const createDesktopRuntime=()=>globalThis.__HBIM_TEST__.bridge.runtime??({start(){},stop(){},refresh(){}});' };
                if (id === '@plugins/_core/settings') return { contents: 'export default globalThis.__HBIM_TEST__.bridge.settingsHost;' };
                if (id === 'react/jsx-runtime') return { contents: prefix + 'exports.jsx=JSX.jsx;exports.jsxs=JSX.jsxs;exports.Fragment=JSX.Fragment;' };
                if (id === '@api/Settings') return { contents: prefix + `exports.definePluginSettings=def=>{
                    const listeners=new Set();let revision=0;
                    const store=new Proxy(Object.fromEntries(Object.entries(def).map(([k,v])=>[k,v.default])),{set(t,k,v){t[k]=v;revision++;for(const f of listeners)f();return true;}});
                    return bridge.settings={def,store,use(){React.useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f)},()=>revision);return store;}};
                };` };
                if (id === '@utils/types') return { contents: 'export default p=>p;export const OptionType={BOOLEAN:1,STRING:2,COMPONENT:3};' };
                if (id === '@components/ErrorBoundary') return { contents: 'const E=({children})=>children;E.wrap=C=>C;export default E;' };
                if (id === '@components/FormSwitch') return { contents: prefix + 'exports.FormSwitch=p=>React.createElement("input",{type:"checkbox","aria-label":p.title,checked:p.value,disabled:p.disabled,onChange:e=>p.onChange(e.target.checked)});' };
                if (id === '@components/Button' || id === '@api/ChatButtons') return { contents: prefix + 'exports.Button=exports.ChatBarButton=p=>React.createElement("button",{onClick:p.onClick,title:p.tooltip},p.children);' };
                if (id === '@components/Paragraph') return { contents: prefix + 'exports.Paragraph=p=>React.createElement("p",null,p.children);' };
                if (id === '@utils/Logger') return { contents: 'exports.Logger=class {warn(){}};' };
                if (id === '@webpack') return { contents: 'exports.filters={};exports.find=()=>{};exports.waitFor=()=>{};exports.waitForSubscriptions=new Map();' };
                if (id === '@webpack/common') return { contents: prefix + 'exports.React=React;exports.useState=React.useState;exports.useEffect=React.useEffect;exports.useId=React.useId;exports.useMemo=React.useMemo;exports.useSyncExternalStore=React.useSyncExternalStore;exports.Modal=p=>React.createElement("dialog",null,p.children);exports.openModal=f=>bridge.modal=f;' };
                return { contents: '' };
            });
        } }] });
    const module = { exports: {} };
    new Function('module','exports','require', bundle.outputFiles[0].text)(module, module.exports, require);
    return { plugin: module.exports.default, bridge };
}
test('preview gates update mounted content while keeping the parent card, actions and explicit search visible', async t => {
    const runtime = displayRuntime();
    const { plugin } = await loadPlugin({ runtime });
    plugin.start();
    const Native = props => { React.useState(0); return React.createElement('span', { className: 'preview' }, props.content); };
    const props = { message: { author: { id: 'blocked' } }, content: 'hidden content' };
    let view;
    t.after(async () => { await Renderer.act(async () => { view?.unmount(); plugin.stop(); }); });
    await Renderer.act(async () => { view = Renderer.create(React.createElement('article', null,
        React.createElement('button', null, 'Open thread'),
        React.createElement(plugin.Preview, { component: Native, previewProps: props }),
        React.createElement(plugin.Preview, { component: Native, previewProps: props, searchHit: true }))); });
    assert.equal(view.root.findAllByType('article').length, 1);
    assert.equal(view.root.findAllByType('button').length, 1);
    assert.equal(view.root.findAllByType('span').length, 1, 'only the explicit search preview remains');
    await Renderer.act(async () => runtime.toggle(false));
    assert.equal(view.root.findAllByType('span').length, 2);
    await Renderer.act(async () => runtime.toggle(true));
    assert.equal(view.root.findAllByType('span').length, 1);
    await Renderer.act(async () => plugin.stop());
    assert.equal(view.root.findAllByType('span').length, 2);
});
test('mounted member list updates when filtering changes and restores the original props on disable', async t => {
    const runtime = displayRuntime();
    const { plugin } = await loadPlugin({ runtime });
    plugin.start();
    const props = Object.freeze({ rows: Object.freeze(['blocked', 'friend']), version: 0 });
    let received, view;
    const Native = p => { received = p; return React.createElement('ul', null, p.rows.map(row => React.createElement('li', { key: row }, row))); };
    t.after(async () => { await Renderer.act(async () => { view?.unmount(); plugin.stop(); }); });
    await Renderer.act(async () => { view = Renderer.create(React.createElement(plugin.MemberList, { component: Native, memberProps: props })); });
    assert.equal(view.root.findAllByType('li').length, 1);
    await Renderer.act(async () => runtime.toggle(false));
    assert.equal(received.rows, props.rows);
    await Renderer.act(async () => runtime.toggle(true));
    assert.equal(view.root.findAllByType('li').length, 1);
    await Renderer.act(async () => plugin.stop());
    assert.equal(received.rows, props.rows);
    assert.equal(view.root.findAllByType('li').length, 2);
});
test('the desktop chat button mounts real settings, validates/saves IDs and controls independent switches', async t => {
    const { plugin, bridge } = await loadPlugin(); let button, modal;
    t.after(async () => { await Renderer.act(async () => { button?.unmount(); modal?.unmount(); }); });
    await Renderer.act(async () => { button = Renderer.create(plugin.chatBarButton.render({ isAnyChat: true })); });
    await Renderer.act(async () => button.root.findByType('button').props.onClick());
    assert.equal(typeof bridge.modal, 'function');
    await Renderer.act(async () => { modal = Renderer.create(bridge.modal({ onClose() {} })); });
    const field = label => modal.root.findAllByType('textarea').find(n => n.props['aria-label'] === label);
    const save = () => modal.root.findAllByType('button').find(n => n.props.children === 'Save IDs');
    await Renderer.act(async () => field('Hidden server IDs').props.onChange({ currentTarget: { value: 'invalid' } }));
    await Renderer.act(async () => save().props.onClick()); assert.equal(bridge.settings.store.hiddenServerIds, '');
    assert.equal(modal.root.findAll(n => n.props.role === 'alert').length, 1);
    await Renderer.act(async () => field('Hidden server IDs').props.onChange({ currentTarget: { value: '400000000000000001' } }));
    await Renderer.act(async () => save().props.onClick()); assert.equal(bridge.settings.store.hiddenServerIds, '400000000000000001');
    const icons = modal.root.findAllByType('input').find(n => n.props['aria-label'] === 'Hide selected server icons');
    await Renderer.act(async () => icons.props.onChange({ target: { checked: false } }));
    assert.equal(bridge.settings.store.hideServerIcons, false); assert.equal(bridge.settings.store.hideServerPings, true);
});
test('notification policy source patch suppresses hidden-server alerts while preserving native decisions for other messages', async () => {
    const { plugin } = await loadPlugin();
    const patch = plugin.patches.find(p => p.find.includes('SUPPRESS_NOTIFICATIONS')).replacement;
    const source = 'function policy(message,channel){if(P.can(channel,P.SUPPRESS_NOTIFICATIONS))return!1;return true}';
    const projected = source.replace(patch.match, patch.replace.replaceAll('$self', 'plugin'));
    assert.notEqual(projected, source);
    plugin.suppressPing = m => m.guild_id === 'hidden';
    const policy = new Function('plugin','P', projected + ';return policy;')(plugin, { SUPPRESS_NOTIFICATIONS: 1, can: channel => channel === 'muted' });
    assert.equal(policy({ guild_id: 'hidden' }, 'normal'), false);
    assert.equal(policy({ guild_id: 'visible' }, 'normal'), true);
    assert.equal(policy({ guild_id: 'visible' }, 'muted'), false);
});

for (const legacy of [false, true]) test(`Vencord sidebar opens the live settings page and cleans up on disable (${legacy ? 'legacy' : 'current'})`, async t => {
    const { plugin, bridge } = await loadPlugin({ legacy }); let page, modal;
    t.after(async () => { await Renderer.act(async () => { page?.unmount(); modal?.unmount(); }); plugin.stop(); });
    bridge.settings.store.hiddenServerIds = '400000000000000001';
    plugin.start();
    const entries = legacy ? bridge.settingsHost.customSections : bridge.settingsHost.customEntries;
    assert.equal(entries.length, 1);
    const Page = legacy ? entries[0]({}).element : entries[0].Component;
    await Renderer.act(async () => { page = Renderer.create(React.createElement(Page)); });
    const field = page.root.findAllByType('textarea').find(n => n.props['aria-label'] === 'Hidden server IDs');
    assert.equal(field.props.value, '400000000000000001');
    const icons = page.root.findAllByType('input').find(n => n.props['aria-label'] === 'Hide selected server icons');
    await Renderer.act(async () => icons.props.onChange({ target: { checked: false } }));
    assert.equal(bridge.settings.store.hideServerIcons, false); assert.equal(bridge.settings.store.hideServerPings, true);
    await Renderer.act(async () => field.props.onChange({ currentTarget: { value: '400000000000000002' } }));
    const save = page.root.findAllByType('button').find(n => n.props.children === 'Save IDs');
    await Renderer.act(async () => save.props.onClick());
    assert.equal(bridge.settings.store.hiddenServerIds, '400000000000000002');
    plugin.toolboxActions['Hidden users & servers']();
    await Renderer.act(async () => { modal = Renderer.create(bridge.modal({ onClose() {} })); });
    assert.equal(modal.root.findAllByType('textarea').find(n => n.props['aria-label'] === 'Hidden server IDs').props.value, '400000000000000002');
    plugin.stop(); assert.equal(entries.length, 0);
    plugin.start(); assert.equal(entries.length, 1);
    assert.equal(bridge.settings.store.hiddenServerIds, '400000000000000002');
});


test('one custom settings component replaces all duplicate native controls', async t => {
    const { plugin, bridge } = await loadPlugin(); let panel;
    t.after(async () => { await Renderer.act(async () => panel?.unmount()); });
    assert.equal(plugin.settingsAboutComponent, undefined);
    assert.deepEqual(Object.keys(bridge.settings.def).filter(k => !bridge.settings.def[k].hidden), ['controls']);
    await Renderer.act(async () => { panel = Renderer.create(bridge.settings.def.controls.component({})); });
    const tabs = () => panel.root.findAll(n => n.props.role === 'tab');
    const panels = () => panel.root.findAll(n => n.props.role === 'tabpanel');
    assert.equal(tabs().length, 3);
    assert.deepEqual(panels().map(n => n.props.hidden), [false, true, true]);
    await Renderer.act(async () => tabs()[1].props.onClick());
    assert.deepEqual(panels().map(n => n.props.hidden), [true, false, true]);
    let focused = -1, prevented = false;
    await Renderer.act(async () => tabs()[1].props.onKeyDown({ key: 'ArrowRight', preventDefault() { prevented = true; }, currentTarget: { parentElement: { querySelectorAll: () => [0,1,2].map(i => ({ focus() { focused = i; } })) } } }));
    assert.ok(prevented); assert.equal(focused, 2);
    assert.deepEqual(panels().map(n => n.props.hidden), [true, true, false]);
});

test('ID edits survive tab changes, save atomically, deduplicate without rounding, and reset only drafts', async t => {
    const { bridge } = await loadPlugin(); let panel;
    t.after(async () => { await Renderer.act(async () => panel?.unmount()); });
    await Renderer.act(async () => { panel = Renderer.create(bridge.settings.def.controls.component({})); });
    const field = label => panel.root.findAllByType('textarea').find(n => n.props['aria-label'] === label);
    const button = label => panel.root.findAllByType('button').find(n => n.props.children === label);
    const edit = async (label, value) => Renderer.act(async () => field(label).props.onChange({ currentTarget: { value } }));
    assert.equal(button('Save IDs').props.disabled, true);
    await edit('Hidden server IDs', '1400000000000000003, 1400000000000000003');
    await Renderer.act(async () => panel.root.findAll(n => n.props.role === 'tab')[2].props.onClick());
    assert.equal(field('Hidden server IDs').props.value, '1400000000000000003, 1400000000000000003');
    await edit('Whitelisted user IDs', 'invalid');
    await Renderer.act(async () => button('Save IDs').props.onClick());
    assert.equal(bridge.settings.store.hiddenServerIds, '');
    assert.equal(bridge.settings.store.whitelistedIds, '');
    await edit('Whitelisted user IDs', '<@!400000000000000001>;400000000000000001\n400000000000000002');
    await Renderer.act(async () => button('Save IDs').props.onClick());
    assert.equal(bridge.settings.store.hiddenServerIds, '1400000000000000003');
    assert.equal(bridge.settings.store.whitelistedIds, '400000000000000001\n400000000000000002');
    assert.equal(bridge.settings.store.whitelistEnabled, false);
    assert.equal(button('Save IDs').props.disabled, true);
    await edit('Hidden server IDs', '');
    await Renderer.act(async () => button('Reset').props.onClick());
    assert.equal(field('Hidden server IDs').props.value, '1400000000000000003');
    await edit('Hidden server IDs', '');
    await Renderer.act(async () => button('Save IDs').props.onClick());
    assert.equal(bridge.settings.store.hiddenServerIds, '');
    assert.equal(bridge.settings.store.whitelistedIds, '400000000000000001\n400000000000000002');
});

test('two open panels sync clean fields and refuse to overwrite a newer saved list', async t => {
    const { bridge } = await loadPlugin(); let first, second;
    t.after(async () => { await Renderer.act(async () => { first?.unmount(); second?.unmount(); }); });
    await Renderer.act(async () => { first = Renderer.create(bridge.settings.def.controls.component({})); second = Renderer.create(bridge.settings.def.controls.component({})); });
    const field = panel => panel.root.findAllByType('textarea').find(n => n.props['aria-label'] === 'Hidden server IDs');
    const button = (panel, label) => panel.root.findAllByType('button').find(n => n.props.children === label);
    await Renderer.act(async () => { field(first).props.onChange({ currentTarget: { value: '400000000000000001' } }); });
    await Renderer.act(async () => { button(first, 'Save IDs').props.onClick(); });
    assert.equal(field(second).props.value, '400000000000000001');
    await Renderer.act(async () => { field(first).props.onChange({ currentTarget: { value: '400000000000000002' } }); field(second).props.onChange({ currentTarget: { value: '400000000000000003' } }); });
    await Renderer.act(async () => { button(second, 'Save IDs').props.onClick(); });
    await Renderer.act(async () => { button(first, 'Save IDs').props.onClick(); });
    assert.equal(bridge.settings.store.hiddenServerIds, '400000000000000003');
    assert.equal(first.root.findAll(n => n.props.role === 'alert').length, 1);
    await Renderer.act(async () => { button(first, 'Reset').props.onClick(); });
    assert.equal(field(first).props.value, '400000000000000003');
});
