/* SPDX-License-Identifier: GPL-3.0-or-later */
import { AccountError, createClient, createController } from './core.mjs';
import { createModuleResolver } from './modules.mjs';
import { registerSettingsShortcut } from './shortcut.mjs';
import { createLoginDialog } from './login-dialog.mjs';
import { makeQrHtml, parseQrMessage, allowedQrNavigation, qrErrorMessage, QR_BASE_URL } from './qr-html.mjs';

export function createPlugin(V, host = globalThis) {
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
