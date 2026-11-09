'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LANGUAGES, normalizeSettings, protectText, splitText,     createTranslator, createController, DEFAULTS } = require('./load.cjs');
const CHANNEL = '300000000000000001', MESSAGE = '400000000000000001';
const REF = { channelId: CHANNEL, messageId: MESSAGE };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function world(options = {}) {
    const records = new Map([[CHANNEL + ':' + MESSAGE, { id: MESSAGE, channel_id: CHANNEL, content: 'Bonjour', attachments: [{ id: 'attachment' }], editedTimestamp: null }]]);
    const calls = [], notices = [], events = [];
    let account = '200000000000000001';
    const controller = createController({
        account: () => account, message: ref => records.get(ref.channelId + ':' + ref.messageId),
        notify: value => notices.push(value), settings: { target: 'en', ...options.settings },
        translate: async (...args) => { calls.push(args); return options.translate ? options.translate(...args) : { text: 'Hello', source: 'fr' }; },
        display(ref, content) {
            if (options.rejectDisplay) throw new Error('Display unavailable');
            events.push({ ref, content });
            const key = ref.channelId + ':' + ref.messageId;
            if (records.has(key)) records.set(key, { ...records.get(key), content });
        },
    }, options.env ?? globalThis);
    return { controller, records, calls, notices, events,
        read: () => records.get(CHANNEL + ':' + MESSAGE),
        account(value) { account = value; },
        remote(event) {
            const patched = controller.onEvent(event);
            if (event.type === 'MESSAGE_UPDATE') {
                const key = event.message.channel_id + ':' + event.message.id;
                records.set(key, { ...records.get(key), ...event.message });
            } else if (event.type === 'MESSAGE_DELETE') records.delete(CHANNEL + ':' + event.id);
            return patched;
        },
    };
}

test('133 upstream target languages and corrupt settings have safe defaults', () => {
    assert.equal(LANGUAGES.length, 133);
    assert.equal(new Set(LANGUAGES.map(item => item[0])).size, 133);
    assert.deepEqual(normalizeSettings({ target: '../../bad', showToasts: 'false', token: 'ignore' }), { ...DEFAULTS });
    assert.deepEqual(normalizeSettings({ target: 'ms', showToasts: false }), { ...DEFAULTS, receivedOutput: 'ms', showToasts: false, displayMode: 'replace' });
});

test('protect and restore mentions, emoji, links, code, spoilers, timestamps and broadcasts', () => {
    const tokens = ['<@123456789012345678>', '<@!123456789012345678>', '<@&123456789012345678>',
        '<#123456789012345678>', '<:pony:123456789012345678>', '<a:pony:123456789012345678>',
        '<t:1793375464:R>', '<https://example.com/one>', 'https://example.com/two', '`x = 5`',
        '```js\nconst x = 5;\n```', '||private spoiler||', '@everyone', '@here'];
    const original = 'Bonjour ' + tokens.join(' ') + ' [site](https://example.com/three)';
    const protectedMessage = protectText(original);
    for (const value of tokens) assert.equal(protectedMessage.text.includes(value), false, value);
    assert.equal(protectedMessage.hasProse, true);
    assert.equal(protectedMessage.restore(protectedMessage.text.replace('Bonjour', 'Hello')), original.replace('Bonjour', 'Hello'));
});

test('protects unfinished code and spoilers and avoids pre-existing placeholder strings', () => {
    for (const original of ['Bonjour ```secret', 'Bonjour ||secret', 'Bonjour __VLT_0__ `secret`']) {
        const protectedMessage = protectText(original);
        assert.equal(protectedMessage.restore(protectedMessage.text), original);
        assert.equal(protectedMessage.text.includes('secret'), false);
    }
    assert.equal(protectText('```all code``` ||all spoiler|| <@123456789012345678>').hasProse, false);
});

test('missing and duplicated placeholders fail closed', () => {
    const item = protectText('Bonjour <@123456789012345678>');
    assert.throws(() => item.restore('Hello'), { code: 'FORMATTING' });
    assert.throws(() => item.restore(item.text + item.text), { code: 'FORMATTING' });
    assert.equal(item.restore(item.text), 'Bonjour <@123456789012345678>');
});

