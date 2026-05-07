import { mount } from 'svelte'
import { inject } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'
import './core/theme.svelte';   // initialize theme before first paint
import App from './App.svelte'

// Privacy-friendly, cookieless analytics. No PII collected.
// See public/privacy.html § Analytics.
inject()
injectSpeedInsights()

// Remove the SEO fallback shell injected in index.html before Svelte mounts.
// It's there for crawlers and first-paint, but should not coexist with the app.
const target = document.getElementById('app')!
target.innerHTML = ''

const app = mount(App, { target })

// Register service worker for offline + faster repeat visits.
// Skip on dev (vite serves HMR there); skip if browser lacks SW.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

export default app
