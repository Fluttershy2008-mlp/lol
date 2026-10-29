// Valenced presents the picker as a regular navigator screen. Never nest an
// RN Modal inside Discord's alert host: either native window can retain input.
export function createExpressionPage(V, { title, id, testID }, env = globalThis) {
  const { React, ReactNative: RN } = V.metro.common, h = React.createElement;
  const entries = new Set(); let serial = 0;
  const safe = fn => { try { return fn(); } catch {} };
  function focused(navigation) {
    const current = safe(() => navigation.getCurrentRoute?.());
    if (current) return current;
    let state = safe(() => navigation.getRootState?.() ?? navigation.getState?.()), route;
    for (let depth = 0; depth < 12 && state?.routes?.length; depth++) {
      route = state.routes[state.index ?? state.routes.length - 1]; state = route?.state;
    }
    return route;
  }
  function open(render, onClosed) {
    const navigation = safe(() => V.metro.findByProps('getRootNavigationRef')?.getRootNavigationRef?.());
    if (!navigation?.navigate || !navigation.goBack || (!navigation.getCurrentRoute && !navigation.getRootState && !navigation.getState)) return false;
    for (const previous of [...entries]) previous.close();
    const key = `${id}.${Date.now().toString(36)}.${++serial}.${Math.random().toString(36).slice(2)}`;
    const useIsFocused = safe(() => V.metro.common.NavigationNative?.useIsFocused);
    const entry = { open: true, listeners: new Set(), presented: false, mounted: false };
    const ownsFocus = () => focused(navigation)?.params?.__expressionPage === key;
    const isOpen = () => entry.open && (!entry.presented || ownsFocus());
    const close = (navigate = true) => {
      if (!entry.open) return;
      const owned = ownsFocus(); entry.open = false;
      env.clearTimeout(entry.timer); env.clearTimeout(entry.mountTimer);
      safe(() => entry.cancelNavigation?.()); safe(() => entry.unsubscribe?.()); entries.delete(entry);
      safe(() => onClosed?.()); for (const listener of entry.listeners) listener();
      // A late result must never pop a different Discord screen.
      if (navigate && owned && safe(() => navigation.canGoBack?.()) !== false) safe(() => navigation.goBack());
    };
    entry.close = close; entries.add(entry);
    function Page() {
      const [, refresh] = React.useState(0);
      const focus = typeof useIsFocused === 'function' ? useIsFocused() : undefined;
      React.useEffect(() => {
        const changed = () => refresh(n => n + 1); entry.listeners.add(changed);
        entry.mounted = true; env.clearTimeout(entry.mountTimer);
        if (ownsFocus()) entry.presented = true;
        // A queued native route may mount after Stop/Back cancelled its opener.
        if (!entry.open && ownsFocus()) safe(() => navigation.goBack());
        return () => { entry.listeners.delete(changed); close(false); };
      }, []);
      React.useEffect(() => {
        // Native stacks can keep an inactive page mounted. If the user returns
        // through that closed page, pop only this owned screen.
        if (!entry.open && ownsFocus()) safe(() => navigation.goBack());
      }, [focus]);
      const dark = safe(() => V.metro.findByStoreName('ThemeStore')?.theme) !== 'light';
      return h(RN.View, { testID, style: { flex: 1, backgroundColor: dark ? '#242429' : '#fff' } },
        entry.open ? render(() => close(), isOpen) : h(RN.Text, {
          style: { padding: 24, fontSize: 16, color: dark ? '#f2f3f5' : '#202127' },
        }, title + ' is closed. Use Back to return to Discord.'));
    }
    const changed = () => {
      if (!entry.open) return;
      if (ownsFocus()) entry.presented = true;
      else if (entry.presented) close(false);
    };
    const subscription = safe(() => navigation.addListener?.('state', changed));
    entry.unsubscribe = typeof subscription === 'function' ? subscription : () => subscription?.remove?.();
    entry.timer = env.setTimeout(() => {
      entry.timer = undefined;
      if (!entry.open) return;
      entry.mountTimer = env.setTimeout(() => {
        if (!entry.open || entry.mounted) return;
        close(false); safe(() => V.ui.toasts.showToast(title + ' could not open. Reopen the image menu and try again.'));
      }, 8000);
      try {
        const cancel = navigation.navigate('BUNNY_CUSTOM_PAGE', { title, __expressionPage: key,
          __expressionOpen: () => entry.open, __expressionCancel: () => close(false), render: Page });
        if (typeof cancel === 'function') entry.cancelNavigation = cancel;
      }
      catch { close(false); safe(() => V.ui.toasts.showToast(title + ' could not open. Reopen the image menu and try again.')); }
    }, 350);
    return true;
  }
  return { open, closeAll() { for (const entry of [...entries]) entry.close(); } };
}
