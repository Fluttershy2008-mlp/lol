import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sources = await Promise.all(['model', 'apps', 'collection', 'settings-shortcut', 'plugin'].map(name => readFile(new URL(`./src/${name}.mjs`, import.meta.url), 'utf8')));
const profiles = await readFile(new URL('../compatibility/user-profile.mjs', import.meta.url), 'utf8');
const code = [profiles, ...sources].map(source => source
  .replace(/^import \{[^\n]+\} from '\.\/[a-z-]+\.mjs';\n/gm, '')
  .replace(/^import \{ openUserProfile \} from '\.\.\/\.\.\/compatibility\/user-profile\.mjs';\n/gm, '')
  .replace(/^export /gm, '')).join('\n');
const bundle = `(() => {\n${code}\nreturn createPlugin(vendetta);\n})()\n`;
// Verify the same expression-style bundle consumed by Revenge’s loader.
new Function('vendetta', `return ${bundle}`);
const manifest = JSON.parse(await readFile(new URL('./manifest.base.json', import.meta.url), 'utf8'));
manifest.hash = createHash('sha256').update(bundle).digest('hex');
await writeFile(new URL('./index.js', import.meta.url), bundle);
await writeFile(new URL('./manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${manifest.name} ${manifest.version}`);

const { updateBundle } = await import('../compatibility/update-bundle.mjs');
updateBundle(new URL('.', import.meta.url));
