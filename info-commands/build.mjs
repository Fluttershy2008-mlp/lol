import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
const root = new URL("./", import.meta.url);
const result = await build({
  entryPoints: [fileURLToPath(new URL("src/plugin.js", root))],
  bundle: true, write: false, format: "iife", globalName: "InfoCommandsBundle",
  target: "es2020", charset: "utf8", jsxFactory: "runtime.react.React.createElement",
  jsxFragment: "runtime.react.React.Fragment", legalComments: "inline",
});
const bundle = `(() => {\n${result.outputFiles[0].text}\nreturn InfoCommandsBundle.default;\n})()\n`;
new vm.Script(bundle);
const manifest = JSON.parse(await readFile(new URL("manifest.base.json", root), "utf8"));
manifest.hash = createHash("sha256").update(bundle).digest("hex");
await writeFile(new URL("index.js", root), bundle);
await writeFile(new URL("manifest.json", root), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Built ${manifest.name} ${manifest.version}: ${Buffer.byteLength(bundle)} bytes`);
