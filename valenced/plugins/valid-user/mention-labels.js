// Project names into Discord's native render data, leaving cached ASTs and messages intact.
function projectValidUserLabels(model, username) {
    const mentionToken = /<@!?([1-9]\d{16,19})>/g;
    const displayFields = ['content', 'children', 'embeds', 'fields', 'title', 'description', 'name', 'value',
        'footer', 'author', 'text', 'label', 'components', 'accessory', 'items', 'referencedMessage',
        'threadEmbed', 'message'];
    const literalBranches = new Set(['embeds', 'fields', 'components', 'footer', 'accessory']);
    const opaqueNodes = new Set(['text', 'inlineCode', 'codeBlock', 'code', 'link', 'url', 'autolink']);

    function visit(node, literal, depth) {
        if (depth > 24 || node == null) return node;
        if (typeof node === 'string') {
            return literal && node.includes('<@') ? node.replace(mentionToken, (token, id) => {
                const name = username(id);
                return name ? '@' + name : token;
            }) : node;
        }
        if (typeof node !== 'object') return node;
        if (Array.isArray(node)) {
            let updated;
            node.forEach((child, index) => {
                const next = visit(child, literal, depth + 1);
                if (next !== child) (updated ??= node.slice())[index] = next;
            });
            return updated ?? node;
        }
        if (node.type === 'mention') {
            if (node.roleId != null || node.roleName != null) return node;
            const id = node.parsedUserId ?? node.userId;
            const label = node.content?.[0];
            if (!validId(id) || !Array.isArray(node.content) || node.content.length !== 1 || label?.type !== 'text') return node;
            // Preserve names Discord already rendered, including guild nicknames.
            if (node.userId && label.content !== `<@${id}>` && label.content !== `<@!${id}>`) return node;
            const name = username(id);
            return name ? { ...node, userId: id, content: [{ ...label, content: '@' + name }] } : node;
        }
        if (opaqueNodes.has(node.type)) return node;

        let updated;
        for (const key of displayFields) {
            if (key === 'author' && !literal) continue;
            // Plain display fields can contain literal tokens, but AST text nodes are
            // already parsed and may be escaped Markdown or examples.
            const value = node[key];
            const next = visit(value, literal || literalBranches.has(key), depth + 1);
            if (next !== value) (updated ??= { ...node })[key] = next;
        }
        return updated ?? node;
    }
    return visit(model, false, 0);
}

