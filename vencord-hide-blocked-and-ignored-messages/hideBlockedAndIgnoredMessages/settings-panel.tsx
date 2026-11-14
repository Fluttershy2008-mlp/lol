/* SPDX-License-Identifier: GPL-3.0-or-later */
import "./settings.css";

import { FormSwitch } from "@components/FormSwitch";
import { React, useEffect, useState } from "@webpack/common";

import { parseIds } from "./id-input";

export const toggles = {
    blocked: "Hide blocked users",
    ignored: "Hide ignored users",
    removeReplies: "Hide replies to hidden users",
    removeBotCommands: "Hide commands run by hidden users",
    removeMentions: "Hide mentions of hidden users",
    whitelistEnabled: "Allow whitelisted users",
    hideServers: "Hide messages from selected servers",
    hideServerChannels: "Hide their channels and forums",
    hideServerIcons: "Hide selected server icons",
    hideServerPings: "Hide their pings and notifications"
};
export type ToggleKey = keyof typeof toggles;
export type PanelValues = Record<ToggleKey, boolean> & { hiddenServerIds: string; whitelistedIds: string; };
type IdKey = "hiddenServerIds" | "whitelistedIds";
type Tab = "users" | "servers" | "whitelist";
type Draft = { value: string; base: string; };
const userKeys: ToggleKey[] = ["blocked", "ignored", "removeReplies", "removeBotCommands", "removeMentions"];
const descriptions: Record<ToggleKey, string> = {
    blocked: "Remove messages from people you have blocked.",
    ignored: "Remove messages from people you have ignored.",
    removeReplies: "Hide messages that reply to a hidden user.",
    removeBotCommands: "Hide bot command messages attributed to hidden users.",
    removeMentions: "Hide messages that mention a hidden user.",
    whitelistEnabled: "Let these people through your user filters.",
    hideServers: "Hide chat messages and threads in the servers below.",
    hideServerChannels: "Also hide their channel list. Requires message hiding.",
    hideServerIcons: "Hide them from the server bar and folder previews.",
    hideServerPings: "Hide their mention badges and client notifications."
};

function ShieldIcon() {
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3 4 6v6c0 4 5 8 8 9 3-1 8-5 8-9V6l-8-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="m8.5 12 2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>;
}

function useDraft(saved: string) {
    const [draft, setDraft] = useState<Draft>({ value: saved, base: saved });
    // A clean editor follows another open panel; a dirty editor keeps its work.
    useEffect(() => {
        setDraft(current => current.value === current.base ? { value: saved, base: saved } : current);
    }, [saved]);
    return [draft, setDraft] as const;
}

