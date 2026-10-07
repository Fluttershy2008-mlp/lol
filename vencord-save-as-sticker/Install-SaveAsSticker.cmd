@echo off
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
// SPDX-License-Identifier: GPL-3.0-or-later
// Windows installer for the existing Vencord source checkout.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const RELEASE = {
  "version": "1.0.0",
  "commit": "6fabf77ceeebc4e1e0f83331921f4724854eac8a",
  "files": {
    "LICENSE": "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986",
    "NOTICE.txt": "c743639dbb7302926ce8e913b90583efa667d0fa6df892c211fd7f654df66ede",
    "README.md": "60fe634b74c956a8e6b89b6a1597ceec7fad95a716b566fab6f4ce999f2aca44",
    "THIRD_PARTY_LICENSES.txt": "f6d2684d48840092cb2d976dfd2a25c9c1982e8dbada680eed766994bdc6fd89",
    "gif.d.ts": "fc0d08cbd5b789fb2db2ecead8789ab47eeacdfad0e0a7efcde9cf6b3634c698",
    "gif.js": "4f036fb5e1b50dfb9d8a5fb8a6358605a1345b4472737b7be6837987f16532a5",
    "index.tsx": "8b96529c88eb847e74b8260e442aa41f1f62d7dfbc2eb49cdb4480f16a672cd8",
    "media.ts": "566fcbcd1bfb7533697ecd4e5326104ffe92dcbd65fa7cfc478141b0d1c5f6d9",
    "styles.css": "e5c14b83e5163488a93a5619d50943612f1ee8eda67d6a5f4ffd0655badcee95",
    "upload.ts": "5d997049df7524ad0b9d42cef0641870106506b5151a4731c4bbf9800d1e09f3"
  }
};

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const exists = file => fs.existsSync(file);
const normalizeText = bytes => bytes.toString("utf8").replace(/\r\n/g, "\n");

function isVencordRoot(directory) {
    if (!directory) return false;
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
        return pkg.name === "vencord" && exists(path.join(directory, "src", "Vencord.ts"))
            && exists(path.join(directory, "scripts", "build", "build.mjs"))
            && exists(path.join(directory, "scripts", "runInstaller.mjs"))
            && exists(path.join(directory, "pnpm-lock.yaml"));
    } catch { return false; }
}

function findRoot({ specified, cwd = process.cwd(), selfDir = __dirname, profile = os.homedir() } = {}) {
    if (specified) {
        const selected = path.resolve(specified);
        if (isVencordRoot(selected)) return selected;
        throw new Error(`This is not a Vencord source folder: ${selected}`);
    }
    const candidates = [cwd, path.join(profile, "Vencord"), selfDir, path.dirname(selfDir),
        path.join(profile, "Documents", "Vencord"), path.join(profile, "Desktop", "Vencord"),
        path.join(profile, "Downloads", "Vencord"), path.join(profile, "Downloads", "Vencord-main")];
    const selected = candidates.find(isVencordRoot);
    if (selected) return path.resolve(selected);
    throw new Error("Could not find your Vencord source folder. Drag the folder containing src and package.json onto Install-SaveAsSticker.cmd, then let go.");
}

