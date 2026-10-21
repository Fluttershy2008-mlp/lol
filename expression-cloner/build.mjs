import { readFileSync, writeFileSync } from 'node:fs';
import { updateBundle } from '../compatibility/update-bundle.mjs';
const root = new URL('.', import.meta.url);
writeFileSync(new URL('index.js', root), readFileSync(new URL('src/plugin.js', root)));
updateBundle(root);
