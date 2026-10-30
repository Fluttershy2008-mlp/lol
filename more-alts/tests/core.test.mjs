import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountError, createClient, createController, normalizeStorage, saveAccount, importLegacy } from '../src/core.mjs';

const a = { id: '100000000000000001', username: 'account-one' };
const b = { id: '100000000000000002', username: 'account-two', global_name: 'Second Account' };
const ta = 'fixture-session-one-not-a-real-token';
const tb = 'fixture-session-two-not-a-real-token';
const response = (data, status = 200, header) => ({ ok: status >= 200 && status < 300, status, json: async () => data, headers: { get: () => header } });
function harness(options = {}) {
    const calls = [], storage = options.storage || {};
    let session = { user: a, token: ta }, switched = [];
    const fetcher = options.fetcher || (async (url, init) => response(init.headers.Authorization === ta ? a : b));
    const client = createClient({ fetcher: async (...args) => { calls.push(args); return fetcher(...args); }, timeoutMs: options.timeoutMs || 100, now: options.now });
    const controller = createController({ storage, client, getSession: () => session, persistStorage: options.persistStorage,
        getSwitcher: () => options.unsupported ? undefined : token => {
            switched.push(token);
            if (options.switcher) return options.switcher(token, next => { session = next; });
            session = { user: token === ta ? a : b, token };
        }, switchTimeoutMs: 30, pollMs: 1, now: options.now });
    return { controller, storage, calls, client, switched, get session() { return session; }, setSession(next) { session = next; } };
}
const isCode = code => error => error instanceof AccountError && error.code === code;

