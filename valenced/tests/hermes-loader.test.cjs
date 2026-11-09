'use strict';
process.env.PLUGIN_TEST_TARGET = 'valenced';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { execFileSync } = require('node:child_process');
const { transformSync } = require('@babel/core');
const { createWorld } = require('../../revenge-next/tests/next-harness.cjs');
const { installChatButtonsHost } = require('./chat-buttons-fixture.cjs');
const root = path.resolve(__dirname, '..');

// Model Hermes's function-scoped bindings, without fixing captured loop variables.
// This deliberately differs from transform-block-scoping, which creates closures
// to preserve the original JavaScript semantics before the code reaches Hermes.
function hermesScopes(script) {
    return transformSync(script, { babelrc: false, configFile: false, sourceType: 'script',
        plugins: [() => ({ visitor: { VariableDeclaration(p) { p.node.kind = 'var'; } } })],
    }).code;
}
function realLoader(api) {
    const source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, 'vendor/valenced-plugin-loader/script.ts'), 'utf8'))
        .replace(/import\s*\{\s*pUnscopedApi\s*\}\s*from\s*['"]\.\.\/apis['"];?/, '')
        .replace(/export\s+(?=function)/g, '');
    return new Function('pUnscopedApi', source + '\nreturn createOptionsFactory;')(api);
}

function api() { const world = createWorld(); installChatButtonsHost(world); return world.U; }

test('regression fixture reproduces the 1.0.7 options error with Hermes loop bindings', () => {
    const archive = path.join(root, 'pool/mlemception.chatbuttons@1.0.7.zip');
    const legacyScript = execFileSync('python3', ['-c',
        'import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read("index.js").decode())', archive], { encoding: 'utf8' });
    assert.equal(typeof realLoader(api())('regression-node', legacyScript)(), 'object');
    assert.throws(() => realLoader(api())('regression', hermesScopes(legacyScript))(), /Plugin options must be an object/);
});

test('every current catalogue package passes the actual options resolver with Hermes bindings', () => {
    const factory = realLoader(api());
    for (const slug of fs.readdirSync(path.join(root, '.build/plugins'))) {
        const script = fs.readFileSync(path.join(root, '.build/plugins', slug, 'index.js'), 'utf8');
        const options = factory(slug, hermesScopes(script))();
        assert.equal(typeof options, 'object', slug);
        assert.ok(options.start || options.preInit, slug + ' has a lifecycle');
    }
});

test('every catalogue options object resolves before React and Discord APIs initialize', () => {
    const coldApi = new Proxy({}, { get(_target, key) { throw Error('API is not initialized: ' + String(key)); } });
    const factory = realLoader(coldApi);
    for (const slug of fs.readdirSync(path.join(root, '.build/plugins'))) {
        const script = fs.readFileSync(path.join(root, '.build/plugins', slug, 'index.js'), 'utf8');
        assert.equal(typeof factory(slug, hermesScopes(script))(), 'object', slug);
    }
});

test('Chat Buttons bundle contains no unlowered block bindings or aliased default export', () => {
    const script = fs.readFileSync(path.join(root, 'plugins/chat-buttons/index.js'), 'utf8');
    let blockBindings = 0;
    transformSync(script, { babelrc: false, configFile: false, sourceType: 'script',
        plugins: [() => ({ visitor: { VariableDeclaration(p) { if (p.node.kind !== 'var') blockBindings++; } } })],
    });
    assert.equal(blockBindings, 0);
    const resolve = new Function('valenced', 'plugin', 'return ' + hermesScopes(script));
    const exports = resolve(api(), options => options);
    assert.equal(Object.getOwnPropertyDescriptor(exports, 'default').get, undefined);
    assert.equal(typeof exports.default.start, 'function');
});
