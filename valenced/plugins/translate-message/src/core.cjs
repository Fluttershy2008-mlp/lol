// SPDX-License-Identifier: GPL-3.0-or-later
// Vencord incoming translation settings and message selection adapted for Valenced.
// The v1 session/cancellation utilities were originally MIT licensed.
'use strict';

// Vencord language settings adapted to Valenced, with v1 preferences migrated.
const LANGUAGES = Object.freeze(Object.entries(GoogleLanguages).filter(([code]) => code !== 'auto').map(Object.freeze));
const DEFAULTS = Object.freeze({
    receivedInput: 'auto', receivedOutput: 'en', sentInput: 'auto', sentOutput: 'en',
    service: 'google', deeplApiKey: '', kagiSession: '', autoTranslate: false,
    showAutoTranslateTooltip: true, showToasts: true, displayMode: 'replace',
});
function languageTable(service = 'google') {
    return service === 'kagi' ? KagiLanguages : service.startsWith('deepl') ? DeeplLanguages : GoogleLanguages;
}
function languageName(code, service = 'google') {
    const table = languageTable(service), lowered = String(code ?? '').toLowerCase();
    return table[code] ?? table[lowered] ?? GoogleLanguages[lowered] ?? (lowered === 'en' ? 'English' : lowered === 'zh' ? 'Chinese' : String(code ?? 'Unknown language'));
}
function normalizeSettings(value) {
    value ??= {};
    const service = ['google', 'deepl', 'deepl-pro', 'kagi'].includes(value.service) ? value.service : 'google';
    const table = languageTable(service), deep = service.startsWith('deepl');
    const defaults = { ...DEFAULTS, service,
        receivedInput: deep ? '' : 'auto', sentInput: deep ? '' : 'auto',
        receivedOutput: deep ? 'en-us' : service === 'kagi' ? 'en_us' : 'en',
        sentOutput: deep ? 'en-us' : service === 'kagi' ? 'en_us' : 'en' };
    const result = { ...defaults };
    for (const key of ['receivedInput', 'receivedOutput', 'sentInput', 'sentOutput']) {
        const candidate = value[key] ?? (key === 'receivedOutput' ? value.target : undefined);
        if (typeof candidate === 'string' && Object.prototype.hasOwnProperty.call(table, candidate)
            && (key.endsWith('Input') || (candidate !== 'auto' && candidate !== ''))) result[key] = candidate;
    }
    for (const key of ['autoTranslate', 'showAutoTranslateTooltip', 'showToasts'])
        if (typeof value[key] === 'boolean') result[key] = value[key];
    for (const key of ['deeplApiKey', 'kagiSession'])
        if (typeof value[key] === 'string') result[key] = value[key].trim().slice(0, 4096);
    // Always use the v1.0.2 inline display, including saved v2.0.0 preferences.
    result.displayMode = 'replace';
    return result;
}
// Adapted from Vencord Translate/index.tsx getMessageContent.
function getMessageContent(message) {
    return message?.content || message?.messageSnapshots?.[0]?.message?.content
        || message?.message_snapshots?.[0]?.message?.content
        || message?.embeds?.find(embed => embed.type === 'auto_moderation_message')?.rawDescription || '';
}
const refKey = ref => ref.channelId + ':' + ref.messageId;
const validId = value => typeof value === 'string' && /^\d{16,22}$/.test(value);
const cancelled = () => Object.assign(new Error('Cancelled'), { code: 'CANCELLED' });
const failure = (code, message) => Object.assign(new Error(message), { code });

function abortController(env) {
    if (typeof env.AbortController === 'function') return new env.AbortController();
    const subscribers = new Set();
    const signal = { aborted: false,
        addEventListener(type, fn) { if (type === 'abort') subscribers.add(fn); },
        removeEventListener(type, fn) { if (type === 'abort') subscribers.delete(fn); } };
    return { signal, abort() {
        if (signal.aborted) return;
        signal.aborted = true;
        for (const notify of [...subscribers]) notify();
        subscribers.clear();
    } };
}

