'use strict';
const { test } = require('node:test');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Translate provider, outgoing, native menu and composer regressions', () => {
    const directory = path.resolve(__dirname, '../plugins/translate-message/test');
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, '../manifest.json')));
    const env = { ...process.env,
        NODE_PATH: [path.resolve(__dirname, '../../revenge-next/node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
        VALENCED_TRANSLATE_ARCHIVE: path.resolve(__dirname, `../pool/${manifest.id}@${manifest.version}.zip`),
    };
    // A child launched with the parent's worker context can exit without running its tests.
    delete env.NODE_TEST_CONTEXT;
    const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', ...['core', 'integration', 'port'].map(name => path.join(directory, name + '.test.cjs'))], {
        env,
        stdio: 'pipe',
    }).toString();
    assert.match(output, /# tests [1-9]\d+/);
    assert.match(output, /# fail 0/);
});
