import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildIconFilter } from '../hideBlockedAndIgnoredMessages/guild-icons.js';
const HIDE = '400000000000000001', KEEP = '400000000000000002';
const filter = createGuildIconFilter(id => id === HIDE);
class Folder {
  constructor(id, children) { this.type = 'folder'; this.id = id; this.children = children; }
  getGuilds() { return this.children.map(child => child.id); }
}
test('projects nested frozen folders even when the root item count does not change; preserves prototypes and lookup nodes', () => {
  const hidden = Object.freeze({ type: 'guild', id: HIDE, parentId: 7, children: [] });
  const visible = Object.freeze({ type: 'guild', id: KEEP, parentId: 7, children: [] });
  const folder = Object.freeze(new Folder(7, Object.freeze([hidden, visible])));
  const tree = Object.freeze({ version: 8, root: Object.freeze({ children: Object.freeze([folder]) }), nodes: Object.freeze({ [HIDE]: hidden, [KEEP]: visible, 7: folder }) });
  const result = filter.projectTree(tree);
  assert.notEqual(result, tree); assert.equal(result.root.children.length, 1);
  assert.deepEqual(result.root.children[0].getGuilds(), [KEEP]);
  assert.equal(result.nodes[7], result.root.children[0]); assert.equal(result.nodes[HIDE], hidden);
  assert.deepEqual(folder.getGuilds(), [HIDE, KEEP]); assert.equal(tree.nodes[7], folder);
});
test('flat native lists remove slots, clean folder previews, keep empty shells and return unchanged data by identity', () => {
  const native = Object.freeze([{ folderId: undefined, guildIds: [HIDE] }, { id: HIDE, children: [] }, HIDE, KEEP, Object.freeze({ folderId: 3, guildIds: Object.freeze([HIDE]) })]);
  const result = filter.projectList(native);
  assert.equal(result.length, 2); assert.equal(result[0], KEEP); assert.deepEqual(result[1].guildIds, []);
  assert.equal(native.length, 5); assert.deepEqual(native[4].guildIds, [HIDE]);
  const unchanged = Object.freeze([KEEP, { type: 'guild', id: KEEP }]);
  assert.equal(filter.projectList(unchanged), unchanged);
});
test('malformed and cyclic native data remains safe and toggling restores original objects', () => {
  const cycle = { type: 'folder', id: 9, children: [] }; cycle.children.push(cycle);
  assert.equal(filter.projectList(cycle.children), cycle.children);
  for (const value of [null, undefined, {}, new Map(), 42]) assert.equal(filter.projectTree(value), value);
  let enabled = true;
  const live = createGuildIconFilter(id => enabled && id === HIDE), source = [HIDE, KEEP];
  assert.deepEqual(live.projectList(source), [KEEP]); enabled = false;
  assert.equal(live.projectList(source), source);
});
