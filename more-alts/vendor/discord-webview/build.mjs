import { readFile, writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';
const root = new URL('./', import.meta.url);
const names = ['WebView.android.tsx', 'WebViewShared.tsx', 'WebView.styles.ts'];
const factories = [];
for (const name of names) {
    let source = await readFile(new URL('src/' + name, root), 'utf8');
    if (name === 'WebView.android.tsx') {
        const instance = '`WebViewMessageHandler${uniqueRef += 1}`';
        const registration = 'BatchedBridge.registerCallableModule(messagingModuleName, directEventCallbacks);';
        if (source.split(instance).length !== 2 || source.split(registration).length !== 2) throw new Error('Pinned SDK adaptation needs updating');
        source = source.replace(instance, '`${prefix}${uniqueRef += 1}`')
            .replace(registration, registration + '\n    return () => BatchedBridge.unregisterCallableModule(messagingModuleName);');
    }
    const result = await transform(source, { sourcefile: name, loader: name.endsWith('tsx') ? 'tsx' : 'ts', format: 'cjs', target: 'es2020', jsx: 'transform' });
    factories.push(JSON.stringify('./' + name.replace(/\.tsx?$/, '')) + ': function(module, exports, require) {\n' + result.code + '\n}');
}
const output = `// SPDX-License-Identifier: MIT
// Generated from Discord's pinned WebView fork; see vendor/discord-webview/README.md and LICENSE.
export function createPackagedWebView(React, RN, bridge, nativeModule, NativeView, Commands, prefix) {
    const external = {
        react: React, 'react-native': RN,
        'react-native/Libraries/BatchedBridge/BatchedBridge': bridge,
        './NativeRNCWebView': { __esModule: true, default: nativeModule },
        './RNCWebViewNativeComponent': { __esModule: true, default: NativeView, Commands },
        invariant(value, message) { if (!value) throw new Error(message); },
        'escape-string-regexp': value => String(value).replace(/[|\\\\{}()[\\]^$+*?.-]/g, '\\\\$&'),
    };
    const factories = { ${factories.join(',\n')} };
    const cache = Object.create(null);
    function require(name) {
        if (Object.prototype.hasOwnProperty.call(external, name)) return external[name];
        if (!factories[name]) throw new Error('Unknown embedded browser dependency');
        if (cache[name]) return cache[name].exports;
        const module = { exports: {} }; cache[name] = module;
        factories[name](module, module.exports, require); return module.exports;
    }
    return require('./WebView.android').default;
}
`;
await writeFile(new URL('../../src/webview-sdk.mjs', root), output);
