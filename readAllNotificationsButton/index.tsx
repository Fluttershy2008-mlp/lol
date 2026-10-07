/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// Modified 2026-10-07: add DM/group DM support and guard duplicate or empty acknowledgements.

import "./style.css";

import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { TextButton } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { ActiveJoinedThreadsStore, ChannelStore, FluxDispatcher, GuildChannelStore, GuildStore, React, ReadStateStore } from "@webpack/common";

interface ChannelAck {
    channelId: string;
    messageId: string;
    readStateType: 0;
}

function onClick() {
    const channels: ChannelAck[] = [];
    const seen = new Set<string>();

    function addChannel(channelId: string | undefined) {
        if (!channelId || seen.has(channelId)) return;
        if (!ReadStateStore.hasUnread(channelId) && ReadStateStore.getMentionCount(channelId) === 0) return;

        const messageId = ReadStateStore.lastMessageId(channelId);
        if (!messageId) return;

        seen.add(channelId);
        channels.push({ channelId, messageId, readStateType: 0 });
    }

    // Private channels include both one-to-one DMs and group DMs.
    for (const channel of ChannelStore.getSortedPrivateChannels()) {
        addChannel(channel?.id);
    }

    for (const guild of Object.values(GuildStore.getGuilds())) {
        const guildChannels = GuildChannelStore.getChannels(guild.id);
        for (const { channel } of [...(guildChannels?.SELECTABLE ?? []), ...(guildChannels?.VOCAL ?? [])]) {
            addChannel(channel?.id);
        }

        const threads = ActiveJoinedThreadsStore.getActiveJoinedThreadsForGuild(guild.id) ?? {};
        for (const parentThreads of Object.values(threads)) {
            for (const { channel } of Object.values(parentThreads)) {
                addChannel(channel?.id);
            }
        }
    }

    if (channels.length === 0) return;

    FluxDispatcher.dispatch({
        type: "BULK_ACK",
        context: "APP",
        channels
    });
}

const ReadAllButton = () => (
    <TextButton
        variant="secondary"
        onClick={onClick}
        className="vc-ranb-button"
        title="Mark server channels, threads, DMs and group DMs as read"
        aria-label="Mark all server and DM notifications as read"
    >
        Read All
    </TextButton>
);

export default definePlugin({
    name: "ReadAllNotificationsButton",
    description: "Read all server, DM and group DM notifications with a single button click!",
    tags: ["Notifications", "Shortcuts"],
    authors: [Devs.kemo],
    dependencies: ["ServerListAPI"],

    renderReadAllButton: ErrorBoundary.wrap(ReadAllButton, { noop: true }),

    start() {
        addServerListElement(ServerListRenderPosition.Above, this.renderReadAllButton);
    },

    stop() {
        removeServerListElement(ServerListRenderPosition.Above, this.renderReadAllButton);
    }
});
