import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL(".", import.meta.url)));
const directory = new URL("hideBlockedAndIgnoredMessages/", import.meta.url);
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = { version, files: {}, content: {} };
for (const name of readdirSync(directory).sort()) {
    const bytes = readFileSync(new URL(name, directory));
    manifest.files[name] = createHash("sha256").update(bytes).digest("hex");
    manifest.content[name] = bytes.toString("base64");
}
writeFileSync("installer/payload.json", JSON.stringify(manifest, null, 2) + "\n");
const script = readFileSync("installer/main.cjs", "utf8").replace('const RELEASE = require("./payload.json");', `const RELEASE = ${JSON.stringify(manifest)};`);
const launcher = `@echo off
setlocal EnableExtensions DisableDelayedExpansion
title HideBlockedAndIgnoredMessages for Vencord - Automatic Installer
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js could not be found. Install Node.js 22 or newer from https://nodejs.org/
  echo Then close this window and run this installer again.
  pause
  exit /b 1
)
set "HBIM_INSTALLER_SELF=%~f0"
set "HBIM_VENCORD_ARG=%~1"
node.exe -e "const fs=require('node:fs'),p=require('node:path'),f=process.env.HBIM_INSTALLER_SELF,s=fs.readFileSync(f,'utf8'),tag='// __HBIM_NODE_PAYLOAD__',i=s.lastIndexOf(tag),m={exports:{}};if(i<0)throw Error('Installer is incomplete');new Function('require','module','__filename','__dirname',s.slice(i+tag.length))(require,m,f,p.dirname(f));m.exports.main().catch(e=>{console.error(e.message);process.exitCode=1;});"
set "HBIM_EXIT_CODE=%errorlevel%"
echo.
if not "%HBIM_EXIT_CODE%"=="0" echo Installation stopped. Copy the error above or send HideBlockedAndIgnoredMessages-install.log for help.
pause
exit /b %HBIM_EXIT_CODE%
// __HBIM_NODE_PAYLOAD__
`;
writeFileSync("Install-HideBlockedAndIgnoredMessages.cmd", (launcher + script).replace(/\r?\n/g, "\r\n"));
console.log("Created Install-HideBlockedAndIgnoredMessages.cmd");

