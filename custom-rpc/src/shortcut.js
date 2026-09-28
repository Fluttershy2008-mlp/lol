/* SPDX-License-Identifier: GPL-3.0-or-later */

export const SHORTCUT_KEY = 'CUSTOMRPC_FLUTTERSHY_SETTINGS';

// Revenge exposes this registry at bunny.ui.settings.registeredSections.
// Extend the existing section; registerSection("Revenge") would replace its rows.
export function registerSettingsShortcut({ settingsAPI, Settings, getAssetID, log = () => {} }) {
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
  const row = {
    key: SHORTCUT_KEY,
    title: () => 'CustomRPC',
    icon,
    // Revenge supplies the native screen header, navigation and back button.
    render: async () => ({ default: Settings }),
  };
  try {
    rows.splice(rows.findIndex(item => item?.key === 'BUNNY_PLUGINS') + 1, 0, row);
  } catch {
    log('Could not add the settings shortcut. Use the plugin settings button.');
    return () => {};
  }

  return () => {
    // Some plugins replace the section array. Remove our row wherever it moved,
    // retaining every other row (including Account Switcher from the screenshot).
    for (const items of new Set([rows, ...Object.values(sections)])) {
      if (!Array.isArray(items)) continue;
      const index = items.indexOf(row);
      if (index !== -1) {
        try { items.splice(index, 1); } catch {}
      }
    }
  };
}
