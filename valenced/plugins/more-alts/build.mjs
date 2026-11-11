import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { transformSync } from '@babel/core';
import transformBlockScoping from '@babel/plugin-transform-block-scoping';

const here = new URL('./', import.meta.url);
const entry = 'source/plugins/more-alts/js';
const { DEFAULT_STORAGE } = await import(new URL(`${entry}/lib/types.ts`, here));
const runtimeImports = {
    react: 'export default valenced.react.React;',
    'react-native': 'export const { Dimensions, Pressable, ScrollView, View } = valenced.react.ReactNative;',
    '@valenced/react': 'export const { React } = valenced.react;',
    '@valenced/components': 'export const Page = valenced.components?.Page;',
    '@valenced/discord/actions': 'export const { AlertActionCreators } = valenced.discord.actions;',
    '@valenced/discord/design': 'export const { Design } = valenced.discord.design;',
    '@valenced/discord/modules/settings': `export const {
        registerSettingsItem, onSettingsModulesLoaded, refreshSettings,
        refreshSettingsNavigator, refreshSettingsOverviewScreen,
    } = valenced.discord.modules.settings;`,
    '@valenced/externals/react-navigation': `export const ReactNavigationNative =
        valenced.externals?.ReactNavigation?.ReactNavigationNative;`,
    '@valenced/externals/react-native-safe-area-context': `export function useSafeAreaInsets() {
        return valenced.externals?.ReactNativeSafeAreaContext?.ReactNativeSafeAreaContext?.useSafeAreaInsets?.();
    }`,
};
const bundle = await build({
    absWorkingDir: fileURLToPath(here), entryPoints: [`${entry}/index.ts`],
    bundle: true, format: 'cjs', platform: 'neutral', target: 'es2022', write: false,
    tsconfigRaw: { compilerOptions: {} },
    jsxFactory: 'valenced.react.React.createElement', jsxFragment: 'valenced.react.React.Fragment',
    plugins: [{ name: 'valenced-imports', setup(builder) {
        builder.onResolve({ filter: /^(react(-native)?$|@valenced\/)/ }, ({ path }) => {
            if (!Object.hasOwn(runtimeImports, path)) throw new Error(`Unknown runtime import ${path}`);
            return { path, namespace: 'valenced' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'valenced' }, ({ path }) => ({ contents: runtimeImports[path] }));
    } }],
});

// Keep the options factory usable before Valenced initializes React and Metro.
const script = `(() => {
    let options;
    function load(valenced) {
        if (!options) {
            const module = { exports: {} };
            const exports = module.exports;
${bundle.outputFiles[0].text}
            options = module.exports.default;
        }
        return options;
    }
    return { default: {
        jsonStorage: { load: true, default: ${JSON.stringify(DEFAULT_STORAGE)} },
        start(api) { return load(api.unscoped).start(api); },
        SettingsComponent(props) {
            const api = props.api.unscoped;
            return api.react.React.createElement(load(api).SettingsComponent, props);
        },
    } };
})()`;
const output = transformSync(script, {
    babelrc: false, configFile: false, sourceType: 'script', plugins: [transformBlockScoping],
}).code + '\n';
const destination = new URL('index.js', here);
if (process.argv.includes('--check')) {
    if (readFileSync(destination, 'utf8') !== output) throw new Error('More Alts bundle is out of date');
} else writeFileSync(destination, output);
