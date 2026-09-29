/* SPDX-License-Identifier: GPL-3.0-or-later */
import { createDiscordAdapter } from './discord.js';
import { createController } from './controller.js';
import { createSettings } from './settings.js';
import { registerSettingsShortcut } from './shortcut.js';

export function createPlugin(V, host = globalThis) {
  if (!V?.metro?.common?.React || !V?.plugin?.storage) throw new Error('Profile Status Presets requires Revenge Vendetta plugin support.');
  const { React, ReactNative: RN } = V.metro.common;
  const discord = createDiscordAdapter(V);
  const controller = createController({ storage: V.plugin.storage, discord });
  const disposers = [];
  let active = false;
  const log = error => { try { V.logger?.warn?.('[Profile Status Presets]', error?.message || String(error)); } catch {} };
  const Settings = createSettings({ React, RN, controller, getTheme: () => discord.byStore('ThemeStore')?.theme });
  function openSettings() {
    if (!active) return;
    try {
      const navigation = discord.byProps('getRootNavigationRef')?.getRootNavigationRef?.();
      if (!navigation?.navigate) throw new Error('Open Revenge → Plugins → Profile Status Presets → Settings.');
      navigation.navigate('BUNNY_CUSTOM_PAGE', { title: 'Profile Status Presets', render: () => React.createElement(Settings) });
    } catch (error) { RN.Alert.alert('Profile Status Presets', error?.message || 'Could not open presets.'); }
  }
  function onLoad() {
    if (active) return;
    active = true;
    controller.start();
    // Refresh on profile updates and account switches; no polling or automatic
    // status changes run at startup, in the background, or during unload.
    for (const name of ['UserStore', 'UserSettingsProtoStore', 'UserSettingsStore', 'PresenceStore', 'ThemeStore']) {
      try {
        const store = discord.byStore(name);
        if (typeof store?.addChangeListener === 'function' && typeof store?.removeChangeListener === 'function') {
          store.addChangeListener(controller.refresh);
          disposers.push(() => store.removeChangeListener(controller.refresh));
        }
      } catch (error) { log(error); }
    }
    try {
      const subscription = RN.AppState?.addEventListener?.('change', state => { if (state === 'active') controller.refresh(); });
      if (subscription?.remove) disposers.push(() => subscription.remove());
    } catch (error) { log(error); }
    try {
      disposers.push(registerSettingsShortcut({
        settingsAPI: host.bunny?.ui?.settings ?? host.window?.bunny?.ui?.settings,
        Settings, constants: discord.byProps('SETTING_RENDERER_CONFIG'),
        treeManager: discord.byProps('getAncestors', 'isBlocked'), patcher: V.patcher, openSettings,
        renderIcon: source => React.createElement(RN.Image, { source, style: { width: 24, height: 24 } }),
        getAssetID: name => V.ui?.assets?.getAssetIDByName(name), log,
      }));
    } catch (error) { log(error); }
    try {
      const unregister = V.commands?.registerCommand?.({
        name: 'statuspresets', displayName: 'statuspresets',
        description: 'Open your saved profile statuses', displayDescription: 'Open your saved profile statuses',
        type: 1, inputType: 1, applicationId: '-1', options: [],
        execute: () => { openSettings(); return undefined; },
      });
      if (typeof unregister === 'function') disposers.push(unregister);
    } catch (error) { log(error); }
  }
  function onUnload() {
    active = false;
    controller.stop();
    for (const dispose of disposers.splice(0).reverse()) { try { dispose(); } catch (error) { log(error); } }
  }
  return { onLoad, onUnload, settings: Settings };
}
