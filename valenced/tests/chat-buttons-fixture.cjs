'use strict';
const { React } = require('../../revenge-next/tests/next-harness.cjs');
const h = React.createElement;
function installChatButtonsHost(w) {
    const patches = new Map(), backHandlers = new Set();
    w.importedPathFinders.getModuleWithImportedPath = w.importedPathFinders.getModuleWithImportedPath.bind(w.importedPathFinders);
    const fluxListeners = new Set(), dispatch = w.dispatcher.dispatch.bind(w.dispatcher);
    w.U.discord.flux.onAnyFluxEventDispatched = fn => { fluxListeners.add(fn); return () => fluxListeners.delete(fn); };
    w.dispatcher.dispatch = event => {
        for (const fn of fluxListeners) { event = fn(event); if (!event) return; }
        return dispatch(event);
    };
    w.U.patcher.HookPriority = { HIGHEST: 1000 };
    const jsx = (type, props, key) => {
        let el = h(type, { ...props, ...(key == null ? {} : { key }) });
        for (const patch of patches.get(type) ?? []) el = patch(el);
        return el;
    };
    w.U.react.ReactJSXRuntime = { jsx, jsxs: jsx, Fragment: React.Fragment };
    w.U.react.jsxRuntime = { afterJSX(type, patch) {
        const set = patches.get(type) ?? new Set(); patches.set(type, set); set.add(patch);
        return () => { set.delete(patch); if (!set.size) patches.delete(type); };
    } };
    class Value { constructor(value) { this.value = value; } setValue(v) { this.value = v; } interpolate() { return this.value; } }
    w.RN.Animated = { Value, createAnimatedComponent: type => type, timing: (v, opts) => ({ start: cb => { v.setValue(opts.toValue); cb?.({ finished: true }); }, stop() {} }) };
    w.RN.Easing = { bezier: () => x => x, linear: x => x };
    w.RN.StatusBar = { currentHeight: 24 };
    w.RN.BackHandler = { addEventListener(_type, fn) { backHandlers.add(fn); return { remove: () => backHandlers.delete(fn) }; } };
    w.U.discord.common.tokens = { Tokens: { colors: new Proxy({}, { get: (_, k) => String(k) }), radii: { lg: 12 }, shadows: { SHADOW_HIGH: {} } } };
    const D = w.U.discord.design.Design;
    const originalStyles = D.createStyles;
    D.createStyles = value => typeof value === 'object' ? () => value : originalStyles(value);
    D.useToken = () => '#B5BAC1'; D.TransitionStates = { YEETED: 99 };
    function ContextMenu({ children, items, ...props }) {
        return children({ onPress: () => { w.lastMenu = { ...props, items, positionX: 'right', x: 12, y: 48, requestClose: () => { w.closed = true; } }; } });
    }
    D.ContextMenu = ContextMenu;
    const menuModule = { ContextMenu }, popout = { ContextMenuPopout: () => h(w.RN.Text, null, 'ordinary menu') };
    w.addModule(menuModule, 'design/components/ContextMenu/native/ContextMenu.native.tsx');
    w.addModule(popout, 'design/components/ContextMenu/native/ContextMenuPopout.native.tsx');
    const screenReader = { getIsScreenReaderEnabled: () => false };
    w.addModule(screenReader, 'modules/a11y/native/useIsScreenReaderEnabled.native.tsx');
    const Button = React.memo(function ChatInputActionButton(props) { return h(w.RN.Pressable, props, props.IconComponent && h(props.IconComponent)); });
    const buttonModule = { default: Button };
    w.addModule(buttonModule, 'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx');
    function Expression({ onPressExpression }) { return h(w.RN.Pressable, { onPress: onPressExpression, accessibilityLabel: 'Emoji' }); }
    const Right = React.memo(function ChatInputRightActions({ children }) { return h(w.RN.View, { testID: 'right-actions' }, React.Children.toArray(children)); });
    const rightModule = { default: Right };
    w.addModule(rightModule, 'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx');
    function Send({ onSendMessage }) { return h(w.RN.Pressable, { onPress: onSendMessage, accessibilityLabel: 'Send' }); }
    const inputRef = { current: { getText: () => '', handleTextChanged() {}, insertText() {} } };
    function ChatInput() {
        return h(w.RN.View, { chatInputRef: inputRef },
            h(w.RN.TextInput, { onSelectionOrTextChange() {} }),
            h(w.RN.View, { testID: 'composer-row' },
                h(Right, { key: 'right' }, h(Expression, { onPressExpression: () => w.calls.push(['emoji']) })),
                h(Send, { key: 'send', onSendMessage: () => w.calls.push(['send']) })));
    }
    const chatModule = { default: React.memo(ChatInput) };
    w.addModule(chatModule, 'modules/chat_input/native/ChatInput.tsx');
    return { patches, backHandlers, fluxListeners, chatModule, rightModule, buttonModule, popout, screenReader,
        attachStorage(item) {
            const storage = item.api.jsonStorage, subscribers = new Set();
            storage.cache = { names: {}, kept: {}, seen: {}, ...storage.cache };
            storage.use = () => React.useSyncExternalStore(fn => { subscribers.add(fn); return () => subscribers.delete(fn); }, () => storage.cache);
            const original = storage.set.bind(storage);
            storage.set = async (value, replace) => {
                const next = replace ? value : { ...storage.cache };
                if (!replace) for (const [key, data] of Object.entries(value)) next[key] = { ...next[key], ...data };
                await original(next, true);
                for (const notify of subscribers) notify();
            };
        },
    };
}
module.exports = { installChatButtonsHost };
