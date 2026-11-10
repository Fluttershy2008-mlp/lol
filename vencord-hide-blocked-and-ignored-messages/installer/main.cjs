// SPDX-License-Identifier: GPL-3.0-or-later
// Windows installer for the existing Vencord source checkout.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const RELEASE = require("./payload.json");

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
    throw new Error("Could not find your Vencord source folder. Drag the folder containing src and package.json onto Install-HideBlockedAndIgnoredMessages.cmd, then let go.");
}

async function downloadRelease(stage, release = RELEASE) {
    for (const [name, expectedHash] of Object.entries(release.files)) {
        if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error("Unsafe embedded file path.");
        const bytes = Buffer.from(release.content[name] ?? "", "base64");
        if (!bytes.length || sha256(bytes) !== expectedHash) throw new Error(`The embedded ${name} failed checksum validation. Download the CMD again.`);
        fs.writeFileSync(path.join(stage, name), bytes);
    }
    if (!/name:\s*["']HideBlockedAndIgnoredMessages["']/.test(fs.readFileSync(path.join(stage, "index.tsx"), "utf8")))
        throw new Error("The embedded entry file is invalid.");
}

function layoutPlan(root, stage, release = RELEASE) {
    const moves = [];
    const knownFolders = new Set(["hideblockedandignoredmessages", "hideblockedandignoredmessages-vencord"]);
    const knownArchives = new Set(["hideblockedandignoredmessages-vencord.zip", "hideblockedandignoredmessages.zip"]);
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
                    || (release.previousFiles?.[entry.name] ?? []).includes(sha256(normalizeText(content)))
                    || (lower === "index.tsx" && /name:\s*["']HideBlockedAndIgnoredMessages["']/.test(content.toString("utf8")));
            }
            if (ours) moves.push(path.relative(root, file));
        }
    }
    return moves;
}

function repairLayout(root, stage, release = RELEASE, log = console.log) {
    const moves = layoutPlan(root, stage, release);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomBytes(3).toString("hex");
    const backup = path.join(root, "HideBlockedAndIgnoredMessages-Backups", stamp);
    const destination = path.join(root, "src", "userplugins", "hideBlockedAndIgnoredMessages");
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
    for (const args of [["install", "--frozen-lockfile"], ["build", "--dev"]]) {
        log(`\nRunning: pnpm ${args.join(" ")}`);
        const command = packageCommand(runner, args, childEnv);
        await run(command.file, command.args, { cwd: root, env: childEnv, logFile });
    }
    const renderer = path.join(root, "dist", "renderer.js");
    if (!exists(renderer) || !fs.readFileSync(renderer, "utf8").includes("HideBlockedAndIgnoredMessages")) throw new Error("The build did not include HideBlockedAndIgnoredMessages. Discord has not been patched.");
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
    const file = path.join(root, "HideBlockedAndIgnoredMessages-Install.lock");
    if (exists(file)) {
        const pid = Number(fs.readFileSync(file, "utf8").trim());
        let running = false;
        if (Number.isSafeInteger(pid) && pid > 0) {
            try { process.kill(pid, 0); running = true; } catch (error) { running = error.code !== "ESRCH"; }
        }
        if (running) throw new Error("Another HideBlockedAndIgnoredMessages installer is already running. Wait for its window to finish.");
        fs.unlinkSync(file);
    }
    fs.writeFileSync(file, String(process.pid), { flag: "wx" });
    return () => fs.rmSync(file, { force: true });
}

async function main() {
    if (process.platform !== "win32") throw new Error("This installer is for Windows.");
    if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Please install Node.js 22 or newer from https://nodejs.org/, then run this file again.");
    const root = findRoot({ specified: process.env.HBIM_VENCORD_ARG || process.argv[2], selfDir: path.dirname(process.env.HBIM_INSTALLER_SELF || __filename) });
    const releaseLock = acquireLock(root);
    const logFile = path.join(root, "HideBlockedAndIgnoredMessages-install.log");
    const log = message => { console.log(message); fs.appendFileSync(logFile, message + os.EOL); };
    let stage;
    try {
        fs.writeFileSync(logFile, "HideBlockedAndIgnoredMessages installer " + new Date().toISOString() + os.EOL);
        log(`Vencord source: ${root}`);
        log("Discord may close during installation. Reopen it after this window says SUCCESS.");
        const runner = selectRunner(root);
        stage = fs.mkdtempSync(path.join(os.tmpdir(), "HideBlockedAndIgnoredMessages-stage-"));
        log("\nChecking the included plugin files...");
        await downloadRelease(stage);
        log("\nRepairing the plugin folders...");
        repairLayout(root, stage, RELEASE, log);
        await buildAndPatch(root, runner, { log, logFile });
        log("\nSUCCESS: HideBlockedAndIgnoredMessages has been built and installed into Discord.");
        log("Reopen Discord, then Settings > Vencord > Plugins > enable HideBlockedAndIgnoredMessages.");
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
