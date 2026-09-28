/* SPDX-License-Identifier: GPL-3.0-or-later */

import { connectSettingsRenderer, SHORTCUT_KEY } from './settings-renderer.js';
export { SHORTCUT_KEY } from './settings-renderer.js';

// Revenge exposes this registry at bunny.ui.settings.registeredSections.
// Extend the existing section; registerSection("Revenge") would replace its rows.
export function registerSettingsShortcut({ settingsAPI, Settings, constants, treeManager, patcher,
  openSettings, renderIcon, getAssetID, log = () => {} }) {
  const sections = settingsAPI?.registeredSections;
  if (!sections || typeof sections !== 'object') {
    log('Settings shortcut is unavailable on this Revenge version. Use the plugin settings button.');
    return () => {};
  }
  // Match stable row keys so the shortcut also works with translated headings.
  const rows = Object.values(sections).find(items => Array.isArray(items)
    && items.some(item => item?.key === 'BUNNY_PLUGINS'));
  if (!rows || rows.some(item => item?.key === SHORTCUT_KEY)) return () => {};

  let icon;
  for (const name of ['RichActivityIcon', 'GameControllerIcon', 'WrenchIcon']) {
    try {
      const id = getAssetID?.(name);
      if (id != null) { icon = id; break; }
    } catch {}
  }
  let active = true;
  const renderer = {
    type: 'pressable', parent: null,
    title: () => 'CustomRPC', useTitle: () => 'CustomRPC', icon,
    IconComponent: icon != null && renderIcon ? () => renderIcon(icon) : undefined,
    usePredicate: () => active,
    onPress: () => { if (active) openSettings?.(); },
    withArrow: true,
  };
  // Do this BEFORE exposing the key in registeredSections. Otherwise Discord's
  // getAncestors reads .parent on an undefined renderer and crashes Settings.
  const bridge = connectSettingsRenderer(constants, renderer);
  if (!bridge) {
    active = false;
    log('Could not register a native settings row safely. Use the plugin settings button.');
    return () => {};
  }
  let unpatch;
  try {
    if (typeof treeManager?.getAncestors === 'function' && typeof patcher?.before === 'function') {
      unpatch = patcher.before('getAncestors', treeManager, args => {
        // Repair only our own entry if another plugin replaces the renderer
        // accessor later. Let the original tree/blocking logic run unchanged.
        if (args[0] === SHORTCUT_KEY) bridge.ensure();
      });
    }
  } catch {}
  const row = {
    key: SHORTCUT_KEY,
    title: () => 'CustomRPC',
    icon,
    usePredicate: renderer.usePredicate,
    rawTabsConfig: renderer,
    // Revenge supplies the native screen header, navigation and back button.
    render: async () => ({ default: Settings }),
  };
  try {
    rows.splice(rows.findIndex(item => item?.key === 'BUNNY_PLUGINS') + 1, 0, row);
  } catch {
    active = false; unpatch?.(); bridge.release();
    log('Could not add the settings shortcut. Use the plugin settings button.');
    return () => {};
  }

  return () => {
    active = false;
    // Some plugins replace the section array. Remove our row wherever it moved,
    // retaining every other row (including Account Switcher from the screenshot).
    for (const items of new Set([rows, ...Object.values(sections)])) {
      if (!Array.isArray(items)) continue;
      const index = items.indexOf(row);
      if (index !== -1) {
        try { items.splice(index, 1); } catch {}
      }
    }
    unpatch?.(); unpatch = undefined;
    bridge.release();
  };
}
