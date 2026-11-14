import { build } from 'esbuild';
import { transformSync } from '@babel/core';
import transformBlockScoping from '@babel/plugin-transform-block-scoping';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = new URL('./', import.meta.url);
// Runtime mappings from Valenced's public modules.importmap.json and plugin CLI.
const modules = {
  'react': ['valenced.react.React', ['createElement', 'createContext', 'cloneElement', 'isValidElement', 'Children', 'useContext', 'useLayoutEffect', 'useEffect', 'useRef', 'useState', 'useSyncExternalStore']],
  'react/jsx-runtime': ['valenced.react.ReactJSXRuntime', ['jsx', 'jsxs', 'Fragment']],
  'react-native': ['valenced.react.ReactNative', ['Animated', 'BackHandler', 'Easing', 'Pressable', 'ScrollView', 'StatusBar', 'StyleSheet', 'useWindowDimensions', 'View', 'Image']],
  '@valenced/discord/utils/modules/finders': ['valenced.discord.utils.modules.finders', ['getModuleWithImportedPath']],
  '@valenced/patcher': ['valenced.patcher', ['after', 'instead', 'HookPriority']],
  '@valenced/react/jsx-runtime': ['valenced.react.jsxRuntime', ['afterJSX']],
  '@valenced/discord/design': ['valenced.discord.design', ['Design']],
  '@valenced/discord/common/tokens': ['valenced.discord.common.tokens', ['Tokens']],
  '@valenced/assets': ['valenced.assets', ['getAssetIdByName']],
  '@valenced/discord/actions': ['valenced.discord.actions', ['ActionSheetActionCreators', 'AlertActionCreators']],
};
const result = await build({
  absWorkingDir: fileURLToPath(here),
  entryPoints: [fileURLToPath(new URL('source/js/index.ts', here))],
  bundle: true, format: 'cjs', platform: 'neutral', target: 'es2022', write: false,
  jsx: 'automatic', legalComments: 'none',
  plugins: [{ name: 'valenced-public-api', setup(b) {
    b.onResolve({ filter: /^(react($|\/)|react-native$|@valenced\/)/ }, args => {
      if (!modules[args.path]) throw Error('Unknown Valenced runtime import: ' + args.path);
      return { path: args.path, namespace: 'valenced-api' };
    });
    b.onLoad({ filter: /.*/, namespace: 'valenced-api' }, args => {
      const [global, names] = modules[args.path];
      return { contents: names.map(name => `export const ${name} = ${global}.${name};`).join('\n'), loader: 'js' };
    });
  } }],
});
// The loader resolves options during preInit, when React and Discord tokens may
// not exist yet. Return plain lifecycle options now; evaluate imports at start.
const wrapped = `(() => {
// Chat Buttons by mlemception; local compatibility changes. See LICENSE and NOTICE.txt.
let runtime;
function load(valenced) {
  if (!runtime) runtime = (() => {
    const module = { exports: {} }; const exports = module.exports;
${result.outputFiles[0].text}
    return module.exports.default;
  })();
  return runtime;
}
return { default: {
  jsonStorage: { load: true, default: { names: {}, kept: {}, seen: {} } },
  start(api) { return load(api.unscoped).start(api); },
  SettingsComponent(props) {
    const U = props.api.unscoped;
    return U.react.React.createElement(load(U).SettingsComponent, props);
  },
} };
})()\n`;
// Hermes function-scopes let/const. Transform the final bundle too: esbuild's
// CommonJS export getters capture the loop key, so transforming sources alone
// would still make .default resolve to the last named export on Android.
const output = transformSync(wrapped, {
  babelrc: false, configFile: false, sourceType: 'script',
  plugins: [transformBlockScoping], comments: true, compact: false,
}).code + '\n';
const destination = new URL('index.js', here);
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== output) throw Error('Chat Buttons bundle is out of date');
} else writeFileSync(destination, output);
console.log('Verified Chat Buttons build');
