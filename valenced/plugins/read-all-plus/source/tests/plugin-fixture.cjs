"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { fixture } = require("./fixtures.cjs");

function pluginFixture(options = {}) {
    const f = fixture();
    const cleanups = [], alerts = [], toasts = [], panels = [], patches = [], saved = [], items = new Map(), sections = new Map();
    let hookIndex = 0; const hooks = [];
    const React = {
        createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(1).filter(x => x !== null && x !== undefined) }),
        useState(value) {
            const index = hookIndex++;
            if (!(index in hooks)) hooks[index] = typeof value === "function" ? value() : value;
            return [hooks[index], update => { hooks[index] = typeof update === "function" ? update(hooks[index]) : update; }];
        },
        useEffect() {},
        useMemo(fn) { return fn(); },
    };
    const ReactNative = {
        ...Object.fromEntries(["View", "Text", "Pressable", "Switch", "TextInput", "ScrollView", "FlatList", "Modal"].map(s => [s, s])),
        useWindowDimensions: () => ({ width: options.width || 390, fontScale: options.fontScale || 1 }),
        useColorScheme: () => options.light ? "light" : "dark",
        Alert: { alert: (...args) => alerts.push(args) },
    };
    const unscoped = {
        externals: { ReactNativeSafeAreaContext: { ReactNativeSafeAreaContext: {
            SafeAreaProvider: "SafeAreaProvider", SafeAreaView: "SafeAreaView",
        } } },
        react: { React, ReactNative, ReactJSXRuntime: { jsx() {}, jsxs() {} } },
        patcher: { before: (obj, key, fn) => { const patch = { obj, key, fn, removed: false }; patches.push(patch); return () => { patch.removed = true; }; } },
        discord: {
            flux: { Stores: f.stores }, common: { flux: { Dispatcher: { dispatch: payload => f.env.dispatch(payload) } }, constants: { Constants: {} } },
            actions: {
                ActionSheetActionCreators: { openLazy: (...args) => panels.push(args), hideActionSheet: key => panels.push({ hidden: key }) },
                ToastActionCreators: { open: (...args) => toasts.push(args) },
            },
            design: { Design: { BottomSheet: "BottomSheet" } },
            modules: { settings: {
                onSettingsModulesLoaded(fn) { fn(); return () => {}; },
                registerSettingsItem(key, value) { items.set(key, value); return () => items.delete(key); },
                addSettingsItemToSection(key, value) { sections.set(key, value); return () => sections.delete(key); },
                registerSettingsSection(key, value) { sections.set(key, value); return () => sections.delete(key); }, refreshSettings() {},
            } },
        },
    };
    const context = {
        unscoped, cleanup: (...fns) => cleanups.push(...fns),
        jsonStorage: { get: async () => options.saved || {}, set: async data => { saved.push(structuredClone(data)); } },
        plugin: { startedLate: true, requireReload() {} },
    };
    const script = fs.readFileSync(path.resolve(__dirname, "../../index.js"), "utf8");
    const plugin = new Function("valenced", "plugin", `return ${script}`)(unscoped, x => x).default;
    const init = async () => { plugin.init(context); await new Promise(resolve => setImmediate(resolve)); };
    const render = (props = {}) => { hookIndex = 0; return plugin.SettingsComponent({ api: context, ...props }); };
    const allNodes = root => {
        const list = [];
        const walk = node => { if (!node || typeof node !== "object") return; list.push(node);
            for (const child of node.children || []) walk(child);
            if (node.type !== "FlatList") return;
            walk(node.props.ListHeaderComponent);
            for (const item of node.props.data) walk(node.props.renderItem({ item }));
            if (!node.props.data.length) walk(node.props.ListEmptyComponent); };
        walk(root); return list;
    };
    const textContent = root => {
        if (typeof root === "string" || typeof root === "number") return String(root);
        if (!root) return "";
        if (root.type === "FlatList") return textContent(root.props.ListHeaderComponent) +
            root.props.data.map(item => textContent(root.props.renderItem({ item }))).join("") +
            (root.props.data.length ? "" : textContent(root.props.ListEmptyComponent));
        return (root.children || []).map(textContent).join("");
    };
    const findButton = (root, label) => allNodes(root).find(n => n.type === "Pressable" && (n.props.accessibilityLabel === label || textContent(n) === label));
    return { f, plugin, context, unscoped, init, render, allNodes, textContent, findButton, cleanups, alerts, toasts, panels, patches, saved, items, sections, hooks };
}

module.exports = { pluginFixture };
