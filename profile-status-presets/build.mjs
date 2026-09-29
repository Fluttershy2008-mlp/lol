import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('.', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const modules = ['presets', 'discord', 'controller', 'settings', 'shortcut', 'plugin'];
const sources = modules.map(name => {
  const source = readFileSync(new URL(`src/${name}.js`, root), 'utf8')
    .replace(/^import \{[^\n]+\} from '\.\/[a-z-]+\.js';\n/gm, '')
    .replace(/^export (?=(function|const) )/gm, '');
  if (/^\s*(import|export)\b/m.test(source)) throw new Error(`Unsupported module syntax in ${name}`);
  return source;
}).join('\n');
const bundle = `(() => {\n/*! Profile Status Presets for Revenge ${manifest.version}
 * Copyright (c) 2026 Fluttershy2008-mlp. SPDX-License-Identifier: GPL-3.0-or-later
 * https://github.com/Fluttershy2008-mlp/lol/tree/main/profile-status-presets
 */\n'use strict';\n${sources}\nreturn createPlugin(vendetta);\n})()\n`;
new vm.Script(`vendetta => { return ${bundle} }`);
writeFileSync(new URL('index.js', root), bundle);
manifest.hash = createHash('sha256').update(bundle).digest('hex');
writeFileSync(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built Profile Status Presets ${manifest.version}: ${Buffer.byteLength(bundle)} bytes`);
