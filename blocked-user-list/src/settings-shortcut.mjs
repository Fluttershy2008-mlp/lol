export const SHORTCUT_KEY = 'FLUTTERSHY_BLOCKED_USERS';
const SETTINGS_CONFIG = 'SETTING_RENDERER_CONFIG';
const SHORTCUT_LAYER = Symbol.for('blocked-user-list.settings-layer.v1');

// Settings screens can retain an old list of row keys after a plugin is disabled.
// A hidden renderer keeps those keys valid until Discord recreates the screen.
function hiddenShortcut() {
  return { type: 'pressable', parent: null, title: () => 'Blocked Users',
    useTitle: () => 'Blocked Users', usePredicate: () => false, onPress: () => {}, withArrow: true };
}

function publishRenderer(constants, layer) {
  if (constants[SETTINGS_CONFIG]?.[SHORTCUT_KEY] === layer.record) return true;
  const descriptor = Object.getOwnPropertyDescriptor(constants, SETTINGS_CONFIG);
  if (!descriptor || descriptor.configurable === false) return false;

  let fallback = descriptor.value, hasAssignment = false;
  const readBase = () => descriptor.get && !hasAssignment ? descriptor.get.call(constants) : fallback;
  Object.defineProperty(constants, SETTINGS_CONFIG, {
    configurable: true, enumerable: descriptor.enumerable,
    get: () => ({ ...readBase(), [SHORTCUT_KEY]: layer.record }),
    set(value) {
      if (descriptor.set) descriptor.set.call(constants, value);
      else { fallback = value; hasAssignment = true; }
    },
  });
  return constants[SETTINGS_CONFIG]?.[SHORTCUT_KEY] === layer.record;
}

export function attachSettingsShortcut({ api, constants, Settings, open, getAsset, renderIcon,
  patcher, tree, log = () => {} }) {
  const sections = api?.registeredSections;
  const rows = sections && Object.values(sections).find(items => Array.isArray(items)
    && items.some(row => row?.key === 'BUNNY_PLUGINS'));
  if (!rows || !constants) {
    log('Blocked Users shortcut is unavailable; the plugin settings page is still accessible.');
    return () => {};
  }

  let enabled = true, removeGuard, layer, row;
  let icon;
  for (const name of ['UserXIcon', 'FriendsIcon', 'WrenchIcon']) {
    try { icon = getAsset?.(name); if (icon != null) break; } catch {}
  }
  const record = { type: 'pressable', parent: null, title: () => 'Blocked Users',
    useTitle: () => 'Blocked Users', usePredicate: () => enabled,
    icon, IconComponent: icon != null && renderIcon ? () => renderIcon(icon) : undefined,
    onPress: () => { if (enabled) open(); }, withArrow: true };

  try {
    layer = constants[SHORTCUT_LAYER];
    if (!layer) {
      layer = { record };
      Object.defineProperty(constants, SHORTCUT_LAYER, { value: layer, configurable: true });
    } else layer.record = record;
    // Define the native renderer before exposing its key to the settings list.
    if (!publishRenderer(constants, layer)) throw new Error('Native settings renderer cannot be extended.');
    if (typeof patcher?.before === 'function' && typeof tree?.getAncestors === 'function') {
      removeGuard = patcher.before('getAncestors', tree, args => {
        if (enabled && args[0] === SHORTCUT_KEY) {
          try { publishRenderer(constants, layer); } catch (error) { log(error); }
        }
      });
    }
    row = { key: SHORTCUT_KEY, title: record.title, icon, usePredicate: record.usePredicate,
      rawTabsConfig: record, onPress: record.onPress, render: async () => ({ default: Settings }) };
    const previous = rows.findIndex(item => item?.key === SHORTCUT_KEY);
    if (previous >= 0) rows.splice(previous, 1);
    const plugins = rows.findIndex(item => item?.key === 'BUNNY_PLUGINS');
    rows.splice(plugins + 1, 0, row);
  } catch (error) {
    enabled = false;
    if (layer?.record === record) layer.record = hiddenShortcut();
    try { removeGuard?.(); } catch {}
    log(error);
    return () => {};
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true; enabled = false;
    if (layer.record === record) layer.record = hiddenShortcut();
    for (const items of new Set([rows, ...Object.values(sections)])) {
      if (!Array.isArray(items)) continue;
      const index = items.indexOf(row);
      if (index >= 0) { try { items.splice(index, 1); } catch {} }
    }
    try { removeGuard?.(); } catch (error) { log(error); }
  };
}