export function SettingsPanel({ values, onToggle, onSave }: {
    values: PanelValues;
    onToggle: (key: ToggleKey, value: boolean) => void;
    onSave: (changes: Partial<Pick<PanelValues, IdKey>>) => void;
}) {
    const uid = React.useId();
    const [tab, setTab] = useState<Tab>("users");
    const [servers, setServers] = useDraft(values.hiddenServerIds);
    const [users, setUsers] = useDraft(values.whitelistedIds);
    const [errors, setErrors] = useState<Partial<Record<IdKey, string>>>({});
    const [saved, setSaved] = useState(false);
    const serverDirty = servers.value !== servers.base;
    const userDirty = users.value !== users.base;
    const dirty = serverDirty || userDirty;
    const serverCount = parseIds(values.hiddenServerIds).ids.length;
    const userCount = parseIds(values.whitelistedIds, true).ids.length;
    const tabs: { id: Tab; label: string; count?: number; }[] = [
        { id: "users", label: "Users" },
        { id: "servers", label: "Servers", count: serverCount },
        { id: "whitelist", label: "Whitelist", count: userCount }
    ];

    function save() {
        const nextErrors: Partial<Record<IdKey, string>> = {};
        const changes: Partial<Pick<PanelValues, IdKey>> = {};
        for (const [key, draft, isDirty] of [
            ["hiddenServerIds", servers, serverDirty], ["whitelistedIds", users, userDirty]
        ] as const) {
            if (!isDirty) continue;
            const parsed = parseIds(draft.value, key === "whitelistedIds");
            if (parsed.invalid.length) nextErrors[key] = "Use 17–20 digit Discord IDs. Separate them with spaces, commas or new lines.";
            else if (draft.base !== values[key]) nextErrors[key] = "This list changed in another panel. Reset to load the saved list before editing again.";
            else changes[key] = parsed.value;
        }
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) {
            setTab(nextErrors.hiddenServerIds ? "servers" : "whitelist");
            return;
        }
        onSave(changes);
        if (changes.hiddenServerIds !== undefined) setServers({ value: changes.hiddenServerIds, base: changes.hiddenServerIds });
        if (changes.whitelistedIds !== undefined) setUsers({ value: changes.whitelistedIds, base: changes.whitelistedIds });
        setSaved(true);
    }

    function reset() {
        setServers({ value: values.hiddenServerIds, base: values.hiddenServerIds });
        setUsers({ value: values.whitelistedIds, base: values.whitelistedIds });
        setErrors({});
        setSaved(false);
    }

    function row(key: ToggleKey) {
        return <FormSwitch key={key} className="hbim-switch-row" hideBorder
            title={toggles[key]} description={descriptions[key]} value={values[key]}
            disabled={key === "hideServerChannels" && !values.hideServers}
            onChange={value => onToggle(key, value)} />;
    }

    function editor(key: IdKey) {
        const isServer = key === "hiddenServerIds";
        const draft = isServer ? servers : users;
        const parsed = parseIds(draft.value, !isServer);
        const title = isServer ? "Hidden server IDs" : "Whitelisted user IDs";
        const change = isServer ? setServers : setUsers;
        return <div className="hbim-editor">
            <div className="hbim-editor-heading">
                <label htmlFor={`${uid}-${key}`}>{title}</label>
                <span className="hbim-count">{parsed.ids.length} {isServer ? "server" : "user"}{parsed.ids.length === 1 ? "" : "s"}</span>
            </div>
            <textarea id={`${uid}-${key}`} aria-label={title} value={draft.value} rows={3}
                spellCheck={false} autoComplete="off" aria-invalid={Boolean(errors[key])}
                aria-describedby={`${uid}-${key}-hint${errors[key] ? ` ${uid}-${key}-error` : ""}`}
                placeholder={isServer ? "Paste server IDs here…" : "Paste user IDs or @mentions here…"}
                onChange={event => {
                    const value = event.currentTarget.value;
                    change(current => ({ ...current, value }));
                    setErrors(current => ({ ...current, [key]: undefined }));
                    setSaved(false);
                }} />
            <p id={`${uid}-${key}-hint`} className="hbim-hint">Separate IDs with spaces, commas or new lines. Duplicates are removed when saved.</p>
            {errors[key] && <p id={`${uid}-${key}-error`} className="hbim-error" role="alert">{errors[key]}</p>}
        </div>;
    }

    return <section className="hbim-settings" aria-label="Hidden users and servers settings">
        <header className="hbim-header">
            <div className="hbim-header-icon"><ShieldIcon /></div>
            <div className="hbim-heading">
                <h2>Hidden users &amp; servers</h2>
                <p>Choose what stays out of your chat.</p>
            </div>
        </header>
        <div className="hbim-tabs" role="tablist" aria-label="Filter categories">
            {tabs.map(item => <button key={item.id} type="button" role="tab"
                id={`${uid}-tab-${item.id}`} aria-controls={`${uid}-panel-${item.id}`}
                aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1}
                onClick={() => setTab(item.id)} onKeyDown={event => {
                    const index = tabs.findIndex(t => t.id === tab);
                    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                        : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                            : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
                    if (next < 0) return;
                    event.preventDefault();
                    setTab(tabs[next].id);
                    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]");
                    buttons?.[next]?.focus();
                }}>
                {item.label}{item.count !== undefined && <span className="hbim-tab-count">{item.count}</span>}
            </button>)}
        </div>
        <div id={`${uid}-panel-users`} role="tabpanel" aria-labelledby={`${uid}-tab-users`} hidden={tab !== "users"}>
            <div className="hbim-card">
                <div className="hbim-card-heading"><div><h3>People &amp; messages</h3><p>Fine-tune which messages get hidden.</p></div>
                    <span className="hbim-count">{userKeys.filter(key => values[key]).length} of 5 on</span></div>
                <div className="hbim-rows">{userKeys.map(row)}</div>
            </div>
        </div>
        <div id={`${uid}-panel-servers`} role="tabpanel" aria-labelledby={`${uid}-tab-servers`} hidden={tab !== "servers"}>
            <div className="hbim-card">
                <div className="hbim-card-heading"><div><h3>Selected servers</h3><p>Use the same IDs as your mobile plugin.</p></div></div>
                {editor("hiddenServerIds")}
                <div className="hbim-rows">{(["hideServers", "hideServerChannels", "hideServerIcons", "hideServerPings"] as ToggleKey[]).map(row)}</div>
                <p className="hbim-card-note">Server icons and notifications have independent switches.</p>
            </div>
        </div>
        <div id={`${uid}-panel-whitelist`} role="tabpanel" aria-labelledby={`${uid}-tab-whitelist`} hidden={tab !== "whitelist"}>
            <div className="hbim-card">
                <div className="hbim-card-heading"><div><h3>Always allow</h3><p>Make exceptions for specific people.</p></div>
                    <span className={`hbim-count${values.whitelistEnabled ? " hbim-count-active" : ""}`}>{values.whitelistEnabled ? "Enabled" : "Off"}</span></div>
                <div className="hbim-rows">{row("whitelistEnabled")}</div>
                {editor("whitelistedIds")}
                <p className="hbim-card-note">{!values.whitelistEnabled && "Your list is kept while the whitelist is off. "}Whitelist exceptions apply to user filters; messages in hidden servers stay hidden.</p>
            </div>
        </div>
        <div className="hbim-savebar">
            <div className="hbim-save-status" role="status" aria-live="polite">
                <span className={`hbim-status-dot${dirty ? " hbim-status-dirty" : ""}`} />
                <span>{dirty ? "Unsaved ID changes" : saved ? "IDs saved" : "Switches save instantly"}</span>
            </div>
            <div className="hbim-save-actions">
                <button type="button" className="hbim-button hbim-button-secondary" disabled={!dirty} onClick={reset}>Reset</button>
                <button type="button" className="hbim-button hbim-button-primary" disabled={!dirty} onClick={save}>Save IDs</button>
            </div>
        </div>
        <p className="hbim-footer">Explicit message search stays available. Save ID edits before closing this panel.</p>
    </section>;
}
