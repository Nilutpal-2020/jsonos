/**
 * Companion to share.ts — install at `/api/share/[id].ts`. Returns the document
 * for a given share id. See ./share.ts for setup notes.
 */

import { kv } from '@vercel/kv';

export const config = { runtime: 'edge' };

interface StoredShare { name: string; text: string; createdAt: number; }

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return cors(new Response(null, { status: 204 }), req);
  }
  if (req.method !== 'GET') {
    return cors(json({ error: 'Method not allowed' }, 405), req);
  }

  const url = new URL(req.url);
  const id = url.pathname.split('/').pop() ?? '';
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return cors(json({ error: 'Bad id' }, 400), req);
  }

  const entry = await kv.get<StoredShare>(`share:${id}`);
  if (!entry) return cors(json({ error: 'Not found' }, 404), req);

  return cors(json({ name: entry.name, text: entry.text }), req);
}

function pickCorsOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.includes('*')) return '*';
  if (origin && allowed.includes(origin)) return origin;
  return null;
}

function cors(res: Response, req: Request): Response {
  const origin = pickCorsOrigin(req);
  if (!origin) return res;
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', origin);
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  h.set('Access-Control-Max-Age', '86400');
  h.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, headers: h });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
