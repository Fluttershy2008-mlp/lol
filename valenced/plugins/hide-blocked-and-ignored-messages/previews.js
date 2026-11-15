/* SPDX-License-Identifier: CC0-1.0 */
// Intercept the preview components themselves. Discord still renders the card,
// channel row and its actions, including on clients using a different list implementation.
function installHiddenPreviews(V, filter, isServerRecordSelected) {
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
  function readVoiceFilter() {
    return active && storage.hideServerVoiceActivity !== false ? storage.hiddenServerIds : null;
  }
  function VoiceCarousel({ element }) {
    // Pass the selection to Discord's memoized carousel so edits rerender its
    // data hook without changing the hooks that Discord calls or remounting it.
    const hiddenServerIds = React.useSyncExternalStore(subscribe, readVoiceFilter, readVoiceFilter);
    return React.cloneElement(element, { hideBlockedServerIds: hiddenServerIds });
  }
  function isHiddenVoiceCard(card) {
    switch (card?.kind) {
      case 'voice':
      case 'unified-vc':
      case 'embedded-activity':
        return isServerRecordSelected({ guildId: card.guildId ?? card.voiceState?.guildId,
          channelId: card.voiceState?.channelId });
      case 'live-guild-stage':
        return isServerRecordSelected(card.stage);
      case 'activity':
        return isServerRecordSelected(card.stream);
      default:
        return false;
    }
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
    const carouselPath = 'modules/main_tabs_v2/native/shared_components/happening_now/';
    watch(carouselPath + 'useHappeningNowData.tsx', module => {
      if (typeof module?.default !== 'function') return;
      own(V.patcher.after('default', module, ([, options], result) => {
        if (!readVoiceFilter()?.length || options?.guildId != null || !Array.isArray(result?.[0])) return;
        const cards = result[0];
        const visible = cards.filter(card => !isHiddenVoiceCard(card));
        if (visible.length !== cards.length) return [visible, ...result.slice(1)];
      }));
    });
    watch(carouselPath + 'HappeningNow.tsx', module => {
      if (!module?.default) return;
      own(jsxRuntime.afterJSX(module.default, element => active && element
        ? { ...element, type: VoiceCarousel, props: { element } } : element));
    });
  } catch (error) { stop(); throw error; }
  return { refresh, stop };
}