// Keep code, spoilers, mentions, emoji IDs and link destinations byte-for-byte.
// The service only receives ordinary message text and opaque placeholders.
function protectText(text) {
    let prefix = '__VLT_';
    while (text.includes(prefix)) prefix += 'X';
    const values = [];
    const pattern = /```[\s\S]*?(?:```|$)|`+[^`\n]*`+|\|\|[\s\S]*?(?:\|\||$)|<(?:(?:@!?|@&|#)\d+|a?:[A-Za-z0-9_]+:\d+|t:\d+(?::[A-Za-z])?|https?:\/\/[^>]+)>|https?:\/\/[^\s<>\])]+|\]\([^\n)]*\)|@(?:everyone|here|silent)\b/g;
    const protectedText = text.replace(pattern, value => {
        const token = prefix + values.length + '__';
        values.push({ token, value });
        return token;
    });
    return {
        text: protectedText,
        hasProse: /[\p{L}\p{N}]/u.test(protectedText.replace(new RegExp(prefix + '\\d+__', 'g'), '')),
        restore(translated) {
            for (const { token } of values) {
                if (translated.split(token).length !== 2)
                    throw failure('FORMATTING', 'Translation could not preserve the message formatting. Original kept.');
            }
            let result = translated;
            for (const { token, value } of values) result = result.replace(token, () => value);
            return result;
        },
    };
}

function splitText(text, max = 1100) {
    const chunks = [];
    while (text.length > max) {
        let end = max;
        // Never split a surrogate pair or a placeholder.
        if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
        const marker = text.lastIndexOf('__VLT_', end);
        if (marker >= 0 && text.indexOf('__', marker + 6) + 2 > end) end = marker;
        let boundary = -1;
        for (let i = end - 1; i >= Math.floor(end / 2); i--) {
            if (/\s/.test(text[i])) { boundary = i + 1; break; }
        }
        if (boundary > 0) end = boundary;
        if (!end) throw failure('LENGTH', 'This message contains an unusually long protected section.');
        chunks.push(text.slice(0, end)); text = text.slice(end);
    }
    if (text) chunks.push(text);
    return chunks;
}

function createController(io, env = globalThis) {
    const entries = new Map(), pending = new Map(), cache = new Map();
    let active = true, disposing = false, account = io.account(), settings = normalizeSettings(io.settings);
    const emit = () => io.changed?.();
    const tell = (message, important = false) => { if (active && (important || settings.showToasts)) io.notify(message); };
    function reset() {
        for (const operation of pending.values()) operation.cancel();
        pending.clear(); entries.clear(); cache.clear(); emit();
    }
    function live() {
        if (!active) return false;
        const next = io.account();
        if (next !== account) { reset(); account = next; }
        return Boolean(account);
    }
    const read = ref => { try { return io.message(ref); } catch { return undefined; } };
    function entryFor(ref) {
        const key = refKey(ref), entry = entries.get(key);
        if (entry && read(ref)?.content !== entry.text) { entries.delete(key); emit(); return undefined; }
        return entry;
    }
    function invalidate(key) {
        pending.get(key)?.cancel(); pending.delete(key); entries.delete(key);
    }
    async function revert(ref, announce = true) {
        if (!live()) return false;
        const key = refKey(ref), busy = pending.has(key), entry = entryFor(ref);
        pending.get(key)?.cancel(); pending.delete(key);
        if (!entry) {
            emit();
            if (announce) tell(busy ? 'Translation cancelled.' : 'This message is already showing its original text.');
            return busy;
        }
        try {
            await io.display(ref, entry.original);
            if (read(ref)?.content !== entry.original) throw failure('DISPLAY', 'Could not restore this message. Reopen the channel to refresh it.');
            if (entries.get(key) === entry) entries.delete(key);
            emit();
            if (announce) tell('Original message restored.');
            return true;
        } catch (error) {
            if (announce) tell(error.code === 'DISPLAY' ? error.message : 'Could not restore this message. Reopen the channel to refresh it.', true);
            return false;
        }
    }
    async function translate(ref) {
        if (disposing || !live()) return false;
        const key = refKey(ref);
        if (pending.has(key)) { tell('This message is already being translated.'); return false; }
        const current = read(ref), previous = entryFor(ref), target = settings.receivedOutput;
        const configKey = settings.service + ':' + settings.receivedInput + ':' + target;
        if (!current || !getMessageContent(current).trim()) { tell('This message has no text to translate.', true); return false; }
        if (pending.size >= 2) { tell('Please wait for your other translations to finish.', true); return false; }
        if (!previous && entries.size >= 100) { tell('Revert some translated messages before translating more.', true); return false; }
        if (previous?.configKey === configKey) { tell('Already translated to ' + languageName(target) + '.'); return true; }
        const original = previous?.originalText ?? getMessageContent(current);
        const originalDisplay = previous?.original ?? current.content ?? '';
        const aborter = abortController(env);
        let wasCancelled = false;
        const operation = { cancel() { wasCancelled = true; aborter?.abort(); } };
        const owner = account, before = current.content ?? '', beforeSource = getMessageContent(current);
        const stillCurrent = () => live() && owner === account && !wasCancelled
            && pending.get(key) === operation && (read(ref)?.content ?? '') === before && getMessageContent(read(ref)) === beforeSource;
        pending.set(key, operation); emit();
        try {
            const cacheKey = configKey + '\0' + original;
            let result = cache.get(cacheKey);
            if (!result) {
                result = await io.translate(original, target, aborter?.signal, { source: settings.receivedInput, service: settings.service, settings: { ...settings } });
                if (!stillCurrent()) return false;
                if (!result || typeof result.text !== 'string' || !result.text.trim()) throw failure('PROVIDER', 'No translation was returned. Original kept.');
                if (cache.size >= 30) cache.delete(cache.keys().next().value);
                cache.set(cacheKey, result);
            }
            if (!stillCurrent()) return false;
            if (result.text === original) {
                pending.delete(key);
                if (previous) await revert(ref, false);
                tell('No change needed. The message may already be in ' + languageName(target) + '.');
                return true;
            }
            const source = result.sourceLanguage ?? languageName(result.source ?? settings.receivedInput, settings.service);
            const display = result.text;
            const entry = { ...ref, original: originalDisplay, originalText: original, translation: result.text, text: display, target, source, configKey };
            entries.set(key, entry);
            try {
                await io.display(ref, display);
                if (!live() || owner !== account || wasCancelled) return false;
                if (read(ref)?.content !== display) {
                    if (entries.get(key) === entry) entries.delete(key);
                    throw failure('DISPLAY', 'This Discord build could not display the translation. Original kept.');
                }
            } catch (error) {
                if (entries.get(key) === entry && read(ref)?.content !== display) entries.delete(key);
                throw error;
            }
            // Match v1.0.2: successful translations are silent.
            return true;
        } catch (error) {
            if (!wasCancelled && live() && owner === account)
                tell(error?.code && error.code !== 'CANCELLED' ? error.message : 'Translation failed. Check your connection and try again.', true);
            return false;
        } finally {
            if (pending.get(key) === operation) pending.delete(key);
            emit();
        }
    }
    async function restoreAll() {
        if (!live()) return;
        for (const operation of pending.values()) operation.cancel();
        pending.clear();
        for (const entry of [...entries.values()]) await revert(entry, false);
        cache.clear(); emit();
    }
    function onEvent(event) {
        if (!active) return event;
        if (['LOGOUT', 'LOGIN_SUCCESS'].includes(event.type)) { reset(); return event; }
        if (!live()) return event;
        const message = event.message;
        const channelId = message?.channel_id ?? message?.channelId ?? event.channelId ?? event.channel_id;
        const messageId = message?.id ?? event.messageId ?? event.id;
        if (event.type === 'MESSAGE_UPDATE' && message && (Object.prototype.hasOwnProperty.call(message, 'content') || message.messageSnapshots || message.message_snapshots || message.embeds?.some(embed => embed.type === 'auto_moderation_message'))) {
            invalidate(channelId + ':' + messageId); emit();
        } else if (event.type === 'MESSAGE_DELETE') {
            invalidate(channelId + ':' + messageId); emit();
        } else if (event.type === 'MESSAGE_DELETE_BULK') {
            for (const id of event.ids ?? event.messageIds ?? []) invalidate(channelId + ':' + id);
            emit();
        } else if (['LOAD_MESSAGES_SUCCESS', 'LOAD_MESSAGES_AROUND_SUCCESS', 'LOAD_RECENT_MESSAGES_SUCCESS'].includes(event.type)) {
            for (const item of Array.isArray(event.messages) ? event.messages : [])
                invalidate((item.channel_id ?? channelId) + ':' + item.id);
            emit();
        } else if (['MESSAGE_START_EDIT', 'MESSAGE_EDIT_START'].includes(event.type)) {
            const ref = { channelId, messageId }, entry = entryFor(ref);
            if (entry) {
                // Keep edit drafts in the original language, including keyboard shortcuts.
                const corrected = { ...event, content: entry.original };
                if (message) corrected.message = { ...message, content: entry.original };
                Promise.resolve().then(() => revert(ref, false));
                return corrected;
            }
        }
        return event;
    }
    return {
        translate, revert, restoreAll, onEvent,
        settings: () => settings,
        configure(value) { settings = normalizeSettings(value); emit(); },
        status(ref) { live(); return { entry: entryFor(ref), pending: pending.has(refKey(ref)) }; },
        stats() { live(); return { translated: entries.size, pending: pending.size, cached: cache.size }; },
        clearCache() { cache.clear(); emit(); },
        async dispose() { if (!active || disposing) return; disposing = true; await restoreAll(); active = false; reset(); },
    };
}

// NODE_EXPORTS
module.exports = { LANGUAGES, DEFAULTS, languageName, normalizeSettings, refKey, validId, abortController,
    protectText, splitText, languageTable, getMessageContent, createController };
