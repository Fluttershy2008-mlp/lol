// Discord's native chat and component-text views share contentHandlers.onTapMention.
// Unresolved mentions carry parsedUserId instead of userId; never treat role IDs
// or arbitrary link text as user IDs.
export function mentionTarget(event) {
    const data = event?.nativeEvent ?? event;
    if (!data || data.roleId != null || data.roleName != null) return;
    const id = data.userId ?? data.parsedUserId;
    if (typeof id !== 'string' || !/^[1-9]\d{16,19}$/.test(id)) return;
    const options = { userId: id };
    for (const key of ['channelId', 'guildId']) {
        if (typeof data[key] === 'string' && /^[1-9]\d{16,19}$/.test(data[key])) options[key] = data[key];
    }
    return options;
}

export function installMentionTaps(V, { isActive, open }) {
    const removers = [], patched = new WeakSet(), factories = new WeakMap(), wrappers = new WeakMap();
    let active = true;
    const live = () => active && isActive();
    const optional = fn => { try { return fn(); } catch {} };
    function wrap(original) {
        if (wrappers.has(original)) return wrappers.get(original);
        const wrapped = function(event, ...rest) {
            const options = live() && mentionTarget(event);
            if (!options) return Reflect.apply(original, this, [event, ...rest]);
            // The replacement owns just this user tap; it does not replay the
            // original handler, which would immediately show the stale popup.
            return open(options);
        };
        wrappers.set(original, wrapped); wrappers.set(wrapped, wrapped);
        return wrapped;
    }
    function attach(module) {
        for (const target of [module?.contentHandlers, module?.default?.contentHandlers, module?.default, module]) {
            if (!target || typeof target.onTapMention !== 'function' || patched.has(target)) continue;
            const remove = optional(() => V.patcher.instead('onTapMention', target, function(args, original) {
                return Reflect.apply(wrap(original), this, args);
            }));
            if (typeof remove === 'function') { patched.add(target); removers.push(remove); }
        }
    }
    function decorate(element) {
        if (!live() || typeof element?.props?.onTapMention !== 'function') return element;
        return V.metro.common.React.cloneElement(element, { onTapMention: wrap(element.props.onTapMention) });
    }
    function attachFactory(module, keys) {
        if (!module || !['object', 'function'].includes(typeof module)) return;
        let done = factories.get(module);
        if (!done) factories.set(module, done = new Set());
        for (const key of keys) if (!done.has(key) && typeof module[key] === 'function') {
            const remove = optional(() => V.patcher.after(key, module, (_args, result) => decorate(result)));
            if (typeof remove === 'function') { done.add(key); removers.push(remove); }
        }
    }
    function scan() {
        if (!live()) return;
        attach(optional(() => V.metro.findByProps('contentHandlers')));
        attach(optional(() => V.metro.findByProps('onTapMention', 'onLongPressLink')));
        attachFactory(optional(() => V.metro.findByProps('jsx', 'jsxs')), ['jsx', 'jsxs', 'jsxDEV']);
    }
    const path = 'components_native/chat/contentHandlers.tsx';
    attach(optional(() => V.metro.findByImportedPath?.(path)));
    const remove = optional(() => V.metro.getModuleWithImportedPath?.(path, module => { if (live()) attach(module); }));
    if (typeof remove === 'function') removers.push(remove);
    attachFactory(V.metro.common.React, ['createElement']);
    scan();
    return { scan, stop() {
        active = false;
        for (const remove of removers.splice(0).reverse()) optional(remove);
    } };
}
