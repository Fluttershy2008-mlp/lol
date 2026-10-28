import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url);
const files = ['main-protection.mjs', 'model.mjs', 'settings-shortcut.mjs', 'plugin.mjs'];
const sources = await Promise.all(files.map(file => fs.readFile(new URL(`src/${file}`, root), 'utf8')));
const code = sources.map(source => source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
const bundle = `(() => {\n'use strict';\n${code}\nreturn createPlugin(vendetta);\n})()\n`;
await fs.writeFile(new URL('index.js', root), bundle);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.base.json', root), 'utf8'));
manifest.hash = createHash('sha256').update(bundle).digest('hex');
await fs.writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${fileURLToPath(new URL('index.js', root))} (${manifest.hash})`);

const { updateBundle } = await import('../compatibility/update-bundle.mjs');
updateBundle(new URL('.', import.meta.url));
