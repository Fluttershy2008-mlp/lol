// ValidUser: local parsing and a bounded, cancellable Discord lookup queue.
export const validId = id => typeof id === "string" && /^[1-9]\d{16,19}$/.test(id);
export const usableUser = (user, id) => user?.id === id && typeof user.username === "string"
    && user.username.length > 0 && !/^(unknown[- ]user|deleted user)$/i.test(user.username);

export function extractMentionIds(message) {
    const ids = new Set(), seen = new Set();
    let nodes = 0, characters = 0;
    function visit(node, depth = 0) {
        if (node == null || depth > 16 || ++nodes > 4000 || ids.size >= 40) return;
        if (typeof node === "string") {
            const text = node.slice(0, Math.max(0, 100000 - characters));
            characters += text.length;
            const pattern = /<@!?([1-9]\d{16,19})>|https?:\/\/(?:www\.)?(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/users\/([1-9]\d{16,19})(?!\d)/g;
            let match;
            while (ids.size < 40 && (match = pattern.exec(text))) ids.add(match[1] || match[2]);
            return;
        }
        if (typeof node !== "object" || seen.has(node)) return;
        seen.add(node);
        if (Array.isArray(node)) {
            for (const child of node) visit(child, depth + 1);
        } else {
            // Wire and MessageRecord spellings. Never walk React owners or arbitrary objects.
            for (const key of ["content", "rawContent", "title", "rawTitle", "description", "rawDescription",
                "name", "rawName", "value", "rawValue", "text", "embeds", "fields", "author", "footer",
                "components", "accessory", "message", "messageSnapshots", "message_snapshots",
                "referencedMessage", "referenced_message"]) visit(node[key], depth + 1);
        }
    }
    visit(message);
    return [...ids];
}

export function classifyFailure(error, now = Date.now()) {
    const body = error?.body ?? error?.response?.body ?? {};
    const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
    if (status === 429) {
        const seconds = Number(body.retry_after ?? error?.headers?.["retry-after"] ?? 60);
        const delay = Number.isFinite(seconds) && seconds >= 0 ? Math.max(1000, seconds * 1000 + 250) : 60000;
        return { status: "rate-limited", until: now + delay };
    }
    if (status === 401 || status === 403) return { status: "unavailable", until: now + 60000 };
    if (status === 404 || body.code === 10013) return { status: "unknown", until: now + 300000 };
    return { status: "retry", until: now + 15000 };
}

export function createResolver({ getUser, request, accept, onResolved = () => {},
    isCurrent = () => true, spacing = 500, timeout = 15000, now = Date.now }) {
    const pending = new Map(), failures = new Map(), queue = [], cancellations = new Set();
    let active = true, running = false, blockedUntil = 0, nextRequestAt = 0;
    const current = () => active && isCurrent();
    const cached = id => {
        try { const user = getUser(id); return usableUser(user, id) ? user : null; } catch { return null; }
    };
    function wait(ms) {
        return new Promise(resolve => {
            const finish = () => { clearTimeout(timer); cancellations.delete(finish); resolve(); };
            const timer = setTimeout(finish, ms);
            cancellations.add(finish);
        });
    }
    function timedRequest(id) {
        return new Promise((resolve, reject) => {
            let finished = false;
            const finish = (fn, value) => {
                if (finished) return;
                finished = true; clearTimeout(timer); cancellations.delete(cancel); fn(value);
            };
            const cancel = () => finish(reject, new Error("Lookup cancelled"));
            const timer = setTimeout(() => finish(reject, new Error("Lookup timed out")), timeout);
            cancellations.add(cancel);
            Promise.resolve().then(() => current() ? request(id) : Promise.reject(new Error("Inactive")))
                .then(value => finish(resolve, value), error => finish(reject, error));
        });
    }
    async function lookup(id) {
        if (!current()) return { id, status: "cancelled" };
        const user = cached(id);
        if (user) return { id, status: "resolved", user };
        if (blockedUntil > now()) return { id, status: "rate-limited", until: blockedUntil };
        try {
            const response = await timedRequest(id);
            if (!current()) return { id, status: "cancelled" };
            if (response?.status >= 400) throw response;
            const raw = response?.body?.user ?? response?.body ?? response;
            if (!usableUser(raw, id)) throw new Error("Invalid user response");
            await accept(raw);
            if (!current()) return { id, status: "cancelled" };
            const result = { id, status: "resolved", user: cached(id) ?? raw };
            failures.delete(id);
            try { onResolved(result); } catch {}
            return result;
        } catch (error) {
            if (!current()) return { id, status: "cancelled" };
            const failure = classifyFailure(error, now());
            if (failure.status === "rate-limited") blockedUntil = failure.until;
            if (failures.size >= 500) failures.delete(failures.keys().next().value);
            failures.set(id, failure);
            return { id, ...failure };
        }
    }
    async function pump() {
        if (running) return;
        running = true;
        try {
            while (current() && queue.length) {
                if (nextRequestAt > now()) await wait(nextRequestAt - now());
                if (!current()) break;
                const job = queue.shift();
                const result = await lookup(job.id);
                pending.delete(job.id); job.resolve(result);
                nextRequestAt = now() + spacing;
            }
        } finally {
            running = false;
            if (!current()) for (const job of queue.splice(0)) {
                pending.delete(job.id); job.resolve({ id: job.id, status: "cancelled" });
            }
        }
    }
    function resolve(id) {
        if (!validId(id)) return Promise.resolve({ id, status: "invalid" });
        if (!current()) return Promise.resolve({ id, status: "cancelled" });
        const user = cached(id);
        if (user) return Promise.resolve({ id, status: "resolved", user });
        if (pending.has(id)) return pending.get(id);
        if (blockedUntil > now()) return Promise.resolve({ id, status: "rate-limited", until: blockedUntil });
        const failure = failures.get(id);
        if (failure?.until > now()) return Promise.resolve({ id, ...failure });
        if (pending.size >= 100) return Promise.resolve({ id, status: "busy" });
        const promise = new Promise(resolve => queue.push({ id, resolve }));
        pending.set(id, promise);
        void pump();
        return promise;
    }
    return {
        resolve,
        stop() {
            active = false;
            for (const cancel of [...cancellations]) cancel();
            for (const job of queue.splice(0)) job.resolve({ id: job.id, status: "cancelled" });
            pending.clear(); failures.clear();
        }
    };
}
