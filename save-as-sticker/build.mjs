import { build } from 'esbuild';
import { transformSync } from '@babel/core';
import transformBlockScoping from '@babel/plugin-transform-block-scoping';
import { readFileSync, writeFileSync } from 'node:fs';
const result = await build({
  entryPoints: [new URL('./src/plugin.js', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2020',
  minify: true, legalComments: 'inline',
  plugins: [{ name: 'private-image-text-codecs', setup(builder) {
    builder.onLoad({ filter: /\/(?:iobuffer\/lib\/text|fast-png\/lib\/helpers\/text)\.js$/ }, ({ path }) => ({
      contents: 'import { ImageTextEncoder as TextEncoder, ImageTextDecoder as TextDecoder } from '
        + JSON.stringify(new URL('./src/image-text.mjs', import.meta.url).pathname) + ';\n' + readFileSync(path, 'utf8'),
      loader: 'js', resolveDir: path.slice(0, path.lastIndexOf('/')),
    }));
  } }],
});
// Mobile Hermes does not implement per-iteration let/const bindings. esbuild's
// CommonJS import getters capture loop variables, so lower block scoping AFTER
// bundling (including generated helpers), without another minifier afterwards.
const compatible = transformSync(result.outputFiles[0].text, {
  babelrc: false, configFile: false, sourceType: 'script',
  plugins: [transformBlockScoping], compact: true, comments: true,
});
const licenses = readFileSync(new URL('./THIRD_PARTY_LICENSES.txt', import.meta.url), 'utf8');
const source = '(() => {\n/*!\n' + licenses.replace(/\*\//g, '* /') + '\n*/\nconst module = { exports: {} };\n'
  + compatible.code + '\nreturn module.exports.default;\n})()\n';
writeFileSync(new URL('./index.js', import.meta.url), source);
await import('./sync.mjs');

const { updateBundle } = await import('../compatibility/update-bundle.mjs');
updateBundle(new URL('.', import.meta.url));
