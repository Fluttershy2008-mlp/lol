// Bounded startup retries plus store-driven scans; no permanent polling loop.
export function createAutoScanner({ scan, enabled, onError = () => {} }) {
    let active = false, pending = null;
    const retries = new Set();
    function notify(delay = 100) {
        if (!active || !enabled() || pending !== null) return;
        pending = setTimeout(() => {
            pending = null;
            if (active && enabled()) {
                try { scan(); } catch (error) { onError(error); }
            }
        }, delay);
    }
    function clear() {
        if (pending !== null) clearTimeout(pending);
        pending = null;
        for (const timer of retries) clearTimeout(timer);
        retries.clear();
    }
    function wake() {
        clear();
        if (!active || !enabled()) return;
        notify(0);
        // The selected channel, logged-in user and message cache hydrate separately.
        // Store listeners handle later changes after these startup retries finish.
        for (const delay of [500, 1500, 3000, 6000, 12000, 30000]) {
            const timer = setTimeout(() => { retries.delete(timer); notify(0); }, delay);
            retries.add(timer);
        }
    }
    return {
        notify, wake,
        start() { active = true; wake(); },
        stop() { active = false; clear(); }
    };
}
