/* SPDX-License-Identifier: CC0-1.0 */
// Display-only SortedGuildStore APIs. Never filter getGuildFolders or
// getCompatibleGuildFolders: Discord uses those to save account-wide ordering.
export function createGuildIconFilter(isHidden) {
  function replaceFields(source, fields) {
    const descriptors = Object.getOwnPropertyDescriptors(source);
    for (const [key, value] of Object.entries(fields)) {
      descriptors[key] = { value, enumerable: descriptors[key]?.enumerable ?? true, configurable: true, writable: true };
    }
    return Object.create(Object.getPrototypeOf(source), descriptors);
  }
  function projectList(value, seen = new Set(), depth = 0) {
    if (!Array.isArray(value) || depth > 12 || seen.has(value)) return value;
    seen.add(value);
    const items = []; let changed = false;
    for (const entry of value) {
      if (typeof entry === 'string') {
        if (isHidden(entry)) { changed = true; continue; }
        items.push(entry); continue;
      }
      if (!entry || typeof entry !== 'object') { items.push(entry); continue; }
      const guildId = entry.guildId ?? entry.guild_id ?? entry.guild?.id
        ?? (entry.type !== 'folder' && entry.type !== 'root' && entry.folderId == null ? entry.id : undefined);
      if (typeof guildId === 'string' && isHidden(guildId)) { changed = true; continue; }
      const next = projectFolder(entry, seen, depth + 1);
      // Native standalone servers can be folder-shaped rows without a folder ID.
      const ids = entry.guildIds ?? entry.guild_ids;
      const remaining = next.guildIds ?? next.guild_ids;
      if (entry.type !== 'folder' && entry.folderId == null && entry.id == null
        && Array.isArray(ids) && ids.length > 0 && Array.isArray(remaining) && !remaining.length) {
        changed = true; continue;
      }
      changed ||= next !== entry;
      items.push(next);
    }
    seen.delete(value);
    return changed ? items : value;
  }
  function projectFolder(value, seen = new Set(), depth = 0) {
    if (!value || typeof value !== 'object' || depth > 12 || seen.has(value)) return value;
    seen.add(value);
    const fields = {};
    for (const key of ['guildIds', 'guild_ids', 'children', 'data', 'items']) {
      if (!Array.isArray(value[key])) continue;
      const next = projectList(value[key], seen, depth + 1);
      if (next !== value[key]) fields[key] = next;
    }
    seen.delete(value);
    // Keep empty folder shells and lookup nodes so parent references stay valid.
    return Object.keys(fields).length ? replaceFields(value, fields) : value;
  }
  function projectTree(value) {
    if (!value?.root || !Array.isArray(value.root.children)) return value;
    const root = projectFolder(value.root);
    if (root === value.root) return value;
    const fields = { root };
    if (value.nodes && typeof value.nodes === 'object' && !Array.isArray(value.nodes)) {
      const replacements = {};
      const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (node.id != null && Object.prototype.hasOwnProperty.call(value.nodes, node.id)) replacements[node.id] = node;
        // Only traverse the already bounded projection, protecting cyclic input.
      };
      const queue = [root], seen = new Set();
      while (queue.length && seen.size < 2000) {
        const node = queue.shift();
        if (!node || seen.has(node)) continue;
        seen.add(node); visit(node);
        if (Array.isArray(node.children)) queue.push(...node.children);
      }
      fields.nodes = replaceFields(value.nodes, replacements);
    }
    return replaceFields(value, fields);
  }
  return { projectList, projectFolder, projectTree };
}
