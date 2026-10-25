const { React, ReactNative: RN } = vendetta.metro.common;

// Wrap each opening separately: Discord caches (and may freeze) its module and
// React elements. Changing either in place also mixes up two open guild menus.
export function wrapGuildSheet(component, live, extendItems, makeRow, Row) {
    const caches = Array.from({ length: 5 }, () => new WeakMap());
    const isInfo = node => node?.key === "info-commands-server-info"
        || node?.props?.label === "Server Info";
    const isRow = node => node?.props && (node.type === Row
        || node.type?.name === "ActionSheetRow" || node.type?.displayName === "ActionSheetRow");

    function inject(tree) {
        let target, kind, duplicate = false, visited = 0;
        function scan(node, depth = 0) {
            if (!node || depth > 30 || ++visited > 1500) return;
            if (Array.isArray(node)) {
                if (!target && Row && node.some(isRow)) { target = node; kind = "rows"; }
                node.forEach(child => scan(child, depth + 1));
            } else if (node.props) {
                if (isInfo(node)) duplicate = true;
                if (!target && Array.isArray(node.props.items)) { target = node; kind = "items"; }
                if (!target && Row && isRow(node.props.children)) { target = node; kind = "child"; }
                scan(node.props.children, depth + 1);
            }
        }
        scan(tree);
        if (duplicate) return { tree, done: true };
        if (!target) return { tree, done: false };
        function replace(node, depth = 0) {
            if (!node || depth > 30) return node;
            if (node === target) {
                if (kind === "items") {
                    const items = extendItems(node.props.items);
                    return items === node.props.items ? node : React.cloneElement(node, { items });
                }
                if (kind === "rows") return [...node, makeRow()];
                return React.cloneElement(node, { children: [node.props.children, makeRow()] });
            }
            if (Array.isArray(node)) {
                const children = node.map(child => replace(child, depth + 1));
                return children.some((child, i) => child !== node[i]) ? children : node;
            }
            if (node.props?.children != null) {
                const children = replace(node.props.children, depth + 1);
                if (children !== node.props.children) return React.cloneElement(node, { children });
            }
            return node;
        }
        return { tree: replace(tree), done: true };
    }

    function transform(tree, level) {
        if (!live()) return tree;
        try {
            const result = inject(tree);
            if (result.done) return result.tree;
            let visited = 0;
            function walk(node, depth = 0) {
                if (!node || depth > 30 || ++visited > 1500) return node;
                if (Array.isArray(node)) return node.map(child => walk(child, depth + 1));
                if (!node.props) return node;
                const children = walk(node.props.children, depth + 1);
                const native = [RN.View, RN.ScrollView, RN.Text, RN.Image, RN.Pressable, RN.TouchableOpacity, Row];
                const type = level < 4 && !native.includes(node.type) ? wrap(node.type, level + 1) : node.type;
                if (type !== node.type) return React.createElement(type, {
                    ...node.props, children, key: node.key,
                    ref: node.props.ref ?? Object.getOwnPropertyDescriptor(node, "ref")?.value,
                });
                return children !== node.props.children ? React.cloneElement(node, { children }) : node;
            }
            return walk(tree);
        } catch (error) {
            console.error("[InfoCommands] Guild sheet injection failed", error);
            return tree;
        }
    }

    function wrap(original, level = 0) {
        if (!original || !["function", "object"].includes(typeof original)) return original;
        const cache = caches[level];
        if (cache.has(original)) return cache.get(original);
        let wrapped = original;
        if (typeof original === "function") {
            if (original.prototype?.isReactComponent) {
                wrapped = class ServerInfoMenu extends original {
                    render() { return transform(super.render(), level); }
                };
            } else {
                wrapped = function ServerInfoMenu(...args) { return transform(original.apply(this, args), level); };
            }
        } else if (original.$$typeof === Symbol.for("react.memo")) {
            wrapped = React.memo(wrap(original.type, level), original.compare);
        } else if (original.$$typeof === Symbol.for("react.forward_ref")) {
            wrapped = React.forwardRef((props, ref) => transform(original.render(props, ref), level));
        }
        cache.set(original, wrapped);
        return wrapped;
    }
    return wrap(component);
}
