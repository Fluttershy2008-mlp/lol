/* SPDX-License-Identifier: CC0-1.0 */
// Intercept the preview components themselves. Discord still renders the card,
// channel row and its actions, including on clients using a different list implementation.
function installHiddenPreviews(V, filter) {
  const { React } = V.metro.common;
  const jsxRuntime = valenced.react.jsxRuntime;
  if (!jsxRuntime?.afterJSX) return { refresh() {}, stop() {} };

  const disposers = [], listeners = new Set(), types = new Set();
  const storage = V.plugin.storage;
  const stores = new Map();
  let active = true;

  function refresh() {
    for (const listener of listeners) listener();
  }
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function Preview({ element, isHidden }) {
    const read = () => active && isHidden(element.props);
    const hidden = React.useSyncExternalStore(subscribe, read, read);
    return hidden ? null : element;
  }
  function own(remove) {
    if (typeof remove === 'function') disposers.push(remove);
  }
  function watch(path, callback) {
    own(V.metro.getModuleWithImportedPath?.(path, module => {
      if (active) callback(module);
    }));
  }
  function watchPreview(path, keys, isHidden) {
    watch(path, module => {
      for (const key of keys) {
        const type = module?.[key];
        if (!type || types.has(type)) continue;
        own(jsxRuntime.afterJSX(type, element => active && element
          ? { ...element, type: Preview, props: { element, isHidden } } : element));
        types.add(type);
      }
    });
  }
  function watchStore(name, path, method) {
    function attach(store) {
      if (typeof store?.[method] !== 'function' || stores.has(name)) return;
      stores.set(name, store);
      if (store.addChangeListener && store.removeChangeListener) {
        store.addChangeListener(refresh);
        disposers.push(() => store.removeChangeListener(refresh));
      }
      if (listeners.size) refresh();
    }
    attach(V.metro.findByStoreName?.(name));
    if (!stores.has(name)) watch(path, module => attach(module?.default ?? module));
  }
  function forumHidden({ message, senderModifier }) {
    if (filter.shouldHide(message)) return true;
    if (message?.author?.id) return false;
    // A blocked/ignored sender modifier can arrive before the starter record.
    return (senderModifier === 'blocked' && storage.blocked !== false)
      || (senderModifier === 'ignored' && storage.ignored !== false);
  }
  function threadHidden({ thread }) {
    const message = stores.get('ThreadMessageStore')?.getMostRecentMessage(thread?.id);
    return filter.shouldHide(message);
  }
  function threadStarterHidden({ channelId, messageId }) {
    const referenced = stores.get('ReferencedMessageStore')?.getMessage(channelId, messageId)?.message;
    return filter.shouldHide(referenced);
  }
  function stop() {
    if (!active) return;
    active = false;
    for (const remove of disposers.splice(0).reverse()) { try { remove(); } catch {} }
    refresh();
    listeners.clear();
    stores.clear();
    types.clear();
  }

  try {
    watchStore('ThreadMessageStore', 'modules/threads/ThreadMessageStore.tsx', 'getMostRecentMessage');
    watchStore('ReferencedMessageStore', 'modules/replies/ReferencedMessageStore.tsx', 'getMessage');
    watchPreview('modules/forums/native/posts/ForumPostMessageContent.tsx', ['default'], forumHidden);
    watchPreview('modules/main_tabs_v2/native/shared_components/ChannelRowPreview.tsx',
      ['ChannelRowPreview', 'NativeChannelRowPreview', 'NativeMessageChannelRowPreview'],
      ({ message }) => filter.shouldHide(message));
    watchPreview('modules/threads/native/components/ThreadBrowserRowSubtext.tsx', ['ThreadSubtext'], threadHidden);
    watchPreview('modules/threads/native/components/ThreadParentMessage.tsx', ['ThreadChannelStarterMessage'], threadStarterHidden);
  } catch (error) { stop(); throw error; }
  return { refresh, stop };
}
