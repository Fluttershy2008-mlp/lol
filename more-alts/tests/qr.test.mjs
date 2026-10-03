import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { startRemoteAuth } from '../src/qr-runtime.mjs';
import { makeQrHtml, parseQrMessage, allowedQrNavigation } from '../src/qr-html.mjs';
import { createClient, createController } from '../src/core.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const userId = '100000000000000007', token = 'fixture-qr-approved-session-not-a-real-token';
const nonce = Uint8Array.from([1, 2, 3, 4, 5, 255, 10, 0]);
const waitFor = async fn => { const until = Date.now() + 5000; while (!fn()) { if (Date.now() > until) throw new Error('Fixture handshake timeout'); await new Promise(r => setTimeout(r, 2)); } };
function fixture(fetcher) {
    const sent = [], emitted = [], codes = [], jobs = new Map(), calls = [];
    let next = 0, cleared = 0, socket;
    const flow = startRemoteAuth({ crypto: webcrypto,
        socketFactory: url => { assert.equal(url, 'wss://remote-auth-gateway.discord.gg/?v=2'); socket = { readyState: 1, send: value => sent.push(JSON.parse(value)), close: () => { socket.readyState = 3; socket.onclose?.(); } }; return socket; },
        fetcher: async (...args) => { calls.push(args); return fetcher(...args); }, emit: value => emitted.push(value),
        renderCode: url => codes.push(url), clearCode: () => cleared++, setTimer: (fn, ms) => { const id = ++next; jobs.set(id, { fn: () => { jobs.delete(id); fn(); }, ms }); return id; }, clearTimer: id => jobs.delete(id)
    });
    const receive = data => socket.onmessage({ data: JSON.stringify(data) });
    return { sent, emitted, codes, jobs, calls, flow, receive, get cleared() { return cleared; }, get socket() { return socket; } };
}
async function handshake(f) {
    f.receive({ op: 'hello', heartbeat_interval: 40000, timeout_ms: 120000 });
    await waitFor(() => f.sent.some(item => item.op === 'init'));
    const key = await webcrypto.subtle.importKey('spki', Buffer.from(f.sent[0].encoded_public_key, 'base64'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    const encrypt = async value => Buffer.from(await webcrypto.subtle.encrypt('RSA-OAEP', key, typeof value === 'string' ? new TextEncoder().encode(value) : value)).toString('base64');
    f.receive({ op: 'nonce_proof', encrypted_nonce: await encrypt(nonce) });
    await waitFor(() => f.sent.some(item => item.op === 'nonce_proof'));
    const expected = Buffer.from(await webcrypto.subtle.digest('SHA-256', nonce)).toString('base64url');
    assert.equal(f.sent.find(item => item.op === 'nonce_proof').proof, expected);
    f.receive({ op: 'pending_remote_init', fingerprint: 'fixture_fingerprint_1234567890' });
    await waitFor(() => f.codes.length === 1);
    return encrypt;
}
async function scanned(f, encrypt) {
    f.receive({ op: 'pending_ticket', encrypted_user_payload: await encrypt(`${userId}:0:avatar:fixture-user`) });
    await waitFor(() => f.emitted.some(item => item.status === 'scanned'));
}
test('QR uses real RSA-OAEP/SHA-256 and only exchanges a ticket after Discord approval', async t => {
    let encrypted;
    const f = fixture(async () => ({ ok: true, status: 200, json: async () => ({ encrypted_token: encrypted }) })); t.after(f.flow.stop);
    const encrypt = await handshake(f); encrypted = await encrypt(token);
    assert.deepEqual(f.codes, ['https://discord.com/ra/fixture_fingerprint_1234567890']);
    await scanned(f, encrypt); assert.equal(f.calls.length, 0); assert.ok(!f.emitted.some(item => item.type === 'complete'));
    f.receive({ op: 'pending_login', ticket: 'fixture-approved-ticket' });
    await waitFor(() => f.emitted.some(item => item.type === 'complete'));
    assert.deepEqual(f.emitted.at(-1), { type: 'complete', token, userId });
    assert.equal(f.calls[0][0], 'https://discord.com/api/v9/users/@me/remote-auth/login');
    assert.equal(f.calls[0][1].credentials, 'omit'); assert.equal(f.calls[0][1].headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(f.calls[0][1].body), { ticket: 'fixture-approved-ticket' });
    assert.equal(f.socket.readyState, 3); assert.equal(f.jobs.size, 0);
});
test('server cancellation during the HTTP exchange suppresses late sessions and aborts the request', async t => {
    let resolve;
    const f = fixture(() => new Promise(r => { resolve = r; })); t.after(f.flow.stop);
    const encrypt = await handshake(f); await scanned(f, encrypt);
    f.receive({ op: 'pending_login', ticket: 'ticket' }); await waitFor(() => f.calls.length === 1);
    f.receive({ op: 'cancel' });
    assert.equal(f.emitted.at(-1).code, 'cancelled'); assert.equal(f.calls[0][1].signal.aborted, true);
    resolve({ ok: true, status: 200, json: async () => ({ encrypted_token: await encrypt(token) }) });
    await new Promise(r => setImmediate(r));
    assert.ok(!f.emitted.some(item => item.type === 'complete')); assert.equal(f.jobs.size, 0);
});
test('expired QR clears the image, socket and timers and cannot accept later approval', async t => {
    const f = fixture(() => { throw new Error('must not fetch'); }); t.after(f.flow.stop);
    await handshake(f);
    const expiry = [...f.jobs.values()].find(job => job.ms === 120000); expiry.fn();
    assert.equal(f.emitted.at(-1).code, 'expired'); assert.ok(f.cleared > 0); assert.equal(f.jobs.size, 0);
    f.receive({ op: 'pending_login', ticket: 'late-ticket' }); await new Promise(r => setImmediate(r)); assert.equal(f.calls.length, 0);
});
test('closing QR locally stops all work without emitting an account', async t => {
    const f = fixture(() => { throw new Error('must not fetch'); }); t.after(f.flow.stop);
    await handshake(f); f.flow.stop();
    assert.equal(f.jobs.size, 0); assert.equal(f.socket.readyState, 3); assert.ok(!f.emitted.some(item => item.type === 'complete'));
});
test('an approval received before a confirmed scan is rejected', async t => {
    const f = fixture(() => { throw new Error('must not fetch'); }); t.after(f.flow.stop);
    await handshake(f); f.receive({ op: 'pending_login', ticket: 'ticket' });
    await waitFor(() => f.emitted.some(item => item.type === 'error'));
    assert.equal(f.emitted.at(-1).code, 'protocol'); assert.equal(f.calls.length, 0);
});
test('CAPTCHA or rate-limit responses never become saved sessions or auto-retry', async t => {
    for (const [status, body, expected] of [[400, { captcha_key: ['required'] }, 'verification'], [429, { retry_after: 83.5 }, 'rate-limit']]) {
        const f = fixture(async () => ({ ok: false, status, json: async () => body })); t.after(f.flow.stop);
        const encrypt = await handshake(f); await scanned(f, encrypt); f.receive({ op: 'pending_login', ticket: 'ticket' });
        await waitFor(() => f.emitted.some(item => item.type === 'error'));
        assert.equal(f.emitted.at(-1).code, expected); assert.equal(f.calls.length, 1);
        if (expected === 'rate-limit') assert.equal(f.emitted.at(-1).retryAfter, 84);
        assert.ok(!f.emitted.some(item => item.type === 'complete'));
    }
});
test('missing secure crypto fails before opening a connection', () => {
    const emitted = [];
    const flow = startRemoteAuth({ crypto: {}, socketFactory: () => { throw new Error('must not open'); }, emit: x => emitted.push(x), clearCode() {} });
    assert.deepEqual(emitted, [{ type: 'error', code: 'crypto' }]); flow.stop();
});
test('bridge accepts only its current session and pinned local WebView origin', () => {
    const data = { provider: 'more-alts-qr', session: 'fixture-1', type: 'complete', token, userId };
    const event = { nativeEvent: { url: 'https://discord.com/', data: JSON.stringify(data) } };
    assert.equal(parseQrMessage(event, 'fixture-1').token, token);
    assert.equal(parseQrMessage(event, 'fixture-2'), undefined);
    assert.equal(parseQrMessage({ nativeEvent: { ...event.nativeEvent, url: 'https://example.invalid/' } }, 'fixture-1'), undefined);
    assert.equal(allowedQrNavigation('https://discord.com/login'), false);
    assert.equal(allowedQrNavigation('file:///tmp/secret'), false);
    assert.equal(allowedQrNavigation('javascript:alert(1)'), false);
    assert.equal(allowedQrNavigation('about:blank'), true);
});
test('native manager checks the approved user identity before persisting the session', async () => {
    const storage = {};
    const client = createClient({ fetcher: async () => ({ ok: true, json: async () => ({ id: userId, username: 'fixture-user' }) }) });
    const controller = createController({ storage, client, getSession: () => ({}), getSwitcher: () => undefined });
    await assert.rejects(controller.acceptQrLogin(token, '100000000000000008'), { code: 'mismatch' });
    assert.deepEqual(storage.accounts, {});
    assert.equal((await controller.acceptQrLogin(token, userId)).kind, 'saved');
    assert.equal(storage.accounts[userId].token, token); controller.stop();
});
test('QR HTML uses bundled code, restricted connections and no remote script or storage', () => {
    const html = makeQrHtml('fixture-1');
    assert.ok(html.includes('Content-Security-Policy')); assert.ok(html.includes("frame-src 'none'"));
    assert.ok(!html.includes('<script src=')); assert.ok(!html.includes('localStorage')); assert.ok(!html.includes('sessionStorage'));
    assert.ok(!html.includes(token)); assert.throws(() => makeQrHtml('</script>'));
    const code = html.match(/<script nonce="fixture-1">([\s\S]*)<\/script>/)[1];
    new vm.Script(code); // verify the exact script that the Android WebView receives
});
test('bundled QR encoder produces a normal matrix for the Discord remote-auth URL', () => {
    const context = vm.createContext({}); vm.runInContext(readFileSync(new URL('../vendor/qrcode.js', import.meta.url), 'utf8'), context);
    const qr = context.qrcode(0, 'M'); qr.addData('https://discord.com/ra/fixture_fingerprint_1234567890', 'Byte'); qr.make();
    assert.ok(qr.getModuleCount() >= 21); assert.equal((qr.getModuleCount() - 17) % 4, 0);
    assert.ok(qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true }).includes('<svg'));
});
