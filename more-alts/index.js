(() => {
// SPDX-License-Identifier: CC0-1.0
// Shared by the separately installable Revenge bundles; no global API changes.
function withRevengeCompatibility(api, factory, pluginName) {
    var active = true;
    var generation = 0;
    var disposers = new Set();
    var warnings = new Set();
    var delayKey = Symbol.for('bunny.api.patcher.delay');
    var raw = api.patcher;
    function warn(message, error) {
        if (warnings.has(message)) return;
        warnings.add(message);
        try { api.logger?.warn?.('[' + pluginName + '] ' + message, error); } catch (_) {}
    }
    function clear() {
        active = false;
        generation++;
        Array.from(disposers).reverse().forEach(function (dispose) { dispose(); });
    }
    function patchKind(kind) {
        function patch(method, parent, callback, once) {
            var epoch = generation;
            var cancelled = false;
            var unpatch;
            var unsubscribe;
            var uiPatch = method === 'render' || method === 'type' || method === 'default';
            function dispose() {
                if (cancelled) return;
                cancelled = true;
                disposers.delete(dispose);
                try { unsubscribe?.(); } catch (error) { warn('Could not cancel a module subscription.', error); }
                try { unpatch?.(); } catch (error) { warn('Could not remove a ' + method + ' patch.', error); }
            }
            if (!active) return dispose;
            disposers.add(dispose);
            function install(target) {
                if (cancelled || !active || epoch !== generation) return;
                try {
                    var owner = target;
                    var key = method;
                    // React memo/forwardRef exports are objects, not functions.
                    // Inspect the resolved module, not just the lazy proxy.
                    for (var depth = 0; uiPatch && depth < 8; depth++) {
                        var value = owner?.[key];
                        if (value?.$$typeof === Symbol.for('react.memo')) {
                            owner = value; key = 'type';
                        } else if (value?.$$typeof === Symbol.for('react.forward_ref')) {
                            owner = value; key = 'render';
                        } else break;
                    }
                    if (uiPatch && typeof owner?.[key] !== 'function') {
                        warn('Skipped unavailable Discord component method: ' + method);
                        dispose();
                        return;
                    }
                    var remove = raw[kind](key, owner, function () {
                        if (!active || cancelled || epoch !== generation) {
                            if (kind === 'after') return arguments[1];
                            if (kind === 'instead') return arguments[1].apply(this, arguments[0]);
                            return;
                        }
                        try { return callback.apply(this, arguments); }
                        finally { if (once) dispose(); }
                    });
                    // A module can synchronously unload the plugin while installing.
                    if (cancelled || !active || epoch !== generation) remove?.();
                    else unpatch = remove;
                } catch (error) {
                    dispose();
                    // Required data/action patches must still fail visibly.
                    // Only optional UI methods can safely be skipped.
                    if (!uiPatch) throw error;
                    warn('Skipped incompatible Discord component patch: ' + method, error);
                }
            }
            try {
                var delay = parent?.[delayKey];
                if (typeof delay === 'function') {
                    var cancel = delay.call(parent, function (target) {
                        try { install(target); }
                        catch (error) {
                            // The caller is now Discord's module loader, outside
                            // the plugin loader's onLoad error boundary.
                            warn('Deferred Discord method is unavailable: ' + method, error);
                        }
                    });
                    if (typeof cancel === 'function') {
                        if (cancelled) cancel();
                        else unsubscribe = cancel;
                    }
                } else install(parent);
            } catch (error) {
                dispose();
                if (!uiPatch) throw error;
                warn('Could not resolve Discord component: ' + method, error);
            }
            return dispose;
        }
        patch.await = function (method, promise, callback, once) {
            var epoch = generation;
            var cancelled = false;
            var remove;
            function dispose() {
                if (cancelled) return;
                cancelled = true;
                disposers.delete(dispose);
                remove?.();
            }
            if (!active) return dispose;
            disposers.add(dispose);
            Promise.resolve(promise).then(function (target) {
                if (!cancelled && active && epoch === generation) remove = patch(method, target, callback, once);
            }).catch(function (error) {
                warn('Deferred patch failed: ' + method, error);
                dispose();
            });
            return dispose;
        };
        return patch;
    }
    var guardedPatcher;
    function currentPatcher() {
        if (!guardedPatcher || raw !== api.patcher) {
            raw = api.patcher;
            guardedPatcher = Object.create(raw || null);
            ['before', 'after', 'instead'].forEach(function (kind) {
                if (typeof raw?.[kind] === 'function') Object.defineProperty(guardedPatcher, kind, { value: patchKind(kind), enumerable: true });
            });
        }
        return guardedPatcher;
    }
    var localAPI = Object.create(api);
    Object.defineProperty(localAPI, 'patcher', { get: currentPatcher, enumerable: true });
    // Discord's legacy JS toast bridge can queue a broken ToastContainer on
    // newer Android builds (useToastContainer reads .position of undefined).
    // Keep this adapter per-plugin. Never change api.ui or Discord's global UI.
    function safeToast(message) {
        var label = typeof message === 'string' || typeof message === 'number'
            ? String(message)
            : String(message?.message ?? message?.text ?? '');
        if (!label) return;
        try {
            var nativeToast = api.metro?.common?.ReactNative?.ToastAndroid;
            if (typeof nativeToast?.show === 'function') {
                return nativeToast.show(label, nativeToast.SHORT ?? 0);
            }
        } catch (error) {
            warn('Native Android notification failed.', error);
        }
        warn('Notification logged because the Discord toast bridge is unsafe: ' + label);
    }
    var lastUI, lastToasts, adaptedUI;
    function currentUI() {
        var ui = api.ui;
        if (!ui?.toasts) return ui;
        if (ui !== lastUI || ui.toasts !== lastToasts) {
            lastUI = ui;
            lastToasts = ui.toasts;
            adaptedUI = Object.create(ui);
            var toasts = Object.create(ui.toasts);
            Object.defineProperty(toasts, 'showToast', { value: safeToast, enumerable: true });
            Object.defineProperty(adaptedUI, 'toasts', { value: toasts, enumerable: true });
        }
        return adaptedUI;
    }
    Object.defineProperty(localAPI, 'ui', { get: currentUI, enumerable: true });
    var plugin;
    try { plugin = factory(localAPI); }
    catch (error) { clear(); throw error; }
    if (!plugin || typeof plugin !== 'object') { clear(); throw new Error(pluginName + ': invalid plugin exports'); }
    var result = Object.assign({}, plugin);
    result.onLoad = function () {
        active = true;
        var epoch = generation;
        function failed(error) {
            if (active && epoch === generation) {
                try { result.onUnload(); } catch (cleanupError) { warn('Startup cleanup failed.', cleanupError); }
            }
            throw error;
        }
        try {
            var pending = plugin.onLoad?.apply(this, arguments);
            if (pending && typeof pending.then === 'function') return Promise.resolve(pending).catch(failed);
            return pending;
        } catch (error) {
            return failed(error);
        }
    };
    result.onUnload = function () {
        clear();
        return plugin.onUnload?.apply(this, arguments);
    };
    return result;
}

return withRevengeCompatibility(vendetta, function(vendetta) {
return (() => {
'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later */
class AccountError extends Error {
    constructor(code, message, retryAfter = 0) { super(message); this.name = 'AccountError'; this.code = code; this.retryAfter = retryAfter; }
}
const validId = id => typeof id === 'string' && /^\d{15,22}$/.test(id);
const validToken = token => typeof token === 'string' && token.length >= 20 && token.length <= 4096 && !/\s/.test(token) && !/^(Bot|Bearer)\b/i.test(token);
const fail = (code, message) => { throw new AccountError(code, message); };
function normalizeStorage(storage) {
    const accounts = {};
    for (const account of Object.values(storage.accounts && typeof storage.accounts === 'object' ? storage.accounts : {})) {
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
function saveAccount(storage, user, token) {
    if (!validId(user?.id) || typeof user.username !== 'string' || !validToken(token)) fail('invalid-user', 'Discord returned an incomplete account. Please sign in again.');
    const updated = !!storage.accounts[user.id];
    storage.accounts = { ...storage.accounts, [user.id]: cleanAccount(user, token, storage.accounts[user.id]) };
    if (!storage.accountOrder.includes(user.id)) storage.accountOrder = [...storage.accountOrder, user.id];
    return { user, updated };
}
function importLegacy(storage, legacy) {
    const entries = Array.isArray(legacy) ? legacy : Object.values(legacy?.accounts || {});
    if (!entries.length) fail('empty-import', 'No saved accounts were found in the old plugin. Save an account there first.');
    let added = 0, skipped = 0;
    for (const account of entries) {
        if (!validId(account?.id) || !validToken(account?.token) || typeof account.username !== 'string' || storage.accounts[account.id]) { skipped++; continue; }
        saveAccount(storage, account, account.token); added++;
    }
    return { added, skipped };
}
function describeFailure(status, body, retryHeader, path = '') {
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
    if (status === 401) {
        if (path === '/auth/login') return new AccountError('credentials',
            'Discord did not accept these sign-in details. Check your email or phone number and password.');
        if (path === '/auth/mfa/totp') return new AccountError('mfa-code',
            'Discord did not accept that verification code. Try a new code or an unused backup code.');
        return new AccountError('expired', 'Discord no longer accepts this saved account session. Sign in again to refresh it.');
    }
    if (data.errors?.login || data.errors?.password || data.code === 50035) return new AccountError('credentials', 'Discord rejected the sign-in details. Check your email or phone number and password.');
    // Never print server messages, full HTTP errors, credentials, or response bodies.
    return new AccountError('login', 'Discord could not complete sign-in. Check your details, or sign in through Discord and save the current account.');
}
function createClient({ fetcher, now = Date.now, timeoutMs = 20000, Abort = globalThis.AbortController }) {
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
                const error = describeFailure(response.status, response.data, response.retry, path);
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
function createController({ storage, client, getSession, getSwitcher, now = Date.now, switchTimeoutMs = 15000, pollMs = 250 }) {
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
        let user;
        try { user = await inspectToken(session.token, epoch); }
        catch (error) {
            if (error?.code === 'expired') fail('expired-current',
                'Discord could not verify your current session. Sign in through Discord, then use Save current account again.');
            throw error;
        }
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
        acceptQrLogin(token, expectedUserId) {
            return exclusive(async epoch => {
                if (!validId(expectedUserId)) fail('mismatch', 'The QR login did not identify the approved account.');
                const user = await inspectToken(token, epoch);
                if (user.id !== expectedUserId) fail('mismatch', 'The approved QR account does not match the returned session. Please start again.');
                const result = saveAccount(storage, user, token); notify();
                return { kind: 'saved', ...result };
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
                let target;
                try { target = await inspectToken(account.token, epoch); }
                catch (error) {
                    if (error?.code === 'expired') fail('expired',
                        `Saved session for @${account.username} needs to be renewed. Choose Re-sign in for this account.`);
                    throw error;
                }
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
            let session;
            try { session = getSession(); } catch { return; }
            if (!session?.user || !validToken(session.token) || !storage.accounts[session.user.id]) return;
            const key = `${session.user.id}:${session.token}`;
            if (refreshKey === key) return;
            // An unchanged, already saved session needs no startup HTTP request.
            if (storage.accounts[session.user.id].token === session.token) { refreshKey = key; return; }
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

/* SPDX-License-Identifier: GPL-3.0-or-later */
// Vendetta's finders require uninitialized Metro factories while searching.
// Optional features must never do that during Discord's startup.
function createModuleResolver(metro, { now = Date.now } = {}) {
    const entries = new Map();
    const modules = metro.modules;
    const loadedOnly = !!modules && typeof modules === 'object';
    function entry(kind, keys) {
        const id = JSON.stringify([kind, ...keys]);
        if (!entries.has(id)) entries.set(id, { kind, keys, value: undefined, checked: -Infinity });
        return entries.get(id);
    }
    function inspect(record, exports) {
        if (record.value || !exports) return;
        try {
            if (record.kind === 'props' ? record.keys.every(key => exports[key] != null)
                : typeof exports.getName === 'function' && exports.getName.length === 0 && exports.getName() === record.keys[0]) record.value = exports;
        } catch {}
    }
    function inspectModule(module, records) {
        // Do not invoke the factory, __r, or read exports on uninitialized modules.
        if (!module?.isInitialized || module.hasError) return;
        let exports;
        try { exports = module.publicModule?.exports; } catch { return; }
        for (const record of records) {
            try { if (exports?.__esModule) inspect(record, exports.default); } catch {}
            inspect(record, exports);
        }
    }
    function lookup(kind, keys, userAction = false) {
        const record = entry(kind, keys);
        if (record.value || (!userAction && now() - record.checked < 5000)) return record.value;
        record.checked = now();
        if (loadedOnly) {
            for (const id in modules) { try { inspectModule(modules[id], [record]); } catch {} if (record.value) break; }
        } else {
            // Older loaders without the module registry: user actions only.
            try { record.value = kind === 'props' ? metro.findByProps(...keys) : metro.findByStoreName(keys[0]); } catch {}
        }
        return record.value;
    }
    return {
        loadedOnly,
        byProps: (...keys) => lookup('props', keys),
        byStore: name => lookup('store', [name]),
        clear() { entries.clear(); },
        async prepare(queries, yieldFrame, isActive) {
            if (!loadedOnly) return;
            const records = queries.map(([kind, ...keys]) => entry(kind, keys));
            let count = 0;
            for (const id in modules) {
                if (!isActive()) return;
                try { inspectModule(modules[id], records); } catch {}
                if (records.every(record => record.value)) break;
                if (++count % 64 === 0) await yieldFrame();
            }
            if (isActive()) for (const record of records) record.checked = now();
        }
    };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */

const SHORTCUT_KEY = 'MORE_ALTS_FLUTTERSHY_SETTINGS';
const CONFIG = 'SETTING_RENDERER_CONFIG';
const BRIDGE = Symbol.for('more-alts.settings.renderer.v1');
const HIDDEN_ROW = Object.freeze({
  type: 'pressable', parent: null, title: () => 'More Alts!', useTitle: () => 'More Alts!',
  usePredicate: () => false, onPress: () => {}, withArrow: true,
});

// Keep the native renderer and the menu row in sync. Other sidebar plugins may
// have replaced Revenge's dynamic getter with a captured renderer map.
function connectSettingsRenderer(constants, renderer) {
  if (!constants) return undefined;
  let state;
  try {
    state = constants[BRIDGE];
    if (!state) {
      state = { row: HIDDEN_ROW, getter: undefined };
      Object.defineProperty(constants, BRIDGE, { value: state, configurable: true });
    }
  } catch { return undefined; }

  function ensure() {
    try {
      const previous = Object.getOwnPropertyDescriptor(constants, CONFIG);
      // Another plugin can wrap our getter and still preserve this entry. Do
      // not keep wrapping each other on every settings row render.
      if (constants[CONFIG]?.[SHORTCUT_KEY] === state.row) return true;
      if (previous?.configurable === false) return false;

      // Call the prior accessor on each read. Taking a snapshot here would hide
      // later rows from Revenge or other plugins, recreating this crash.
      let assigned = false, value = previous?.value ?? constants[CONFIG];
      const getter = () => ({
        ...(previous?.get && !assigned ? previous.get.call(constants) : value),
        [SHORTCUT_KEY]: state.row,
      });
      Object.defineProperty(constants, CONFIG, {
        configurable: true, enumerable: previous?.enumerable ?? true,
        get: getter,
        set(next) {
          if (previous?.set) previous.set.call(constants, next);
          else { assigned = true; value = next; }
        },
      });
      state.getter = getter;
      return constants[CONFIG][SHORTCUT_KEY] === state.row;
    } catch { return false; }
  }

  state.row = renderer;
  if (!ensure()) { state.row = HIDDEN_ROW; return undefined; }
  return {
    ensure,
    release() {
      if (state.row === renderer) state.row = HIDDEN_ROW;
      // Native settings can retain an old array of keys while the screen is
      // open. A hidden, parentless record keeps those keys valid after unload.
      // Reuse this one bridge on re-enable rather than stacking new accessors.
    },
  };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */


// Revenge exposes this registry at bunny.ui.settings.registeredSections.
// Extend the existing section; registerSection("Revenge") would replace its rows.
function registerSettingsShortcut({ settingsAPI, Settings, constants, treeManager, patcher,
  openSettings, renderIcon, getAssetID, log = () => {} }) {
  const sections = settingsAPI?.registeredSections;
  if (!sections || typeof sections !== 'object') {
    log('Settings shortcut is unavailable on this Revenge version. Use the plugin settings button.');
    return () => {};
  }
  // Match stable row keys so the shortcut also works with translated headings.
  const rows = Object.values(sections).find(items => Array.isArray(items)
    && items.some(item => item?.key === 'BUNNY_PLUGINS'));
  if (!rows || rows.some(item => item?.key === SHORTCUT_KEY)) return () => {};

  let icon;
  for (const name of ['UserIcon', 'FriendsIcon', 'WrenchIcon']) {
    try {
      const id = getAssetID?.(name);
      if (id != null) { icon = id; break; }
    } catch {}
  }
  let active = true;
  const renderer = {
    type: 'pressable', parent: null,
    title: () => 'More Alts!', useTitle: () => 'More Alts!', icon,
    IconComponent: icon != null && renderIcon ? () => renderIcon(icon) : undefined,
    usePredicate: () => active,
    onPress: () => { if (active) openSettings?.(); },
    withArrow: true,
  };
  // Do this BEFORE exposing the key in registeredSections. Otherwise Discord's
  // getAncestors reads .parent on an undefined renderer and crashes Settings.
  const bridge = connectSettingsRenderer(constants, renderer);
  if (!bridge) {
    active = false;
    log('Could not register a native settings row safely. Use the plugin settings button.');
    return () => {};
  }
  let unpatch;
  try {
    if (typeof treeManager?.getAncestors === 'function' && typeof patcher?.before === 'function') {
      unpatch = patcher.before('getAncestors', treeManager, args => {
        // Repair only our own entry if another plugin replaces the renderer
        // accessor later. Let the original tree/blocking logic run unchanged.
        if (args[0] === SHORTCUT_KEY) bridge.ensure();
      });
    }
  } catch {}
  const row = {
    key: SHORTCUT_KEY,
    title: () => 'More Alts!',
    icon,
    usePredicate: renderer.usePredicate,
    rawTabsConfig: renderer,
    // Revenge supplies the native screen header, navigation and back button.
    render: async () => ({ default: Settings }),
  };
  try {
    const anchor = rows.findIndex(item => item?.key === 'BUNNY_PLUGINS');
    rows.splice(anchor + 1, 0, row);
  } catch {
    active = false; unpatch?.(); bridge.release();
    log('Could not add the settings shortcut. Use the plugin settings button.');
    return () => {};
  }

  return () => {
    active = false;
    // Some plugins replace the section array. Remove our row wherever it moved,
    // retaining every other row (including Account Switcher).
    for (const items of new Set([rows, ...Object.values(sections)])) {
      if (!Array.isArray(items)) continue;
      const index = items.indexOf(row);
      if (index !== -1) {
        try { items.splice(index, 1); } catch {}
      }
    }
    unpatch?.(); unpatch = undefined;
    bridge.release();
  };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */

// Small native login dialog with no QR login or embedded web browser.
// The account manager, login flow, and two-factor verification remain intact.
function createLoginDialog(React, RN) {
    const h = React.createElement;
    return function LoginDialog({ visible, mfa = false, light = false, busy = false,
        login, password, code, error, onLoginChange, onPasswordChange, onCodeChange,
        onSubmit, onClose, onBack, onForgotPassword, onNativeLogin }) {
        if (!visible) return null;
        const c = light
            ? { card: '#ffffff', field: '#f2f3f5', border: '#d3d5da', text: '#1e1f22', muted: '#5c5e66', link: '#4752c4', danger: '#c32943', footer: '#f2f3f5' }
            : { card: '#242429', field: '#1f1f24', border: '#3a3a42', text: '#f2f3f5', muted: '#b5b5bd', link: '#8991ff', danger: '#ffb0b9', footer: '#202025' };
        const ready = !busy && (mfa ? !!code.trim() : !!login.trim() && !!password.length);
        const submit = () => { if (ready) onSubmit(); };
        const text = (value, style = {}, extra = {}) => h(RN.Text,
            { style: { color: c.text, fontSize: 15, lineHeight: 21, ...style }, ...extra }, value);
        const link = (title, action) => h(RN.TouchableOpacity, {
            accessibilityRole: 'button', accessibilityLabel: title, onPress: action,
            disabled: busy, style: { minHeight: 44, justifyContent: 'center', opacity: busy ? 0.5 : 1 }
        }, text(title, { color: c.link, fontSize: 14 }));
        const field = (label, value, onChangeText, props) => h(RN.View, { style: { marginBottom: 16 } },
            text(label, { fontWeight: '600', marginBottom: 6 }),
            h(RN.TextInput, { value, onChangeText, editable: !busy, accessibilityLabel: label,
                autoCapitalize: 'none', autoCorrect: false, selectionColor: '#8991ff',
                style: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
                    color: c.text, backgroundColor: c.field, borderWidth: 1, borderColor: c.border, borderRadius: 8 },
                ...props }));
        return h(RN.Modal, { visible: true, transparent: true, animationType: 'fade',
            presentationStyle: 'overFullScreen', onRequestClose: onClose, statusBarTranslucent: true },
            h(RN.KeyboardAvoidingView, { style: { flex: 1 }, behavior: RN.Platform?.OS === 'ios' ? 'padding' : 'height' },
                h(RN.View, { style: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
                    alignItems: 'center', justifyContent: 'center', padding: 16 } },
                    h(RN.View, { accessibilityViewIsModal: true,
                        style: { width: '100%', maxWidth: 480, maxHeight: '90%',
                            backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, overflow: 'hidden' } },
                        h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', bounces: false,
                            style: { flexShrink: 1 },
                            contentContainerStyle: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 12 } },
                            h(RN.View, { style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } },
                                text(mfa ? 'Two-Factor Authentication' : 'Add Account',
                                    { fontSize: 22, lineHeight: 28, fontWeight: '700' },
                                    { accessibilityRole: 'header' }),
                                h(RN.TouchableOpacity, { accessibilityRole: 'button',
                                    accessibilityLabel: 'Close add account', onPress: onClose,
                                    style: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' } },
                                    text('×', { color: c.muted, fontSize: 30, lineHeight: 32 }))),
                            text(mfa ? 'Enter your authenticator or backup code to finish signing in.'
                                : 'Sign in to save another account and switch between profiles.',
                                { color: c.muted, marginTop: 4, marginBottom: 20 }),
                            error ? text(error, { color: c.danger, marginBottom: 16 },
                                { accessibilityRole: 'alert', accessibilityLiveRegion: 'polite' }) : null,
                            mfa ? field('Verification Code', code, onCodeChange,
                                { secureTextEntry: true, autoComplete: 'one-time-code',
                                    returnKeyType: 'done', onSubmitEditing: submit })
                                : h(RN.View, null,
                                    field('Email or Phone Number', login, onLoginChange,
                                        { autoComplete: 'username', keyboardType: 'email-address', textContentType: 'username' }),
                                    field('Password', password, onPasswordChange,
                                        { secureTextEntry: true, autoComplete: 'password',
                                            textContentType: 'password', returnKeyType: 'go', onSubmitEditing: submit }),
                                    link('Forgot your password?', onForgotPassword)),
                            link('Use Discord’s normal sign-in', onNativeLogin),
                            text('Passwords and verification codes are never saved.',
                                { color: c.muted, fontSize: 12, lineHeight: 17, marginTop: 8 })),
                        h(RN.View, { style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                            backgroundColor: c.footer, paddingHorizontal: 22, paddingVertical: 16 } },
                            h(RN.TouchableOpacity, { accessibilityRole: 'button', accessibilityLabel: 'Back',
                                onPress: onBack, style: { minHeight: 44, minWidth: 68, justifyContent: 'center' } },
                                text('Back', { fontWeight: '600' })),
                            h(RN.TouchableOpacity, { accessibilityRole: 'button', accessibilityLabel: mfa ? 'Verify' : 'Continue',
                                accessibilityState: { disabled: !ready, busy }, disabled: !ready, onPress: submit,
                                style: { minHeight: 44, minWidth: 112, borderRadius: 8, alignItems: 'center',
                                    justifyContent: 'center', backgroundColor: '#5865f2', opacity: ready ? 1 : 0.5 } },
                                busy ? h(RN.ActivityIndicator, { color: '#ffffff', size: 'small', accessibilityLabel: 'Signing in' })
                                    : text(mfa ? 'Verify' : 'Continue', { color: '#ffffff', fontWeight: '700' })))))));
    };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */

function createPlugin(V, host = globalThis) {
    const { React, ReactNative: RN } = V.metro.common;
    const h = React.createElement, storage = V.plugin.storage;
    const LoginDialog = createLoginDialog(React, RN);
    const resolver = createModuleResolver(V.metro);
    const setTimer = (fn, ms) => (host.setTimeout || setTimeout)(fn, ms);
    const clearTimer = id => (host.clearTimeout || clearTimeout)(id);
    const disposers = [];
    let active = false, controller, refreshTimer, initTimer, idleTask, nativeReady = false, optionalReady = false, epoch = 0;
    const pendingFrames = new Map();
    const byProps = resolver.byProps;
    const byStore = resolver.byStore;
    const toast = text => { try { V.ui?.toasts?.showToast(text); } catch {} };
    const log = text => { try { V.logger?.warn?.(`[More Alts] ${text}`); } catch {} };
    function getSession() {
        try { return { user: byStore('UserStore')?.getCurrentUser?.(), token: byProps('getToken')?.getToken?.() }; }
        catch { return {}; }
    }
    function getSwitcher() {
        const auth = byProps('switchAccountToken');
        return typeof auth?.switchAccountToken === 'function' ? token => auth.switchAccountToken(token) : undefined;
    }
    function scheduleRefresh() {
        if (!active || !optionalReady || !storage.settings.refreshSavedSessions || !storage.accountOrder.length) return;
        clearTimer(refreshTimer);
        const instance = controller;
        refreshTimer = setTimer(() => {
            if (active && controller === instance) void instance.refreshSaved().catch(() => {});
        }, 1500);
    }
    function openSettings() {
        if (!active) return;
        try {
            const nav = byProps('getRootNavigationRef')?.getRootNavigationRef?.();
            if (!nav?.navigate) throw new Error();
            nav.navigate('BUNNY_CUSTOM_PAGE', { title: 'More Alts!', render: () => h(Settings) });
        } catch { toast('Open Revenge → Plugins → More Alts! → Settings.'); }
    }
    function nativeLoginHelp() {
        RN.Alert.alert('Sign in through Discord',
            'Save your current account here first. Open Discord’s account menu and choose Add account, then complete any CAPTCHA, passkey, SMS or device verification. Once that account’s chats have loaded, return here and tap Save current account.\n\nThe native account menu depends on your Discord version. More Alts cannot bypass Discord verification.');
    }
    function forgotPassword() {
        RN.Alert.alert('Reset your Discord password',
            'Open Discord’s sign-in page and choose “Forgot your password?”. After resetting it, return here to add your account.', [
                { text: 'Back', style: 'cancel' },
                { text: 'Open Discord', onPress: () => {
                    try {
                        if (typeof RN.Linking?.openURL !== 'function') throw new Error();
                        Promise.resolve(RN.Linking.openURL('https://discord.com/login')).catch(() => toast('Open discord.com/login in your browser to reset your password.'));
                    } catch { toast('Open discord.com/login in your browser to reset your password.'); }
                } }
            ]);
    }
    async function importOld() {
        // Read only the original, installed Apex MoreAlts storage, only after
        // pressing Import. Never scan arbitrary plugin storage for sessions.
        const ids = Object.keys(V.plugins?.plugins || {}).filter(id =>
            /^https:\/\/apexteampl\.github\.io\/Apex-Plugins\/MoreAlts\/?$/i.test(id));
        if (!ids.length) throw new AccountError('no-legacy', 'Keep the original Apex More Alts installed but disabled, then try importing again.');
        if (typeof V.storage?.createMMKVBackend !== 'function' || typeof V.storage?.createStorage !== 'function')
            throw new AccountError('unsupported', 'Import is unavailable on this Revenge version. Sign in and save each account here.');
        const instance = controller;
        let added = 0, skipped = 0;
        for (const id of ids) {
            const old = await V.storage.createStorage(V.storage.createMMKVBackend(id));
            if (!active || controller !== instance) throw new AccountError('cancelled', 'Cancelled.');
            const result = instance.importAccounts(old); added += result.added; skipped += result.skipped;
        }
        return { added, skipped };
    }
    function Settings() {
        const [, redraw] = React.useState(0);
        const [page, setPage] = React.useState('accounts');
        const [login, setLogin] = React.useState(''), [password, setPassword] = React.useState('');
        const [code, setCode] = React.useState(''), [query, setQuery] = React.useState('');
        const [notice, setNotice] = React.useState(''), [error, setError] = React.useState('');
        const [expiredAccountId, setExpiredAccountId] = React.useState(null);
        const [reauthId, setReauthId] = React.useState(null);
        const [localBusy, setLocalBusy] = React.useState(false);
        const mounted = React.useRef(true), authenticating = React.useRef(false), localLock = React.useRef(false);
        const instance = controller;
        React.useEffect(() => {
            // Legacy loaders initialize compatibility features when the manager is opened.
            if (!resolver.loadedOnly && active && !optionalReady) initializeOptional();
            scheduleRefresh();
        }, [instance]);
        React.useEffect(() => {
            mounted.current = true;
            const unsubscribe = instance?.subscribe(() => { if (mounted.current) redraw(x => x + 1); });
            return () => { mounted.current = false; unsubscribe?.(); if (authenticating.current) instance?.cancelLogin(); };
        }, [instance]);
        const osScheme = RN.useColorScheme?.();
        let theme;
        try { theme = byStore('ThemeStore')?.theme; } catch {}
        const light = theme ? theme === 'light' : osScheme === 'light';
        const colors = light ? { bg: '#f5f5f8', card: '#ffffff', text: '#18191c', muted: '#515460', line: '#cbced7', error: '#a11932' }
            : { bg: '#202127', card: '#2c2e36', text: '#f3f4f7', muted: '#bec0cb', line: '#535563', error: '#ffb0b9' };
        const text = (value, style = {}) => h(RN.Text, { style: { color: colors.text, fontSize: 15, lineHeight: 22, marginBottom: 10, ...style } }, value);
        if (!instance || !active) return h(RN.View, { style: { padding: 20 } }, text('Enable More Alts! to manage your saved accounts.'));
        const busy = instance.busy || localBusy;
        const button = (title, onPress, secondary = false, allowBusy = false) => h(RN.TouchableOpacity, {
            accessibilityRole: 'button', accessibilityLabel: title, disabled: busy && !allowBusy, onPress,
            style: { backgroundColor: secondary ? colors.card : '#4d59cd', padding: 14, borderRadius: 10,
                borderColor: colors.line, borderWidth: secondary ? 1 : 0, marginBottom: 12, opacity: busy && !allowBusy ? 0.5 : 1 }
        }, text(title, { color: secondary ? colors.text : '#ffffff', fontWeight: '700', textAlign: 'center', marginBottom: 0 }));
        const input = (label, value, onChangeText, props = {}) => h(RN.View, null,
            text(label, { fontWeight: '600', marginBottom: 6 }), h(RN.TextInput, {
                value, onChangeText, editable: !busy, accessibilityLabel: label,
                autoCapitalize: 'none', autoCorrect: false, placeholderTextColor: colors.muted,
                style: { color: colors.text, backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 16 }, ...props
            }));
        const toggle = (title, key) => h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 } },
            h(RN.View, { style: { flex: 1, paddingRight: 12 } }, text(title, { marginBottom: 0 })),
            h(RN.Switch, { accessibilityLabel: title, disabled: busy, value: !!storage.settings[key], onValueChange: value => {
                storage.settings = { ...storage.settings, [key]: value }; redraw(x => x + 1); scheduleRefresh();
            } }));
        const clearAuth = () => { setLogin(''); setPassword(''); setCode(''); authenticating.current = false; };
        const cancel = () => { instance.cancelLogin(); clearAuth(); setReauthId(null); setPage('accounts'); setError(''); setNotice(''); };
        const stillHere = () => mounted.current && active && controller === instance;
        async function run(action, success, onError) {
            if (localLock.current || instance.busy) return;
            localLock.current = true; setLocalBusy(true); setError(''); setNotice('');
            try { const result = await action(); if (stillHere()) success?.(result); }
            catch (reason) {
                if (stillHere() && reason?.code !== 'cancelled') {
                    onError?.(reason);
                    setError(reason instanceof AccountError ? reason.message : 'The action could not be completed. Try again after Discord finishes loading.');
                }
            } finally { localLock.current = false; if (stillHere()) setLocalBusy(false); }
        }
        function handleLogin(result) {
            setPassword(''); setCode('');
            if (result.kind === 'mfa') { setPage('mfa'); return; }
            const target = reauthId;
            const refreshedTarget = target && target === result.user.id;
            if (refreshedTarget) setExpiredAccountId(null);
            clearAuth(); setReauthId(null); setPage('accounts');
            if (target && !refreshedTarget) {
                const account = instance.accounts.find(item => item.id === target);
                setNotice(`Signed in as @${result.user.username}, but @${account?.username || 'the selected account'} still needs to be signed in again.`);
            } else {
                setNotice(`${result.updated ? 'Updated' : 'Saved'} ${result.user.username}.`);
            }
        }
        const saveCurrent = () => run(() => instance.saveCurrent(), result => {
            clearAuth(); setPage('accounts'); setNotice(`${result.updated ? 'Updated' : 'Saved'} ${result.user.username}.`);
        });
        function beginReauth(account) {
            clearAuth(); setError(''); setNotice('');
            setReauthId(account.id); setPage('login');
        }
        function remove(account) {
            RN.Alert.alert('Remove saved account?', `Remove ${account.username} from More Alts? This only removes its saved session here.`, [
                { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => {
                    if (active && controller === instance && instance.remove(account.id) && mounted.current) {
                        if (expiredAccountId === account.id) setExpiredAccountId(null);
                        setNotice(`Removed ${account.username}.`);
                    }
                } }
            ]);
        }
        const currentId = getSession()?.user?.id;
        const matches = instance.accounts.filter(account => `${account.username} ${account.displayName} ${account.id}`.toLowerCase().includes(query.toLowerCase()));
        const contents = [text('More Alts!', { fontSize: 26, fontWeight: '800', lineHeight: 32 }),
            text('Save your accounts and switch between them.', { color: colors.muted }),
            error ? text(error, { color: colors.error }) : null,
            notice ? text(notice, { fontWeight: '600' }) : null,
            busy ? h(RN.ActivityIndicator, { color: '#8993ff', style: { marginBottom: 12 } }) : null];
        contents.push(button('Save current account', saveCurrent),
            button('Add another account', () => { clearAuth(); setReauthId(null); setPage('login'); setError(''); setNotice(''); }, true),
            input('Search saved accounts', query, setQuery, { placeholder: 'Username, display name or user ID' }),
            text(`${instance.accounts.length} saved account${instance.accounts.length === 1 ? '' : 's'}`, { fontWeight: '700' }));
        contents.push(...matches.map(account => h(RN.View, { key: account.id, style: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 12 } },
            h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 } },
                account.avatar && /^[a-zA-Z0-9_]+$/.test(account.avatar) ? h(RN.Image, { source: { uri: `https://cdn.discordapp.com/avatars/${account.id}/${account.avatar}.png?size=128` }, style: { width: 42, height: 42, borderRadius: 21, marginRight: 12 } }) : null,
                h(RN.View, { style: { flex: 1 } }, text(account.displayName, { fontWeight: '700', fontSize: 17, marginBottom: 2 }),
                    text(`@${account.username}${currentId === account.id ? ' · Current account' : ''}`, { color: colors.muted, marginBottom: 0 }))),
            currentId !== account.id ? button('Switch account', () =>
                run(() => instance.switchTo(account.id), result => {
                    setExpiredAccountId(null); setNotice(`Switched to ${result.user.username}.`);
                }, reason => { if (reason?.code === 'expired') setExpiredAccountId(account.id); })) : null,
            expiredAccountId === account.id ? text('Discord rejected this saved session. Sign in again to update this account without removing it.',
                { color: colors.error, fontSize: 13 }) : null,
            expiredAccountId === account.id ? button('Re-sign in', () => beginReauth(account), true) : null,
            button('Remove saved account', () => remove(account), true))));
        if (!matches.length) contents.push(text(query ? 'No matching accounts.' : 'Save your current account to get started.', { color: colors.muted }));
        contents.push(button('Import accounts from old More Alts', () => run(importOld, result => setNotice(`Imported ${result.added} account${result.added === 1 ? '' : 's'}; skipped ${result.skipped} existing or invalid entries.`)), true),
            text('For import, keep the original Apex More Alts installed but disabled.', { color: colors.muted }),
            toggle('Refresh saved sessions after signing in', 'refreshSavedSessions'),
            toggle('Enable Discord’s native account menu', 'enableNativeSwitcher'),
            text(nativeReady ? 'Reopen Discord settings after changing the native menu option.' : 'The native menu is unavailable on this build. The saved-account list above still works.', { color: colors.muted }),
            button('Help with Discord verification', nativeLoginHelp, true),
            text('Saved sessions stay in Revenge’s local plugin storage. Passwords and verification codes are never stored. Signing out or changing a password can expire a saved session.', { color: colors.muted }));
        return h(RN.KeyboardAvoidingView, { style: { flex: 1, backgroundColor: colors.bg }, behavior: RN.Platform?.OS === 'ios' ? 'padding' : undefined },
            h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: 18, paddingBottom: 48 },
                importantForAccessibility: page === 'accounts' ? 'auto' : 'no-hide-descendants', accessibilityElementsHidden: page !== 'accounts' }, ...contents),
            h(LoginDialog, { visible: page !== 'accounts', mfa: page === 'mfa', light, busy,
                reauthUsername: reauthId ? instance.accounts.find(account => account.id === reauthId)?.username : undefined,
                login, password, code, error, onLoginChange: setLogin, onPasswordChange: setPassword, onCodeChange: setCode,
                onClose: cancel, onBack: () => {
                    if (page !== 'mfa') { cancel(); return; }
                    instance.cancelLogin(); setPassword(''); setCode(''); setError(''); setPage('login');
                },
                onForgotPassword: forgotPassword, onNativeLogin: nativeLoginHelp,
                onSubmit: () => {
                    authenticating.current = true;
                    if (page === 'mfa') {
                        const typedCode = code; setCode(''); void run(() => instance.submitCode(typedCode), handleLogin);
                    } else {
                        const typedPassword = password; setPassword(''); void run(() => instance.login(login, typedPassword), handleLogin);
                    }
                }
            }));
    }
    function initializeOptional() {
        if (!active || optionalReady) return;
        optionalReady = true;
        try {
            const native = byProps('getCanUseMultiAccountMobile');
            if (typeof native?.getCanUseMultiAccountMobile === 'function') {
                const unpatch = V.patcher.after('getCanUseMultiAccountMobile', native, (_, result) => active && storage.settings.enableNativeSwitcher ? true : result);
                if (typeof unpatch === 'function') { nativeReady = true; disposers.push(unpatch); }
            }
        } catch { log('Native menu is unavailable; plugin settings remain accessible.'); }
        ['UserStore', 'AuthenticationStore'].forEach(name => {
            try {
                const store = byStore(name);
                if (typeof store?.addChangeListener === 'function' && typeof store?.removeChangeListener === 'function') {
                    store.addChangeListener(scheduleRefresh); disposers.push(() => store.removeChangeListener(scheduleRefresh));
                }
            } catch {}
        });
        try {
            const subscription = RN.AppState?.addEventListener?.('change', state => { if (state === 'active') scheduleRefresh(); });
            if (subscription?.remove) disposers.push(() => subscription.remove());
        } catch {}
        try {
            disposers.push(registerSettingsShortcut({
                settingsAPI: host.bunny?.ui?.settings ?? host.window?.bunny?.ui?.settings,
                Settings, constants: byProps('SETTING_RENDERER_CONFIG'), treeManager: byProps('getAncestors', 'isBlocked'),
                patcher: V.patcher, openSettings,
                renderIcon: source => h(RN.Image, { source, style: { width: 24, height: 24 } }),
                getAssetID: name => V.ui?.assets?.getAssetIDByName(name), log
            }));
        } catch { log('Use the plugin settings button to manage accounts.'); }
        try {
            // registerCommand itself resolves Discord's built-in command module.
            const register = !resolver.loadedOnly || byProps('getBuiltInCommands') ? V.commands?.registerCommand : undefined;
            const unreg = register?.({ name: 'morealts', displayName: 'morealts', type: 1, inputType: 1,
                applicationId: '-1', description: 'Open More Alts account switcher', displayDescription: 'Open More Alts account switcher',
                options: [], execute: () => { openSettings(); return undefined; } });
            if (typeof unreg === 'function') disposers.push(unreg);
        } catch {}
        scheduleRefresh();
    }
    function yieldFrame() {
        return new Promise(resolve => {
            const timer = setTimer(() => { pendingFrames.delete(timer); resolve(); }, 0);
            pendingFrames.set(timer, resolve);
        });
    }
    function onLoad() {
        if (active) return;
        controller = createController({ storage, client: createClient({ fetcher: (...args) => host.fetch(...args) }), getSession, getSwitcher });
        active = true; optionalReady = false;
        const generation = ++epoch;
        // No synchronous Discord module searches, API calls or native patches.
        // Older loaders use the settings button until the manager is opened.
        if (!resolver.loadedOnly) return;
        initTimer = setTimer(() => {
            initTimer = undefined;
            const initialize = () => {
                if (!active || epoch !== generation) return;
                const isActive = () => active && epoch === generation;
                void resolver.prepare([
                    ['props', 'getCanUseMultiAccountMobile'], ['store', 'UserStore'],
                    ['store', 'AuthenticationStore'], ['props', 'getToken'],
                    ['props', 'SETTING_RENDERER_CONFIG'], ['props', 'getAncestors', 'isBlocked'],
                    ['store', 'ThemeStore'], ['props', 'getBuiltInCommands']
                ], yieldFrame, isActive).then(() => {
                    if (isActive()) initializeOptional();
                }).catch(() => { if (isActive()) log('Optional shortcuts are unavailable. Use the plugin settings button.'); });
            };
            try {
                if (typeof RN.InteractionManager?.runAfterInteractions === 'function') {
                    idleTask = RN.InteractionManager.runAfterInteractions(initialize); return;
                }
            } catch {}
            initialize();
        }, 1500);
    }
    function onUnload() {
        active = false; epoch++; optionalReady = false; nativeReady = false;
        clearTimer(refreshTimer); clearTimer(initTimer); initTimer = undefined;
        try { idleTask?.cancel?.(); } catch {} idleTask = undefined;
        for (const [timer, resolve] of pendingFrames) { clearTimer(timer); resolve(); } pendingFrames.clear();
        controller?.stop();
        for (const dispose of disposers.splice(0).reverse()) { try { dispose?.(); } catch {} }
        resolver.clear();
    }
    return { onLoad, onUnload, settings: Settings };
}

return createPlugin(vendetta);
})()
}, "More Alts!");
})()