test('chunking reconstructs long Unicode text exactly without splitting protected tokens', () => {
    const source = '你好🌈 bonjour '.repeat(700) + '<@123456789012345678>';
    const protectedMessage = protectText(source);
    const chunks = splitText(protectedMessage.text);
    assert.equal(chunks.join(''), protectedMessage.text);
    for (const chunk of chunks) {
        assert.ok(chunk.length <= 1100);
        assert.equal(/[\uD800-\uDBFF]$/.test(chunk), false);
        assert.equal(/^[\uDC00-\uDFFF]/.test(chunk), false);
    }
    const edge = 'x'.repeat(1093) + ' __VLT_0__ xyz';
    const edgeChunks = splitText(edge);
    assert.equal(edgeChunks.join(''), edge);
    assert.equal(edgeChunks.filter(x => x.includes('__VLT_0__')).length, 1);
});

function network(fetch, nativeAbort = true) {
    const timers = new Map(); let serial = 0;
    return { timers, env: { fetch,
        ...(nativeAbort ? { AbortController } : {}),
        setTimeout(fn) { const id = ++serial; timers.set(id, fn); return id; },
        clearTimeout(id) { timers.delete(id); },
    }, expire() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } } };
}
const response = (text, source = 'fr') => ({ ok: true, status: 200, json: async () => ({ translation: text, sourceLanguage: source }) });

test('translation sends only protected text, uses HTTPS and omits credentials', async () => {
    const requests = [];
    const n = network(async (url, options) => {
        requests.push({ url, options });
        const q = new URL(url).searchParams.get('query.text');
        return response(q.replace('Bonjour', 'Hello'));
    });
    const translate = createTranslator(n.env);
    const text = '  Bonjour <@123456789012345678> ||secret|| https://example.com/private\n';
    const result = await translate(text, 'en');
    assert.equal(result.text, text.replace('Bonjour', 'Hello'));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.credentials, 'omit');
    assert.deepEqual(requests[0].options.headers, { Accept: 'application/json' });
    const url = new URL(requests[0].url);
    assert.equal(url.origin, 'https://translate-pa.googleapis.com');
    assert.equal(url.searchParams.get('query.sourceLanguage'), 'auto');
    assert.equal(url.searchParams.get('query.targetLanguage'), 'en');
    assert.equal(url.searchParams.get('query.text').includes('123456789012345678'), false);
    assert.equal(url.searchParams.get('query.text').includes('secret'), false);
    assert.equal(url.searchParams.get('query.text').includes('example.com'), false);
    assert.equal(n.timers.size, 0);
});

test('long messages use sequential bounded requests and preserve line breaks', async () => {
    let inFlight = 0, highest = 0, requests = 0;
    const n = network(async url => {
        inFlight++; highest = Math.max(highest, inFlight); requests++;
        await Promise.resolve();
        const q = new URL(url).searchParams.get('query.text');
        assert.ok(q.length <= 1100);
        inFlight--;
        return response(q);
    });
    const text = 'Bonjour 🌈\n'.repeat(350);
    assert.equal((await createTranslator(n.env)(text, 'ms')).text, text);
    assert.ok(requests > 1); assert.equal(highest, 1); assert.equal(n.timers.size, 0);
});

for (const [name, fetch, code] of [
    ['rate limit', async () => ({ ok: false, status: 429 }), 'RATE_LIMIT'],
    ['provider outage', async () => ({ ok: false, status: 503 }), 'NETWORK'],
    ['malformed JSON', async () => ({ ok: true, status: 200, json: async () => ({ unexpected: true }) }), 'PROVIDER'],
]) test(name + ' clears timers and preserves the original', async () => {
    const n = network(fetch);
    await assert.rejects(createTranslator(n.env)('Bonjour', 'en'), { code });
    assert.equal(n.timers.size, 0);
});

for (const nativeAbort of [true, false]) {
    test('request timeout works with native AbortController ' + nativeAbort, async () => {
        const n = network(() => new Promise(() => {}), nativeAbort);
        const work = createTranslator(n.env)('Bonjour', 'en');
        n.expire();
        await assert.rejects(work, { code: 'TIMEOUT' });
        assert.equal(n.timers.size, 0);
    });
    test('external cancellation clears timers with native AbortController ' + nativeAbort, async () => {
        const n = network(() => new Promise(() => {}), nativeAbort), controller = new AbortController();
        const work = createTranslator(n.env)('Bonjour', 'en', controller.signal);
        controller.abort();
        await assert.rejects(work, { code: 'CANCELLED' });
        assert.equal(n.timers.size, 0);
    });
}

