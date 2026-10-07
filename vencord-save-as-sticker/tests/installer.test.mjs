import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import installer from "../installer/main.cjs";

const { RELEASE, findRoot, isVencordRoot, downloadRelease, repairLayout, selectRunner, packageCommand, buildAndPatch, acquireLock } = installer;
const releaseDir = fileURLToPath(new URL("../saveAsSticker/", import.meta.url));
const create = (file, text = "") => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
function fixture(t) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "sas-installer-test-"));
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
    const root = path.join(parent, "User & Test", "Vencord");
    create(path.join(root, "package.json"), JSON.stringify({ name: "vencord", packageManager: "pnpm@11.9.0" }));
    for (const name of ["src/Vencord.ts", "scripts/build/build.mjs", "scripts/runInstaller.mjs", "pnpm-lock.yaml"]) create(path.join(root, name));
    return { parent, root };
}

test("installer locates the existing source checkout and honors an explicit folder", t => {
    const { root, parent } = fixture(t);
    assert.equal(isVencordRoot(root), true);
    assert.equal(findRoot({ cwd: parent, selfDir: parent, profile: path.dirname(root) }), root);
    assert.equal(findRoot({ specified: root }), root);
    assert.throws(() => findRoot({ specified: path.join(root, "src") }), /not a Vencord source folder/);
});

test("repairs the screenshot layout and both duplicate wrapper folders; preserves unrelated files", t => {
    const { root } = fixture(t);
    const user = path.join(root, "src", "userplugins");
    fs.mkdirSync(user, { recursive: true });
    for (const name of Object.keys(RELEASE.files)) fs.copyFileSync(path.join(releaseDir, name), path.join(user, name));
    // Windows/Git may normalize line endings. These are still our loose files.
    create(path.join(user, "media.ts"), fs.readFileSync(path.join(user, "media.ts"), "utf8").replace(/\r?\n/g, "\r\n"));
    create(path.join(user, "SaveAsSticker-Vencord", "saveAsSticker", "index.tsx"), "old nested plugin");
    create(path.join(root, "src", "plugins", "SaveAsSticker-Vencord", "saveAsSticker", "index.tsx"), "second nested copy");
    create(path.join(root, "src", "plugins", "README.md"), "Keep this unrelated upstream README.");
    create(path.join(user, "otherPlugin", "index.tsx"), "Another user's plugin");
    create(path.join(root, "src", "plugins", "index.ts"), "Upstream index");
    const result = repairLayout(root, releaseDir, RELEASE, () => {});
    assert.equal(result.moved.length, Object.keys(RELEASE.files).length + 2);
    assert.equal(fs.existsSync(path.join(user, "index.tsx")), false);
    assert.equal(fs.existsSync(path.join(user, "SaveAsSticker-Vencord")), false);
    for (const name of Object.keys(RELEASE.files)) {
        assert.deepEqual(fs.readFileSync(path.join(result.destination, name)), fs.readFileSync(path.join(releaseDir, name)));
        assert.ok(fs.existsSync(path.join(result.backup, "src", "userplugins", name)));
    }
    assert.equal(fs.readFileSync(path.join(root, "src", "plugins", "README.md"), "utf8"), "Keep this unrelated upstream README.");
    assert.equal(fs.readFileSync(path.join(user, "otherPlugin", "index.tsx"), "utf8"), "Another user's plugin");
    assert.equal(fs.readFileSync(path.join(root, "src", "plugins", "index.ts"), "utf8"), "Upstream index");
});

test("re-running keeps one plugin folder and backs up the previous installation", t => {
    const { root } = fixture(t);
    const first = repairLayout(root, releaseDir, RELEASE, () => {});
    const second = repairLayout(root, releaseDir, RELEASE, () => {});
    assert.notEqual(first.backup, second.backup);
    assert.deepEqual(second.moved, [path.join("src", "userplugins", "saveAsSticker")]);
    assert.deepEqual(fs.readdirSync(path.join(root, "src", "userplugins")), ["saveAsSticker"]);
    assert.ok(fs.existsSync(path.join(second.backup, "src", "userplugins", "saveAsSticker", "index.tsx")));
});

test("upgrade repairs recognized older loose files while preserving an unrelated file of the same name", t => {
    const { root } = fixture(t);
    const old = "// previous plugin dependency\nexport const oldVersion = true;\n";
    const hash = createHash("sha256").update(old).digest("hex");
    const release = { ...RELEASE, previousFiles: { "media.ts": [hash] } };
    create(path.join(root, "src", "userplugins", "media.ts"), old.replace(/\n/g, "\r\n"));
    create(path.join(root, "src", "plugins", "media.ts"), "unrelated file");
    const result = repairLayout(root, releaseDir, release, () => {});
    assert.deepEqual(result.moved, [path.join("src", "userplugins", "media.ts")]);
    assert.equal(fs.readFileSync(path.join(root, "src", "plugins", "media.ts"), "utf8"), "unrelated file");
    assert.equal(fs.readFileSync(path.join(result.backup, "src", "userplugins", "media.ts"), "utf8"), old.replace(/\n/g, "\r\n"));
});

