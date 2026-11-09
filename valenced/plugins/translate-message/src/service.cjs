/*
 * Adapted from Vencord Translate/utils.ts and native.ts.
 * Copyright (c) 2023-2026 Vendicated and contributors.
 * SPDX-License-Identifier: GPL-3.0-or-later
 * React Native transport, cancellation and protected markup added for Valenced.
 */
'use strict';

const GOOGLE_TRANSLATE_PUBLIC_KEY = 'AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA';
function createVencordTranslator(env = globalThis, notice = () => {}) {
    let quotaNoticed = false;
    async function request(url, options, signal) {
        if (signal?.aborted) throw cancelled();
        if (typeof env.fetch !== 'function') throw failure('NETWORK', 'Translation networking is unavailable.');
        const native = typeof env.AbortController === 'function' ? new env.AbortController() : undefined;
        let timer, abort;
        const stopped = new Promise((_, reject) => {
            abort = () => { native?.abort(); reject(cancelled()); };
            signal?.addEventListener?.('abort', abort, { once: true });
            timer = env.setTimeout(() => {
                native?.abort();
                reject(failure('TIMEOUT', 'Translation timed out. Check your connection and try again.'));
            }, 12000);
        });
        try {
            return await Promise.race([
                (async () => {
                    const response = await env.fetch(url, { credentials: 'omit', ...options,
                        ...(native ? { signal: native.signal } : {}) });
                    const status = Number(response.status);
                    if (status === 429) throw failure('RATE_LIMIT', 'The translation service is busy. Wait a moment and try again.');
                    let data;
                    if (response.ok) {
                        try { data = await response.json(); }
                        catch { throw failure('PROVIDER', 'The translation service returned an unreadable response.'); }
                    }
                    return { ok: response.ok, status, data };
                })(), stopped,
            ]);
        } catch (error) {
            if (signal?.aborted) throw cancelled();
            if (error?.code) throw error;
            throw failure('NETWORK', 'Could not reach the translation service. Check your connection and try again.');
        } finally {
            env.clearTimeout(timer);
            signal?.removeEventListener?.('abort', abort);
        }
    }
    function result(text, source, table) {
        if (typeof text !== 'string' || !text.trim() || text.length > 24000)
            throw failure('PROVIDER', 'The translation service returned an invalid translation.');
        const code = typeof source === 'string' ? source : '';
        const name = table[code] ?? table[code.toLowerCase()] ?? GoogleLanguages[code.toLowerCase()] ?? code;
        return { text, sourceLanguage: String(name || 'Unknown language').replace(/[\r\n<>]/g, '').slice(0, 100) };
    }
    async function googleTranslate(text, sourceLang, targetLang, signal) {
        // These endpoint, parameters and public client key are from Vencord's googleTranslate.
        const params = {
            'params.client': 'gtx', dataTypes: 'TRANSLATION', key: GOOGLE_TRANSLATE_PUBLIC_KEY,
            'query.sourceLanguage': sourceLang, 'query.targetLanguage': targetLang, 'query.text': text,
        };
        const url = 'https://translate-pa.googleapis.com/v1/translate?' + Object.entries(params)
            .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
        const response = await request(url, { method: 'GET', headers: { Accept: 'application/json' } }, signal);
        if (!response.ok) throw failure('NETWORK', 'Google Translate is unavailable (' + response.status + ').');
        return result(response.data?.translation, response.data?.sourceLanguage, GoogleLanguages);
    }
    function fallbackToGoogle(text, sourceLang, targetLang, signal) {
        return googleTranslate(text, deeplLanguageToGoogleLanguage(sourceLang), deeplLanguageToGoogleLanguage(targetLang), signal);
    }
    async function deeplTranslate(text, sourceLang, targetLang, config, signal) {
        if (!config.deeplApiKey) {
            notice('DeepL API key is not set. Using Google Translate.');
            return fallbackToGoogle(text, sourceLang, targetLang, signal);
        }
        if (/[\r\n]/.test(config.deeplApiKey)) throw failure('AUTH', 'The DeepL API key contains an invalid line break.');
        const url = config.service === 'deepl-pro' ? 'https://api.deepl.com/v2/translate' : 'https://api-free.deepl.com/v2/translate';
        const body = { text: [text], target_lang: targetLang.toUpperCase() };
        // DeepL autodetection is represented by the empty source option in Vencord.
        if (sourceLang) body.source_lang = sourceLang.split('-')[0].toUpperCase();
        const response = await request(url, { method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'DeepL-Auth-Key ' + config.deeplApiKey },
            body: JSON.stringify(body) }, signal);
        if (response.status === 456) {
            if (!quotaNoticed) { notice('DeepL API quota exceeded. Falling back to Google Translate.'); quotaNoticed = true; }
            return fallbackToGoogle(text, sourceLang, targetLang, signal);
        }
        if (response.status === 403) throw failure('AUTH', 'Invalid DeepL API key or Free/Pro selection.');
        if (!response.ok) throw failure('PROVIDER', 'DeepL could not translate this message (' + response.status + ').');
        const first = response.data?.translations?.[0];
        return result(first?.text, first?.detected_source_language, DeeplLanguages);
    }
    async function kagiTranslate(text, sourceLang, targetLang, config, signal) {
        if (!config.kagiSession) throw failure('AUTH', 'Enter your Kagi session token in the plugin settings first.');
        if (/[\r\n;]/.test(config.kagiSession)) throw failure('AUTH', 'The Kagi session token has an invalid format.');
        const response = await request('https://translate.kagi.com/api/translate', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'kagi_session=' + config.kagiSession },
            body: JSON.stringify({ text, from: sourceLang, to: targetLang }),
        }, signal);
        if (response.status === 401) throw failure('AUTH', 'The Kagi session token is invalid or expired.');
        if (!response.ok) throw failure('PROVIDER', 'Kagi could not translate this message (' + response.status + ').');
        return result(response.data?.translation, response.data?.detected_language?.label, KagiLanguages);
    }
    return async function translate(kind, original, values, signal) {
        const config = normalizeSettings(values);
        const source = config[kind === 'sent' ? 'sentInput' : 'receivedInput'];
        const target = config[kind === 'sent' ? 'sentOutput' : 'receivedOutput'];
        if (typeof original !== 'string' || original.length > 8000)
            throw failure('LENGTH', 'This message is too long to translate (maximum 8,000 characters).');
        const protectedMessage = protectText(original);
        if (!protectedMessage.hasProse) {
            if (kind === 'sent') return { text: original, sourceLanguage: languageName(source, config.service) };
            throw failure('NO_TEXT', 'There is no ordinary text to translate in this message.');
        }
        let text = '', sourceLanguage;
        for (const chunk of splitText(protectedMessage.text)) {
            if (signal?.aborted) throw cancelled();
            const [, leading, middle, trailing] = /^(\s*)([\s\S]*?)(\s*)$/.exec(chunk);
            if (!middle) { text += chunk; continue; }
            const part = config.service === 'google' ? await googleTranslate(middle, source, target, signal)
                : config.service === 'kagi' ? await kagiTranslate(middle, source, target, config, signal)
                : await deeplTranslate(middle, source, target, config, signal);
            if (signal?.aborted) throw cancelled();
            text += leading + part.text + trailing;
            sourceLanguage ??= part.sourceLanguage;
        }
        return { text: protectedMessage.restore(text), sourceLanguage: sourceLanguage ?? 'Unknown language' };
    };
}

// Compatibility helper for the v1 transport's test and developer interface.
function createTranslator(env = globalThis) {
    const service = createVencordTranslator(env);
    return async (text, target, signal) => {
        const result = await service('received', text, { receivedOutput: target }, signal);
        return { ...result, source: result.sourceLanguage };
    };
}

// NODE_EXPORTS
module.exports = { createVencordTranslator, createTranslator };
