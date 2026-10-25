const optional = fn => { try { return fn(); } catch { return undefined; } };

export function nextAPI() {
    return optional(() => typeof revenge !== "undefined" && revenge.modules?.finders ? revenge : undefined);
}

export function nativeSheets() {
    const actions = optional(() => nextAPI()?.discord?.actions?.ActionSheetActionCreators);
    // Next fingerprints the native module. A generic Metro property match can
    // also find an unrelated sheet implementation with these same method names.
    return optional(() => typeof actions?.openLazy === "function" && typeof actions?.hideActionSheet === "function"
        ? actions : undefined);
}

export function nativeDesign(name) {
    return optional(() => nextAPI()?.discord?.design?.Design?.[name]);
}
