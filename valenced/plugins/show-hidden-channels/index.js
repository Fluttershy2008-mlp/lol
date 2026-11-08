(() => {
    /* SPDX-License-Identifier: GPL-3.0-or-later
     * ShowHiddenChannels for Valenced — native server channel list integration.
     * Original mobile implementation; no desktop source patches are evaluated.
     */
    'use strict';
    const TYPES = { 0: 'Text', 2: 'Voice', 4: 'Category', 5: 'Announcement', 13: 'Stage', 15: 'Forum', 16: 'Media' };
    const LIST_TYPES = new Set([0, 2, 5, 13, 15, 16]);
    const DEFAULT_SETTINGS = { compactScreen: false, showDetails: true, rolesExpanded: true };
    const PERMISSION_NAMES = [
        [0, 'Create invites'], [1, 'Kick members'], [2, 'Ban members'], [3, 'Administrator'],
        [4, 'Manage channels'], [5, 'Manage server'], [6, 'Add reactions'], [7, 'View audit log'],
        [8, 'Priority speaker'], [9, 'Video'], [10, 'View channel'], [11, 'Send messages'],
        [12, 'Send TTS messages'], [13, 'Manage messages'], [14, 'Embed links'], [15, 'Attach files'],
        [16, 'Read message history'], [17, 'Mention everyone'], [18, 'Use external emoji'],
        [19, 'View server insights'], [20, 'Connect to voice'], [21, 'Speak'], [22, 'Mute members'],
        [23, 'Deafen members'], [24, 'Move members'], [25, 'Use voice activity'], [26, 'Change nickname'],
        [27, 'Manage nicknames'], [28, 'Manage roles'], [29, 'Manage webhooks'], [30, 'Manage expressions'],
        [31, 'Use application commands'], [32, 'Request to speak'], [33, 'Manage events'],
        [34, 'Manage threads'], [35, 'Create public threads'], [36, 'Create private threads'],
        [37, 'Use external stickers'], [38, 'Send messages in threads'], [39, 'Use activities'],
        [40, 'Moderate members'], [41, 'View monetization insights'], [42, 'Use soundboard'],
        [43, 'Create expressions'], [44, 'Create events'], [45, 'Use external sounds'],
        [46, 'Send voice messages'], [48, 'Set voice channel status'], [49, 'Send polls'],
        [50, 'Use external apps'], [51, 'Pin messages'], [52, 'Bypass slowmode'],
    ];
    let runtime = null;

    function createRuntime(api) {
        const U = api.unscoped, F = U.modules.finders;
        const React = U.react.React, RN = U.react.ReactNative;
        if (!React?.createElement || !F?.getModules || !U.patcher?.instead)
            throw new Error('Update Valenced to API 1 and restart Discord to use ShowHiddenChannels.');
        const h = React.createElement;
        const safe = fn => { try { return fn(); } catch (_) { return undefined; } };
        const stores = {}, permissions = [], disposers = [], subscribers = new Set();
        const resolvedUsers = new Map(), userJobs = new Map(), userFailures = new Map(), requestQueue = [], timers = new Set();
        let requestBusy = false, pumpTimer, nextRequestAt = 0, rateLimitUntil = 0, profileTarget, profileOpenSequence = 0;
        let profileTrace = [];
        const models = new Map(), preparedModels = new WeakSet(), watchedStores = new WeakSet();
        const patchedOwners = new WeakMap(), patchedStores = new WeakSet(), renderModules = new WeakSet();
        let active = true, queued = false, revision = 0, rendererReady = false, listReady = false, rowConstants;
        let screenRouteReady = false, gradientModule, openedChannel;
        const screenRoute = 'fluttershy.show-hidden-channels.lock-screen';
        const own = fn => { if (typeof fn === 'function') disposers.push(fn); return fn; };
        const notify = () => { revision++; for (const listener of [...subscribers]) listener(revision); };
        const settings = { ...DEFAULT_SETTINGS };
        for (const key of Object.keys(DEFAULT_SETTINGS))
            if (typeof api.jsonStorage?.cache?.[key] === 'boolean') settings[key] = api.jsonStorage.cache[key];
        function setSetting(key, value) {
            if (!active || !(key in DEFAULT_SETTINGS) || typeof value !== 'boolean') return;
            settings[key] = value;
            try {
                const result = api.jsonStorage?.set?.({ [key]: value });
                result?.catch?.(error => api.plugin?.reportError?.(error));
            } catch (error) { api.plugin?.reportError?.(error); }
            notify();
        }
        function copyValue(value, label) {
            if (!active) return false;
            const clipboard = safe(() => U.externals.ReactNativeClipboard.Clipboard);
            if (typeof clipboard?.setString !== 'function') return false;
            try {
                clipboard.setString(String(value));
                RN.ToastAndroid?.show?.(label + ' copied', RN.ToastAndroid.SHORT ?? 0);
                return true;
            } catch (_) { return false; }
        }
        const byProps = (...props) => safe(() => F.lookupModule(F.filters.withProps(...props), { initialize: false })[0]);
        function later(fn, delay = 0) {
            const timer = setTimeout(() => { timers.delete(timer); if (active) fn(); }, delay);
            timers.add(timer);
            return timer;
        }
        const validUserId = id => typeof id === 'string' && /^[1-9]\d{16,19}$/.test(id);
        const usableUser = (user, id) => user && String(user.id) === String(id) && typeof user.username === 'string'
            && user.username.trim() && !/^(unknown[- ]user|deleted user)$/i.test(user.username);
        const accountId = () => String(safe(() => stores.UserStore?.getCurrentUser()?.id)
            || safe(() => stores.AuthenticationStore?.getId()) || '');
        const userKey = id => accountId() + ':' + id;
        function cachedUser(id) {
            const native = safe(() => stores.UserStore?.getUser(id));
            return usableUser(native, id) ? native : resolvedUsers.get(userKey(id));
        }
        function nativeHTTP() {
            const path = safe(() => U.discord.utils.modules.finders.lookupModuleWithImportedPath(
                '../discord_common/js/packages/http-utils/HTTPUtils.tsx')[0]);
            const module = path || byProps('HTTP') || byProps('get', 'post', 'del');
            return module?.HTTP || module;
        }
        function failureDelay(error) {
            let body = error?.body ?? error?.response?.body;
            if (typeof body === 'string') body = safe(() => JSON.parse(body));
            const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
            if (status === 429) {
                const seconds = Number(body?.retry_after ?? error?.headers?.['retry-after'] ?? 60);
                rateLimitUntil = Date.now() + (Number.isFinite(seconds) ? Math.max(1000, seconds * 1000 + 250) : 60000);
                return rateLimitUntil;
            }
            return Date.now() + ([401, 403, 404].includes(status) ? 300000 : 30000);
        }
        async function pumpUsers() {
            if (!active || requestBusy || pumpTimer || !requestQueue.length) return;
            const wait = Math.max(nextRequestAt, rateLimitUntil) - Date.now();
            if (wait > 0) {
                pumpTimer = later(() => { pumpTimer = undefined; void pumpUsers(); }, wait);
                return;
            }
            const job = requestQueue.shift();
            if (job.account !== accountId() || !hasGuild(job.guildId)) {
                userJobs.delete(job.key); job.finish(null); void pumpUsers(); return;
            }
            requestBusy = true;
            let timeout;
            try {
                const http = nativeHTTP();
                if (typeof http?.get !== 'function') throw new Error('Discord user lookup is not ready.');
                const cancelled = new Promise(resolve => { job.cancel = () => resolve({ cancelled: true }); });
                const expired = new Promise((_, reject) => { timeout = later(() => reject(new Error('User lookup timed out.')), 10000); });
                const response = await Promise.race([
                    Promise.resolve().then(() => http.get({ url: '/users/' + job.id })),
                    cancelled, expired,
                ]);
                if (response?.cancelled || !active || job.account !== accountId() || !hasGuild(job.guildId)) return;
                let user = response?.body;
                if (typeof user === 'string') user = safe(() => JSON.parse(user));
                if (!usableUser(user, job.id)) throw new Error('Discord returned no usable username.');
                resolvedUsers.set(job.key, user);
                if (resolvedUsers.size > 500) resolvedUsers.delete(resolvedUsers.keys().next().value);
                const dispatcher = safe(() => U.discord.common.flux.Dispatcher) || byProps('dispatch', 'subscribe');
                safe(() => dispatcher.dispatch({ type: 'USER_UPDATE', user }));
                userFailures.delete(job.key);
                job.finish(user);
            } catch (error) {
                if (active && job.account === accountId()) userFailures.set(job.key, failureDelay(error));
            } finally {
                if (timeout) { clearTimeout(timeout); timers.delete(timeout); }
                userJobs.delete(job.key); job.finish(null);
                requestBusy = false; nextRequestAt = Date.now() + 300;
                if (active) { notify(); void pumpUsers(); }
            }
        }
        function resolveUser(id, guildId, manual = false) {
            id = String(id); guildId = String(guildId);
            const account = accountId(), key = account + ':' + id, existing = cachedUser(id);
            if (usableUser(existing, id)) return Promise.resolve(existing);
            if (!active || !account || !validUserId(id) || !hasGuild(guildId)) return Promise.resolve(null);
            if (userJobs.has(key)) return userJobs.get(key).promise;
            if (rateLimitUntil > Date.now() || (!manual && (userFailures.get(key) || 0) > Date.now())) return Promise.resolve(null);
            if (userJobs.size >= 40) return Promise.resolve(null);
            let finish;
            const promise = new Promise(resolve => { finish = resolve; });
            const job = { key, id, guildId, account, promise, finish };
            userJobs.set(key, job);
            if (manual) requestQueue.unshift(job); else requestQueue.push(job);
            notify(); void pumpUsers();
            return promise;
        }
        function hydrateDetails(record) {
            if (!active || !hasGuild(record.guild_id)) return Promise.resolve([]);
            const missing = allowedEntries(record).filter(entry => entry.kind === 'user' && !entry.resolved).slice(0, 20);
            return Promise.all(missing.map(entry => resolveUser(entry.id, record.guild_id)));
        }
        function moduleTarget(module, names, depth = 0) {
            if (!module || depth > 4) return;
            if (typeof module === 'function') return { fn: module };
            for (const name of names)
                if (typeof safe(() => module[name]) === 'function') return { owner: module, key: name };
            const nested = safe(() => module.default);
            if (typeof nested === 'function') return { owner: module, key: 'default' };
            if (nested && nested !== module) return moduleTarget(nested, names, depth + 1);
        }
        function acceptProfileTarget(module) {
            const target = moduleTarget(module, ['showUserProfileActionSheet', 'showUserProfileActionSheetPostConnection']);
            if (target) profileTarget = target;
        }
        function traceProfile(stage, error) {
            if (!active) return;
            const detail = error ? ': ' + String(error.message || error)
                .replace(/https?:\/\/\S+/g, '[url]').replace(/\b[1-9]\d{16,19}\b/g, '[id]')
                .replace(/(?:mfa\.[\w-]{20,}|[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,})/g, '[redacted]').slice(0, 180) : '';
            profileTrace.push(stage + detail);
            if (profileTrace.length > 12) profileTrace.shift();
            notify();
        }
        function profileDiagnostics() {
            return 'ShowHiddenChannels 1.0.0-beta11\n' + (profileTrace.length ? profileTrace.join('\n') : 'No profile attempt recorded.');
        }
        function storeModuleId(name, props) {
            const filter = safe(() => U.discord.flux.withStoreName?.(name));
            if (filter) {
                const id = safe(() => F.lookupModule(filter)[1]);
                if (typeof id === 'number') return id;
            }
            return props ? safe(() => F.lookupModule(F.filters.withProps(...props))[1]) : undefined;
        }
        function profileDependencyPatterns() {
            const D = F.filters.withDependencies;
            if (typeof D !== 'function' || !D.ordered || !D.relative) return [];
            const logger = safe(() => U.discord.common.logger.LoggerModuleId);
            const tracker = safe(() => U.discord.common.importTracker.ImportTrackerModuleId);
            const user = storeModuleId('UserStore', ['getUser', 'getCurrentUser']);
            const patterns = [];
            if ([logger, user, tracker].every(id => typeof id === 'number')) {
                // This is the lookup used by Valenced's own plugin author profile
                // launcher in settings.plugins/utils/contacts.ts. The dependency
                // prefilter lets Metro initialise a matching, unloaded module.
                patterns.push(D.ordered([logger, user, D.relative(1), D.relative(2), D.relative(3), tracker]));
            }
            const sheet = safe(() => U.discord.actions.ActionSheetActionCreatorsModuleId)
                ?? safe(() => F.lookupModule(F.filters.withProps('hideActionSheet', 'openLazy'))[1]);
            const relationship = storeModuleId('RelationshipStore', ['isBlocked', 'isIgnored']);
            if ([logger, sheet, relationship, tracker].every(id => typeof id === 'number'))
                patterns.push(D.ordered([logger, sheet, relationship, tracker]));
            return patterns;
        }
        function loadNativeProfileTarget() {
            const D = F.filters.withDependencies, patterns = profileDependencyPatterns();
            if (!patterns.length) { traceProfile('native-loader: dependency anchors unavailable'); return; }
            for (const pattern of patterns) {
                const checks = [
                    F.filters.withName && F.filters.withName('showUserProfileActionSheet'),
                    F.filters.withProps('getUserProfileActionSheetKey'),
                    F.filters.withProps('showUserProfileActionSheetPostConnection'),
                ].filter(Boolean);
                for (const check of checks) {
                    if (typeof check.and !== 'function') continue;
                    try {
                        const [module] = F.lookupModule(check.and(D(pattern)),
                            { initialize: true, cached: false, returnNamespace: true });
                        acceptProfileTarget(module);
                        if (profileTarget) { traceProfile('native-loader: profile module initialised'); return profileTarget; }
                    } catch (error) { traceProfile('native-loader: candidate failed', error); }
                }
            }
            traceProfile('native-loader: no compatible profile module');
        }
        function nativeProfileLinkTarget() {
            const D = F.filters.withDependencies, filter = F.filters.withProps('handleClick');
            if (!D?.ordered || !D.relative || !filter.and) return;
            const tracker = safe(() => U.discord.common.importTracker.ImportTrackerModuleId);
            const channel = storeModuleId('ChannelStore', ['getChannel', 'getChannels']);
            const guild = storeModuleId('GuildStore', ['getGuild', 'getGuilds']);
            const message = storeModuleId('MessageStore', ['getMessage', 'getMessages']);
            if (![tracker, channel, guild, message].every(id => typeof id === 'number')) return;
            // Valenced's own openLink() uses this dependency fingerprint.
            const [module] = F.lookupModule(filter.and(D(D.ordered([
                D.relative(1), channel, guild, D.relative(2), message, tracker,
            ]))), { initialize: true, cached: false, returnNamespace: true });
            return moduleTarget(module, ['handleClick']);
        }
        function pathVariants(path) { return [path, '../discord_app/' + path, 'discord_app/' + path]; }
        function importedTarget(path, names) {
            const finders = safe(() => U.discord.utils.modules.finders);
            if (!finders?.lookupModuleWithImportedPath) return;
            for (const variant of pathVariants(path)) {
                const module = safe(() => finders.lookupModuleWithImportedPath(variant)[0]);
                const target = moduleTarget(module, names);
                if (target) return target;
            }
        }
        function namedTarget(name) {
            if (!F.filters.withName) return;
            // Re-check live exports on a tap; an earlier miss must not stay cached.
            const module = safe(() => F.lookupModule(F.filters.withName(name),
                { cached: false, returnNamespace: true })[0]);
            return moduleTarget(module, [name]);
        }
        function findProfileTarget() {
            if (typeof (profileTarget?.fn || profileTarget?.owner?.[profileTarget.key]) === 'function') return profileTarget;
            profileTarget = importedTarget('modules/user_profile/native/showUserProfileActionSheet.tsx',
                ['showUserProfileActionSheet', 'showUserProfileActionSheetPostConnection']);
            for (const name of ['getUserProfileActionSheetKey', 'showUserProfileActionSheet', 'showUserProfileActionSheetPostConnection']) {
                if (profileTarget) break;
                acceptProfileTarget(safe(() => F.lookupModule(F.filters.withProps(name),
                    { initialize: false, cached: false, returnNamespace: true })[0]));
            }
            profileTarget ||= namedTarget('showUserProfileActionSheet') || namedTarget('showUserProfileActionSheetPostConnection');
            profileTarget ||= loadNativeProfileTarget();
            return profileTarget;
        }
        function invokeTarget(target, ...args) {
            const fn = target?.fn || target?.owner?.[target.key];
            if (typeof fn !== 'function') throw new Error('Discord handler is unavailable.');
            return fn.apply(target.owner, args);
        }
        function profileContext(guildId) {
            // Discord derives the server member sheet from channelId. Never use
            // a hidden channel, or the selected channel from a different server.
            const usable = record => record && String(record.guild_id) === guildId
                && [0, 5].includes(Number(record.type)) && permission(record) === true;
            const selectedId = safe(() => stores.SelectedChannelStore?.getChannelId());
            const selected = safe(() => stores.ChannelStore?.getChannel(selectedId));
            if (usable(selected)) return { guildId, channelId: selected.id };
            const model = models.get(guildId);
            for (const category of safe(() => model?.getCategories()) || []) {
                for (const node of Object.values(category?.channels || {})) {
                    const record = recordOf(node);
                    if (usable(record)) return { guildId, channelId: record.id };
                }
            }
            return { guildId };
        }
        async function routeUserProfile(id, context, isCurrent) {
            let click;
            try { click = nativeProfileLinkTarget(); }
            catch (error) { traceProfile('profile-link: discovery failed', error); }
            if (click && isCurrent()) {
                try {
                    const result = await invokeTarget(click, { href: 'https://discord.com/users/' + id, ...context,
                        onConfirm: () => RN.Linking?.openURL?.('discord://-/users/' + id) });
                    if (result !== false) { traceProfile('profile-link: native click handler accepted'); return true; }
                } catch (error) { traceProfile('profile-link: native click handler failed', error); }
            }
            // handleSupportedURL uses Discord's own lazy profile import. This works
            // on first use, before showUserProfileActionSheet is in Metro's cache.
            const supported = importedTarget('modules/links/native/handleSupportedURL.tsx', ['handleSupportedURL'])
                || namedTarget('handleSupportedURL');
            if (supported && isCurrent()) {
                try {
                    const result = await invokeTarget(supported, {
                        payload: { type: constants.LinkingTypes?.USER_PROFILE || 'user-profile', userId: id, ...context },
                        safe: true, userProfileNavigationReplace: 'push',
                    });
                    if (result !== false) return true;
                } catch (error) { traceProfile('profile-link: supported URL handler failed', error); }
            }
            // The in-app URL handler recognises /users/:id. External browsing is
            // disabled for this fallback, and no inaccessible channel ID is used.
            const internalURL = importedTarget('modules/links/native/handleURL.tsx', ['handleURL'])
                || namedTarget('handleURL');
            if (internalURL && isCurrent()) {
                try {
                    const result = await invokeTarget(internalURL, 'https://discord.com/users/' + id, { allowExternal: false, ...context });
                    if (result !== false) return true;
                } catch (error) { traceProfile('profile-link: internal URL handler failed', error); }
            }
            // Last fallback: send a Discord-only URI to this app's native link
            // router. Do not fall back to a web browser or require a manual warmup.
            if (isCurrent() && typeof RN.Linking?.openURL === 'function') {
                try { await RN.Linking.openURL('discord://-/users/' + id); traceProfile('profile-link: Discord URI accepted'); return true; }
                catch (error) { traceProfile('profile-link: Discord URI rejected', error); }
            }
            return false;
        }
        async function openUserProfile(id, guildId) {
            id = String(id); guildId = String(guildId);
            if (!active || !validUserId(id) || !hasGuild(guildId)) return false;
            profileTrace = [];
            traceProfile('profile tap started');
            const account = accountId(), sequence = ++profileOpenSequence;
            const isCurrent = () => active && sequence === profileOpenSequence && account === accountId() && hasGuild(guildId);
            await resolveUser(id, guildId, true);
            if (!isCurrent()) return false;
            const context = profileContext(guildId);
            traceProfile(context.channelId ? 'server profile: accessible channel context' : 'server profile: guild context only');
            const target = findProfileTarget();
            if (target) {
                try {
                    const result = await invokeTarget(target, { userId: id, ...context }, 'stack');
                    if (result !== false) { traceProfile('native profile sheet invoked'); return true; }
                } catch (error) { traceProfile('native profile sheet failed', error); profileTarget = undefined; }
            }
            const opened = await routeUserProfile(id, context, isCurrent);
            if (!opened && isCurrent()) {
                traceProfile('all profile routes failed');
                RN.ToastAndroid?.show?.('Profile failed. Error details are in ShowHiddenChannels settings.', RN.ToastAndroid.SHORT ?? 0);
            }
            return opened;
        }
        const constants = safe(() => U.discord.common.constants.Constants) || {};
        const VIEW = constants.Permissions?.VIEW_CHANNEL ?? constants.PermissionFlags?.VIEW_CHANNEL
            ?? constants.PermissionsBits?.VIEW_CHANNEL ?? BigInt(1024);
        function permission(record) {
            if (!record?.guild_id) return undefined;
            for (const source of permissions) {
                const result = safe(() => source.can(VIEW, record));
                if (typeof result === 'boolean') return result;
            }
            return undefined;
        }
        function hasGuild(id) {
            if (!id || String(id).startsWith('@')) return false;
            const G = stores.GuildStore;
            if (typeof G?.getGuild === 'function') return Boolean(safe(() => G.getGuild(id)));
            const all = safe(() => G?.getGuilds());
            return Boolean(all instanceof Map ? all.get(id) : all?.[id]);
        }
        function recordOf(node) {
            const record = node?.record || node?.channel?.record || node?.channel || node;
            return record && typeof record.id === 'string' && record.type != null ? record : undefined;
        }
        function channelName(record) {
            if (!active || !record?.id || !hasGuild(record.guild_id)) return;
            const name = safe(() => record.name);
            // Keep the list record's original name, including Unicode or names
            // that happen to resemble an access warning. Never replace it.
            if (typeof name === 'string' && name.trim()) return name;
            // Some list records arrive without a name. Use local metadata only
            // when it identifies this exact channel in the same server.
            const cached = safe(() => stores.ChannelStore?.getChannel(record.id));
            if (String(cached?.id) !== String(record.id)
                || String(cached?.guild_id) !== String(record.guild_id)) return;
            const fallback = safe(() => cached.name);
            if (typeof fallback === 'string' && fallback.trim()) return fallback;
        }
        function isMainCategory(category) {
            const model = category?.guild;
            return Boolean(model && hasGuild(model.id) &&
                (model.noParentCategory === category || model.categories?.[category.id] === category));
        }
        function hiddenIds(category) {
            if (!active || !rendererReady || !isMainCategory(category)) return [];
            const guildId = String(category.guild.id);
            return Object.entries(category.channels || {}).filter(([, node]) => {
                const record = recordOf(node);
                return record && String(record.guild_id) === guildId && LIST_TYPES.has(Number(record.type))
                    && permission(record) === false;
            }).map(([key, node]) => String(recordOf(node)?.id || key));
        }
        function invalidate(model) {
            for (const category of Object.values(model.categories || {}).concat(model.noParentCategory || []))
                safe(() => category.invalidate?.());
            safe(() => model.invalidate?.());
        }
        function scheduleRefresh() {
            if (!active || queued) return;
            queued = true;
            Promise.resolve().then(() => {
                queued = false;
                if (!active) return;
                for (const [id, model] of models) {
                    invalidate(model);
                    if (!hasGuild(id)) models.delete(id);
                }
                safe(() => stores.ChannelListStore?.emitChange?.());
                notify();
            });
        }
        function hook(owner, key, callback) {
            let keys = patchedOwners.get(owner);
            if (!keys) { keys = new Set(); patchedOwners.set(owner, keys); }
            if (keys.has(key)) return;
            own(U.patcher.instead(owner, key, callback));
            keys.add(key);
        }
        function methodOwner(object, key) {
            for (let owner = object; owner && owner !== Object.prototype; owner = Object.getPrototypeOf(owner))
                if (Object.prototype.hasOwnProperty.call(owner, key) && typeof owner[key] === 'function') return owner;
        }
        function patchCategory(category) {
            if (!category || typeof category.getShownChannelIds !== 'function') return;
            const owner = methodOwner(category, 'getShownChannelIds');
            if (owner) hook(owner, 'getShownChannelIds', function (args, original) {
                const visible = Reflect.apply(original, this, args);
                if (!Array.isArray(visible) || this.isCollapsed) return visible;
                const hidden = hiddenIds(this);
                if (!hidden.length) return visible;
                const result = [...new Set([...visible, ...hidden])];
                const rank = new Map(visible.map((id, index) => [id, index]));
                const position = id => {
                    const record = recordOf(this.channels?.[id]);
                    return record ? Number(record.position || 0) + ([2, 13].includes(Number(record.type)) ? 10000 : 0) : 20000 + (rank.get(id) || 0);
                };
                return result.sort((a, b) => position(a) - position(b)
                    || (rank.get(a) ?? visible.length) - (rank.get(b) ?? visible.length)
                    || String(a).localeCompare(String(b)));
            });
            // Native placeholder keeps a collapsed, hidden-only category header visible.
            const emptyOwner = methodOwner(category, 'shouldShowEmptyCategory');
            if (emptyOwner) hook(emptyOwner, 'shouldShowEmptyCategory', function (args, original) {
                return hiddenIds(this).length > 0 || Reflect.apply(original, this, args);
            });
        }
        function prepareModel(model) {
            if (!active || !model || typeof model.getSections !== 'function' || !hasGuild(model.id)) return;
            const fresh = !preparedModels.has(model);
            preparedModels.add(model);
            models.set(String(model.id), model);
            for (const category of Object.values(model.categories || {}).concat(model.noParentCategory || []))
                patchCategory(category);
            if (fresh) invalidate(model);
        }
        function patchListStore(store) {
            if (!active || !store || patchedStores.has(store)) return;
            let count = 0;
            for (const key of ['getGuild', 'getGuildWithoutChangingGuildActionRows']) {
                if (typeof store[key] !== 'function') continue;
                hook(store, key, function (args, original) {
                    const result = Reflect.apply(original, this, args);
                    const model = result?.guildChannels || (typeof result?.getSections === 'function' ? result : undefined);
                    prepareModel(model);
                    if (result?.guildChannels && model?.version != null)
                        return { ...result, guildChannelsVersion: model.version };
                    return result;
                });
                count++;
            }
            if (count) {
                patchedStores.add(store);
                listReady = true;
                scheduleRefresh();
            }
        }
        function acceptStore(name, store) {
            if (!active || !store || stores[name] === store) return;
            stores[name] = store;
            if (/PermissionStore$/.test(name) && typeof store.can === 'function' && !permissions.includes(store))
                permissions.push(store);
            if (name === 'ChannelListStore') patchListStore(store);
            else if (name !== 'ChannelStore' && store.addChangeListener && !watchedStores.has(store)) {
                watchedStores.add(store);
                const listener = ['UserStore', 'GuildMemberStore', 'GuildRoleStore', 'RoleStore'].includes(name) ? notify : scheduleRefresh;
                store.addChangeListener(listener);
                own(() => store.removeChangeListener?.(listener));
            }
            scheduleRefresh();
        }
        function hiddenAt(options) {
            const model = options?.guildChannels;
            if (!active || !model || !hasGuild(model.id)) return;
            const node = safe(() => model.getChannelFromSectionRow(options.section, options.row));
            const record = recordOf(node?.channel);
            if (record && String(record.guild_id) === String(model.id)
                && LIST_TYPES.has(Number(record.type)) && permission(record) === false) return record;
        }
        function rowHeight(scale) {
            scale = Number.isFinite(Number(scale)) && Number(scale) > 0 ? Number(scale) : 1;
            return safe(() => rowConstants.getScaledChannelRowHeight(scale)) || 16 + 20 * scale + 1;
        }
        function toBits(value) {
            if (value?.bitfield != null) value = value.bitfield;
            if (typeof value === 'bigint') return value;
            if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
            if (typeof value === 'string' && /^\d+$/.test(value)) return safe(() => BigInt(value));
        }
        const bit = (value, flag) => { const bits = toBits(value); return bits === undefined ? undefined : (bits & BigInt(flag)) !== BigInt(0); };
        function overwritesOf(record) {
            const raw = record.permissionOverwrites ?? record.permission_overwrites ?? {};
            const entries = raw instanceof Map ? [...raw.entries()] : Object.entries(raw);
            return entries.filter(([, value]) => value && typeof value === 'object')
                .map(([key, value]) => ({ ...value, id: String(value.id ?? key) }));
        }
        function roleRecords(guildId, ids = []) {
            const guild = safe(() => stores.GuildStore?.getGuild(guildId));
            const found = new Map();
            function collect(raw) {
                if (!raw || typeof raw !== 'object') return;
                if (raw.roles && !raw.id) raw = raw.roles;
                const entries = raw instanceof Map ? [...raw.entries()] : Object.entries(raw);
                for (const [key, value] of entries) if (value && typeof value === 'object') {
                    const id = String(value.id ?? key);
                    if (value.name != null || value.permissions != null) found.set(id, value.id ? value : { ...value, id });
                }
            }
            collect(guild?.roles);
            for (const source of [stores.RoleStore, stores.GuildRoleStore]) {
                // Discord's Libdiscore role store no longer exposes getRoles().
                for (const key of ['getRoles', 'getUnsafeMutableRoles', 'getSortedRoles', 'getRolesSnapshot'])
                    if (typeof source?.[key] === 'function') collect(safe(() => source[key](guildId)));
                for (const id of new Set([String(guildId), ...ids.map(String)])) {
                    const role = safe(() => source?.getRole?.(guildId, id));
                    if (role && String(role.id) === id) found.set(id, role);
                }
            }
            return [...found.values()];
        }
        function roleColor(role) {
            if (typeof role?.colorString === 'string' && /^#[0-9a-f]{6}$/i.test(role.colorString)) return role.colorString;
            const color = Number(role?.colors?.primaryColor ?? role?.colors?.primary_color ?? role?.color);
            return Number.isInteger(color) && color > 0 && color <= 0xffffff ? '#' + color.toString(16).padStart(6, '0') : '#a7b1c2';
        }
        function avatarSources(user, member, guildId) {
            if (!user) return [];
            const sources = [], keys = new Set();
            const add = value => {
                const source = typeof value === 'string' && /^https:\/\//i.test(value) ? { uri: value }
                    : typeof value === 'number' && value > 0 ? value
                    : value && typeof value.uri === 'string' && /^https:\/\//i.test(value.uri) ? { uri: value.uri } : null;
                if (source == null) return;
                const key = typeof source === 'number' ? 'asset:' + source : source.uri;
                if (!keys.has(key)) { keys.add(key); sources.push({ key, source }); }
            };
            const hash = value => typeof value === 'string' && /^(a_)?[0-9a-f]{16,64}$/i.test(value) ? value : null;
            const memberAvatar = hash(member?.avatar ?? member?.avatarHash);
            if (memberAvatar) add('https://cdn.discordapp.com/guilds/' + guildId + '/users/' + user.id + '/avatars/' + memberAvatar + '.png?size=64');
            add(safe(() => user.getAvatarURL?.(guildId, 64)));
            const avatar = hash(user.avatar ?? user.avatarHash);
            if (avatar) add('https://cdn.discordapp.com/avatars/' + user.id + '/' + avatar + '.png?size=64');
            add(safe(() => user.getAvatarURL?.(undefined, 64)));
            if (validUserId(String(user.id))) {
                const discriminator = Number(user.discriminator);
                const index = discriminator > 0 ? discriminator % 5 : Number((BigInt(user.id) >> BigInt(22)) % BigInt(6));
                add('https://cdn.discordapp.com/embed/avatars/' + index + '.png');
            }
            return sources;
        }
        function UserAvatar({ entry }) {
            const [failed, setFailed] = React.useState([]);
            const avatar = entry.avatars.find(value => !failed.includes(value.key));
            const style = { width: 26, height: 26, borderRadius: 13, marginRight: 7 };
            if (avatar && RN.Image) return h(RN.Image, { key: avatar.key, source: avatar.source,
                style, resizeMode: 'cover', accessible: false,
                onError: () => setFailed(previous => previous.includes(avatar.key) ? previous : [...previous, avatar.key]) });
            return h(RN.View, { accessible: false, style: { ...style, backgroundColor: entry.color,
                alignItems: 'center', justifyContent: 'center' } },
                h(RN.Text, { style: { color: '#fff', fontSize: 12, fontWeight: '700' } }, entry.name.slice(0, 1).toUpperCase()));
        }
        function allowedEntries(record) {
            const guildId = String(record.guild_id), guild = safe(() => stores.GuildStore?.getGuild(guildId));
            const overrides = overwritesOf(record);
            const allRoles = new Map(roleRecords(guildId, overrides.map(o => o.id)).map(role => [String(role.id), role]));
            const isRole = o => o.type === 0 || o.type === '0' || o.type === 'role';
            const isMember = o => o.type === 1 || o.type === '1' || o.type === 'member';
            const roleOverrides = new Map(overrides.filter(isRole).map(o => [o.id, o]));
            const everyone = allRoles.get(guildId), everyoneOverwrite = roleOverrides.get(guildId);
            const applyView = (value, overwrite) => {
                if (bit(overwrite?.deny, 1024) === true) value = false;
                if (bit(overwrite?.allow, 1024) === true) value = true;
                return value;
            };
            const canRoleView = role => {
                if (bit(role?.permissions, 8) === true || bit(everyone?.permissions, 8) === true) return true;
                const baseEveryone = bit(everyone?.permissions, 1024), baseRole = bit(role?.permissions, 1024);
                let value = baseEveryone === true || baseRole === true ? true
                    : baseEveryone === false && baseRole === false ? false : undefined;
                value = applyView(value, everyoneOverwrite);
                if (String(role.id) !== guildId) value = applyView(value, roleOverrides.get(String(role.id)));
                return value === true;
            };
            // Explicit role allows remain useful even when the role's name is not cached.
            for (const [id, overwrite] of roleOverrides)
                if (!allRoles.has(id) && bit(overwrite.allow, 1024) === true)
                    allRoles.set(id, { id, name: id === guildId ? '@everyone' : 'Role ' + id });
            let roles = [...allRoles.values()].filter(canRoleView);
            if (everyone && canRoleView(everyone)) roles = [everyone];
            roles.sort((a, b) => Number(b.position || 0) - Number(a.position || 0) || String(a.id).localeCompare(String(b.id)));
            const users = new Map();
            const addUser = id => {
                if (!id) return;
                id = String(id);
                const user = cachedUser(id);
                const member = safe(() => stores.GuildMemberStore?.getMember(guildId, id));
                const nick = safe(() => stores.GuildMemberStore?.getNick?.(guildId, id)) || member?.nick;
                users.set(id, { id, kind: 'user', name: nick || user?.globalName || user?.global_name
                    || user?.username || (userJobs.has(userKey(id)) ? 'Loading user…' : 'User ' + id),
                    username: user?.username, resolved: Boolean(usableUser(user, id)), color: '#8798ff',
                    avatars: avatarSources(user, member, guildId) });
            };
            addUser(guild?.ownerId ?? guild?.owner_id);
            for (const overwrite of overrides)
                if (isMember(overwrite) && bit(overwrite.allow, 1024) === true) addUser(overwrite.id);
            return [...users.values(), ...roles.map(role => ({ id: String(role.id), kind: 'role',
                name: String(role.id) === guildId ? '@everyone' : role.name || 'Role ' + role.id, color: roleColor(role) }))];
        }
        function snowflakeTime(id) {
            if (typeof id !== 'string' || !/^\d{15,25}$/.test(id)) return;
            const value = safe(() => Number(BigInt(id) >> BigInt(22)) + 1420070400000);
            return Number.isFinite(value) && value >= 1420070400000 && value <= 8640000000000000 ? value : undefined;
        }
        function formatTime(value) {
            if (value == null || value === '') return 'Unavailable';
            const date = new Date(value);
            return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined,
                { day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Unavailable';
        }
        function duration(value) {
            if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return;
            let seconds = Math.floor(Number(value));
            if (seconds === 0) return 'Off';
            const parts = [];
            for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]]) {
                const count = Math.floor(seconds / size);
                if (count) { parts.push(count + ' ' + unit + (count === 1 ? '' : 's')); seconds %= size; }
            }
            return parts.join(' ');
        }
        function channelInfo(record) {
            const rows = [], type = Number(record.type), voice = [2, 13].includes(type), forum = [15, 16].includes(type);
            const field = (camel, snake) => record[camel] !== undefined ? record[camel] : record[snake];
            const add = (label, value) => { if (value !== undefined && value !== null && value !== '') rows.push({ label, value: String(value) }); };
            const numeric = (value, positive = false) => value != null && value !== '' && Number.isFinite(Number(value))
                && Number(value) >= (positive ? 1 : 0);
            add('Channel created', snowflakeTime(String(record.id)) == null ? undefined : formatTime(snowflakeTime(String(record.id))));
            const nsfw = typeof record.nsfw === 'boolean' ? record.nsfw : safe(() => record.isNSFW?.());
            if (nsfw === true) add('Age restriction', '18+');
            if (!voice) {
                add('Slowmode', duration(field('rateLimitPerUser', 'rate_limit_per_user')));
                add('Thread slowmode', duration(field('defaultThreadRateLimitPerUser', 'default_thread_rate_limit_per_user')));
                const minutes = field('defaultAutoArchiveDuration', 'default_auto_archive_duration');
                if (numeric(minutes, true)) add(forum ? 'Archive inactive posts after' : 'Archive inactive threads after', duration(Number(minutes) * 60));
            }
            if (voice) {
                if (numeric(record.bitrate, true)) add('Bitrate', Number(record.bitrate) / 1000 + ' kbps');
                const limit = field('userLimit', 'user_limit');
                if (numeric(limit)) add('User limit', Number(limit) === 0 ? 'No limit' : limit);
                const region = field('rtcRegion', 'rtc_region');
                if (region !== undefined) add('Voice region', region || 'Automatic');
                const quality = Number(field('videoQualityMode', 'video_quality_mode'));
                add('Video quality', ({ 1: 'Automatic', 2: '720p' })[quality]);
            }
            if (forum) {
                const layout = field('defaultForumLayout', 'default_forum_layout');
                if (layout != null) add('Default layout', ({ 0: 'Not set', 1: 'List', 2: 'Gallery' })[Number(layout)]);
                const order = field('defaultSortOrder', 'default_sort_order');
                if (order != null) add('Sort posts by', ({ 0: 'Latest activity', 1: 'Creation date' })[Number(order)]);
                const reaction = field('defaultReactionEmoji', 'default_reaction_emoji');
                add('Default reaction', reaction?.emojiName ?? reaction?.emoji_name
                    ?? ((reaction?.emojiId ?? reaction?.emoji_id) ? 'Custom emoji ' + (reaction.emojiId ?? reaction.emoji_id) : undefined));
                const required = bit(record.flags, 16);
                if (required !== undefined) add('Tags required', required ? 'Yes' : 'No');
            }
            const rawTags = forum ? field('availableTags', 'available_tags') : [];
            const tags = Array.isArray(rawTags) ? rawTags.filter(tag => tag && typeof tag.name === 'string').map(tag => ({
                id: String(tag.id ?? tag.name), name: tag.name,
                moderated: tag.moderated === true,
                emoji: tag.emojiName ?? tag.emoji_name ?? '',
            })) : [];
            return { rows, tags };
        }
        function permissionLabels(value) {
            const bits = toBits(value);
            if (bits === undefined) return ['Unavailable'];
            const labels = []; let known = BigInt(0);
            for (const [position, label] of PERMISSION_NAMES) {
                const mask = BigInt(1) << BigInt(position); known |= mask;
                if ((bits & mask) !== BigInt(0)) labels.push(label);
            }
            const other = bits & ~known;
            if (other !== BigInt(0)) labels.push('Other permission flags (0x' + other.toString(16) + ')');
            return labels.length ? labels : ['None'];
        }
        function permissionDetails(record) {
            const guildId = String(record.guild_id), overwrites = overwritesOf(record);
            const roles = new Map(roleRecords(guildId, overwrites.map(o => o.id)).map(role => [String(role.id), role]));
            return overwrites.map(overwrite => {
                const userEntry = overwrite.type === 1 || overwrite.type === '1' || overwrite.type === 'member';
                const user = userEntry ? cachedUser(overwrite.id) : undefined;
                const role = roles.get(overwrite.id);
                const nick = userEntry ? safe(() => stores.GuildMemberStore?.getNick?.(guildId, overwrite.id))
                    || safe(() => stores.GuildMemberStore?.getMember(guildId, overwrite.id))?.nick : undefined;
                return { id: overwrite.id, kind: userEntry ? 'user' : 'role',
                    name: userEntry ? nick || user?.globalName || user?.global_name || user?.username || 'User ' + overwrite.id
                        : overwrite.id === guildId ? '@everyone' : role?.name || 'Role ' + overwrite.id,
                    allow: permissionLabels(overwrite.allow), deny: permissionLabels(overwrite.deny) };
            }).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
        }
        function detailsOf(record) {
            return {
                lastMessage: formatTime(snowflakeTime(record.lastMessageId ?? record.last_message_id)),
                lastPin: formatTime(record.lastPinTimestamp ?? record.last_pin_timestamp),
                entries: allowedEntries(record),
                info: channelInfo(record),
            };
        }
        function rootNavigation() {
            const module = byProps('getRootNavigationRef') || safe(() => U.discord.modules.mainTabsV2.RootNavigationRef);
            return safe(() => module.getRootNavigationRef());
        }
        function openLockScreen(record) {
            if (!active || !hasGuild(record.guild_id) || permission(record) !== false) return false;
            const navigation = rootNavigation();
            if (!screenRouteReady || !navigation?.navigate || navigation.isReady?.() === false) return false;
            const state = safe(() => navigation.getRootState());
            if (Array.isArray(state?.routeNames) && !state.routeNames.includes(screenRoute)) return false;
            const previous = openedChannel;
            // The routed screen must receive the same list record as the modal.
            // A second ChannelStore lookup can discard its working name/topic.
            openedChannel = { record, account: accountId() };
            try {
                navigation.navigate(screenRoute, { channelId: record.id, guildId: String(record.guild_id) });
                return true;
            } catch (_) { openedChannel = previous; return false; }
        }
        function LockArt() {
            return h(RN.View, { accessible: false, style: { width: 180, height: 184, marginBottom: 16, alignItems: 'center' } },
                h(RN.View, { style: { position: 'absolute', top: 8, width: 87, height: 105, borderWidth: 13,
                    borderColor: '#5278ff', borderTopLeftRadius: 48, borderTopRightRadius: 48, borderBottomWidth: 0 } }),
                h(RN.View, { style: { position: 'absolute', top: 75, width: 145, height: 108, borderRadius: 12,
                    backgroundColor: '#ffd622', borderTopWidth: 10, borderTopColor: '#ffec58', borderRightWidth: 12, borderRightColor: '#f5aa08',
                    borderBottomWidth: 10, borderBottomColor: '#ffbb0a', alignItems: 'center', justifyContent: 'center' } },
                    h(RN.View, { style: { width: 18, height: 18, backgroundColor: '#3b244a', borderRadius: 10, marginTop: -2 } }),
                    h(RN.View, { style: { width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10,
                        borderBottomWidth: 22, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#3b244a', marginTop: -3 } })),
                h(RN.Text, { style: { position: 'absolute', top: 24, left: 1, color: '#9e82ff', fontSize: 27 } }, '✦'),
                h(RN.Text, { style: { position: 'absolute', top: 40, right: -5, color: '#40dfb2', fontSize: 25 } }, '✦'),
                h(RN.Text, { style: { position: 'absolute', bottom: 36, right: -7, color: '#dc78ed', fontSize: 22 } }, '•'));
        }
        function LockScreenContent({ record, onBack, onUserPress }) {
            const [, update] = React.useState(revision), [expanded, setExpanded] = React.useState(settings.rolesExpanded);
            const [infoExpanded, setInfoExpanded] = React.useState(true), [permissionsExpanded, setPermissionsExpanded] = React.useState(false);
            const [query, setQuery] = React.useState('');
            React.useEffect(() => { subscribers.add(update); return () => subscribers.delete(update); }, []);
            const available = active && record && hasGuild(record.guild_id) && permission(record) === false;
            const name = available ? channelName(record) : undefined;
            React.useEffect(() => { if (available) void hydrateDetails(record); }, [record?.id, record?.guild_id, Boolean(available)]);
            React.useEffect(() => { setExpanded(settings.rolesExpanded); setQuery(''); setPermissionsExpanded(false); }, [record?.id, record?.guild_id]);
            const detail = available ? detailsOf(record) : null;
            const search = query.trim().toLowerCase();
            const entries = detail?.entries.filter(entry => !search || [entry.name, entry.username, entry.id]
                .some(value => String(value || '').toLowerCase().includes(search))) || [];
            const Gradient = gradientModule?.default;
            const type = TYPES[record?.type]?.toLowerCase() || 'server';
            const text = (value, style = {}, props = {}) => h(RN.Text, { style: { color: '#f4f4fa', textAlign: 'center', ...style }, ...props }, value);
            const section = (label, open, toggle) => h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: label,
                accessibilityState: { expanded: open }, onPress: toggle,
                style: { width: '100%', minHeight: 46, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 } },
                text(label + '  ' + (open ? '⌃' : '⌄'), { fontSize: 18, fontWeight: '700', lineHeight: 26 }));
            const button = (label, action) => h(RN.Pressable, { key: label, accessibilityRole: 'button', accessibilityLabel: label,
                onPress: action, style: { paddingHorizontal: 16, paddingVertical: 12, margin: 4, minHeight: 44,
                    borderRadius: 10, borderWidth: 1, borderColor: '#8798ff88', backgroundColor: '#202b40b8' } },
                text(label, { fontSize: 14, fontWeight: '600' }));
            const back = h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Back to server', onPress: onBack,
                style: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 8 } },
                text('‹', { fontSize: 38, lineHeight: 40 }));
            return h(RN.View, { style: { flex: 1, backgroundColor: '#20212b' } },
                Gradient ? h(Gradient, { absolute: true, wide: true, tall: true }) : null,
                h(RN.View, { pointerEvents: 'none', style: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(13,16,24,0.48)' } }),
                h(RN.SafeAreaView || RN.View, { style: { flex: 1 } },
                    h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minHeight: 52, borderBottomWidth: 1, borderBottomColor: '#ffffff16' } },
                        back, text(name ? '# ' + name : 'Hidden channel', { fontSize: 18, fontWeight: '600', textAlign: 'left', flex: 1 }, { numberOfLines: 1 })),
                    h(RN.ScrollView, { style: { flex: 1 }, keyboardShouldPersistTaps: 'handled',
                        contentContainerStyle: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: settings.compactScreen ? 16 : 32, justifyContent: 'center' } },
                        h(RN.View, { style: { width: '100%', maxWidth: 820, alignSelf: 'center', alignItems: 'center' } },
                            settings.compactScreen ? text('🔒', { fontSize: 44, marginBottom: 8 }) : h(LockArt),
                            text(available ? 'This is a hidden ' + type + ' channel' : 'Channel details unavailable',
                                { fontSize: 27, lineHeight: 34, fontWeight: '800', marginTop: 16, marginBottom: 18 }),
                            text(available ? [2, 13].includes(Number(record.type)) ? 'You cannot join this channel.'
                                : 'You cannot see the ' + (Number(record.type) === 15 ? 'posts' : 'messages') + ' of this channel.'
                                : 'Return to the server to refresh this channel.', { fontSize: 17, lineHeight: 25, marginBottom: 20 }),
                            available ? h(React.Fragment, null,
                                text('Last ' + (Number(record.type) === 15 ? 'post' : 'message') + ' created: ' + detail.lastMessage,
                                    { fontSize: 15, lineHeight: 23, marginBottom: 8 }, { selectable: true }),
                                text('Last message pin: ' + detail.lastPin, { fontSize: 15, lineHeight: 23, marginBottom: 26 }, { selectable: true }),
                                record.topic ? text(record.topic, { fontSize: 15, lineHeight: 23, marginBottom: 24 }, { selectable: true }) : null,
                                settings.showDetails && (detail.info.rows.length > 0 || detail.info.tags.length > 0) ? h(React.Fragment, null,
                                    section('Channel details', infoExpanded, () => setInfoExpanded(!infoExpanded)),
                                    infoExpanded ? h(RN.View, { style: { width: '100%', padding: 14, marginBottom: 10, borderRadius: 12, backgroundColor: '#172033b8' } },
                                        ...detail.info.rows.map(row => h(RN.View, { key: row.label,
                                            style: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 6, justifyContent: 'space-between' } },
                                            text(row.label, { fontSize: 14, lineHeight: 21, textAlign: 'left', color: '#c1c8da', flexGrow: 1, paddingRight: 12 }),
                                            text(row.value, { fontSize: 14, lineHeight: 21, textAlign: 'left', flexShrink: 1 }, { selectable: true }))),
                                        detail.info.tags.length ? h(RN.View, { style: { marginTop: 8 } },
                                            text('Available tags', { fontSize: 14, textAlign: 'left', color: '#c1c8da', marginBottom: 6 }),
                                            h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap' } },
                                                ...detail.info.tags.map(tag => h(RN.View, { key: tag.id,
                                                    style: { backgroundColor: '#8798ff22', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, margin: 3 } },
                                                    text((tag.emoji ? tag.emoji + ' ' : '') + tag.name + (tag.moderated ? ' · moderator only' : ''), { fontSize: 13 }))))) : null) : null) : null,
                                h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Allowed users and roles',
                                    accessibilityState: { expanded }, onPress: () => setExpanded(!expanded),
                                    style: { paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10 } },
                                    text('Allowed users and roles: ' + detail.entries.length + '  ' + (expanded ? '⌃' : '⌄'), { fontSize: 19, fontWeight: '700', lineHeight: 26 })),
                                expanded && RN.TextInput && (detail.entries.length > 8 || query) ? h(RN.TextInput, {
                                    accessibilityLabel: 'Search allowed users and roles', placeholder: 'Search name, username or ID',
                                    placeholderTextColor: '#aeb7cc', value: query, onChangeText: setQuery, autoCorrect: false, autoCapitalize: 'none',
                                    style: { width: '100%', color: '#f4f4fa', backgroundColor: '#172033b8', paddingHorizontal: 14,
                                        paddingVertical: 10, minHeight: 44, borderRadius: 10, marginBottom: 10 } }) : null,
                                expanded ? h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', width: '100%' } },
                                    ...entries.map(entry => h(entry.kind === 'user' ? RN.Pressable : RN.View, { key: entry.kind + ':' + entry.id,
                                        ...(entry.kind === 'user' ? { accessibilityRole: 'button', accessibilityLabel: 'Open profile: ' + entry.name,
                                            onPress: () => { if (onUserPress) onUserPress(entry.id); else void openUserProfile(entry.id, record.guild_id); },
                                            onLongPress: () => copyValue(entry.id, 'User ID'), accessibilityHint: 'Tap for profile. Hold to copy user ID.' } : {}),
                                        style: { flexDirection: 'row', alignItems: 'center', minHeight: 34, borderRadius: 9,
                                            borderWidth: 1, borderColor: entry.color + '99', backgroundColor: '#202b40b8', paddingVertical: 6, paddingHorizontal: 10, margin: 4, maxWidth: '100%' } },
                                        entry.kind === 'user' ? h(UserAvatar, { entry }) : h(RN.View, { style: { width: 10, height: 10,
                                            borderRadius: 5, backgroundColor: entry.color, marginRight: 7 } }),
                                        h(RN.View, { style: { flexShrink: 1 } },
                                            text(entry.name, { fontSize: 14, lineHeight: 19, flexShrink: 1 }, { numberOfLines: 2 }),
                                            entry.kind === 'user' && entry.username && entry.username !== entry.name
                                                ? text('@' + entry.username, { fontSize: 11, lineHeight: 15, color: '#bbc5df', marginTop: 1 }) : null))),
                                    !entries.length ? text(search ? 'No matching users or roles.' : 'No user or role details are available.', { fontSize: 14, color: '#c0c3d2', marginTop: 4 }) : null) : null,
                                section('Permission details', permissionsExpanded, () => setPermissionsExpanded(!permissionsExpanded)),
                                permissionsExpanded ? h(RN.View, { style: { width: '100%' } },
                                    text('Channel overrides only. Server permissions and other roles also affect access.',
                                        { fontSize: 12, lineHeight: 18, color: '#b8bdcf', marginBottom: 10 }),
                                    ...permissionDetails(record).map(rule => h(RN.View, { key: rule.kind + ':' + rule.id,
                                        style: { padding: 14, marginBottom: 8, borderRadius: 12, backgroundColor: '#172033b8' } },
                                        text(rule.name, { fontSize: 15, fontWeight: '700', textAlign: 'left', marginBottom: 6 }, { selectable: true }),
                                        text('Allowed: ' + rule.allow.join(', '), { color: '#a7e1c4', fontSize: 13, lineHeight: 20, textAlign: 'left' }, { selectable: true }),
                                        text('Denied: ' + rule.deny.join(', '), { color: '#ffb6bc', fontSize: 13, lineHeight: 20, textAlign: 'left', marginTop: 4 }, { selectable: true }),
                                        text(rule.kind + ' ID: ' + rule.id, { color: '#aeb7cc', fontSize: 11, textAlign: 'left', marginTop: 8 }, { selectable: true }))),
                                    !overwritesOf(record).length ? text('No channel overrides are available.', { color: '#b8bdcf', fontSize: 14 }) : null) : null,
                                h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 } },
                                    button('Copy channel ID', () => copyValue(record.id, 'Channel ID')),
                                    button('Copy channel link', () => copyValue('https://discord.com/channels/' + record.guild_id + '/' + record.id, 'Channel link'))),
                                text('Channel ID: ' + record.id, { fontSize: 12, color: '#b8bdcf', marginTop: 28 }, { selectable: true })) : null))));
        }
        function HiddenChannelScreen({ route, navigation }) {
            const params = route?.params;
            const saved = openedChannel && String(openedChannel.record.id) === String(params?.channelId)
                && String(openedChannel.record.guild_id) === String(params?.guildId) ? openedChannel : undefined;
            const record = saved ? saved.account === accountId() ? saved.record : undefined
                : safe(() => stores.ChannelStore?.getChannel(params?.channelId));
            const valid = record && String(record.guild_id) === String(route?.params?.guildId);
            React.useEffect(() => { navigation?.setOptions?.({ headerShown: false }); }, [navigation]);
            return h(LockScreenContent, { record: valid ? record : undefined,
                onBack: () => (navigation || rootNavigation())?.goBack?.() });
        }
        function registerLockScreen() {
            const settings = safe(() => U.discord.modules.settings);
            if (!settings?.registerSettingsItem || !settings.onSettingsModulesLoaded) return;
            own(settings.onSettingsModulesLoaded(() => {
                if (!active || screenRouteReady) return;
                const unregister = settings.registerSettingsItem(screenRoute, {
                    type: 'route', parent: null, unsearchable: true, useTitle: () => 'Hidden channel',
                    screen: { route: screenRoute, getComponent: () => HiddenChannelScreen },
                });
                screenRouteReady = true;
                own(() => { unregister(); screenRouteReady = false; settings.refreshSettings(); });
                settings.refreshSettings();
            }));
        }
        function LockedChannelRow({ record }) {
            const [fullScreen, setFullScreen] = React.useState(false);
            const light = RN.useColorScheme?.() === 'light';
            const name = channelName(record) || 'Name unavailable';
            const colors = { text: light ? '#636675' : '#a8aabb', lock: light ? '#777988' : '#9497a8' };
            const icon = [2, 13].includes(Number(record.type)) ? '◖))' : Number(record.type) === 15 ? '▤' : '#';
            return h(React.Fragment, null, h(RN.Pressable, {
                accessibilityRole: 'button', accessibilityLabel: 'Hidden ' + (TYPES[record.type] || 'channel') + ': ' + name,
                onPress: () => { if (active && hasGuild(record.guild_id) && permission(record) === false && !openLockScreen(record)) setFullScreen(true); },
                style: { height: rowHeight(RN.PixelRatio?.getFontScale?.() || 1), marginHorizontal: 8,
                    paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', borderRadius: 8 },
            }, h(RN.Text, { style: { color: colors.lock, fontSize: 23, width: 28, textAlign: 'center', marginRight: 5 } }, icon),
                h(RN.Text, { numberOfLines: 1, ellipsizeMode: 'tail',
                    style: { color: colors.text, fontSize: 16, flex: 1, minWidth: 0 } }, name),
                h(RN.Text, { style: { color: colors.lock, fontSize: 12, marginLeft: 6 } }, '🔒')),
                fullScreen && active && RN.Modal ? h(RN.Modal, {
                    visible: true, transparent: false, animationType: 'slide', presentationStyle: 'fullScreen',
                    onRequestClose: () => setFullScreen(false),
                }, h(LockScreenContent, { record, onBack: () => setFullScreen(false),
                    onUserPress: id => {
                        setFullScreen(false);
                        // Dismiss the native modal before opening Discord's profile sheet.
                        later(() => { void openUserProfile(id, record.guild_id); }, 350);
                    } })) : null);
        }
        function patchRenderer(module) {
            if (!active || !module || renderModules.has(module)
                || typeof module.renderChannelListItem !== 'function' || typeof module.getChannelListItemSize !== 'function') return;
            // FastList and LegendList both use these renderer and measurement exports.
            hook(module, 'renderChannelListItem', function (args, original) {
                const record = hiddenAt(args[0]);
                return record ? h(LockedChannelRow, { key: record.id, record }) : Reflect.apply(original, this, args);
            });
            hook(module, 'getChannelListItemSize', function (args, original) {
                return hiddenAt(args[0]) ? rowHeight(args[0].fontScale) : Reflect.apply(original, this, args);
            });
            renderModules.add(module);
            rendererReady = true;
            scheduleRefresh();
        }
        function watch(props, callback) {
            const initial = byProps(...props);
            if (initial) callback(initial);
            own(F.getModules(F.filters.withProps(...props), value => { if (active) callback(value); }));
        }
        function watchPath(path, callback) {
            const finders = safe(() => U.discord.utils.modules.finders);
            if (finders?.getModuleWithImportedPath)
                own(finders.getModuleWithImportedPath(path, value => { if (active) callback(value); }));
        }
        // Named stores and import paths work when Discord loads the server UI lazily.
        watch(['renderChannelListItem', 'getChannelListItemSize'], patchRenderer);
        watch(['getScaledChannelRowHeight'], value => { rowConstants = value; scheduleRefresh(); });
        watchPath('modules/channel_list_v2/native/renderRedesignChannelListItem.tsx', patchRenderer);
        watchPath('modules/channel_list_v2/native/RedesignChannelListConstants.tsx', value => { rowConstants = value; scheduleRefresh(); });
        watchPath('modules/guild_sidebar/ChannelListStore.tsx', value => acceptStore('ChannelListStore', value.default || value));
        for (const name of ['GuildStore', 'ChannelStore', 'PermissionStore', 'ChannelPermissionStore', 'ChannelListStore',
            'GuildRoleStore', 'RoleStore', 'UserStore', 'GuildMemberStore', 'AuthenticationStore', 'SelectedChannelStore']) {
            const store = safe(() => U.discord.flux.Stores[name]);
            if (store) acceptStore(name, store);
            if (U.discord.flux.getStore) own(U.discord.flux.getStore(name, value => acceptStore(name, value)));
        }
        const fallback = byProps('can', 'canManageUser') || byProps('can', 'hasChannelPermission');
        if (fallback && !permissions.includes(fallback)) permissions.push(fallback);
        watch(['CustomThemedGradient', 'validateColors'], module => { gradientModule = module; notify(); });
        watchPath('modules/client_themes/native/ThemedGradient.tsx', module => { gradientModule = module; notify(); });
        watchPath('stores/GuildRoleStore.tsx', module => acceptStore('GuildRoleStore', module.default || module));
        watchPath('stores/UserStore.tsx', module => acceptStore('UserStore', module.default || module));
        for (const path of pathVariants('modules/user_profile/native/showUserProfileActionSheet.tsx')) watchPath(path, acceptProfileTarget);
        watch(['getUserProfileActionSheetKey'], acceptProfileTarget);
        watch(['showUserProfileActionSheetPostConnection'], acceptProfileTarget);
        registerLockScreen();

        function Settings() {
            const [, update] = React.useState(revision);
            React.useEffect(() => { subscribers.add(update); return () => subscribers.delete(update); }, []);
            const light = RN.useColorScheme?.() === 'light';
            const color = light ? '#3d3e49' : '#d8d9e2';
            const ready = rendererReady && listReady;
            const toggle = (key, label, description) => h(RN.Pressable, {
                key, accessibilityRole: 'switch', accessibilityLabel: label, accessibilityState: { checked: settings[key] },
                onPress: () => setSetting(key, !settings[key]),
                style: { padding: 14, borderRadius: 12, backgroundColor: light ? '#e7e9f0' : '#202b40', marginBottom: 10 } },
                h(RN.Text, { style: { color, fontSize: 16, fontWeight: '600' } }, label + ' · ' + (settings[key] ? 'On' : 'Off')),
                h(RN.Text, { style: { color, opacity: 0.8, lineHeight: 20, marginTop: 4 } }, description));
            return h(RN.ScrollView, { contentContainerStyle: { padding: 20 } },
                h(RN.Text, { style: { color, fontSize: 22, fontWeight: '700', marginBottom: 14 } }, 'ShowHiddenChannels'),
                h(RN.Text, { style: { color, lineHeight: 22, marginBottom: 14 } },
                    'Hidden channels appear inside each server’s normal channel list. Tap a locked row for a full lock screen, available timestamps, and allowed user and role details.'),
                h(RN.Text, { style: { color, lineHeight: 22, marginBottom: 14 } },
                    ready ? 'Server channel list integration is ready.' : 'Open a server, then restart Discord if the channel list is not ready.'),
                toggle('compactScreen', 'Compact lock screen', 'Use a smaller lock so channel information fits more easily.'),
                toggle('showDetails', 'Show channel details', 'Show available slowmode, voice settings, forum tags and channel creation time.'),
                toggle('rolesExpanded', 'Expand users and roles by default', 'Choose how the list starts when opening a channel.'),
                h(RN.Text, { style: { color, lineHeight: 22 } },
                    'Only channel metadata already received by your app can be shown. Messages and attachments remain unavailable. Restart Discord after installing or updating.'),
                h(RN.Text, { selectable: true, style: { color, fontSize: 13, lineHeight: 20, marginTop: 24 } }, profileDiagnostics()),
                h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Copy profile diagnostics',
                    onPress: () => {
                        const clipboard = safe(() => U.externals.ReactNativeClipboard.Clipboard);
                        clipboard?.setString?.(profileDiagnostics());
                    }, style: { paddingVertical: 14 } },
                    h(RN.Text, { style: { color: '#aab7ff', fontSize: 15 } }, 'Copy profile diagnostics')));
        }
        function dispose() {
                if (!active) return;
                const navigation = rootNavigation();
                if (navigation?.getCurrentRoute?.()?.name === screenRoute) safe(() => navigation.goBack());
                active = false;
                openedChannel = undefined;
                profileOpenSequence++;
                for (const timer of timers) clearTimeout(timer);
                timers.clear(); pumpTimer = undefined;
                for (const job of userJobs.values()) { job.cancel?.(); job.finish(null); }
                userJobs.clear(); requestQueue.length = 0; resolvedUsers.clear(); userFailures.clear();
                for (const remove of disposers.reverse()) safe(remove);
                for (const model of models.values()) invalidate(model);
                safe(() => stores.ChannelListStore?.emitChange?.());
                notify();
                models.clear(); subscribers.clear(); disposers.length = 0;
        }
        return {
            permission, hiddenIds, prepareModel, hiddenAt, rowHeight, Settings, dispose,
            detailsOf, allowedEntries, snowflakeTime, openLockScreen, LockScreenContent,
            resolveUser, hydrateDetails, openUserProfile, roleRecords,
            profileDiagnostics, channelInfo, permissionDetails, permissionLabels, duration, setSetting,
            get ready() { return rendererReady && listReady; },
        };
    }
    return { default: {
        jsonStorage: { load: true, default: { ...DEFAULT_SETTINGS } },
        start(api) {
            runtime?.dispose();
            const instance = createRuntime(api);
            runtime = instance;
            api.cleanup(() => { instance.dispose(); if (runtime === instance) runtime = null; });
        },
        stop({ plugin } = {}) { runtime?.dispose(); runtime = null; plugin?.requireReload?.(); },
        SettingsComponent({ api }) {
            const { React, ReactNative: RN } = api.unscoped.react;
            return runtime ? React.createElement(runtime.Settings)
                : React.createElement(RN.Text, { style: { padding: 20 } }, 'Enable ShowHiddenChannels and restart Discord.');
        },
    } };
})()
