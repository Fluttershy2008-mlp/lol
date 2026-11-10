/* SPDX-License-Identifier: CC0-1.0 */
// Project the sidebar's display model; ChannelStore and permission data stay real.
// Hide the final renderer too, so ShowHiddenChannels cannot reintroduce locked rows.
export function installChannelLists(V, servers) {
  let stopped = false;
  const cleanups = [], stores = new Set(), models = new Set();
  const patched = new WeakMap(), proxies = new WeakMap(), projected = new WeakSet();
  const hidden = id => !stopped && servers.isGuildChannelListHidden(id);
  function patch(object, key, callback) {
    if (!object || typeof object[key] !== 'function') return;
    const keys = patched.get(object) ?? new Set();
    if (keys.has(key)) return;
    cleanups.push(V.patcher.instead(key, object, callback));
    keys.add(key); patched.set(object, keys);
  }
  function modelView(model) {
    if (!model || typeof model !== 'object' || typeof model.getSections !== 'function') return model;
    if (projected.has(model)) return model;
    if (proxies.has(model)) return proxies.get(model);
    models.add(model);
    const methods = new Map();
    const view = new Proxy(model, { get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (!methods.has(key) || methods.get(key).source !== value) {
        const wrapper = function (...args) {
          const result = Reflect.apply(value, target, args);
          if (!hidden(target.id) || !Array.isArray(result)) return result;
          if (key === 'getSections' && result.every(count => typeof count === 'number')) return result.map(() => 0);
          if (key === 'getRows' && result.every(Array.isArray)) return result.map(() => []);
          return result;
        };
        methods.set(key, { source: value, wrapper });
      }
      return methods.get(key).wrapper;
    } });
    proxies.set(model, view); projected.add(view);
    return view;
  }
  function attachStore(module) {
    if (stopped) return;
    const store = module?.default ?? module;
    for (const key of ['getGuild', 'getGuildWithoutChangingGuildActionRows']) {
      patch(store, key, function (args, original) {
        const result = original.apply(this, args);
        if (stopped) return result;
        if (result?.guildChannels) return { ...result, guildChannels: modelView(result.guildChannels) };
        return modelView(result);
      });
    }
    if (store) stores.add(store);
  }
  function attachLegacyStore(module) {
    if (stopped) return;
    const store = module?.default ?? module;
    patch(store, 'getChannels', function (args, original) {
      const result = original.apply(this, args);
      if (!hidden(args[0]) || !result || typeof result !== 'object' || Array.isArray(result)) return result;
      const descriptors = Object.getOwnPropertyDescriptors(result);
      for (const key of Object.keys(result)) {
        if (Array.isArray(result[key])) descriptors[key] = { value: [], enumerable: descriptors[key].enumerable, configurable: true, writable: true };
      }
      return Object.create(Object.getPrototypeOf(result), descriptors);
    });
    if (store) stores.add(store);
  }
  function attachRenderer(module) {
    if (stopped) return;
    const renderer = module?.default ?? module;
    const guild = options => options?.guildChannels?.id;
    patch(renderer, 'renderChannelListItem', function (args, original) {
      return hidden(guild(args[0])) ? null : original.apply(this, args);
    });
    patch(renderer, 'getChannelListItemSize', function (args, original) {
      return hidden(guild(args[0])) ? 0 : original.apply(this, args);
    });
  }
  function watch(path, callback) {
    if (typeof V.metro.getModuleWithImportedPath !== 'function') return;
    const remove = V.metro.getModuleWithImportedPath(path, callback);
    if (typeof remove === 'function') cleanups.push(remove);
  }
  function refresh() {
    for (const model of models) { try { model.invalidate?.(); } catch {} }
    for (const store of stores) { try { store.emitChange?.(); } catch {} }
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const remove of cleanups.splice(0).reverse()) { try { remove(); } catch {} }
    refresh(); models.clear(); stores.clear();
  }
  try {
    try { attachStore(V.metro.findByStoreName?.('ChannelListStore')); } catch {}
    try { attachLegacyStore(V.metro.findByStoreName?.('GuildChannelStore')); } catch {}
    try { attachRenderer(V.metro.findByProps?.('renderChannelListItem', 'getChannelListItemSize')); } catch {}
    watch('modules/guild_sidebar/ChannelListStore.tsx', attachStore);
    watch('stores/GuildChannelStore.tsx', attachLegacyStore);
    watch('modules/channel_list_v2/native/renderRedesignChannelListItem.tsx', attachRenderer);
  } catch (error) { stop(); throw error; }
  return { refresh, stop };
}
