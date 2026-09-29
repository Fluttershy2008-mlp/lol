/* SPDX-License-Identifier: GPL-3.0-or-later */
import { collectUnread, bulkReadEvent } from './collect.js';
import { createUI } from './ui.js';

export function createPlugin(V) {
  const { React, ReactNative: RN } = V.metro.common;
  const storage = V.plugin.storage;
  const listeners = new Set();
  const cleanup = [];
  let active = false, busy = false, generation = 0, overlay = false, pending = null;
  let message = 'Ready. Tap Read All to mark your unread server channels, DMs and group DMs as read.';
  let warnings = [];
  const log = error => { try { V.logger?.warn?.('[ReadAllNotificationsButton]', error?.message ?? String(error)); } catch {} };
  const safe = getter => { try { return getter(); } catch { return undefined; } };
  const byProps = (...keys) => safe(() => V.metro.findByProps(...keys));
  const byStore = name => safe(() => V.metro.findByStoreName(name));
  const options = () => ({ showButton: storage.showButton !== false, confirm: storage.confirm === true,
    side: storage.side === 'right' ? 'right' : 'left' });
  const changed = () => { for (const listener of listeners) { try { listener(); } catch {} } };
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const getState = () => ({ active, busy, overlay, message, warnings: [...warnings], options: options() });
  function notify(text, error = false) {
    message = text;
    changed();
    try {
      if (typeof V.ui?.toasts?.showToast === 'function') {
        const icon = safe(() => V.ui.assets.getAssetIDByName(error ? 'CircleXIcon-primary' : 'Check'));
        V.ui.toasts.showToast(text, icon);
      } else RN.Alert.alert('Read All Notifications', text);
    } catch (err) { log(err); }
  }

  function snapshot() {
    const UserStore = byStore('UserStore');
    const accountId = safe(() => UserStore.getCurrentUser()?.id);
    if (!accountId) throw new Error('Sign in to Discord and wait for your chats to load.');
    const connection = byStore('ConnectionStore');
    if (safe(() => connection.isConnected()) === false) throw new Error('Discord is offline. Reconnect and try again.');
    const ReadStateStore = byStore('ReadStateStore') ?? byProps('hasUnread', 'lastMessageId');
    const result = collectUnread({
      GuildStore: byStore('GuildStore'), GuildChannelStore: byStore('GuildChannelStore'),
      ChannelStore: byStore('ChannelStore'), ReadStateStore,
      ActiveJoinedThreadsStore: byStore('ActiveJoinedThreadsStore'),
    });
    return { ...result, accountId, UserStore, ReadStateStore };
  }

  async function readSnapshot(data, run) {
    if (!active || generation !== run || busy) return;
    if (safe(() => data.UserStore.getCurrentUser()?.id) !== data.accountId) {
      notify('Your account changed. Tap Read All again.', true);
      return;
    }
    if (safe(() => byStore('ConnectionStore').isConnected()) === false) {
      notify('Discord is offline. Reconnect and try again.', true);
      return;
    }
    busy = true;
    changed();
    try {
      const dispatcher = safe(() => V.metro.common.FluxDispatcher)
        ?? byProps('dispatch', 'subscribe', 'unsubscribe');
      if (typeof dispatcher?.dispatch !== 'function') throw new Error('Discord notification actions are unavailable on this version.');
      // Discord owns the acknowledgement queue and network synchronization, just
      // as in Vencord. No separate REST call, token access or double ack.
      await dispatcher.dispatch(bulkReadEvent(data.channels));
      if (!active || run !== generation) return;
      notify(`Marked ${data.channels.length} channel${data.channels.length === 1 ? '' : 's'} as read.${warnings.length ? ' Some items were skipped; see plugin settings.' : ''}`);
    } catch (error) {
      log(error);
      if (active && run === generation) notify(`Could not mark notifications as read: ${error?.message ?? 'Unknown error'}`, true);
    } finally {
      if (run === generation) { busy = false; changed(); }
    }
  }

  function requestReadAll() {
    if (!active || busy || pending) return;
    try {
      const data = snapshot();
      warnings = data.warnings;
      if (!data.channels.length) {
        notify(warnings.length ? 'No unread channels could be marked. Check the notes in plugin settings.' : 'All server and DM notifications are already read.');
        return;
      }
      const run = generation;
      if (options().confirm) {
        const token = {};
        pending = token;
        const release = () => { if (pending === token) pending = null; };
        RN.Alert.alert('Read all notifications?', `Mark ${data.channels.length} unread channels as read? This includes server channels, joined threads, DMs and group DMs.`, [
          { text: 'Cancel', style: 'cancel', onPress: release },
          { text: 'Read All', onPress: () => {
            if (pending !== token) return;
            release();
            void readSnapshot(data, run);
          } },
        ], { cancelable: true, onDismiss: release });
      } else return readSnapshot(data, run);
    } catch (error) {
      pending = null;
      log(error);
      notify(error?.message ?? 'Unable to check unread channels.', true);
    }
  }

  function refresh() {
    if (!active || busy) return;
    try {
      const data = snapshot();
      warnings = data.warnings;
      message = `${data.channels.length} unread channel${data.channels.length === 1 ? '' : 's'} ready to mark as read, including DMs and group DMs.`;
      changed();
    } catch (error) { notify(error?.message ?? 'Unable to check unread channels.', true); }
  }

  const { Settings, ReadAllOverlay } = createUI({ React, RN, getState, subscribe, requestReadAll, refresh,
    getTheme: () => safe(() => byStore('ThemeStore').theme),
    updateOptions: value => {
      if (typeof value.showButton === 'boolean') storage.showButton = value.showButton;
      if (typeof value.confirm === 'boolean') storage.confirm = value.confirm;
      if (value.side === 'left' || value.side === 'right') storage.side = value.side;
      changed();
    },
  });

  function mountOverlay() {
    try {
      const ChatView = V.metro.findByTypeName?.('ChatView');
      // Guard all proxy property reads: missing lazy modules can throw here.
      if (typeof ChatView?.type !== 'function' || typeof V.patcher?.after !== 'function') return;
      const unpatch = V.patcher.after('type', ChatView, (_, rendered) => {
        if (!active) return rendered;
        try {
          return React.createElement(React.Fragment, null, rendered,
            React.createElement(ReadAllOverlay, { key: 'read-all-notifications-button' }));
        } catch (error) { log(error); return rendered; }
      });
      if (typeof unpatch === 'function') { cleanup.push(unpatch); overlay = true; }
    } catch (error) { log(error); }
  }

  function onLoad() {
    if (active) return;
    active = true;
    generation++;
    mountOverlay();
    try {
      const unregister = V.commands?.registerCommand?.({
        name: 'readall', displayName: 'readall',
        description: 'Mark all server and DM notifications as read', displayDescription: 'Mark all server and DM notifications as read',
        options: [], applicationId: '-1', inputType: 1, type: 1,
        execute: async () => { await requestReadAll(); return null; },
      });
      if (typeof unregister === 'function') cleanup.push(unregister);
    } catch (error) { log(error); }
    changed();
  }

  function onUnload() {
    active = false;
    generation++;
    busy = false;
    pending = null;
    overlay = false;
    changed();
    for (const dispose of cleanup.splice(0).reverse()) { try { dispose(); } catch (error) { log(error); } }
    listeners.clear();
  }
  return { onLoad, onUnload, settings: Settings };
}
