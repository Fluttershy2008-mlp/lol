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
    const controller = createController({ storage, client, getSession: () => session,
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
