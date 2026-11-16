    function renderableComponent(value) {
        if (typeof value === "function" || typeof value === "string") return value;
        if (value?.$$typeof === Symbol.for("react.memo") || value?.$$typeof === Symbol.for("react.forward_ref")) return value;
    }

    function componentExport(value) {
        return renderableComponent(value) ?? renderableComponent(value?.default);
    }