test('code-only, whitespace-only and oversized messages do not contact the service', async () => {
    let calls = 0;
    const n = network(async () => { calls++; return response('Hello'); });
    for (const text of ['```private```', '||spoiler||', '  \n ', 'x'.repeat(8001)])
        await assert.rejects(createTranslator(n.env)(text, 'en'));
    assert.equal(calls, 0);
});

test('translate and revert only replace content and preserve message metadata', async () => {
    const w = world(), original = w.read();
    assert.equal(await w.controller.translate(REF), true);
    assert.equal(w.read().content, 'Hello');
    assert.equal(w.read().attachments, original.attachments);
    assert.equal(w.read().editedTimestamp, null);
    assert.equal(w.controller.stats().translated, 1);
    assert.equal(await w.controller.revert(REF), true);
    assert.equal(w.read().content, 'Bonjour');
    assert.equal(w.controller.stats().translated, 0);
});

test('duplicate presses never issue a second in-flight request', async () => {
    const result = deferred(), w = world({ translate: () => result.promise });
    const first = w.controller.translate(REF);
    assert.equal(await w.controller.translate(REF), false);
    assert.equal(w.calls.length, 1);
    result.resolve({ text: 'Hello' }); await first;
    assert.equal(await w.controller.translate(REF), true);
    assert.equal(w.calls.length, 1);
});

test('revert during a request cancels and ignores a late provider response', async () => {
    const result = deferred(), w = world({ translate: () => result.promise });
    const work = w.controller.translate(REF);
    assert.equal(await w.controller.revert(REF), true);
    assert.equal(w.calls[0][2].aborted, true);
    result.resolve({ text: 'Hello' });
    assert.equal(await work, false);
    assert.equal(w.read().content, 'Bonjour');
    assert.equal(w.events.length, 0);
});

test('a real edit cancels pending translations without overwriting the new content', async () => {
    const result = deferred(), w = world({ translate: () => result.promise });
    const work = w.controller.translate(REF);
    w.remote({ type: 'MESSAGE_UPDATE', message: { id: MESSAGE, channel_id: CHANNEL, content: 'Salut, edited' } });
    result.resolve({ text: 'Stale translation' }); await work;
    assert.equal(w.read().content, 'Salut, edited'); assert.equal(w.events.length, 0);
});

test('real edits invalidate originals while embed-only updates preserve revert', async () => {
    const w = world(); await w.controller.translate(REF);
    w.remote({ type: 'MESSAGE_UPDATE', message: { id: MESSAGE, channel_id: CHANNEL, embeds: [{ title: 'link preview' }] } });
    assert.equal(w.controller.stats().translated, 1);
    await w.controller.revert(REF);
    assert.equal(w.read().content, 'Bonjour');
    await w.controller.translate(REF);
    w.remote({ type: 'MESSAGE_UPDATE', message: { id: MESSAGE, channel_id: CHANNEL, content: 'Real edit' } });
    assert.equal(w.controller.stats().translated, 0);
    await w.controller.revert(REF);
    assert.equal(w.read().content, 'Real edit');
});

test('deletions and bulk deletions discard translations', async () => {
    for (const type of ['MESSAGE_DELETE', 'MESSAGE_DELETE_BULK']) {
        const w = world(); await w.controller.translate(REF);
        w.controller.onEvent({ type, channelId: CHANNEL, id: MESSAGE, ids: [MESSAGE] });
        assert.equal(w.controller.stats().translated, 0);
    }
});

test('channel reloads cancel stale requests and do not reapply translations', async () => {
    const result = deferred(), w = world({ translate: () => result.promise });
    const work = w.controller.translate(REF);
    w.controller.onEvent({ type: 'LOAD_MESSAGES_SUCCESS', channelId: CHANNEL, messages: [w.read()] });
    result.resolve({ text: 'Stale translation' }); await work;
    assert.equal(w.read().content, 'Bonjour'); assert.equal(w.events.length, 0);
});

test('account switching discards old results and originals', async () => {
    const result = deferred(), w = world({ translate: () => result.promise });
    const work = w.controller.translate(REF);
    w.account('200000000000000002');
    result.resolve({ text: 'Other account' }); await work;
    assert.equal(w.read().content, 'Bonjour'); assert.equal(w.events.length, 0);
    assert.deepEqual(w.controller.stats(), { translated: 0, pending: 0, cached: 0 });
});

