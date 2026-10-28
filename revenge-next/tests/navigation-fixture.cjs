'use strict';

// A regular navigator owns these screens. It creates no OS Modal/alert layer.
function installNavigationHost(world, { loadSettingsOnOpen = false } = {}) {
    const { React, navigation } = world, listeners = new Set(), subscribers = new Set();
    const roots = [{ key: 'discord-chat', name: 'Chat', params: {} }], unhandled = [];
    const navigate = navigation.navigate, goBack = navigation.goBack;
    let serial = 0, revision = 0, taps = 0;
    const notify = () => { revision++; for (const fn of [...listeners]) fn(); for (const fn of [...subscribers]) fn(); };
    const route = () => roots.at(-1).state?.routes.at(-1) ?? roots.at(-1);
    const flattened = () => roots.flatMap(item => item.state?.routes ?? [item]);
    navigation.getCurrentRoute = route;
    navigation.getRootState = () => ({ index: roots.length - 1, routes: roots });
    navigation.canGoBack = () => roots.length > 1 || (roots.at(-1).state?.routes.length ?? 0) > 1;
    navigation.addListener = (event, fn) => { if (event === 'state') subscribers.add(fn); return () => subscribers.delete(fn); };
    navigation.navigate = (name, params) => {
        navigate(name, params);
        // Native settings pages are only registered in SettingsNavigator.
        // A root navigate(pluginId) from Chat is unhandled on Discord.
        if (world.registeredScreens.has(name)) {
            if (roots.at(-1).name !== 'settings') { unhandled.push([name, params]); return; }
            roots.at(-1).state.routes.push({ key: 'route-' + ++serial, name, params });
        } else if (name === 'settings') {
            let settings = roots.at(-1);
            if (settings.name !== 'settings') {
                settings = { key: 'settings-' + ++serial, name, params, state: { index: 0, routes: [] } };
                roots.push(settings);
            }
            settings.params = params;
            if (loadSettingsOnOpen) world.setSettingsLoaded(true);
            const child = params?.screen;
            if (child && world.registeredScreens.has(child)) {
                settings.state.routes.push({ key: 'route-' + ++serial, name: child, params: params.params });
            } else if (!settings.state.routes.length) {
                settings.state.routes.push({ key: 'overview-' + ++serial, name: 'SettingsOverview', params: {} });
            }
            settings.state.index = settings.state.routes.length - 1;
        } else roots.push({ key: 'route-' + ++serial, name, params });
        notify();
    };
    navigation.goBack = () => {
        goBack();
        const settings = roots.at(-1);
        if ((settings.state?.routes.length ?? 0) > 1) {
            settings.state.routes.pop(); settings.state.index = settings.state.routes.length - 1;
        } else if (roots.length > 1) roots.pop();
        notify();
    };
    function Root() {
        React.useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
        const current = route(), screen = roots.at(-1).name === 'settings' && world.registeredScreens.get(current.name);
        if (screen) return React.createElement(screen.screen.getComponent(), { key: current.key, route: current });
        return React.createElement('View', { testID: 'discord-screen' },
            React.createElement('Pressable', { accessibilityLabel: 'Discord test control', onPress: () => taps++ }, current.name));
    }
    return { Root, get stack() { return flattened(); }, roots, unhandled, subscribers, taps: () => taps };
}
module.exports = { installNavigationHost };
