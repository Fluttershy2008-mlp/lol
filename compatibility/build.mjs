import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const runtime = readFileSync(new URL('./runtime.js', import.meta.url), 'utf8');
export function wrapPlugin(source, name) {
    const bundle = `(() => {\n${runtime}\nreturn withRevengeCompatibility(vendetta, function(vendetta) {\nreturn ${source.trim()}\n}, ${JSON.stringify(name)});\n})()\n`;
    new vm.Script(bundle);
    return bundle;
}
