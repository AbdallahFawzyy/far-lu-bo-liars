// Bundles src/ into one self-contained dist/index.html (Three.js included).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('src/index.html', 'utf8');
const out = html.replace('<script>/*BUNDLE*/</script>', () => `<script>${js}</script>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', out);
// A standalone version with a full document skeleton, for any static host.
writeFileSync('dist/standalone.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${out}</body></html>`);
console.log(`dist/index.html ${(out.length / 1024).toFixed(0)} KB`);
