/* SPDX-License-Identifier: GPL-3.0-or-later */

export const SHORTCUT_KEY = 'PROFILE_STATUS_PRESETS_FLUTTERSHY_SETTINGS';
const CONFIG = 'SETTING_RENDERER_CONFIG';
const BRIDGE = Symbol.for('profile-status-presets.settings.renderer.v1');
const HIDDEN_ROW = Object.freeze({
  type: 'pressable', parent: null, title: () => 'Profile Status Presets', useTitle: () => 'Profile Status Presets',
  usePredicate: () => false, onPress: () => {}, withArrow: true,
});

// Keep the native renderer and the menu row in sync. Other sidebar plugins may
// have replaced Revenge's dynamic getter with a captured renderer map.
export function connectSettingsRenderer(constants, renderer) {
  if (!constants) return undefined;
  let state;
  try {
    state = constants[BRIDGE];
    if (!state) {
      state = { row: HIDDEN_ROW, getter: undefined };
      Object.defineProperty(constants, BRIDGE, { value: state, configurable: true });
    }
  } catch { return undefined; }

  function ensure() {
    try {
      const previous = Object.getOwnPropertyDescriptor(constants, CONFIG);
      // Another plugin can wrap our getter and still preserve this entry. Do
      // not keep wrapping each other on every settings row render.
      if (constants[CONFIG]?.[SHORTCUT_KEY] === state.row) return true;
      if (previous?.configurable === false) return false;

      // Call the prior accessor on each read. Taking a snapshot here would hide
      // later rows from Revenge or other plugins, recreating this crash.
      let assigned = false, value = previous?.value ?? constants[CONFIG];
      const getter = () => ({
        ...(previous?.get && !assigned ? previous.get.call(constants) : value),
        [SHORTCUT_KEY]: state.row,
      });
      Object.defineProperty(constants, CONFIG, {
        configurable: true, enumerable: previous?.enumerable ?? true,
        get: getter,
        set(next) {
          if (previous?.set) previous.set.call(constants, next);
          else { assigned = true; value = next; }
        },
      });
      state.getter = getter;
      return constants[CONFIG][SHORTCUT_KEY] === state.row;
    } catch { return false; }
  }

  state.row = renderer;
  if (!ensure()) { state.row = HIDDEN_ROW; return undefined; }
  return {
    ensure,
    release() {
      if (state.row === renderer) state.row = HIDDEN_ROW;
      // Native settings can retain an old array of keys while the screen is
      // open. A hidden, parentless record keeps those keys valid after unload.
      // Reuse this one bridge on re-enable rather than stacking new accessors.
    },
  };
}

/* SPDX-License-Identifier: GPL-3.0-or-later */


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
  for (const name of ['StatusIcon', 'PencilIcon', 'WrenchIcon']) {
    try {
      const id = getAssetID?.(name);
      if (id != null) { icon = id; break; }
    } catch {}
  }
  let active = true;
  const renderer = {
    type: 'pressable', parent: null,
    title: () => 'Profile Status Presets', useTitle: () => 'Profile Status Presets', icon,
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
    title: () => 'Profile Status Presets',
    icon,
    usePredicate: renderer.usePredicate,
    rawTabsConfig: renderer,
    // Revenge supplies the native screen header, navigation and back button.
    render: async () => ({ default: Settings }),
  };
  try {
    const anchor = rows.findIndex(item => item?.key === 'BUNNY_PLUGINS');
    rows.splice(anchor + 1, 0, row);
  } catch {
    active = false; unpatch?.(); bridge.release();
    log('Could not add the settings shortcut. Use the plugin settings button.');
    return () => {};
  }

  return () => {
    active = false;
    // Some plugins replace the section array. Remove our row wherever it moved,
    // retaining every other row (including Account Switcher).
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