test("an interrupted/invalid local copy restores the original plugin from backup", t => {
    const { root, parent } = fixture(t);
    const target = path.join(root, "src", "userplugins", "saveAsSticker", "index.tsx");
    create(target, "my old plugin");
    const badStage = path.join(parent, "badStage");
    create(path.join(badStage, "index.tsx"), "corrupt");
    assert.throws(() => repairLayout(root, badStage, RELEASE, () => {}));
    assert.equal(fs.readFileSync(target, "utf8"), "my old plugin");
});

test("downloads pinned files and rejects damaged/HTTP-failed downloads", async t => {
    const { parent } = fixture(t);
    const stage = path.join(parent, "stage"); fs.mkdirSync(stage);
    const requests = [];
    await downloadRelease(stage, RELEASE, async url => {
        requests.push(url);
        return new Response(fs.readFileSync(path.join(releaseDir, new URL(url).pathname.split("/").at(-1))));
    });
    assert.equal(requests.length, Object.keys(RELEASE.files).length);
    assert.ok(requests.every(url => url.includes(`/${RELEASE.commit}/`)));
    await assert.rejects(downloadRelease(stage, RELEASE, async () => new Response("damaged")), /checksum/);
    await assert.rejects(downloadRelease(stage, RELEASE, async () => new Response("missing", { status: 404 })), /HTTP 404/);
});

test("package manager fallback uses the project's pnpm version; command paths never enter the shell", t => {
    const { root } = fixture(t);
    assert.deepEqual(selectRunner(root, name => name === "pnpm.cmd"), ["pnpm.cmd"]);
    assert.deepEqual(selectRunner(root, name => name === "corepack.cmd"), ["corepack.cmd", "pnpm"]);
    assert.deepEqual(selectRunner(root, name => name === "npm.cmd"), ["npm.cmd", "exec", "--yes", "--package=pnpm@11.9.0", "--", "pnpm"]);
    assert.equal(packageCommand(["pnpm.cmd"], ["build"]).args.at(-1), "pnpm.cmd build");
    assert.throws(() => packageCommand(["pnpm.cmd"], ["build & echo bad"]), /Unsupported/);
});

test("failed dependency install or build never invokes the Discord installer", async t => {
    for (const failAt of [0, 1]) {
        const { root } = fixture(t); const calls = [];
        await assert.rejects(buildAndPatch(root, ["pnpm.cmd"], {
            log() {}, run: async (file, args, options) => {
                calls.push({ file, args, options });
                if (calls.length - 1 === failAt) throw new Error("simulated build failure");
            }
        }), /simulated build failure/);
        assert.equal(calls.length, failAt + 1);
        assert.ok(calls.every(call => call.file === (process.env.ComSpec || "cmd.exe")));
    }
});

test("successful build invokes the official CLI with this source build and respects patch failure", async t => {
    const { root } = fixture(t); const calls = [];
    create(path.join(root, "dist", "renderer.js"), 'const plugin = { name: "SaveAsSticker" };');
    create(path.join(root, "dist", "Installer", "VencordInstallerCli.exe"), "test fixture");
    await buildAndPatch(root, ["pnpm.cmd"], { log() {}, run: async (file, args, options) => calls.push({ file, args, options }) });
    assert.equal(calls.length, 4);
    assert.deepEqual(calls[3].args, ["--install", "--branch", "auto"]);
    assert.equal(calls[3].options.env.VENCORD_DEV_INSTALL, "1");
    assert.equal(calls[3].options.env.VENCORD_USER_DATA_DIR, root);
    assert.equal(calls[2].args.at(-1), "--version");
    await assert.rejects(buildAndPatch(root, ["pnpm.cmd"], { log() {}, run: async file => {
        if (file.endsWith("VencordInstallerCli.exe")) throw new Error("patch failed");
    } }), /patch failed/);
});

test("missing SaveAsSticker in build output blocks patching and lock prevents overlapping runs", async t => {
    const { root } = fixture(t); const calls = [];
    create(path.join(root, "dist", "renderer.js"), "other plugins only");
    await assert.rejects(buildAndPatch(root, ["pnpm.cmd"], { log() {}, run: async (...args) => calls.push(args) }), /did not include SaveAsSticker/);
    assert.equal(calls.length, 2);
    const release = acquireLock(root);
    assert.throws(() => acquireLock(root), /already running/);
    release();
    const again = acquireLock(root); again();
});

test("downloadable CMD embeds a complete runnable installer with CRLF line endings", () => {
    const file = fileURLToPath(new URL("../Install-SaveAsSticker.cmd", import.meta.url));
    const text = fs.readFileSync(file, "utf8"), marker = "// __SAS_NODE_PAYLOAD__";
    assert.match(text, /^@echo off\r\n/);
    assert.equal(text.replace(/\r\n/g, "").includes("\n"), false);
    const m = { exports: {} };
    const require = createRequire(import.meta.url);
    new Function("require", "module", "__filename", "__dirname", text.slice(text.lastIndexOf(marker) + marker.length))(require, m, file, path.dirname(file));
    assert.deepEqual(m.exports.RELEASE, RELEASE);
    assert.equal(typeof m.exports.main, "function");
    assert.doesNotMatch(text, /ExecutionPolicy|Set-ExecutionPolicy/);
});
