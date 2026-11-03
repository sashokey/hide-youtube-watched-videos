import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { transform } from 'esbuild';
import { minify } from 'terser';

const name = 'hide-youtube-watched-videos';
const root = new URL('../', import.meta.url);
const source = await readFile(new URL(name + '.src.ts', root), 'utf8');
const match = source.match(/^(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\r?\n)([\s\S]*)$/);
const metadata = match?.[1];
const body = match?.[2];
if (!metadata || !body) throw new Error('Userscript metadata header is missing');
const compiled = await transform(body, { loader: 'ts', format: 'iife', target: 'es2022', legalComments: 'none' });
new Script(compiled.code);
const result = await minify(compiled.code, { compress: { passes: 10 }, mangle: true, format: { comments: false } });
if (!result.code) throw new Error('Minification produced no executable script');
const output = metadata + result.code + '\n';
new Script(output);
await mkdir(new URL('.build/', root), { recursive: true });
const readable = await minify(compiled.code, { compress: false, mangle: false, format: { beautify: true, comments: false } });
if (!readable.code) throw new Error('Compilation produced no readable code');
new Script(readable.code);
await writeFile(new URL('.build/' + name + '.js', root), metadata + readable.code + '\n');
const target = new URL(name + '.user.js', root);
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== output) throw new Error('Shipped userscript is stale. Run npm run build.');
} else await writeFile(target, output);
