/**
 * Optional all-in-one Vercel deployment for the Share API.
 *
 * To enable:
 *   1. Move this file to `/api/share.ts` at the project root.
 *   2. Move ./_share-id.ts to `/api/share/[id].ts`.
 *   3. Install @vercel/kv:  npm install @vercel/kv
 *   4. In the Vercel dashboard → Storage → Create a KV store and link it to
 *      this project (provides KV_REST_API_URL + KV_REST_API_TOKEN env vars).
 *   5. Add ALLOWED_ORIGINS env var (comma-separated origins; "*" only for dev).
 *   6. Optionally set DEFAULT_TTL_DAYS (default 30) and MAX_BYTES (default 1 MiB).
 *
 * Mirrors the Cloudflare Worker in /worker — same JSON shape, same security
 * stance: read-only, immutable, rate-limited POST, strict size cap, CORS allow-list.
 */

import { kv } from '@vercel/kv';

export const config = { runtime: 'edge' };

const RATE_LIMIT_PER_MIN = 30;
const MAX_NAME_LEN = 200;
const KEY_PREFIX = 'share:';
const RL_PREFIX = 'rl:';

interface ShareInput { name: string; text: string; }
interface StoredShare { name: string; text: string; createdAt: number; }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return cors(json({ error: 'Method not allowed' }, 405), req);
  }

  if (req.method === 'OPTIONS') {
    return cors(new Response(null, { status: 204 }), req);
  }

  const max = parseInt(process.env.MAX_BYTES || '1048576', 10);
  const ttlDays = parseInt(process.env.DEFAULT_TTL_DAYS || '30', 10);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
  if (!(await rateLimitOk(ip))) {
    return cors(json({ error: 'Rate limit exceeded' }, 429), req);
  }

  const ct = req.headers.get('Content-Type') ?? '';
  if (!ct.includes('application/json')) {
    return cors(json({ error: 'Content-Type must be application/json' }, 415), req);
  }

  let payload: unknown;
  try {
    const text = await req.text();
    if (text.length > max) return cors(json({ error: 'Payload too large' }, 413), req);
    payload = JSON.parse(text);
  } catch {
    return cors(json({ error: 'Invalid JSON' }, 400), req);
  }

  if (!isShareInput(payload)) {
    return cors(json({ error: 'Expected { name: string, text: string }' }, 400), req);
  }
  if (payload.name.length > MAX_NAME_LEN) {
    return cors(json({ error: `name too long (max ${MAX_NAME_LEN})` }, 400), req);
  }
  if (new TextEncoder().encode(payload.text).byteLength > max) {
    return cors(json({ error: `text too large (max ${max} bytes)` }, 413), req);
  }

  const id = newId();
  const createdAt = Date.now();
  const stored: StoredShare = { name: payload.name, text: payload.text, createdAt };

  if (ttlDays > 0) {
    await kv.set(`${KEY_PREFIX}${id}`, stored, { ex: ttlDays * 86400 });
  } else {
    await kv.set(`${KEY_PREFIX}${id}`, stored);
  }

  return cors(json({
    id,
    expiresAt: ttlDays > 0 ? createdAt + ttlDays * 86400 * 1000 : undefined,
  }), req);
}

async function rateLimitOk(ip: string): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60_000);
  const key = `${RL_PREFIX}${ip}:${minute}`;
  const next = await kv.incr(key);
  if (next === 1) await kv.expire(key, 60);
  return next <= RATE_LIMIT_PER_MIN;
}

function isShareInput(v: unknown): v is ShareInput {
  return !!v && typeof v === 'object'
    && typeof (v as any).name === 'string'
    && typeof (v as any).text === 'string';
}

function newId(): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