function releaseURL(release, name) {
    if (!/^[a-f0-9]{40}$/.test(release.commit) || !/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error("Invalid installer release manifest.");
    return `https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/${release.commit}/vencord-save-as-sticker/saveAsSticker/${name}`;
}

async function downloadRelease(stage, release = RELEASE, fetcher = fetch) {
    for (const [name, expectedHash] of Object.entries(release.files)) {
        const response = await fetcher(releaseURL(release, name), { signal: AbortSignal.timeout(45_000) });
        if (!response.ok) throw new Error(`Could not download ${name}: HTTP ${response.status}. Your existing plugin files have not been moved.`);
        if (Number(response.headers.get("content-length")) > 2 * 1024 * 1024) throw new Error(`Unexpected download size for ${name}.`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 2 * 1024 * 1024 || sha256(bytes) !== expectedHash) throw new Error(`The download of ${name} failed its checksum check. Run this installer again.`);
        fs.writeFileSync(path.join(stage, name), bytes);
    }
    const entry = fs.readFileSync(path.join(stage, "index.tsx"), "utf8");
    if (!/name:\s*["']SaveAsSticker["']/.test(entry)) throw new Error("The downloaded entry file is not SaveAsSticker.");
}

function layoutPlan(root, stage, release = RELEASE) {
    const moves = [];
    const knownFolders = new Set(["saveassticker", "saveassticker-vencord"]);
    const knownArchives = new Set(["saveassticker-vencord.zip", "saveassticker.zip"]);
    for (const directory of ["plugins", "userplugins"]) {
        const parent = path.join(root, "src", directory);
        if (!exists(parent)) continue;
        if (fs.lstatSync(parent).isSymbolicLink()) throw new Error(`The plugin directory is a symbolic link: ${parent}. This installer needs a regular source folder.`);
        for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
            const file = path.join(parent, entry.name);
            const lower = entry.name.toLowerCase();
            let ours = (entry.isDirectory() || entry.isSymbolicLink()) && knownFolders.has(lower);
            if (entry.isFile() && knownArchives.has(lower)) ours = true;
            if (entry.isFile() && Object.hasOwn(release.files, entry.name)) {
                const content = fs.readFileSync(file);
                const expected = fs.readFileSync(path.join(stage, entry.name));
                ours = normalizeText(content) === normalizeText(expected)
                    || (lower === "index.tsx" && /name:\s*["']SaveAsSticker["']/.test(content.toString("utf8")));
            }
            if (ours) moves.push(path.relative(root, file));
        }
    }
    return moves;
}

function repairLayout(root, stage, release = RELEASE, log = console.log) {
    const moves = layoutPlan(root, stage, release);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomBytes(3).toString("hex");
    const backup = path.join(root, "SaveAsSticker-Backups", stamp);
    const destination = path.join(root, "src", "userplugins", "saveAsSticker");
    const completed = [];
    let ownsDestination = false;
    fs.mkdirSync(backup, { recursive: true });
    try {
        for (const relative of moves) {
            const from = path.join(root, relative), to = path.join(backup, relative);
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.renameSync(from, to);
            completed.push(relative);
            fs.writeFileSync(path.join(backup, "moved-files.json"), JSON.stringify(completed, null, 2));
            log(`Backed up: ${relative}`);
        }
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        if (exists(destination)) throw new Error(`The destination is unexpectedly occupied: ${destination}`);
        ownsDestination = true;
        fs.cpSync(stage, destination, { recursive: true, errorOnExist: true, force: false });
        for (const [name, hash] of Object.entries(release.files)) {
            if (sha256(fs.readFileSync(path.join(destination, name))) !== hash) throw new Error(`Installed file verification failed: ${name}`);
        }
        log(`Plugin placed at: ${destination}`);
        log(`Backups: ${backup}`);
        return { backup, destination, moved: completed };
    } catch (error) {
        if (ownsDestination) fs.rmSync(destination, { recursive: true, force: true });
        for (const relative of completed.reverse()) {
            const original = path.join(root, relative);
            if (!exists(original)) fs.renameSync(path.join(backup, relative), original);
        }
        throw error;
    }
}

function commandExists(name, probe = spawnSync) {
    return probe("where.exe", [name], { stdio: "ignore", windowsHide: true }).status === 0;
}

function selectRunner(root, probe = commandExists) {
    if (probe("pnpm.cmd")) return ["pnpm.cmd"];
    if (probe("pnpm.exe")) return ["pnpm.exe"];
    if (probe("corepack.cmd")) return ["corepack.cmd", "pnpm"];
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const version = /^pnpm@(\d+\.\d+\.\d+)(?:\+.*)?$/.exec(pkg.packageManager ?? "")?.[1];
    if (version && probe("npm.cmd")) return ["npm.cmd", "exec", "--yes", `--package=pnpm@${version}`, "--", "pnpm"];
    throw new Error("pnpm could not be found. Install Node.js 22 or newer from https://nodejs.org/, reopen this installer, and try again.");
}

function packageCommand(runner, args, env = process.env) {
    const tokens = [...runner, ...args];
    if (tokens.some(token => !/^[A-Za-z0-9@._:/=+-]+$/.test(token))) throw new Error("Unsupported package-manager command.");
    // The command contains only fixed/validated tokens. All paths use cwd or env,
    // never shell interpolation. cmd.exe is required for Windows .cmd launchers.
    return { file: env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", tokens.join(" ")] };
}

function runProcess(file, args, { cwd, env = process.env, logFile } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(file, args, { cwd, env, stdio: ["inherit", "pipe", "pipe"], windowsHide: true });
        const write = (stream, chunk) => {
            stream.write(chunk);
            if (logFile) fs.appendFileSync(logFile, chunk);
        };
        child.stdout.on("data", chunk => write(process.stdout, chunk));
        child.stderr.on("data", chunk => write(process.stderr, chunk));
        child.on("error", reject);
        child.on("close", (code, signal) => {
            if (code === 0) resolve();
            else reject(new Error(`${path.basename(file)} failed (${signal || "exit code " + code}). See the error above.`));
        });
    });
}

async function buildAndPatch(root, runner, { run = runProcess, log = console.log, logFile, env = process.env } = {}) {
    const childEnv = { ...env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" };
    for (const args of [["install", "--frozen-lockfile"], ["build"]]) {
        log(`\nRunning: pnpm ${args.join(" ")}`);
        const command = packageCommand(runner, args, childEnv);
        await run(command.file, command.args, { cwd: root, env: childEnv, logFile });
    }
    const renderer = path.join(root, "dist", "renderer.js");
    if (!exists(renderer) || !fs.readFileSync(renderer, "utf8").includes("SaveAsSticker")) throw new Error("The build did not include SaveAsSticker. Discord has not been patched.");
    log("\nDownloading/opening Vencord's official installer...");
    // Let Vencord download its official CLI, then invoke it directly so its real
    // failure exit code is respected. runInstaller.mjs currently swallows it.
    await run(process.execPath, [path.join(root, "scripts", "runInstaller.mjs"), "--", "--version"], { cwd: root, env: childEnv, logFile });
    const installer = path.join(root, "dist", "Installer", "VencordInstallerCli.exe");
    if (!exists(installer)) throw new Error("Vencord's official installer could not be downloaded. Your corrected plugin folder and build are ready; rerun this file to try again.");
    log("\nInstalling into Discord automatically. Discord may close during this step.");
    await run(installer, ["--install", "--branch", "auto"], {
        cwd: root, logFile,
        env: { ...childEnv, VENCORD_USER_DATA_DIR: root, VENCORD_DEV_INSTALL: "1" }
    });
}

function acquireLock(root) {
    const file = path.join(root, "SaveAsSticker-Install.lock");
    if (exists(file)) {
        const pid = Number(fs.readFileSync(file, "utf8").trim());
        let running = false;
        if (Number.isSafeInteger(pid) && pid > 0) {
            try { process.kill(pid, 0); running = true; } catch (error) { running = error.code !== "ESRCH"; }
        }
        if (running) throw new Error("Another SaveAsSticker installer is already running. Wait for its window to finish.");
        fs.unlinkSync(file);
    }
    fs.writeFileSync(file, String(process.pid), { flag: "wx" });
    return () => fs.rmSync(file, { force: true });
}

async function main() {
    if (process.platform !== "win32") throw new Error("This installer is for Windows.");
    if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Please install Node.js 22 or newer from https://nodejs.org/, then run this file again.");
    const root = findRoot({ specified: process.env.SAS_VENCORD_ARG || process.argv[2], selfDir: path.dirname(process.env.SAS_INSTALLER_SELF || __filename) });
    const releaseLock = acquireLock(root);
    const logFile = path.join(root, "SaveAsSticker-install.log");
    const log = message => { console.log(message); fs.appendFileSync(logFile, message + os.EOL); };
    let stage;
    try {
        fs.writeFileSync(logFile, "SaveAsSticker installer " + new Date().toISOString() + os.EOL);
        log(`Vencord source: ${root}`);
        log("Discord may close during installation. Reopen it after this window says SUCCESS.");
        const runner = selectRunner(root);
        stage = fs.mkdtempSync(path.join(os.tmpdir(), "SaveAsSticker-stage-"));
        log("\nDownloading and checking the complete plugin...");
        await downloadRelease(stage);
        log("\nRepairing the plugin folders...");
        repairLayout(root, stage, RELEASE, log);
        await buildAndPatch(root, runner, { log, logFile });
        log("\nSUCCESS: SaveAsSticker has been built and installed into Discord.");
        log("Reopen Discord, then Settings > Vencord > Plugins > enable SaveAsSticker.");
        log(`Log saved at: ${logFile}`);
    } catch (error) {
        log(`\nSTOPPED: ${error.message}`);
        log(`Log saved at: ${logFile}`);
        throw error;
    } finally {
        if (stage) fs.rmSync(stage, { recursive: true, force: true });
        releaseLock();
    }
}

module.exports = { RELEASE, sha256, isVencordRoot, findRoot, downloadRelease, layoutPlan, repairLayout, selectRunner, packageCommand, buildAndPatch, acquireLock, main };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
