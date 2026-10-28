'use strict';

// Model the native React alert store: opening mounts a React node, and dismissing
// it unmounts that node. RN.Alert.alert remains a separate OS-dialog API.
function installServerPanelHost(world, { dismissMode = 'immediate', exposeStore = true } = {}) {
    const React = world.React, nodes = new Map(), listeners = new Set();
    const actions = world.U.discord.actions.AlertActionCreators;
    const originalOpen = actions.openAlert, originalDismiss = actions.dismissAlert;
    const pending = [];
    let revision = 0;
    const notify = () => { revision++; for (const listener of listeners) listener(); };
    actions.openAlert = (key, content, onDismiss) => {
        originalOpen(key, content);
        nodes.set(key, { content, onDismiss }); notify();
    };
    actions.dismissAlert = key => {
        originalDismiss(key);
        const entry = nodes.get(key);
        if (dismissMode === 'throw') throw new Error('Native alert dismissal failed');
        if (dismissMode === 'retain') return;
        const remove = () => {
            if (nodes.get(key) !== entry) return;
            nodes.delete(key); notify(); entry?.onDismiss?.();
        };
        if (dismissMode === 'defer') pending.push(remove);
        else remove();
    };
    // The real module also exports its Zustand store. Preserve unrelated alerts
    // when a caller removes an owned entry through setState.
    if (exposeStore) actions.useAlertStore = Object.assign(() => {}, {
        getState: () => ({ alerts: Array.from(nodes, ([key, entry]) => ({ key, node: entry.content, onDismiss: entry.onDismiss })) }),
        setState(update) {
            const previous = this.getState();
            const next = typeof update === 'function' ? update(previous) : update;
            if (!Array.isArray(next.alerts)) return;
            nodes.clear();
            for (const entry of next.alerts) nodes.set(entry.key, { content: entry.node, onDismiss: entry.onDismiss });
            notify();
        },
    });
    else delete actions.useAlertStore;
    function Root() {
        React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => revision);
        return React.createElement(React.Fragment, null,
            ...Array.from(nodes, ([key, entry]) => React.cloneElement(entry.content, { key })));
    }
    return { Root, nodes, flushDismissals() { for (const remove of pending.splice(0)) remove(); },
        clear() { nodes.clear(); notify(); } };
}
module.exports = { installServerPanelHost };
