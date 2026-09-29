import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('.', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const source = ['filter', 'collection', 'settings', 'plugin'].map(name => {
  const code = readFileSync(new URL(`src/${name}.js`, root), 'utf8')
    .replace(/^import \{[^\n]+\} from '\.\/[a-z-]+\.js';\n/gm, '')
    .replace(/^export (?=(function|const) )/gm, '');
  if (/^\s*(import|export)\b/m.test(code)) throw new Error(`Unsupported module syntax: ${name}`);
  return code;
}).join('\n');
const bundle = `(() => {\n/*! HideBlockedAndIgnoredMessages ${manifest.version}, CC0-1.0.
 * Adapted from shipwr3ckd/revengeplugin; original authors Zykrah and シグマ siguma.
 * https://github.com/Fluttershy2008-mlp/lol/tree/main/hide-blocked-and-ignored-messages
 */\n'use strict';\n${source}\nreturn createPlugin(vendetta);\n})()\n`;
new vm.Script(bundle);
writeFileSync(new URL('index.js', root), bundle);
manifest.hash = createHash('sha256').update(bundle).digest('hex');
writeFileSync(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${manifest.name} ${manifest.version}: ${Buffer.byteLength(bundle)} bytes`);
