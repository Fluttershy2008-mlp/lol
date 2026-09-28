import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('.', import.meta.url);
const manifestPath = new URL('manifest.json', root);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const result = await build({
  entryPoints: [new URL('src/plugin.js', root).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'browser',
  target: 'es2020', minify: true, legalComments: 'inline',
});
const notice = `/*! CustomRPC for Revenge v${manifest.version}
 * Adapted from Vencord CustomRPC, Copyright (c) 2023-2025 Vendicated and contributors.
 * Mobile adaptation Copyright (c) 2026 Fluttershy2008-mlp.
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Corresponding source and license: https://github.com/Fluttershy2008-mlp/lol/tree/main/custom-rpc
 */`;
// Revenge evaluates an expression with its per-plugin vendetta context in scope.
const bundle = `(() => {\n${notice}\nconst module = { exports: {} };\n${result.outputFiles[0].text}\nreturn module.exports.default;\n})()\n`;
writeFileSync(new URL('index.js', root), bundle);
manifest.hash = createHash('sha256').update(bundle).digest('hex');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built CustomRPC ${manifest.version} (${Buffer.byteLength(bundle)} bytes)`);
