/* SPDX-License-Identifier: GPL-3.0-or-later */
import { createAssetResolver } from './assets.js';
import { createController } from './controller.js';
import { createSettings } from './settings.js';

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
  return { onLoad: () => controller.load(), onUnload: () => controller.unload(), settings };
})();
