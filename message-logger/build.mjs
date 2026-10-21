import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
execFileSync(process.execPath, ['build.mjs', 'message-logger'], {
    cwd: fileURLToPath(new URL('vendetta-plugins/', root)), stdio: 'inherit',
});
for (const alias of ['message-logger', 'message-logger-v2']) {
    const compiled = JSON.parse(readFileSync(new URL('vendetta-plugins/dist/message-logger/manifest.json', root), 'utf8'));
    const manifestURL = new URL(alias + '/manifest.json', root);
    const manifest = JSON.parse(readFileSync(manifestURL, 'utf8'));
    Object.assign(manifest, { version: compiled.version, main: compiled.main, hash: compiled.hash });
    writeFileSync(new URL(alias + '/index.js', root), readFileSync(new URL('vendetta-plugins/dist/message-logger/index.js', root)));
    writeFileSync(manifestURL, JSON.stringify(manifest, null, 2) + '\n');
}
