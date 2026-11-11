/* SPDX-License-Identifier: CC0-1.0 */

// Discord's GuildChannelUserList feeds UsersFastList with section lengths
// and a (sectionIndex, rowIndex) getter. ChannelMemberStore's sparse rows
// include group headers, so a group's first member is at group.index + 1.
export function projectChannelMemberList(props, data, isFilteredUser, rowHeight, sectionHeight) {
  const { sections, getItemProps, getSectionProps, onScroll } = props;
  const { groups, rows } = data ?? {};
  if (!Array.isArray(groups) || groups.length !== sections.length || !rows
    || !groups.every((group, i) => Number.isSafeInteger(group?.index) && group.count === sections[i])) return props;

  const hidden = Object.keys(rows).map(Number).filter(index => {
    const row = rows[index];
    return Number.isSafeInteger(index) && row?.type === 'MEMBER' && isFilteredUser(row.user?.id);
  }).sort((a, b) => a - b);
  if (!hidden.length) return props;

  const visible = [], scrollGaps = [];
  let cursor = 0, changed = false, y = props.listHeaderSize ?? 0;
  for (const [index, group] of groups.entries()) {
    const start = group.index + 1, end = start + group.count, removed = [];
    while (hidden[cursor] < end) {
      const rowIndex = hidden[cursor++] - start;
      if (rowIndex < 0) continue;
      // The React snapshot and store can differ during a native list update.
      if (getItemProps(index, rowIndex)?.props?.user?.id === rows[start + rowIndex]?.user?.id) {
        removed.push(rowIndex);
      }
    }
    const count = group.count - removed.length;
    changed ||= removed.length > 0;
    if (count === 0 && removed.length) {
      scrollGaps.push([y, sectionHeight + group.count * rowHeight]);
      continue;
    }
    if (group.count > 0 && group.title != null) y += sectionHeight;
    for (const [offset, rowIndex] of removed.entries()) {
      scrollGaps.push([y + (rowIndex - offset) * rowHeight, rowHeight]);
    }
    y += count * rowHeight;
    visible.push({ index, count, removed });
  }
  if (!changed) return props;

  return {
    ...props,
    sections: visible.map(section => section.count),
    getItemProps(sectionIndex, rowIndex) {
      const section = visible[sectionIndex];
      if (!section) return undefined;
      let originalIndex = rowIndex;
      for (const hiddenIndex of section.removed) {
        if (hiddenIndex > originalIndex) break;
        originalIndex++;
      }
      const row = getItemProps(section.index, originalIndex);
      if (!section.removed.length || !row?.props) return row;
      return { ...row, props: { ...row.props, start: rowIndex === 0, end: rowIndex === section.count - 1 } };
    },
    getSectionProps(sectionIndex) {
      const section = visible[sectionIndex];
      if (!section) return undefined;
      const header = getSectionProps(section.index);
      const title = header?.props?.title;
      const suffix = ' — ' + groups[section.index].count;
      if (!section.removed.length || typeof title !== 'string' || !title.endsWith(suffix)) return header;
      return { ...header, props: { ...header.props, title: title.slice(0, -suffix.length) + ' — ' + section.count } };
    },
    onScroll(event) {
      const native = event?.nativeEvent;
      const offset = native?.contentOffset;
      if (typeof onScroll !== 'function' || !rowHeight || !Number.isFinite(offset?.y)) return onScroll?.(event);
      // Discord requests member pages using the original, unfiltered scroll offset.
      let extra = 0;
      for (const [position, height] of scrollGaps) {
        if (position > offset.y) break;
        extra += height;
      }
      return onScroll(extra ? { ...event, nativeEvent: { ...native, contentOffset: { ...offset, y: offset.y + extra } } } : event);
    },
  };
}

export function installChannelMemberList(V, getChannel, isFilteredUser) {
  const metro = V.metro, React = metro.common.React;
  const base = 'modules/main_tabs_v2/native/shared_components/user_list/';
  const listeners = new Set(), cleanups = [];
  let stopped = false, revision = 0;
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const snapshot = () => revision;
  const refresh = () => { revision++; for (const listener of listeners) listener(); };
  const unavailable = { refresh() {}, stop() {} };
  if (typeof metro.getModuleWithImportedPath !== 'function' || !React?.useSyncExternalStore) return unavailable;

  function MembersList({ list, channelId, guildId, rowHeight = 0, sectionHeight = 0 }) {
    const version = React.useSyncExternalStore(subscribe, snapshot);
    return React.useMemo(() => {
      if (stopped) return list;
      try {
        const store = metro.findByImportedPath?.('stores/ChannelMemberStore.tsx')?.default
          ?? metro.findByStoreName?.('ChannelMemberStore');
        const data = store?.getProps?.(guildId, channelId);
        const props = projectChannelMemberList(list.props, data, isFilteredUser, rowHeight, sectionHeight);
        return props === list.props ? list : React.cloneElement(list, props);
      } catch { return list; }
    }, [list, channelId, guildId, version, rowHeight, sectionHeight]);
  }

  function ScaledMembersList({ useRowHeight, useSectionHeight, ...props }) {
    return React.createElement(MembersList, { ...props, rowHeight: useRowHeight(), sectionHeight: useSectionHeight() });
  }
  function wrapList(source, guildId, channelId) {
    const children = source?.props?.children;
    if (!Array.isArray(children)) return source;
    const index = children.findIndex(child => child?.key === 'guild-channel-user-list'
      && Array.isArray(child.props?.sections)
      && typeof child.props.getItemProps === 'function' && typeof child.props.getSectionProps === 'function');
    if (index < 0) return source;
    const next = children.slice();
    const useRowHeight = metro.findByImportedPath?.(base + 'useScaledRowHeight.tsx')?.default;
    const useSectionHeight = metro.findByImportedPath?.(base + 'useScaledSectionHeight.tsx')?.default;
    const List = typeof useRowHeight === 'function' && typeof useSectionHeight === 'function' ? ScaledMembersList : MembersList;
    next[index] = React.createElement(List, { key: next[index].key, list: next[index], guildId, channelId, useRowHeight, useSectionHeight });
    return React.cloneElement(source, undefined, next);
  }

  function attach(module) {
    if (stopped) return;
    const component = module?.default;
    const memo = typeof component?.type === 'function';
    const owner = memo ? component : module, key = memo ? 'type' : 'default';
    if (typeof owner?.[key] !== 'function') return;
    cleanups.push(V.patcher.after(key, owner, ([props], result) => {
      const { channelId, guildId, roleId } = props ?? {};
      if (stopped || !channelId || !guildId || roleId) return;
      try {
        const type = getChannel(channelId)?.type;
        if (type === 0 || type === 5) return wrapList(result, guildId, channelId);
      } catch {}
    }));
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const cleanup of cleanups.splice(0).reverse()) { try { cleanup(); } catch {} }
    refresh();
    listeners.clear();
  }
  try {
    const cancel = metro.getModuleWithImportedPath(base + 'GuildChannelUserList.tsx', attach);
    if (typeof cancel === 'function') cleanups.push(cancel);
  } catch (error) { stop(); throw error; }
  return { refresh, stop };
}
