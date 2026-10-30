/* SPDX-License-Identifier: GPL-3.0-or-later */
// Injected only into More Alts' native adapters, inside createLegacyAdapter.
function persistMoreAltsStorage(nextStorage, isCurrent = () => true) {
    const snapshot = JSON.parse(JSON.stringify(nextStorage));
    const operation = writes.then(async () => {
        if (!active || !isCurrent()) throw new Error('Account storage is unavailable.');
        await api.jsonStorage.set(snapshot, true);
        // JsonStorage.set can resolve even when its native write failed. get()
        // reads the file, whereas cache alone cannot establish persistence.
        const saved = await api.jsonStorage.get();
        if (JSON.stringify(saved) !== JSON.stringify(snapshot))
            throw new Error('Account storage verification failed.');
        if (!active || !isCurrent()) throw new Error('Account action was cancelled.');
        // Reuse these exact objects when the controller commits the save. That
        // avoids a redundant proxy-triggered file rewrite after verification.
        raw.accounts = snapshot.accounts;
        raw.accountOrder = snapshot.accountOrder;
        return snapshot;
    });
    // Keep subsequent writes usable after a failure, while returning the real
    // rejection to the account action. Never log snapshots or session values.
    writes = operation.catch(() => {});
    return operation;
}
