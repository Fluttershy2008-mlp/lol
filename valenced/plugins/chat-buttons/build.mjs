import { build } from 'esbuild';
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
const output = `(() => {\n// Chat Buttons by mlemception; local compatibility changes. See LICENSE and NOTICE.txt.\nconst module = { exports: {} }; const exports = module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;\n})()\n`;
const destination = new URL('index.js', here);
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== output) throw Error('Chat Buttons bundle is out of date');
} else writeFileSync(destination, output);
console.log('Verified Chat Buttons build');
