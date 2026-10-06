import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source = await readFile(new URL('./src/plugin.mjs', import.meta.url), 'utf8');
const bundle = `(() => {\n${source.replace('export function createPlugin', 'function createPlugin')}\nreturn createPlugin(vendetta);\n})()\n`;
const manifest = JSON.parse(await readFile(new URL('./manifest.base.json', import.meta.url), 'utf8'));
manifest.hash = createHash('sha256').update(bundle).digest('hex');
await writeFile(new URL('./index.js', import.meta.url), bundle);
await writeFile(new URL('./manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${manifest.name} ${manifest.version}`);
