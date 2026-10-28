'use strict';

// Model the native React alert store: opening mounts a React node, and dismissing
// it unmounts that node. RN.Alert.alert remains a separate OS-dialog API.
function installServerPanelHost(world) {
    const React = world.React, nodes = new Map(), listeners = new Set();
    const actions = world.U.discord.actions.AlertActionCreators;
    const originalOpen = actions.openAlert, originalDismiss = actions.dismissAlert;
    let revision = 0;
    const notify = () => { revision++; for (const listener of listeners) listener(); };
    actions.openAlert = (key, content, onDismiss) => {
        originalOpen(key, content);
        nodes.set(key, { content, onDismiss }); notify();
    };
    actions.dismissAlert = key => {
        originalDismiss(key);
        const entry = nodes.get(key);
        nodes.delete(key); notify(); entry?.onDismiss?.();
    };
    function Root() {
        React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => revision);
        return React.createElement(React.Fragment, null,
            ...Array.from(nodes, ([key, entry]) => React.cloneElement(entry.content, { key })));
    }
    return { Root, nodes };
}
module.exports = { installServerPanelHost };
