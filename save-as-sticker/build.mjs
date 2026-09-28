import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
const result = await build({
  entryPoints: [new URL('./src/plugin.js', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2020',
  minify: true, legalComments: 'inline',
});
const licenses = readFileSync(new URL('./THIRD_PARTY_LICENSES.txt', import.meta.url), 'utf8');
const source = '(() => {\n/*!\n' + licenses.replace(/\*\//g, '* /') + '\n*/\nconst module = { exports: {} };\n'
  + result.outputFiles[0].text + '\nreturn module.exports.default;\n})()\n';
writeFileSync(new URL('./index.js', import.meta.url), source);
await import('./sync.mjs');
