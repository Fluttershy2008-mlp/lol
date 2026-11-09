'use strict';
const { test } = require('node:test');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('Translate provider, outgoing, native menu and composer regressions', () => {
    const directory = path.resolve(__dirname, '../plugins/translate-message/test');
    execFileSync(process.execPath, ['--test', ...['core', 'integration', 'port'].map(name => path.join(directory, name + '.test.cjs'))], {
        env: { ...process.env,
            NODE_PATH: [path.resolve(__dirname, '../../revenge-next/node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
            VALENCED_TRANSLATE_ARCHIVE: path.resolve(__dirname, '../pool/dev.fluttershy2008.translate-message@2.0.4.zip'),
        },
        stdio: 'pipe',
    });
});
