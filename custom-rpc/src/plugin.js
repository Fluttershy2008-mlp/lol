/* SPDX-License-Identifier: GPL-3.0-or-later */
import { createAssetResolver } from './assets.js';
import { createController } from './controller.js';
import { createSettings } from './settings.js';
import { registerSettingsShortcut } from './shortcut.js';

export default (() => {
  const V = typeof vendetta !== 'undefined' ? vendetta : globalThis.vendetta;
  if (!V?.metro?.common || !V?.plugin?.storage) throw new Error('CustomRPC requires Revenge’s Vendetta plugin support.');
  const { React, ReactNative: RN, FluxDispatcher } = V.metro.common;
  const storage = V.plugin.storage;
  const byProps = (...keys) => { try { return V.metro.findByProps(...keys); } catch { return undefined; } };
  const resolveAsset = createAssetResolver(byProps);
  const controller = createController({
    storage, dispatcher: FluxDispatcher ?? byProps('dispatch', 'subscribe'), resolveAsset, appState: RN.AppState,
    log: error => V.logger?.error?.('[CustomRPC]', error?.message ?? String(error)),
  });
  const settings = createSettings({
    React, RN, storage, controller,
    openURL: url => {
      try {
        const promise = RN.Linking.openURL(url);
        promise?.catch?.(() => RN.Alert.alert('Could not open link', url));
      } catch { RN.Alert.alert('Could not open link', url); }
    },
    getTheme: () => {
      try { return V.metro.findByStoreName('ThemeStore')?.theme; } catch { return undefined; }
    },
  });
  let removeShortcut;
  return {
    onLoad() {
      controller.load();
      if (!removeShortcut) {
        removeShortcut = registerSettingsShortcut({
          settingsAPI: globalThis.bunny?.ui?.settings ?? globalThis.window?.bunny?.ui?.settings,
          Settings: settings,
          constants: byProps('SETTING_RENDERER_CONFIG'),
          treeManager: byProps('getAncestors', 'isBlocked'),
          patcher: V.patcher,
          openSettings: () => {
            try {
              const nav = byProps('getRootNavigationRef')?.getRootNavigationRef?.();
              if (!nav?.navigate) throw new Error('Settings navigation is unavailable. Open CustomRPC from the Plugins page.');
              nav.navigate('BUNNY_CUSTOM_PAGE', { title: 'CustomRPC', render: () => React.createElement(settings) });
            } catch (error) { RN.Alert.alert('CustomRPC', error?.message ?? 'Could not open settings.'); }
          },
          renderIcon: icon => {
            const Icon = byProps('TableRowIcon')?.TableRowIcon;
            return Icon ? React.createElement(Icon, { source: icon })
              : React.createElement(RN.Image, { source: icon, style: { width: 24, height: 24 } });
          },
          getAssetID: name => V.ui?.assets?.getAssetIDByName(name),
          log: message => V.logger?.warn?.('[CustomRPC]', message),
        });
      }
    },
    onUnload() {
      try { removeShortcut?.(); }
      finally { removeShortcut = undefined; controller.unload(); }
    },
    settings,
  };
})();
