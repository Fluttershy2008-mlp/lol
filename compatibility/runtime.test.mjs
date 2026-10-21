import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import patcher from 'spitroast';

const code = readFileSync(new URL('./runtime.js', import.meta.url), 'utf8');
const create = vm.runInNewContext(code + '\nwithRevengeCompatibility;');
const delay = Symbol.for('bunny.api.patcher.delay');
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(factory) {
    const warnings = [];
    const api = { patcher, plugin: { storage: {} }, logger: { warn: (...args) => warnings.push(args) } };
    return { api, warnings, plugin: create(api, factory, 'Regression test') };
}

test('patches preserve arguments, this, return values and cleanup without mutating the global API', () => {
    const target = { offset: 3, run(value) { return this.offset + value; } };
    const original = target.run;
    const originalAfter = patcher.after;
    let local;
    const h = setup(api => {
        local = api;
        return { onLoad() { api.patcher.after('run', target, function (args, result) {
            assert.equal(this, target); assert.equal(args[0], 4); return result * 2;
        }); } };
    });
    assert.equal(local.plugin.storage, h.api.plugin.storage);
    assert.notEqual(local.patcher, patcher);
    assert.equal(patcher.after, originalAfter);
    h.plugin.onLoad(); assert.equal(target.run(4), 14);
    h.plugin.onUnload(); assert.equal(target.run, original); assert.equal(target.run(4), 7);
});

test('nested memo and forwardRef component exports patch their callable renderer', () => {
    const renderer = { $$typeof: Symbol.for('react.forward_ref'), render: (props, ref) => ({ props, ref }) };
    const target = { default: { $$typeof: Symbol.for('react.memo'), type: renderer } };
    const original = renderer.render;
    const h = setup(api => ({ onLoad() { api.patcher.after('default', target, (args, ret) => ({ ...ret, added: args[0].id })); } }));
    h.plugin.onLoad();
    assert.deepEqual(renderer.render({ id: 'pony' }, 'ref'), { props: { id: 'pony' }, ref: 'ref', added: 'pony' });
    h.plugin.onUnload(); assert.equal(renderer.render, original);
});

test('a lazy function component without render never reaches the native patcher', () => {
    let resolve;
    const lazy = { [delay](callback) { resolve = callback; } };
    const h = setup(api => ({ onLoad() { api.patcher.after('render', lazy, () => {}); } }));
    h.plugin.onLoad();
    function MessagesConnected() { return 'native'; }
    assert.doesNotThrow(() => resolve(MessagesConnected));
    assert.equal(Object.hasOwn(MessagesConnected, 'render'), false);
    assert.equal(MessagesConnected(), 'native'); assert.equal(h.warnings.length, 1);
    h.plugin.onUnload();
});

test('lazy proxy properties are not forced before the module resolves', () => {
    let resolve;
    const lazy = new Proxy({}, { get(_target, key) {
        if (key === delay) return callback => { resolve = callback; };
        throw new Error('premature lazy module access');
    } });
    const target = { default: () => 'native' };
    const original = target.default;
    const h = setup(api => ({ onLoad() { api.patcher.after('default', lazy, (_args, ret) => ret + '-extended'); } }));
    h.plugin.onLoad(); resolve(target); assert.equal(target.default(), 'native-extended');
    h.plugin.onUnload(); assert.equal(target.default, original);
});

test('unload cancels pending modules even when a lazy provider has no unsubscribe', () => {
    let resolve;
    const lazy = { [delay](callback) { resolve = callback; } };
    const target = { default: () => 1 }, original = target.default;
    const h = setup(api => ({ onLoad() { api.patcher.after('default', lazy, () => 2); } }));
    h.plugin.onLoad(); const oldResolve = resolve;
    h.plugin.onUnload(); h.plugin.onLoad();
    oldResolve(target); assert.equal(target.default, original);
    resolve(target); assert.equal(target.default(), 2);
    h.plugin.onUnload(); assert.equal(target.default, original);
});

test('module subscriptions are unsubscribed and explicitly cancelled patches stay cancelled', () => {
    let resolve, unsubscribed = 0, cancel;
    const lazy = { [delay](callback) { resolve = callback; return () => unsubscribed++; } };
    const target = { type: () => 1 }, original = target.type;
    const h = setup(api => ({ onLoad() { cancel = api.patcher.after('type', lazy, () => 2); } }));
    h.plugin.onLoad(); cancel(); cancel(); resolve(target);
    assert.equal(unsubscribed, 1); assert.equal(target.type, original);
    h.plugin.onUnload(); assert.equal(unsubscribed, 1);
});

