// copied from beef for now

import { readFile, writeFile, readdir } from "fs/promises";
import { createHash } from "crypto";
import { rollup } from "rollup";
import esbuildPlugin from "rollup-plugin-esbuild";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import * as esbuild from "esbuild";

const available = await readdir("./plugins");
const requested = process.argv.slice(2);
for (const name of requested) {
  if (!available.includes(name)) throw new Error(`Unknown plugin: ${name}`);
}

for (let plug of requested.length ? requested : available) {
  const manifest = JSON.parse(await readFile(`./plugins/${plug}/manifest.json`));
  const outPath = `./dist/${plug}/index.js`;

  try {
    const bundle = await rollup({
      input: `./plugins/${plug}/${manifest.main}`,
      external: (id) => id.startsWith("@vendetta/") || id === "@vendetta" || id === "react",
      onwarn: () => {},
      plugins: [
        nodeResolve(),
        commonjs(),
        esbuildPlugin({
          target: plug === "message-logger" ? "es2018" : "esnext",
          minify: true,
        }),
        {
          async load(id) {
            const info = this.getModuleInfo(id);
            if (info.assertions.type === "raw") {
              let text = await readFile(id, "utf-8");
              const minified = await esbuild.transform(text, {
                minify: true,
                loader: id.split(".").at(-1)
              }).then((res) => res.code.trim());

              return `export default ${JSON.stringify(minified)};`
            }
          }
        }
      ],
    });

    await bundle.write({
      file: outPath,
      globals(id) {
        if (id.startsWith("@vendetta")) return id.substring(1).replace(/\//g, ".");
        const map = {
          react: "window.React",
        };

        return map[id] || null;
      },
      format: "iife",
      compact: true,
      exports: "named",
      banner: plug === "message-logger" ? "/*! Message Logger for Revenge. GPL-3.0-or-later. Includes BSD-3-Clause code by redstonekasi; see NOTICE. Source: https://github.com/Fluttershy2008-mlp/lol/tree/main/vendetta-plugins/plugins/message-logger */" : undefined,
    });
    await bundle.close();

    const toHash = await readFile(outPath);
    manifest.hash = createHash("sha256").update(toHash).digest("hex");
    manifest.main = "index.js";
    await writeFile(`./dist/${plug}/manifest.json`, JSON.stringify(manifest));
    await writeFile(`./dist/${plug}/LICENSE`, await readFile(plug === "message-logger" ? `./plugins/${plug}/LICENSE` : "LICENSE"));
    if (plug === "message-logger") {
      await writeFile(`./dist/${plug}/NOTICE`, await readFile(`./plugins/${plug}/NOTICE`));
    }

    console.log(`Successfully built ${manifest.name}!`);
  } catch (e) {
    console.error("Failed to build plugin...", e);
    process.exit(1);
  }
}
