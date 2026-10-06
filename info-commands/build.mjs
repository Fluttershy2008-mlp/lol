import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import vm from "node:vm";
const root = new URL("./", import.meta.url);
async function source(path) { return readFile(new URL(path, root), "utf8"); }
function localModule(text) {
    return text.replace(/^import .*?;\s*$/gm, "").replace(/\bexport (?=(?:async )?function|const)/g, "");
}
const common = localModule(await source("src/common.js"));
const embeds = (await source("src/embeds.js")).replace('import { findByProps } from "@vendetta/metro";', "const { findByProps } = vendetta.metro;").replace(/\bexport (?=(?:async )?function|const)/g, "");
const menu = localModule(await source("src/server-menu.js"));
const plugin = localModule(await source("src/plugin.js")).replace("export default", "return");
const bundle = `(() => {\n\"use strict\";\nconst common = (() => {\n${common}\nreturn { cmdDisplays, mSendMessage, AVATARS };\n})();\nconst embedHelpers = (() => {\n${embeds}\nreturn { fetchUser, fetchGuild, fetchInvite, formatTimestamp, formatTimestampFromSnowflake, formatAvatarLinks, maskUrl, getGuildIconUrl, getBannerUrl, getGuildBannerUrl, getGuildSplashUrl, getGuildDiscoverySplashUrl, decodeBadges, formatDate };\n})();\nconst { fetchUser, fetchGuild, fetchInvite, formatTimestamp, formatTimestampFromSnowflake, formatAvatarLinks, maskUrl, getGuildIconUrl, getBannerUrl, getGuildBannerUrl, getGuildSplashUrl, getGuildDiscoverySplashUrl, decodeBadges, formatDate } = embedHelpers;\nconst serverMenu = (() => {\n${menu}\nreturn { installServerMenu, openServerInfo, disposeServerMenu };\n})();\nconst { installServerMenu, openServerInfo, disposeServerMenu } = serverMenu;\n${plugin}\n})()\n`;
new vm.Script(bundle);
const manifest = JSON.parse(await source("manifest.base.json"));
manifest.hash = createHash("sha256").update(bundle).digest("hex");
await writeFile(new URL("index.js", root), bundle);
await writeFile(new URL("manifest.json", root), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Built ${manifest.name} ${manifest.version}: ${Buffer.byteLength(bundle)} bytes`);
