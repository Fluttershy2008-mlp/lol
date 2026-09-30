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

function createPlugin(V, host = globalThis) {
    const { React, ReactNative: RN } = V.metro.common;
    const h = React.createElement, storage = V.plugin.storage;
    const disposers = [];
    let active = false, controller, refreshTimer, nativeReady = false;
    const byProps = (...keys) => { try { return V.metro.findByProps(...keys); } catch {} };
    const byStore = name => { try { return V.metro.findByStoreName(name); } catch {} };
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
        if (!active) return;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => { if (active) void controller.refreshSaved(); }, 700);
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
        const cancel = () => { instance.cancelLogin(); clearAuth(); setPage('accounts'); setError(''); setNotice(''); };
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
            clearAuth(); setPage('accounts'); setNotice(`${result.updated ? 'Updated' : 'Saved'} ${result.user.username}.`);
        }
        const saveCurrent = () => run(() => instance.saveCurrent(), result => {
            clearAuth(); setPage('accounts'); setNotice(`${result.updated ? 'Updated' : 'Saved'} ${result.user.username}.`);
        });
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
        if (page === 'login') {
            contents.push(text('Add account', { fontSize: 20, fontWeight: '700' }),
                input('Email or phone number', login, setLogin, { autoComplete: 'username', keyboardType: 'email-address' }),
                input('Password', password, setPassword, { secureTextEntry: true, autoComplete: 'password' }),
                button('Sign in and save', () => {
                    authenticating.current = true;
                    const typedPassword = password; setPassword('');
                    void run(() => instance.login(login, typedPassword), handleLogin);
                }),
                button('Save current account', saveCurrent, true),
                button('Use Discord’s normal login', nativeLoginHelp, true),
                text('Passwords are cleared after submission and are never saved. Discord may require verification in its own login screen.', { color: colors.muted }),
                button('Cancel', cancel, true, true));
        } else if (page === 'mfa') {
            contents.push(text('Two-factor authentication', { fontSize: 20, fontWeight: '700' }),
                text('Enter your authenticator code or an unused backup code.'),
                input('Verification code', code, setCode, { secureTextEntry: true, autoComplete: 'one-time-code' }),
                button('Verify and save', () => { const typedCode = code; setCode(''); void run(() => instance.submitCode(typedCode), handleLogin); }),
                button('Use Discord’s normal login', nativeLoginHelp, true),
                button('Back to accounts', cancel, true, true));
        } else {
            contents.push(button('Save current account', saveCurrent),
                button('Add another account', () => { setPage('login'); setError(''); setNotice(''); }, true),
                input('Search saved accounts', query, setQuery, { placeholder: 'Username, display name or user ID' }),
                text(`${instance.accounts.length} saved account${instance.accounts.length === 1 ? '' : 's'}`, { fontWeight: '700' }));
            for (const account of matches) contents.push(h(RN.View, { key: account.id, style: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 12 } },
                h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 } },
                    account.avatar && /^[a-zA-Z0-9_]+$/.test(account.avatar) ? h(RN.Image, { source: { uri: `https://cdn.discordapp.com/avatars/${account.id}/${account.avatar}.png?size=128` }, style: { width: 42, height: 42, borderRadius: 21, marginRight: 12 } }) : null,
                    h(RN.View, { style: { flex: 1 } }, text(account.displayName, { fontWeight: '700', fontSize: 17, marginBottom: 2 }),
                        text(`@${account.username}${currentId === account.id ? ' · Current account' : ''}`, { color: colors.muted, marginBottom: 0 }))),
                currentId !== account.id ? button('Switch account', () => run(() => instance.switchTo(account.id), result => setNotice(`Switched to ${result.user.username}.`))) : null,
                button('Remove saved account', () => remove(account), true)));
            if (!matches.length) contents.push(text(query ? 'No matching accounts.' : 'Save your current account to get started.', { color: colors.muted }));
            contents.push(button('Import accounts from old More Alts', () => run(importOld, result => setNotice(`Imported ${result.added} account${result.added === 1 ? '' : 's'}; skipped ${result.skipped} existing or invalid entries.`)), true),
                text('For import, keep the original Apex More Alts installed but disabled.', { color: colors.muted }),
                toggle('Refresh saved sessions after signing in', 'refreshSavedSessions'),
                toggle('Enable Discord’s native account menu', 'enableNativeSwitcher'),
                text(nativeReady ? 'Reopen Discord settings after changing the native menu option.' : 'The native menu is unavailable on this build. The saved-account list above still works.', { color: colors.muted }),
                button('Help with Discord verification', nativeLoginHelp, true),
                text('Saved sessions stay in Revenge’s local plugin storage. Passwords and verification codes are never stored. Signing out or changing a password can expire a saved session.', { color: colors.muted }));
        }
        return h(RN.KeyboardAvoidingView, { style: { flex: 1, backgroundColor: colors.bg }, behavior: RN.Platform?.OS === 'ios' ? 'padding' : undefined },
            h(RN.ScrollView, { keyboardShouldPersistTaps: 'handled', contentContainerStyle: { padding: 18, paddingBottom: 48 } }, ...contents));
    }
    function onLoad() {
        if (active) return;
        controller = createController({ storage, client: createClient({ fetcher: (...args) => host.fetch(...args) }), getSession, getSwitcher });
        active = true;
        try {
            const native = byProps('getCanUseMultiAccountMobile');
            if (typeof native?.getCanUseMultiAccountMobile === 'function') {
                const unpatch = V.patcher.after('getCanUseMultiAccountMobile', native, (_, result) => active && storage.settings.enableNativeSwitcher ? true : result);
                if (typeof unpatch === 'function') { nativeReady = true; disposers.push(unpatch); }
            }
        } catch { log('Native menu is unavailable; plugin settings remain accessible.'); }
        for (const name of ['UserStore', 'AuthenticationStore']) {
            try {
                const store = byStore(name);
                if (typeof store?.addChangeListener === 'function' && typeof store?.removeChangeListener === 'function') {
                    store.addChangeListener(scheduleRefresh); disposers.push(() => store.removeChangeListener(scheduleRefresh));
                }
            } catch {}
        }
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
            const unreg = V.commands?.registerCommand?.({ name: 'morealts', displayName: 'morealts', type: 1, inputType: 1,
                applicationId: '-1', description: 'Open More Alts account switcher', displayDescription: 'Open More Alts account switcher',
                options: [], execute: () => { openSettings(); return undefined; } });
            if (typeof unreg === 'function') disposers.push(unreg);
        } catch {}
        scheduleRefresh();
    }
    function onUnload() {
        active = false; nativeReady = false; clearTimeout(refreshTimer); controller?.stop();
        for (const dispose of disposers.splice(0).reverse()) { try { dispose?.(); } catch {} }
    }
    return { onLoad, onUnload, settings: Settings };
}

return createPlugin(vendetta);
})()
