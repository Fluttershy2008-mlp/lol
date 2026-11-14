// SPDX-License-Identifier: GPL-3.0-or-later

export function visibleMemberIds(ids, isHidden) {
    if (!Array.isArray(ids)) return ids;
    const visible = ids.filter(id => !isHidden(id));
    return visible.length === ids.length ? ids : visible;
}

export function projectThreadMembers(sections, isHidden) {
    if (!sections || typeof sections !== 'object') return sections;
    let view = sections;
    for (const [key, section] of Object.entries(sections)) {
        const userIds = visibleMemberIds(section?.userIds, isHidden);
        if (userIds === section?.userIds) continue;
        if (view === sections) view = { ...sections };
        view[key] = { ...section, userIds };
    }
    return view;
}

// Desktop's member list uses sparse server indexes, including unloaded rows.
// Only its rendered props are projected; the store and subscription cursors stay raw.
export function projectMemberList(props, isHidden, revision) {
    const { groups, rows, rowHeight, sectionHeight } = props;
    if (!Array.isArray(groups) || !Array.isArray(rows) || !Number.isFinite(rowHeight) || rowHeight <= 0
        || !Number.isFinite(sectionHeight) || sectionHeight < 0) return props;
    if (groups.some(group => !Number.isInteger(group.index) || group.index < 0 || !Number.isInteger(group.count)
        || group.count < 0 || group.index + group.count >= rows.length)) return props;

    const hidden = Object.keys(rows).map(Number).filter(index => rows[index]?.type === 'MEMBER' && isHidden(rows[index].user?.id));
    if (!hidden.length) return props;
    hidden.sort((a, b) => a - b);
    const removed = new Set(), changes = new Map(), gaps = [];
    let y = 0;
    for (const group of groups) {
        if (group.type === 'CONTENT_INVENTORY_GROUP') continue;
        const indexes = hidden.filter(index => index > group.index && index <= group.index + group.count);
        changes.set(group, indexes.length);
        for (const index of indexes) removed.add(index);
        if (indexes.length > 0 && indexes.length === group.count) {
            removed.add(group.index);
            gaps.push({ at: y, height: sectionHeight + group.count * rowHeight });
            continue;
        }
        y += sectionHeight;
        indexes.forEach((index, skipped) => gaps.push({ at: y + (index - group.index - 1 - skipped) * rowHeight, height: rowHeight }));
        y += (group.count - indexes.length) * rowHeight;
    }
    if (!removed.size) return props;
    const dropped = [...removed].sort((a, b) => a - b);
    function indexOf(rawIndex) {
        let low = 0, high = dropped.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (dropped[middle] < rawIndex) low = middle + 1; else high = middle;
        }
        return rawIndex - low;
    }
    const visibleRows = new Array(rows.length - dropped.length);
    for (const key of Object.keys(rows)) {
        const index = Number(key);
        if (!removed.has(index)) visibleRows[indexOf(index)] = rows[index];
    }
    const visibleGroups = [];
    for (const group of groups) {
        if (removed.has(group.index)) continue;
        const view = { ...group, index: indexOf(group.index), count: group.count - (changes.get(group) ?? 0) };
        visibleGroups.push(view);
        if (visibleRows[view.index]?.type === 'GROUP') visibleRows[view.index] = view;
    }
    return { ...props, groups: visibleGroups, rows: visibleRows, version: `${props.version}:hbim:${revision}`, hbimMemberGaps: gaps };
}

export function memberDimensions(props, dimensions) {
    const gaps = props?.hbimMemberGaps;
    if (!Array.isArray(gaps) || !Number.isFinite(dimensions?.y) || !Number.isFinite(dimensions?.height)) return dimensions;
    function rawOffset(offset) {
        return offset + gaps.reduce((height, gap) => height + (gap.at <= offset ? gap.height : 0), 0);
    }
    const y = rawOffset(dimensions.y), height = rawOffset(dimensions.y + dimensions.height) - y;
    return { ...dimensions, y, height, rowsVisible: dimensions.rowHeight > 0 ? Math.floor(height / dimensions.rowHeight) : dimensions.rowsVisible };
}

export function createMemberSearchFilter(isHidden) {
    let arrays = new WeakMap(), pages = new WeakMap();
    function members(values) {
        if (!Array.isArray(values)) return values;
        if (!arrays.has(values)) {
            const filtered = values.filter(member => !isHidden(typeof member === 'string' ? member : member?.userId));
            arrays.set(values, filtered.length === values.length ? values : filtered);
        }
        return arrays.get(values);
    }
    function results(tuple) {
        if (!Array.isArray(tuple) || !Array.isArray(tuple[0])) return tuple;
        const view = members(tuple[0]);
        return view === tuple[0] ? tuple : [view, tuple[1]];
    }
    function paginated(tuple) {
        if (!Array.isArray(tuple) || !tuple[0] || typeof tuple[0] !== 'object' || Array.isArray(tuple[0])) return tuple;
        const raw = tuple[0];
        if (!pages.has(raw)) {
            let view = raw;
            for (const [key, page] of Object.entries(raw)) {
                const filtered = members(page);
                if (filtered === page) continue;
                if (view === raw) view = { ...raw };
                view[key] = filtered;
            }
            pages.set(raw, view);
        }
        const view = pages.get(raw);
        return view === raw ? tuple : [view, tuple[1]];
    }
    return { results, paginated, clear() { arrays = new WeakMap(); pages = new WeakMap(); } };
}
