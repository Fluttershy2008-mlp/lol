/* SPDX-License-Identifier: GPL-3.0-or-later */
export class AccountError extends Error {
    constructor(code, message, retryAfter = 0) { super(message); this.name = 'AccountError'; this.code = code; this.retryAfter = retryAfter; }
}
export const validId = id => typeof id === 'string' && /^\d{15,22}$/.test(id);
export const validToken = token => typeof token === 'string' && token.length >= 20 && token.length <= 4096 && !/\s/.test(token) && !/^(Bot|Bearer)\b/i.test(token);
const fail = (code, message) => { throw new AccountError(code, message); };
export function normalizeStorage(storage) {
    const accounts = {};
    for (const account of Object.values(storage.accounts || {})) {
        if (!validId(account?.id) || !validToken(account?.token) || typeof account.username !== 'string') continue;
        accounts[account.id] = cleanAccount(account, account.token, account);
    }
    const order = Array.isArray(storage.accountOrder) ? storage.accountOrder : [];
    storage.accounts = accounts;
    storage.accountOrder = [...new Set([...order, ...Object.keys(accounts)])].filter(id => Object.prototype.hasOwnProperty.call(accounts, id));
    storage.settings = { refreshSavedSessions: storage.settings?.refreshSavedSessions !== false,
        enableNativeSwitcher: storage.settings?.enableNativeSwitcher !== false };
    storage.schemaVersion = 3;
}
function cleanAccount(user, token, old = {}) {
    return { id: user.id, username: user.username, discriminator: String(user.discriminator ?? '0'),
        displayName: user.global_name || user.globalName || user.displayName || user.username,
        avatar: typeof user.avatar === 'string' ? user.avatar : null, token,
        addedAt: Number.isFinite(old.addedAt) ? old.addedAt : Date.now(), updatedAt: Date.now() };
}
export function saveAccount(storage, user, token) {
    if (!validId(user?.id) || typeof user.username !== 'string' || !validToken(token)) fail('invalid-user', 'Discord returned an incomplete account. Please sign in again.');
    const updated = !!storage.accounts[user.id];
    storage.accounts = { ...storage.accounts, [user.id]: cleanAccount(user, token, storage.accounts[user.id]) };
    if (!storage.accountOrder.includes(user.id)) storage.accountOrder = [...storage.accountOrder, user.id];
    return { user, updated };
}
export function importLegacy(storage, legacy) {
    const entries = Array.isArray(legacy) ? legacy : Object.values(legacy?.accounts || {});
    if (!entries.length) fail('empty-import', 'No saved accounts were found in the old plugin. Save an account there first.');
    let added = 0, skipped = 0;
    for (const account of entries) {
        if (!validId(account?.id) || !validToken(account?.token) || typeof account.username !== 'string' || storage.accounts[account.id]) { skipped++; continue; }
        saveAccount(storage, account, account.token); added++;
    }
    return { added, skipped };
}
export function describeFailure(status, body, retryHeader) {
    const data = body && typeof body === 'object' ? body : {};
    if (status === 429) {
        const seconds = Number(data.retry_after ?? retryHeader);
        const retry = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60;
        return new AccountError('rate-limit', `Too many attempts. Wait ${retry} seconds before trying again.`, retry);
    }
    if (data.captcha_key || data.captcha_sitekey) return new AccountError('verification', 'Discord requires a CAPTCHA. Complete sign-in in Discord’s normal login screen, then use Save current account here.');
    if ([70007, 60003, 60006].includes(data.code)) return new AccountError('verification', 'Discord requires additional verification. Complete sign-in in Discord’s normal login screen, then save the account here.');
    if (status >= 500) return new AccountError('server', 'Discord is having trouble. Try again later.');
    if (data.code === 60008 || data.code === 60009 || data.errors?.code) return new AccountError('mfa-code', 'That verification code was rejected. Try a fresh authenticator code or an unused backup code.');
    if (status === 401) return new AccountError('expired', 'This saved session has expired. Sign in again to update it.');
    if (data.errors?.login || data.errors?.password || data.code === 50035) return new AccountError('credentials', 'Discord rejected the sign-in details. Check your email or phone number and password.');
    // Never print server messages, full HTTP errors, credentials, or response bodies.
    return new AccountError('login', 'Discord could not complete sign-in. Check your details, or sign in through Discord and save the current account.');
}
export function createClient({ fetcher, now = Date.now, timeoutMs = 20000, Abort = globalThis.AbortController }) {
    const pending = new Set();
    let stopped = false, blockedUntil = 0;
    function cancel() {
        for (const entry of [...pending]) { entry.abort?.(); entry.reject(new AccountError('cancelled', 'Cancelled.')); }
    }
    async function request(path, { method = 'GET', body, token } = {}) {
        if (stopped) fail('cancelled', 'Plugin disabled.');
        if (now() < blockedUntil) throw new AccountError('rate-limit', `Wait ${Math.ceil((blockedUntil - now()) / 1000)} seconds before trying again.`, Math.ceil((blockedUntil - now()) / 1000));
        if (!['/auth/login', '/auth/mfa/totp', '/users/@me'].includes(path)) fail('endpoint', 'Unsupported sign-in request.');
        const controller = typeof Abort === 'function' ? new Abort() : null;
        let timer, entry;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = token;
        try {
            const response = await Promise.race([
                Promise.resolve().then(async () => {
                    const raw = await fetcher(`https://discord.com/api/v9${path}`, { method, headers,
                        body: body === undefined ? undefined : JSON.stringify(body), signal: controller?.signal });
                    let data;
                    try { data = await raw.json(); } catch { data = {}; }
                    return { ok: raw.ok, status: raw.status, data, retry: raw.headers?.get?.('retry-after') };
                }),
                new Promise((_, reject) => {
                    entry = { reject, abort: () => controller?.abort() }; pending.add(entry);
                    timer = setTimeout(() => { controller?.abort(); reject(new AccountError('timeout', 'Discord took too long to respond. Check your connection and try again.')); }, timeoutMs);
                })
            ]);
            if (stopped) fail('cancelled', 'Plugin disabled.');
            if (!response.ok || response.data.captcha_key || response.data.captcha_sitekey) {
                const error = describeFailure(response.status, response.data, response.retry);
                if (error.retryAfter) blockedUntil = now() + error.retryAfter * 1000;
                throw error;
            }
            return response.data;
        } catch (error) {
            if (error instanceof AccountError) throw error;
            throw new AccountError('network', 'Could not reach Discord. Check your connection and try again.');
        } finally { clearTimeout(timer); pending.delete(entry); }
    }
    return { request, cancel, stop() { stopped = true; cancel(); } };
}
export function createController({ storage, client, getSession, getSwitcher, now = Date.now, switchTimeoutMs = 15000, pollMs = 250 }) {
    normalizeStorage(storage);
    let stopped = false, busy = false, generation = 0, challenge, refreshKey;
    const listeners = new Set(), delays = new Set();
    const notify = () => { for (const listener of listeners) { try { listener(); } catch {} } };
    const assertActive = epoch => { if (stopped || epoch !== generation) fail('cancelled', 'Cancelled.'); };
    const sameSession = (a, b) => a?.token === b?.token && a?.user?.id === b?.user?.id;
    async function exclusive(fn) {
        if (stopped) fail('cancelled', 'Plugin disabled.');
        if (busy) fail('busy', 'Another account action is still in progress.');
        busy = true; notify(); const epoch = generation;
        try { return await fn(epoch); } finally { busy = false; notify(); }
    }
    async function inspectToken(token, epoch) {
        if (!validToken(token)) fail('expired', 'No usable session was found. Sign in to Discord first.');
        const user = await client.request('/users/@me', { token }); assertActive(epoch);
        if (!validId(user?.id) || typeof user.username !== 'string') fail('invalid-user', 'Could not verify this account with Discord.');
        return user;
    }
    async function saveSession(epoch, session = getSession()) {
        if (!session?.user || !validToken(session.token)) fail('no-session', 'Discord has not finished signing in. Try again after your chats load.');
        const user = await inspectToken(session.token, epoch);
        if (user.id !== session.user.id || !sameSession(session, getSession())) fail('session-changed', 'The active account changed. Wait for Discord to finish loading, then try again.');
        const result = saveAccount(storage, user, session.token);
        refreshKey = `${user.id}:${session.token}`; notify(); return result;
    }
    async function completeLogin(data, epoch) {
        assertActive(epoch);
        if (validToken(data.token)) {
            const user = await inspectToken(data.token, epoch);
            const result = saveAccount(storage, user, data.token); challenge = undefined; notify();
            return { kind: 'saved', ...result };
        }
        if (data.mfa && typeof data.ticket === 'string' && data.ticket) {
            if (data.totp === false) fail('verification', 'This account needs a passkey, SMS, or another verification method. Use Discord’s normal login screen, then save the current account.');
            challenge = { ticket: data.ticket, until: now() + 5 * 60 * 1000 };
            return { kind: 'mfa' };
        }
        fail('verification', 'Discord needs another sign-in step. Complete sign-in in Discord’s normal login screen, then save the current account.');
    }
    function delay() { return new Promise(resolve => { const item = { timer: null, resolve }; item.timer = setTimeout(() => { delays.delete(item); resolve(); }, pollMs); delays.add(item); }); }
    return {
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        get busy() { return busy; },
        get accounts() { return storage.accountOrder.map(id => storage.accounts[id]).filter(Boolean); },
        saveCurrent() { return exclusive(epoch => saveSession(epoch)); },
        login(login, password) {
            return exclusive(async epoch => {
                challenge = undefined;
                if (typeof login !== 'string' || !login.trim() || typeof password !== 'string' || !password.length) fail('credentials', 'Enter your email or phone number and password.');
                const data = await client.request('/auth/login', { method: 'POST', body: { login: login.trim(), password, undelete: false } });
                return completeLogin(data, epoch);
            });
        },
        submitCode(code) {
            return exclusive(async epoch => {
                if (!challenge || now() > challenge.until) { challenge = undefined; fail('mfa-expired', 'The verification step expired. Go back and sign in again.'); }
                const normalized = String(code).replace(/[\s-]/g, '');
                if (!normalized) fail('mfa-code', 'Enter an authenticator code or backup code.');
                const data = await client.request('/auth/mfa/totp', { method: 'POST', body: { ticket: challenge.ticket, code: normalized } });
                return completeLogin(data, epoch);
            });
        },
        switchTo(id) {
            return exclusive(async epoch => {
                const account = storage.accounts[id], original = getSession();
                if (!account) fail('missing', 'This account is no longer saved.');
                if (original?.user?.id === id) return { user: original.user, already: true };
                const switcher = getSwitcher();
                if (typeof switcher !== 'function') fail('unsupported', 'Account switching is unavailable on this Discord build. Your saved accounts are unchanged.');
                const target = await inspectToken(account.token, epoch);
                if (target.id !== id) fail('mismatch', 'This saved session belongs to a different account. Remove it and sign in again.');
                if (!sameSession(original, getSession())) fail('session-changed', 'Your active account changed. Try again.');
                if (original?.user && validToken(original.token)) await saveSession(epoch, original);
                assertActive(epoch);
                const savedToken = account.token;
                if (!sameSession(original, getSession())) fail('session-changed', 'Your active account changed. Try again.');
                // Attach a rejection handler immediately, but do not trust a resolved
                // native action as proof of a completed login. Observe the real session.
                let rejected = false;
                try { Promise.resolve(switcher(savedToken)).catch(() => { rejected = true; }); }
                catch { rejected = true; }
                const deadline = now() + switchTimeoutMs;
                while (now() < deadline) {
                    assertActive(epoch);
                    const session = getSession();
                    if (session?.user?.id === id && session.token === savedToken) {
                        saveAccount(storage, target, savedToken); refreshKey = `${id}:${savedToken}`; notify();
                        return { user: target };
                    }
                    if (rejected) fail('switch-failed', 'Discord could not switch accounts. Your previous account is saved so you can select it again.');
                    await delay();
                }
                fail('switch-timeout', 'Discord has not confirmed the switch yet. Check which account is active before trying again; both saved accounts are still available.');
            });
        },
        async refreshSaved() {
            if (busy || stopped || !storage.settings.refreshSavedSessions) return;
            const session = getSession();
            if (!session?.user || !validToken(session.token) || !storage.accounts[session.user.id]) return;
            const key = `${session.user.id}:${session.token}`;
            if (refreshKey === key) return;
            // One background attempt per observed session. Manual Save can retry.
            refreshKey = key;
            try { await exclusive(epoch => saveSession(epoch, session)); } catch {}
        },
        remove(id) {
            if (busy || stopped) return false;
            const accounts = { ...storage.accounts }; delete accounts[id]; storage.accounts = accounts;
            storage.accountOrder = storage.accountOrder.filter(value => value !== id); notify(); return true;
        },
        importAccounts(legacy) {
            if (busy || stopped) fail('busy', 'Wait for the current action to finish.');
            const result = importLegacy(storage, legacy); notify(); return result;
        },
        cancelLogin() { challenge = undefined; generation++; client.cancel(); },
        stop() {
            stopped = true; challenge = undefined; generation++; client.stop();
            for (const item of delays) { clearTimeout(item.timer); item.resolve(); } delays.clear(); listeners.clear();
        }
    };
}
