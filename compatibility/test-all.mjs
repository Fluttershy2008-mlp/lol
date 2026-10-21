import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function collect(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        if (['node_modules', '.git', 'vencord-save-as-sticker', 'dist'].includes(entry.name)) return [];
        const path = directory + '/' + entry.name;
        return entry.isDirectory() ? collect(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
    });
}
execFileSync(process.execPath, ['--test', ...collect(root)], { cwd: root, stdio: 'inherit' });
