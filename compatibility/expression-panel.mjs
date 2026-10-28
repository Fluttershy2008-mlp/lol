// A native Modal owns its scroll area. It does not compete with the gesture
// handler of the message action sheet that opened the expression picker.
export function createExpressionPanel(V, prefix) {
  const { React, ReactNative: RN } = V.metro.common, h = React.createElement;
  const entries = new Set(); let serial = 0;
  const safe = fn => { try { return fn(); } catch {} };
  const byProps = (...keys) => safe(() => V.metro.findByProps(...keys));
  function open(render, title, onClosed) {
    const manager = byProps('openAlert', 'dismissAlert');
    if (!RN.Modal || typeof manager?.openAlert !== 'function' || !React.useState || !React.useEffect) return false;
    for (const previous of [...entries]) previous.close();
    const key = `${prefix}.panel.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}.${++serial}`;
    const entry = { visible: true, listeners: new Set() };
    const close = () => {
      if (!entry.visible) return;
      entry.visible = false;
      for (const fn of entry.listeners) fn();
      entries.delete(entry);
      safe(() => onClosed?.());
      safe(() => manager.dismissAlert(key));
      // Some native alert hosts retain dismissed entries. Remove this exact
      // node/key only; visibility has already closed the native Modal window.
      const module = byProps('useAlertStore') ?? safe(() => V.metro.findByImportedPath?.('design/components/AlertModal/native/useAlertStore.native.tsx'));
      const store = module?.useAlertStore ?? module?.default;
      if (typeof store?.setState === 'function') safe(() => store.setState(state => {
        if (!Array.isArray(state.alerts)) return state;
        const remaining = state.alerts.filter(item => item.key !== key && item.node !== entry.node);
        return remaining.length === state.alerts.length ? state : { alerts: remaining };
      }));
    };
    entry.close = close;
    function Panel() {
      const [, refresh] = React.useState(0);
      React.useEffect(() => {
        const changed = () => refresh(n => n + 1); entry.listeners.add(changed);
        return () => { entry.listeners.delete(changed); close(); };
      }, []);
      const screen = RN.useWindowDimensions?.() ?? RN.Dimensions?.get?.('window') ?? { height: 800 };
      if (!entry.visible) return null;
      const theme = safe(() => V.metro.findByStoreName('ThemeStore')?.theme) ?? RN.Appearance?.getColorScheme?.();
      const bg = theme === 'light' ? '#ffffff' : '#242429';
      return h(RN.Modal, { visible: true, transparent: true, animationType: 'slide', presentationStyle: 'overFullScreen',
        onRequestClose: close, onDismiss: close, statusBarTranslucent: false, navigationBarTranslucent: false },
        h(RN.KeyboardAvoidingView ?? RN.View, { style: { flex: 1 }, behavior: RN.Platform?.OS === 'ios' ? 'padding' : 'height' },
          h(RN.View, { style: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' } },
            h(RN.Pressable ?? RN.TouchableOpacity, { onPress: close, accessibilityRole: 'button', accessibilityLabel: `Close ${title}`,
              style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } }),
            h(RN.View, { testID: prefix + '-panel', accessibilityViewIsModal: true, onAccessibilityEscape: close,
              style: { height: Math.min(720, screen.height * 0.86), maxHeight: '92%', backgroundColor: bg,
                borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', paddingTop: 8, paddingBottom: 16 } },
              render(close)))));
    }
    entry.node = h(Panel); entries.add(entry);
    try {
      const result = manager.openAlert(key, entry.node, close, { dismissable: true });
      if (result?.catch) result.catch(close);
      return true;
    } catch { close(); return false; }
  }
  return { open, closeAll() { for (const entry of [...entries]) entry.close(); } };
}
