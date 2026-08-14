#!/usr/bin/env node
import sharp from 'sharp';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SVG_PATH = resolve(ROOT, 'public/favicon.svg');
const ICONS_DIR = resolve(ROOT, 'apps/chrome-extension/public/icons');

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });
  const svg = await readFile(SVG_PATH);

  const sizes = [16, 48, 128];
  for (const size of sizes) {
    const pngPath = resolve(ICONS_DIR, `icon${size}.png`);
    const buf = await sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(pngPath, buf);
    console.log(`Generated ${pngPath} (${(buf.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
