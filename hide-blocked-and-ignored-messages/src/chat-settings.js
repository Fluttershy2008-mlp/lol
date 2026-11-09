/* SPDX-License-Identifier: CC0-1.0 */
import { createSettings } from './settings.js';

// The button and panel belong to this plugin, so Chat Buttons can replay its
// onPress directly. No cross-plugin settings API or navigation route is needed.
export function installChatSettings(V, refresh) {
  const { React, ReactNative: RN } = V.metro.common;
  if (!React?.createElement || !RN?.Modal || typeof V.metro.getModuleWithImportedPath !== 'function') return () => {};
  const h = React.createElement, Settings = createSettings(V, refresh);
  const key = 'hide-blocked-and-ignored-messages.settings-button';
  const listeners = new Set(), disposers = [];
  let active = true, attached = false;
  function SettingsIcon(props = {}) {
    let source;
    try { source = V.ui.assets.getAssetIDByName('WrenchIcon'); } catch {}
    return source != null ? h(RN.Image, { source, style: [{ width: 24, height: 24 }, props.style] })
      : h(RN.Text, { style: { fontSize: 22, color: '#b9bec9' } }, '⚙');
  }
  function HiddenSettingsButton() {
    const [open, setOpen] = React.useState(false);
    const [, redraw] = React.useState(0);
    React.useEffect(() => {
      const update = () => redraw(n => n + 1);
      listeners.add(update); return () => listeners.delete(update);
    }, []);
    if (!active) return null;
    const close = () => setOpen(false);
    return h(React.Fragment, null,
      h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Hidden users & servers',
        chatButtonsId: 'dev.fluttershy2008.hide-blocked-and-ignored-messages',
        chatButtonsLabel: 'Hidden users & servers', IconComponent: SettingsIcon,
        onPress() { if (active) setOpen(true); }, testID: 'hide-blocked.settings-button',
        style: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' }, hitSlop: 4 }, h(SettingsIcon)),
      open ? h(RN.Modal, { visible: true, transparent: false, animationType: 'slide',
        presentationStyle: 'fullScreen', onRequestClose: close, testID: 'hide-blocked.settings-panel' },
        h(RN.SafeAreaView ?? RN.View, { style: { flex: 1, backgroundColor: '#18191c' } },
          h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', padding: 16 } },
            h(RN.Text, { style: { color: '#f2f3f5', fontSize: 19, fontWeight: '700', flex: 1 } }, 'Hidden users & servers'),
            h(RN.Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Close Hidden users & servers',
              onPress: close, hitSlop: 10, style: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' } },
              h(RN.Text, { style: { color: '#f2f3f5', fontSize: 28 } }, '×'))),
          h(Settings))) : null);
  }
  function addButton(tree) {
    if (!React.isValidElement(tree)) return tree;
    const children = React.Children.toArray(tree.props.children);
    if (children.some(child => child?.key === key || String(child?.key ?? '').includes(key))) return tree;
    return React.cloneElement(tree, { children: [...children, h(HiddenSettingsButton, { key })] });
  }
  function attach(module) {
    if (!active || attached || !module?.default) return;
    let owner = module, name = 'default';
    for (let i = 0; i < 8; i++) {
      const component = owner[name];
      if (component?.type) { owner = component; name = 'type'; }
      else if (typeof component?.render === 'function') { owner = component; name = 'render'; break; }
      else if (typeof component?.prototype?.render === 'function') { owner = component.prototype; name = 'render'; break; }
      else break;
    }
    if (typeof owner[name] !== 'function') return;
    disposers.push(V.patcher.after(name, owner, (_args, result) => active ? addButton(result) : result));
    attached = true;
  }
  try {
    const remove = V.metro.getModuleWithImportedPath('modules/chat_input/native/action_buttons/ChatInputRightActions.tsx', attach);
    if (typeof remove === 'function') disposers.push(remove);
  } catch (error) { stop(); throw error; }
  function stop() {
    if (!active) return;
    active = false;
    for (const remove of disposers.splice(0).reverse()) { try { remove(); } catch {} }
    for (const update of listeners) update();
    listeners.clear();
  }
  return stop;
}
