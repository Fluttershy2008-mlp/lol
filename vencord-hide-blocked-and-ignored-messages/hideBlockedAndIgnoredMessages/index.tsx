/*
 * HideBlockedAndIgnoredMessages for Vencord
 * Copyright (c) 2026 Fluttershy2008-mlp
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { FormSwitch } from "@components/FormSwitch";
import { Paragraph } from "@components/Paragraph";
import { Logger } from "@utils/Logger";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { filters, find, waitFor, waitForSubscriptions } from "@webpack";
import { ChannelStore, FluxDispatcher, GuildChannelStore, GuildReadStateStore, MessageActions, MessageStore, Modal, openModal, ReadStateStore, RelationshipStore, SelectedChannelStore, SortedGuildStore, useState } from "@webpack/common";

import { createDesktopRuntime } from "./runtime.js";
import { normalizeWhitelist } from "./whitelist.js";

let runtime: ReturnType<typeof createDesktopRuntime> | undefined;
const toggles = {
    blocked: "Hide blocked users", ignored: "Hide ignored users",
    removeReplies: "Hide replies to hidden users", removeBotCommands: "Hide commands run by hidden users",
    removeMentions: "Hide mentions of hidden users", whitelistEnabled: "Allow whitelisted user IDs",
    hideServers: "Hide messages from selected servers", hideServerChannels: "Hide their channels and forums",
    hideServerIcons: "Hide selected server icons", hideServerPings: "Hide their pings and notifications"
};
type ToggleKey = keyof typeof toggles;
function changed() { runtime?.refresh(); }
function validIds(value: string, mentions = false) {
    const tokens = value.trim().split(/[\s,;]+/).filter(Boolean);
    return tokens.every(token => /^[0-9]{17,20}$/.test(token) || mentions && /^<@!?[0-9]{17,20}>$/.test(token))
        || "Use Discord IDs separated by spaces, commas or new lines.";
}
const settings = definePluginSettings({
    blocked: { type: OptionType.BOOLEAN, description: toggles.blocked, default: true, onChange: changed },
    ignored: { type: OptionType.BOOLEAN, description: toggles.ignored, default: true, onChange: changed },
    removeReplies: { type: OptionType.BOOLEAN, description: toggles.removeReplies, default: true, onChange: changed },
    removeBotCommands: { type: OptionType.BOOLEAN, description: toggles.removeBotCommands, default: true, onChange: changed },
    removeMentions: { type: OptionType.BOOLEAN, description: toggles.removeMentions, default: true, onChange: changed },
    whitelistEnabled: { type: OptionType.BOOLEAN, description: toggles.whitelistEnabled, default: false, onChange: changed },
    whitelistedIds: { type: OptionType.STRING, description: "Whitelisted user IDs (spaces or commas)", default: "", isValid: value => validIds(String(value), true), onChange: changed },
    hiddenServerIds: { type: OptionType.STRING, description: "Hidden server IDs (spaces or commas)", default: "", isValid: value => validIds(String(value)), onChange: changed },
    hideServers: { type: OptionType.BOOLEAN, description: toggles.hideServers, default: true, onChange: changed },
    hideServerChannels: { type: OptionType.BOOLEAN, description: toggles.hideServerChannels, default: true, onChange: changed },
    hideServerIcons: { type: OptionType.BOOLEAN, description: toggles.hideServerIcons, default: true, onChange: changed },
    hideServerPings: { type: OptionType.BOOLEAN, description: toggles.hideServerPings, default: true, onChange: changed }
});
let previousServers: string | undefined, serverIds: string[] = [];
let previousUsers: string | undefined, userIds: string[] = [];
const storage = new Proxy({}, { get(_, key: string) {
    if (key === "hiddenServerIds") {
        if (previousServers !== settings.store.hiddenServerIds) {
            previousServers = settings.store.hiddenServerIds;
            serverIds = normalizeWhitelist(previousServers.split(/[\s,;]+/));
        }
        return serverIds;
    }
    if (key === "whitelistedIds") {
        if (previousUsers !== settings.store.whitelistedIds) {
            previousUsers = settings.store.whitelistedIds;
            userIds = normalizeWhitelist(previousUsers.split(/[\s,;]+/).map(id => id.replace(/^<@!?([0-9]+)>$/, "$1")));
        }
        return userIds;
    }
    return settings.store[key];
} });
const Icon: IconComponent = ({ width = 24, height = 24 }) => <svg width={width} height={height} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 3l18 18M10 5a7 7 0 0 1 11 7c-1.8 3.6-5 6-9 6a10 10 0 0 1-4-1M6 6a15 15 0 0 0-3 6 14 14 0 0 0 4 4M10 10a3 3 0 0 0 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
</svg>;
const SettingsPanel = ErrorBoundary.wrap(function SettingsPanel() {
    const values = settings.use();
    const [servers, setServers] = useState(values.hiddenServerIds);
    const [users, setUsers] = useState(values.whitelistedIds);
    const [error, setError] = useState("");
    function save() {
        const result = validIds(servers), userResult = validIds(users, true);
        if (result !== true || userResult !== true) { setError(String(result !== true ? result : userResult)); return; }
        settings.store.hiddenServerIds = servers.trim(); settings.store.whitelistedIds = users.trim();
        setError(""); changed();
    }
    return <div style={{ display: "grid", gap: 12 }}>
        <Paragraph>Paste the same server IDs you use on mobile. Icons and pings have independent switches. Explicit message search stays available.</Paragraph>
        <label>Hidden server IDs<textarea aria-label="Hidden server IDs" value={servers} onChange={e => setServers(e.currentTarget.value)} rows={3} style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }} /></label>
        <label>Whitelisted user IDs<textarea aria-label="Whitelisted user IDs" value={users} onChange={e => setUsers(e.currentTarget.value)} rows={2} style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }} /></label>
        {error && <p role="alert">{error}</p>}
        <Button onClick={save}>Save IDs</Button>
        {(Object.entries(toggles) as [ToggleKey, string][]).map(([key, title]) => <FormSwitch key={key} title={title} value={values[key]} onChange={value => { settings.store[key] = value; changed(); }} />)}
    </div>;
}, { noop: false });
const SettingsModal = ErrorBoundary.wrap((props: RenderModalProps) => <Modal {...props} title="Hidden users & servers"><SettingsPanel /></Modal>, { noop: false });
function openSettings() { openModal(props => <SettingsModal {...props} />); }

export default definePlugin({
    name: "HideBlockedAndIgnoredMessages",
    description: "Hide blocked/ignored users and selected servers' messages, channels, forums, icons and pings. Keeps explicit search available.",
    authors: [{ name: "Fluttershy2008-mlp", id: 0n }],
    settings,
    patches: [
        {
            find: '("guildsnav")',
            replacement: { match: /switch\((\i)\.type\){.+?default:return null}/,
                replace: "return $self.hiddenNode($1)?null:(()=>{$&})();" }
        },
        {
            find: "#{intl::GUILD_FOLDER_TOOLTIP_A11Y_LABEL}",
            replacement: { match: /(\i)\.slice\(0,4\)/, replace: "$self.visibleGuildIds($1).slice(0,4)" }
        },
        {
            find: ".SUPPRESS_NOTIFICATIONS))return!1",
            replacement: { match: /(\.SUPPRESS_NOTIFICATIONS\)\)return!1;)/,
                replace: "$1if($self.suppressPing(arguments[0]))return false;" }
        },
        {
            find: ".__invalid_blocked,",
            replacement: { match: /let{messages:\i,[^}]*?canUncollapse[^}]*}/,
                replace: "if($self.hideGroup(arguments[0]))return null;$&" }
        }
    ],
    start() {
        runtime = createDesktopRuntime({ MessageStore, RelationshipStore, ChannelStore, SelectedChannelStore,
            MessageActions, FluxDispatcher, SortedGuildStore, GuildReadStateStore, ReadStateStore, GuildChannelStore,
            find, filters, waitFor, waitForSubscriptions, logger: new Logger("HideBlockedAndIgnoredMessages") }, storage);
        runtime.start();
    },
    stop() { runtime?.stop(); runtime = undefined; },
    hiddenNode: node => runtime?.hiddenNode(node) ?? false,
    visibleGuildIds: ids => runtime?.visibleGuildIds(ids) ?? ids,
    suppressPing: message => runtime?.suppressPing(message) ?? false,
    hideGroup: props => Array.isArray(props?.messages) && props.messages.length > 0 && props.messages.every(message => runtime?.shouldHide(message)),
    toolboxActions: { "Hidden users & servers": openSettings },
    settingsAboutComponent: () => <Button onClick={openSettings}>Open Hidden users & servers</Button>,
    chatBarButton: {
        icon: Icon,
        render: ({ isAnyChat }) => isAnyChat ? <ErrorBoundary noop><ChatBarButton tooltip="Hidden users & servers" onClick={openSettings}><Icon /></ChatBarButton></ErrorBoundary> : null
    }
});
