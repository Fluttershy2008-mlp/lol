import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
const parts = [];
for (const name of ['core.mjs', 'session.mjs', 'plugin.mjs']) {
  const source = await readFile(new URL('src/' + name, root), 'utf8');
  parts.push(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''));
}
// Revenge evaluates the bundle as a JavaScript expression.
const bundle = '(() => {\n"use strict";\n' + parts.join('\n') + '\nreturn createPlugin(vendetta);\n})()\n';
new Function('vendetta', 'return ' + bundle);
await writeFile(new URL('index.js', root), bundle);
const manifest = JSON.parse(await readFile(new URL('manifest.base.json', root), 'utf8'));
manifest.hash = createHash('sha256').update(bundle).digest('hex');
await writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log('Built AutoText ' + manifest.version + ' (' + Buffer.byteLength(bundle) + ' bytes)');
