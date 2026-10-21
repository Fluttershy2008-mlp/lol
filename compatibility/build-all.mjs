import { readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of readdirSync(root).sort()) {
    if (name === 'compatibility' || name === 'vendetta-plugins' || name === 'vencord-save-as-sticker') continue;
    const script = root + name + '/build.mjs';
    if (existsSync(script)) execFileSync(process.execPath, [script], { cwd: root + name, stdio: 'inherit' });
}
