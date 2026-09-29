/* SPDX-License-Identifier: CC0-1.0 */
const sameItems = (a, b) => a.length === b.length && a.every((item, i) => item === b[i]);

// Project the list BEFORE Discord groups blocked messages or generates native
// rows. Leave MessageStore.getMessage and the real channel cache untouched.
// Pagination/loading flags and the ChannelMessages prototype are preserved.
export function createCollectionFilter(shouldHide, reportUnsupported = () => {}) {
  let cache = new WeakMap();

  function project(collection) {
    if (!collection || typeof collection !== 'object') return collection;
    const raw = Array.isArray(collection) ? collection : collection._array;
    if (!Array.isArray(raw)) {
      reportUnsupported();
      return collection;
    }
    const visible = raw.filter(message => !shouldHide(message));
    if (visible.length === raw.length) return collection;
    if (Array.isArray(collection)) {
      const previous = cache.get(collection);
      if (previous && sameItems(previous.visible, visible)) return previous.view;
      cache.set(collection, { visible, view: visible });
      return visible;
    }

    const descriptors = Object.getOwnPropertyDescriptors(collection);
    const keys = Reflect.ownKeys(descriptors);
    const previous = cache.get(collection);
    // Discord usually replaces a ChannelMessages instance on changes, but some
    // builds mutate it. Compare visible rows and descriptor values on each read.
    if (previous && sameItems(previous.visible, visible)
      && keys.length === previous.keys.length
      && keys.every(key => {
        const a = descriptors[key], b = previous.descriptors[key];
        return b && a.value === b.value && a.get === b.get && a.set === b.set;
      })) return previous.view;

    const projected = { ...descriptors };
    projected._array = { value: visible, writable: true, enumerable: true, configurable: true };
    // Keep indexed lookups consistent with the displayed collection. Native
    // MessageStore.getMessage still uses the complete original map for replies.
    if (collection._map instanceof Map) {
      const visibleIds = new Set(visible.map(message => message?.id));
      projected._map = { value: new Map([...collection._map].filter(([id]) => visibleIds.has(id))),
        writable: true, enumerable: true, configurable: true };
    } else if (collection._map && typeof collection._map === 'object') {
      const map = Object.create(Object.getPrototypeOf(collection._map));
      for (const message of visible) {
        if (message?.id && Object.prototype.hasOwnProperty.call(collection._map, message.id)) {
          Object.defineProperty(map, message.id, { value: collection._map[message.id],
            writable: true, enumerable: true, configurable: true });
        }
      }
      projected._map = { value: map, writable: true, enumerable: true, configurable: true };
    }
    const view = Object.create(Object.getPrototypeOf(collection), projected);
    cache.set(collection, { visible, view, descriptors, keys });
    return view;
  }
  return { project, clear: () => { cache = new WeakMap(); } };
}
