/* SPDX-License-Identifier: CC0-1.0 */
import { createMessageFilter } from './filter.js';
import { createCollectionFilter } from './collection.js';
import { createSettings } from './settings.js';

export function createPlugin(V) {
  let active = false;
  let filter, lists, messageStore, refreshTimer;
  let warned = false;
  const cleanup = [];
  const byProps = (...props) => { try { return V.metro.findByProps(...props); } catch {} };
  const byStore = name => { try { return V.metro.findByStoreName?.(name); } catch {} };
  const method = (object, name) => { try { return typeof object?.[name] === 'function'; } catch { return false; } };

  function refresh() {
    lists?.clear();
    if (!active || refreshTimer !== undefined) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      if (!active) return;
      try { messageStore?.emitChange?.(); } catch {}
    }, 0);
  }

  function onLoad() {
    if (active) return;
    const storage = V.plugin.storage;
    for (const key of ['blocked', 'ignored', 'removeReplies', 'removeBotCommands']) {
      if (typeof storage[key] !== 'boolean') storage[key] = true;
    }
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
    filter = createMessageFilter({ storage, blockedStore, ignoredStore,
      getMessage: (channel, id) => messageStore.getMessage(channel, id) });
    warned = false;
    lists = createCollectionFilter(filter.shouldHide, () => {
      if (warned) return;
      warned = true;
      try { V.logger?.warn?.('HideBlockedAndIgnoredMessages: unsupported message-list format; please report your Discord version.'); } catch {}
    });
    active = true;
    try {
      cleanup.push(V.patcher.after('getMessages', messageStore, (_args, result) => {
        if (!active) return;
        try { return lists.project(result); } catch {
          // Preserve Discord's return value on unsupported collection shapes.
          return result;
        }
      }));
      const dispatcher = V.metro.common.FluxDispatcher;
      if (method(dispatcher, 'dispatch')) {
        // Observe IDs before native normalization. Never drop, rewrite, redirect
        // or synthesize gateway events; pagination receives the full history.
        cleanup.push(V.patcher.before('dispatch', dispatcher, ([event]) => {
          if (active) { try { filter.observe(event); } catch {} }
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
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    refreshTimer = undefined;
    for (const remove of cleanup.splice(0).reverse()) { try { remove(); } catch {} }
    filter?.clear(); lists?.clear();
    filter = lists = undefined;
    if (wasActive) { try { messageStore?.emitChange?.(); } catch {} }
    messageStore = undefined;
  }
  return { onLoad, onUnload, settings: createSettings(V, refresh) };
}
