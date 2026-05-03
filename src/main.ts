import { mount } from 'svelte'
import { inject } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'
import './core/theme.svelte';   // initialize theme before first paint
import App from './App.svelte'

// Privacy-friendly, cookieless analytics. No PII collected.
// See public/privacy.html § Analytics.
inject()
injectSpeedInsights()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
