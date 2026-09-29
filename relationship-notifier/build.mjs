import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('.', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
// Fixed, dependency-free module list. These modules only use named exports and
// relative imports from one another; no runtime require or external packages.
const sources = ['tracker', 'settings', 'plugin'].map(name => {
  const source = readFileSync(new URL(`src/${name}.js`, root), 'utf8')
    .replace(/^import \{[^\n]+\} from '\.\/(tracker|settings)\.js';\n/gm, '')
    .replace(/^export (?=(function|const) )/gm, '');
  if (/^\s*(import|export)\b/m.test(source)) throw new Error(`Unsupported module syntax in ${name}`);
  return source;
}).join('\n');
const banner = `/*! RelationshipNotifier for Revenge ${manifest.version}
 * Adapted from Vencord RelationshipNotifier by nick, Vendicated and contributors.
 * Mobile adaptation Copyright (c) 2026 Fluttershy2008-mlp.
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Source and license: https://github.com/Fluttershy2008-mlp/lol/tree/main/relationship-notifier
 */`;
// The loader evaluates an expression with per-plugin vendetta storage in scope.
const bundle = `(() => {\n${banner}\n'use strict';\n${sources}\nreturn createPlugin(vendetta);\n})()\n`;
new vm.Script(`vendetta => { return ${bundle} }`);
writeFileSync(new URL('index.js', root), bundle);
manifest.hash = createHash('sha256').update(bundle).digest('hex');
writeFileSync(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built RelationshipNotifier ${manifest.version}: ${Buffer.byteLength(bundle)} bytes`);
