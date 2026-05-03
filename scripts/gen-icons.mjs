#!/usr/bin/env node
/**
 * Render PNG icons from the SVG sources in public/.
 *
 *   - favicon-32.png            32x32       browser tab small-size fallback
 *   - favicon-192.png           192x192     PWA / generic touch
 *   - favicon-512.png           512x512     PWA / Google Knowledge Panel logo
 *   - apple-touch-icon.png     180x180     iOS home screen
 *   - og-image.png             1200x630    OG/Twitter (raster, social previews)
 *
 * Run once, commit the PNGs:
 *   npm run gen-icons
 */
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = resolve(ROOT, 'public');

async function svgToPng(svgPath, pngPath, size, opts = {}) {
  const svg = await readFile(svgPath);
  let pipeline = sharp(svg, { density: 384 }).resize(size.w, size.h, {
    fit: opts.fit ?? 'contain',
    background: opts.background ?? { r: 0, g: 0, b: 0, alpha: 0 },
  });
  const buf = await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();
  await writeFile(pngPath, buf);
  console.log(`  ${pngPath.replace(ROOT + '/', '')}  ${(buf.length / 1024).toFixed(1)} KB`);
}

const targets = [
  { src: 'favicon.svg',          out: 'favicon-32.png',         w: 32,   h: 32 },
  { src: 'favicon.svg',          out: 'favicon-192.png',        w: 192,  h: 192 },
  { src: 'favicon.svg',          out: 'favicon-512.png',        w: 512,  h: 512 },
  { src: 'apple-touch-icon.svg', out: 'apple-touch-icon.png',  w: 180,  h: 180 },
  { src: 'og-image.svg',         out: 'og-image.png',          w: 1200, h: 630 },
];

console.log('Generating PNG icons…');
for (const t of targets) {
  await svgToPng(resolve(PUBLIC, t.src), resolve(PUBLIC, t.out), { w: t.w, h: t.h });
}
console.log('Done.');
