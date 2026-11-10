/* SPDX-License-Identifier: CC0-1.0 */
// Display-only MessageRecord copies. Never edit the gateway payload or cache.
export function createMentionFilter(isFilteredUser, storage) {
  let cache = new WeakMap();
  const same = (a, b) => a === b || (Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((item, i) => item === b[i]));

  function project(message) {
    if (!message || typeof message !== 'object' || storage.removeMentions === false) return message;
    const original = message.content;
    // Both normal and legacy nickname mentions; role/channel mentions stay intact.
    const content = typeof original === 'string'
      ? original.replace(/<@!?(\d+)>/g, (token, id) => isFilteredUser(id) ? '' : token) : original;
    const mentions = Array.isArray(message.mentions)
      ? message.mentions.filter(user => !isFilteredUser(typeof user === 'string' ? user : user?.id))
      : message.mentions;
    if (content === original && same(mentions, message.mentions)) return message;
    const descriptors = Object.getOwnPropertyDescriptors(message);
    const keys = Reflect.ownKeys(descriptors);
    const previous = cache.get(message);
    if (previous && previous.content === content && same(previous.mentions, mentions)
      && keys.length === previous.keys.length && keys.every(key => {
        const a = descriptors[key], b = previous.descriptors[key];
        return b && a.value === b.value && a.get === b.get && a.set === b.set;
      })) return previous.view;
    const sourceDescriptors = { ...descriptors };
    descriptors.content = { value: content, writable: true, enumerable: true, configurable: true };
    if (Array.isArray(mentions)) {
      descriptors.mentions = { value: mentions, writable: true, enumerable: true, configurable: true };
    }
    const view = Object.create(Object.getPrototypeOf(message), descriptors);
    cache.set(message, { content, mentions, view, keys, descriptors: sourceDescriptors });
    return view;
  }
  return { project, clear: () => { cache = new WeakMap(); } };
}
