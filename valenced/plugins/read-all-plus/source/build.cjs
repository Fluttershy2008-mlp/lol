"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createReadAllEngine } = require("./core.cjs");
const { createReadAllPlugin } = require("./plugin.cjs");

// Valenced evaluates `return <script>` and expects an object with a default export.
// The functions are self-contained: no Node modules or network-loaded code are included.
const output = `(${createReadAllPlugin.toString()})(valenced, plugin, (${createReadAllEngine.toString()}))\n`;
new Function("valenced", "plugin", `return ${output}`);
fs.writeFileSync(path.resolve(__dirname, "../index.js"), output, "utf8");
console.log(`Built index.js (${Buffer.byteLength(output)} bytes).`);
