/* SPDX-License-Identifier: CC0-1.0 */
import { isUserWhitelisted } from './whitelist.js';

// Native schema used by Valenced's own hide-blocked-messages plugin:
// ChatManager.createRow receives type 1 messages or type 2/6 groups containing
// generated message rows in `content`. Unwrap at this boundary, after native
// grouping, without changing RelationshipStore or mutating message records.
export function projectNativeRows(row, storage, isFilteredUser, isServerMessageHidden = () => false) {
  if (row?.type === 1 && isServerMessageHidden(row.message)) return [];
  if (!row || (row.type !== 2 && row.type !== 6)) return [row];
  const children = [], seen = new Set();
  function collect(value, depth) {
    if (!value || depth > 8 || seen.has(value)) return false;
    seen.add(value);
    if (value.type === 1 && typeof value.message?.authorId === 'string') {
      children.push(value); return true;
    }
    if ((value.type !== 2 && value.type !== 6) || !Array.isArray(value.content)) return false;
    return value.content.every(child => collect(child, depth + 1));
  }
  // Unknown native layouts pass through rather than inventing row fields.
  if (!collect(row, 0) || !children.length) return [row];
  const filtered = children.map(child => isServerMessageHidden(child.message) || isFilteredUser(child.message.authorId));
  const whitelisted = children.some(child => isUserWhitelisted(storage, child.message.authorId));
  if (!whitelisted && !filtered.some(Boolean)) return [row];
  // Native createRow will assign a consecutive index to each top-level child.
  // Force a native rebind when the prior cached row was a blocked group.
  return children.filter((_child, index) => !filtered[index])
    .map(child => ({ ...child, changeType: 2 }));
}

export function installNativeRows(V, storage, isFilteredUser, isServerMessageHidden) {
  let stopped = false;
  const patched = new WeakSet(), cleanups = [];
  function attach(module) {
    if (stopped) return;
    const ChatManager = module?.default ?? module?.ChatManager ?? module;
    const prototype = ChatManager?.prototype;
    if (!prototype || typeof prototype.createRow !== 'function' || patched.has(prototype)) return;
    const unpatch = V.patcher.instead('createRow', prototype, function (args, original) {
      if (stopped) return original.apply(this, args);
      let rows;
      try { rows = projectNativeRows(args[0], storage, isFilteredUser, isServerMessageHidden); }
      catch { return original.apply(this, args); }
      if (rows.length === 1 && rows[0] === args[0]) return original.apply(this, args);
      let result;
      for (const row of rows) result = original.apply(this, [row, ...args.slice(1)]);
      return result;
    });
    patched.add(prototype); cleanups.push(unpatch);
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const cleanup of cleanups.splice(0).reverse()) { try { cleanup(); } catch {} }
  }
  try {
    try { attach(V.metro.findByName?.('ChatManager')); } catch {}
    if (typeof V.metro.getModuleWithImportedPath === 'function') {
      // Handles ChatManager being loaded after the plugin starts. Registration
      // is owned by the adapter and also removed explicitly on plugin unload.
      const cancel = V.metro.getModuleWithImportedPath(
        'modules/messages/native/renderer/ChatManager.tsx', attach);
      if (typeof cancel === 'function') cleanups.push(cancel);
    }
  } catch (error) { stop(); throw error; }
  return stop;
}