test('credential sign-in preserves password whitespace and trims only the login', async () => {
    const h = harness({ fetcher: async url => response(url.endsWith('/auth/login') ? { token: tb } : b) });
    const result = await h.controller.login('  person@example.invalid  ', ' password with spaces ');
    assert.equal(result.kind, 'saved'); assert.equal(h.storage.accounts[b.id].token, tb);
    assert.deepEqual(JSON.parse(h.calls[0][1].body), { login: 'person@example.invalid', password: ' password with spaces ', undelete: false });
    assert.equal(h.calls[0][1].headers['User-Agent'], undefined);
    assert.equal(h.calls[0][1].headers.Authorization, undefined);
    assert.equal(h.calls[1][1].headers.Authorization, tb);
    assert.equal(h.session.user.id, a.id); // adding does not switch the current user
    assert.ok(!JSON.stringify(h.storage).includes('password with spaces'));
});
test('2FA challenge continues with an authenticator or backup code and never persists the ticket', async () => {
    const h = harness({ fetcher: async url => response(url.endsWith('/auth/login') ? { mfa: true, totp: true, ticket: 'fixture-ticket' } : url.endsWith('/totp') ? { token: tb } : b) });
    assert.deepEqual(await h.controller.login('x', 'y'), { kind: 'mfa' });
    assert.deepEqual(h.storage.accounts, {});
    assert.equal((await h.controller.submitCode('ab-cd 1234')).kind, 'saved');
    assert.deepEqual(JSON.parse(h.calls[1][1].body), { ticket: 'fixture-ticket', code: 'abcd1234' });
    assert.ok(!JSON.stringify(h.storage).includes('fixture-ticket'));
    assert.ok(!JSON.stringify(h.storage).includes('abcd1234'));
});
test('rejected 2FA code permits a fresh code without re-entering the password', async () => {
    let codes = 0;
    const h = harness({ fetcher: async url => {
        if (url.endsWith('/auth/login')) return response({ mfa: true, ticket: 'ticket' });
        if (url.endsWith('/totp') && codes++ === 0) return response({ code: 60008, message: 'sensitive server body' }, 400);
        return response(url.endsWith('/totp') ? { token: tb } : b);
    } });
    await h.controller.login('x', 'y');
    await assert.rejects(h.controller.submitCode('bad'), isCode('mfa-code'));
    assert.equal((await h.controller.submitCode('new')).kind, 'saved');
});
test('expired MFA challenge requires another login without making a request', async () => {
    let clock = 100;
    const h = harness({ now: () => clock, fetcher: async () => response({ mfa: true, ticket: 'ticket' }) });
    await h.controller.login('x', 'y'); clock += 300001;
    await assert.rejects(h.controller.submitCode('123456'), isCode('mfa-expired'));
    assert.equal(h.calls.length, 1);
});
test('SMS is sent only on request to the ticket-linked phone, then verified at the SMS endpoint', async () => {
    const h = harness({ fetcher: async url => response(url.endsWith('/auth/login')
        ? { mfa: true, sms: true, totp: true, ticket: 'fixture-sms-ticket', login_instance_id: 'fixture-login-instance' }
        : url.endsWith('/sms/send') ? { phone: '+6587654321' }
        : url.endsWith('/sms') ? { token: tb } : b) });
    await h.controller.login('linked@example.invalid', 'fixture-password');
    assert.equal(h.calls.length, 1, 'opening MFA must never send an SMS automatically');
    assert.equal(h.controller.verification.smsAvailable, true);
    assert.equal(h.controller.verification.smsSent, false);
    const state = await h.controller.requestSms();
    assert.equal(h.calls[1][0], 'https://discord.com/api/v9/auth/mfa/sms/send');
    assert.deepEqual(JSON.parse(h.calls[1][1].body), { ticket: 'fixture-sms-ticket' });
    assert.equal(h.calls[1][1].headers.Authorization, undefined);
    assert.equal(state.method, 'sms'); assert.equal(state.phone, '•••• 4321');
    assert.ok(!JSON.stringify(state).includes('fixture-sms-ticket'));
    assert.deepEqual(h.storage.accounts, {});
    assert.equal((await h.controller.submitCode('00 1234')).kind, 'saved');
    assert.equal(h.calls[2][0], 'https://discord.com/api/v9/auth/mfa/sms');
    assert.deepEqual(JSON.parse(h.calls[2][1].body), { ticket: 'fixture-sms-ticket', code: '001234', login_instance_id: 'fixture-login-instance' });
    assert.equal(h.storage.accounts[b.id].token, tb);
    assert.equal(h.controller.verification, null);
    for (const secret of ['fixture-sms-ticket', 'fixture-login-instance', '+6587654321', '001234', '4321'])
        assert.ok(!JSON.stringify(h.storage).includes(secret), 'MFA data must remain ephemeral');
});
test('SMS-only MFA is supported, but a code cannot be verified before requesting the SMS', async () => {
    const h = harness({ fetcher: async url => response(url.endsWith('/auth/login')
        ? { mfa: true, sms: true, totp: false, ticket: 'fixture-sms-only-ticket' }
        : url.endsWith('/sms/send') ? { phone: '+*******4321' }
        : url.endsWith('/sms') ? { token: tb } : b) });
    assert.deepEqual(await h.controller.login('x', 'y'), { kind: 'mfa' });
    assert.equal(h.controller.verification.method, 'sms');
    await assert.rejects(h.controller.submitCode('001234'), isCode('sms-not-sent'));
    assert.equal(h.calls.length, 1);
    await h.controller.requestSms();
    assert.equal((await h.controller.submitCode('001234')).kind, 'saved');
});
test('SMS availability comes from Discord and an unavailable method makes no send request', async () => {
    const h = harness({ fetcher: async () => response({ mfa: true, sms: false, totp: true, ticket: 'fixture-no-sms-ticket' }) });
    await h.controller.login('x', 'y');
    await assert.rejects(h.controller.requestSms(), isCode('sms-unavailable'));
    assert.equal(h.calls.length, 1); assert.deepEqual(h.storage.accounts, {});
});
test('SMS resend cooldown prevents duplicate messages and permits a deliberate later resend', async () => {
    let clock = 1000;
    const h = harness({ now: () => clock, fetcher: async url => response(url.endsWith('/auth/login')
        ? { mfa: true, sms: true, ticket: 'fixture-resend-ticket' } : { phone: '+*******4321' }) });
    await h.controller.login('x', 'y'); await h.controller.requestSms();
    await assert.rejects(h.controller.requestSms(), isCode('sms-cooldown'));
    assert.equal(h.calls.length, 2); assert.equal(h.controller.verification.resendAfter, 30);
    h.controller.useVerificationMethod('totp'); h.controller.useVerificationMethod('sms');
    assert.equal(h.calls.length, 2, 'changing methods must not send another SMS');
    clock += 30001; await h.controller.requestSms();
    assert.equal(h.calls.length, 3);
});
test('SMS rate limits expose a cooldown, preserve the challenge, and do not automatically retry', async () => {
    let clock = 1000, sends = 0;
    const h = harness({ now: () => clock, fetcher: async url => url.endsWith('/auth/login')
        ? response({ mfa: true, sms: true, ticket: 'fixture-rate-limit-ticket' })
        : ++sends === 1 ? response({ retry_after: 45 }, 429) : response({ phone: '+*******4321' }) });
    await h.controller.login('x', 'y');
    await assert.rejects(h.controller.requestSms(), isCode('rate-limit'));
    assert.equal(h.controller.verification.smsSent, false);
    assert.equal(h.controller.verification.resendAfter, 45);
    await assert.rejects(h.controller.requestSms(), isCode('sms-cooldown'));
    assert.equal(sends, 1);
    clock += 45001; await h.controller.requestSms(); assert.equal(sends, 2);
});
test('cancelled or expired SMS challenges cannot send, save an account, or restore stale UI state', async () => {
    let clock = 0, finish;
    const h = harness({ now: () => clock, fetcher: async url => url.endsWith('/auth/login')
        ? response({ mfa: true, sms: true, ticket: 'fixture-cancel-sms-ticket' })
        : new Promise(resolve => { finish = resolve; }) });
    await h.controller.login('x', 'y');
    const pending = h.controller.requestSms(); await Promise.resolve(); h.controller.cancelLogin();
    finish(response({ phone: '+*******4321' }));
    await assert.rejects(pending, isCode('cancelled'));
    assert.equal(h.controller.verification, null); assert.deepEqual(h.storage.accounts, {});
    await h.controller.login('x', 'y'); clock += 300001;
    await assert.rejects(h.controller.requestSms(), isCode('mfa-expired'));
    assert.equal(h.calls.length, 3);
});
test('rejected SMS codes do not save an account and can be corrected without another SMS', async () => {
    let codes = 0;
    const h = harness({ fetcher: async url => url.endsWith('/auth/login')
        ? response({ mfa: true, sms: true, ticket: 'fixture-rejected-sms-ticket' })
        : url.endsWith('/sms/send') ? response({ phone: '+*******4321' })
        : url.endsWith('/sms') ? ++codes === 1 ? response({ code: 60008 }, 400) : response({ token: tb }) : response(b) });
    await h.controller.login('x', 'y'); await h.controller.requestSms();
    await assert.rejects(h.controller.submitCode('654321'), isCode('sms-code'));
    assert.deepEqual(h.storage.accounts, {});
    assert.equal((await h.controller.submitCode('001234')).kind, 'saved');
    assert.equal(h.calls.filter(([url]) => url.endsWith('/sms/send')).length, 1);
});
test('SMS send without confirmation cannot claim delivery, and backup-only MFA uses its method', async () => {
    const h = harness({ fetcher: async url => response(url.endsWith('/auth/login')
        ? { mfa: true, sms: true, ticket: 'fixture-unconfirmed-sms-ticket' } : {}) });
    await h.controller.login('x', 'y'); await assert.rejects(h.controller.requestSms(), isCode('sms-send'));
    assert.equal(h.controller.verification.smsSent, false);
    const backup = harness({ fetcher: async url => response(url.endsWith('/auth/login')
        ? { mfa: true, totp: false, backup: true, sms: false, ticket: 'fixture-backup-only-ticket' }
        : url.endsWith('/backup') ? { token: tb } : b) });
    await backup.controller.login('x', 'y'); await backup.controller.submitCode('ab-cd1234');
    assert.ok(backup.calls[1][0].endsWith('/auth/mfa/backup'));
    assert.equal(backup.storage.accounts[b.id].token, tb);
});
test('CAPTCHA and unsupported MFA explain normal sign-in and do not retry', async () => {
    for (const data of [{ captcha_key: ['required'], captcha_sitekey: 'key' }, { mfa: true, totp: false, ticket: 'ticket', webauthn: true }]) {
        const h = harness({ fetcher: async () => response(data, data.mfa ? 200 : 400) });
        await assert.rejects(h.controller.login('x', 'y'), error => isCode('verification')(error) && error.message.includes('normal login screen'));
        assert.equal(h.calls.length, 1); assert.deepEqual(h.storage.accounts, {});
    }
});
test('rate limits block repeat requests until the server cooldown has passed', async () => {
    let clock = 1000, calls = 0;
    const client = createClient({ now: () => clock, fetcher: async () => { calls++; return response({ retry_after: 1.5 }, 429); } });
    await assert.rejects(client.request('/auth/login'), isCode('rate-limit'));
    await assert.rejects(client.request('/auth/login'), isCode('rate-limit')); assert.equal(calls, 1);
    clock += 2001; await assert.rejects(client.request('/auth/login'), isCode('rate-limit')); assert.equal(calls, 2);
});
test('network errors never include credentials or raw server errors', async () => {
    const h = harness({ fetcher: async () => { throw new Error('password fixture secret'); } });
    await assert.rejects(h.controller.login('x', 'y'), error => isCode('network')(error) && !error.message.includes('secret'));
    assert.equal(h.controller.busy, false);
});
test('timeout covers slow response bodies and releases the busy state', async () => {
    const h = harness({ timeoutMs: 8, fetcher: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }) });
    await assert.rejects(h.controller.login('x', 'y'), isCode('timeout'));
    assert.equal(h.controller.busy, false);
});
test('duplicate clicks cannot start concurrent credential requests', async () => {
    let resolve;
    const h = harness({ fetcher: () => new Promise(r => { resolve = r; }) });
    const attempt = h.controller.login('x', 'y');
    await assert.rejects(h.controller.login('x', 'y'), isCode('busy'));
    resolve(response({}, 400)); await assert.rejects(attempt); assert.equal(h.calls.length, 1);
});
test('cancellation clears MFA and prevents a late request from saving an account', async () => {
    let resolve;
    const h = harness({ fetcher: () => new Promise(r => { resolve = r; }) });
    const attempt = h.controller.login('x', 'y'); await Promise.resolve();
    h.controller.cancelLogin(); resolve(response({ token: tb }));
    await assert.rejects(attempt, isCode('cancelled')); assert.deepEqual(h.storage.accounts, {});
    await assert.rejects(h.controller.submitCode('123456'), isCode('mfa-expired'));
});
test('unload aborts pending work without any late storage writes', async () => {
    let resolve;
    const h = harness({ fetcher: () => new Promise(r => { resolve = r; }) });
    const attempt = h.controller.saveCurrent(); await Promise.resolve();
    h.controller.stop(); resolve(response(a));
    await assert.rejects(attempt, isCode('cancelled')); assert.deepEqual(h.storage.accounts, {});
});
test('saving the current account verifies ownership and refreshes duplicate sessions', async () => {
    const h = harness();
    assert.equal((await h.controller.saveCurrent()).updated, false);
    const newToken = 'fixture-session-one-refreshed-not-real';
    h.setSession({ user: a, token: newToken });
    // Explicit client behavior for the refreshed token.
    const storage = h.storage;
    const next = harness({ storage, fetcher: async () => response(a) });
    next.setSession({ user: a, token: newToken });
    assert.equal((await next.controller.saveCurrent()).updated, true);
    assert.equal(storage.accounts[a.id].token, newToken); assert.deepEqual(storage.accountOrder, [a.id]);
});
test('missing current user and mismatched user/token pairs do not crash or save', async () => {
    const h = harness(); h.setSession({ token: ta });
    await assert.rejects(h.controller.saveCurrent(), isCode('no-session'));
    h.setSession({ user: a, token: tb });
    await assert.rejects(h.controller.saveCurrent(), isCode('session-changed')); assert.deepEqual(h.storage.accounts, {});
});
test('save waits for durable storage, replaces the full session, and survives a fresh controller', async () => {
    let release, started, disk;
    const reachedStorage = new Promise(resolve => { started = resolve; });
    const storage = {}; normalizeStorage(storage);
    saveAccount(storage, a, 'fixture-outdated-current-session'); saveAccount(storage, b, tb);
    const previous = JSON.parse(JSON.stringify(storage));
    const freshUser = { ...a, username: 'renamed-account', global_name: 'Fresh Display', avatar: 'newavatar' };
    const h = harness({ storage, fetcher: async () => response(freshUser), persistStorage: async value => {
        disk = JSON.parse(JSON.stringify(value)); started(); await new Promise(resolve => { release = resolve; });
    } });
    const attempt = h.controller.saveCurrent(); await reachedStorage;
    assert.equal(h.controller.busy, true);
    assert.deepEqual(storage.accounts, previous.accounts, 'pending writes cannot appear as a completed save');
    assert.equal(disk.accounts[a.id].token, ta);
    assert.equal(disk.accounts[a.id].username, freshUser.username);
    assert.equal(disk.accounts[a.id].displayName, freshUser.global_name);
    assert.equal(disk.accounts[a.id].avatar, freshUser.avatar);
    assert.deepEqual(disk.accounts[b.id], previous.accounts[b.id]);
    await assert.rejects(h.controller.saveCurrent(), isCode('busy'));
    release(); assert.equal((await attempt).updated, true);
    const savedAt = storage.accounts[a.id].updatedAt;
    const restart = harness({ storage: JSON.parse(JSON.stringify(disk)) });
    assert.equal(restart.storage.accounts[a.id].token, ta);
    assert.equal(restart.storage.accounts[a.id].updatedAt, savedAt);
    assert.deepEqual(restart.storage.accountOrder, [a.id, b.id]);
});
test('failed account persistence preserves previous records and a later save can retry', async () => {
    let failWrite = true;
    const h = harness({ persistStorage: async () => { if (failWrite) throw new Error('private storage error with a session'); } });
    saveAccount(h.storage, a, 'fixture-previous-good-session'); saveAccount(h.storage, b, tb);
    const previous = JSON.parse(JSON.stringify(h.storage));
    await assert.rejects(h.controller.saveCurrent(), error => isCode('save-failed')(error) && !error.message.includes('private'));
    assert.deepEqual(h.storage, previous);
    assert.equal(h.controller.busy, false);
    failWrite = false; await h.controller.saveCurrent();
    assert.equal(h.storage.accounts[a.id].token, ta);
    assert.deepEqual(h.storage.accounts[b.id], previous.accounts[b.id]);
    assert.deepEqual(h.storage.accountOrder, [a.id, b.id]);
});
test('switch stays on the current account when saving its outgoing session fails', async () => {
    const h = harness({ persistStorage: async () => { throw new Error('write failed'); } });
    saveAccount(h.storage, b, tb);
    await assert.rejects(h.controller.switchTo(b.id), isCode('save-failed'));
    assert.deepEqual(h.switched, []);
    assert.equal(h.session.user.id, a.id);
    assert.equal(h.storage.accounts[a.id], undefined);
    assert.equal(h.storage.accounts[b.id].token, tb);
});
test('password login does not report an account saved when persistence fails', async () => {
    const h = harness({ fetcher: async url => response(url.endsWith('/auth/login') ? { token: tb } : b),
        persistStorage: async () => { throw new Error('write failed'); } });
    await assert.rejects(h.controller.login('fixture@example.invalid', 'fixture-password'), isCode('save-failed'));
    assert.deepEqual(h.storage.accounts, {});
});
test('an account change during validation cannot attach the wrong token to a user', async () => {
    let resolve;
    const h = harness({ fetcher: () => new Promise(r => { resolve = r; }) });
    const attempt = h.controller.saveCurrent(); await Promise.resolve();
    h.setSession({ user: b, token: tb }); resolve(response(a));
    await assert.rejects(attempt, isCode('session-changed')); assert.deepEqual(h.storage.accounts, {});
});
test('switch validates the target, saves the outgoing account, then calls native switch once', async () => {
    const h = harness(); saveAccount(h.storage, b, tb);
    const result = await h.controller.switchTo(b.id);
    assert.equal(result.user.id, b.id); assert.deepEqual(h.switched, [tb]);
    assert.equal(h.storage.accounts[a.id].token, ta);
    assert.deepEqual(h.calls.map(([, init]) => init.headers.Authorization), [tb, ta]);
});
test('expired target is rejected before native switch or logout', async () => {
    const h = harness({ fetcher: async () => response({}, 401) }); saveAccount(h.storage, b, tb);
    await assert.rejects(h.controller.switchTo(b.id), isCode('expired'));
    assert.deepEqual(h.switched, []); assert.equal(h.session.user.id, a.id);
});
test('401 errors distinguish password, MFA and saved session checks', async () => {
    for (const [path, expected] of [
        ['/auth/login', 'credentials'],
        ['/auth/mfa/totp', 'mfa-code'],
        ['/auth/mfa/backup', 'mfa-code'],
        ['/auth/mfa/sms', 'sms-code'],
        ['/auth/mfa/sms/send', 'mfa-expired'],
        ['/users/@me', 'expired'],
    ]) {
        const client = createClient({ fetcher: async () => response({}, 401) });
        const options = path === '/users/@me' ? { token: tb } : {};
        await assert.rejects(client.request(path, options), err => isCode(expected)(err)
            && !err.message.includes('token') && !err.message.includes('fixture'));
    }
});
test('expired target identifies which saved account needs renewal without deleting anything', async () => {
    const h = harness({ fetcher: async (_url, init) =>
        response(init.headers.Authorization === tb ? {} : a, init.headers.Authorization === tb ? 401 : 200) });
    saveAccount(h.storage, b, tb);
    const before = h.storage.accounts[b.id].token;
    await assert.rejects(h.controller.switchTo(b.id), error =>
        isCode('expired')(error) && error.message.includes('@account-two') && error.message.includes('Re-sign in'));
    assert.equal(h.storage.accounts[b.id].token, before);
    assert.equal(h.session.user.id, a.id);
    assert.deepEqual(h.switched, []);
});
test('current session 401 requires native Discord sign-in without claiming a saved target expired', async () => {
    const h = harness({ fetcher: async () => response({}, 401) });
    await assert.rejects(h.controller.saveCurrent(), error =>
        isCode('expired-current')(error) && error.message.includes('Save current account'));
    assert.deepEqual(h.storage.accounts, {});
});
test('re-authentication updates only the account identity that Discord actually verifies', async () => {
    const h = harness({ fetcher: async (url, init) => response(url.endsWith('/auth/login')
        ? { token: tb } : b) });
    saveAccount(h.storage, b, 'fixture-obsolete-saved-token');
    const result = await h.controller.login('account-two@example.invalid', 'valid-fixture-password');
    assert.equal(result.user.id, b.id);
    assert.equal(h.storage.accounts[b.id].token, tb);
    assert.equal(h.session.user.id, a.id);
});
test('target identity mismatch is rejected before native switch', async () => {
    const h = harness({ fetcher: async () => response(a) }); saveAccount(h.storage, b, tb);
    await assert.rejects(h.controller.switchTo(b.id), isCode('mismatch')); assert.deepEqual(h.switched, []);
});
test('native switch resolution alone does not produce a false success', async () => {
    const h = harness({ switcher: () => Promise.resolve() }); saveAccount(h.storage, b, tb);
    await assert.rejects(h.controller.switchTo(b.id), isCode('switch-timeout'));
    assert.ok(h.storage.accounts[a.id]); assert.ok(h.storage.accounts[b.id]); assert.equal(h.controller.busy, false);
});
test('async native switch rejection retains both accounts', async () => {
    const h = harness({ switcher: () => Promise.reject(new Error('native internal token')) }); saveAccount(h.storage, b, tb);
    await assert.rejects(h.controller.switchTo(b.id), error => isCode('switch-failed')(error) && !error.message.includes('internal token'));
    assert.ok(h.storage.accounts[a.id]); assert.ok(h.storage.accounts[b.id]);
});
test('unsupported native API fails cleanly without making a request', async () => {
    const h = harness({ unsupported: true }); saveAccount(h.storage, b, tb);
    await assert.rejects(h.controller.switchTo(b.id), isCode('unsupported')); assert.equal(h.calls.length, 0);
});
test('remove never logs out and automatic refresh does not re-add removed accounts', async () => {
    const h = harness(); await h.controller.saveCurrent();
    assert.equal(h.controller.remove(a.id), true); await h.controller.refreshSaved();
    assert.deepEqual(h.storage.accounts, {}); assert.deepEqual(h.switched, []); assert.equal(h.calls.length, 1);
});
test('background refresh skips unchanged saved tokens and validates a changed session once', async () => {
    const h = harness(); await h.controller.refreshSaved(); assert.equal(h.calls.length, 0);
    saveAccount(h.storage, a, ta); await h.controller.refreshSaved(); await h.controller.refreshSaved();
    assert.equal(h.calls.length, 0);
    const refreshed = 'fixture-refreshed-session-not-real';
    h.setSession({ user: a, token: refreshed });
    const next = harness({ storage: h.storage, fetcher: async () => response(a) });
    next.setSession({ user: a, token: refreshed });
    await next.controller.refreshSaved(); await next.controller.refreshSaved();
    assert.equal(next.calls.length, 1); assert.equal(next.storage.accounts[a.id].token, refreshed);
});
test('a failed changed-session refresh does not loop and manual save can retry', async () => {
    let fail = true;
    const h = harness({ fetcher: async () => response(fail ? {} : a, fail ? 500 : 200) });
    saveAccount(h.storage, a, 'fixture-outdated-saved-session');
    await h.controller.refreshSaved(); await h.controller.refreshSaved(); assert.equal(h.calls.length, 1);
    fail = false; await h.controller.saveCurrent(); assert.equal(h.calls.length, 2);
    assert.equal(h.storage.accounts[a.id].token, ta);
});
test('legacy storage normalization strips secrets outside token, repairs order, and removes malformed entries', () => {
    const storage = { accounts: { [a.id]: { ...a, token: ta, password: 'do-not-keep', addedAt: 22 }, broken: { id: '__proto__', token: ta } }, accountOrder: [a.id, a.id, 'missing'], settings: { exportPasswordHash: 'old-weak-hash' } };
    normalizeStorage(storage);
    assert.deepEqual(storage.accountOrder, [a.id]); assert.equal(storage.accounts[a.id].addedAt, 22);
    assert.ok(!JSON.stringify(storage).includes('do-not-keep')); assert.ok(!JSON.stringify(storage).includes('old-weak-hash'));
});
test('legacy import validates shape, never overwrites a newer local session, and supports object or array storage', () => {
    const storage = {}; normalizeStorage(storage); saveAccount(storage, a, ta);
    assert.deepEqual(importLegacy(storage, { accounts: { old: { ...a, token: tb }, new: { ...b, token: tb }, bad: { ...b, id: '__proto__' } } }), { added: 1, skipped: 2 });
    assert.equal(storage.accounts[a.id].token, ta); assert.deepEqual(storage.accountOrder, [a.id, b.id]);
    assert.deepEqual(importLegacy(storage, [{ ...b, token: tb }]), { added: 0, skipped: 1 });
});
test('non-JSON success response cannot be mistaken for successful login', async () => {
    const h = harness({ fetcher: async () => ({ ok: true, status: 200, json: async () => { throw new Error('HTML'); } }) });
    await assert.rejects(h.controller.login('x', 'y'), isCode('verification')); assert.deepEqual(h.storage.accounts, {});
});
