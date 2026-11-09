/* SPDX-License-Identifier: CC0-1.0 */
// Some mobile bars hold their own list snapshot instead of reading the patched
// store getters. Filter that snapshot at its render boundary as well.
export function installGuildBarRenderer(V, servers, filter) {
  const React = V.metro.common.React;
  if (!React?.createElement || !React?.cloneElement) return { refresh() {}, stop() {} };
  let stopped = false;
  const listeners = new Set(), cleanups = [], patched = new WeakMap();
  const names = ['GuildsBar', 'GuildsBarGuild', 'GuildsBarGuildItem', 'GuildsBarItem',
    'GuildsBarFolder', 'GuildsBarAnimatedItemWrapper', 'GuildIcon'];
  function hidden(value) {
    if (stopped || !value || typeof value !== 'object') return false;
    for (const id of [value.guildId, value.guild_id, value.guild?.id, value.id,
      value.item?.guildId, value.item?.guild_id, value.item?.guild?.id, value.item?.id,
      value.node?.guildId, value.node?.id]) {
      if (typeof id === 'string' && servers.isGuildIconHidden(id)) return true;
    }
    return false;
  }
  const callbacks = new WeakMap();
  function wrapCallback(fn) {
    if (!callbacks.has(fn)) callbacks.set(fn, function (...args) {
      return projectElement(fn.apply(this, args));
    });
    return callbacks.get(fn);
  }
  function projectProps(props) {
    if (!props || typeof props !== 'object' || stopped) return props;
    const next = {};
    for (const key of ['data', 'items', 'guilds', 'guildFolders', 'fastListGuildFolders', 'guildIds', 'guild_ids']) {
      if (Array.isArray(props[key])) {
        const value = filter.projectList(props[key]);
        if (value !== props[key]) next[key] = value;
      }
    }
    for (const key of ['tree', 'guildTree', 'guildsTree']) {
      if (props[key]?.root) {
        const value = filter.projectTree(props[key]);
        if (value !== props[key]) next[key] = value;
      }
    }
    for (const key of ['item', 'node', 'folder']) {
      if (props[key] && typeof props[key] === 'object') {
        const value = filter.projectFolder(props[key]);
        if (value !== props[key]) next[key] = value;
      }
    }
    return Object.keys(next).length ? { ...props, ...next } : props;
  }
  function projectElement(element, depth = 0, seen = new Set()) {
    if (stopped || depth > 16 || element == null || typeof element !== 'object') return element;
    if (seen.has(element)) return element;
    if (Array.isArray(element)) {
      seen.add(element);
      const result = element.map(child => projectElement(child, depth + 1, seen));
      seen.delete(element);
      return result.some((child, i) => child !== element[i]) ? result.filter(child => child !== null) : element;
    }
    if (!React.isValidElement(element)) return element;
    if (hidden(element.props)) return null;
    seen.add(element);
    const projected = projectProps(element.props);
    const next = projected === element.props ? {} : { ...projected };
    for (const key of ['renderItem', 'renderSectionHeader', 'renderSectionFooter']) {
      if (typeof element.props[key] === 'function') next[key] = wrapCallback(element.props[key]);
    }
    if (element.props.children != null && typeof element.props.children !== 'function') {
      const children = projectElement(element.props.children, depth + 1, seen);
      if (children !== element.props.children) next.children = children;
    }
    seen.delete(element);
    return Object.keys(next).length ? React.cloneElement(element, next) : element;
  }
  function VisibilityGate({ source, rowProps }) {
    const [, redraw] = React.useState(0);
    React.useEffect(() => {
      const update = () => redraw(n => n + 1);
      listeners.add(update);
      return () => listeners.delete(update);
    }, []);
    return hidden(rowProps) ? null : projectElement(source);
  }
  function patch(owner, key, callback) {
    if (!owner || typeof owner[key] !== 'function') return;
    const keys = patched.get(owner) ?? new Set();
    if (keys.has(key)) return;
    cleanups.push(V.patcher.instead(key, owner, callback));
    keys.add(key); patched.set(owner, keys);
  }
  function attachComponent(module) {
    if (stopped || !module) return;
    const component = module.default ?? module;
    let owner, key;
    if (typeof component.type === 'function') { owner = component; key = 'type'; }
    else if (typeof component.render === 'function') { owner = component; key = 'render'; }
    else if (typeof component.prototype?.render === 'function') { owner = component.prototype; key = 'render'; }
    else if (typeof module.default === 'function') { owner = module; key = 'default'; }
    if (!owner) return;
    patch(owner, key, function (args, original) {
      // Always call the original so its React hook order stays unchanged.
      // VisibilityGate owns our hooks as a separate component.
      const source = original.apply(this, args);
      return stopped ? source : React.createElement(VisibilityGate, { source, rowProps: this?.props ?? args[0] });
    });
  }
  function attachSelector(module) {
    if (stopped || !module) return;
    const key = typeof module.useGuildsBarProps === 'function' ? 'useGuildsBarProps' : 'default';
    patch(module, key, function (args, original) {
      return projectProps(original.apply(this, args));
    });
  }
  function watch(path, callback) {
    if (typeof V.metro.getModuleWithImportedPath !== 'function') return;
    const remove = V.metro.getModuleWithImportedPath(path, callback);
    if (typeof remove === 'function') cleanups.push(remove);
  }
  function refresh() { for (const update of listeners) update(); }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const remove of cleanups.splice(0).reverse()) { try { remove(); } catch {} }
    refresh(); listeners.clear();
  }
  try {
    // Memo wrappers retain their object identity even when callers captured the export.
    // Exact imported paths also support minified functions and modules loaded later.
    for (const name of names) {
      try { attachComponent(V.metro.findByTypeName?.(name)); } catch {}
      try { attachComponent(V.metro.findByName?.(name, false)); } catch {}
      try { attachComponent(V.metro.findByDisplayName?.(name, false)); } catch {}
      watch('modules/guilds_bar/native/' + name + '.tsx', attachComponent);
      if (name !== 'GuildsBar') watch('modules/guilds_bar/native/components/' + name + '.tsx', attachComponent);
    }
    try { attachSelector(V.metro.findByProps?.('useGuildsBarProps')); } catch {}
    watch('modules/guilds_bar/native/useGuildsBarProps.tsx', attachSelector);
    watch('modules/guilds_bar/native/hooks/useGuildsBarProps.tsx', attachSelector);
  } catch (error) { stop(); throw error; }
  return { refresh, stop };
}
