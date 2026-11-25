#!/usr/bin/env node
/**
 * Builds a single self-contained index.html (JS + CSS inlined) so the app can
 * run from GitHub Pages, any static server, or the iOS app bundle (file://)
 * with no follow-up requests.
 *
 * Rollup is used in its WebAssembly build and JSX is compiled with Sucrase, so
 * the build needs no native toolchain (it also runs on an iPad).
 */
import { rollup } from '@rollup/wasm-node';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import { transform } from 'sucrase';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { writeAppIcon, writeWebIcons } from './icon.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');

let css = '';

const cssPlugin = {
  name: 'inline-css',
  async load(id) {
    if (!id.endsWith('.css')) return null;
    if (css) return 'export default undefined;';
    css = await fs.readFile(id, 'utf8');
    return 'export default undefined;';
  },
};

const jsxPlugin = {
  name: 'sucrase-jsx',
  transform(code, id) {
    if (id.includes(`${path.sep}node_modules${path.sep}`) || !/\.(jsx|js)$/.test(id)) return null;
    const result = transform(code, {
      transforms: ['jsx'],
      jsxRuntime: 'automatic',
      production: true,
      filePath: id,
    });
    return { code: result.code, map: null };
  },
};

const httpExternal = (id) => /^https?:\/\//i.test(id);

const bundle = await rollup({
  input: path.join(root, 'src/main.jsx'),
  external: httpExternal,
  plugins: [
    cssPlugin,
    jsxPlugin,
    nodeResolve({ extensions: ['.js', '.jsx'], browser: true }),
    replace({
      preventAssignment: true,
      values: { 'process.env.NODE_ENV': JSON.stringify('production') },
    }),
    commonjs({ transformMixedEsModules: true, strictRequires: false }),
    // The WebAssembly build of Rollup's parser rejects a "use strict" directive
    // inside a function declaration, which React's minified CJS files contain.
    // ES modules are always strict, so dropping the directive is safe.
    {
      name: 'strip-use-strict',
      transform(code, id) {
        if (!id.includes(`${path.sep}node_modules${path.sep}`) || !code.includes('use strict')) return null;
        return { code: code.replace(/(['"])use strict\1;?/g, ''), map: null };
      },
    },
    terser({ format: { comments: false } }),
  ],
  onwarn(warning, warn) {
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE' || warning.code === 'SOURCEMAP_ERROR') return;
    warn(warning);
  },
});

const { output } = await bundle.generate({ format: 'esm', sourcemap: false });
const chunk = output.find((entry) => entry.type === 'chunk');
if (!chunk) throw new Error('no JavaScript output');
const js = chunk.code.replace(/<\/script/gi, '<\\/script');

const template = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const html = template
  .replace('<!--APP_CSS-->', css ? `<style>${css}</style>` : '')
  .replace('<!--APP_JS-->', `<script type="module">${js}</script>`);

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
await fs.writeFile(path.join(dist, 'index.html'), html);
await fs.cp(path.join(root, 'public'), dist, { recursive: true });
await writeWebIcons(dist);

// The iOS icon is generated too, so the repository holds no binaries.
const assetDir = path.join(root, 'ios/Aether/Assets.xcassets/AppIcon.appiconset');
if (await fs.stat(path.join(root, 'ios/Aether')).then(() => true).catch(() => false)) {
  await writeAppIcon(assetDir);
}

console.log(
  `built dist/index.html — ${(Buffer.byteLength(html) / 1024).toFixed(0)} kB `
  + `(${(Buffer.byteLength(js) / 1024).toFixed(0)} kB JS, ${(Buffer.byteLength(css) / 1024).toFixed(0)} kB CSS)`,
);