function installValidUserLabels(V, { users, getChannel, getAccount, autoResolve, lookup }) {
    const { React } = V.metro.common;
    const h = React.createElement;
    const cleanups = [], patchedRows = new WeakSet(), patchedHooks = new WeakSet();
    const listeners = new Set(), rows = new Map(), pending = new Set();
    let active = true, channelId, accountId, manager, timer, revision = 0;
    const optional = fn => { try { return fn(); } catch {} };
    const own = remove => { if (typeof remove === 'function') cleanups.push(remove); };
    const username = id => {
        if (!active || !validId(getAccount())) return;
        const user = optional(() => users.getUser(id));
        if (usableUser(user, id)) return user.username;
    };
    const signature = ids => JSON.stringify(ids.map(username));
    const hasName = ids => ids.some(id => username(id));

    function syncSession() {
        const channel = getChannel(), account = getAccount();
        if (account !== accountId || channel !== channelId) {
            rows.clear(); pending.clear(); manager = undefined;
            channelId = channel; accountId = account;
        }
        return validId(account) && validId(channel);
    }
    function notifyViews() {
        revision++;
        for (const fn of [...listeners]) fn();
    }
    function redraw(ids) {
        if (!ids.size || !manager?.chatRef?.current || manager.channelId !== getChannel()) return;
        return optional(() => {
            manager.updateRows({ updateMessageIds: ids, isAnimated: false });
            return true;
        });
    }
    function schedule() {
        if (!active || timer != null) return;
        timer = setTimeout(() => {
            timer = undefined;
            if (syncSession()) {
                const changed = new Set();
                for (const [id, entry] of rows) {
                    if (entry.signature !== signature(entry.ids) && (entry.signature != null || hasName(entry.ids))) changed.add(id);
                }
                redraw(changed);
            }
            const ids = [...pending];
            pending.clear();
            if (autoResolve() && validId(getAccount())) for (const id of ids) lookup(id);
            notifyViews();
        }, 30);
    }
    function queue(ids) {
        if (!active || !autoResolve() || !validId(getAccount())) return;
        syncSession();
        for (const id of ids) if (pending.size < 100 && !username(id)) pending.add(id);
        if (pending.size) schedule();
    }
    function remember(id, entry) {
        if (rows.size >= 400 && !rows.has(id)) rows.delete(rows.keys().next().value);
        rows.set(id, entry);
    }
    function observe(id, channel, ids) {
        if (!ids.length || !syncSession() || channel !== channelId || !validId(id) || rows.has(id)) return;
        remember(id, { ids });
        if (hasName(ids)) schedule();
    }
    function projectRow(row, depth = 0) {
        if (depth > 8 || !row) return row;
        if ((row.type === 2 || row.type === 6) && Array.isArray(row.content)) {
            const content = row.content.map(child => projectRow(child, depth + 1));
            return content.some((child, i) => child !== row.content[i]) ? { ...row, content } : row;
        }
        if (row.type !== 1 || !row.message) return row;
        const model = row.message, ids = new Set();
        const next = projectValidUserLabels(model, id => { ids.add(id); return username(id); });
        if (syncSession() && model.channelId === channelId && validId(model.id)) {
            const observed = [...ids], prior = rows.get(model.id), key = signature(observed);
            if (ids.size || prior) remember(model.id, { ids: observed, signature: key, projected: next !== model });
            queue(observed);
            // Native chat can reuse a NOOP row even when its rendered mention changed.
            if (row.changeType === 0 && (next !== model || prior?.projected) && prior?.signature !== key) {
                return { ...row, message: next, changeType: 2 };
            }
        }
        return next !== model ? { ...row, message: next } : row;
    }
    function attachRows(module) {
        const prototype = (module?.default ?? module?.ChatManager ?? module)?.prototype;
        if (typeof prototype?.createRow !== 'function' || patchedRows.has(prototype)) return;
        const remove = optional(() => V.patcher.before('createRow', prototype, args => {
            if (active) args[0] = optional(() => projectRow(args[0])) ?? args[0];
        }));
        if (typeof remove === 'function') { patchedRows.add(prototype); own(remove); }
    }
    function attachRowManager(module) {
        if (typeof module?.default !== 'function' || patchedHooks.has(module)) return;
        const remove = optional(() => V.patcher.after('default', module, ([options], result) => {
            if (!active || !syncSession() || options?.channelId !== channelId || typeof result?.updateRows !== 'function') return;
            const first = !manager || manager.chatRef !== options.chatRef;
            manager = { channelId, chatRef: options.chatRef, updateRows: result.updateRows };
            if (first) schedule();
        }));
        if (typeof remove === 'function') { patchedHooks.add(module); own(remove); }
    }
    function watch(path, attach) {
        optional(() => attach(V.metro.findByImportedPath?.(path)));
        own(optional(() => V.metro.getModuleWithImportedPath?.(path, module => { if (active) attach(module); })));
    }

    function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    const snapshot = () => revision;
    function LabelledTextDisplay({ element, model, ids }) {
        React.useSyncExternalStore(subscribe, snapshot, snapshot);
        React.useEffect(() => { queue(ids); }, [ids]);
        const updated = projectValidUserLabels(model, username);
        return updated === model ? element : React.cloneElement(element, { model: JSON.stringify(updated) });
    }
    function decorate(element) {
        const props = element?.props;
        if (!active || !React.useSyncExternalStore || !props?.markdownTextRenderOptions || typeof props.model !== 'string'
            || !props.model.includes('parsedUserId')) return element;
        return optional(() => {
            const model = JSON.parse(props.model), ids = new Set();
            projectValidUserLabels(model, id => { ids.add(id); });
            return ids.size ? h(LabelledTextDisplay, { key: element.key, element, model, ids: [...ids] }) : element;
        }) ?? element;
    }

    optional(() => attachRows(V.metro.findByName?.('ChatManager')));
    optional(() => attachRowManager(V.metro.findByName?.('useRowManager', false)));
    watch('modules/messages/native/renderer/ChatManager.tsx', attachRows);
    watch('modules/messages/native/hooks/useRowManager.tsx', attachRowManager);
    if (typeof users.addChangeListener === 'function' && typeof users.removeChangeListener === 'function') {
        optional(() => { users.addChangeListener(schedule); own(() => users.removeChangeListener(schedule)); });
    }
    return { observe, decorate, refresh: schedule, stop() {
        active = false;
        clearTimeout(timer);
        for (const remove of cleanups.splice(0).reverse()) optional(remove);
        redraw(new Set([...rows].filter(([, entry]) => entry.projected).map(([id]) => id)));
        notifyViews();
        listeners.clear(); rows.clear(); pending.clear(); manager = undefined;
    } };
}
