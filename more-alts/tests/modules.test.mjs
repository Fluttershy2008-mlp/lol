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
