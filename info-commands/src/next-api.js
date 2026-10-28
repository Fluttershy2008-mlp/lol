const optional = fn => { try { return fn(); } catch { return undefined; } };

export function nextAPI() {
    const valencedAPI = optional(() => typeof valenced !== "undefined" && valenced.modules?.finders ? valenced : undefined);
    if (valencedAPI) return valencedAPI;
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

export function nativeAlerts() {
    const candidates = [
        optional(() => vendetta.metro.findByImportedPath?.("design/components/AlertModal/native/useAlertStore.native.tsx")),
        optional(() => nextAPI()?.discord?.actions?.AlertActionCreators),
    ];
    return candidates.find(actions => optional(() => typeof actions?.openAlert === "function" && typeof actions?.dismissAlert === "function"));
}
