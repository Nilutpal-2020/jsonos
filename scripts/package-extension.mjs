#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT_DIR = resolve(ROOT, 'apps/chrome-extension');
const DIST_DIR = resolve(EXT_DIR, 'dist');
const OUTPUT_ZIP = resolve(ROOT, 'jsonos-redact-chrome-extension.zip');

console.log('Building Chrome extension...');
execSync('npm run build:ext', { cwd: ROOT, stdio: 'inherit' });

if (!existsSync(DIST_DIR)) {
  console.error('Error: dist directory does not exist!');
  process.exit(1);
}

console.log('Packaging extension into zip for Chrome Web Store...');
execSync(`cd "${DIST_DIR}" && zip -r "${OUTPUT_ZIP}" .`, { stdio: 'inherit' });

console.log(`\nSuccessfully packaged extension:`);
console.log(`  ${OUTPUT_ZIP}`);
