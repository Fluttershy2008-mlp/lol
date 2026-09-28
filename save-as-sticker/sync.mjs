import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// The repository-root URL is a legacy install alias; keep both entry points identical.
const code = readFileSync(new URL('./index.js', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
manifest.hash = createHash('sha256').update(code).digest('hex');
const json = JSON.stringify(manifest, null, 2) + '\n';
writeFileSync(new URL('./manifest.json', import.meta.url), json);
writeFileSync(new URL('../index.js', import.meta.url), code);
writeFileSync(new URL('../manifest.json', import.meta.url), json);
console.log('Synced SaveAsSticker ' + manifest.version + ' and its legacy install alias.');
