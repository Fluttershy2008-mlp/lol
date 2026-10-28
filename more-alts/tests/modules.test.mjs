import test from 'node:test';
import assert from 'node:assert/strict';
import { createModuleResolver } from '../src/modules.mjs';

const loaded = exports => ({ isInitialized: true, hasError: false, publicModule: { exports } });
test('resolver never requires factories or reads exports on uninitialized and failed modules', () => {
    let forced = 0, reads = 0;
    const modules = { 1: { isInitialized: false, factory: () => forced++, get publicModule() { reads++; throw new Error('must not read'); } },
        2: { isInitialized: true, hasError: true, get publicModule() { reads++; throw new Error('failed module'); } },
        3: loaded({ getToken: () => 'fixture' }) };
    const resolver = createModuleResolver({ modules, findByProps: () => forced++ });
    assert.equal(resolver.byProps('getToken').getToken(), 'fixture');
    assert.equal(resolver.byProps('missing'), undefined); assert.equal(forced, 0); assert.equal(reads, 0);
});
test('resolver caches hits and misses, then discovers newly initialized modules after cooldown', () => {
    let time = 0, reads = 0;
    const modules = { 1: { isInitialized: false }, get 2() { reads++; return loaded({ unrelated: true }); } };
    const resolver = createModuleResolver({ modules }, { now: () => time });
    resolver.byProps('getToken'); const initial = reads;
    for (let i = 0; i < 60; i++) resolver.byProps('getToken'); assert.equal(reads, initial);
    modules[1] = loaded({ getToken: () => 'fixture' }); time = 5001;
    const tokenModule = resolver.byProps('getToken'); assert.equal(tokenModule.getToken(), 'fixture');
    for (let i = 0; i < 60; i++) assert.equal(resolver.byProps('getToken'), tokenModule);
    assert.equal(reads, initial);
});
test('resolver handles default exports and throwing exports without breaking settings', () => {
    const broken = {}; Object.defineProperty(broken, 'getName', { get() { throw new Error('unsupported'); } });
    const store = { getName: () => 'UserStore' };
    const resolver = createModuleResolver({ modules: { 1: loaded(broken), 2: loaded({ __esModule: true, default: store }) } });
    assert.equal(resolver.byStore('UserStore'), store);
});
test('optional discovery yields every 64 records and never calls an eager finder', async () => {
    const modules = Object.fromEntries(Array.from({ length: 2048 }, (_, id) => [id, { isInitialized: false }]));
    let yields = 0, eager = 0;
    const resolver = createModuleResolver({ modules, findByProps: () => eager++ });
    await resolver.prepare([['props', 'missing']], async () => { yields++; }, () => true);
    assert.equal(yields, 32); assert.equal(eager, 0);
});
test('cancelled sliced discovery stops promptly', async () => {
    const modules = Object.fromEntries(Array.from({ length: 2048 }, (_, id) => [id, { isInitialized: false }]));
    let active = true, yields = 0;
    const resolver = createModuleResolver({ modules });
    await resolver.prepare([['props', 'missing']], async () => { yields++; active = false; }, () => active);
    assert.equal(yields, 1);
});

for (const shape of ['function', 'forward', 'memo', 'nested']) test('WebView discovery rejects translations and accepts the ' + shape + ' package export', () => {
    let invoked = 0, reads = 0;
    const message = { locale: 'en-US', ast: [{ type: 0, value: 'WebView' }] };
    function InvalidTranslation() { invoked++; return message; }
    let component = () => null;
    if (shape === 'forward' || shape === 'nested') component = { $$typeof: Symbol.for('react.forward_ref'), render: component };
    if (shape === 'memo' || shape === 'nested') component = { $$typeof: Symbol.for('react.memo'), type: component };
    const namespace = Object.freeze({ __esModule: true, WebView: component, default: component });
    const resolver = createModuleResolver({ modules: {
        1: loaded({ WebView: message }), 2: loaded({ WebView: InvalidTranslation }),
        3: { isInitialized: false, get publicModule() { reads++; throw new Error('must not initialize'); } },
        4: loaded(namespace),
    }, findByProps() { assert.fail('do not run eager module finders'); } });
    assert.equal(resolver.webView(), component);
    assert.equal(invoked, 0); assert.equal(reads, 0);
    assert.equal(namespace.WebView, component);
});

test('WebView discovery prefers the imported package without scanning other module records', () => {
    const component = { $$typeof: Symbol.for('react.forward_ref'), render() {} };
    const resolver = createModuleResolver({ modules: { get 1() { assert.fail('must not scan after a trusted path match'); } },
        findByImportedPath(path) { assert.equal(path, 'react-native-webview'); return { default: component }; } });
    assert.equal(resolver.webView(), component);
});

test('WebView discovery recognizes the standalone Android platform export', () => {
    const component = Object.assign({ $$typeof: Symbol.for('react.forward_ref'), render() {} },
        { isFileUploadSupported() { assert.fail('validation must not call native upload support'); } });
    const resolver = createModuleResolver({ modules: { 1: loaded({ __esModule: true, default: component }) } });
    assert.equal(resolver.webView(), component);
});

test('legacy WebView discovery requires a verified namespace rather than the first matching property', () => {
    const component = () => null, queries = [];
    const resolver = createModuleResolver({ findByProps(...keys) {
        queries.push(keys); return keys.length === 2 ? { default: component, WebView: component }
            : { WebView: { locale: 'en-US', ast: [] } };
    } });
    assert.equal(resolver.webView(), component);
    assert.deepEqual(queries, [['WebView', 'default']]);
});

test('QR clicks can discover a newly loaded WebView immediately after an unavailable result', () => {
    const modules = { 1: loaded({ WebView: { locale: 'en-US', ast: [] } }) };
    const resolver = createModuleResolver({ modules }, { now: () => 0 });
    assert.equal(resolver.webView(), undefined);
    const component = () => null;
    modules[2] = loaded({ default: component, WebView: component });
    assert.equal(resolver.webView(), component);
});

test('a failed WebView export is skipped on refresh without mutating its frozen namespace', () => {
    const failed = () => null, healthy = () => null;
    const first = Object.freeze({ default: failed, WebView: failed });
    const resolver = createModuleResolver({ modules: { 1: loaded(first), 2: loaded({ default: healthy, WebView: healthy }) } });
    assert.equal(resolver.webView(), failed);
    resolver.rejectWebView(failed);
    assert.equal(resolver.webView(), healthy); assert.equal(first.WebView, failed);
    resolver.clear(); assert.equal(resolver.webView(), failed);
});
