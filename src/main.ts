import { mount } from 'svelte'
import './core/theme.svelte';   // initialize theme before first paint
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
