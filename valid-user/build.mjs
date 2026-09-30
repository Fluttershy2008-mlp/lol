import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const here = new URL("./", import.meta.url);
const core = (await readFile(new URL("src/core.mjs", here), "utf8")).replace(/^export /gm, "");
const auto = (await readFile(new URL("src/auto.mjs", here), "utf8")).replace(/^export /gm, "");
const plugin = (await readFile(new URL("src/plugin.mjs", here), "utf8"))
    .replace(/^import .* from "\.\/(?:core|auto).mjs";\n/gm, "").replace("export default function", "function");
const bundle = `(() => {\n\"use strict\";\n${core}\n${auto}\n${plugin}\nreturn createPlugin(vendetta);\n})()\n`;
await writeFile(new URL("index.js", here), bundle);
const manifest = JSON.parse(await readFile(new URL("manifest.base.json", here), "utf8"));
manifest.hash = createHash("sha256").update(bundle).digest("hex");
await writeFile(new URL("manifest.json", here), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Built ${manifest.name} ${manifest.version} (${Buffer.byteLength(bundle)} bytes).`);
