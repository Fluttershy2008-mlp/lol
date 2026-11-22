/* SPDX-License-Identifier: CC0-1.0 */
// Intercept the preview components themselves. Discord still renders the card,
// channel row and its actions, including on clients using a different list implementation.
function installHiddenPreviews(V, filter, isServerRecordSelected, getMessage) {
  const { React } = V.metro.common;
  const jsxRuntime = valenced.react.jsxRuntime;
  const SearchMessage = React.createContext(null);
  const InMessagePreview = React.createContext(false);

  const disposers = [], listeners = new Set(), types = new Set();
  const storage = V.plugin.storage;
  const stores = new Map();
  const previousReplyPreviews = new WeakMap();
  const normalMessages = new WeakMap();
  const previewTargets = new WeakMap();
  let active = true;
  let isMessageContentPreviewable;
  let searchTarget;

  function projectMessage(message) {
    if ((!message?.blocked && !message?.ignored) || !isUserWhitelisted(storage, message.author?.id)) return message;
    let projected = normalMessages.get(message);
    if (!projected) {
      const properties = Object.getOwnPropertyDescriptors(message);
      for (const key of ['blocked', 'ignored']) {
        properties[key] = { value: false, writable: true, enumerable: true, configurable: true };
      }
      projected = Object.create(Object.getPrototypeOf(message), properties);
      normalMessages.set(message, projected);
    }
    return projected;
  }

  function isJumpTarget(message, collection) {
    return Boolean(searchTarget && message?.id === searchTarget.id
      && (message.channel_id ?? message.channelId) === searchTarget.channelId
      && (collection?.jumpTargetId === searchTarget.id || previewTargets.get(collection) === searchTarget)
      && isUserWhitelisted(storage, message.author?.id ?? message.authorId));
  }

  const previewMessages = createCollectionFilter(
    (message, collection) => !isJumpTarget(message, collection) && filter.shouldHide(message),
    undefined, projectMessage);

  function acceptSearchEvent(event) {
    if (event?.type === 'LOGOUT' || event?.type === 'CONNECTION_OPEN') {
      searchTarget = undefined;
      return true;
    }
    // Discord's search previews share a single store. An older response can
    // arrive after the new tap and change the native jump destination.
    return !searchTarget || event?.type !== 'LOAD_MESSAGES_AROUND_SUCCESS'
      || (event.channelId === searchTarget.channelId && event.around === searchTarget.id);
  }

  function refresh() {
    for (const listener of listeners) listener();
  }
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function SearchResult({ element }) {
    return React.createElement(SearchMessage.Provider, { value: element.props?.message?.id ?? null }, element);
  }
  function MessagePreviewScope({ element }) {
    return React.createElement(InMessagePreview.Provider, { value: true }, element);
  }
  function ScopedChatPreview({ element }) {
    return React.useContext(InMessagePreview) ? React.createElement(SearchChatPreview, { element }) : element;
  }
  function SearchChatPreview({ element }) {
    const target = React.useSyncExternalStore(subscribe, () => active ? searchTarget : undefined);
    if (!target || element.props.channelId !== target.channelId) return element;
    const { messages, jumpToChatProps } = element.props;
    if (jumpToChatProps?.jumpTargetId !== target.id) {
      return { ...element, key: target.id, props: { ...element.props, messages: null,
        jumpToChatProps: { ...jumpToChatProps, jumpTargetId: target.id } } };
    }
    if (!Array.isArray(messages)) return { ...element, key: target.id };
    previewTargets.set(messages, target);
    const projected = previewMessages.project(messages);
    previewTargets.set(projected, target);
    return { ...element, key: target.id, props: projected === messages ? element.props
      : { ...element.props, messages: projected } };
  }
  function Preview({ element, isHidden, nativeSearchPreview }) {
    const searchMessageId = React.useContext(SearchMessage);
    const { message } = element.props;
    const read = () => {
      if (!active) return element.type;
      if (nativeSearchPreview && searchMessageId !== null && message?.id === searchMessageId
        && isUserWhitelisted(storage, message.author?.id)) {
        // Use Discord's content renderer directly. The outer preview otherwise
        // replaces content with a relationship placeholder, even in search.
        return isMessageContentPreviewable?.(message) ? nativeSearchPreview : element.type;
      }
      return isHidden(element.props) ? null : element.type;
    };
    const type = React.useSyncExternalStore(subscribe, read, read);
    if (type === null) return null;
    return type === element.type ? element : { ...element, type };
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
  function patchPreview(type, isHidden, nativeSearchPreview) {
    if (!type || types.has(type)) return;
    own(jsxRuntime.afterJSX(type, element => active && element
      ? { ...element, type: Preview, props: { element, isHidden, nativeSearchPreview } } : element));
    types.add(type);
  }
  function watchPreview(path, keys, isHidden) {
    watch(path, module => {
      for (const key of keys) patchPreview(module?.[key], isHidden);
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
  function projectReply(row, manager) {
    const preview = row?.message?.referencedMessage;
    if (row?.type !== 1 || !preview) return row;
    const { id, channelId } = row.message;
    // System previews have only a label. Look up the reply's target by ID so
    // classification works for every language and preserves deleted previews.
    const reply = getMessage(channelId, id);
    const reference = reply?.messageReference ?? reply?.message_reference;
    const targetId = reference?.message_id ?? reference?.messageId;
    const targetChannel = reference?.channel_id ?? reference?.channelId ?? channelId;
    const entry = targetId && stores.get('ReferencedMessageStore')?.getMessage(targetChannel, targetId);
    const target = entry ? entry.message : reply?.referencedMessage ?? reply?.referenced_message
      ?? (targetId && getMessage(targetChannel, targetId));
    const hidden = filter.isFilteredUser(target?.author?.id ?? preview.message?.authorId);

    // ChatManager can mark a cached reply NOOP even though the preview changed.
    // Compare the previous native rows once per changeset to force a rebind only when needed.
    let changeType = row.changeType;
    if (changeType === 0) {
      const previousRows = manager.getPreviousRows?.();
      let previous;
      if (Array.isArray(previousRows)) {
        let previews = previousReplyPreviews.get(previousRows);
        if (!previews) {
          previews = new Map();
          for (const oldRow of previousRows) {
            if (oldRow?.type === 1 && oldRow.message?.id) {
              previews.set(oldRow.message.id, Boolean(oldRow.message.referencedMessage));
            }
          }
          previousReplyPreviews.set(previousRows, previews);
        }
        previous = previews.get(id);
      }
      const wasVisible = previous ?? true;
      if (wasVisible !== !hidden) changeType = 2;
    }
    if (hidden) return { ...row, changeType, message: { ...row.message, referencedMessage: null } };
    return changeType === row.changeType ? row : { ...row, changeType };
  }
  function rebindNativeRow(row, manager, unwrapped) {
    const message = row?.type === 1 ? row.message : undefined;
    if (!message) return row;
    const previous = manager.getPreviousRows?.()?.[manager.rows?.length];
    if (unwrapped && message.isFirst === false) {
      return { ...row, changeType: 2, message: { ...message, isFirst: true } };
    }
    if (row.changeType === 0 && previous?.type === 1
      && (previous.message?.id !== message.id || previous.message?.authorId !== message.authorId
        || previous.message?.channelId !== message.channelId)) {
      return { ...row, changeType: 2 };
    }
    return row;
  }
  function stop() {
    if (!active) return;
    active = false;
    searchTarget = undefined;
    previewMessages.clear();
    for (const remove of disposers.splice(0).reverse()) { try { remove(); } catch {} }
    refresh();
    listeners.clear();
    stores.clear();
    types.clear();
  }

  try {
    watchStore('ReferencedMessageStore', 'modules/replies/ReferencedMessageStore.tsx', 'getMessage');
    watch('actions/native/MessagePreviewActionCreators.tsx', module => {
      const actions = module?.default ?? module;
      if (typeof actions?.fetchMessages !== 'function') return;
      own(V.patcher.instead('fetchMessages', actions, function (args, original) {
        const [channelId, id] = args;
        if (typeof channelId !== 'string' || typeof id !== 'string') return original.apply(this, args);
        const previous = searchTarget;
        const target = { channelId, id };
        searchTarget = target;
        try {
          const result = original.apply(this, args);
          refresh();
          return result;
        } catch (error) {
          if (searchTarget === target) searchTarget = previous;
          throw error;
        }
      }));
    });
    const controls = { acceptSearchEvent, isJumpTarget, projectMessage, projectReply, rebindNativeRow, refresh, stop };
    if (!jsxRuntime?.afterJSX) return controls;
    watchStore('ThreadMessageStore', 'modules/threads/ThreadMessageStore.tsx', 'getMostRecentMessage');
    watch('components_native/common/MessagePreview.tsx', module => {
      if (!module?.default) return;
      own(jsxRuntime.afterJSX(module.default, element => active && element
        ? { ...element, type: MessagePreviewScope, props: { element } } : element));
    });
    watch('components_native/common/ChatPreview.tsx', module => {
      if (!module?.ChatPreview) return;
      own(jsxRuntime.afterJSX(module.ChatPreview, element => active && element
        ? { ...element, type: ScopedChatPreview, props: { element } } : element));
    });
    watch('modules/search/native/components/list/rows/MessageRow.tsx', module => {
      for (const type of new Set([module?.default, module?.HeaderlessMessageRow])) {
        if (!type || types.has(type)) continue;
        own(jsxRuntime.afterJSX(type, element => active && element
          ? { ...element, type: SearchResult, props: { element } } : element));
        types.add(type);
      }
    });
    watch('modules/message_previews/useFormattedMessagePreview.tsx', module => {
      if (typeof module?.isMessageContentPreviewable !== 'function') return;
      isMessageContentPreviewable = module.isMessageContentPreviewable;
      refresh();
    });
    watchPreview('modules/forums/native/posts/ForumPostMessageContent.tsx', ['default'], forumHidden);
    watch('modules/main_tabs_v2/native/shared_components/ChannelRowPreview.tsx', module => {
      const hidden = ({ message }) => filter.shouldHide(message);
      patchPreview(module?.ChannelRowPreview, hidden);
      patchPreview(module?.NativeChannelRowPreview, hidden);
      patchPreview(module?.NativeMessageChannelRowPreview, hidden, module?.NativeChannelRowPreview);
    });
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
    return controls;
  } catch (error) { stop(); throw error; }
}
