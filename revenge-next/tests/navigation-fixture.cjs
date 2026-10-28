'use strict';

// A regular navigator owns these screens. It creates no OS Modal/alert layer.
function installNavigationHost(world) {
    const { React, navigation } = world, listeners = new Set(), subscribers = new Set();
    const stack = [{ key: 'discord-chat', name: 'Chat', params: {} }];
    const navigate = navigation.navigate, goBack = navigation.goBack;
    let serial = 0, revision = 0, taps = 0;
    const notify = () => { revision++; for (const fn of [...listeners]) fn(); for (const fn of [...subscribers]) fn(); };
    navigation.getCurrentRoute = () => stack.at(-1);
    navigation.canGoBack = () => stack.length > 1;
    navigation.addListener = (event, fn) => { if (event === 'state') subscribers.add(fn); return () => subscribers.delete(fn); };
    navigation.navigate = (name, params) => { navigate(name, params); stack.push({ key: 'route-' + ++serial, name, params }); notify(); };
    navigation.goBack = () => { goBack(); if (stack.length > 1) stack.pop(); notify(); };
    function Root() {
        React.useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
        const route = stack.at(-1), screen = world.registeredScreens.get(route.name);
        if (screen) return React.createElement(screen.screen.getComponent(), { key: route.key, route });
        return React.createElement('View', { testID: 'discord-screen' },
            React.createElement('Pressable', { accessibilityLabel: 'Discord test control', onPress: () => taps++ }, route.name));
    }
    return { Root, stack, subscribers, taps: () => taps };
}
module.exports = { installNavigationHost };
