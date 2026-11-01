(() => {
    'use strict';
    const PREFIX = 'dev.fluttershy2008.long-video-share.';
    const DEFAULTS = { targetMB: '', shortSide: 720 };
    const BUSY = new Set(['picking', 'inspecting', 'compressing', 'cancelling', 'choosing-save', 'saving']);
    const optional = fn => { try { return fn(); } catch { return undefined; } };
    const listeners = new Set();
    let current, writes = Promise.resolve();
    const changed = () => { for (const listener of [...listeners]) optional(listener); };
    function settingsOf(value) {
        return { targetMB: typeof value?.targetMB === 'string' ? value.targetMB.slice(0, 12) : '',
            shortSide: [360, 480, 720, 1080].includes(value?.shortSide) ? value.shortSide : 720 };
    }
    function bytes(value) { return Number.isFinite(value) && value > 0 ? (value / 1000000).toFixed(1) + ' MB' : 'Unknown size'; }
    function duration(value) {
        if (!(value > 0)) return '';
        const seconds = Math.round(value);
        return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    }
    function targetBytes(value) {
        if (!/^\d{1,5}(?:\.\d{1,3})?$/.test(value.trim())) throw new Error('Enter a size from 1 to 10,000 MB.');
        const size = Number(value) * 1000000;
        if (!Number.isSafeInteger(Math.round(size)) || size < 1000000 || size > 10000000000) throw new Error('Enter a size from 1 to 10,000 MB.');
        return Math.floor(size);
    }
    function httpsLink(value) {
        const text = value.trim();
        if (text.length > 1900 || /[\s<>\\\x00-\x1f]/.test(text) || !/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#]|$)/i.test(text))
            throw new Error('Paste a complete HTTPS video sharing link.');
        const authority = text.slice(8).split(/[/?#]/)[0];
        if (authority.includes('@') || !authority.includes('.')) throw new Error('Paste a complete HTTPS video sharing link.');
        return text;
    }
    function suggestedMB(api) {
        const user = optional(() => api.unscoped.discord.flux.Stores.UserStore.getCurrentUser());
        const premium = user?.premiumType ?? user?.premium_type;
        return premium === 2 ? '500' : premium === 1 || premium === 3 ? '50' : '20';
    }
    function stop(session) {
        if (!session?.active) return;
        session.active = false;
        for (const timer of session.timers) clearInterval(timer);
        session.timers.clear();
        if (current === session) current = undefined;
        changed();
    }
    async function start(api) {
        if (current?.active) return;
        const session = { api, active: true, pending: false, polling: false, timers: new Set(), status: { phase: 'idle' },
            error: '', nativeReady: false, settings: settingsOf(api.jsonStorage?.cache) };
        current = session; api.cleanup(() => stop(session));
        try {
            const data = api.jsonStorage.loaded ? api.jsonStorage.cache : await api.jsonStorage.get();
            if (session.active) session.settings = settingsOf(data);
        } catch { session.error = 'Could not load saved choices. Default settings are available.'; }
        if (session.active) { await poll(session); changed(); }
    }
    async function native(session, action, args = []) {
        if (!session?.active || current !== session) throw new Error('Reopen Long Video Share.');
        const call = session.api.unscoped.modules.native.callNativeMethod;
        const result = await call(PREFIX + action, args);
        if (!result || typeof result.phase !== 'string') throw new Error('The native video encoder is unavailable. Fully restart Valenced after installation.');
        return result;
    }
    async function poll(session) {
        if (!session?.active || session.polling || session.pending) return;
        session.polling = true;
        try {
            const status = await native(session, 'status');
            if (session.active && current === session) { session.status = status; session.nativeReady = true; changed(); }
        } catch {
            if (session.active && current === session) { session.nativeReady = false; changed(); }
        } finally { session.polling = false; }
    }
    async function act(session, action, args = []) {
        if (!session?.active || session.pending) return;
        session.pending = true; session.error = ''; changed();
        try {
            const result = await native(session, action, args);
            if (session.active && current === session) { session.status = result; session.nativeReady = true; }
        } catch (error) {
            if (session.active && current === session) session.error = error?.message ?? String(error);
        } finally { session.pending = false; if (session.active && current === session) changed(); }
    }
    function SettingsComponent({ api }) {
        const { React, ReactNative: RN } = api.unscoped.react, h = React.createElement;
        const [, render] = React.useState(0), [link, setLink] = React.useState(''), [linkNotice, setLinkNotice] = React.useState('');
        const session = current;
        React.useEffect(() => {
            const refresh = () => render(x => x + 1); listeners.add(refresh);
            const timer = session?.active ? setInterval(() => { void poll(session); }, 1000) : undefined;
            if (timer !== undefined) session.timers.add(timer);
            void poll(session);
            return () => { listeners.delete(refresh); if (timer !== undefined) { clearInterval(timer); session.timers.delete(timer); } };
        }, [session]);
        const light = optional(() => api.unscoped.discord.flux.Stores.ThemeStore.theme) === 'light';
        const fg = light ? '#17191C' : '#F2F3F5', muted = light ? '#4E5058' : '#B5BAC1', card = light ? '#F0F1F4' : '#2B2D31';
        const values = session?.settings ?? DEFAULTS, status = session?.status ?? { phase: 'idle' };
        const busy = BUSY.has(status.phase), pending = !session?.active || session.pending;
        const selectedMB = values.targetMB || suggestedMB(api);
        const text = (content, extra = {}) => h(RN.Text, { style: { color: muted, lineHeight: 21, marginBottom: 10, ...extra } }, content);
        const heading = label => text(label, { color: fg, fontSize: 18, fontWeight: '700', marginTop: 16 });
        const button = (label, onPress, disabled = false, selected = false) => h(RN.Pressable, {
            key: label, accessibilityRole: 'button', accessibilityLabel: label, accessibilityState: { disabled, selected },
            disabled, onPress, style: { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: selected ? '#5865F2' : card,
                opacity: disabled ? 0.45 : 1, borderRadius: 10, marginRight: 8, marginBottom: 10 } },
            h(RN.Text, { style: { color: selected ? '#FFFFFF' : fg, fontWeight: '600' } }, label));
        const row = children => h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } }, children);
        function save(key, value) {
            if (!session?.active || busy) return;
            session.settings = settingsOf({ ...session.settings, [key]: value }); changed();
            const settings = { ...session.settings };
            writes = writes.catch(() => {}).then(() => api.jsonStorage.set(settings, true)).catch(() => {
                if (session.active) { session.error = 'Could not save this choice. Try again.'; changed(); }
            });
        }
        function compress() {
            try { void act(session, 'compress', [targetBytes(selectedMB), values.shortSide]); }
            catch (error) { session.error = error.message; changed(); }
        }
        async function copyLink() {
            try {
                const url = httpsLink(link);
                const clipboard = api.unscoped.externals.ReactNativeClipboard.Clipboard;
                if (typeof clipboard?.setString !== 'function') throw new Error('Clipboard is unavailable on this build. Copy the link from the text field.');
                await clipboard.setString(url);
                setLinkNotice('Copied. Paste the link into your Discord message. Viewers must have access to the hosted video.');
            } catch (error) { setLinkNotice(error.message); }
        }
        const inputStyle = { color: fg, backgroundColor: card, padding: 12, borderRadius: 10, fontSize: 16, marginBottom: 12 };
        const phaseText = {
            idle: 'Choose a video to start.', picking: 'Choose a video in Android’s file picker.', inspecting: 'Reading video details and audio size…',
            selected: 'Video selected. Choose your target size and compress.', compressing: 'Compressing: ' + (status.progress ?? 0) + '%' + (status.attempt > 1 ? ' · size retry ' + status.attempt + '/3' : ''),
            cancelling: 'Stopping and cleaning up…', cancelled: 'Cancelled. Your original video is unchanged.',
            ready: 'MP4 ready · ' + bytes(status.outputBytes) + ' · below ' + bytes(status.limitBytes),
            'choosing-save': 'Choose where to save the compressed MP4.', saving: 'Saving the MP4…',
            saved: 'Saved. Open your Discord chat, tap + and attach the saved MP4.', error: 'Could not finish this operation.'
        }[status.phase] ?? 'Ready';
        const details = status.name ? status.name + '\n' + duration(status.durationSeconds) + ' · ' + bytes(status.sourceBytes)
            + ' · ' + status.width + '×' + status.height : '';
        const plan = optional(() => targetBytes(selectedMB));
        const rate = plan && status.durationSeconds ? Math.floor((plan * 0.94 - (status.audioBytes ?? 0)) * 8 / status.durationSeconds / 1000) : null;
        return h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: 20, paddingBottom: 48 } },
            text('Long Video Share', { color: fg, fontSize: 27, fontWeight: '700' }),
            text('Make a smaller copy of a long video on your phone, then attach it in Discord. No video is uploaded by this plugin.'),
            !session?.nativeReady ? text('Fully close and reopen Valenced after installing this plugin to load its Android encoder. If this stays visible, update Valenced and reopen the plugin.', { color: '#E78284' }) : null,
            heading('1. Choose your video'),
            button('Choose video', () => { void act(session, 'pick'); }, pending || busy || !session?.nativeReady),
            details ? text(details, { color: fg }) : null,
            heading('2. Choose a file-size limit'),
            text('Use the limit shown for your account and channel. Nitro limits can vary; 500 MB is a conservative Nitro preset. A plugin cannot increase Discord’s server limit.'),
            row([['20', '20 MB'], ['50', '50 MB'], ['500', '500 MB'], ['1000', '1 GB']].map(([value, label]) =>
                button(label, () => save('targetMB', value), pending || busy, selectedMB === value))),
            h(RN.TextInput, { accessibilityLabel: 'Target file size in megabytes', keyboardType: 'decimal-pad',
                value: selectedMB, editable: !busy && !pending, onChangeText: value => save('targetMB', value), maxLength: 12, style: inputStyle }),
            row([360, 480, 720, 1080].map(side => button(side + 'p', () => save('shortSide', side), pending || busy, values.shortSide === side))),
            text('Resolution is the shorter side; portrait videos keep their orientation. Output is H.264 MP4, up to 30 fps, with original AAC audio. More compression means lower quality.'),
            rate !== null ? text(rate >= 96 ? 'Estimated video bitrate: ' + rate + ' kbps. For a 45-minute video, 480p or 720p is a useful starting point.'
                : 'This target is too small for this video and its audio. Choose a larger target or share a hosted link.', { color: rate < 96 ? '#E78284' : muted }) : null,
            heading('3. Compress and save'),
            text(phaseText, { color: fg, fontWeight: '600' }),
            status.phase === 'compressing' ? h(RN.View, { accessibilityRole: 'progressbar', accessibilityValue: { min: 0, max: 100, now: status.progress },
                style: { height: 8, backgroundColor: card, borderRadius: 4, marginBottom: 12 } },
                h(RN.View, { style: { height: 8, width: Math.max(0, Math.min(100, status.progress ?? 0)) + '%', backgroundColor: '#5865F2', borderRadius: 4 } })) : null,
            session?.error || status.error ? text(session?.error || status.error, { color: '#E78284' }) : null,
            row([
                button('Compress video', compress, pending || busy || !status.name || !session?.nativeReady || rate !== null && rate < 96),
                button('Save MP4', () => { void act(session, 'save'); }, pending || busy || !(status.outputBytes > 0 && status.outputBytes < status.limitBytes)),
                button('Cancel', () => { void act(session, 'cancel'); }, pending || !['compressing', 'inspecting'].includes(status.phase)),
                button('Clear temporary video', () => { void act(session, 'clear'); }, pending || busy || !session?.nativeReady)
            ]),
            text('Keep Discord open while compressing. Long videos take time and need free storage for a temporary copy and the saved MP4. Your original stays untouched. Size is verified after encoding; oversize output is retried automatically.'),
            heading('Keep the original quality with a link'),
            text('Upload the video to YouTube as Unlisted or a file host you trust, set its sharing permissions, then copy its HTTPS link here. Viewers can open the link; Discord’s preview depends on the host and permissions.'),
            h(RN.TextInput, { accessibilityLabel: 'Hosted video link', placeholder: 'https://…', placeholderTextColor: muted, value: link,
                onChangeText: value => { setLink(value); setLinkNotice(''); }, autoCapitalize: 'none', autoCorrect: false,
                multiline: true, maxLength: 1900, style: inputStyle }),
            button('Copy video link', () => { void copyLink(); }, !link.trim()),
            linkNotice ? text(linkNotice) : null,
            text('Android · Long Video Share 1.0.0-beta1', { marginTop: 14, fontSize: 12 }));
    }
    return { default: { jsonStorage: { load: true, default: { ...DEFAULTS } }, start, stop() { stop(current); }, SettingsComponent } };
})()
