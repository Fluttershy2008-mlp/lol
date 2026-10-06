/* SPDX-License-Identifier: GPL-3.0-or-later */

// Vendetta's finders require uninitialized Metro factories while searching.
// Optional features must never do that during Discord's startup.
export function createModuleResolver(metro, { now = Date.now } = {}) {
    const entries = new Map();
    const modules = metro.modules;
    const loadedOnly = !!modules && typeof modules === 'object';
    function entry(kind, keys) {
        const id = JSON.stringify([kind, ...keys]);
        if (!entries.has(id)) entries.set(id, { kind, keys, value: undefined, checked: -Infinity });
        return entries.get(id);
    }
    function inspect(record, exports) {
        if (record.value || !exports) return;
        try {
            if (record.kind === 'props' ? record.keys.every(key => exports[key] != null)
                : typeof exports.getName === 'function' && exports.getName.length === 0 && exports.getName() === record.keys[0]) record.value = exports;
        } catch {}
    }
    function inspectModule(module, records) {
        // Do not invoke the factory, __r, or read exports on uninitialized modules.
        if (!module?.isInitialized || module.hasError) return;
        let exports;
        try { exports = module.publicModule?.exports; } catch { return; }
        for (const record of records) {
            try { if (exports?.__esModule) inspect(record, exports.default); } catch {}
            inspect(record, exports);
        }
    }
    function lookup(kind, keys) {
        const record = entry(kind, keys);
        if (record.value || now() - record.checked < 5000) return record.value;
        record.checked = now();
        if (loadedOnly) {
            for (const id in modules) { try { inspectModule(modules[id], [record]); } catch {} if (record.value) break; }
        } else {
            // Older loaders without the module registry: user actions only.
            try { record.value = kind === 'props' ? metro.findByProps(...keys) : metro.findByStoreName(keys[0]); } catch {}
        }
        return record.value;
    }
    return {
        loadedOnly,
        byProps: (...keys) => lookup('props', keys),
        byStore: name => lookup('store', [name]),
        clear() { entries.clear(); },
        async prepare(queries, yieldFrame, isActive) {
            if (!loadedOnly) return;
            const records = queries.map(([kind, ...keys]) => entry(kind, keys));
            let count = 0;
            for (const id in modules) {
                if (!isActive()) return;
                try { inspectModule(modules[id], records); } catch {}
                if (records.every(record => record.value)) break;
                if (++count % 64 === 0) await yieldFrame();
            }
            if (isActive()) for (const record of records) record.checked = now();
        }
    };
}
