// SPDX-License-Identifier: GPL-3.0-or-later
import { Guild } from "@vencord/discord-types";
import { Constants, FluxDispatcher, GuildStore, PermissionsBits, PermissionStore, RestAPI, StickersStore, UserStore } from "@webpack/common";

import { MAX_UPLOAD_BYTES, PreparedSticker } from "./media";

let saving = false;

export function canCreate(guild: Guild) {
    if (!guild) return false;
    if (guild.ownerId === UserStore.getCurrentUser()?.id) return true;
    const permission = PermissionsBits.CREATE_GUILD_EXPRESSIONS;
    return (PermissionStore.getGuildPermissions({ id: guild.id }) & permission) === permission;
}

export function stickerSlots(guild: Guild) {
    const extra = Number(guild.premiumFeatures?.additionalStickerSlots ?? 0);
    const base = guild.features.has("MORE_STICKERS") && guild.premiumTier === 3 ? 120 : [5, 15, 30, 60][guild.premiumTier] ?? 5;
    // Tierless boosts report total additional slots above the base five.
    const max = Math.max(base, 5 + (Number.isFinite(extra) ? Math.max(0, extra) : 0));
    const stickers = StickersStore.getStickersByGuildId(guild.id);
    const used = stickers?.length ?? null;
    return { max, used, full: used !== null && used >= max };
}

export function eligibleGuilds() {
    return Object.values(GuildStore.getGuilds()).filter(canCreate).sort((a, b) => a.name.localeCompare(b.name));
}

export function errorText(error: any): string {
    let body = error?.body;
    if (!body && typeof error?.text === "string") {
        try { body = JSON.parse(error.text); } catch { /* Fall back to the message. */ }
    }
    const code = Number(body?.code ?? error?.code);
    if (code === 50013) return "You need Create Expressions permission in this server.";
    if (code === 30039) return "This server has no free sticker slots. Choose another server.";
    if (error?.status === 429 || body?.retry_after) return "Discord is rate limiting uploads. Wait a moment before trying again.";
    return body?.message || error?.message || "Discord could not confirm the upload. Check the server's stickers before trying again.";
}

export async function uploadSticker(guildId: string, name: string, prepared: PreparedSticker, check = () => {}) {
    if (saving) throw new Error("Another sticker is already being uploaded. Wait for it to finish.");
    name = name.trim();
    if (name.length < 2 || name.length > 30) throw new Error("Use a sticker name between 2 and 30 characters.");
    if (!prepared.blob.size || prepared.blob.size > MAX_UPLOAD_BYTES) throw new Error("The sticker must be below 512 KiB.");
    check();
    const guild = GuildStore.getGuild(guildId);
    if (!guild || !canCreate(guild)) throw new Error("You need Create Expressions permission in this server.");
    if (stickerSlots(guild).full) throw new Error("This server has no free sticker slots. Choose another server.");
    const data = new FormData();
    data.append("name", name);
    data.append("tags", "🙂");
    data.append("description", "");
    data.append("file", prepared.blob, `${name.replace(/[^a-z0-9_-]/gi, "_")}.${prepared.extension}`);
    saving = true;
    try {
        // Match Vencord ExpressionCloner's authenticated multipart upload API.
        // Never retry POST automatically: a lost reply may still mean a successful upload.
        const { body } = await RestAPI.post({ url: Constants.Endpoints.GUILD_STICKER_PACKS(guildId), body: data, retries: 0 });
        if (!body?.id) throw new Error("Discord did not confirm the upload. Check this server's stickers before trying again.");
        try {
            FluxDispatcher.dispatch({ type: "GUILD_STICKERS_CREATE_SUCCESS", guildId, sticker: { ...body, user: UserStore.getCurrentUser() } });
        } catch { /* Upload succeeded; a cache refresh failure must not invite a duplicate. */ }
        return body;
    } finally {
        saving = false;
    }
}
