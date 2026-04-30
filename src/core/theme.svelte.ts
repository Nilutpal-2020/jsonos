/**
 * Theme controller. Three modes:
 *   - 'dark'   : force dark
 *   - 'light'  : force light
 *   - 'system' : follow `prefers-color-scheme`
 *
 * Sets `data-theme="dark"|"light"` on <html>. Persists choice in localStorage.
 * Module-load applies the saved choice immediately to avoid a flash on first paint.
 */

export type ThemeMode = 'dark' | 'light' | 'system';
type Resolved = 'dark' | 'light';

const STORAGE_KEY = 'jsonos.theme';

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light' || v === 'system') return v;
  } catch { /* ignore */ }
  return 'system';
}

function systemPref(): Resolved {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(m: ThemeMode): Resolved {
  return m === 'system' ? systemPref() : m;
}

function apply(r: Resolved) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = r;
  document.documentElement.style.colorScheme = r;
}

class ThemeStore {
  mode = $state<ThemeMode>(readStored());
  effective = $state<Resolved>(resolve(this.mode));

  constructor() {
    apply(this.effective);
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', () => {
        if (this.mode === 'system') {
          this.effective = systemPref();
          apply(this.effective);
        }
      });
    }
  }

  set(next: ThemeMode) {
    this.mode = next;
    this.effective = resolve(next);
    apply(this.effective);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }
}

export const theme = new ThemeStore();
