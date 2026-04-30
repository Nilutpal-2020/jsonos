/**
 * Share API client. Backend is the Cloudflare Worker in `worker/` (separate deploy).
 * Configure endpoint via VITE_SHARE_API env var; falls back to relative `/api`.
 */

const BASE = (import.meta.env.VITE_SHARE_API as string | undefined) ?? '/api';

export interface SharePayload {
  name: string;
  text: string;
}

export interface ShareResponse {
  id: string;
  url: string;       // absolute share URL pointing at this app with ?share=<id>
  expiresAt?: number;
}

export async function createShare(payload: SharePayload): Promise<ShareResponse> {
  const r = await fetch(`${BASE}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Share failed: ${r.status} ${r.statusText}`);
  const data = await r.json() as { id: string; expiresAt?: number };
  const url = `${location.origin}${location.pathname}?share=${encodeURIComponent(data.id)}`;
  return { id: data.id, url, expiresAt: data.expiresAt };
}

export async function loadShare(id: string): Promise<SharePayload> {
  const r = await fetch(`${BASE}/share/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`Load failed: ${r.status} ${r.statusText}`);
  return await r.json() as SharePayload;
}

export function readShareIdFromUrl(): string | null {
  const params = new URLSearchParams(location.search);
  return params.get('share');
}

export function clearShareIdFromUrl(): void {
  const params = new URLSearchParams(location.search);
  params.delete('share');
  const next = location.pathname + (params.toString() ? '?' + params.toString() : '') + location.hash;
  history.replaceState(null, '', next);
}
