/* SPDX-License-Identifier: GPL-3.0-or-later */

export const SHORTCUT_KEY = 'CUSTOMRPC_FLUTTERSHY_SETTINGS';
const CONFIG = 'SETTING_RENDERER_CONFIG';
const BRIDGE = Symbol.for('customrpc.settings.renderer.v1');
const HIDDEN_ROW = Object.freeze({
  type: 'pressable', parent: null, title: () => 'CustomRPC', useTitle: () => 'CustomRPC',
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
      if (state.getter && previous?.get === state.getter) return constants[CONFIG][SHORTCUT_KEY] === state.row;
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
