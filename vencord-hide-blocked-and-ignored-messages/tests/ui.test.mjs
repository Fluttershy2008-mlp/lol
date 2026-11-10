import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const upstreamRequire = createRequire(path.join(process.env.VENCORD_SOURCE || process.cwd(), 'package.json'));
const { build } = upstreamRequire('esbuild');
const React = require('react');
const Renderer = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
async function loadPlugin() {
    const bridge = { modal: undefined, settings: undefined };
    globalThis.__HBIM_TEST__ = { React, bridge };
    const bundle = await build({ entryPoints: [fileURLToPath(new URL('../hideBlockedAndIgnoredMessages/index.tsx', import.meta.url))],
        bundle: true, format: 'cjs', platform: 'node', write: false, jsx: 'automatic',
        plugins: [{ name: 'vencord-test-host', setup(build) {
            build.onResolve({ filter: /^(?:@|react)/ }, args => ({ path: args.path, namespace: 'host' }));
            build.onLoad({ filter: /.*/, namespace: 'host' }, ({ path: id }) => {
                const prefix = 'Object.defineProperty(exports,"__esModule",{value:true});const {React,bridge}=globalThis.__HBIM_TEST__;';
                if (id === 'react/jsx-runtime') return { contents: prefix + 'exports.jsx=exports.jsxs=(type,props,key)=>React.createElement(type,{...props,key});exports.Fragment=React.Fragment;' };
                if (id === '@api/Settings') return { contents: prefix + `exports.definePluginSettings=def=>{
                    const listeners=new Set();let revision=0;
                    const store=new Proxy(Object.fromEntries(Object.entries(def).map(([k,v])=>[k,v.default])),{set(t,k,v){t[k]=v;revision++;for(const f of listeners)f();return true;}});
                    return bridge.settings={def,store,use(){React.useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f)},()=>revision);return store;}};
                };` };
                if (id === '@utils/types') return { contents: 'export default p=>p;export const OptionType={BOOLEAN:1,STRING:2};' };
                if (id === '@components/ErrorBoundary') return { contents: 'const E=({children})=>children;E.wrap=C=>C;export default E;' };
                if (id === '@components/FormSwitch') return { contents: prefix + 'exports.FormSwitch=p=>React.createElement("input",{type:"checkbox","aria-label":p.title,checked:p.value,onChange:e=>p.onChange(e.target.checked)});' };
                if (id === '@components/Button' || id === '@api/ChatButtons') return { contents: prefix + 'exports.Button=exports.ChatBarButton=p=>React.createElement("button",{onClick:p.onClick,title:p.tooltip},p.children);' };
                if (id === '@components/Paragraph') return { contents: prefix + 'exports.Paragraph=p=>React.createElement("p",null,p.children);' };
                if (id === '@utils/Logger') return { contents: 'exports.Logger=class {warn(){}};' };
                if (id === '@webpack') return { contents: 'exports.filters={};exports.find=()=>{};exports.waitFor=()=>{};exports.waitForSubscriptions=new Map();' };
                if (id === '@webpack/common') return { contents: prefix + 'exports.useState=React.useState;exports.Modal=p=>React.createElement("dialog",null,p.children);exports.openModal=f=>bridge.modal=f;' };
                return { contents: '' };
            });
        } }] });
    const module = { exports: {} };
    new Function('module','exports','require', bundle.outputFiles[0].text)(module, module.exports, require);
    return { plugin: module.exports.default, bridge };
}
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
