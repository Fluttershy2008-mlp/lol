(() => {
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
function describeFailure(status, body, retryHeader) {
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
    function lookup(kind, keys) {
        const record = entry(kind, keys);
        if (record.value || now() - record.checked < 5000) return record.value;
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

// Generated by build.mjs; QR encoder carries its MIT license in vendor/LICENSE.qrcode.
const QR_VENDOR_SOURCE = "//---------------------------------------------------------------------\n//\n// QR Code Generator for JavaScript\n//\n// Copyright (c) 2009 Kazuhiko Arase\n//\n// URL: http://www.d-project.com/\n//\n// Licensed under the MIT license:\n//  http://www.opensource.org/licenses/mit-license.php\n//\n// The word 'QR Code' is registered trademark of\n// DENSO WAVE INCORPORATED\n//  http://www.denso-wave.com/qrcode/faqpatent-e.html\n//\n//---------------------------------------------------------------------\n\nvar qrcode = function() {\n\n  //---------------------------------------------------------------------\n  // qrcode\n  //---------------------------------------------------------------------\n\n  /**\n   * qrcode\n   * @param typeNumber 1 to 40\n   * @param errorCorrectionLevel 'L','M','Q','H'\n   */\n  var qrcode = function(typeNumber, errorCorrectionLevel) {\n\n    var PAD0 = 0xEC;\n    var PAD1 = 0x11;\n\n    var _typeNumber = typeNumber;\n    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];\n    var _modules = null;\n    var _moduleCount = 0;\n    var _dataCache = null;\n    var _dataList = [];\n\n    var _this = {};\n\n    var makeImpl = function(test, maskPattern) {\n\n      _moduleCount = _typeNumber * 4 + 17;\n      _modules = function(moduleCount) {\n        var modules = new Array(moduleCount);\n        for (var row = 0; row < moduleCount; row += 1) {\n          modules[row] = new Array(moduleCount);\n          for (var col = 0; col < moduleCount; col += 1) {\n            modules[row][col] = null;\n          }\n        }\n        return modules;\n      }(_moduleCount);\n\n      setupPositionProbePattern(0, 0);\n      setupPositionProbePattern(_moduleCount - 7, 0);\n      setupPositionProbePattern(0, _moduleCount - 7);\n      setupPositionAdjustPattern();\n      setupTimingPattern();\n      setupTypeInfo(test, maskPattern);\n\n      if (_typeNumber >= 7) {\n        setupTypeNumber(test);\n      }\n\n      if (_dataCache == null) {\n        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);\n      }\n\n      mapData(_dataCache, maskPattern);\n    };\n\n    var setupPositionProbePattern = function(row, col) {\n\n      for (var r = -1; r <= 7; r += 1) {\n\n        if (row + r <= -1 || _moduleCount <= row + r) continue;\n\n        for (var c = -1; c <= 7; c += 1) {\n\n          if (col + c <= -1 || _moduleCount <= col + c) continue;\n\n          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )\n              || (0 <= c && c <= 6 && (r == 0 || r == 6) )\n              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {\n            _modules[row + r][col + c] = true;\n          } else {\n            _modules[row + r][col + c] = false;\n          }\n        }\n      }\n    };\n\n    var getBestMaskPattern = function() {\n\n      var minLostPoint = 0;\n      var pattern = 0;\n\n      for (var i = 0; i < 8; i += 1) {\n\n        makeImpl(true, i);\n\n        var lostPoint = QRUtil.getLostPoint(_this);\n\n        if (i == 0 || minLostPoint > lostPoint) {\n          minLostPoint = lostPoint;\n          pattern = i;\n        }\n      }\n\n      return pattern;\n    };\n\n    var setupTimingPattern = function() {\n\n      for (var r = 8; r < _moduleCount - 8; r += 1) {\n        if (_modules[r][6] != null) {\n          continue;\n        }\n        _modules[r][6] = (r % 2 == 0);\n      }\n\n      for (var c = 8; c < _moduleCount - 8; c += 1) {\n        if (_modules[6][c] != null) {\n          continue;\n        }\n        _modules[6][c] = (c % 2 == 0);\n      }\n    };\n\n    var setupPositionAdjustPattern = function() {\n\n      var pos = QRUtil.getPatternPosition(_typeNumber);\n\n      for (var i = 0; i < pos.length; i += 1) {\n\n        for (var j = 0; j < pos.length; j += 1) {\n\n          var row = pos[i];\n          var col = pos[j];\n\n          if (_modules[row][col] != null) {\n            continue;\n          }\n\n          for (var r = -2; r <= 2; r += 1) {\n\n            for (var c = -2; c <= 2; c += 1) {\n\n              if (r == -2 || r == 2 || c == -2 || c == 2\n                  || (r == 0 && c == 0) ) {\n                _modules[row + r][col + c] = true;\n              } else {\n                _modules[row + r][col + c] = false;\n              }\n            }\n          }\n        }\n      }\n    };\n\n    var setupTypeNumber = function(test) {\n\n      var bits = QRUtil.getBCHTypeNumber(_typeNumber);\n\n      for (var i = 0; i < 18; i += 1) {\n        var mod = (!test && ( (bits >> i) & 1) == 1);\n        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;\n      }\n\n      for (var i = 0; i < 18; i += 1) {\n        var mod = (!test && ( (bits >> i) & 1) == 1);\n        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;\n      }\n    };\n\n    var setupTypeInfo = function(test, maskPattern) {\n\n      var data = (_errorCorrectionLevel << 3) | maskPattern;\n      var bits = QRUtil.getBCHTypeInfo(data);\n\n      // vertical\n      for (var i = 0; i < 15; i += 1) {\n\n        var mod = (!test && ( (bits >> i) & 1) == 1);\n\n        if (i < 6) {\n          _modules[i][8] = mod;\n        } else if (i < 8) {\n          _modules[i + 1][8] = mod;\n        } else {\n          _modules[_moduleCount - 15 + i][8] = mod;\n        }\n      }\n\n      // horizontal\n      for (var i = 0; i < 15; i += 1) {\n\n        var mod = (!test && ( (bits >> i) & 1) == 1);\n\n        if (i < 8) {\n          _modules[8][_moduleCount - i - 1] = mod;\n        } else if (i < 9) {\n          _modules[8][15 - i - 1 + 1] = mod;\n        } else {\n          _modules[8][15 - i - 1] = mod;\n        }\n      }\n\n      // fixed module\n      _modules[_moduleCount - 8][8] = (!test);\n    };\n\n    var mapData = function(data, maskPattern) {\n\n      var inc = -1;\n      var row = _moduleCount - 1;\n      var bitIndex = 7;\n      var byteIndex = 0;\n      var maskFunc = QRUtil.getMaskFunction(maskPattern);\n\n      for (var col = _moduleCount - 1; col > 0; col -= 2) {\n\n        if (col == 6) col -= 1;\n\n        while (true) {\n\n          for (var c = 0; c < 2; c += 1) {\n\n            if (_modules[row][col - c] == null) {\n\n              var dark = false;\n\n              if (byteIndex < data.length) {\n                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);\n              }\n\n              var mask = maskFunc(row, col - c);\n\n              if (mask) {\n                dark = !dark;\n              }\n\n              _modules[row][col - c] = dark;\n              bitIndex -= 1;\n\n              if (bitIndex == -1) {\n                byteIndex += 1;\n                bitIndex = 7;\n              }\n            }\n          }\n\n          row += inc;\n\n          if (row < 0 || _moduleCount <= row) {\n            row -= inc;\n            inc = -inc;\n            break;\n          }\n        }\n      }\n    };\n\n    var createBytes = function(buffer, rsBlocks) {\n\n      var offset = 0;\n\n      var maxDcCount = 0;\n      var maxEcCount = 0;\n\n      var dcdata = new Array(rsBlocks.length);\n      var ecdata = new Array(rsBlocks.length);\n\n      for (var r = 0; r < rsBlocks.length; r += 1) {\n\n        var dcCount = rsBlocks[r].dataCount;\n        var ecCount = rsBlocks[r].totalCount - dcCount;\n\n        maxDcCount = Math.max(maxDcCount, dcCount);\n        maxEcCount = Math.max(maxEcCount, ecCount);\n\n        dcdata[r] = new Array(dcCount);\n\n        for (var i = 0; i < dcdata[r].length; i += 1) {\n          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];\n        }\n        offset += dcCount;\n\n        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);\n        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);\n\n        var modPoly = rawPoly.mod(rsPoly);\n        ecdata[r] = new Array(rsPoly.getLength() - 1);\n        for (var i = 0; i < ecdata[r].length; i += 1) {\n          var modIndex = i + modPoly.getLength() - ecdata[r].length;\n          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;\n        }\n      }\n\n      var totalCodeCount = 0;\n      for (var i = 0; i < rsBlocks.length; i += 1) {\n        totalCodeCount += rsBlocks[i].totalCount;\n      }\n\n      var data = new Array(totalCodeCount);\n      var index = 0;\n\n      for (var i = 0; i < maxDcCount; i += 1) {\n        for (var r = 0; r < rsBlocks.length; r += 1) {\n          if (i < dcdata[r].length) {\n            data[index] = dcdata[r][i];\n            index += 1;\n          }\n        }\n      }\n\n      for (var i = 0; i < maxEcCount; i += 1) {\n        for (var r = 0; r < rsBlocks.length; r += 1) {\n          if (i < ecdata[r].length) {\n            data[index] = ecdata[r][i];\n            index += 1;\n          }\n        }\n      }\n\n      return data;\n    };\n\n    var createData = function(typeNumber, errorCorrectionLevel, dataList) {\n\n      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);\n\n      var buffer = qrBitBuffer();\n\n      for (var i = 0; i < dataList.length; i += 1) {\n        var data = dataList[i];\n        buffer.put(data.getMode(), 4);\n        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );\n        data.write(buffer);\n      }\n\n      // calc num max data.\n      var totalDataCount = 0;\n      for (var i = 0; i < rsBlocks.length; i += 1) {\n        totalDataCount += rsBlocks[i].dataCount;\n      }\n\n      if (buffer.getLengthInBits() > totalDataCount * 8) {\n        throw 'code length overflow. ('\n          + buffer.getLengthInBits()\n          + '>'\n          + totalDataCount * 8\n          + ')';\n      }\n\n      // end code\n      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {\n        buffer.put(0, 4);\n      }\n\n      // padding\n      while (buffer.getLengthInBits() % 8 != 0) {\n        buffer.putBit(false);\n      }\n\n      // padding\n      while (true) {\n\n        if (buffer.getLengthInBits() >= totalDataCount * 8) {\n          break;\n        }\n        buffer.put(PAD0, 8);\n\n        if (buffer.getLengthInBits() >= totalDataCount * 8) {\n          break;\n        }\n        buffer.put(PAD1, 8);\n      }\n\n      return createBytes(buffer, rsBlocks);\n    };\n\n    _this.addData = function(data, mode) {\n\n      mode = mode || 'Byte';\n\n      var newData = null;\n\n      switch(mode) {\n      case 'Numeric' :\n        newData = qrNumber(data);\n        break;\n      case 'Alphanumeric' :\n        newData = qrAlphaNum(data);\n        break;\n      case 'Byte' :\n        newData = qr8BitByte(data);\n        break;\n      case 'Kanji' :\n        newData = qrKanji(data);\n        break;\n      default :\n        throw 'mode:' + mode;\n      }\n\n      _dataList.push(newData);\n      _dataCache = null;\n    };\n\n    _this.isDark = function(row, col) {\n      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {\n        throw row + ',' + col;\n      }\n      return _modules[row][col];\n    };\n\n    _this.getModuleCount = function() {\n      return _moduleCount;\n    };\n\n    _this.make = function() {\n      if (_typeNumber < 1) {\n        var typeNumber = 1;\n\n        for (; typeNumber < 40; typeNumber++) {\n          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);\n          var buffer = qrBitBuffer();\n\n          for (var i = 0; i < _dataList.length; i++) {\n            var data = _dataList[i];\n            buffer.put(data.getMode(), 4);\n            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );\n            data.write(buffer);\n          }\n\n          var totalDataCount = 0;\n          for (var i = 0; i < rsBlocks.length; i++) {\n            totalDataCount += rsBlocks[i].dataCount;\n          }\n\n          if (buffer.getLengthInBits() <= totalDataCount * 8) {\n            break;\n          }\n        }\n\n        _typeNumber = typeNumber;\n      }\n\n      makeImpl(false, getBestMaskPattern() );\n    };\n\n    _this.createTableTag = function(cellSize, margin) {\n\n      cellSize = cellSize || 2;\n      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;\n\n      var qrHtml = '';\n\n      qrHtml += '<table style=\"';\n      qrHtml += ' border-width: 0px; border-style: none;';\n      qrHtml += ' border-collapse: collapse;';\n      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';\n      qrHtml += '\">';\n      qrHtml += '<tbody>';\n\n      for (var r = 0; r < _this.getModuleCount(); r += 1) {\n\n        qrHtml += '<tr>';\n\n        for (var c = 0; c < _this.getModuleCount(); c += 1) {\n          qrHtml += '<td style=\"';\n          qrHtml += ' border-width: 0px; border-style: none;';\n          qrHtml += ' border-collapse: collapse;';\n          qrHtml += ' padding: 0px; margin: 0px;';\n          qrHtml += ' width: ' + cellSize + 'px;';\n          qrHtml += ' height: ' + cellSize + 'px;';\n          qrHtml += ' background-color: ';\n          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';\n          qrHtml += ';';\n          qrHtml += '\"/>';\n        }\n\n        qrHtml += '</tr>';\n      }\n\n      qrHtml += '</tbody>';\n      qrHtml += '</table>';\n\n      return qrHtml;\n    };\n\n    _this.createSvgTag = function(cellSize, margin, alt, title) {\n\n      var opts = {};\n      if (typeof arguments[0] == 'object') {\n        // Called by options.\n        opts = arguments[0];\n        // overwrite cellSize and margin.\n        cellSize = opts.cellSize;\n        margin = opts.margin;\n        alt = opts.alt;\n        title = opts.title;\n      }\n\n      cellSize = cellSize || 2;\n      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;\n\n      // Compose alt property surrogate\n      alt = (typeof alt === 'string') ? {text: alt} : alt || {};\n      alt.text = alt.text || null;\n      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;\n\n      // Compose title property surrogate\n      title = (typeof title === 'string') ? {text: title} : title || {};\n      title.text = title.text || null;\n      title.id = (title.text) ? title.id || 'qrcode-title' : null;\n\n      var size = _this.getModuleCount() * cellSize + margin * 2;\n      var c, mc, r, mr, qrSvg='', rect;\n\n      rect = 'l' + cellSize + ',0 0,' + cellSize +\n        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';\n\n      qrSvg += '<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\"';\n      qrSvg += !opts.scalable ? ' width=\"' + size + 'px\" height=\"' + size + 'px\"' : '';\n      qrSvg += ' viewBox=\"0 0 ' + size + ' ' + size + '\" ';\n      qrSvg += ' preserveAspectRatio=\"xMinYMin meet\"';\n      qrSvg += (title.text || alt.text) ? ' role=\"img\" aria-labelledby=\"' +\n          escapeXml([title.id, alt.id].join(' ').trim() ) + '\"' : '';\n      qrSvg += '>';\n      qrSvg += (title.text) ? '<title id=\"' + escapeXml(title.id) + '\">' +\n          escapeXml(title.text) + '</title>' : '';\n      qrSvg += (alt.text) ? '<description id=\"' + escapeXml(alt.id) + '\">' +\n          escapeXml(alt.text) + '</description>' : '';\n      qrSvg += '<rect width=\"100%\" height=\"100%\" fill=\"white\" cx=\"0\" cy=\"0\"/>';\n      qrSvg += '<path d=\"';\n\n      for (r = 0; r < _this.getModuleCount(); r += 1) {\n        mr = r * cellSize + margin;\n        for (c = 0; c < _this.getModuleCount(); c += 1) {\n          if (_this.isDark(r, c) ) {\n            mc = c*cellSize+margin;\n            qrSvg += 'M' + mc + ',' + mr + rect;\n          }\n        }\n      }\n\n      qrSvg += '\" stroke=\"transparent\" fill=\"black\"/>';\n      qrSvg += '</svg>';\n\n      return qrSvg;\n    };\n\n    _this.createDataURL = function(cellSize, margin) {\n\n      cellSize = cellSize || 2;\n      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;\n\n      var size = _this.getModuleCount() * cellSize + margin * 2;\n      var min = margin;\n      var max = size - margin;\n\n      return createDataURL(size, size, function(x, y) {\n        if (min <= x && x < max && min <= y && y < max) {\n          var c = Math.floor( (x - min) / cellSize);\n          var r = Math.floor( (y - min) / cellSize);\n          return _this.isDark(r, c)? 0 : 1;\n        } else {\n          return 1;\n        }\n      } );\n    };\n\n    _this.createImgTag = function(cellSize, margin, alt) {\n\n      cellSize = cellSize || 2;\n      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;\n\n      var size = _this.getModuleCount() * cellSize + margin * 2;\n\n      var img = '';\n      img += '<img';\n      img += '\\u0020src=\"';\n      img += _this.createDataURL(cellSize, margin);\n      img += '\"';\n      img += '\\u0020width=\"';\n      img += size;\n      img += '\"';\n      img += '\\u0020height=\"';\n      img += size;\n      img += '\"';\n      if (alt) {\n        img += '\\u0020alt=\"';\n        img += escapeXml(alt);\n        img += '\"';\n      }\n      img += '/>';\n\n      return img;\n    };\n\n    var escapeXml = function(s) {\n      var escaped = '';\n      for (var i = 0; i < s.length; i += 1) {\n        var c = s.charAt(i);\n        switch(c) {\n        case '<': escaped += '&lt;'; break;\n        case '>': escaped += '&gt;'; break;\n        case '&': escaped += '&amp;'; break;\n        case '\"': escaped += '&quot;'; break;\n        default : escaped += c; break;\n        }\n      }\n      return escaped;\n    };\n\n    var _createHalfASCII = function(margin) {\n      var cellSize = 1;\n      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;\n\n      var size = _this.getModuleCount() * cellSize + margin * 2;\n      var min = margin;\n      var max = size - margin;\n\n      var y, x, r1, r2, p;\n\n      var blocks = {\n        '██': '█',\n        '█ ': '▀',\n        ' █': '▄',\n        '  ': ' '\n      };\n\n      var blocksLastLineNoMargin = {\n        '██': '▀',\n        '█ ': '▀',\n        ' █': ' ',\n        '  ': ' '\n      };\n\n      var ascii = '';\n      for (y = 0; y < size; y += 2) {\n        r1 = Math.floor((y - min) / cellSize);\n        r2 = Math.floor((y + 1 - min) / cellSize);\n        for (x = 0; x < size; x += 1) {\n          p = '█';\n\n          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {\n            p = ' ';\n          }\n\n          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {\n            p += ' ';\n          }\n          else {\n            p += '█';\n          }\n\n          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.\n          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];\n        }\n\n        ascii += '\\n';\n      }\n\n      if (size % 2 && margin > 0) {\n        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');\n      }\n\n      return ascii.substring(0, ascii.length-1);\n    };\n\n    _this.createASCII = function(cellSize, margin) {\n      cellSize = cellSize || 1;\n\n      if (cellSize < 2) {\n        return _createHalfASCII(margin);\n      }\n\n      cellSize -= 1;\n      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;\n\n      var size = _this.getModuleCount() * cellSize + margin * 2;\n      var min = margin;\n      var max = size - margin;\n\n      var y, x, r, p;\n\n      var white = Array(cellSize+1).join('██');\n      var black = Array(cellSize+1).join('  ');\n\n      var ascii = '';\n      var line = '';\n      for (y = 0; y < size; y += 1) {\n        r = Math.floor( (y - min) / cellSize);\n        line = '';\n        for (x = 0; x < size; x += 1) {\n          p = 1;\n\n          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {\n            p = 0;\n          }\n\n          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.\n          line += p ? white : black;\n        }\n\n        for (r = 0; r < cellSize; r += 1) {\n          ascii += line + '\\n';\n        }\n      }\n\n      return ascii.substring(0, ascii.length-1);\n    };\n\n    _this.renderTo2dContext = function(context, cellSize) {\n      cellSize = cellSize || 2;\n      var length = _this.getModuleCount();\n      for (var row = 0; row < length; row++) {\n        for (var col = 0; col < length; col++) {\n          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';\n          context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);\n        }\n      }\n    }\n\n    return _this;\n  };\n\n  //---------------------------------------------------------------------\n  // qrcode.stringToBytes\n  //---------------------------------------------------------------------\n\n  qrcode.stringToBytesFuncs = {\n    'default' : function(s) {\n      var bytes = [];\n      for (var i = 0; i < s.length; i += 1) {\n        var c = s.charCodeAt(i);\n        bytes.push(c & 0xff);\n      }\n      return bytes;\n    }\n  };\n\n  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];\n\n  //---------------------------------------------------------------------\n  // qrcode.createStringToBytes\n  //---------------------------------------------------------------------\n\n  /**\n   * @param unicodeData base64 string of byte array.\n   * [16bit Unicode],[16bit Bytes], ...\n   * @param numChars\n   */\n  qrcode.createStringToBytes = function(unicodeData, numChars) {\n\n    // create conversion map.\n\n    var unicodeMap = function() {\n\n      var bin = base64DecodeInputStream(unicodeData);\n      var read = function() {\n        var b = bin.read();\n        if (b == -1) throw 'eof';\n        return b;\n      };\n\n      var count = 0;\n      var unicodeMap = {};\n      while (true) {\n        var b0 = bin.read();\n        if (b0 == -1) break;\n        var b1 = read();\n        var b2 = read();\n        var b3 = read();\n        var k = String.fromCharCode( (b0 << 8) | b1);\n        var v = (b2 << 8) | b3;\n        unicodeMap[k] = v;\n        count += 1;\n      }\n      if (count != numChars) {\n        throw count + ' != ' + numChars;\n      }\n\n      return unicodeMap;\n    }();\n\n    var unknownChar = '?'.charCodeAt(0);\n\n    return function(s) {\n      var bytes = [];\n      for (var i = 0; i < s.length; i += 1) {\n        var c = s.charCodeAt(i);\n        if (c < 128) {\n          bytes.push(c);\n        } else {\n          var b = unicodeMap[s.charAt(i)];\n          if (typeof b == 'number') {\n            if ( (b & 0xff) == b) {\n              // 1byte\n              bytes.push(b);\n            } else {\n              // 2bytes\n              bytes.push(b >>> 8);\n              bytes.push(b & 0xff);\n            }\n          } else {\n            bytes.push(unknownChar);\n          }\n        }\n      }\n      return bytes;\n    };\n  };\n\n  //---------------------------------------------------------------------\n  // QRMode\n  //---------------------------------------------------------------------\n\n  var QRMode = {\n    MODE_NUMBER :    1 << 0,\n    MODE_ALPHA_NUM : 1 << 1,\n    MODE_8BIT_BYTE : 1 << 2,\n    MODE_KANJI :     1 << 3\n  };\n\n  //---------------------------------------------------------------------\n  // QRErrorCorrectionLevel\n  //---------------------------------------------------------------------\n\n  var QRErrorCorrectionLevel = {\n    L : 1,\n    M : 0,\n    Q : 3,\n    H : 2\n  };\n\n  //---------------------------------------------------------------------\n  // QRMaskPattern\n  //---------------------------------------------------------------------\n\n  var QRMaskPattern = {\n    PATTERN000 : 0,\n    PATTERN001 : 1,\n    PATTERN010 : 2,\n    PATTERN011 : 3,\n    PATTERN100 : 4,\n    PATTERN101 : 5,\n    PATTERN110 : 6,\n    PATTERN111 : 7\n  };\n\n  //---------------------------------------------------------------------\n  // QRUtil\n  //---------------------------------------------------------------------\n\n  var QRUtil = function() {\n\n    var PATTERN_POSITION_TABLE = [\n      [],\n      [6, 18],\n      [6, 22],\n      [6, 26],\n      [6, 30],\n      [6, 34],\n      [6, 22, 38],\n      [6, 24, 42],\n      [6, 26, 46],\n      [6, 28, 50],\n      [6, 30, 54],\n      [6, 32, 58],\n      [6, 34, 62],\n      [6, 26, 46, 66],\n      [6, 26, 48, 70],\n      [6, 26, 50, 74],\n      [6, 30, 54, 78],\n      [6, 30, 56, 82],\n      [6, 30, 58, 86],\n      [6, 34, 62, 90],\n      [6, 28, 50, 72, 94],\n      [6, 26, 50, 74, 98],\n      [6, 30, 54, 78, 102],\n      [6, 28, 54, 80, 106],\n      [6, 32, 58, 84, 110],\n      [6, 30, 58, 86, 114],\n      [6, 34, 62, 90, 118],\n      [6, 26, 50, 74, 98, 122],\n      [6, 30, 54, 78, 102, 126],\n      [6, 26, 52, 78, 104, 130],\n      [6, 30, 56, 82, 108, 134],\n      [6, 34, 60, 86, 112, 138],\n      [6, 30, 58, 86, 114, 142],\n      [6, 34, 62, 90, 118, 146],\n      [6, 30, 54, 78, 102, 126, 150],\n      [6, 24, 50, 76, 102, 128, 154],\n      [6, 28, 54, 80, 106, 132, 158],\n      [6, 32, 58, 84, 110, 136, 162],\n      [6, 26, 54, 82, 110, 138, 166],\n      [6, 30, 58, 86, 114, 142, 170]\n    ];\n    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);\n    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);\n    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);\n\n    var _this = {};\n\n    var getBCHDigit = function(data) {\n      var digit = 0;\n      while (data != 0) {\n        digit += 1;\n        data >>>= 1;\n      }\n      return digit;\n    };\n\n    _this.getBCHTypeInfo = function(data) {\n      var d = data << 10;\n      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {\n        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );\n      }\n      return ( (data << 10) | d) ^ G15_MASK;\n    };\n\n    _this.getBCHTypeNumber = function(data) {\n      var d = data << 12;\n      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {\n        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );\n      }\n      return (data << 12) | d;\n    };\n\n    _this.getPatternPosition = function(typeNumber) {\n      return PATTERN_POSITION_TABLE[typeNumber - 1];\n    };\n\n    _this.getMaskFunction = function(maskPattern) {\n\n      switch (maskPattern) {\n\n      case QRMaskPattern.PATTERN000 :\n        return function(i, j) { return (i + j) % 2 == 0; };\n      case QRMaskPattern.PATTERN001 :\n        return function(i, j) { return i % 2 == 0; };\n      case QRMaskPattern.PATTERN010 :\n        return function(i, j) { return j % 3 == 0; };\n      case QRMaskPattern.PATTERN011 :\n        return function(i, j) { return (i + j) % 3 == 0; };\n      case QRMaskPattern.PATTERN100 :\n        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };\n      case QRMaskPattern.PATTERN101 :\n        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };\n      case QRMaskPattern.PATTERN110 :\n        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };\n      case QRMaskPattern.PATTERN111 :\n        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };\n\n      default :\n        throw 'bad maskPattern:' + maskPattern;\n      }\n    };\n\n    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {\n      var a = qrPolynomial([1], 0);\n      for (var i = 0; i < errorCorrectLength; i += 1) {\n        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );\n      }\n      return a;\n    };\n\n    _this.getLengthInBits = function(mode, type) {\n\n      if (1 <= type && type < 10) {\n\n        // 1 - 9\n\n        switch(mode) {\n        case QRMode.MODE_NUMBER    : return 10;\n        case QRMode.MODE_ALPHA_NUM : return 9;\n        case QRMode.MODE_8BIT_BYTE : return 8;\n        case QRMode.MODE_KANJI     : return 8;\n        default :\n          throw 'mode:' + mode;\n        }\n\n      } else if (type < 27) {\n\n        // 10 - 26\n\n        switch(mode) {\n        case QRMode.MODE_NUMBER    : return 12;\n        case QRMode.MODE_ALPHA_NUM : return 11;\n        case QRMode.MODE_8BIT_BYTE : return 16;\n        case QRMode.MODE_KANJI     : return 10;\n        default :\n          throw 'mode:' + mode;\n        }\n\n      } else if (type < 41) {\n\n        // 27 - 40\n\n        switch(mode) {\n        case QRMode.MODE_NUMBER    : return 14;\n        case QRMode.MODE_ALPHA_NUM : return 13;\n        case QRMode.MODE_8BIT_BYTE : return 16;\n        case QRMode.MODE_KANJI     : return 12;\n        default :\n          throw 'mode:' + mode;\n        }\n\n      } else {\n        throw 'type:' + type;\n      }\n    };\n\n    _this.getLostPoint = function(qrcode) {\n\n      var moduleCount = qrcode.getModuleCount();\n\n      var lostPoint = 0;\n\n      // LEVEL1\n\n      for (var row = 0; row < moduleCount; row += 1) {\n        for (var col = 0; col < moduleCount; col += 1) {\n\n          var sameCount = 0;\n          var dark = qrcode.isDark(row, col);\n\n          for (var r = -1; r <= 1; r += 1) {\n\n            if (row + r < 0 || moduleCount <= row + r) {\n              continue;\n            }\n\n            for (var c = -1; c <= 1; c += 1) {\n\n              if (col + c < 0 || moduleCount <= col + c) {\n                continue;\n              }\n\n              if (r == 0 && c == 0) {\n                continue;\n              }\n\n              if (dark == qrcode.isDark(row + r, col + c) ) {\n                sameCount += 1;\n              }\n            }\n          }\n\n          if (sameCount > 5) {\n            lostPoint += (3 + sameCount - 5);\n          }\n        }\n      };\n\n      // LEVEL2\n\n      for (var row = 0; row < moduleCount - 1; row += 1) {\n        for (var col = 0; col < moduleCount - 1; col += 1) {\n          var count = 0;\n          if (qrcode.isDark(row, col) ) count += 1;\n          if (qrcode.isDark(row + 1, col) ) count += 1;\n          if (qrcode.isDark(row, col + 1) ) count += 1;\n          if (qrcode.isDark(row + 1, col + 1) ) count += 1;\n          if (count == 0 || count == 4) {\n            lostPoint += 3;\n          }\n        }\n      }\n\n      // LEVEL3\n\n      for (var row = 0; row < moduleCount; row += 1) {\n        for (var col = 0; col < moduleCount - 6; col += 1) {\n          if (qrcode.isDark(row, col)\n              && !qrcode.isDark(row, col + 1)\n              &&  qrcode.isDark(row, col + 2)\n              &&  qrcode.isDark(row, col + 3)\n              &&  qrcode.isDark(row, col + 4)\n              && !qrcode.isDark(row, col + 5)\n              &&  qrcode.isDark(row, col + 6) ) {\n            lostPoint += 40;\n          }\n        }\n      }\n\n      for (var col = 0; col < moduleCount; col += 1) {\n        for (var row = 0; row < moduleCount - 6; row += 1) {\n          if (qrcode.isDark(row, col)\n              && !qrcode.isDark(row + 1, col)\n              &&  qrcode.isDark(row + 2, col)\n              &&  qrcode.isDark(row + 3, col)\n              &&  qrcode.isDark(row + 4, col)\n              && !qrcode.isDark(row + 5, col)\n              &&  qrcode.isDark(row + 6, col) ) {\n            lostPoint += 40;\n          }\n        }\n      }\n\n      // LEVEL4\n\n      var darkCount = 0;\n\n      for (var col = 0; col < moduleCount; col += 1) {\n        for (var row = 0; row < moduleCount; row += 1) {\n          if (qrcode.isDark(row, col) ) {\n            darkCount += 1;\n          }\n        }\n      }\n\n      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;\n      lostPoint += ratio * 10;\n\n      return lostPoint;\n    };\n\n    return _this;\n  }();\n\n  //---------------------------------------------------------------------\n  // QRMath\n  //---------------------------------------------------------------------\n\n  var QRMath = function() {\n\n    var EXP_TABLE = new Array(256);\n    var LOG_TABLE = new Array(256);\n\n    // initialize tables\n    for (var i = 0; i < 8; i += 1) {\n      EXP_TABLE[i] = 1 << i;\n    }\n    for (var i = 8; i < 256; i += 1) {\n      EXP_TABLE[i] = EXP_TABLE[i - 4]\n        ^ EXP_TABLE[i - 5]\n        ^ EXP_TABLE[i - 6]\n        ^ EXP_TABLE[i - 8];\n    }\n    for (var i = 0; i < 255; i += 1) {\n      LOG_TABLE[EXP_TABLE[i] ] = i;\n    }\n\n    var _this = {};\n\n    _this.glog = function(n) {\n\n      if (n < 1) {\n        throw 'glog(' + n + ')';\n      }\n\n      return LOG_TABLE[n];\n    };\n\n    _this.gexp = function(n) {\n\n      while (n < 0) {\n        n += 255;\n      }\n\n      while (n >= 256) {\n        n -= 255;\n      }\n\n      return EXP_TABLE[n];\n    };\n\n    return _this;\n  }();\n\n  //---------------------------------------------------------------------\n  // qrPolynomial\n  //---------------------------------------------------------------------\n\n  function qrPolynomial(num, shift) {\n\n    if (typeof num.length == 'undefined') {\n      throw num.length + '/' + shift;\n    }\n\n    var _num = function() {\n      var offset = 0;\n      while (offset < num.length && num[offset] == 0) {\n        offset += 1;\n      }\n      var _num = new Array(num.length - offset + shift);\n      for (var i = 0; i < num.length - offset; i += 1) {\n        _num[i] = num[i + offset];\n      }\n      return _num;\n    }();\n\n    var _this = {};\n\n    _this.getAt = function(index) {\n      return _num[index];\n    };\n\n    _this.getLength = function() {\n      return _num.length;\n    };\n\n    _this.multiply = function(e) {\n\n      var num = new Array(_this.getLength() + e.getLength() - 1);\n\n      for (var i = 0; i < _this.getLength(); i += 1) {\n        for (var j = 0; j < e.getLength(); j += 1) {\n          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );\n        }\n      }\n\n      return qrPolynomial(num, 0);\n    };\n\n    _this.mod = function(e) {\n\n      if (_this.getLength() - e.getLength() < 0) {\n        return _this;\n      }\n\n      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );\n\n      var num = new Array(_this.getLength() );\n      for (var i = 0; i < _this.getLength(); i += 1) {\n        num[i] = _this.getAt(i);\n      }\n\n      for (var i = 0; i < e.getLength(); i += 1) {\n        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);\n      }\n\n      // recursive call\n      return qrPolynomial(num, 0).mod(e);\n    };\n\n    return _this;\n  };\n\n  //---------------------------------------------------------------------\n  // QRRSBlock\n  //---------------------------------------------------------------------\n\n  var QRRSBlock = function() {\n\n    var RS_BLOCK_TABLE = [\n\n      // L\n      // M\n      // Q\n      // H\n\n      // 1\n      [1, 26, 19],\n      [1, 26, 16],\n      [1, 26, 13],\n      [1, 26, 9],\n\n      // 2\n      [1, 44, 34],\n      [1, 44, 28],\n      [1, 44, 22],\n      [1, 44, 16],\n\n      // 3\n      [1, 70, 55],\n      [1, 70, 44],\n      [2, 35, 17],\n      [2, 35, 13],\n\n      // 4\n      [1, 100, 80],\n      [2, 50, 32],\n      [2, 50, 24],\n      [4, 25, 9],\n\n      // 5\n      [1, 134, 108],\n      [2, 67, 43],\n      [2, 33, 15, 2, 34, 16],\n      [2, 33, 11, 2, 34, 12],\n\n      // 6\n      [2, 86, 68],\n      [4, 43, 27],\n      [4, 43, 19],\n      [4, 43, 15],\n\n      // 7\n      [2, 98, 78],\n      [4, 49, 31],\n      [2, 32, 14, 4, 33, 15],\n      [4, 39, 13, 1, 40, 14],\n\n      // 8\n      [2, 121, 97],\n      [2, 60, 38, 2, 61, 39],\n      [4, 40, 18, 2, 41, 19],\n      [4, 40, 14, 2, 41, 15],\n\n      // 9\n      [2, 146, 116],\n      [3, 58, 36, 2, 59, 37],\n      [4, 36, 16, 4, 37, 17],\n      [4, 36, 12, 4, 37, 13],\n\n      // 10\n      [2, 86, 68, 2, 87, 69],\n      [4, 69, 43, 1, 70, 44],\n      [6, 43, 19, 2, 44, 20],\n      [6, 43, 15, 2, 44, 16],\n\n      // 11\n      [4, 101, 81],\n      [1, 80, 50, 4, 81, 51],\n      [4, 50, 22, 4, 51, 23],\n      [3, 36, 12, 8, 37, 13],\n\n      // 12\n      [2, 116, 92, 2, 117, 93],\n      [6, 58, 36, 2, 59, 37],\n      [4, 46, 20, 6, 47, 21],\n      [7, 42, 14, 4, 43, 15],\n\n      // 13\n      [4, 133, 107],\n      [8, 59, 37, 1, 60, 38],\n      [8, 44, 20, 4, 45, 21],\n      [12, 33, 11, 4, 34, 12],\n\n      // 14\n      [3, 145, 115, 1, 146, 116],\n      [4, 64, 40, 5, 65, 41],\n      [11, 36, 16, 5, 37, 17],\n      [11, 36, 12, 5, 37, 13],\n\n      // 15\n      [5, 109, 87, 1, 110, 88],\n      [5, 65, 41, 5, 66, 42],\n      [5, 54, 24, 7, 55, 25],\n      [11, 36, 12, 7, 37, 13],\n\n      // 16\n      [5, 122, 98, 1, 123, 99],\n      [7, 73, 45, 3, 74, 46],\n      [15, 43, 19, 2, 44, 20],\n      [3, 45, 15, 13, 46, 16],\n\n      // 17\n      [1, 135, 107, 5, 136, 108],\n      [10, 74, 46, 1, 75, 47],\n      [1, 50, 22, 15, 51, 23],\n      [2, 42, 14, 17, 43, 15],\n\n      // 18\n      [5, 150, 120, 1, 151, 121],\n      [9, 69, 43, 4, 70, 44],\n      [17, 50, 22, 1, 51, 23],\n      [2, 42, 14, 19, 43, 15],\n\n      // 19\n      [3, 141, 113, 4, 142, 114],\n      [3, 70, 44, 11, 71, 45],\n      [17, 47, 21, 4, 48, 22],\n      [9, 39, 13, 16, 40, 14],\n\n      // 20\n      [3, 135, 107, 5, 136, 108],\n      [3, 67, 41, 13, 68, 42],\n      [15, 54, 24, 5, 55, 25],\n      [15, 43, 15, 10, 44, 16],\n\n      // 21\n      [4, 144, 116, 4, 145, 117],\n      [17, 68, 42],\n      [17, 50, 22, 6, 51, 23],\n      [19, 46, 16, 6, 47, 17],\n\n      // 22\n      [2, 139, 111, 7, 140, 112],\n      [17, 74, 46],\n      [7, 54, 24, 16, 55, 25],\n      [34, 37, 13],\n\n      // 23\n      [4, 151, 121, 5, 152, 122],\n      [4, 75, 47, 14, 76, 48],\n      [11, 54, 24, 14, 55, 25],\n      [16, 45, 15, 14, 46, 16],\n\n      // 24\n      [6, 147, 117, 4, 148, 118],\n      [6, 73, 45, 14, 74, 46],\n      [11, 54, 24, 16, 55, 25],\n      [30, 46, 16, 2, 47, 17],\n\n      // 25\n      [8, 132, 106, 4, 133, 107],\n      [8, 75, 47, 13, 76, 48],\n      [7, 54, 24, 22, 55, 25],\n      [22, 45, 15, 13, 46, 16],\n\n      // 26\n      [10, 142, 114, 2, 143, 115],\n      [19, 74, 46, 4, 75, 47],\n      [28, 50, 22, 6, 51, 23],\n      [33, 46, 16, 4, 47, 17],\n\n      // 27\n      [8, 152, 122, 4, 153, 123],\n      [22, 73, 45, 3, 74, 46],\n      [8, 53, 23, 26, 54, 24],\n      [12, 45, 15, 28, 46, 16],\n\n      // 28\n      [3, 147, 117, 10, 148, 118],\n      [3, 73, 45, 23, 74, 46],\n      [4, 54, 24, 31, 55, 25],\n      [11, 45, 15, 31, 46, 16],\n\n      // 29\n      [7, 146, 116, 7, 147, 117],\n      [21, 73, 45, 7, 74, 46],\n      [1, 53, 23, 37, 54, 24],\n      [19, 45, 15, 26, 46, 16],\n\n      // 30\n      [5, 145, 115, 10, 146, 116],\n      [19, 75, 47, 10, 76, 48],\n      [15, 54, 24, 25, 55, 25],\n      [23, 45, 15, 25, 46, 16],\n\n      // 31\n      [13, 145, 115, 3, 146, 116],\n      [2, 74, 46, 29, 75, 47],\n      [42, 54, 24, 1, 55, 25],\n      [23, 45, 15, 28, 46, 16],\n\n      // 32\n      [17, 145, 115],\n      [10, 74, 46, 23, 75, 47],\n      [10, 54, 24, 35, 55, 25],\n      [19, 45, 15, 35, 46, 16],\n\n      // 33\n      [17, 145, 115, 1, 146, 116],\n      [14, 74, 46, 21, 75, 47],\n      [29, 54, 24, 19, 55, 25],\n      [11, 45, 15, 46, 46, 16],\n\n      // 34\n      [13, 145, 115, 6, 146, 116],\n      [14, 74, 46, 23, 75, 47],\n      [44, 54, 24, 7, 55, 25],\n      [59, 46, 16, 1, 47, 17],\n\n      // 35\n      [12, 151, 121, 7, 152, 122],\n      [12, 75, 47, 26, 76, 48],\n      [39, 54, 24, 14, 55, 25],\n      [22, 45, 15, 41, 46, 16],\n\n      // 36\n      [6, 151, 121, 14, 152, 122],\n      [6, 75, 47, 34, 76, 48],\n      [46, 54, 24, 10, 55, 25],\n      [2, 45, 15, 64, 46, 16],\n\n      // 37\n      [17, 152, 122, 4, 153, 123],\n      [29, 74, 46, 14, 75, 47],\n      [49, 54, 24, 10, 55, 25],\n      [24, 45, 15, 46, 46, 16],\n\n      // 38\n      [4, 152, 122, 18, 153, 123],\n      [13, 74, 46, 32, 75, 47],\n      [48, 54, 24, 14, 55, 25],\n      [42, 45, 15, 32, 46, 16],\n\n      // 39\n      [20, 147, 117, 4, 148, 118],\n      [40, 75, 47, 7, 76, 48],\n      [43, 54, 24, 22, 55, 25],\n      [10, 45, 15, 67, 46, 16],\n\n      // 40\n      [19, 148, 118, 6, 149, 119],\n      [18, 75, 47, 31, 76, 48],\n      [34, 54, 24, 34, 55, 25],\n      [20, 45, 15, 61, 46, 16]\n    ];\n\n    var qrRSBlock = function(totalCount, dataCount) {\n      var _this = {};\n      _this.totalCount = totalCount;\n      _this.dataCount = dataCount;\n      return _this;\n    };\n\n    var _this = {};\n\n    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {\n\n      switch(errorCorrectionLevel) {\n      case QRErrorCorrectionLevel.L :\n        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];\n      case QRErrorCorrectionLevel.M :\n        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];\n      case QRErrorCorrectionLevel.Q :\n        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];\n      case QRErrorCorrectionLevel.H :\n        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];\n      default :\n        return undefined;\n      }\n    };\n\n    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {\n\n      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);\n\n      if (typeof rsBlock == 'undefined') {\n        throw 'bad rs block @ typeNumber:' + typeNumber +\n            '/errorCorrectionLevel:' + errorCorrectionLevel;\n      }\n\n      var length = rsBlock.length / 3;\n\n      var list = [];\n\n      for (var i = 0; i < length; i += 1) {\n\n        var count = rsBlock[i * 3 + 0];\n        var totalCount = rsBlock[i * 3 + 1];\n        var dataCount = rsBlock[i * 3 + 2];\n\n        for (var j = 0; j < count; j += 1) {\n          list.push(qrRSBlock(totalCount, dataCount) );\n        }\n      }\n\n      return list;\n    };\n\n    return _this;\n  }();\n\n  //---------------------------------------------------------------------\n  // qrBitBuffer\n  //---------------------------------------------------------------------\n\n  var qrBitBuffer = function() {\n\n    var _buffer = [];\n    var _length = 0;\n\n    var _this = {};\n\n    _this.getBuffer = function() {\n      return _buffer;\n    };\n\n    _this.getAt = function(index) {\n      var bufIndex = Math.floor(index / 8);\n      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;\n    };\n\n    _this.put = function(num, length) {\n      for (var i = 0; i < length; i += 1) {\n        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);\n      }\n    };\n\n    _this.getLengthInBits = function() {\n      return _length;\n    };\n\n    _this.putBit = function(bit) {\n\n      var bufIndex = Math.floor(_length / 8);\n      if (_buffer.length <= bufIndex) {\n        _buffer.push(0);\n      }\n\n      if (bit) {\n        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );\n      }\n\n      _length += 1;\n    };\n\n    return _this;\n  };\n\n  //---------------------------------------------------------------------\n  // qrNumber\n  //---------------------------------------------------------------------\n\n  var qrNumber = function(data) {\n\n    var _mode = QRMode.MODE_NUMBER;\n    var _data = data;\n\n    var _this = {};\n\n    _this.getMode = function() {\n      return _mode;\n    };\n\n    _this.getLength = function(buffer) {\n      return _data.length;\n    };\n\n    _this.write = function(buffer) {\n\n      var data = _data;\n\n      var i = 0;\n\n      while (i + 2 < data.length) {\n        buffer.put(strToNum(data.substring(i, i + 3) ), 10);\n        i += 3;\n      }\n\n      if (i < data.length) {\n        if (data.length - i == 1) {\n          buffer.put(strToNum(data.substring(i, i + 1) ), 4);\n        } else if (data.length - i == 2) {\n          buffer.put(strToNum(data.substring(i, i + 2) ), 7);\n        }\n      }\n    };\n\n    var strToNum = function(s) {\n      var num = 0;\n      for (var i = 0; i < s.length; i += 1) {\n        num = num * 10 + chatToNum(s.charAt(i) );\n      }\n      return num;\n    };\n\n    var chatToNum = function(c) {\n      if ('0' <= c && c <= '9') {\n        return c.charCodeAt(0) - '0'.charCodeAt(0);\n      }\n      throw 'illegal char :' + c;\n    };\n\n    return _this;\n  };\n\n  //---------------------------------------------------------------------\n  // qrAlphaNum\n  //---------------------------------------------------------------------\n\n  var qrAlphaNum = function(data) {\n\n    var _mode = QRMode.MODE_ALPHA_NUM;\n    var _data = data;\n\n    var _this = {};\n\n    _this.getMode = function() {\n      return _mode;\n    };\n\n    _this.getLength = function(buffer) {\n      return _data.length;\n    };\n\n    _this.write = function(buffer) {\n\n      var s = _data;\n\n      var i = 0;\n\n      while (i + 1 < s.length) {\n        buffer.put(\n          getCode(s.charAt(i) ) * 45 +\n          getCode(s.charAt(i + 1) ), 11);\n        i += 2;\n      }\n\n      if (i < s.length) {\n        buffer.put(getCode(s.charAt(i) ), 6);\n      }\n    };\n\n    var getCode = function(c) {\n\n      if ('0' <= c && c <= '9') {\n        return c.charCodeAt(0) - '0'.charCodeAt(0);\n      } else if ('A' <= c && c <= 'Z') {\n        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;\n      } else {\n        switch (c) {\n        case ' ' : return 36;\n        case '$' : return 37;\n        case '%' : return 38;\n        case '*' : return 39;\n        case '+' : return 40;\n        case '-' : return 41;\n        case '.' : return 42;\n        case '/' : return 43;\n        case ':' : return 44;\n        default :\n          throw 'illegal char :' + c;\n        }\n      }\n    };\n\n    return _this;\n  };\n\n  //---------------------------------------------------------------------\n  // qr8BitByte\n  //---------------------------------------------------------------------\n\n  var qr8BitByte = function(data) {\n\n    var _mode = QRMode.MODE_8BIT_BYTE;\n    var _data = data;\n    var _bytes = qrcode.stringToBytes(data);\n\n    var _this = {};\n\n    _this.getMode = function() {\n      return _mode;\n    };\n\n    _this.getLength = function(buffer) {\n      return _bytes.length;\n    };\n\n    _this.write = function(buffer) {\n      for (var i = 0; i < _bytes.length; i += 1) {\n        buffer.put(_bytes[i], 8);\n      }\n    };\n\n    return _this;\n  };\n\n  //---------------------------------------------------------------------\n  // qrKanji\n  //---------------------------------------------------------------------\n\n  var qrKanji = function(data) {\n\n    var _mode = QRMode.MODE_KANJI;\n    var _data = data;\n\n    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];\n    if (!stringToBytes) {\n      throw 'sjis not supported.';\n    }\n    !function(c, code) {\n      // self test for sjis support.\n      var test = stringToBytes(c);\n      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {\n        throw 'sjis not supported.';\n      }\n    }('\\u53cb', 0x9746);\n\n    var _bytes = stringToBytes(data);\n\n    var _this = {};\n\n    _this.getMode = function() {\n      return _mode;\n    };\n\n    _this.getLength = function(buffer) {\n      return ~~(_bytes.length / 2);\n    };\n\n    _this.write = function(buffer) {\n\n      var data = _bytes;\n\n      var i = 0;\n\n      while (i + 1 < data.length) {\n\n        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);\n\n        if (0x8140 <= c && c <= 0x9FFC) {\n          c -= 0x8140;\n        } else if (0xE040 <= c && c <= 0xEBBF) {\n          c -= 0xC140;\n        } else {\n          throw 'illegal char at ' + (i + 1) + '/' + c;\n        }\n\n        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);\n\n        buffer.put(c, 13);\n\n        i += 2;\n      }\n\n      if (i < data.length) {\n        throw 'illegal char at ' + (i + 1);\n      }\n    };\n\n    return _this;\n  };\n\n  //=====================================================================\n  // GIF Support etc.\n  //\n\n  //---------------------------------------------------------------------\n  // byteArrayOutputStream\n  //---------------------------------------------------------------------\n\n  var byteArrayOutputStream = function() {\n\n    var _bytes = [];\n\n    var _this = {};\n\n    _this.writeByte = function(b) {\n      _bytes.push(b & 0xff);\n    };\n\n    _this.writeShort = function(i) {\n      _this.writeByte(i);\n      _this.writeByte(i >>> 8);\n    };\n\n    _this.writeBytes = function(b, off, len) {\n      off = off || 0;\n      len = len || b.length;\n      for (var i = 0; i < len; i += 1) {\n        _this.writeByte(b[i + off]);\n      }\n    };\n\n    _this.writeString = function(s) {\n      for (var i = 0; i < s.length; i += 1) {\n        _this.writeByte(s.charCodeAt(i) );\n      }\n    };\n\n    _this.toByteArray = function() {\n      return _bytes;\n    };\n\n    _this.toString = function() {\n      var s = '';\n      s += '[';\n      for (var i = 0; i < _bytes.length; i += 1) {\n        if (i > 0) {\n          s += ',';\n        }\n        s += _bytes[i];\n      }\n      s += ']';\n      return s;\n    };\n\n    return _this;\n  };\n\n  //---------------------------------------------------------------------\n  // base64EncodeOutputStream\n  //---------------------------------------------------------------------\n\n  var base64EncodeOutputStream = function() {\n\n    var _buffer = 0;\n    var _buflen = 0;\n    var _length = 0;\n    var _base64 = '';\n\n    var _this = {};\n\n    var writeEncoded = function(b) {\n      _base64 += String.fromCharCode(encode(b & 0x3f) );\n    };\n\n    var encode = function(n) {\n      if (n < 0) {\n        // error.\n      } else if (n < 26) {\n        return 0x41 + n;\n      } else if (n < 52) {\n        return 0x61 + (n - 26);\n      } else if (n < 62) {\n        return 0x30 + (n - 52);\n      } else if (n == 62) {\n        return 0x2b;\n      } else if (n == 63) {\n        return 0x2f;\n      }\n      throw 'n:' + n;\n    };\n\n    _this.writeByte = function(n) {\n\n      _buffer = (_buffer << 8) | (n & 0xff);\n      _buflen += 8;\n      _length += 1;\n\n      while (_buflen >= 6) {\n        writeEncoded(_buffer >>> (_buflen - 6) );\n        _buflen -= 6;\n      }\n    };\n\n    _this.flush = function() {\n\n      if (_buflen > 0) {\n        writeEncoded(_buffer << (6 - _buflen) );\n        _buffer = 0;\n        _buflen = 0;\n      }\n\n      if (_length % 3 != 0) {\n        // padding\n        var padlen = 3 - _length % 3;\n        for (var i = 0; i < padlen; i += 1) {\n          _base64 += '=';\n        }\n      }\n    };\n\n    _this.toString = function() {\n      return _base64;\n    };\n\n    return _this;\n  };\n\n  //---------------------------------------------------------------------\n  // base64DecodeInputStream\n  //---------------------------------------------------------------------\n\n  var base64DecodeInputStream = function(str) {\n\n    var _str = str;\n    var _pos = 0;\n    var _buffer = 0;\n    var _buflen = 0;\n\n    var _this = {};\n\n    _this.read = function() {\n\n      while (_buflen < 8) {\n\n        if (_pos >= _str.length) {\n          if (_buflen == 0) {\n            return -1;\n          }\n          throw 'unexpected end of file./' + _buflen;\n        }\n\n        var c = _str.charAt(_pos);\n        _pos += 1;\n\n        if (c == '=') {\n          _buflen = 0;\n          return -1;\n        } else if (c.match(/^\\s$/) ) {\n          // ignore if whitespace.\n          continue;\n        }\n\n        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );\n        _buflen += 6;\n      }\n\n      var n = (_buffer >>> (_buflen - 8) ) & 0xff;\n      _buflen -= 8;\n      return n;\n    };\n\n    var decode = function(c) {\n      if (0x41 <= c && c <= 0x5a) {\n        return c - 0x41;\n      } else if (0x61 <= c && c <= 0x7a) {\n        return c - 0x61 + 26;\n      } else if (0x30 <= c && c <= 0x39) {\n        return c - 0x30 + 52;\n      } else if (c == 0x2b) {\n        return 62;\n      } else if (c == 0x2f) {\n        return 63;\n      } else {\n        throw 'c:' + c;\n      }\n    };\n\n    return _this;\n  };\n\n  //---------------------------------------------------------------------\n  // gifImage (B/W)\n  //---------------------------------------------------------------------\n\n  var gifImage = function(width, height) {\n\n    var _width = width;\n    var _height = height;\n    var _data = new Array(width * height);\n\n    var _this = {};\n\n    _this.setPixel = function(x, y, pixel) {\n      _data[y * _width + x] = pixel;\n    };\n\n    _this.write = function(out) {\n\n      //---------------------------------\n      // GIF Signature\n\n      out.writeString('GIF87a');\n\n      //---------------------------------\n      // Screen Descriptor\n\n      out.writeShort(_width);\n      out.writeShort(_height);\n\n      out.writeByte(0x80); // 2bit\n      out.writeByte(0);\n      out.writeByte(0);\n\n      //---------------------------------\n      // Global Color Map\n\n      // black\n      out.writeByte(0x00);\n      out.writeByte(0x00);\n      out.writeByte(0x00);\n\n      // white\n      out.writeByte(0xff);\n      out.writeByte(0xff);\n      out.writeByte(0xff);\n\n      //---------------------------------\n      // Image Descriptor\n\n      out.writeString(',');\n      out.writeShort(0);\n      out.writeShort(0);\n      out.writeShort(_width);\n      out.writeShort(_height);\n      out.writeByte(0);\n\n      //---------------------------------\n      // Local Color Map\n\n      //---------------------------------\n      // Raster Data\n\n      var lzwMinCodeSize = 2;\n      var raster = getLZWRaster(lzwMinCodeSize);\n\n      out.writeByte(lzwMinCodeSize);\n\n      var offset = 0;\n\n      while (raster.length - offset > 255) {\n        out.writeByte(255);\n        out.writeBytes(raster, offset, 255);\n        offset += 255;\n      }\n\n      out.writeByte(raster.length - offset);\n      out.writeBytes(raster, offset, raster.length - offset);\n      out.writeByte(0x00);\n\n      //---------------------------------\n      // GIF Terminator\n      out.writeString(';');\n    };\n\n    var bitOutputStream = function(out) {\n\n      var _out = out;\n      var _bitLength = 0;\n      var _bitBuffer = 0;\n\n      var _this = {};\n\n      _this.write = function(data, length) {\n\n        if ( (data >>> length) != 0) {\n          throw 'length over';\n        }\n\n        while (_bitLength + length >= 8) {\n          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );\n          length -= (8 - _bitLength);\n          data >>>= (8 - _bitLength);\n          _bitBuffer = 0;\n          _bitLength = 0;\n        }\n\n        _bitBuffer = (data << _bitLength) | _bitBuffer;\n        _bitLength = _bitLength + length;\n      };\n\n      _this.flush = function() {\n        if (_bitLength > 0) {\n          _out.writeByte(_bitBuffer);\n        }\n      };\n\n      return _this;\n    };\n\n    var getLZWRaster = function(lzwMinCodeSize) {\n\n      var clearCode = 1 << lzwMinCodeSize;\n      var endCode = (1 << lzwMinCodeSize) + 1;\n      var bitLength = lzwMinCodeSize + 1;\n\n      // Setup LZWTable\n      var table = lzwTable();\n\n      for (var i = 0; i < clearCode; i += 1) {\n        table.add(String.fromCharCode(i) );\n      }\n      table.add(String.fromCharCode(clearCode) );\n      table.add(String.fromCharCode(endCode) );\n\n      var byteOut = byteArrayOutputStream();\n      var bitOut = bitOutputStream(byteOut);\n\n      // clear code\n      bitOut.write(clearCode, bitLength);\n\n      var dataIndex = 0;\n\n      var s = String.fromCharCode(_data[dataIndex]);\n      dataIndex += 1;\n\n      while (dataIndex < _data.length) {\n\n        var c = String.fromCharCode(_data[dataIndex]);\n        dataIndex += 1;\n\n        if (table.contains(s + c) ) {\n\n          s = s + c;\n\n        } else {\n\n          bitOut.write(table.indexOf(s), bitLength);\n\n          if (table.size() < 0xfff) {\n\n            if (table.size() == (1 << bitLength) ) {\n              bitLength += 1;\n            }\n\n            table.add(s + c);\n          }\n\n          s = c;\n        }\n      }\n\n      bitOut.write(table.indexOf(s), bitLength);\n\n      // end code\n      bitOut.write(endCode, bitLength);\n\n      bitOut.flush();\n\n      return byteOut.toByteArray();\n    };\n\n    var lzwTable = function() {\n\n      var _map = {};\n      var _size = 0;\n\n      var _this = {};\n\n      _this.add = function(key) {\n        if (_this.contains(key) ) {\n          throw 'dup key:' + key;\n        }\n        _map[key] = _size;\n        _size += 1;\n      };\n\n      _this.size = function() {\n        return _size;\n      };\n\n      _this.indexOf = function(key) {\n        return _map[key];\n      };\n\n      _this.contains = function(key) {\n        return typeof _map[key] != 'undefined';\n      };\n\n      return _this;\n    };\n\n    return _this;\n  };\n\n  var createDataURL = function(width, height, getPixel) {\n    var gif = gifImage(width, height);\n    for (var y = 0; y < height; y += 1) {\n      for (var x = 0; x < width; x += 1) {\n        gif.setPixel(x, y, getPixel(x, y) );\n      }\n    }\n\n    var b = byteArrayOutputStream();\n    gif.write(b);\n\n    var base64 = base64EncodeOutputStream();\n    var bytes = b.toByteArray();\n    for (var i = 0; i < bytes.length; i += 1) {\n      base64.writeByte(bytes[i]);\n    }\n    base64.flush();\n\n    return 'data:image/gif;base64,' + base64;\n  };\n\n  //---------------------------------------------------------------------\n  // returns qrcode function.\n\n  return qrcode;\n}();\n\n// multibyte support\n!function() {\n\n  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {\n    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array\n    function toUTF8Array(str) {\n      var utf8 = [];\n      for (var i=0; i < str.length; i++) {\n        var charcode = str.charCodeAt(i);\n        if (charcode < 0x80) utf8.push(charcode);\n        else if (charcode < 0x800) {\n          utf8.push(0xc0 | (charcode >> 6),\n              0x80 | (charcode & 0x3f));\n        }\n        else if (charcode < 0xd800 || charcode >= 0xe000) {\n          utf8.push(0xe0 | (charcode >> 12),\n              0x80 | ((charcode>>6) & 0x3f),\n              0x80 | (charcode & 0x3f));\n        }\n        // surrogate pair\n        else {\n          i++;\n          // UTF-16 encodes 0x10000-0x10FFFF by\n          // subtracting 0x10000 and splitting the\n          // 20 bits of 0x0-0xFFFFF into two halves\n          charcode = 0x10000 + (((charcode & 0x3ff)<<10)\n            | (str.charCodeAt(i) & 0x3ff));\n          utf8.push(0xf0 | (charcode >>18),\n              0x80 | ((charcode>>12) & 0x3f),\n              0x80 | ((charcode>>6) & 0x3f),\n              0x80 | (charcode & 0x3f));\n        }\n      }\n      return utf8;\n    }\n    return toUTF8Array(s);\n  };\n\n}();\n\n(function (factory) {\n  if (typeof define === 'function' && define.amd) {\n      define([], factory);\n  } else if (typeof exports === 'object') {\n      module.exports = factory();\n  }\n}(function () {\n    return qrcode;\n}));\n\n";
const QR_RUNTIME_SOURCE = "/* SPDX-License-Identifier: GPL-3.0-or-later */\n// Runs only in the isolated HTTPS-origin WebView. Keep private keys here, and\n// send a session to the native manager only after Discord's pending_login event.\nfunction startRemoteAuth(env) {\n    const { crypto, socketFactory, fetcher, emit, renderCode, clearCode, now = Date.now,\n        setTimer = setTimeout, clearTimer = clearTimeout, base64Encode = btoa, base64Decode = atob,\n        decodeText = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes) } = env;\n    const timers = new Set();\n    let stopped = false, socket, keyPair, phase = 'connecting', userId, ackPending = false;\n    let expiry, heartbeat, controller, chain = Promise.resolve();\n    const later = (fn, ms) => { const id = setTimer(() => { timers.delete(id); if (!stopped) fn(); }, ms); timers.add(id); return id; };\n    const removeTimer = id => { clearTimer(id); timers.delete(id); };\n    const send = value => { if (!stopped && socket?.readyState === 1) socket.send(JSON.stringify(value)); };\n    function cleanup() {\n        for (const id of timers) clearTimer(id); timers.clear();\n        controller?.abort(); controller = undefined;\n        try { socket?.close(1000); } catch {}\n        keyPair = undefined; clearCode();\n    }\n    function finish(type, detail = {}) {\n        if (stopped) return;\n        stopped = true; cleanup(); emit({ type, ...detail });\n    }\n    function error(code) { finish('error', { code }); }\n    function stop() { if (!stopped) { stopped = true; cleanup(); } }\n    function bytes64(bytes, urlSafe = false) {\n        const value = base64Encode(String.fromCharCode(...new Uint8Array(bytes)));\n        return urlSafe ? value.replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '') : value;\n    }\n    async function decrypt(value) {\n        if (typeof value !== 'string' || value.length > 4096 || !keyPair) throw new Error('invalid ciphertext');\n        const bytes = Uint8Array.from(base64Decode(value), c => c.charCodeAt(0));\n        return crypto.subtle.decrypt({ name: 'RSA-OAEP' }, keyPair.privateKey, bytes);\n    }\n    function beat(interval) {\n        heartbeat = later(() => {\n            if (ackPending) { error('connection'); return; }\n            ackPending = true; send({ op: 'heartbeat' }); beat(interval);\n        }, interval);\n    }\n    async function exchange(ticket) {\n        if (typeof ticket !== 'string' || !ticket || ticket.length > 4096 || !userId) throw new Error('invalid ticket');\n        phase = 'exchanging'; clearCode(); emit({ type: 'status', status: 'approved' });\n        removeTimer(expiry);\n        const deadline = later(() => error('timeout'), 20000);\n        controller = typeof AbortController === 'function' ? new AbortController() : undefined;\n        const response = await fetcher('https://discord.com/api/v9/users/@me/remote-auth/login', {\n            method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },\n            body: JSON.stringify({ ticket }), signal: controller?.signal\n        });\n        let data;\n        try { data = await response.json(); } catch { data = {}; }\n        if (stopped) return;\n        if (response.status === 429) { finish('error', { code: 'rate-limit', retryAfter: Math.max(1, Math.ceil(Number(data.retry_after) || 60)) }); return; }\n        if (data.captcha_key || data.captcha_sitekey) { error('verification'); return; }\n        if (!response.ok || !data.encrypted_token) { error('rejected'); return; }\n        const token = decodeText(await decrypt(data.encrypted_token));\n        if (stopped) return;\n        if (typeof token !== 'string' || token.length < 20 || token.length > 4096 || /\\s/.test(token)) throw new Error('invalid session');\n        removeTimer(deadline);\n        finish('complete', { token, userId });\n    }\n    async function handle(event) {\n        if (stopped || typeof event.data !== 'string' || event.data.length > 16384) return;\n        const data = JSON.parse(event.data);\n        if (data.op === 'heartbeat_ack') { ackPending = false; return; }\n        if (data.op === 'cancel') { error('cancelled'); return; }\n        if (data.op === 'hello') {\n            if (phase !== 'connecting') throw new Error('unexpected hello');\n            phase = 'key'; removeTimer(expiry);\n            const interval = Number(data.heartbeat_interval);\n            if (!Number.isFinite(interval) || interval < 1000 || interval > 120000) throw new Error('invalid interval');\n            const timeout = Math.min(180000, Math.max(1000, Number(data.timeout_ms) || 120000));\n            expiry = later(() => error('expired'), timeout); beat(interval);\n            keyPair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['encrypt', 'decrypt']);\n            if (stopped) { keyPair = undefined; return; }\n            const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);\n            if (stopped) return;\n            phase = 'nonce'; send({ op: 'init', encoded_public_key: bytes64(publicKey) });\n        } else if (data.op === 'nonce_proof') {\n            if (phase !== 'nonce') throw new Error('unexpected nonce');\n            const nonce = await decrypt(data.encrypted_nonce);\n            const proof = await crypto.subtle.digest('SHA-256', nonce);\n            if (stopped) return;\n            phase = 'fingerprint'; send({ op: 'nonce_proof', proof: bytes64(proof, true) });\n        } else if (data.op === 'pending_remote_init') {\n            if (phase !== 'fingerprint' || typeof data.fingerprint !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(data.fingerprint)) throw new Error('invalid fingerprint');\n            phase = 'scan'; renderCode(`https://discord.com/ra/${data.fingerprint}`);\n            emit({ type: 'status', status: 'ready' });\n        } else if (data.op === 'pending_ticket') {\n            if (phase !== 'scan') throw new Error('unexpected scan');\n            const payload = decodeText(await decrypt(data.encrypted_user_payload));\n            if (stopped) return;\n            userId = payload.split(':')[0];\n            if (!/^\\d{15,22}$/.test(userId)) throw new Error('invalid user');\n            phase = 'approve'; clearCode(); emit({ type: 'status', status: 'scanned' });\n        } else if (data.op === 'pending_login') {\n            if (phase !== 'approve') throw new Error('unexpected approval');\n            await exchange(data.ticket);\n        }\n    }\n    try {\n        if (!crypto?.subtle || typeof crypto.getRandomValues !== 'function') { error('crypto'); return { stop }; }\n        emit({ type: 'status', status: 'connecting' });\n        socket = socketFactory('wss://remote-auth-gateway.discord.gg/?v=2');\n        socket.onmessage = event => {\n            if (stopped) return;\n            // Cancellation and heartbeat acknowledgements must not wait behind\n            // asynchronous key generation or the ticket exchange.\n            try {\n                if (typeof event.data !== 'string' || event.data.length > 16384) return;\n                const immediate = JSON.parse(event.data);\n                if (immediate.op === 'cancel') { error('cancelled'); return; }\n                if (immediate.op === 'heartbeat_ack') { ackPending = false; return; }\n            } catch { error('protocol'); return; }\n            chain = chain.then(() => handle(event)).catch(() => { if (!stopped) error('protocol'); });\n        };\n        socket.onerror = () => error('connection');\n        socket.onclose = () => { removeTimer(heartbeat); if (!stopped && phase !== 'exchanging') error('connection'); };\n        expiry = later(() => error('timeout'), 20000);\n    } catch { error('connection'); }\n    return { stop };\n}\n";

/* SPDX-License-Identifier: GPL-3.0-or-later */

const QR_BASE_URL = 'https://discord.com/';
function allowedQrNavigation(url) { return url === 'about:blank' || url === QR_BASE_URL || url === 'https://discord.com'; }
function parseQrMessage(event, session) {
    const raw = event?.nativeEvent;
    if (!raw || !allowedQrNavigation(raw.url) || typeof raw.data !== 'string' || raw.data.length > 8192) return;
    let data;
    try { data = JSON.parse(raw.data); } catch { return; }
    if (data?.provider !== 'more-alts-qr' || data.session !== session) return;
    if (data.type === 'complete' && typeof data.token === 'string' && data.token.length >= 20 && data.token.length <= 4096
        && !/\s/.test(data.token) && typeof data.userId === 'string' && /^\d{15,22}$/.test(data.userId)) return data;
    if (data.type === 'error' && ['crypto','connection','timeout','expired','cancelled','protocol','verification','rate-limit','rejected'].includes(data.code))
        return { type: 'error', code: data.code, retryAfter: Math.max(1, Number(data.retryAfter) || 60) };
    if (data.type === 'status' && ['connecting','ready','scanned','approved'].includes(data.status)) return { type: 'status', status: data.status };
}
function qrErrorMessage(code, retryAfter) {
    const messages = {
        crypto: 'QR login needs an updated Android System WebView or Chrome with secure encryption support.',
        connection: 'Could not connect to Discord’s QR login service. Check your connection, then refresh the code.',
        timeout: 'Discord took too long to respond. Refresh the code to try again.',
        expired: 'This QR code expired. Tap Refresh QR code to make a new one.',
        cancelled: 'The sign-in was cancelled in Discord. Refresh the code when you are ready.',
        protocol: 'Discord could not complete this QR login. Refresh the code or use email and password.',
        verification: 'Discord requires extra verification for this sign-in. Complete it through Discord’s normal login.',
        rejected: 'Discord did not accept the approved QR session. Refresh the code or use email and password.'
    };
    return code === 'rate-limit' ? `Discord asked you to wait ${Math.ceil(retryAfter || 60)} seconds before refreshing.` : messages[code] || messages.protocol;
}
function makeQrHtml(session) {
    if (!/^[a-z0-9-]{1,80}$/i.test(session)) throw new Error('Invalid QR session');
    const runtime = `${QR_VENDOR_SOURCE}\n${QR_RUNTIME_SOURCE}`.replace(/<\/script/gi, '<\\/script');
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${session}'; style-src 'unsafe-inline'; connect-src wss://remote-auth-gateway.discord.gg https://discord.com/api/v9/users/@me/remote-auth/login; img-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'">
<style>html,body{margin:0;padding:0;background:#fff;color:#242429;font:14px system-ui,sans-serif;text-align:center}body{padding:10px}#qr{width:min(224px,calc(100vw - 20px));height:min(224px,calc(100vw - 20px));margin:0 auto;display:flex;align-items:center;justify-content:center}svg{width:100%;height:100%;image-rendering:pixelated}#status{margin:8px auto 0;line-height:20px;max-width:260px}.waiting{font-size:16px;padding:20px}</style></head>
<body><div id="qr" class="waiting">Connecting to Discord…</div><div id="status">Creating a fresh sign-in code</div>
<script nonce="${session}">${runtime}
(function(){
var box=document.getElementById('qr'),status=document.getElementById('status');
var flow=startRemoteAuth({crypto:window.crypto,socketFactory:function(url){return new WebSocket(url);},fetcher:function(url,options){return fetch(url,options);},
renderCode:function(url){var qr=qrcode(0,'M');qr.addData(url,'Byte');qr.make();box.className='';box.innerHTML=qr.createSvgTag({cellSize:4,margin:16,scalable:true});},
clearCode:function(){box.textContent='';},
emit:function(value){
if(value.type==='status'){var labels={connecting:'Connecting to Discord…',ready:'Scan and approve on your other device',scanned:'Scanned! Approve this login in Discord.',approved:'Approved! Saving your account…'};status.textContent=labels[value.status]||'';if(value.status==='scanned'||value.status==='approved'){box.className='waiting';box.textContent=value.status==='scanned'?'Waiting for your approval':'Signing in…';}}
if(value.type==='error'){box.className='waiting';box.textContent=value.code==='expired'?'Code expired':'QR sign-in stopped';status.textContent='Use Refresh QR code below to try again.';}
if(value.type==='complete'){box.className='waiting';box.textContent='Approved';status.textContent='Checking the approved account…';}
window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({provider:'more-alts-qr',session:'${session}'},value)));
}});
window.stopMoreAltsQr=function(){flow.stop();};window.addEventListener('pagehide',window.stopMoreAltsQr);window.addEventListener('beforeunload',window.stopMoreAltsQr);
})();</script></body></html>`;
}

/* SPDX-License-Identifier: GPL-3.0-or-later */

// Native React Native dialog. The backdrop, fields and footer follow Discord's
// Add Account design; the narrow, scrollable card also fits phone keyboards.
function createLoginDialog(React, RN) {
    const h = React.createElement;
    return function LoginDialog({ visible, mfa = false, qrMode = false, qrContent, onQrLogin, onRefreshQr, light = false, busy = false,
        login, password, code, error, onLoginChange, onPasswordChange, onCodeChange,
        onSubmit, onClose, onBack, onForgotPassword, onNativeLogin }) {
        if (!visible) return null;
        const c = light
            ? { card: '#ffffff', field: '#f2f3f5', border: '#d3d5da', text: '#1e1f22', muted: '#5c5e66', link: '#4752c4', danger: '#c32943', footer: '#f2f3f5' }
            : { card: '#242429', field: '#1f1f24', border: '#3a3a42', text: '#f2f3f5', muted: '#b5b5bd', link: '#8991ff', danger: '#ffb0b9', footer: '#202025' };
        const ready = !busy && (qrMode || (mfa ? !!code.trim() : !!login.trim() && password.length > 0));
        const submit = () => { if (ready) { if (qrMode) onRefreshQr(); else onSubmit(); } };
        const text = (value, style = {}, extra = {}) => h(RN.Text, { style: { color: c.text, fontSize: 15, lineHeight: 21, ...style }, ...extra }, value);
        const link = (title, action, style = {}) => h(RN.TouchableOpacity, {
            accessibilityRole: 'button', accessibilityLabel: title, onPress: action,
            disabled: busy, style: { minHeight: 44, justifyContent: 'center', opacity: busy ? 0.5 : 1, ...style }
        }, text(title, { color: c.link, fontSize: 14 }));
        const field = (label, value, onChangeText, props) => h(RN.View, { style: { marginBottom: 18 } },
            h(RN.Text, { style: { color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 9 } },
                label, h(RN.Text, { style: { color: '#ed4245' } }, ' *')),
            h(RN.TextInput, { value, onChangeText, editable: !busy, accessibilityLabel: label,
                autoCapitalize: 'none', autoCorrect: false, selectionColor: '#8991ff',
                style: { minHeight: 48, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 11,
                    backgroundColor: c.field, borderWidth: 1, borderColor: c.border, color: c.text, fontSize: 16 }, ...props }));
        const title = mfa ? 'Two-Factor Authentication' : 'Add Account';
        const subtitle = qrMode ? 'Log in with QR Code. Scan using Discord on another device where your account is already signed in.' : mfa ? 'Enter an authenticator code or an unused backup code to finish signing in.'
            : 'Logging into another account will let you easily switch between accounts on this device.';
        return h(RN.Modal, { visible: true, transparent: true, animationType: 'fade',
            presentationStyle: 'overFullScreen', onRequestClose: onClose, statusBarTranslucent: true },
            h(RN.KeyboardAvoidingView, { style: { flex: 1 }, behavior: RN.Platform?.OS === 'ios' ? 'padding' : 'height' },
                h(RN.View, { style: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: 16 } },
                    h(RN.View, { accessibilityViewIsModal: true, style: { width: '100%', maxWidth: 560, maxHeight: '90%',
                        backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 14, overflow: 'hidden' } },
                        h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', keyboardDismissMode: 'on-drag', bounces: false,
                            style: { flexShrink: 1 }, contentContainerStyle: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 14 } },
                            h(RN.View, { style: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' } },
                                h(RN.View, { style: { flex: 1, paddingRight: 8, paddingTop: 2 } },
                                    text(title, { fontSize: 21, lineHeight: 28, fontWeight: '700' }, { accessibilityRole: 'header' })),
                                h(RN.TouchableOpacity, { accessibilityRole: 'button', accessibilityLabel: 'Close add account', onPress: onClose,
                                    style: { width: 44, height: 44, marginTop: -9, marginRight: -11, alignItems: 'center', justifyContent: 'center' } },
                                    text('×', { color: c.muted, fontSize: 32, lineHeight: 36, fontWeight: '300' }))),
                            text(subtitle, { color: c.muted, marginTop: 4, marginBottom: 28 }),
                            error ? text(error, { color: c.danger, marginBottom: 18 }, { accessibilityRole: 'alert', accessibilityLiveRegion: 'polite' }) : null,
                            qrMode ? qrContent : mfa ? field('Verification Code', code, onCodeChange, { secureTextEntry: true, autoComplete: 'one-time-code', returnKeyType: 'done', onSubmitEditing: submit })
                                : h(RN.View, null,
                                    field('Email or Phone Number', login, onLoginChange, { autoComplete: 'username', keyboardType: 'email-address', textContentType: 'username' }),
                                    field('Password', password, onPasswordChange, { secureTextEntry: true, autoComplete: 'password', textContentType: 'password', returnKeyType: 'go', onSubmitEditing: submit }),
                                    link('Forgot your password?', onForgotPassword, { marginTop: -14 })),
                            !mfa && !qrMode ? link('Log in with QR Code', onQrLogin) : null,
                            link('Use Discord’s normal sign-in', onNativeLogin),
                            text('Passwords and verification codes are never saved.', { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 6 })),
                        h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                            backgroundColor: c.footer, paddingHorizontal: 22, paddingVertical: 16 } },
                            h(RN.TouchableOpacity, { accessibilityRole: 'button', accessibilityLabel: 'Back', onPress: onBack,
                                style: { minHeight: 44, minWidth: 60, justifyContent: 'center', paddingRight: 16 } },
                                text('Back', { fontWeight: '600' })),
                            h(RN.TouchableOpacity, { accessibilityRole: 'button', accessibilityLabel: qrMode ? 'Refresh QR code' : mfa ? 'Verify' : 'Continue',
                                accessibilityState: { disabled: !ready, busy }, disabled: !ready, onPress: submit,
                                style: { backgroundColor: '#5865f2', opacity: ready || busy ? 1 : 0.5, borderRadius: 7,
                                    minHeight: 44, minWidth: 112, paddingHorizontal: 18, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' } },
                                busy ? h(RN.ActivityIndicator, { color: '#ffffff', size: 'small', accessibilityLabel: 'Signing in' })
                                    : text(qrMode ? 'Refresh QR code' : mfa ? 'Verify' : 'Continue', { color: '#ffffff', fontWeight: '600' })))))));
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
    const disposers = [], qrStops = new Set();
    let qrCounter = 0, qrOpen = 0;
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
            if (active && controller === instance && !qrOpen) void instance.refreshSaved().catch(() => {});
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
        const [localBusy, setLocalBusy] = React.useState(false);
        const mounted = React.useRef(true), authenticating = React.useRef(false), localLock = React.useRef(false);
        const instance = controller;
        const qrSession = React.useRef(null), qrRef = React.useRef(null), qrBlockedUntil = React.useRef(0);
        function stopQr() {
            if (qrSession.current) qrOpen = Math.max(0, qrOpen - 1);
            qrSession.current = null;
            try { qrRef.current?.injectJavaScript?.('window.stopMoreAltsQr && window.stopMoreAltsQr(); true;'); } catch {}
            qrRef.current = null;
        }
        React.useEffect(() => {
            // Legacy loaders initialize compatibility features when the manager is opened.
            if (!resolver.loadedOnly && active && !optionalReady) initializeOptional();
            scheduleRefresh();
            qrStops.add(stopQr);
            return () => { stopQr(); qrStops.delete(stopQr); };
        }, [instance]);
        React.useEffect(() => {
            mounted.current = true;
            const unsubscribe = instance?.subscribe(() => { if (mounted.current) redraw(x => x + 1); });
            return () => { mounted.current = false; unsubscribe?.(); if (authenticating.current) instance?.cancelLogin(); };
        }, [instance]);
        const osScheme = RN.useColorScheme?.();
        const screen = RN.useWindowDimensions?.();
        const qrWidth = Math.max(200, Math.min(264, (screen?.width || 390) - 80));
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
        const cancel = () => { stopQr(); instance.cancelLogin(); clearAuth(); setPage('accounts'); setError(''); setNotice(''); };
        const stillHere = () => mounted.current && active && controller === instance;
        async function run(action, success) {
            if (localLock.current || instance.busy) return;
            localLock.current = true; setLocalBusy(true); setError(''); setNotice('');
            try { const result = await action(); if (stillHere()) success?.(result); }
            catch (reason) {
                if (stillHere() && reason?.code !== 'cancelled') setError(reason instanceof AccountError ? reason.message : 'The action could not be completed. Try again after Discord finishes loading.');
            } finally { localLock.current = false; if (stillHere()) setLocalBusy(false); }
        }
        function handleLogin(result) {
            setPassword(''); setCode('');
            if (result.kind === 'mfa') { setPage('mfa'); return; }
            stopQr(); clearAuth(); setPage('accounts'); setNotice(`${result.updated ? 'Updated' : 'Saved'} ${result.user.username}.`);
        }
        const saveCurrent = () => run(() => instance.saveCurrent(), result => {
            stopQr(); clearAuth(); setPage('accounts'); setNotice(`${result.updated ? 'Updated' : 'Saved'} ${result.user.username}.`);
        });
        function startQr() {
            if (!stillHere() || instance.busy || localLock.current) return;
            if (Date.now() < qrBlockedUntil.current) {
                setError(qrErrorMessage('rate-limit', (qrBlockedUntil.current - Date.now()) / 1000)); return;
            }
            let WebView;
            try { WebView = byProps('WebView')?.WebView; } catch {}
            if (!WebView) { setError('QR login is unavailable because this Discord build does not expose WebView. Update Revenge/Discord, or use email and password.'); return; }
            stopQr(); instance.cancelLogin();
            setPassword(''); setCode(''); setError(''); setNotice(''); authenticating.current = true;
            const id = `${Date.now().toString(36)}-${(++qrCounter).toString(36)}`;
            qrBlockedUntil.current = Date.now() + 3000;
            qrSession.current = { id, WebView, source: { html: makeQrHtml(id), baseUrl: QR_BASE_URL }, consumed: false };
            qrOpen++;
            setPage('qr'); redraw(x => x + 1);
        }
        const qr = qrSession.current;
        const qrContent = page === 'qr' && qr ? h(RN.View, { style: { alignItems: 'center', marginBottom: 16 } },
            h(qr.WebView, {
                key: qr.id, ref: node => { if (qrSession.current === qr) qrRef.current = node; }, source: qr.source,
                originWhitelist: ['*'], onShouldStartLoadWithRequest: request => allowedQrNavigation(request.url),
                javaScriptEnabled: true, domStorageEnabled: false, sharedCookiesEnabled: false, thirdPartyCookiesEnabled: false,
                cacheEnabled: false, allowFileAccess: false, allowFileAccessFromFileURLs: false, allowUniversalAccessFromFileURLs: false,
                mixedContentMode: 'never', setSupportMultipleWindows: false, javaScriptCanOpenWindowsAutomatically: false,
                scrollEnabled: false, overScrollMode: 'never', showsHorizontalScrollIndicator: false, showsVerticalScrollIndicator: false,
                style: { backgroundColor: '#ffffff', width: qrWidth, height: qrWidth + 52, borderRadius: 9 },
                containerStyle: { flex: 0, width: qrWidth, height: qrWidth + 52, borderRadius: 9, overflow: 'hidden' },
                onOpenWindow: () => {},
                onError: () => { if (stillHere() && qrSession.current === qr) { stopQr(); setError(qrErrorMessage('connection')); redraw(x => x + 1); } },
                onRenderProcessGone: () => { if (stillHere() && qrSession.current === qr) { stopQr(); setError(qrErrorMessage('connection')); redraw(x => x + 1); } },
                onMessage: event => {
                    if (!stillHere() || qrSession.current !== qr || qr.consumed) return;
                    const data = parseQrMessage(event, qr.id);
                    if (!data) return;
                    if (data.type === 'error') {
                        qr.consumed = true;
                        if (data.code === 'rate-limit') qrBlockedUntil.current = Date.now() + data.retryAfter * 1000;
                        setError(qrErrorMessage(data.code, data.retryAfter)); return;
                    }
                    if (data.type === 'complete') {
                        if (localLock.current || instance.busy) { setError('Another account action is finishing. Refresh this code and try again.'); return; }
                        qr.consumed = true;
                        void run(() => instance.acceptQrLogin(data.token, data.userId), handleLogin);
                    }
                }
            }), text('Scan with Discord on another signed-in device and approve the login there.', { color: colors.muted, textAlign: 'center', marginTop: 14, fontSize: 14 }),
            text('Only approve the code you generated here.', { color: colors.muted, textAlign: 'center', fontSize: 12 })) : null;
        function remove(account) {
            RN.Alert.alert('Remove saved account?', `Remove ${account.username} from More Alts? This only removes its saved session here.`, [
                { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => {
                    if (active && controller === instance && instance.remove(account.id) && mounted.current) setNotice(`Removed ${account.username}.`);
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
            button('Add another account', () => { setPage('login'); setError(''); setNotice(''); }, true),
            input('Search saved accounts', query, setQuery, { placeholder: 'Username, display name or user ID' }),
            text(`${instance.accounts.length} saved account${instance.accounts.length === 1 ? '' : 's'}`, { fontWeight: '700' }));
        contents.push(...matches.map(account => h(RN.View, { key: account.id, style: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 12 } },
            h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 } },
                account.avatar && /^[a-zA-Z0-9_]+$/.test(account.avatar) ? h(RN.Image, { source: { uri: `https://cdn.discordapp.com/avatars/${account.id}/${account.avatar}.png?size=128` }, style: { width: 42, height: 42, borderRadius: 21, marginRight: 12 } }) : null,
                h(RN.View, { style: { flex: 1 } }, text(account.displayName, { fontWeight: '700', fontSize: 17, marginBottom: 2 }),
                    text(`@${account.username}${currentId === account.id ? ' · Current account' : ''}`, { color: colors.muted, marginBottom: 0 }))),
            currentId !== account.id ? button('Switch account', () => run(() => instance.switchTo(account.id), result => setNotice(`Switched to ${result.user.username}.`))) : null,
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
            h(LoginDialog, { visible: page !== 'accounts', mfa: page === 'mfa', qrMode: page === 'qr', qrContent, onQrLogin: startQr, onRefreshQr: startQr, light, busy,
                login, password, code, error, onLoginChange: setLogin, onPasswordChange: setPassword, onCodeChange: setCode,
                onClose: cancel, onBack: () => {
                    if (page !== 'mfa' && page !== 'qr') { cancel(); return; }
                    stopQr(); instance.cancelLogin(); setPassword(''); setCode(''); setError(''); setPage('login');
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
        for (const stop of qrStops) { try { stop(); } catch {} } qrStops.clear();
        for (const dispose of disposers.splice(0).reverse()) { try { dispose?.(); } catch {} }
        resolver.clear();
    }
    return { onLoad, onUnload, settings: Settings };
}

return createPlugin(vendetta);
})()
