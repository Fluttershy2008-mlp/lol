import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const manifestURL = new URL('./manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestURL, 'utf8'));
manifest.hash = createHash('sha256').update(readFileSync(new URL('./index.js', import.meta.url))).digest('hex');
writeFileSync(manifestURL, JSON.stringify(manifest, null, 2) + '\n');
