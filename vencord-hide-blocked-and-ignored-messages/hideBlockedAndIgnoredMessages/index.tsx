/*
 * HideBlockedAndIgnoredMessages for Vencord
 * Copyright (c) 2026 Fluttershy2008-mlp
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import SettingsPlugin from "@plugins/_core/settings";
import { Logger } from "@utils/Logger";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { filters, find, waitFor, waitForSubscriptions } from "@webpack";
import { ChannelStore, FluxDispatcher, GuildChannelStore, GuildReadStateStore, MessageActions, MessageStore, Modal, openModal, ReadStateStore, RelationshipStore, SelectedChannelStore, SortedGuildStore } from "@webpack/common";

import { createDesktopRuntime } from "./runtime.js";
import { registerSettingsSidebar } from "./settings-sidebar.js";
import { normalizeWhitelist } from "./whitelist.js";
import { validIds } from "./id-input";
import { SettingsPanel as Panel, toggles } from "./settings-panel";

let runtime: ReturnType<typeof createDesktopRuntime> | undefined;
let removeSidebar: (() => void) | undefined;
function changed() { runtime?.refresh(); }
const settings = definePluginSettings({
    controls: { type: OptionType.COMPONENT, component: () => <SettingsPanel /> },
    blocked: { type: OptionType.BOOLEAN, hidden: true, description: toggles.blocked, default: true, onChange: changed },
    ignored: { type: OptionType.BOOLEAN, hidden: true, description: toggles.ignored, default: true, onChange: changed },
    removeReplies: { type: OptionType.BOOLEAN, hidden: true, description: toggles.removeReplies, default: true, onChange: changed },
    removeBotCommands: { type: OptionType.BOOLEAN, hidden: true, description: toggles.removeBotCommands, default: true, onChange: changed },
    removeMentions: { type: OptionType.BOOLEAN, hidden: true, description: toggles.removeMentions, default: true, onChange: changed },
    whitelistEnabled: { type: OptionType.BOOLEAN, hidden: true, description: toggles.whitelistEnabled, default: false, onChange: changed },
    whitelistedIds: { type: OptionType.STRING, hidden: true, description: "Whitelisted user IDs (spaces or commas)", default: "", isValid: value => validIds(String(value), true), onChange: changed },
    hiddenServerIds: { type: OptionType.STRING, hidden: true, description: "Hidden server IDs (spaces or commas)", default: "", isValid: value => validIds(String(value)), onChange: changed },
    hideServers: { type: OptionType.BOOLEAN, hidden: true, description: toggles.hideServers, default: true, onChange: changed },
    hideServerChannels: { type: OptionType.BOOLEAN, hidden: true, description: toggles.hideServerChannels, default: true, onChange: changed },
    hideServerIcons: { type: OptionType.BOOLEAN, hidden: true, description: toggles.hideServerIcons, default: true, onChange: changed },
    hideServerPings: { type: OptionType.BOOLEAN, hidden: true, description: toggles.hideServerPings, default: true, onChange: changed }
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
    return <Panel values={values} onToggle={(key, value) => {
        settings.store[key] = value;
        changed();
    }} onSave={changes => {
        if (changes.hiddenServerIds !== undefined) settings.store.hiddenServerIds = changes.hiddenServerIds;
        if (changes.whitelistedIds !== undefined) settings.store.whitelistedIds = changes.whitelistedIds;
        changed();
    }} />;
}, { noop: false });
const SettingsPage = SettingsPanel;
const SettingsModal = ErrorBoundary.wrap((props: RenderModalProps) => <Modal {...props} title="Hidden users & servers"><SettingsPanel /></Modal>, { noop: false });
function openSettings() { openModal(props => <SettingsModal {...props} />); }

export default definePlugin({
    name: "HideBlockedAndIgnoredMessages",
    description: "Hide blocked users, ignored users and selected servers. Manage everything in one place.",
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
        removeSidebar?.();
        removeSidebar = registerSettingsSidebar(SettingsPlugin, SettingsPage, Icon);
    },
    stop() { removeSidebar?.(); removeSidebar = undefined; runtime?.stop(); runtime = undefined; },
    hiddenNode: node => runtime?.hiddenNode(node) ?? false,
    visibleGuildIds: ids => runtime?.visibleGuildIds(ids) ?? ids,
    suppressPing: message => runtime?.suppressPing(message) ?? false,
    hideGroup: props => Array.isArray(props?.messages) && props.messages.length > 0 && props.messages.every(message => runtime?.shouldHide(message)),
    toolboxActions: { "Hidden users & servers": openSettings },
    chatBarButton: {
        icon: Icon,
        render: ({ isAnyChat }) => isAnyChat ? <ErrorBoundary noop><ChatBarButton tooltip="Hidden users & servers" onClick={openSettings}><Icon /></ChatBarButton></ErrorBoundary> : null
    }
});

