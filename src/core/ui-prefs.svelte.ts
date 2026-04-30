/**
 * Misc UI preferences shared across views (wrap, anything else not specific
 * enough to live in a single component or in workspace state).
 *
 * Persisted in localStorage, read synchronously at module-load.
 */

const STORAGE_KEY = 'jsonos.ui';

interface PersistedPrefs {
  wrap?: boolean;
}

function read(): PersistedPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch { return {}; }
}

class UiPrefs {
  wrap = $state<boolean>(read().wrap ?? false);

  setWrap(v: boolean) {
    this.wrap = v;
    this.persist();
  }

  toggleWrap() { this.setWrap(!this.wrap); }

  private persist() {
    const data: PersistedPrefs = { wrap: this.wrap };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* quota */ }
  }
}

export const ui = new UiPrefs();
