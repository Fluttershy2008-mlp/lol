// SPDX-License-Identifier: GPL-3.0-or-later
// SaveAsSticker for Vencord v1.1.1 — Fluttershy2008-mlp
import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { getGuildAcronym } from "@utils/discord";
import definePlugin, { PluginNative } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { closeModal, GuildStore, IconUtils, Menu, MessageStore, Modal, openModal, PermissionStore, React, showToast, StickersStore, useStateFromStores } from "@webpack/common";

import { downloadMedia, Media, PreparedSticker, prepareSticker, resolveMedia, stickerName } from "./media";
import { eligibleGuilds, errorText, stickerSlots, uploadSticker } from "./upload";

const MODAL_KEY = "vc-save-as-sticker";
let active = false;
let task: AbortController | undefined;

function StickerModal({ source, controller, ...modalProps }: RenderModalProps & { source?: Media; controller: AbortController; }) {
    const [name, setName] = React.useState(source?.name ?? "sticker");
    const [search, setSearch] = React.useState("");
    const [selected, setSelected] = React.useState<string | null>(null);
    const [prepared, setPrepared] = React.useState<PreparedSticker | null>(null);
    const [preview, setPreview] = React.useState<string | null>(null);
    const [status, setStatus] = React.useState(source ? "Preparing sticker…" : "Choose an image or animated GIF.");
    const [error, setError] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const fileInput = React.useRef<HTMLInputElement>(null);
    const job = React.useRef<AbortController | null>(null);
    const uploading = React.useRef(false);
    const guilds = useStateFromStores([GuildStore, PermissionStore, StickersStore], eligibleGuilds);
    const selectedGuild = guilds.find(g => g.id === selected);
    const validName = name.trim().length >= 2 && name.trim().length <= 30;
    const canSave = Boolean(prepared && selectedGuild && !stickerSlots(selectedGuild).full && validName && !busy);

    async function prepare(file?: File) {
        job.current?.abort();
        const current = new AbortController();
        job.current = current;
        const abort = () => current.abort();
        controller.signal.addEventListener("abort", abort, { once: true });
        const check = () => {
            if (!active || controller.signal.aborted || current.signal.aborted) throw new DOMException("Cancelled", "AbortError");
        };
        setPrepared(null);
        setPreview(null);
        setError("");
        setStatus("Preparing sticker…");
        try {
            check();
            const native = typeof VencordNative === "undefined" ? undefined : VencordNative.pluginHelpers?.SaveAsSticker as PluginNative<typeof import("./native")> | undefined;
            const blob = file ?? await downloadMedia(source!, current.signal, native?.fetchGIFPage ? url => native.fetchGIFPage(url) : undefined);
            const result = await prepareSticker(blob, file ? /\.gif$/i.test(file.name) : source?.gif, check, {
                allowVideo: !file && source?.video,
                signal: current.signal,
                onProgress: (frame, total) => setStatus(`Preparing animation… ${Math.round(frame / total * 100)}%`)
            });
            check();
            setPrepared(result);
            setPreview(URL.createObjectURL(result.blob));
            setStatus(`${result.extension === "gif" ? "Animated GIF" : "Image"} · 320 × 320 · ${Math.ceil(result.blob.size / 1024)} KiB`);
        } catch (e) {
            if (!current.signal.aborted && !controller.signal.aborted && active) {
                setError(errorText(e));
                setStatus("Choose the original image or GIF to try again.");
            }
        } finally {
            controller.signal.removeEventListener("abort", abort);
        }
    }

    React.useEffect(() => {
        if (source) void prepare();
        return () => { job.current?.abort(); };
    }, []);
    React.useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

    async function save() {
        if (!canSave || !prepared || !selectedGuild || uploading.current) return;
        uploading.current = true;
        setBusy(true);
        setError("");
        try {
            await uploadSticker(selectedGuild.id, name, prepared, () => {
                if (!active || controller.signal.aborted) throw new Error("The picker was closed. Open it again to save a sticker.");
            });
            if (active) showToast(`Saved ${name.trim()} to ${selectedGuild.name}`, "success");
            if (!controller.signal.aborted) modalProps.onClose();
        } catch (e) {
            if (!controller.signal.aborted && active) setError(errorText(e));
        } finally {
            uploading.current = false;
            if (!controller.signal.aborted) setBusy(false);
        }
    }

    return (
        <Modal
            {...modalProps}
            size="md"
            title={
                <div className="vc-sas-title">
                    {preview && <img src={preview} alt="Sticker preview" />}
                    <span>Save as Sticker</span>
                </div>
            }
            subtitle="Pick a server for your sticker."
            notice={error ? { message: error, type: "critical" } : undefined}
            actions={[
                { text: "Cancel", variant: "secondary", disabled: busy, onClick: modalProps.onClose },
                { text: busy ? "Uploading…" : "Add sticker", variant: "primary", disabled: !canSave, loading: busy, onClick: () => void save() }
            ]}
        >
            <div className="vc-sas-content" aria-busy={busy}>
                <label className="vc-sas-field">
                    Sticker name
                    <input value={name} maxLength={30} disabled={busy} onChange={e => setName(e.currentTarget.value)} aria-invalid={!validName} />
                </label>
                <div className="vc-sas-status" role="status">{status}</div>
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/gif,.gif,.png,.jpg,.jpeg,.webp,.bmp" hidden
                    onChange={e => {
                        const file = e.currentTarget.files?.[0];
                        e.currentTarget.value = "";
                        if (!file || uploading.current) return;
                        setName(stickerName(file.name));
                        void prepare(file);
                    }} />
                <button type="button" className="vc-sas-file" disabled={busy} onClick={() => fileInput.current?.click()}>Choose original file</button>
                <label className="vc-sas-field">
                    Server
                    <input type="search" placeholder="Search servers…" value={search} onChange={e => setSearch(e.currentTarget.value)} disabled={busy} />
                </label>
                <div className="vc-sas-servers" aria-label="Available servers">
                    {guilds.filter(g => g.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(guild => {
                        const { max, used, full } = stickerSlots(guild);
                        return (
                            <button type="button" key={guild.id} className="vc-sas-server" disabled={full || busy}
                                aria-pressed={selected === guild.id} onClick={() => setSelected(guild.id)}>
                                {guild.icon
                                    ? <img src={IconUtils.getGuildIconURL({ id: guild.id, icon: guild.icon, canAnimate: true, size: 64 })} alt="" />
                                    : <span className="vc-sas-acronym" aria-hidden>{getGuildAcronym(guild)}</span>}
                                <span className="vc-sas-server-text">
                                    <span>{guild.name}</span>
                                    <small>{full ? "No slots available" : used === null ? "Sticker slots checked on upload" : `${max - used} slots available`}</small>
                                </span>
                                <span className="vc-sas-plus" aria-hidden>{selected === guild.id ? "✓" : "+"}</span>
                            </button>
                        );
                    })}
                    {!guilds.length && <p>You need Create Expressions permission in a server to add stickers.</p>}
                    {guilds.length > 0 && !guilds.some(g => g.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && <p>No servers match your search.</p>}
                </div>
                {selectedGuild && <p className="vc-sas-status">Add “{name.trim() || "sticker"}” to {selectedGuild.name}.</p>}
            </div>
        </Modal>
    );
}

function openPicker(source?: Media) {
    if (!active) return;
    if (task) {
        task.abort();
        closeModal(MODAL_KEY);
    }
    const controller = new AbortController();
    task = controller;
    openModal(props => <StickerModal {...props} source={source} controller={controller} />, {
        modalKey: MODAL_KEY,
        onCloseCallback: () => {
            controller.abort();
            if (task === controller) task = undefined;
        }
    });
}

const contextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    const message = props?.message;
    // Context-menu props can predate Discord's asynchronous embed update.
    const cached = message?.channel_id && MessageStore?.getMessage?.(message.channel_id, message.id);
    const sources = resolveMedia(cached ? { ...props, message: cached } : props);
    if (!sources.length) return;
    const group = findGroupChildrenByChildId(["copy-link", "copy-native-link", "save-image"], children);
    const item = sources.length === 1
        ? <Menu.MenuItem id="vc-save-as-sticker" key="vc-save-as-sticker" label="Save as Sticker" action={() => openPicker(sources[0])} />
        : <Menu.MenuItem id="vc-save-as-sticker" key="vc-save-as-sticker" label="Save as Sticker">
            {sources.map((media, i) => <Menu.MenuItem key={media.url} id={`vc-save-as-sticker-${i}`} label={media.name} action={() => openPicker(media)} />)}
        </Menu.MenuItem>;
    if (group) group.push(item);
    else children.push(<Menu.MenuGroup key="vc-save-as-sticker-group">{item}</Menu.MenuGroup>);
};

export default definePlugin({
    name: "SaveAsSticker",
    description: "Save images and animated GIFs as server stickers with a server picker and automatic resizing.",
    tags: ["Media", "Servers", "Utility"],
    authors: [{ name: "Fluttershy2008-mlp", id: 0n }],
    contextMenus: { "message": contextMenuPatch, "image-context": contextMenuPatch },
    settingsAboutComponent: () => <div className="vc-sas-content">
        <p>Version 1.1.1. Right-click an image, GIF link, or its message and choose Save as Sticker, or choose a local file here.</p>
        <button type="button" className="vc-sas-file" onClick={() => openPicker()}>Choose image or GIF</button>
    </div>,
    start() { active = true; },
    stop() {
        active = false;
        if (task) {
            task.abort();
            task = undefined;
            closeModal(MODAL_KEY);
        }
    }
});
