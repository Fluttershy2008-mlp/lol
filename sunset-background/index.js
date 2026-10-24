(() => {
    "use strict";

    // fluttershy_simper: dedicated chat wallpaper for Revenge Classic/Vendetta.
    const { React, ReactNative: RN } = vendetta.metro.common;
    const WALLPAPER = "https://images2.alphacoders.com/872/872984.png";
    const NAMES = ["MessagesConnected", "Messages", "ChatView"];
    const MEMO = Symbol.for("react.memo");
    const FORWARD = Symbol.for("react.forward_ref");
    const listeners = new Set();
    let active = false;
    let unpatch = null;
    let imageErrorLogged = false;

    function optional(fn) {
        try { return fn(); } catch (_) { return undefined; }
    }

    // Avoid the legacy toast bridge: its queued UI can fail asynchronously in
    // newer Discord builds, outside a synchronous try/catch in this plugin.
    function log(text, error) {
        optional(() => vendetta.logger.warn("[Sunset Background] " + text, error));
    }

    // Resolve the method React actually calls. A stray .render property on a
    // function is not a React renderer; older core patches can leave one there.
    function targetFor(owner, key) {
        const seen = new Set();
        for (let depth = 0; owner && depth < 12; depth++) {
            const value = owner[key];
            if (!value || seen.has(value)) return null;
            seen.add(value);
            if (value.$$typeof === MEMO) {
                owner = value;
                key = "type";
            } else if (value.$$typeof === FORWARD) {
                owner = value;
                key = "render";
            } else if (typeof value === "function" && typeof value.prototype?.render === "function") {
                return { owner: value.prototype, key: "render" };
            } else if (typeof value === "function") {
                return { owner, key };
            } else {
                return null;
            }
        }
        return null;
    }

    function candidates(module, name) {
        if (!module || (typeof module !== "object" && typeof module !== "function")) return [];
        const found = [];
        for (const key of [name, "default"]) {
            const candidate = optional(() => targetFor(module, key));
            if (candidate) found.push(candidate);
        }
        // Direct memo/forwardRef and class exports do not need a namespace.
        if (module.$$typeof === MEMO || module.$$typeof === FORWARD) {
            const key = module.$$typeof === MEMO ? "type" : "render";
            const candidate = optional(() => targetFor(module, key));
            if (candidate) found.push(candidate);
        }
        if (typeof module.prototype?.render === "function") {
            found.push({ owner: module.prototype, key: "render" });
        }
        return found;
    }

    function modulesFor(name) {
        const metro = vendetta.metro;
        return [
            optional(() => metro.findByProps(name)),
            optional(() => metro.findByDisplayName?.(name, false)),
            optional(() => metro.findByName?.(name, false)),
            optional(() => metro.findByTypeName?.(name, false)),
            optional(() => metro.findByDisplayName?.(name)),
            optional(() => metro.findByTypeName?.(name)),
        ].filter(Boolean);
    }

    function isMessageSurface(element) {
        const props = element?.props;
        if (!props) return false;
        if (Object.prototype.hasOwnProperty.call(props, "HACK_fixModalInteraction")) return true;
        const id = String(props.testID ?? props.nativeID ?? "");
        return /^(?:chat[-_]?messages|messages[-_]?list|chat[-_]?view)$/i.test(id);
    }

    function isNativeContainer(element) {
        return [RN.View, RN.ScrollView, RN.FlatList, RN.VirtualizedList].filter(Boolean).includes(element?.type);
    }

    // Clone only containers on the path to the message surface. Embeds, images,
    // cards, touch handlers, refs and message content retain their original props.
    function foreground(tree) {
        let budget = 1200;
        function visit(node, depth) {
            if (--budget < 0 || depth > 24) return { node, found: false };
            if (Array.isArray(node)) {
                let found = false;
                const values = node.map(child => {
                    const result = visit(child, depth + 1);
                    found ||= result.found;
                    return result.node;
                });
                return { node: found ? values : node, found };
            }
            if (!React.isValidElement(node)) return { node, found: false };
            const surface = isMessageSurface(node);
            if (surface) {
                const props = { style: [node.props.style, { backgroundColor: "transparent" }] };
                if (node.props.contentContainerStyle) {
                    props.contentContainerStyle = [node.props.contentContainerStyle, { backgroundColor: "transparent" }];
                }
                return { node: React.cloneElement(node, props), found: true };
            }
            const children = visit(node.props.children, depth + 1);
            if (!children.found) return { node, found: false };
            const props = {};
            if (isNativeContainer(node)) props.style = [node.props.style, { backgroundColor: "transparent" }];
            return { node: React.cloneElement(node, props, children.node), found: true };
        }
        const result = visit(tree, 0);
        if (result.found) return result.node;
        // Named ChatView can return a host container without the legacy marker.
        // Only clear its outer shell, not all descendants or arbitrary components.
        if (React.isValidElement(tree) && isNativeContainer(tree)) {
            return React.cloneElement(tree, { style: [tree.props.style, { backgroundColor: "transparent" }] });
        }
        return tree;
    }

    function Background({ children }) {
        const [enabled, setEnabled] = React.useState(active);
        React.useEffect(() => {
            listeners.add(setEnabled);
            setEnabled(active);
            return () => listeners.delete(setEnabled);
        }, []);
        if (!enabled) return children;

        // If the original core patch succeeded, avoid nesting its background.
        // Keep the original children intact so disabling restores that output.
        let content = children;
        if (React.isValidElement(content) && content.type?.name === "ThemeBackground") {
            content = content.props.children;
        }

        return React.createElement(RN.View, {
            style: { flex: 1, backgroundColor: "#1B1419" },
        }, React.createElement(RN.Image, {
            source: { uri: WALLPAPER },
            resizeMode: "cover",
            pointerEvents: "none",
            accessible: false,
            importantForAccessibility: "no-hide-descendants",
            style: {
                position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
                width: "100%", height: "100%", opacity: 0.35,
            },
            onError(error) {
                if (!active || imageErrorLogged) return;
                imageErrorLogged = true;
                log("Wallpaper download failed.", error?.nativeEvent?.error);
            },
        }), foreground(content));
    }

    function onLoad() {
        if (active) return;
        if (!React?.createElement || !React?.cloneElement || !RN?.View || !RN?.Image || typeof vendetta.patcher?.after !== "function") {
            throw new Error("Sunset Background: this client does not expose the required Revenge Classic APIs.");
        }
        imageErrorLogged = false;
        const seen = new WeakMap();
        for (const name of NAMES) {
            for (const module of modulesFor(name)) {
                for (const target of candidates(module, name)) {
                    let keys = seen.get(target.owner);
                    if (!keys) seen.set(target.owner, keys = new Set());
                    if (keys.has(target.key)) continue;
                    keys.add(target.key);
                    try {
                        unpatch = vendetta.patcher.after(target.key, target.owner, (_, rendered) => {
                            if (!active || rendered == null || rendered === false) return rendered;
                            try {
                                if (React.isValidElement(rendered) && rendered.type === Background) return rendered;
                                return React.createElement(Background, null, rendered);
                            } catch (error) {
                                log("Could not wrap this chat render.", error);
                                return rendered;
                            }
                        });
                        if (typeof unpatch !== "function") throw new Error("The patcher did not return a cleanup function.");
                        active = true;
                        listeners.forEach(listener => listener(true));
                        return;
                    } catch (error) {
                        unpatch = null;
                        log("Could not patch " + name + "." + target.key, error);
                    }
                }
            }
        }
        throw new Error("Sunset Background: no compatible chat renderer was found. Check the Revenge version in Settings > About; this addon targets Revenge Classic/Vendetta.");
    }

    function onUnload() {
        active = false;
        listeners.forEach(listener => optional(() => listener(false)));
        listeners.clear();
        optional(() => unpatch?.());
        unpatch = null;
    }

    return { onLoad, onUnload };
})()
