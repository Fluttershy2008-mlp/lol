import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { wrapPlugin } from './build.mjs';

export function updateBundle(root) {
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
    const source = readFileSync(new URL('index.js', root), 'utf8');
    const bundle = source.includes('function withRevengeCompatibility(api, factory, pluginName)')
        ? source : wrapPlugin(source, manifest.name);
    manifest.hash = createHash('sha256').update(bundle).digest('hex');
    writeFileSync(new URL('index.js', root), bundle);
    writeFileSync(new URL(manifest.main || 'index.js', root), bundle);
    writeFileSync(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
    if (root.pathname.endsWith('/save-as-sticker/')) {
        writeFileSync(new URL('../index.js', root), bundle);
        writeFileSync(new URL('../manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
    }
    console.log('Compatibility guard: ' + manifest.name + ' ' + manifest.version);
}
