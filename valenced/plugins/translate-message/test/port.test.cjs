'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVencordTranslator, createOutgoingController, normalizeSettings, languageTable,
    getMessageContent, createController } = require('./load.cjs');
const CHANNEL = '300000000000000001', ACCOUNT = '200000000000000001';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

function provider(fetch) {
    const requests = [], notices = [], timers = new Map(); let serial = 0;
    const env = { AbortController,
        setTimeout(fn) { const id = ++serial; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
        async fetch(url, options) { requests.push({ url, options }); return fetch(url, options); },
    };
    return { requests, notices, timers, translate: createVencordTranslator(env, value => notices.push(value)) };
}

test('ported settings expose separate incoming/outgoing pairs and safe provider defaults', () => {
    const config = normalizeSettings({ receivedInput: 'fr', receivedOutput: 'en', sentInput: 'en', sentOutput: 'nl', autoTranslate: true });
    assert.equal(config.receivedInput, 'fr'); assert.equal(config.receivedOutput, 'en');
    assert.equal(config.sentInput, 'en'); assert.equal(config.sentOutput, 'nl'); assert.equal(config.autoTranslate, true);
    for (const service of ['google', 'deepl', 'deepl-pro', 'kagi']) {
        const value = normalizeSettings({ service }), table = languageTable(service);
        assert.ok(Object.hasOwn(table, value.receivedInput)); assert.ok(Object.hasOwn(table, value.receivedOutput));
        assert.ok(Object.hasOwn(table, value.sentInput)); assert.ok(Object.hasOwn(table, value.sentOutput));
        assert.notEqual(value.sentOutput, 'auto'); assert.notEqual(value.sentOutput, '');
    }
});

test('Google uses the Vencord endpoint and selected direction without leaking optional credentials', async () => {
    const p = provider(async () => response({ translation: 'Hallo', sourceLanguage: 'en' }));
    const config = { receivedOutput: 'fr', sentInput: 'en', sentOutput: 'nl', deeplApiKey: 'test-deepl-secret', kagiSession: 'test-kagi-secret' };
    const result = await p.translate('sent', 'Hello', config);
    const request = p.requests[0], url = new URL(request.url);
    assert.equal(url.origin + url.pathname, 'https://translate-pa.googleapis.com/v1/translate');
    assert.equal(url.searchParams.get('params.client'), 'gtx');
    assert.equal(url.searchParams.get('dataTypes'), 'TRANSLATION');
    assert.ok(url.searchParams.get('key'));
    assert.equal(url.searchParams.get('query.sourceLanguage'), 'en');
    assert.equal(url.searchParams.get('query.targetLanguage'), 'nl');
    assert.equal(result.text, 'Hallo'); assert.equal(result.sourceLanguage, 'English');
    assert.equal(JSON.stringify(request).includes('test-deepl-secret'), false);
    assert.equal(JSON.stringify(request).includes('test-kagi-secret'), false);
    assert.equal(p.timers.size, 0);
});

for (const service of ['deepl', 'deepl-pro']) test(service + ' ports the native request to React Native transport', async () => {
    const p = provider(async () => response({ translations: [{ text: 'Hallo', detected_source_language: 'EN' }] }));
    const result = await p.translate('sent', 'Hello', { service, deeplApiKey: 'test-key', sentInput: '', sentOutput: 'nl' });
    const request = p.requests[0], body = JSON.parse(request.options.body);
    assert.equal(new URL(request.url).hostname, service === 'deepl' ? 'api-free.deepl.com' : 'api.deepl.com');
    assert.equal(request.options.headers.Authorization, 'DeepL-Auth-Key test-key');
    assert.deepEqual(body, { text: ['Hello'], target_lang: 'NL' });
    assert.equal(result.text, 'Hallo'); assert.equal(result.sourceLanguage, 'English');
});

test('DeepL fixed source strips regional suffix while target retains it', async () => {
    const p = provider(async () => response({ translations: [{ text: 'Hello', detected_source_language: 'EN' }] }));
    await p.translate('sent', 'Hello', { service: 'deepl', deeplApiKey: 'test-key', sentInput: 'en-gb', sentOutput: 'en-us' });
    assert.equal(JSON.parse(p.requests[0].options.body).source_lang, 'EN');
    assert.equal(JSON.parse(p.requests[0].options.body).target_lang, 'EN-US');
});

test('DeepL quota fallback follows Vencord and converts language identifiers', async () => {
    const p = provider(async url => url.includes('deepl.com') ? response(null, 456) : response({ translation: 'Hello', sourceLanguage: 'fr' }));
    const config = { service: 'deepl', deeplApiKey: 'test-key', sentInput: '', sentOutput: 'en-us' };
    await p.translate('sent', 'Bonjour', config); await p.translate('sent', 'Salut', config);
    assert.equal(p.requests.length, 4); assert.equal(p.notices.length, 1);
    const fallback = p.requests[1];
    assert.equal(new URL(fallback.url).searchParams.get('query.sourceLanguage'), 'auto');
    assert.equal(new URL(fallback.url).searchParams.get('query.targetLanguage'), 'en');
    assert.equal(fallback.options.headers.Authorization, undefined);
});

test('DeepL missing key falls back with a notice while an invalid key does not', async () => {
    const p = provider(async url => response({ translation: 'Hello', sourceLanguage: 'fr' }));
    await p.translate('received', 'Bonjour', { service: 'deepl' });
    assert.equal(p.requests.length, 1); assert.ok(p.requests[0].url.includes('googleapis.com'));
    assert.ok(p.notices[0].includes('not set'));
    const bad = provider(async () => response(null, 403));
    await assert.rejects(bad.translate('received', 'Bonjour', { service: 'deepl', deeplApiKey: 'wrong' }), { code: 'AUTH' });
    assert.equal(bad.requests.length, 1);
});

test('Kagi ports the session cookie, language pair and detected-language response', async () => {
    const p = provider(async () => response({ translation: 'Hallo', detected_language: { label: 'English' } }));
    const result = await p.translate('sent', 'Hello', { service: 'kagi', kagiSession: 'test-session', sentInput: 'auto', sentOutput: 'nl' });
    const request = p.requests[0];
    assert.equal(request.url, 'https://translate.kagi.com/api/translate');
    assert.equal(request.options.headers.Cookie, 'kagi_session=test-session');
    assert.deepEqual(JSON.parse(request.options.body), { text: 'Hello', from: 'auto', to: 'nl' });
    assert.equal(result.sourceLanguage, 'English'); assert.equal(result.text, 'Hallo');
});

test('Kagi auth failures do not fall back or expose the token in errors', async () => {
    const p = provider(async () => response(null, 401));
    await assert.rejects(p.translate('sent', 'Hello', { service: 'kagi', kagiSession: 'private-test-token' }), error => error.code === 'AUTH' && !error.message.includes('private-test-token'));
    assert.equal(p.requests.length, 1);
    const missing = provider(async () => { throw new Error('must not call'); });
    await assert.rejects(missing.translate('sent', 'Hello', { service: 'kagi' }), { code: 'AUTH' });
    assert.equal(missing.requests.length, 0);
});

test('code, spoilers, reserved silent prefix and mentions survive outgoing translation', async () => {
    const p = provider(async (url) => response({ translation: new URL(url).searchParams.get('query.text').replace('Hello', 'Hallo'), sourceLanguage: 'en' }));
    const original = '@silent Hello <@123456789012345678> `doNotTranslate()` ||secret||';
    const result = await p.translate('sent', original, { sentOutput: 'nl' });
    assert.equal(result.text, original.replace('Hello', 'Hallo'));
    assert.equal(p.requests[0].url.includes('123456789012345678'), false);
    assert.equal(p.requests[0].url.includes('secret'), false);
    const before = p.requests.length;
    assert.equal((await p.translate('sent', '```code only```', {})).text, '```code only```');
    assert.equal(p.requests.length, before);
});

function outgoing(options = {}) {
    let config = normalizeSettings({ autoTranslate: true, sentOutput: 'nl', ...options.config }), account = ACCOUNT;
    const sent = [], notices = [], recovered = [], changed = [];
    const receiver = { marker: true };
    const io = { settings: () => config, account: () => account, changed: () => changed.push(true),
        translate: options.translate ?? (async () => ({ text: 'Hallo', sourceLanguage: 'English' })),
        notify: value => notices.push(value),
        async recoverDraft(channelId, text) { recovered.push({ channelId, text }); return options.restore !== false; },
    };
    const controller = createOutgoingController(io);
    function original(channelId, message, ...rest) {
        assert.equal(this, receiver); sent.push({ channelId, message, rest });
        if (options.original) return options.original();
        return 'native result';
    }
    return { controller, sent, notices, recovered, receiver, original,
        configure(value) { config = normalizeSettings({ ...config, ...value }); },
        account(value) { account = value; controller.syncAccount(); },
        send(message, ...rest) { return controller.hook([CHANNEL, message, ...rest], original, receiver); } };
}

test('outgoing auto-translation is opt-in and off preserves the native synchronous return', () => {
    const w = outgoing({ config: { autoTranslate: false }, translate() { throw new Error('must not translate'); } });
    assert.equal(w.send({ content: 'Hello' }), 'native result');
    assert.equal(w.sent[0].message.content, 'Hello');
});

test('outgoing clone changes only content and sends once with the correct receiver', async () => {
    const w = outgoing(), attachments = [{ id: 'file' }], metadata = { reply: true };
    const message = Object.freeze({ content: 'Hello', nonce: 'nonce-1', attachments, allowed_mentions: { parse: [] } });
    assert.equal(await w.send(message, metadata), 'native result');
    assert.equal(w.sent.length, 1); assert.equal(w.sent[0].message.content, 'Hallo');
    assert.equal(w.sent[0].message.attachments, attachments); assert.equal(w.sent[0].rest[0], metadata);
    assert.equal(message.content, 'Hello');
});

test('duplicate native calls with the same nonce share translation and send', async () => {
    const result = deferred(); let calls = 0;
    const w = outgoing({ translate() { calls++; return result.promise; } });
    const first = w.send({ content: 'Hello', nonce: 'same' });
    const second = w.send({ content: 'Hello', nonce: 'same' });
    assert.equal(first, second);
    result.resolve({ text: 'Hallo' }); await Promise.all([first, second]);
    assert.equal(calls, 1); assert.equal(w.sent.length, 1);
});

test('translation failure blocks sending and restores the original draft', async () => {
    const w = outgoing({ translate: async () => { throw new Error('Offline'); } });
    await assert.rejects(w.send({ content: 'Hello' }), { code: 'TRANSLATION_SEND_FAILED' });
    assert.equal(w.sent.length, 0); assert.equal(w.recovered[0].text, 'Hello');
    assert.equal(w.controller.recoveries().length, 0);
});

test('when a new draft cannot be replaced, original text remains recoverable in memory', async () => {
    const w = outgoing({ restore: false, translate: async () => { throw new Error('Offline'); } });
    await assert.rejects(w.send({ content: 'Hello' }));
    assert.equal(w.controller.recoveries()[0].content, 'Hello');
    w.controller.forgetRecovery(0); assert.equal(w.controller.recoveries().length, 0);
});

test('stopping blocks a pending outgoing send even if the transport ignores cancellation', async () => {
    const result = deferred(), w = outgoing({ translate: () => result.promise });
    const work = w.send({ content: 'Hello' });
    const rejection = assert.rejects(work, { code: 'CANCELLED' });
    await w.controller.dispose(); await rejection;
    result.resolve({ text: 'Too late' }); await Promise.resolve();
    assert.equal(w.sent.length, 0); assert.equal(w.recovered[0].text, 'Hello');
});

test('account switching never sends or restores another account’s pending message', async () => {
    const result = deferred(), w = outgoing({ translate: () => result.promise });
    const work = w.send({ content: 'Hello' }), rejection = assert.rejects(work, { code: 'CANCELLED' });
    w.account('200000000000000002'); await rejection;
    result.resolve({ text: 'Too late' });
    assert.equal(w.sent.length, 0); assert.equal(w.recovered.length, 0);
});

test('changing the outgoing language or disabling auto prevents an old-target send', async () => {
    for (const update of [{ sentOutput: 'fr' }, { autoTranslate: false }]) {
        const result = deferred(), w = outgoing({ translate: () => result.promise });
        const work = w.send({ content: 'Hello' });
        w.configure(update); result.resolve({ text: 'Hallo' });
        await assert.rejects(work, { code: 'CANCELLED' });
        assert.equal(w.sent.length, 0);
    }
});

test('native send failure is passed through without resending or replacing a draft', async () => {
    const nativeError = new Error('Native request failed');
    const w = outgoing({ original: () => Promise.reject(nativeError) });
    await assert.rejects(w.send({ content: 'Hello' }), error => error === nativeError);
    assert.equal(w.sent.length, 1); assert.equal(w.recovered.length, 0);
});

test('forwarded snapshots and moderation text follow the original Vencord selector', () => {
    assert.equal(getMessageContent({ content: '', messageSnapshots: [{ message: { content: 'Forwarded' } }] }), 'Forwarded');
    assert.equal(getMessageContent({ content: '', message_snapshots: [{ message: { content: 'Forwarded RN' } }] }), 'Forwarded RN');
    assert.equal(getMessageContent({ content: '', embeds: [{ type: 'auto_moderation_message', rawDescription: 'Moderated' }] }), 'Moderated');
});

test('inline translation replaces text and Revert restores forwarded empty content', async () => {
    for (const record of [
        { content: 'Bonjour' },
        { content: '', messageSnapshots: [{ message: { content: 'Bonjour' } }] },
    ]) {
        let current = record;
        const ref = { channelId: CHANNEL, messageId: '400000000000000001' };
        const controller = createController({ account: () => ACCOUNT, settings: {}, message: () => current,
            translate: async () => ({ text: 'Hello', sourceLanguage: 'French' }), notify() {},
            display(_ref, content) { current = { ...current, content }; } });
        await controller.translate(ref);
        assert.equal(current.content, 'Hello');
        await controller.revert(ref); assert.equal(current.content, record.content);
    }
});
