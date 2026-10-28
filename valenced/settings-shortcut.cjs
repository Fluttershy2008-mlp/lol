// SPDX-License-Identifier: MIT
'use strict';

// Add a native Valenced overview row while retaining the plugin-manager settings
// entry. Included only in the four packages configured for these shortcuts.
function withValencedSettingsShortcut(options, config) {
    let current;
    function dispose(session) {
        if (!session?.active) return;
        session.active = false;
        if (current === session) current = undefined;
        for (const notify of [...session.listeners]) {
            try { notify(); } catch (error) { session.warn(error); }
        }
        for (const remove of session.disposers.splice(0).reverse()) {
            try { remove(); } catch (error) { session.warn(error); }
        }
        session.refresh?.();
    }
    return {
        ...options,
        async start(api) {
            if (current?.active) return;
            const session = { active: true, registered: false, listeners: new Set(), disposers: [],
                warn: error => api.logger?.warn?.('Could not add ' + config.title + ' to Valenced settings.', error?.message ?? String(error)),
                refresh: undefined };
            current = session;
            const live = () => session.active && current === session;
            api.cleanup(() => dispose(session));
            try { await options.start?.call(this, api); }
            catch (error) { dispose(session); throw error; }
            if (!live()) return;
            const U = api.unscoped, { React, ReactNative: RN } = U.react;
            const settings = U.discord.modules?.settings;
            if (!settings?.onSettingsModulesLoaded || !settings.registerSettingsItem || !settings.addSettingsItemToSection) {
                session.warn('Native settings registration is unavailable; use the plugin settings button.');
                return;
            }
            session.refresh = () => { try { settings.refreshSettings?.(); } catch (error) { session.warn(error); } };
            const subscribe = listener => { session.listeners.add(listener); return () => session.listeners.delete(listener); };
            function SettingsPage({ navigation } = {}) {
                const enabled = React.useSyncExternalStore(subscribe, live, live);
                React.useLayoutEffect(() => { navigation?.setOptions?.({ title: config.title }); }, [navigation]);
                return enabled ? React.createElement(options.SettingsComponent, { api })
                    : React.createElement(RN.Text, { style: { padding: 20 } }, 'Reopen ' + config.title + ' from Valenced settings.');
            }
            function Icon(props) {
                let id;
                try { id = U.assets.getAssetIdByName(config.icon) ?? U.assets.getAssetIdByName('PuzzlePieceIcon'); } catch {}
                if (id == null) return null;
                return U.components?.TableRowAssetIcon
                    ? React.createElement(U.components.TableRowAssetIcon, { ...props, id })
                    : React.createElement(RN.Image, { source: id, style: { width: 24, height: 24 } });
            }
            const key = config.id + '.valenced-settings';
            const register = () => {
                if (!live() || session.registered) return;
                const added = [];
                try {
                    added.push(settings.registerSettingsItem(key, {
                        type: 'route', parent: null, IconComponent: Icon,
                        useTitle: () => config.title, usePredicate: live,
                        screen: { route: key, getComponent: () => SettingsPage },
                    }));
                    // Publish the renderer before making its row visible.
                    if (live()) added.push(settings.addSettingsItemToSection('VALENCED', key));
                    if (!live()) {
                        for (const remove of added.reverse()) remove?.();
                        return;
                    }
                    session.disposers.push(...added);
                    session.registered = true;
                    session.refresh();
                } catch (error) {
                    for (const remove of added.reverse()) { try { remove?.(); } catch {} }
                    session.warn(error);
                }
            };
            // The core settings callback installs the VALENCED section. Register
            // after those callbacks finish, including on the first settings open.
            try {
                const unsubscribe = settings.onSettingsModulesLoaded(() => { Promise.resolve().then(register); });
                if (typeof unsubscribe === 'function') {
                    if (live()) session.disposers.push(unsubscribe);
                    else unsubscribe();
                }
            } catch (error) { session.warn(error); }
        },
        stop(...args) {
            dispose(current);
            return options.stop?.apply(this, args);
        },
    };
}

module.exports = { withValencedSettingsShortcut };
