/** Coalesce bursts of Discord store events into at most one refresh per interval. */
export function watchStores(stores: any[], refresh: () => void, interval = 80) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;
  const queue = () => {
    if (!active || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (active) refresh();
    }, interval);
  };
  const watched = [...new Set(stores)].filter(store => typeof store?.addChangeListener === "function"
    && typeof store?.removeChangeListener === "function");
  const attached = [];
  for (const store of watched) {
    try { store.addChangeListener(queue); attached.push(store); } catch {}
  }
  return () => {
    active = false;
    clearTimeout(timer);
    for (const store of attached) {
      try { store.removeChangeListener(queue); } catch {}
    }
  };
}
