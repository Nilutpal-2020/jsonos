import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src'),
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    target: 'es2022',
    lib: {
      entry: resolve(__dirname, 'src/content/content.ts'),
      name: 'JSONOSContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
  resolve: {
    alias: {
      '@jsonos/redact-core': resolve(__dirname, '../../packages/redact-core/src/index.ts'),
    },
  },
});
