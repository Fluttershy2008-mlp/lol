/* SPDX-License-Identifier: CC0-1.0 */
const SEARCH_DROP = Symbol('hidden search result');
const equalSearchItems = (a, b) => a.length === b.length && a.every((item, index) => item === b[index]);

export function createSearchProjection(filter, projectMessage = message => message) {
  let cache = new WeakMap();
  function arrayView(source, values) {
    if (equalSearchItems(source, values)) return source;
    const previous = cache.get(source);
    if (previous?.values && equalSearchItems(previous.values, values)) return previous.view;
    cache.set(source, { values, view: values });
    return values;
  }
  function objectView(source, updates) {
    const entries = Object.entries(updates);
    if (entries.every(([key, value]) => source[key] === value)) return source;
    const descriptors = Object.getOwnPropertyDescriptors(source), keys = Reflect.ownKeys(descriptors);
    const previous = cache.get(source);
    if (previous?.updates && entries.every(([key, value]) => previous.updates[key] === value)
      && keys.length === previous.keys.length && keys.every(key => {
        const a = descriptors[key], b = previous.descriptors[key];
        return b && a.value === b.value && a.get === b.get && a.set === b.set;
      })) return previous.view;
    const projected = { ...descriptors };
    for (const [key, value] of entries) projected[key] = { value, enumerable: true, configurable: true, writable: true };
    const view = Object.create(Object.getPrototypeOf(source), projected);
    cache.set(source, { updates, descriptors, keys, view });
    return view;
  }
  function messageIn(value) {
    if (value?.author?.id) return value;
    if (value?.message?.author?.id) return value.message;
  }
  function result(value, seen, depth) {
    if (!value || typeof value !== 'object' || depth > 8 || seen.has(value)) return value;
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        // Older search layouts group a matching hit with surrounding messages.
        // If all actual hits are hidden, don't turn their context into a result.
        const hits = value.filter(item => item?.hit === true || item?.message?.hit === true);
        if (hits.length && hits.every(item => {
          const message = messageIn(item); return message && filter.shouldHide(message);
        })) return SEARCH_DROP;
        const projected = value.map(item => result(item, seen, depth + 1)).filter(item => item !== SEARCH_DROP);
        if (depth > 0 && value.length && !projected.length) return SEARCH_DROP;
        return arrayView(value, projected);
      }
      const message = messageIn(value);
      if (message) {
        if (filter.shouldHide(message)) return SEARCH_DROP;
        const projected = projectMessage(message);
        return value === message ? projected : objectView(value, { message: projected });
      }
      const updates = {};
      for (const key of ['messages', 'results']) {
        if (Array.isArray(value[key])) {
          const projected = result(value[key], seen, depth + 1);
          updates[key] = projected === SEARCH_DROP ? arrayView(value[key], []) : projected;
        }
      }
      return objectView(value, updates);
    } finally { seen.delete(value); }
  }
  function results(value) {
    const projected = result(value, new Set(), 0);
    return projected === SEARCH_DROP ? [] : projected;
  }
  function autocomplete(state) {
    if (!state || !Array.isArray(state.autocompletes)) return state;
    const groups = state.autocompletes.map(group => {
      if (!Array.isArray(group?.results)) return group;
      const visible = group.results.filter(item => {
        const id = item?.user?.id ?? item?.userId ?? item?.user_id;
        return !filter.isFilteredUser(id);
      });
      if (!visible.length && group.results.length) return SEARCH_DROP;
      return objectView(group, { results: arrayView(group.results, visible) });
    }).filter(group => group !== SEARCH_DROP);
    return objectView(state, { autocompletes: arrayView(state.autocompletes, groups) });
  }
  return { results, autocomplete, clear: () => { cache = new WeakMap(); } };
}

export function installSearch(V, filter, projectMessage, notify = () => {}) {
  const projection = createSearchProjection(filter, projectMessage);
  const cleanups = [], stores = new Set(), patched = new WeakMap();
  let stopped = false;
  const specifications = [
    ['SearchMessageStore', 'modules/search/SearchMessageStore.tsx', 'getMessages', projection.results],
    ['SearchStore', 'stores/SearchStore.tsx', 'getSearchResults', projection.results],
    ['SearchAutocompleteStore', 'modules/search/SearchAutocompleteStore.tsx', 'getState', projection.autocomplete],
  ];
  function attach(module, method, project) {
    if (stopped) return;
    const store = module?.default ?? module;
    if (!store || typeof store[method] !== 'function') return;
    const methods = patched.get(store) ?? new Set();
    if (methods.has(method)) return;
    const remove = V.patcher.after(method, store, (_args, value) => {
      if (stopped) return;
      try { return project(value); } catch { return value; }
    });
    methods.add(method); patched.set(store, methods); stores.add(store); cleanups.push(remove);
    notify();
  }
  function refresh() {
    projection.clear();
    for (const store of stores) { try { store.emitChange?.(); } catch {} }
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const cleanup of cleanups.splice(0).reverse()) { try { cleanup(); } catch {} }
    refresh(); stores.clear();
  }
  try {
    for (const [name, path, method, project] of specifications) {
      let store;
      try { store = V.metro.findByStoreName?.(name); } catch {}
      attach(store, method, project);
      if (typeof V.metro.getModuleWithImportedPath === 'function') {
        const remove = V.metro.getModuleWithImportedPath(path, module => attach(module, method, project));
        if (typeof remove === 'function') cleanups.push(remove);
      }
    }
  } catch (error) { stop(); throw error; }
  return { refresh, clear: projection.clear, stop };
}
