import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL(".", import.meta.url)));
const manifest = JSON.parse(readFileSync("installer/release.json", "utf8"));
for (const [name, hash] of Object.entries(manifest.files)) {
    const actual = createHash("sha256").update(readFileSync(`saveAsSticker/${name}`)).digest("hex");
    if (actual !== hash) throw new Error(`Release manifest must be updated after publishing changed plugin bytes: ${name}`);
}
const script = readFileSync("installer/main.cjs", "utf8").replace('const RELEASE = require("./release.json");', `const RELEASE = ${JSON.stringify(manifest, null, 2)};`);
const launcher = `@echo off
setlocal EnableExtensions DisableDelayedExpansion
title SaveAsSticker for Vencord - Automatic Installer
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js could not be found. Install Node.js 22 or newer from https://nodejs.org/
  echo Then close this window and run this installer again.
  pause
  exit /b 1
)
set "SAS_INSTALLER_SELF=%~f0"
set "SAS_VENCORD_ARG=%~1"
node.exe -e "const fs=require('node:fs'),p=require('node:path'),f=process.env.SAS_INSTALLER_SELF,s=fs.readFileSync(f,'utf8'),tag='// __SAS_NODE_PAYLOAD__',i=s.lastIndexOf(tag),m={exports:{}};if(i<0)throw Error('Installer is incomplete');new Function('require','module','__filename','__dirname',s.slice(i+tag.length))(require,m,f,p.dirname(f));m.exports.main().catch(e=>{console.error(e.message);process.exitCode=1;});"
set "SAS_EXIT_CODE=%errorlevel%"
echo.
if not "%SAS_EXIT_CODE%"=="0" echo Installation stopped. Copy the error above or send SaveAsSticker-install.log for help.
pause
exit /b %SAS_EXIT_CODE%
// __SAS_NODE_PAYLOAD__
`;
writeFileSync("Install-SaveAsSticker.cmd", (launcher + script).replace(/\r?\n/g, "\r\n"));
console.log("Created Install-SaveAsSticker.cmd");
