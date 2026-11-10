// SPDX-License-Identifier: GPL-3.0-or-later
import { createServerFilter } from './servers.js';
import { createMessageFilter } from './filter.js';
import { createMentionFilter } from './mentions.js';
import { createCollectionFilter } from './collection.js';
import { createPagination } from './pagination.js';
import { createGuildIconFilter } from './guild-icons.js';
import { installHiddenPings } from './notifications.js';
import { installChannelLists } from './channel-lists.js';
import { isUserWhitelisted } from './whitelist.js';

export function createDesktopRuntime(env, storage) {
    let active = false, searchDepth = 0, rawDepth = 0, timer;
    let filter, mentions, lists, paging, pings, channels, servers;
    let messageViews = new WeakMap(), iconViews = new WeakMap();
    const cleanup = [], patched = new WeakMap(), iconStores = new Set();
    function patch(object, key, callback) {
        if (!object || typeof object[key] !== 'function') return () => {};
        const keys = patched.get(object) ?? new Set();
        if (keys.has(key)) return () => {};
        const own = Object.getOwnPropertyDescriptor(object, key), original = object[key];
        const wrapper = function (...args) { return callback.call(this, args, original); };
        try { Object.defineProperty(object, key, { value: wrapper, configurable: true, writable: true, enumerable: own?.enumerable ?? false }); }
        catch (error) { env.logger.warn(`Could not attach ${key}`, error); return () => {}; }
        keys.add(key); patched.set(object, keys);
        const remove = () => {
            if (object[key] === wrapper) {
                if (own) Object.defineProperty(object, key, own); else delete object[key];
            }
            keys.delete(key);
        };
        cleanup.push(remove); return remove;
    }
    function listen(store, callback) {
        if (typeof store?.addChangeListener !== 'function') return false;
        store.addChangeListener(callback);
        cleanup.push(() => store.removeChangeListener(callback)); return true;
    }
    function watch(filter, callback) {
        const guarded = module => { if (active) callback(module); };
        env.waitFor(filter, guarded);
        const remove = () => env.waitForSubscriptions.delete(filter);
        cleanup.push(remove); return remove;
    }
    const common = () => ({ MessageStore: env.MessageStore, ChannelStore: env.ChannelStore,
        RelationshipStore: env.RelationshipStore, SelectedChannelStore: env.SelectedChannelStore,
        SortedGuildStore: env.SortedGuildStore, GuildReadStateStore: env.GuildReadStateStore,
        ReadStateStore: env.ReadStateStore, GuildChannelStore: env.GuildChannelStore });
    function imported(path, callback) {
        const name = path.split('/').pop().replace(/\.[^.]+$/, '');
        if (name.endsWith('Store')) return watch(env.filters.byStoreName(name), callback);
        const props = { NotificationTextUtils: ['shouldNotify', 'shouldNotifyBase'],
            InAppNotificationActionCreators: ['enqueueNotification', 'clearNotification'],
            playInAppMessageSound: ['playInAppMessageSound'],
            useNotificationCenterItemsLoader: ['useNotificationCenterItemsLoader'],
            renderRedesignChannelListItem: ['renderChannelListItem', 'getChannelListItemSize'] }[name];
        if (props) return watch(env.filters.byProps(...props), callback);
    }
    const V = {
        patcher: { instead: (key, object, callback) => patch(object, key, callback) },
        metro: {
            findByStoreName: name => common()[name],
            findByProps: (...props) => env.find(env.filters.byProps(...props)),
            getModuleWithImportedPath: imported
        }
    };
    function emit(store) { try { store?.emitChange?.(); } catch (error) { env.logger.warn('Refresh failed', error); } }
    function clearMessages() { messageViews = new WeakMap(); lists?.clear(); mentions?.clear(); }
    function messageRefresh() {
        clearMessages();
        if (!active || timer !== undefined) return;
        timer = setTimeout(() => { timer = undefined; if (active) emit(env.MessageStore); }, 0);
    }
    function refresh() {
        clearMessages(); iconViews = new WeakMap(); paging?.reset();
        channels?.refresh(); pings?.refresh();
        for (const store of iconStores) emit(store);
        messageRefresh();
    }
    function withRaw(fn) { rawDepth++; try { return fn(); } finally { rawDepth--; } }
    function attachIcons(store) {
        if (!store || iconStores.has(store)) return;
        iconStores.add(store);
        const icons = createGuildIconFilter(id => active && servers.isGuildIconHidden(id));
        listen(store, () => { iconViews = new WeakMap(); });
        for (const [key, project] of [['getGuildsTree', icons.projectTree], ['getFastListGuildFolders', icons.projectList],
            ['getFlattenedGuildFolderList', icons.projectList], ['getFlattenedGuildIds', icons.projectList], ['getGuildFolderById', icons.projectFolder]]) {
            patch(store, key, function (args, original) {
                const value = original.apply(this, args);
                if (!active || rawDepth || !servers.iconsEnabled() || !value || typeof value !== 'object') return value;
                if (!iconViews.has(value)) iconViews.set(value, project(value));
                return iconViews.get(value);
            });
        }
        emit(store);
    }
    function start() {
        if (active) return;
        active = true;
        try {
            servers = createServerFilter(storage, id => env.ChannelStore?.getChannel(id));
            const originalMessage = env.MessageStore.getMessage.bind(env.MessageStore);
            const originalMessages = env.MessageStore.getMessages.bind(env.MessageStore);
            filter = createMessageFilter({ storage, blockedStore: env.RelationshipStore, ignoredStore: env.RelationshipStore,
                getMessage: originalMessage, isServerMessageHidden: servers.isServerMessageHidden });
            mentions = createMentionFilter(filter.isFilteredUser, storage);
            lists = createCollectionFilter(filter.shouldHide, () => env.logger.warn('Unsupported message collection'), mentions.project);
            paging = createPagination({ getMessages: originalMessages, shouldHide: filter.shouldHide,
                selectedChannel: () => env.SelectedChannelStore.getChannelId(), isChannelHidden: servers.isChannelHidden,
                fetchMessages: options => env.MessageActions.fetchMessages(options) });
            const trusted = listen(env.MessageStore, clearMessages);
            patch(env.MessageStore, 'getMessages', function (args, original) {
                const value = original.apply(this, args);
                if (!active || rawDepth || searchDepth || paging.isNative()) return value;
                paging.consider(args[0]);
                if (!trusted || !value || typeof value !== 'object') return lists.project(value);
                if (!messageViews.has(value)) messageViews.set(value, lists.project(value));
                return messageViews.get(value);
            });
            patch(env.MessageStore, 'getMessage', function (args, original) {
                const value = original.apply(this, args);
                return active && !rawDepth && !searchDepth && !paging.isNative() ? mentions.project(value) : value;
            });
            patch(env.MessageActions, 'fetchMessages', function (args, original) {
                const ticket = paging.manualRequest(args[0]), next = [...args];
                next[0] = paging.repairOptions(args[0]);
                let result;
                try { result = paging.runNative(() => original.apply(this, next)); }
                catch (error) { paging.finishRequest(ticket, true); throw error; }
                if (result?.then) Promise.resolve(result).then(() => paging.finishRequest(ticket), () => paging.finishRequest(ticket, true));
                else paging.finishRequest(ticket);
                return result;
            });
            for (const key of ['isBlockedOrIgnored', 'isBlockedOrIgnoredForMessage', 'isBlockedForMessage', 'isIgnoredForMessage']) {
                patch(env.RelationshipStore, key, function (args, original) {
                    if (searchDepth) return false;
                    const id = typeof args[0] === 'string' ? args[0] : args[0]?.author?.id;
                    if (isUserWhitelisted(storage, id)) return false;
                    return original.apply(this, args);
                });
            }
            patch(env.FluxDispatcher, 'dispatch', function (args, original) {
                const event = args[0], previous = searchDepth;
                searchDepth = /^SEARCH_(?:MESSAGES_|FINISH|AUTOCOMPLETE_)/.test(event?.type) ? previous + 1 : 0;
                try {
                    filter.observe(event); pings?.observe(event);
                    const result = paging.runDisplay(() => original.apply(this, args));
                    paging.observe(event); return result;
                } finally { searchDepth = previous; }
            });
            listen(env.RelationshipStore, messageRefresh);
            listen(env.ChannelStore, () => { servers.clearChannels(); pings?.invalidate(); messageRefresh(); });
            pings = installHiddenPings(V, servers); cleanup.push(pings.stop);
            channels = installChannelLists(V, servers); cleanup.push(channels.stop);
            attachIcons(env.SortedGuildStore);
            watch(env.filters.byStoreName('SortedGuildStore'), attachIcons);
            for (const name of ['SearchMessageStore', 'SearchStore', 'SearchAutocompleteStore']) {
                watch(env.filters.byStoreName(name), store => {
                    const key = name === 'SearchMessageStore' ? 'getMessages' : name === 'SearchStore' ? 'getSearchResults' : 'getState';
                    patch(store, key, function (args, original) {
                        searchDepth++;
                        try { return withRaw(() => original.apply(this, args)); } finally { searchDepth--; }
                    });
                });
            }
            refresh();
        } catch (error) { stop(); throw error; }
    }
    function stop() {
        if (!active) return;
        active = false; paging?.stop();
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        for (const remove of cleanup.splice(0).reverse()) { try { remove(); } catch (error) { env.logger.warn('Cleanup failed', error); } }
        for (const store of iconStores) emit(store);
        iconStores.clear(); clearMessages(); iconViews = new WeakMap(); emit(env.MessageStore);
    }
    return { start, stop, refresh,
        suppressPing: message => active && storage.hideServerPings !== false &&
            (servers.isGuildPingHidden(message?.guild_id ?? message?.guildId) || servers.isChannelPingHidden(message?.channel_id ?? message?.channelId)),
        hiddenNode: node => active && servers.isGuildIconHidden(node?.id ?? node?.guildId),
        visibleGuildIds: ids => active && Array.isArray(ids) ? ids.filter(id => !servers.isGuildIconHidden(typeof id === 'string' ? id : id?.id)) : ids,
        hiddenChannel: channel => active && servers.isGuildChannelListHidden(channel?.guild_id ?? channel?.guildId),
        shouldHide: message => active && !searchDepth && filter.shouldHide(message),
        filterGroup: props => ({ ...props, messages: Array.isArray(props.messages) ? props.messages.filter(message => !filter.shouldHide(message)) : props.messages })
    };
}
