import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
const core = (await readFile('src/core.mjs', 'utf8')).replace('export function createCore', 'function createCore');
const uploads = (await readFile('../compatibility/expression-upload.mjs', 'utf8')).replace(/^export /gm, '');
const panels = (await readFile('../compatibility/expression-panel.mjs', 'utf8')).replace(/^export /gm, '');
const pages = (await readFile('src/page.mjs', 'utf8')).replace(/^export /gm, '');
const plugin = (await readFile('src/plugin.mjs', 'utf8'))
  .replace("import { createCore } from './core.mjs';", '')
  .replace("import { createExpressionUpload } from '../../compatibility/expression-upload.mjs';", '')
  .replace("import { createExpressionPanel } from '../../compatibility/expression-panel.mjs';", '')
  .replace("import { createPickerPage } from './page.mjs';", '')
  .replace('export function createPlugin', 'function createPlugin');
const bundle = `(() => {\n'use strict';\n${uploads}\n${panels}\n${pages}\n${core}\n${plugin}\nreturn createPlugin(vendetta);\n})()\n`;
new vm.Script(bundle);
await writeFile('index.js', bundle);
const manifest = JSON.parse(await readFile('manifest.base.json', 'utf8'));
manifest.hash = createHash('sha256').update(bundle).digest('hex');
await writeFile('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Built Stealmoji ' + manifest.version + ' (' + Buffer.byteLength(bundle) + ' bytes)');

const { updateBundle } = await import('../compatibility/update-bundle.mjs');
updateBundle(new URL('.', import.meta.url));
