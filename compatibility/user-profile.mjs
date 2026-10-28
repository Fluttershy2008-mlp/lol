// SPDX-License-Identifier: MIT
const USER_PROFILE_MODULE_PATH = 'modules/user_profile/native/showUserProfileActionSheet.tsx';
const profileTry = callback => { try { return callback(); } catch { return undefined; } };

function profileClientAPI() {
    const valencedAPI = profileTry(() => typeof valenced !== 'undefined' ? valenced : undefined);
    if (valencedAPI?.modules?.finders) return valencedAPI;
    return profileTry(() => typeof revenge !== 'undefined' && revenge.modules?.finders ? revenge : undefined);
}

function profileCallable(module) {
    if (typeof module === 'function') return { owner: undefined, call: module };
    if (typeof module?.showUserProfileActionSheet === 'function')
        return { owner: module, call: module.showUserProfileActionSheet };
    if (typeof module?.default === 'function') return { owner: module, call: module.default };
}

export function findUserProfileOpener(legacy, client = profileClientAPI()) {
    const metro = legacy?.metro;
    const imported = profileTry(() => metro?.findByImportedPath?.(USER_PROFILE_MODULE_PATH))
        ?? profileTry(() => client?.discord?.utils?.modules?.finders?.lookupModuleWithImportedPath(USER_PROFILE_MODULE_PATH)?.[0]);
    let opener = profileCallable(imported);
    if (opener) return opener;

    const { finders } = client?.modules ?? {};
    const filters = finders?.filters;
    const namespace = profileTry(() => metro?.findByProps?.('USER_PROFILE_ACTION_SHEET_KEY_PREFIX', 'getUserProfileActionSheetKey'))
        ?? profileTry(() => finders?.lookupModule(filters.withProps('USER_PROFILE_ACTION_SHEET_KEY_PREFIX', 'getUserProfileActionSheetKey'),
            { initialize: false, returnNamespace: true })?.[0]);
    opener = profileCallable(namespace);
    if (opener) return opener;

    // Valenced's own profile action uses this dependency fingerprint to load
    // the opener on demand. Do not initialize unrelated Metro factories.
    const cold = profileTry(() => {
        if (!filters?.withDependencies || !client.discord?.flux?.withStoreName) return;
        const loggerId = client.discord.common?.logger?.LoggerModuleId;
        const trackerId = client.discord.common?.importTracker?.ImportTrackerModuleId;
        const userStoreId = finders.lookupModule(client.discord.flux.withStoreName('UserStore'), { initialize: false })[1];
        if (![loggerId, trackerId, userStoreId].every(id => Number.isInteger(id) && id >= 0)) return;
        const { ordered, relative } = filters.withDependencies;
        const named = filters.withName('showUserProfileActionSheet');
        const marked = filters.withProps('USER_PROFILE_ACTION_SHEET_KEY_PREFIX', 'getUserProfileActionSheetKey');
        const identity = typeof named.or === 'function' ? named.or(marked) : named;
        const fingerprint = filters.withDependencies(ordered([
            loggerId, userStoreId, relative(1), relative(2), relative(3), trackerId,
        ]));
        return finders.lookupModule(identity.and(fingerprint), { initialize: true, returnNamespace: true })[0];
    });
    opener = profileCallable(cold);
    if (opener) return opener;

    const named = profileTry(() => metro?.findByName?.('showUserProfileActionSheet'));
    if (typeof named === 'function') return { owner: undefined, call: named };
    for (const method of ['showUserProfileActionSheet', 'openUserProfileModal', 'openUserProfile', 'showUserProfile']) {
        const module = profileTry(() => metro?.findByProps?.(method));
        if (typeof module?.[method] === 'function') return { owner: module, call: module[method] };
    }
}

export async function openUserProfile(legacy, options, isCurrent = () => true) {
    if (!isCurrent()) return false;
    const opener = findUserProfileOpener(legacy);
    if (!opener || !isCurrent()) return false;
    await Reflect.apply(opener.call, opener.owner, [options, 'stack']);
    return true;
}
