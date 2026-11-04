/* SPDX-License-Identifier: CC0-1.0 */
import { createMessageFilter } from './filter.js';
import { createCollectionFilter } from './collection.js';
import { createSettings } from './settings.js';
import { createMentionFilter } from './mentions.js';
import { createPagination } from './pagination.js';
import { normalizeWhitelist } from './whitelist.js';
import { installNativeRows } from './native-rows.js';
import { installSearch } from './search.js';

export function createPlugin(V) {
  let active = false;
  let filter, lists, mentions, pagination, search, messageStore, refreshTimer;
  let warned = false;
  const cleanup = [];
  const byProps = (...props) => { try { return V.metro.findByProps(...props); } catch {} };
  const byStore = name => { try { return V.metro.findByStoreName?.(name); } catch {} };
  const method = (object, name) => { try { return typeof object?.[name] === 'function'; } catch { return false; } };

  function refresh() {
    lists?.clear();
    mentions?.clear();
    search?.clear();
    pagination?.reset();
    if (!active || refreshTimer !== undefined) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      if (!active) return;
      try { messageStore?.emitChange?.(); } catch {}
      search?.refresh();
    }, 0);
  }

  function onLoad() {
    if (active) return;
    const storage = V.plugin.storage;
    for (const key of ['blocked', 'ignored', 'removeReplies', 'removeBotCommands', 'removeMentions']) {
      if (typeof storage[key] !== 'boolean') storage[key] = true;
    }
    if (typeof storage.whitelistEnabled !== 'boolean') storage.whitelistEnabled = false;
    storage.whitelistedIds = normalizeWhitelist(storage.whitelistedIds);
    messageStore = byStore('MessageStore');
    if (!method(messageStore, 'getMessages') || !method(messageStore, 'getMessage')) {
      messageStore = byProps('getMessages', 'getMessage');
    }
    const relationshipStore = byStore('RelationshipStore');
    const blockedStore = method(relationshipStore, 'isBlocked') ? relationshipStore : byProps('isBlocked');
    const ignoredStore = method(relationshipStore, 'isIgnored') ? relationshipStore : byProps('isIgnored');
    if (!method(messageStore, 'getMessages') || !method(messageStore, 'getMessage')
      || (!method(blockedStore, 'isBlocked') && !method(ignoredStore, 'isIgnored'))) {
      throw new Error('HideBlockedAndIgnoredMessages: message or relationship modules are unavailable on this Discord build.');
    }
    const originalGetMessage = messageStore.getMessage.bind(messageStore);
    filter = createMessageFilter({ storage, blockedStore, ignoredStore,
      getMessage: originalGetMessage });
    const originalGetMessages = messageStore.getMessages.bind(messageStore);
    const selectedStore = byStore('SelectedChannelStore') ?? byProps('getChannelId', 'getVoiceChannelId');
    const actions = byProps('fetchMessages', 'sendMessage') ?? byProps('fetchMessages');
    pagination = createPagination({ getMessages: originalGetMessages, shouldHide: filter.shouldHide,
      selectedChannel: method(selectedStore, 'getChannelId') ? () => selectedStore.getChannelId() : undefined,
      fetchMessages: method(actions, 'fetchMessages') ? options => actions.fetchMessages(options) : undefined });
    mentions = createMentionFilter(filter.isFilteredUser, storage);
    warned = false;
    lists = createCollectionFilter(filter.shouldHide, () => {
      if (warned) return;
      warned = true;
      try { V.logger?.warn?.('HideBlockedAndIgnoredMessages: unsupported message-list format; please report your Discord version.'); } catch {}
    }, mentions.project);
    active = true;
    try {
      cleanup.push(installNativeRows(V, storage, filter.isFilteredUser));
      search = installSearch(V, refresh);
      cleanup.push(search.stop);
      // Native rows can resolve content by ID instead of using the list record.
      cleanup.push(V.patcher.after('getMessage', messageStore, (_args, result) => {
        if (!active || pagination.isNative()) return;
        try { return mentions.project(result); } catch { return result; }
      }));
      cleanup.push(V.patcher.after('getMessages', messageStore, ([channelId], result) => {
        if (!active || pagination.isNative()) return;
        try { pagination.consider(channelId); } catch {}
        try {
          return lists.project(result);
        } catch {
          // Preserve Discord's return value on unsupported collection shapes.
          return result;
        }
      }));
      if (method(actions, 'fetchMessages')) {
        cleanup.push(V.patcher.instead('fetchMessages', actions, function (args, original) {
          if (!active) return original.apply(this, args);
          // Keep the original receiver, remaining arguments and return value.
          const next = [...args];
          const paging = pagination;
          let ticket;
          try {
            ticket = paging.manualRequest(args[0]);
            next[0] = paging.repairOptions(args[0]);
          } catch {}
          let result;
          try { result = paging.runNative(() => original.apply(this, next)); }
          catch (error) { paging.finishRequest(ticket, true); throw error; }
          if (result && typeof result.then === 'function') {
            Promise.resolve(result).then(() => paging.finishRequest(ticket), () => paging.finishRequest(ticket, true));
          }
          return result;
        }));
      }
      const dispatcher = V.metro.common.FluxDispatcher;
      if (method(dispatcher, 'dispatch')) {
        // Observe IDs before normalization. Native events stay untouched. Flux
        // subscriptions can read the display list synchronously during dispatch,
        // including when a history action dispatches its loading/success event.
        cleanup.push(V.patcher.instead('dispatch', dispatcher, function (args, original) {
          if (!active) return original.apply(this, args);
          try { filter.observe(args[0]); } catch {}
          const result = pagination.runDisplay(() => search.dispatch(args[0], () => original.apply(this, args)));
          try { pagination.observe(args[0]); } catch {}
          return result;
        }));
      }
      for (const store of new Set([blockedStore, ignoredStore])) {
        if (method(store, 'addChangeListener') && method(store, 'removeChangeListener')) {
          store.addChangeListener(refresh);
          cleanup.push(() => store.removeChangeListener(refresh));
        }
      }
      refresh();
    } catch (error) { onUnload(); throw error; }
  }

  function onUnload() {
    const wasActive = active;
    active = false;
    pagination?.stop();
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    refreshTimer = undefined;
    for (const remove of cleanup.splice(0).reverse()) { try { remove(); } catch {} }
    filter?.clear(); lists?.clear(); mentions?.clear();
    filter = lists = mentions = pagination = search = undefined;
    if (wasActive) { try { messageStore?.emitChange?.(); } catch {} }
    messageStore = undefined;
  }
  return { onLoad, onUnload, settings: createSettings(V, refresh) };
}
