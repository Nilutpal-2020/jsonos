import { get, set, createStore, keys, del } from 'idb-keyval';

const store = createStore('jsonos-api', 'kv');
const authStore = createStore('jsonos-api-auth', 'kv');

export interface ApiHistoryEntry {
  id: string;
  method: string;
  url: string;
  status: number;
  statusText: string;
  startedAt: number;
  durationMs: number;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
  responseContentType: string;
  ok: boolean;
  error?: string;
}

const HISTORY_LIMIT = 100;

export const apiHistory = {
  async list(): Promise<ApiHistoryEntry[]> {
    const ks = await keys(store);
    const items = await Promise.all(ks.map((k) => get<ApiHistoryEntry>(k, store)));
    return items
      .filter((x): x is ApiHistoryEntry => !!x)
      .sort((a, b) => b.startedAt - a.startedAt);
  },
  async save(entry: ApiHistoryEntry): Promise<void> {
    await set(entry.id, entry, store);
    // trim
    const all = await this.list();
    if (all.length > HISTORY_LIMIT) {
      for (const e of all.slice(HISTORY_LIMIT)) await del(e.id, store);
    }
  },
  async remove(id: string): Promise<void> {
    await del(id, store);
  },
  async clear(): Promise<void> {
    const ks = await keys(store);
    await Promise.all(ks.map((k) => del(k, store)));
  },
};

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export type AuthKind = 'none' | 'bearer' | 'basic' | 'header';

export interface AuthConfig {
  kind: AuthKind;
  bearer?: string;
  basicUser?: string;
  basicPass?: string;
  headerName?: string;
  headerValue?: string;
}

/** Persisted per-origin auth (e.g. https://api.example.com) — survives reloads. */
export const authPrefs = {
  async load(origin: string): Promise<AuthConfig | undefined> {
    if (!origin) return undefined;
    return (await get<AuthConfig>(origin, authStore)) ?? undefined;
  },
  async save(origin: string, cfg: AuthConfig): Promise<void> {
    if (!origin) return;
    if (cfg.kind === 'none') await del(origin, authStore);
    else await set(origin, cfg, authStore);
  },
};

export function applyAuth(headers: Record<string, string>, cfg: AuthConfig): void {
  switch (cfg.kind) {
    case 'bearer':
      if (cfg.bearer) headers['Authorization'] = `Bearer ${cfg.bearer}`;
      return;
    case 'basic':
      if (cfg.basicUser !== undefined) {
        const enc = btoa(`${cfg.basicUser}:${cfg.basicPass ?? ''}`);
        headers['Authorization'] = `Basic ${enc}`;
      }
      return;
    case 'header':
      if (cfg.headerName) headers[cfg.headerName] = cfg.headerValue ?? '';
      return;
  }
}

export function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return ''; }
}
