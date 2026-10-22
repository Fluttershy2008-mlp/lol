import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source = readFileSync(new URL('index.js', import.meta.url));
const file = new URL('manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(file, 'utf8'));
manifest.hash = createHash('sha256').update(source).digest('hex');
writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
console.log('Updated plugin manifest hash:', manifest.hash);
