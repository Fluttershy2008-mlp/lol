'use strict';

// Model Valenced's dependency-prefiltered lookup for a profile module that
// has not run yet. The public contract is in bundle/lib/modules/src/finders.
function installColdProfileModule(world) {
    for (let index = world.modules.length - 1; index >= 0; index--) {
        const module = world.modules[index];
        if (module?.showUserProfile || module?.showUserProfileActionSheet) world.modules.splice(index, 1);
    }
    const { finders } = world.U.modules;
    const filters = finders.filters;
    const lookup = finders.lookupModule;
    const coldId = 90000, loggerId = 80000, trackerId = 80001;
    const userId = world.modules.indexOf(world.stores.UserStore);
    const deps = new Map([
        [coldId, [loggerId, userId, coldId + 1, coldId + 2, coldId + 3, trackerId]],
        [coldId + 10, [loggerId, 79999, coldId + 11, coldId + 12, coldId + 13, trackerId]],
    ]);
    const make = (predicate, key) => Object.assign(predicate, {
        key,
        or(other) { return make((id, value, initialized = true) => this(id, value, initialized) || other(id, value, initialized), key + '.or'); },
        and(other) { return make((id, value, initialized = true) => initialized
            ? this(id, value, true) && other(id, value, true) : other(id, undefined, false), key + '.and'); },
    });
    const originalName = filters.withName, originalProps = filters.withProps;
    filters.withName = (...args) => make(originalName(...args), 'name.' + args.join(','));
    filters.withProps = (...args) => make(originalProps(...args), 'props.' + args.join(','));
    filters.withDependencies = Object.assign(pattern => make((id) => {
        const actual = deps.get(id);
        return Boolean(actual && pattern.every((value, index) => actual[index] ===
            (value?.relative === undefined ? value : id + value.relative)));
    }, 'profile.dependencies'), { ordered: values => values, relative: offset => ({ relative: offset }) });
    world.U.discord.flux.withStoreName = name => make((_, value) => value?.getName?.() === name, 'store.' + name);
    world.U.discord.common.logger = { LoggerModuleId: loggerId };
    world.U.discord.common.importTracker = { ImportTrackerModuleId: trackerId };

    const namespace = {
        USER_PROFILE_ACTION_SHEET_KEY_PREFIX: 'UserProfile',
        getUserProfileActionSheetKey: id => 'UserProfile' + id,
        default: function a(options, stack) {
            world.calls.push(['profileOpened', options, stack]);
            world.sheets.openLazy(Promise.resolve({ default: () => world.React.createElement(world.RN.Text, null, options.userId) }),
                'UserProfile' + options.userId, options, stack);
        },
    };
    let initialized = false, initializedFactories = 0, unrelatedFactories = 0;
    finders.lookupModule = (filter, opts = {}) => {
        if (opts.initialize === true) {
            for (const id of deps.keys()) {
                const present = id === coldId && initialized;
                if (!filter(id, present ? namespace : undefined, present)) continue;
                if (!present) {
                    if (id !== coldId) { unrelatedFactories++; continue; }
                    initialized = true; initializedFactories++;
                    world.addModule(namespace, 'modules/user_profile/native/showUserProfileActionSheet.tsx');
                }
                const value = filter(id, namespace, true) ? namespace : namespace.default;
                if (filter(id, value, true)) return [opts.returnNamespace ? namespace : value, id];
            }
        }
        return lookup(filter, opts);
    };
    return { namespace, initializedFactories: () => initializedFactories, unrelatedFactories: () => unrelatedFactories };
}

module.exports = { installColdProfileModule };
