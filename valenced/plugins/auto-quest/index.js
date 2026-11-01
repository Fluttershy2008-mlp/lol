// SPDX-License-Identifier: GPL-3.0-only
// Auto Quest by Rosie. Valenced fixes: Fluttershy2008-mlp, 2026-11-01.
(() => {
    'use strict';
    const DEFAULTS = { enabled: true, notifyNewQuest: true, notifyUnsupported: false,
        watchAdSpeed: 7, autoExitAds: false, autoExitDelay: 5, ignoredQuestIds: {} };
    const WATCH = ['WATCH_VIDEO_ON_MOBILE', 'WATCH_VIDEO'];
    const HTTP_PATH = '../discord_common/js/packages/http-utils/HTTPUtils.tsx';
    const CANCELLED = Symbol('cancelled');
    const optional = fn => { try { return fn(); } catch { return undefined; } };
    const bounded = (value, fallback, max) => Number.isFinite(Number(value)) && Number(value) >= 1
        ? Math.min(max, Math.floor(Number(value))) : fallback;
    function settingsOf(value) {
        const data = value && typeof value === 'object' ? value : {};
        const result = { ...DEFAULTS };
        for (const key of ['enabled', 'notifyNewQuest', 'notifyUnsupported', 'autoExitAds'])
            if (typeof data[key] === 'boolean') result[key] = data[key];
        result.watchAdSpeed = bounded(data.watchAdSpeed, 7, 60);
        result.autoExitDelay = bounded(data.autoExitDelay, 5, 30);
        result.ignoredQuestIds = Object.fromEntries(Object.entries(data.ignoredQuestIds ?? {})
            .filter(([id, ignored]) => /^\d{1,20}$/.test(id) && ignored === true));
        return result;
    }
    const statusOf = quest => quest?.userStatus ?? quest?.user_status ?? {};
    const completed = quest => !!(statusOf(quest).completedAt ?? statusOf(quest).completed_at);
    const enrolled = quest => !!(statusOf(quest).enrolledAt ?? statusOf(quest).enrolled_at);
    const nameOf = quest => quest?.config?.messages?.questName ?? quest?.config?.messages?.quest_name
        ?? quest?.config?.messages?.gameTitle ?? 'Unknown Quest';
    const expired = quest => {
        const until = Date.parse(quest?.config?.expiresAt ?? quest?.config?.expires_at);
        return !Number.isFinite(until) || until <= Date.now();
    };
    function taskOf(quest) {
        const c = quest?.config;
        const tasks = c?.taskConfigV2?.tasks ?? c?.task_config_v2?.tasks ?? c?.taskConfig?.tasks ?? c?.task_config?.tasks;
        for (const type of WATCH) {
            const target = Number(tasks?.[type]?.target);
            if (Number.isFinite(target) && target > 0) return { type, target };
        }
    }
    const progressOf = (quest, task) => Math.max(0, Math.min(task.target,
        Number(statusOf(quest).progress?.[task.type]?.value) || 0));
    let current;
    const listeners = new Set();
    const changed = () => { for (const fn of [...listeners]) optional(fn); };

    function stopSession(session) {
        if (!session?.active) return;
        session.active = false;
        session.cancelRunners?.();
        for (const timer of session.timers) clearTimeout(timer);
        session.timers.clear();
        for (const remove of session.removers.splice(0).reverse()) optional(remove);
        if (current === session) current = undefined;
        changed();
    }

    async function start(api) {
        if (current?.active) return;
        const U = api.unscoped, { ReactNative: RN } = U.react;
        const F = U.modules.finders, S = U.discord.flux.Stores;
        const session = { active: true, ready: false, timers: new Set(), removers: [], store: undefined, http: undefined, httpRank: -1,
            settings: settingsOf(api.jsonStorage?.cache), statuses: new Map(), halted: new Set(), noticed: new Set(),
            confirmed: new Set(), staleQuests: new Set(), reconnect: new Set(), progress: new Map(),
            account: optional(() => S.UserStore.getCurrentUser()?.id), runners: new Map(), writes: Promise.resolve(),
            foreground: !RN.AppState?.currentState || RN.AppState.currentState === 'active',
            status: 'Connecting to Discord Quests…', scanTimer: undefined, probeTimer: undefined };
        current = session;
        const live = () => session.active && current === session;
        const account = () => optional(() => S.UserStore.getCurrentUser()?.id);
        api.cleanup(() => stopSession(session));
        const later = (fn, ms) => {
            const timer = setTimeout(() => { session.timers.delete(timer); if (live()) fn(); }, ms);
            session.timers.add(timer); return timer;
        };
        const clear = timer => { if (timer !== undefined) { clearTimeout(timer); session.timers.delete(timer); } };
        function toast(text) { if (live()) optional(() => RN.ToastAndroid?.show(text, RN.ToastAndroid.LONG ?? 1)); }
        function note(id, text) { if (live()) { session.statuses.set(id, text); session.status = text; changed(); } }
        function quests() {
            const value = optional(() => session.store?.getQuests?.() ?? session.store?.quests);
            const list = Array.isArray(value) ? value : value instanceof Map || typeof value?.values === 'function'
                ? [...value.values()] : value && typeof value === 'object' ? Object.values(value) : [];
            return list.filter(q => q && typeof q.id === 'string' && /^\d{1,20}$/.test(q.id));
        }
        const fresh = id => quests().find(q => q.id === id);
        const eligible = q => q && !session.staleQuests.has(q) && !session.confirmed.has(q.id)
            && enrolled(q) && !completed(q) && !expired(q)
            && !!taskOf(q) && !session.settings.ignoredQuestIds[q.id];
        const usable = () => live() && session.ready && session.settings.enabled && session.foreground
            && !!session.account && session.account === account();

        function cancelRunner(job) {
            if (!job) return;
            job.cancelled = true;
            job.cancelWait?.(); job.cancelRequest?.(); clear(job.exitTimer);
            if (session.runners.get(job.id) === job) session.runners.delete(job.id);
        }
        function cancelRunners() {
            for (const job of [...session.runners.values()]) cancelRunner(job);
        }
        session.cancelRunners = cancelRunners;
        const valid = job => usable() && !job.cancelled && session.runners.get(job.id) === job
            && job.account === account() && eligible(fresh(job.id));
        function wait(job, ms) {
            return new Promise(resolve => {
                const finish = value => { clear(timer); if (job.cancelWait === cancel) job.cancelWait = undefined; resolve(value); };
                const cancel = () => finish(false);
                const timer = later(() => finish(true), ms);
                job.cancelWait = cancel;
            });
        }
        function failure(kind, status, info = {}) {
            const error = new Error('Discord quest request failed');
            error.autoQuestFailure = true;
            error.kind = kind;
            error.status = Number(status) >= 100 && Number(status) <= 599 ? Number(status) : undefined;
            error.retryAfter = info.retryAfter;
            error.nativeCode = info.nativeCode;
            return error;
        }
        // Android can return parsed bodies, JSON text or nested response/error wrappers.
        // Preserve metadata separately so a rejected HTTP response is never called a connection error.
        async function responseInfo(value) {
            const info = { status: undefined, retryAfter: undefined, body: undefined, rejected: false };
            const seen = new Set();
            const retry = value => { const n = Number(value); if (Number.isFinite(n) && n > 0) info.retryAfter = Math.max(info.retryAfter ?? 0, n); };
            async function walk(item, depth = 0) {
                if (item == null || depth > 5) return;
                if (typeof item === 'string') { try { await walk(JSON.parse(item), depth + 1); } catch {} return; }
                if (typeof item !== 'object' || seen.has(item) || Array.isArray(item)) return;
                // Fetch Response.body is a byte stream; the parent .text() must decode it.
                if (typeof item.getReader === 'function') return;
                seen.add(item);
                const n = Number(item.status ?? item.statusCode);
                if (Number.isFinite(n) && n >= 100 && n <= 599 && (info.status === undefined || n >= 400)) info.status = n;
                if (item.ok === false || item.hasErr === true) info.rejected = true;
                retry(item.retry_after ?? item.retryAfter);
                retry(optional(() => item.headers?.get?.('retry-after')) ?? item.headers?.['retry-after'] ?? item.headers?.['Retry-After']);
                if (typeof item.code === 'string' && /^(?:ABORTED|ECONNRESET|ECONNREFUSED|ENETUNREACH|ETIMEDOUT|EAI_AGAIN|ERR_NETWORK|ERR_INTERNET_DISCONNECTED)$/.test(item.code))
                    info.nativeCode = item.code;
                let nested = false;
                for (const key of ['response', 'body', 'data', 'result', 'err']) {
                    if (item[key] == null) continue;
                    nested = true; await walk(item[key], depth + 1);
                }
                if (info.body === undefined) {
                    let text;
                    try { text = typeof item.text === 'function' ? await item.text() : item.text; } catch {}
                    if (typeof text === 'string' && text.trim()) { nested = true; await walk(text, depth + 1); }
                    else if (typeof item.json === 'function') { nested = true; try { await walk(await item.json(), depth + 1); } catch {} }
                }
                if (item.cause != null) await walk(item.cause, depth + 1);
                const transport = 'status' in item || 'statusCode' in item || 'headers' in item || 'text' in item
                    || typeof item.message === 'string' && typeof item.name === 'string';
                if (!nested && !transport) info.body = item;
            }
            await walk(value);
            return info;
        }
        async function decode(response) {
            const info = await responseInfo(response);
            if (info.status >= 400 || info.rejected || info.body?.code || info.body?.error) {
                const kind = info.status >= 400 ? 'http' : info.nativeCode || info.rejected && !info.body ? 'network' : 'response';
                throw failure(kind, info.status, info);
            }
            if ((info.status !== undefined && (info.status < 200 || info.status >= 300)) || !info.body)
                throw failure('response', info.status, info);
            return info.body;
        }
        async function requestFailure(error) {
            if (error?.autoQuestFailure) return error;
            let info;
            try { info = await responseInfo(error); } catch { info = {}; }
            if (info.status >= 400) return failure('http', info.status, info);
            if (error?.name === 'SyntaxError') return failure('response', info.status, info);
            const message = typeof error?.message === 'string' ? error.message : '';
            const network = info.nativeCode || /network|failed to fetch|connection|timed?\s*out|socket|offline|internet/i.test(message);
            // Inspect error text only to classify it. Never show/log raw errors, URLs, tokens or response bodies.
            return failure(error?.name === 'TypeError' && !network ? 'client' : 'network', undefined, info);
        }
        function reasonOf(error) {
            if (error.kind === 'timeout') return 'request timed out [AQ-TIMEOUT]';
            if (error.kind === 'response') return 'unreadable Discord response [AQ-RESPONSE]';
            if (error.status) return 'HTTP ' + error.status + ' [AQ-HTTP-' + error.status + ']';
            if (error.kind === 'client') return 'Discord HTTP module unavailable [AQ-CLIENT]';
            return 'network unavailable [AQ-NETWORK' + (error.nativeCode ? '-' + error.nativeCode : '') + ']';
        }
        function post(job, timestamp) {
            return new Promise((resolve, reject) => {
                let settled = false;
                const finish = (fn, value) => {
                    if (settled) return;
                    settled = true; clear(timer);
                    if (job.cancelRequest === cancelRequest) job.cancelRequest = undefined;
                    fn(value);
                };
                const cancel = () => finish(resolve, CANCELLED);
                const controller = optional(() => new AbortController());
                const timer = later(() => {
                    finish(reject, failure('timeout', 408));
                    optional(() => controller?.abort());
                }, 25000);
                job.cancelRequest = () => { cancel(); optional(() => controller?.abort()); };
                const cancelRequest = job.cancelRequest;
                const client = session.http;
                // Authentication belongs to Discord's signed-in client. Do not copy or cache account tokens.
                Promise.resolve().then(() => {
                    if (!valid(job)) return CANCELLED;
                    return client.post({ url: '/quests/' + job.id + '/video-progress', body: { timestamp },
                        signal: controller?.signal, timeout: 20000, retries: 0, rejectWithError: false, failImmediatelyWhenRateLimited: true });
                }).then(async response => {
                    if (response === CANCELLED || !valid(job)) return CANCELLED;
                    return decode(response);
                }).then(body => finish(resolve, body), async error => {
                    if (!settled) finish(reject, await requestFailure(error));
                })
                    .finally(() => { if (live()) queueScan(); });
            });
        }
        async function report(job, timestamp) {
            for (let attempts = 0; valid(job); attempts++) {
                try { return await post(job, timestamp); }
                catch (error) {
                    if (!valid(job)) return CANCELLED;
                    const temporary = error.kind === 'network' || error.kind === 'timeout'
                        || [408, 500, 502, 503, 504, 522, 523, 524, 598, 599].includes(error.status);
                    if (attempts >= 2 || !temporary && error.status !== 429) throw error;
                    const delay = error.retryAfter ?? (error.status === 429 ? 5 : attempts === 0 ? 2 : 5);
                    if (!Number.isFinite(delay) || delay <= 0 || delay > 120) throw error;
                    note(job.id, nameOf(job.quest) + ' — ' + (error.status === 429 ? 'Discord rate limit' : reasonOf(error))
                        + '. Retrying in ' + Math.ceil(delay) + 's (' + (attempts + 1) + '/2)…');
                    if (!await wait(job, Math.max(1000, Math.ceil(delay * 1000)))) return CANCELLED;
                }
            }
            return CANCELLED;
        }
        function finishConfirmed(job) {
            if (!usable() || job.cancelled || job.account !== account()) return;
            session.confirmed.add(job.id);
            session.halted.add(job.id);
            note(job.id, nameOf(job.quest) + ' — completed by Discord.');
            toast('Quest completed: ' + nameOf(job.quest));
        }
        function scheduleExit(job) {
            if (!session.settings.autoExitAds) return;
            const nav = optional(() => U.discord.modules.main_tabs_v2.RootNavigationRef.getRootNavigationRef())
                ?? optional(() => F.lookupModule(F.filters.withProps('getRootNavigationRef'), { initialize: false })[0]?.getRootNavigationRef());
            const route = optional(() => nav.getCurrentRoute());
            const routeId = route?.params?.questId ?? route?.params?.quest_id ?? route?.params?.quest?.id;
            const routeName = (route?.name ?? '').replace(/([a-z])([A-Z])/g, '$1 $2');
            // A stable route name alone could be a chat or Settings. Require this quest's video route and key.
            if (!route?.key || !/quest|reward/i.test(routeName) || !/video|watch|(?:^|[\s_-])ads?(?:$|[\s_-])/i.test(routeName)
                || routeId !== job.id) return;
            job.exitTimer = later(() => {
                if (!valid(job) || !session.settings.autoExitAds) return;
                const active = optional(() => nav.getCurrentRoute());
                if (active?.key === route.key && active?.name === route.name && optional(() => nav.canGoBack()) === true)
                    optional(() => nav.goBack());
            }, session.settings.autoExitDelay * 1000);
        }
        async function run(job) {
            const task = taskOf(job.quest);
            const saved = session.progress.get(job.id);
            let done = Math.min(task.target, Math.max(progressOf(job.quest, task), saved?.type === task.type ? saved.value : 0));
            note(job.id, nameOf(job.quest) + ' — ' + Math.floor(done) + '/' + task.target + ' seconds');
            scheduleExit(job);
            try {
                while (valid(job)) {
                    const step = Math.min(session.settings.watchAdSpeed, task.target - done);
                    if (step > 0 && !await wait(job, step * 1000)) return;
                    if (!valid(job)) {
                        if (completed(fresh(job.id))) finishConfirmed(job);
                        return;
                    }
                    const timestamp = Math.min(task.target, Math.max(done + step, progressOf(fresh(job.id), task)));
                    const result = await report(job, timestamp);
                    if (result === CANCELLED || !usable() || job.cancelled || job.account !== account()) return;
                    if (result.completed_at || result.completedAt || completed(fresh(job.id))) { finishConfirmed(job); return; }
                    if (!valid(job)) return;
                    done = timestamp;
                    session.progress.set(job.id, { type: task.type, value: done });
                    note(job.id, nameOf(job.quest) + ' — ' + Math.floor(done) + '/' + task.target + ' seconds');
                    if (done >= task.target) {
                        session.halted.add(job.id);
                        note(job.id, nameOf(job.quest) + ' — awaiting Discord completion confirmation. Tap Check again to retry.');
                        return;
                    }
                }
            } catch (error) {
                if (!valid(job)) return;
                session.halted.add(job.id);
                if (error.kind === 'network' || error.kind === 'timeout') session.reconnect.add(job.id);
                const reason = reasonOf(error);
                note(job.id, nameOf(job.quest) + ' — paused (' + reason + '). Tap Check again to retry.');
                toast('Auto Quest paused: ' + reason + '. Open its settings to retry.');
            } finally {
                clear(job.exitTimer);
                if (session.runners.get(job.id) === job) session.runners.delete(job.id);
                if (live()) queueScan();
            }
        }
        function queueScan() {
            if (!live() || session.scanTimer !== undefined) return;
            session.scanTimer = later(() => { session.scanTimer = undefined; scan(); }, 0);
        }
        function syncAccount() {
            const id = account();
            if (id === session.account) return;
            session.staleQuests = new Set(quests());
            cancelRunners(); session.account = id;
            session.statuses.clear(); session.noticed.clear(); session.halted.clear(); session.confirmed.clear(); session.reconnect.clear(); session.progress.clear();
        }
        function scan() {
            if (!live()) return;
            syncAccount();
            for (const job of [...session.runners.values()]) {
                if (valid(job)) continue;
                if (completed(fresh(job.id))) finishConfirmed(job);
                cancelRunner(job);
            }
            session.status = !session.settings.enabled ? 'Paused in settings.' : !session.foreground ? 'Paused while Valenced is in the background.'
                : !session.account ? 'Waiting for a signed-in Discord account.' : !session.store ? 'Open Discord Quests once to load your quests.'
                : !session.http ? 'Waiting for Discord’s HTTP client. Open Discord Quests once.' : 'Ready for accepted video quests.';
            if (!usable() || !session.store || !session.http) { changed(); return; }
            const list = quests();
            for (const quest of list) {
                if (session.staleQuests.has(quest) || expired(quest) || completed(quest) || session.settings.ignoredQuestIds[quest.id]) continue;
                const supported = !!taskOf(quest);
                if (!enrolled(quest) && session.settings.notifyNewQuest && (supported || session.settings.notifyUnsupported)
                    && !session.noticed.has(quest.id)) {
                    session.noticed.add(quest.id);
                    toast((supported ? 'New video quest: ' : 'Unsupported quest: ') + nameOf(quest)
                        + (supported ? '. Accept it in Discord to begin.' : '. Complete this quest in Discord.'));
                }
            }
            for (const quest of list) {
                if (!eligible(quest) || session.halted.has(quest.id) || session.runners.has(quest.id)) continue;
                const job = { id: quest.id, quest, account: session.account, cancelled: false };
                // Claim this ID before starting: store events cannot create a second runner.
                session.runners.set(quest.id, job);
                void run(job);
            }
            if (session.runners.size) session.status = 'Processing ' + session.runners.size
                + (session.runners.size === 1 ? ' video quest.' : ' video quests at once.');
            changed();
        }
        function attachStore(value) {
            for (const store of [value, value?.default]) {
                if (!store || session.store || typeof store.addChangeListener !== 'function' || typeof store.removeChangeListener !== 'function') continue;
                if (!('quests' in store) && typeof store.getQuests !== 'function') continue;
                session.store = store;
                store.addChangeListener(queueScan);
                session.removers.push(() => store.removeChangeListener(queueScan));
                queueScan(); return;
            }
        }
        function attachHTTP(value, rank = 0) {
            if (session.http && session.httpRank >= rank) return;
            for (const client of [value?.HTTP, value?.default?.HTTP, value?.default, value])
                if (client && typeof client.get === 'function' && typeof client.post === 'function') {
                    session.http = client; session.httpRank = rank; queueScan(); return;
                }
        }
        const watches = [
            [['quests', 'addChangeListener'], attachStore, 'store'], [['getQuests', 'addChangeListener'], attachStore, 'store'],
            [['getAPIBaseURL'], value => attachHTTP(value, 2), 'http'],
            [['HTTP'], value => attachHTTP(value, 1), 'http'], [['get', 'post', 'del'], value => attachHTTP(value, 0), 'http'],
        ];
        const pathFinders = U.discord.utils?.modules?.finders;
        function discover() {
            if (!live()) return;
            optional(() => attachStore(S.QuestStore));
            optional(() => attachHTTP(pathFinders?.lookupModuleWithImportedPath(HTTP_PATH)[0], 3));
            for (const [keys, accept, kind] of watches) {
                if (kind === 'store' && session.store) continue;
                optional(() => { for (const [value] of F.lookupModules(F.filters.withProps(...keys), { initialize: false })) accept(value); });
            }
            if ((!session.store || !session.http) && session.probeTimer === undefined)
                session.probeTimer = later(() => { session.probeTimer = undefined; discover(); queueScan(); }, 2000);
        }
        for (const [keys, accept] of watches) {
            const remove = optional(() => F.getModules(F.filters.withProps(...keys), value => { if (live()) accept(value); }));
            if (typeof remove === 'function') session.removers.push(remove);
        }
        const unwatchHTTP = optional(() => pathFinders?.getModuleWithImportedPath(HTTP_PATH, value => {
            if (live()) attachHTTP(value, 3);
        }));
        if (typeof unwatchHTTP === 'function') session.removers.push(unwatchHTTP);
        optional(() => {
            const fn = () => { if (live()) { syncAccount(); queueScan(); } };
            S.UserStore.addChangeListener(fn);
            session.removers.push(() => S.UserStore.removeChangeListener(fn));
        });
        optional(() => {
            const connection = S.ConnectionStore;
            let wasConnected = connection.isConnected();
            const fn = () => {
                if (!live()) return;
                const connected = connection.isConnected();
                if (connected && wasConnected === false) {
                    for (const id of session.reconnect) session.halted.delete(id);
                    session.reconnect.clear(); queueScan();
                }
                wasConnected = connected;
            };
            connection.addChangeListener(fn);
            session.removers.push(() => connection.removeChangeListener(fn));
        });
        const appSubscription = optional(() => RN.AppState?.addEventListener('change', state => {
            if (!live()) return;
            session.foreground = state === 'active';
            if (!session.foreground) cancelRunners();
            queueScan();
        }));
        if (appSubscription) session.removers.push(() => appSubscription.remove());
        session.quests = quests;
        session.update = patch => {
            if (!live()) return;
            session.settings = settingsOf({ ...session.settings, ...patch });
            if (!session.settings.enabled) cancelRunners();
            const next = { ...session.settings };
            session.writes = session.writes.catch(() => {}).then(() => api.jsonStorage.set(next, true))
                .catch(() => toast('Auto Quest could not save settings.'));
            queueScan(); changed();
        };
        session.check = () => { if (live()) {
            session.halted.clear(); session.reconnect.clear();
            session.http = undefined; session.httpRank = -1;
            discover(); queueScan();
        } };
        try {
            const data = api.jsonStorage.loaded ? api.jsonStorage.cache : await api.jsonStorage.get();
            if (live()) session.settings = settingsOf(data);
        } catch { toast('Auto Quest could not load settings. Using defaults.'); }
        if (live()) { session.ready = true; discover(); queueScan(); }
    }

    function SettingsComponent({ api }) {
        const { React, ReactNative: RN } = api.unscoped.react;
        const h = React.createElement, [, refresh] = React.useState(0);
        React.useEffect(() => { const fn = () => refresh(x => x + 1); listeners.add(fn); return () => listeners.delete(fn); }, []);
        const session = current, values = session?.settings ?? settingsOf(api.jsonStorage?.cache);
        const light = optional(() => api.unscoped.discord.flux.Stores.ThemeStore.theme) === 'light';
        const fg = light ? '#18191C' : '#F2F3F5', muted = light ? '#4E5058' : '#B5BAC1', card = light ? '#F2F3F5' : '#2B2D31';
        const text = (value, extra = {}) => h(RN.Text, { style: { color: fg, lineHeight: 21, ...extra } }, value);
        const toggle = (key, label, detail) => h(RN.View, { key, style: { backgroundColor: card, borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' } },
            h(RN.View, { style: { flex: 1, marginRight: 12 } }, text(label, { fontSize: 16, fontWeight: '600' }), text(detail, { color: muted, marginTop: 4 })),
            h(RN.Switch, { accessibilityLabel: label, value: values[key], onValueChange: value => session?.update?.({ [key]: value }) }));
        const quests = session?.quests?.() ?? [];
        return h(RN.ScrollView, { contentContainerStyle: { padding: 20, paddingBottom: 40 } },
            text('Auto Quest', { fontSize: 26, fontWeight: '700', lineHeight: 32, marginBottom: 8 }),
            text('Accept video quests in Discord. All accepted video quests run at the same time, each with its own progress timer. Keep Valenced open. Play, stream and console quests are unsupported.', { color: muted, marginBottom: 20 }),
            toggle('enabled', 'Auto-complete video quests', 'Changes apply immediately. Switching off cancels active timers.'),
            toggle('notifyNewQuest', 'Notify for new quests', 'One notification per available quest in this account session.'),
            toggle('notifyUnsupported', 'Notify for unsupported quests', 'Also show new quests that require playing, streaming or a console.'),
            toggle('autoExitAds', 'Close the matching quest video', 'After ' + values.autoExitDelay + ' seconds, return only from the current quest’s video screen when Discord exposes its quest ID.'),
            text('Progress interval: ' + values.watchAdSpeed + ' seconds', { marginTop: 8 }),
            text('Progress follows elapsed time. Completion is shown only after Discord confirms it.', { color: muted, marginTop: 4, marginBottom: 18 }),
            text('Temporary connection failures retry automatically. If retries are exhausted, the affected quest shows an error code below.', { color: muted, marginBottom: 14 }),
            h(RN.Button, { title: 'Check again / retry paused quests', onPress: () => session?.check?.(), disabled: !session?.active }),
            text(session?.status ?? 'Plugin is stopped.', { color: muted, marginVertical: 16 }),
            ...quests.slice(0, 40).map(quest => {
                const task = taskOf(quest);
                const detail = completed(quest) || session?.confirmed.has(quest.id) ? 'Completed' : expired(quest) ? 'Expired'
                    : session?.staleQuests.has(quest) ? 'Open Discord Quests to refresh this account’s status'
                    : session?.settings.ignoredQuestIds[quest.id] ? 'Ignored'
                    : !task ? 'Unsupported quest type' : !enrolled(quest) ? 'Accept this quest in Discord'
                    : session?.statuses.get(quest.id) ?? 'Accepted — ' + Math.floor(progressOf(quest, task)) + '/' + task.target + ' seconds';
                return h(RN.View, { key: quest.id, style: { backgroundColor: card, padding: 14, borderRadius: 12, marginBottom: 10 } },
                    text(nameOf(quest), { fontWeight: '600' }), text(detail, { color: muted, marginTop: 5 }));
            }),
            !quests.length && text('No quests loaded. Open Discord’s Quests page once, then return here.', { color: muted }),
            text('Auto Quest 1.2.2 • Original by Rosie • Valenced fixes by fluttershy_simper67', { color: muted, fontSize: 12, marginTop: 20 }));
    }
    return { default: { jsonStorage: { load: true, default: { ...DEFAULTS, ignoredQuestIds: {} } },
        start, stop() { stopSession(current); }, SettingsComponent } };
})()