test('retargeting always translates from the original and cached repeats avoid the network', async () => {
    const w = world({ translate: async (_text, target) => ({ text: target === 'en' ? 'Hello' : 'Helo' }) });
    await w.controller.translate(REF);
    w.controller.configure({ target: 'ms' }); await w.controller.translate(REF);
    assert.equal(w.calls[1][0], 'Bonjour'); assert.equal(w.read().content, 'Helo');
    await w.controller.revert(REF); await w.controller.translate(REF);
    assert.equal(w.calls.length, 2);
});

test('failed retargeting leaves the previous translation revertible', async () => {
    let attempt = 0;
    const w = world({ translate: async () => { if (attempt++) throw new Error('Offline'); return { text: 'Hello' }; } });
    await w.controller.translate(REF); w.controller.configure({ target: 'ms' });
    assert.equal(await w.controller.translate(REF), false);
    assert.equal(w.read().content, 'Hello'); await w.controller.revert(REF);
    assert.equal(w.read().content, 'Bonjour');
});

test('network/display failures preserve originals and do not claim success', async () => {
    for (const options of [{ translate: async () => { throw new Error('Offline'); } }, { rejectDisplay: true }]) {
        const w = world(options);
        assert.equal(await w.controller.translate(REF), false);
        assert.equal(w.read().content, 'Bonjour');
        assert.equal(w.controller.stats().translated, 0);
        assert.equal(w.notices.some(value => value.startsWith('Translated to')), false);
    }
});

test('native edit drafts receive the original and schedule a safe local revert', async () => {
    const w = world(); await w.controller.translate(REF);
    const payload = w.controller.onEvent({ type: 'MESSAGE_START_EDIT', channelId: CHANNEL, messageId: MESSAGE, content: 'Hello' });
    assert.equal(payload.content, 'Bonjour');
    await Promise.resolve(); await Promise.resolve();
    assert.equal(w.read().content, 'Bonjour');
});

test('completion feedback can be disabled while errors remain visible', async () => {
    const w = world({ settings: { target: 'en', showToasts: false } });
    await w.controller.translate(REF); await w.controller.revert(REF);
    assert.equal(w.notices.length, 0);
    const bad = world({ settings: { showToasts: false }, translate: async () => { throw new Error('Offline'); } });
    await bad.controller.translate(REF); assert.equal(bad.notices.length, 1);
});

test('revert all cancels pending work, restores loaded messages and clears the cache', async () => {
    const w = world(); await w.controller.translate(REF);
    await w.controller.restoreAll();
    assert.equal(w.read().content, 'Bonjour');
    assert.deepEqual(w.controller.stats(), { translated: 0, pending: 0, cached: 0 });
});

test('disable restores originals, cancels requests and prevents future actions', async () => {
    const w = world(); await w.controller.translate(REF);
    await w.controller.dispose();
    assert.equal(w.read().content, 'Bonjour');
    assert.equal(await w.controller.translate(REF), false);
    assert.equal(await w.controller.revert(REF), false);
    assert.equal(w.calls.length, 1);
});

test('no-native-abort cancellation still releases request timers when disabling', async () => {
    const n = network(() => new Promise(() => {}), false);
    const w = world({ env: n.env, translate: createTranslator(n.env) });
    const work = w.controller.translate(REF);
    assert.equal(n.timers.size, 1);
    await w.controller.dispose(); await work;
    assert.equal(n.timers.size, 0);
    assert.equal(w.read().content, 'Bonjour');
});

test('two-message concurrency limit rejects extra requests', async () => {
    const result = deferred(), w = world({ translate: () => result.promise });
    const refs = [REF, ...['400000000000000002', '400000000000000003'].map(messageId => ({ channelId: CHANNEL, messageId }))];
    for (const ref of refs) w.records.set(ref.channelId + ':' + ref.messageId, { content: 'Bonjour' });
    const first = w.controller.translate(refs[0]), second = w.controller.translate(refs[1]);
    assert.equal(await w.controller.translate(refs[2]), false);
    assert.equal(w.calls.length, 2);
    result.resolve({ text: 'Hello' }); await Promise.all([first, second]);
});

test('unnoticed external content changes cannot be overwritten by a stale response or revert', async () => {
    const result = deferred(), w = world({ translate: () => result.promise });
    const work = w.controller.translate(REF);
    w.records.set(CHANNEL + ':' + MESSAGE, { ...w.read(), content: 'Changed outside dispatcher' });
    result.resolve({ text: 'Stale translation' }); await work;
    assert.equal(w.read().content, 'Changed outside dispatcher');
    assert.equal(w.events.length, 0);
});
