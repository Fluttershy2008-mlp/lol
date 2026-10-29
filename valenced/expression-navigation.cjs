// SPDX-License-Identifier: MIT
// Replaces openLegacyPage in the Valenced expression picker package. Settings routes
// belong to SettingsNavigator; they are not routes of the root Chat navigator.
// Uses the enclosing adapter's scoped timers, route and disposal ownership.
function openLegacyPage(navigation, params) {
    if (!active) return;
    if (typeof params?.render !== 'function') throw new Error('The plugin page has no renderer.');
    const settings = U.discord.modules?.settings;
    if (!settings?.onSettingsModulesLoaded || !settings.registerSettingsItem)
        throw new Error('Update Valenced to open this plugin page.');
    let cancelled = false, timer, unsubscribe, readySubscription, loadingSubscription;
    const live = () => active && !cancelled && params.__expressionOpen?.() !== false;
    const cancel = own(() => {
        cancelled = true;
        clearTimeoutScoped(timer);
        unsubscribe?.(); readySubscription?.(); loadingSubscription?.();
    });
    const navigate = () => {
        if (!live()) return;
        timer = setTimeoutScoped(() => {
            if (!live()) return;
            loadingSubscription?.(); loadingSubscription = undefined;
            navigation.navigate('settings', { screen: legacyRoute, params });
        }, 0);
    };
    const registered = () => {
        if (!live()) return;
        if (!routeRegistered) {
            const unregister = settings.registerSettingsItem(legacyRoute, {
                type: 'route', parent: metadata.id, unsearchable: true,
                useTitle: () => metadata.legacyManifest.name,
                screen: { route: legacyRoute, getComponent: () => LegacyPage },
            });
            routeRegistered = true;
            own(() => { unregister(); routeRegistered = false; settings.refreshSettings(); });
            settings.refreshSettings();
        }
        navigate();
    };
    const start = () => {
        if (!live()) return;
        // Open the real Settings navigator first when its lazy modules have not
        // loaded. Waiting for their registration without doing this deadlocks.
        if (settings.isSettingsModulesLoaded?.() === false) {
            // Back during a cold Settings load cancels this opening. A module
            // becoming available later must not navigate the user away again.
            if (navigation.getRootState && navigation.addListener) {
                let entered = false;
                const changed = () => {
                    let state = navigation.getRootState(), loading = false;
                    for (let depth = 0; depth < 12 && state?.routes?.length; depth++) {
                        const route = state.routes[state.index ?? state.routes.length - 1];
                        if (route?.params?.__expressionLoading === params.__expressionPage) loading = true;
                        state = route?.state;
                    }
                    if (loading) entered = true;
                    else if (entered && live()) { params.__expressionCancel?.(); cancel(); }
                };
                const remove = navigation.addListener('state', changed);
                loadingSubscription = typeof remove === 'function' ? remove : () => navigation.removeListener?.('state', changed);
            }
            navigation.navigate('settings', { __expressionLoading: params.__expressionPage });
        }
        unsubscribe = settings.onSettingsModulesLoaded(registered);
    };
    if (navigation.isReady?.() === false && navigation.addListener) {
        const ready = () => { readySubscription?.(); start(); };
        const remove = navigation.addListener('ready', ready);
        readySubscription = typeof remove === 'function' ? remove : () => navigation.removeListener?.('ready', ready);
    } else start();
    return cancel;
}
