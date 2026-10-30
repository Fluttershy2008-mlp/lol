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

// A native window can outlive the React node while its slide animation finishes.
// Keep this separate from the alert store: removing an entry is not a native
// window dismissal acknowledgement.
function trackNativeWindows(world) {
    const windows = new Set(), Modal = world.RN.Modal;
    world.RN.Modal = function TrackedModal(props) {
        const id = world.React.useRef(Symbol('native-window')).current;
        world.React.useLayoutEffect(() => {
            windows.add(id);
            return () => {
                if (props.animationType === 'none') windows.delete(id);
                else world.host.setTimeout(() => windows.delete(id), 350);
            };
        }, []);
        return world.React.createElement(Modal, props);
    };
    return windows;
}
module.exports.trackNativeWindows = trackNativeWindows;

// Present the resolved native profile on its own sheet surface so the close
// control and Android's onRequestClose exercise distinct exit paths.
function installProfileSheetHost(world) {
    const React = world.React, listeners = new Set(), sheets = new Map();
    const open = world.sheets.openLazy, hide = world.sheets.hideActionSheet;
    let revision = 0;
    const notify = () => { revision++; for (const listener of listeners) listener(); };
    world.sheets.openLazy = function (promise, key, ...args) {
        const result = open.call(this, promise, key, ...args);
        if (/^UserProfile/.test(key)) Promise.resolve(promise).then(module => {
            sheets.set(key, module.default); notify();
        });
        return result;
    };
    world.sheets.hideActionSheet = function (key) {
        hide.call(this, key); sheets.delete(key); notify();
    };
    function Root() {
        React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => revision);
        return React.createElement(React.Fragment, null, ...Array.from(sheets, ([key, Profile]) => {
            const close = () => world.sheets.hideActionSheet(key);
            return React.createElement(world.RN.Modal, { key, visible: true, animationType: 'none',
                testID: 'native-owner-profile', onRequestClose: close },
                React.createElement(Profile),
                React.createElement(world.RN.TouchableOpacity, { accessibilityLabel: 'Close native profile', onPress: close }));
        }));
    }
    return { Root, sheets };
}
module.exports.installProfileSheetHost = installProfileSheetHost;
