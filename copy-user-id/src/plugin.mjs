export function createPlugin(V, env = globalThis) {
  const { React, ReactNative: RN } = V.metro.common;
  const KEY = 'copy-user-id:author';
  const SHEET = 'MessageLongPressActionSheet';
  let active = false, generation = 0, host, Row, clipboard, icon, contextMenus;
  let unpatch, retryTimer, resume;
  const profilePatches = new Map();
  const optional = fn => { try { return fn(); } catch { return undefined; } };
  const byProps = (...props) => optional(() => V.metro.findByProps(...props));
  const byStore = name => optional(() => V.metro.findByStoreName(name));
  const h = React.createElement;
  const validID = id => typeof id === 'string' && /^\d{17,20}$/.test(id) ? id : null;
  const log = error => optional(() => V.logger?.error?.('Copy User ID', error));
  const toast = message => optional(() => V.ui.toasts.showToast(message, icon));

  function authorID(props) {
    if (!props || typeof props !== 'object') return null;
    let message = props.message ?? props.messageRecord;
    if (!message && (props.channelId ?? props.channel_id) && (props.messageId ?? props.message_id)) {
      message = optional(() => byStore('MessageStore')?.getMessage(
        props.channelId ?? props.channel_id, props.messageId ?? props.message_id));
    }
    // IDs stay strings: Discord snowflakes exceed JavaScript's safe integer range.
    // Never fall back to message.id, channel.id, a mention, or a replied-to author.
    return validID(message?.author?.id) ?? validID(message?.authorId) ?? validID(message?.author_id);
  }

  function profileID(props) {
    return validID(props?.user?.id) ?? validID(props?.userId)
      ?? validID(props?.displayProfile?.userId) ?? validID(props?.profile?.userId);
  }

  function copyAction(id, session, hide) {
    return async () => {
      if (!active || session !== generation) return;
      try {
        if (typeof clipboard?.setString !== 'function') throw new Error('Clipboard unavailable');
        await clipboard.setString(id);
        if (!active || session !== generation) return;
        optional(hide);
        toast('Copied user ID');
      } catch (error) {
        log(error);
        if (active && session === generation) toast('Could not copy user ID');
      }
    };
  }

  function makeRow(id, session) {
    const copy = copyAction(id, session, () => host.hideActionSheet(SHEET));
    // Put the actual ID in the label too, so older Row implementations that
    // ignore subLabel still display it. The newline uses the native row's theme.
    return h(Row, {
      key: KEY, label: `Copy User ID\n${id}`,
      icon: Row.Icon && icon != null ? h(Row.Icon, { source: icon }) : undefined,
      iconSource: !Row.Icon ? icon : undefined,
      onPress: copy, onLongPress: copy,
      accessibilityLabel: `Copy user ID ${id}`, accessibilityRole: 'button',
    });
  }

  // Profile overflow menus render plain item objects, rather than message rows.
  // Clone the menu and its groups so frozen data and other plugins are preserved.
  function addProfileItem(items, id, session, hide) {
    if (!Array.isArray(items)) return items;
    const grouped = items.some(Array.isArray);
    const groups = grouped ? items.filter(Array.isArray) : [items];
    if (groups.some(group => group.some(item => item?.id === KEY || item?.key === KEY))) return items;
    const target = groups.find(group => group.some(item => /copy username/i.test(String(item?.label ?? ''))))
      ?? groups.find(group => group.length) ?? groups[0];
    if (!target) return items;
    const item = { id: KEY, key: KEY, label: `Copy User ID\n${id}`,
      action: copyAction(id, session, hide), iconSource: icon };
    const index = target.findIndex(value => /copy username/i.test(String(value?.label ?? '')));
    const position = index >= 0 ? index + 1 : target.length;
    const added = [...target.slice(0, position), item, ...target.slice(position)];
    return grouped ? items.map(group => group === target ? added : group) : added;
  }

  function injectProfile(tree, id, session, hide) {
    let changed = false, visited = 0;
    function walk(node, depth = 0) {
      if (!node || changed || depth > 30 || ++visited > 1500) return node;
      if (Array.isArray(node)) return node.map(child => walk(child, depth + 1));
      if (!node.props) return node;
      if (Array.isArray(node.props.items)) {
        const items = addProfileItem(node.props.items, id, session, hide);
        changed = true;
        return items !== node.props.items ? React.cloneElement(node, { items }) : node;
      }
      if (node.props.children != null) {
        const children = walk(node.props.children, depth + 1);
        return children !== node.props.children ? React.cloneElement(node, { children }) : node;
      }
      return node;
    }
    return walk(tree);
  }

  function connectProfiles() {
    const session = generation;
    const hide = () => {
      if (typeof contextMenus?.hideContextMenu === 'function') contextMenus.hideContextMenu();
      else host?.hideActionSheet?.();
    };
    for (const name of ['UserProfileOverflowMenu', 'BotUserProfileOverflowMenu']) {
      if (profilePatches.has(name)) continue;
      const module = optional(() => V.metro.findByName(name, false));
      if (!module?.default) continue;
      let target = module, method = 'default';
      // Memo and forward-ref exports expose their render function separately.
      while (target[method]?.$$typeof === Symbol.for('react.memo')) {
        target = target[method]; method = 'type';
      }
      if (target[method]?.$$typeof === Symbol.for('react.forward_ref')) {
        target = target[method]; method = 'render';
      }
      if (typeof target[method] !== 'function' || target[method].prototype?.isReactComponent) continue;
      const cleanup = optional(() => V.patcher.after(method, target, (args, tree) => {
        if (!active || generation !== session) return tree;
        const id = profileID(args[0]);
        if (!id) return tree;
        try { return injectProfile(tree, id, session, hide); }
        catch (error) { log(error); return tree; }
      }));
      if (typeof cleanup === 'function') profilePatches.set(name, cleanup);
    }
    if (!profilePatches.has('context') && contextMenus?.showContextMenu) {
      const cleanup = optional(() => V.patcher.before('showContextMenu', contextMenus, args => {
        if (!active || generation !== session) return;
        const menu = args[0];
        const id = profileID(menu) ?? profileID(menu?.context);
        if (!id || !Array.isArray(menu?.items)) return;
        try {
          const items = addProfileItem(menu.items, id, session, hide);
          if (items !== menu.items) args[0] = { ...menu, items };
        } catch (error) { log(error); }
      }));
      if (typeof cleanup === 'function') profilePatches.set('context', cleanup);
    }
  }

  function inject(tree, id, session) {
    let target, score = -1, duplicate = false, visited = 0;
    const label = node => String(node?.props?.label ?? node?.props?.text ?? '');
    const isRow = node => node?.props && typeof node.props.onPress === 'function'
      && (node.type === Row || node.props.label != null || node.props.text != null);
    function scan(node, depth = 0) {
      if (!node || depth > 30 || ++visited > 1500) return;
      if (Array.isArray(node)) {
        const rows = node.filter(isRow);
        // Prefer the copy-text group. Keep locale-independent fallback support.
        const priority = rows.some(row => /copy text/i.test(label(row))) ? 1000 : 0;
        if (rows.length && priority + rows.length > score) {
          target = node; score = priority + rows.length;
        }
        node.forEach(child => scan(child, depth + 1));
      } else if (node.props) {
        if (node.key === KEY) duplicate = true;
        scan(node.props.children, depth + 1);
      }
    }
    scan(tree);
    if (duplicate) return { tree, done: true };
    if (!target) return { tree, done: false };
    const index = target.findIndex(row => /copy text/i.test(label(row)));
    const position = index >= 0 ? index + 1 : target.length;
    const added = [...target.slice(0, position), makeRow(id, session), ...target.slice(position)];
    function replace(node, depth = 0) {
      if (!node || depth > 30) return node;
      if (node === target) return added;
      if (Array.isArray(node)) {
        const children = node.map(child => replace(child, depth + 1));
        return children.some((child, i) => child !== node[i]) ? children : node;
      }
      if (node.props?.children != null) {
        const children = replace(node.props.children, depth + 1);
        return children !== node.props.children ? React.cloneElement(node, { children }) : node;
      }
      return node;
    }
    return { tree: replace(tree), done: true };
  }

  function wrapSheet(component, context, session) {
    const caches = Array.from({ length: 5 }, () => new WeakMap());
    let id = authorID(context);
    const live = () => active && generation === session;
    function transform(props, tree, level) {
      if (!live()) return tree;
      try {
        // The opening's message wins over any nested reply/preview props.
        id ??= authorID(props);
        if (id) {
          const result = inject(tree, id, session);
          if (result.done) return result.tree;
        }
        function walk(node, depth = 0) {
          if (!node || depth > 30) return node;
          if (Array.isArray(node)) return node.map(child => walk(child, depth + 1));
          if (!node.props) return node;
          const children = node.props.children == null ? node.props.children : walk(node.props.children, depth + 1);
          const native = [RN.View, RN.ScrollView, RN.Text, RN.Image, RN.Pressable, RN.TouchableOpacity, Row];
          const type = level < 4 && !native.includes(node.type) ? wrap(node.type, level + 1) : node.type;
          if (type !== node.type) return h(type, { ...node.props, children, key: node.key, ref: node.props.ref ?? node.ref });
          return children !== node.props.children ? React.cloneElement(node, { children }) : node;
        }
        return walk(tree);
      } catch (error) { log(error); return tree; }
    }
    function wrap(original, level = 0) {
      if (!original || !['function', 'object'].includes(typeof original) || level > 4) return original;
      const cache = caches[level];
      if (cache.has(original)) return cache.get(original);
      let wrapped = original;
      if (typeof original === 'function') {
        if (original.prototype?.isReactComponent) {
          wrapped = class CopyUserIDSheet extends original {
            render() { return transform(this.props, super.render(), level); }
          };
        } else {
          wrapped = function CopyUserIDSheet(...args) {
            return transform(args[0], original.apply(this, args), level);
          };
        }
      } else if (original.$$typeof === Symbol.for('react.memo')) {
        wrapped = React.memo(wrap(original.type, level), original.compare);
      } else if (original.$$typeof === Symbol.for('react.forward_ref')) {
        wrapped = React.forwardRef((props, ref) => transform(props, original.render(props, ref), level));
      }
      cache.set(original, wrapped);
      return wrapped;
    }
    return wrap(component);
  }

  function connect() {
    if (!active) return;
    host = byProps('openLazy', 'hideActionSheet');
    Row = byProps('ActionSheetRow')?.ActionSheetRow;
    clipboard = optional(() => V.metro.common.clipboard);
    if (typeof clipboard?.setString !== 'function') clipboard = byProps('setString', 'getString');
    if (typeof clipboard?.setString !== 'function') return;
    icon = ['CopyIcon', 'ic_copy_id', 'ic_copy_24px', 'toast_copy_link']
      .map(name => optional(() => V.ui.assets.getAssetIDByName(name))).find(value => value != null);
    contextMenus = byProps('showContextMenu');
    connectProfiles();
    if (unpatch || !host?.openLazy || !Row) return;
    unpatch = V.patcher.before('openLazy', host, args => {
      const [lazy, key, context] = args;
      if (!active || key !== SHEET || !lazy?.then) return;
      const session = generation;
      // Each opening gets its own wrapper. Do not modify Discord's cached module.
      args[0] = Promise.resolve(lazy).then(module => {
        if (!active || session !== generation || !module?.default) return module;
        return { ...module, default: wrapSheet(module.default, context, session) };
      });
    });
  }
  function onLoad() {
    if (active) return;
    active = true; generation++;
    try { connect(); } catch (error) { log(error); }
    let tries = 0;
    const retry = () => {
      retryTimer = undefined;
      if (!active) return;
      try { connect(); } catch (error) { log(error); }
      if ((!unpatch || !profilePatches.has('UserProfileOverflowMenu')) && ++tries < 30) retryTimer = env.setTimeout(retry, 2000);
      else if (!unpatch) toast('Copy User ID: menu unavailable on this Discord build');
    };
    if (!unpatch || !profilePatches.has('UserProfileOverflowMenu')) retryTimer = env.setTimeout(retry, 2000);
    resume = optional(() => RN.AppState?.addEventListener?.('change', state => {
      if (state === 'active') { try { connect(); } catch (error) { log(error); } }
    }));
  }
  function onUnload() {
    active = false; generation++;
    env.clearTimeout(retryTimer); retryTimer = undefined;
    optional(() => resume?.remove?.()); resume = undefined;
    optional(() => unpatch?.()); unpatch = undefined;
    for (const cleanup of [...profilePatches.values()].reverse()) optional(cleanup);
    profilePatches.clear();
  }
  return { onLoad, onUnload };
}
