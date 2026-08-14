#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VSCODE_EXT_DIR = resolve(ROOT, 'apps/vscode-extension');

console.log('Building @jsonos/redact-core...');
execSync('npm run build', { cwd: resolve(ROOT, 'packages/redact-core'), stdio: 'inherit' });

console.log('Compiling VS Code Extension...');
execSync('npm run compile', { cwd: VSCODE_EXT_DIR, stdio: 'inherit' });

console.log('Packaging .vsix file for VS Code Marketplace...');
execSync('npx @vscode/vsce package --no-dependencies', { cwd: VSCODE_EXT_DIR, stdio: 'inherit' });

console.log('\nSuccessfully packaged VS Code Extension .vsix file!');
