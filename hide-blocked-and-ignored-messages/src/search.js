/* SPDX-License-Identifier: CC0-1.0 */
// Search is an explicit way to view blocked users. Keep it separate from chat
// filtering: no search results, context messages or suggestions are removed.
export function createSearchScope() {
  let depth = 0;
  function run(fn) {
    depth++;
    try { return fn(); } finally { depth--; }
  }
  function dispatch(event, fn) {
    const previous = depth;
    const type = event?.type;
    // Native SearchMessageStore discards records using the combined relationship
    // check during SEARCH_MESSAGES_SUCCESS, before any result getter runs.
    depth = type === 'SEARCH_MESSAGES_SUCCESS' || type === 'SEARCH_FINISH'
      || (typeof type === 'string' && type.startsWith('SEARCH_AUTOCOMPLETE_')) ? previous + 1 : 0;
    try { return fn(); } finally { depth = previous; }
  }
  return { run, dispatch, active: () => depth > 0 };
}

export function installSearch(V, notify = () => {}) {
  const scope = createSearchScope();
  const cleanups = [], stores = new Set(), patched = new WeakMap();
  let stopped = false;
  function patch(object, method, callback) {
    if (stopped || !object || typeof object[method] !== 'function') return;
    const methods = patched.get(object) ?? new Set();
    if (methods.has(method)) return;
    const remove = callback(object, method);
    methods.add(method); patched.set(object, methods); cleanups.push(remove);
  }
  function attachRelationships(module) {
    const store = module?.default ?? module;
    for (const method of ['isBlockedOrIgnored', 'isBlockedOrIgnoredForMessage']) {
      patch(store, method, (object, key) => V.patcher.after(key, object, (_args, result) =>
        !stopped && scope.active() ? false : result));
    }
    // isBlocked/isIgnored and the relationship map are never patched. All checks
    // outside synchronous search work retain Discord's actual relationship.
  }
  function attachStore(module, method) {
    const store = module?.default ?? module;
    patch(store, method, (object, key) => V.patcher.instead(key, object, function (args, original) {
      return stopped ? original.apply(this, args) : scope.run(() => original.apply(this, args));
    }));
    if (store && typeof store[method] === 'function') { stores.add(store); notify(); }
  }
  function attachScreen(module) {
    const component = module?.default ?? module;
    let parent, key;
    // Current AutocompleteScreen is React.memo(function AutocompleteScreen()).
    if (typeof component?.type === 'function') { parent = component; key = 'type'; }
    else if (typeof component?.render === 'function') { parent = component; key = 'render'; }
    else if (typeof module?.default === 'function') { parent = module; key = 'default'; }
    if (parent) patch(parent, key, (object, method) => V.patcher.instead(method, object, function (args, original) {
      // useMemo's author exclusion checks execute synchronously in this render.
      // Event handlers and effects run later, after the exception is removed.
      return stopped ? original.apply(this, args) : scope.run(() => original.apply(this, args));
    }));
  }
  function watch(path, callback) {
    if (typeof V.metro.getModuleWithImportedPath !== 'function') return;
    const remove = V.metro.getModuleWithImportedPath(path, module => { if (!stopped) callback(module); });
    if (typeof remove === 'function') cleanups.push(remove);
  }
  function refresh() {
    for (const store of stores) { try { store.emitChange?.(); } catch {} }
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const cleanup of cleanups.splice(0).reverse()) { try { cleanup(); } catch {} }
    refresh(); stores.clear();
  }
  try {
    try { attachRelationships(V.metro.findByStoreName?.('RelationshipStore')); } catch {}
    try { attachRelationships(V.metro.findByProps?.('isBlockedOrIgnoredForMessage')); } catch {}
    watch('stores/RelationshipStore.tsx', attachRelationships);
    for (const [name, path, method] of [
      ['SearchMessageStore', 'modules/search/SearchMessageStore.tsx', 'getMessages'],
      ['SearchStore', 'stores/SearchStore.tsx', 'getSearchResults'],
      ['SearchAutocompleteStore', 'modules/search/SearchAutocompleteStore.tsx', 'getState'],
    ]) {
      let store;
      try { store = V.metro.findByStoreName?.(name); } catch {}
      attachStore(store, method);
      watch(path, module => attachStore(module, method));
    }
    try { attachScreen(V.metro.findByTypeName?.('AutocompleteScreen')); } catch {}
    try { attachScreen(V.metro.findByName?.('AutocompleteScreen', false)); } catch {}
    watch('modules/search/native/components/layout/autocomplete/AutocompleteScreen.tsx', attachScreen);
  } catch (error) { stop(); throw error; }
  return { refresh, clear() {}, stop,
    dispatch(event, fn) { return stopped ? fn() : scope.dispatch(event, fn); } };
}
