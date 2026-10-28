import test from 'node:test';
import assert from 'node:assert/strict';
import { createColdWebViewLoader } from '../src/webview-loader.mjs';
import { installColdWebViewModule } from './webview-fixture.cjs';

function fixture(options) {
    const modules = [], React = { createElement() {}, useState() {} }, RN = {};
    const finders = {
        filters: {},
        *lookupModules(filter) { for (const [id, value] of modules.entries()) if (filter(id, value, true)) yield [value, id]; },
        lookupModule(filter, opts) { return [...this.lookupModules(filter, opts)][0] ?? []; },
    };
    const world = { modules, React, RN, WebView: () => null, addModule(value) { return modules.push(value) - 1; },
        U: { react: { React, ReactNative: RN }, modules: { finders, metro: { isModuleInitialized: id => !!modules[id] }, native: {} } } };
    const graph = installColdWebViewModule(world, options);
    return { world, graph, loader: createColdWebViewLoader(() => world.U) };
}

for (const legacyRegistry of [false, true]) test('cold WebView uses the unique Android graph with ' + (legacyRegistry ? 'legacy' : 'current') + ' native bridge imports', () => {
    const { world, graph, loader } = fixture({ legacyRegistry });
    assert.equal(graph.requires(), 0); assert.equal(graph.nativeProbes(), 0);
    assert.equal(loader.load(namespace => namespace.default), world.WebView);
    assert.equal(graph.requires(), 1); assert.equal(graph.unrelated(), 0);
    assert.equal(graph.initializedLookups(), 1);
});

for (const mode of ['compiled', 'minifiedHelpers', 'loadedNativeView']) test('cold WebView supports ' + mode + ' native commands', () => {
    const { world, graph, loader } = fixture({ [mode]: true });
    assert.equal(loader.load(namespace => namespace.default), world.WebView);
    assert.equal(graph.requires(), 1); assert.equal(graph.unrelated(), 0);
});

for (const mode of ['ambiguous', 'incomplete', 'noNative']) test('cold WebView does not initialize factories for an ' + mode + ' graph', () => {
    const { graph, loader } = fixture({ [mode]: true });
    assert.equal(loader.load(value => value), undefined);
    assert.equal(graph.requires(), 0); assert.equal(graph.unrelated(), 0); assert.equal(graph.initializedLookups(), 0);
    assert.equal(loader.reason(), ({ ambiguous: 'AMBIGUOUS', incomplete: 'MATCH', noNative: 'NATIVE' })[mode]);
});

for (const batchedBridge of [false, true]) for (const nativeName of ['RNCWebViewModule', 'RNCWebView'])
    test('cold WebView supports ' + nativeName + ' with ' + (batchedBridge ? 'BatchedBridge' : 'EventEmitter'), () => {
        const { world, graph, loader } = fixture({ batchedBridge, nativeName });
        assert.equal(loader.load(namespace => namespace.default), world.WebView);
        assert.equal(loader.reason(), undefined);
        assert.equal(graph.requires(), 1); assert.equal(graph.unrelated(), 0);
    });

test('a failed browser factory is attempted once per plugin session', () => {
    const { graph, loader } = fixture({ fail: true });
    assert.equal(loader.load(value => value), undefined); assert.equal(loader.load(value => value), undefined);
    assert.equal(graph.requires(), 1); assert.equal(graph.unrelated(), 0);
    assert.equal(loader.reason(), 'LOAD');
    loader.clear(); assert.equal(loader.load(value => value), undefined); assert.equal(graph.requires(), 2);
});

for (const nativeName of ['RNCWebViewModule', 'RNCWebView']) test('cold WebView supports an unloaded BatchedBridge singleton with ' + nativeName, () => {
    const { world, graph, loader } = fixture({ coldBatchedBridge: true, nativeName });
    assert.equal(loader.load(namespace => namespace.default), world.WebView);
    assert.equal(graph.requires(), 1); assert.equal(graph.unrelated(), 0);
});

test('unavailable native module metadata leaves the normal loaded lookup intact', () => {
    const loader = createColdWebViewLoader(() => ({}));
    assert.equal(loader.load(() => assert.fail('must not return a candidate')), undefined);
    assert.equal(loader.reason(), 'API');
});