test('a rejected deferred module is handled and cannot install after unload', async () => {
    let resolve;
    const pending = new Promise(value => { resolve = value; });
    const target = { type: () => 1 }, original = target.type;
    const h = setup(api => ({ onLoad() {
        api.patcher.after.await('type', pending, () => 2);
        api.patcher.after.await('type', Promise.reject(new Error('module failed')), () => 3);
    } }));
    h.plugin.onLoad(); await tick(); assert.equal(h.warnings.length, 1);
    h.plugin.onUnload(); resolve(target); await tick(); assert.equal(target.type, original);
});

test('required data patches still fail startup visibly and clean earlier patches', () => {
    const target = { run: () => 1 }, original = target.run;
    let cleaned = 0;
    const h = setup(api => ({ onLoad() {
        api.patcher.after('run', target, () => 2);
        api.patcher.after('missingDataMethod', {}, () => {});
    }, onUnload() { cleaned++; } }));
    assert.throws(() => h.plugin.onLoad(), /missingDataMethod is not a function/);
    assert.equal(cleaned, 1); assert.equal(target.run, original);
});

test('required methods disappearing during deferred module loading do not crash Metro', () => {
    let resolve;
    const lazy = { [delay](callback) { resolve = callback; } };
    const h = setup(api => ({ onLoad() { api.patcher.after('getMessages', lazy, () => {}); } }));
    h.plugin.onLoad(); assert.doesNotThrow(() => resolve({}));
    assert.equal(h.warnings.length, 1); h.plugin.onUnload();
});

test('once patches run once and disabled instead hooks never duplicate an action', () => {
    let called = 0;
    const target = { run() { called++; return called; } };
    const original = target.run;
    const h = setup(api => ({ onLoad() { api.patcher.instead('run', target, (args, original) => original(...args) * 2, true); } }));
    h.plugin.onLoad(); assert.equal(target.run(), 2); assert.equal(target.run(), 2);
    assert.equal(called, 2); h.plugin.onUnload(); assert.equal(target.run, original);
});

test('a once UI hook runs once even when another plugin already patched that component', () => {
    const target = { type: () => 1 }, original = target.type;
    const undo = patcher.after('type', target, (_args, ret) => ret + 1);
    const h = setup(api => ({ onLoad() { api.patcher.after('type', target, (_args, ret) => ret * 3, true); } }));
    h.plugin.onLoad(); assert.equal(target.type(), 6); assert.equal(target.type(), 2);
    h.plugin.onUnload(); undo(); assert.equal(target.type, original);
});

test('an old async startup rejection does not unload a newly enabled session', async () => {
    let reject, loads = 0, unloads = 0;
    const oldStart = new Promise((_resolve, value) => { reject = value; });
    const h = setup(() => ({ onLoad() { return ++loads === 1 ? oldStart : undefined; }, onUnload() { unloads++; } }));
    const pending = h.plugin.onLoad();
    h.plugin.onUnload(); h.plugin.onLoad(); reject(new Error('old startup'));
    await assert.rejects(pending, /old startup/); assert.equal(unloads, 1);
    h.plugin.onUnload(); assert.equal(unloads, 2);
});

test('two plugin adapters can coexist and unload independently', () => {
    const target = { run: () => 1 }, original = target.run;
    const a = setup(api => ({ onLoad() { api.patcher.after('run', target, (_args, ret) => ret + 1); } }));
    const b = setup(api => ({ onLoad() { api.patcher.after('run', target, (_args, ret) => ret * 3); } }));
    a.plugin.onLoad(); b.plugin.onLoad(); assert.equal(target.run(), 6);
    a.plugin.onUnload(); assert.equal(target.run(), 3);
    b.plugin.onUnload(); assert.equal(target.run, original);
});

test('all published Revenge manifests point at guarded bundles with exact hashes; aliases match', () => {
    const root = new URL('../', import.meta.url);
    let count = 0;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === 'vencord-save-as-sticker') continue;
        const manifestURL = new URL(entry.name + '/manifest.json', root);
        if (!existsSync(manifestURL)) continue;
        const manifest = JSON.parse(readFileSync(manifestURL, 'utf8'));
        const bundle = readFileSync(new URL(entry.name + '/' + manifest.main, root));
        assert.equal(createHash('sha256').update(bundle).digest('hex'), manifest.hash, entry.name);
        assert.equal(bundle.toString().split('function withRevengeCompatibility(api, factory, pluginName)').length, 2, entry.name);
        new vm.Script(bundle.toString()); count++;
    }
    assert.equal(count, 22);
    assert.deepEqual(readFileSync(new URL('message-logger/index.js', root)), readFileSync(new URL('message-logger-v2/index.js', root)));
    assert.deepEqual(readFileSync(new URL('index.js', root)), readFileSync(new URL('save-as-sticker/index.js', root)));
});
