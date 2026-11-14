import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectMemberList, memberDimensions, projectThreadMembers, createMemberSearchFilter } from '../hideBlockedAndIgnoredMessages/member-lists.js';

const hidden = id => id === 'blocked' || id === 'ignored';
const member = id => Object.freeze({ type: 'MEMBER', user: Object.freeze({ id }) });
function list() {
    const groups = [
        Object.freeze({ type: 'GROUP', id: 'online', index: 0, count: 4 }),
        Object.freeze({ type: 'GROUP', id: 'offline', index: 5, count: 2 })
    ];
    const rows = [groups[0], member('blocked'), member('friend'), , member('ignored'), groups[1], member('friend2'), member('friend3')];
    return Object.freeze({ groups: Object.freeze(groups), rows: Object.freeze(rows), version: 8, rowHeight: 42, sectionHeight: 40, listId: 'guild:list' });
}
test('member list removes loaded hidden rows, adjusts groups and preserves unloaded slots and the frozen native snapshot', () => {
    const raw = list(), view = projectMemberList(raw, hidden, 1);
    assert.equal(view.rows.length, 6);
    assert.equal(view.rows[1].user.id, 'friend');
    assert.equal(2 in view.rows, false, 'unloaded member remains an unloaded slot');
    assert.deepEqual(view.groups.map(g => [g.index, g.count]), [[0, 2], [3, 2]]);
    assert.equal(view.rows[3].count, 2);
    assert.equal(raw.rows[1].user.id, 'blocked');
    assert.equal(raw.groups[0].count, 4);
    assert.equal(view.listId, raw.listId);
    assert.notEqual(view.version, raw.version);
    assert.notEqual(projectMemberList(raw, hidden, 2).version, view.version);
    assert.equal(projectMemberList(raw, () => false, 3), raw);
});
test('display scroll positions map back to native member subscription ranges', () => {
    const view = projectMemberList(list(), hidden, 1);
    assert.deepEqual(view.hbimMemberGaps, [{ at: 40, height: 42 }, { at: 124, height: 42 }]);
    const dimensions = { y: 60, height: 120, rowHeight: 42, rowsVisible: 2 };
    assert.deepEqual(memberDimensions(view, dimensions), { y: 102, height: 162, rowHeight: 42, rowsVisible: 3 });
    assert.equal(memberDimensions({}, dimensions), dimensions);
    assert.deepEqual(memberDimensions(view, { y: 0, height: 40, rowHeight: 42 }), { y: 0, height: 82, rowHeight: 42, rowsVisible: 1 });
});
test('fully hidden groups collapse, while the content feed and sparse native indexes remain intact', () => {
    const groups = [{ type: 'CONTENT_INVENTORY_GROUP', id: 'feed', index: 5, count: 1 },
        { type: 'GROUP', id: 'gone', index: 0, count: 2 }, { type: 'GROUP', id: 'kept', index: 3, count: 1 }];
    const feed = { type: 'CONTENT_INVENTORY', entry: { id: 'activity' } };
    const raw = { groups, rows: [groups[1], member('blocked'), member('ignored'), groups[2], member('friend'), groups[0], feed], rowHeight: 42, sectionHeight: 40, version: 0 };
    const view = projectMemberList(raw, hidden, 2);
    assert.deepEqual(view.groups.map(g => [g.id, g.index, g.count]), [['feed', 2, 1], ['kept', 0, 1]]);
    assert.equal(view.rows[3], feed);
    assert.deepEqual(view.hbimMemberGaps, [{ at: 0, height: 124 }]);
    assert.equal(memberDimensions(view, { y: 0, height: 42, rowHeight: 42 }).y, 124);
    assert.equal(raw.rows.length, 7);
});
test('unsupported member-list layouts pass through without damaging native rows', () => {
    const raw = list();
    for (const change of [{ rowHeight: () => 42 }, { groups: [{ count: 4 }] }, { rows: {} }, { groups: [{ index: 999, count: 1 }] }]) {
        const unsupported = { ...raw, ...change };
        assert.equal(projectMemberList(unsupported, hidden, 1), unsupported);
    }
});
test('thread sections remove only display user IDs and retain native permissions and metadata', () => {
    const raw = Object.freeze({ online: Object.freeze({ userIds: Object.freeze(['blocked', 'friend']), usersById: { blocked: {}, friend: {} }, sectionId: 'online' }) });
    const view = projectThreadMembers(raw, hidden);
    assert.deepEqual(view.online.userIds, ['friend']);
    assert.equal(view.online.usersById, raw.online.usersById);
    assert.deepEqual(raw.online.userIds, ['blocked', 'friend']);
    assert.equal(projectThreadMembers(raw, () => false), raw);
});
test('desktop member search preserves page keys, native versions and cache identities, then restores on refresh', () => {
    let enabled = true;
    const filter = createMemberSearchFilter(id => enabled && hidden(id));
    const entries = Object.freeze([{ userId: 'blocked' }, { userId: 'friend' }, { userId: 'ignored' }]);
    const raw = Object.freeze([entries, 7]);
    const view = filter.results(raw);
    assert.deepEqual(view[0], [entries[1]]); assert.equal(view[1], 7);
    assert.equal(filter.results(raw)[0], view[0]);
    const pages = Object.freeze([Object.freeze({ 1: Object.freeze(['blocked', 'friend', 'ignored']), 2: Object.freeze(['friend2']) }), 12]);
    const paged = filter.paginated(pages);
    assert.deepEqual(Object.keys(paged[0]), ['1', '2']);
    assert.deepEqual(paged[0][1], ['friend']); assert.equal(paged[0][2], pages[0][2]);
    assert.equal(filter.paginated(pages)[0], paged[0]); assert.equal(paged[1], 12);
    enabled = false; filter.clear();
    assert.equal(filter.results(raw), raw); assert.equal(filter.paginated(pages), pages);
    assert.equal(filter.results(null), null);
});
