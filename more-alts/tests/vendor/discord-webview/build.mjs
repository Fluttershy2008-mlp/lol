import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { transform } from 'esbuild';
const root = new URL('./', import.meta.url);
await mkdir(new URL('lib/', root), { recursive: true });
for (const name of ['WebView.android.tsx', 'WebViewShared.tsx', 'NativeRNCWebView.ts', 'RNCWebViewNativeComponent.ts', 'WebView.styles.ts']) {
    const result = await transform(await readFile(new URL('src/' + name, root), 'utf8'), {
        sourcefile: name, loader: name.endsWith('tsx') ? 'tsx' : 'ts', format: 'cjs', target: 'es2020', jsx: 'transform',
    });
    await writeFile(new URL('lib/' + name.replace(/\.tsx?$/, '.cjs'), root), '// MIT. Generated from the pinned Discord WebView source; see ../LICENSE and ../README.md.\n' + result.code);
}
