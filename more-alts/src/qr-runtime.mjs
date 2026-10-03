/* SPDX-License-Identifier: GPL-3.0-or-later */
// Runs only in the isolated HTTPS-origin WebView. Keep private keys here, and
// send a session to the native manager only after Discord's pending_login event.
export function startRemoteAuth(env) {
    const { crypto, socketFactory, fetcher, emit, renderCode, clearCode, now = Date.now,
        setTimer = setTimeout, clearTimer = clearTimeout, base64Encode = btoa, base64Decode = atob,
        decodeText = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes) } = env;
    const timers = new Set();
    let stopped = false, socket, keyPair, phase = 'connecting', userId, ackPending = false;
    let expiry, heartbeat, controller, chain = Promise.resolve();
    const later = (fn, ms) => { const id = setTimer(() => { timers.delete(id); if (!stopped) fn(); }, ms); timers.add(id); return id; };
    const removeTimer = id => { clearTimer(id); timers.delete(id); };
    const send = value => { if (!stopped && socket?.readyState === 1) socket.send(JSON.stringify(value)); };
    function cleanup() {
        for (const id of timers) clearTimer(id); timers.clear();
        controller?.abort(); controller = undefined;
        try { socket?.close(1000); } catch {}
        keyPair = undefined; clearCode();
    }
    function finish(type, detail = {}) {
        if (stopped) return;
        stopped = true; cleanup(); emit({ type, ...detail });
    }
    function error(code) { finish('error', { code }); }
    function stop() { if (!stopped) { stopped = true; cleanup(); } }
    function bytes64(bytes, urlSafe = false) {
        const value = base64Encode(String.fromCharCode(...new Uint8Array(bytes)));
        return urlSafe ? value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : value;
    }
    async function decrypt(value) {
        if (typeof value !== 'string' || value.length > 4096 || !keyPair) throw new Error('invalid ciphertext');
        const bytes = Uint8Array.from(base64Decode(value), c => c.charCodeAt(0));
        return crypto.subtle.decrypt({ name: 'RSA-OAEP' }, keyPair.privateKey, bytes);
    }
    function beat(interval) {
        heartbeat = later(() => {
            if (ackPending) { error('connection'); return; }
            ackPending = true; send({ op: 'heartbeat' }); beat(interval);
        }, interval);
    }
    async function exchange(ticket) {
        if (typeof ticket !== 'string' || !ticket || ticket.length > 4096 || !userId) throw new Error('invalid ticket');
        phase = 'exchanging'; clearCode(); emit({ type: 'status', status: 'approved' });
        removeTimer(expiry);
        const deadline = later(() => error('timeout'), 20000);
        controller = typeof AbortController === 'function' ? new AbortController() : undefined;
        const response = await fetcher('https://discord.com/api/v9/users/@me/remote-auth/login', {
            method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket }), signal: controller?.signal
        });
        let data;
        try { data = await response.json(); } catch { data = {}; }
        if (stopped) return;
        if (response.status === 429) { finish('error', { code: 'rate-limit', retryAfter: Math.max(1, Math.ceil(Number(data.retry_after) || 60)) }); return; }
        if (data.captcha_key || data.captcha_sitekey) { error('verification'); return; }
        if (!response.ok || !data.encrypted_token) { error('rejected'); return; }
        const token = decodeText(await decrypt(data.encrypted_token));
        if (stopped) return;
        if (typeof token !== 'string' || token.length < 20 || token.length > 4096 || /\s/.test(token)) throw new Error('invalid session');
        removeTimer(deadline);
        finish('complete', { token, userId });
    }
    async function handle(event) {
        if (stopped || typeof event.data !== 'string' || event.data.length > 16384) return;
        const data = JSON.parse(event.data);
        if (data.op === 'heartbeat_ack') { ackPending = false; return; }
        if (data.op === 'cancel') { error('cancelled'); return; }
        if (data.op === 'hello') {
            if (phase !== 'connecting') throw new Error('unexpected hello');
            phase = 'key'; removeTimer(expiry);
            const interval = Number(data.heartbeat_interval);
            if (!Number.isFinite(interval) || interval < 1000 || interval > 120000) throw new Error('invalid interval');
            const timeout = Math.min(180000, Math.max(1000, Number(data.timeout_ms) || 120000));
            expiry = later(() => error('expired'), timeout); beat(interval);
            keyPair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['encrypt', 'decrypt']);
            if (stopped) { keyPair = undefined; return; }
            const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
            if (stopped) return;
            phase = 'nonce'; send({ op: 'init', encoded_public_key: bytes64(publicKey) });
        } else if (data.op === 'nonce_proof') {
            if (phase !== 'nonce') throw new Error('unexpected nonce');
            const nonce = await decrypt(data.encrypted_nonce);
            const proof = await crypto.subtle.digest('SHA-256', nonce);
            if (stopped) return;
            phase = 'fingerprint'; send({ op: 'nonce_proof', proof: bytes64(proof, true) });
        } else if (data.op === 'pending_remote_init') {
            if (phase !== 'fingerprint' || typeof data.fingerprint !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(data.fingerprint)) throw new Error('invalid fingerprint');
            phase = 'scan'; renderCode(`https://discord.com/ra/${data.fingerprint}`);
            emit({ type: 'status', status: 'ready' });
        } else if (data.op === 'pending_ticket') {
            if (phase !== 'scan') throw new Error('unexpected scan');
            const payload = decodeText(await decrypt(data.encrypted_user_payload));
            if (stopped) return;
            userId = payload.split(':')[0];
            if (!/^\d{15,22}$/.test(userId)) throw new Error('invalid user');
            phase = 'approve'; clearCode(); emit({ type: 'status', status: 'scanned' });
        } else if (data.op === 'pending_login') {
            if (phase !== 'approve') throw new Error('unexpected approval');
            await exchange(data.ticket);
        }
    }
    try {
        if (!crypto?.subtle || typeof crypto.getRandomValues !== 'function') { error('crypto'); return { stop }; }
        emit({ type: 'status', status: 'connecting' });
        socket = socketFactory('wss://remote-auth-gateway.discord.gg/?v=2');
        socket.onmessage = event => {
            if (stopped) return;
            // Cancellation and heartbeat acknowledgements must not wait behind
            // asynchronous key generation or the ticket exchange.
            try {
                if (typeof event.data !== 'string' || event.data.length > 16384) return;
                const immediate = JSON.parse(event.data);
                if (immediate.op === 'cancel') { error('cancelled'); return; }
                if (immediate.op === 'heartbeat_ack') { ackPending = false; return; }
            } catch { error('protocol'); return; }
            chain = chain.then(() => handle(event)).catch(() => { if (!stopped) error('protocol'); });
        };
        socket.onerror = () => error('connection');
        socket.onclose = () => { removeTimer(heartbeat); if (!stopped && phase !== 'exchanging') error('connection'); };
        expiry = later(() => error('timeout'), 20000);
    } catch { error('connection'); }
    return { stop };
}
