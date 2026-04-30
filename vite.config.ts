import { defineConfig, loadEnv, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_PUBLIC_URL = 'https://jsonos.app';

/**
 * Substitute %VITE_PUBLIC_URL% in static files copied from public/ at build time.
 * Vite already supports %VITE_*% in index.html; this extends the same syntax to
 * robots.txt and sitemap.xml so canonical URLs are written correctly per env.
 */
function publicAssetsTokenSubstitute(publicUrl: string): Plugin {
  const targets = ['robots.txt', 'sitemap.xml'];
  return {
    name: 'jsonos:public-assets-token-substitute',
    apply: 'build',
    closeBundle() {
      for (const file of targets) {
        const src = resolve(process.cwd(), 'public', file);
        const dst = resolve(process.cwd(), 'dist', file);
        if (!existsSync(src)) continue;
        const text = readFileSync(src, 'utf8').replaceAll('%VITE_PUBLIC_URL%', publicUrl);
        writeFileSync(dst, text);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const publicUrl = (env.VITE_PUBLIC_URL || DEFAULT_PUBLIC_URL).replace(/\/$/, '');

  return {
    plugins: [
      svelte(),
      publicAssetsTokenSubstitute(publicUrl),
    ],
    build: {
      target: 'es2022',
      sourcemap: false,
      cssCodeSplit: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 700,
    },
  };
});
