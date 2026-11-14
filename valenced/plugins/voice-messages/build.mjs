import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { transformSync } from '@babel/core';
import transformBlockScoping from '@babel/plugin-transform-block-scoping';

const imports = {
    react: 'export const { useEffect, useRef, useState } = valenced.react.React;',
    'react/jsx-runtime': 'export const { jsx, jsxs, Fragment } = valenced.react.ReactJSXRuntime;',
    'react-native': 'export const { AppState, Image, PermissionsAndroid, Platform, StyleSheet, View } = valenced.react.ReactNative;',
    '@valenced/assets': 'export const { getAssetIdByName } = valenced.assets;',
    '@valenced/discord/actions': 'export const { AlertActionCreators } = valenced.discord.actions;',
    '@valenced/discord/common/constants': 'export const { Constants } = valenced.discord.common.constants;',
    '@valenced/discord/design': 'export const { Design } = valenced.discord.design;',
    '@valenced/discord/flux': 'export const { Stores } = valenced.discord.flux;',
    '@valenced/discord/utils/modules/finders': 'export const { getModuleWithImportedPath, lookupModuleWithImportedPath } = valenced.discord.utils.modules.finders;',
    '@valenced/modules/finders': 'export const { lookupModule } = valenced.modules.finders;',
    '@valenced/modules/finders/filters': 'export const { withProps } = valenced.modules.finders.filters;',
    '@valenced/modules/native': 'export const { callNativeMethod, getNativeModule } = valenced.modules.native;',
    '@valenced/react/jsx-runtime': 'export const { afterJSX } = valenced.react.jsxRuntime;',
};
const bundle = await build({
    absWorkingDir: fileURLToPath(new URL('./', import.meta.url)),
    entryPoints: ['source/js/index.tsx'],
    bundle: true, format: 'cjs', platform: 'neutral', target: 'es2022',
    jsx: 'automatic', write: false,
    plugins: [{
        name: 'valenced-runtime',
        setup(builder) {
            builder.onResolve({ filter: /^(react(?:-native|\/jsx-runtime)?$|@valenced\/)/ }, ({ path }) => {
                if (!Object.hasOwn(imports, path)) throw new Error(`Unknown runtime import ${path}`);
                return { path, namespace: 'valenced' };
            });
            builder.onLoad({ filter: /.*/, namespace: 'valenced' }, ({ path }) => ({ contents: imports[path] }));
        },
    }],
});
const script = `({ default: {
    start(api) {
        const module = { exports: {} };
        const exports = module.exports;
${bundle.outputFiles[0].text}
        return module.exports.default.start(api);
    },
} })`;
const output = transformSync(script, {
    babelrc: false, configFile: false, sourceType: 'script', plugins: [transformBlockScoping],
}).code.replace(/;$/, '') + '\n';
const destination = new URL('index.js', import.meta.url);
if (process.argv.includes('--check')) {
    if (readFileSync(destination, 'utf8') !== output) throw new Error('Voice Messages bundle is out of date');
} else writeFileSync(destination, output);
