/**
 * jsonos share worker
 *
 *   POST /api/share         body { name: string, text: string } -> { id, expiresAt? }
 *   GET  /api/share/:id                                          -> { name, text }
 *
 * Security stance:
 *   - Read-only by design: no PUT/PATCH. Once stored, content is immutable.
 *   - IDs are random 12-byte base64url strings (96 bits of entropy).
 *   - Per-IP rate limit on POST via KV (write-light: only counts).
 *   - Strict size cap to prevent abuse.
 *   - CORS limited to ALLOWED_ORIGINS unless "*".
 *
 * Storage shape (KV):
 *   key:  share:<id>     value: JSON.stringify({ name, text, createdAt })
 *   key:  rl:<ip>:<min>  value: count (TTL 60s)
 */

export interface Env {
  SHARES: KVNamespace;
  ALLOWED_ORIGINS: string;
  MAX_BYTES: string;
  DEFAULT_TTL_DAYS: string;
}

const MAX_NAME_LEN = 200;
const RATE_LIMIT_PER_MIN = 30;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') ?? '';
    const corsOrigin = pickCorsOrigin(origin, env);

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(corsOrigin),
      });
    }

    try {
      if (url.pathname === '/api/share' && req.method === 'POST') {
        return withCors(await createShare(req, env), corsOrigin);
      }
      const m = url.pathname.match(/^\/api\/share\/([A-Za-z0-9_-]+)$/);
      if (m && req.method === 'GET') {
        return withCors(await getShare(m[1], env), corsOrigin);
      }
      return withCors(json({ error: 'Not found' }, 404), corsOrigin);
    } catch (e) {
      return withCors(json({ error: 'Internal error', detail: (e as Error).message }, 500), corsOrigin);
    }
  },
};

async function createShare(req: Request, env: Env): Promise<Response> {
  const max = parseInt(env.MAX_BYTES || '1048576', 10);

  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await checkRateLimit(ip, env))) {
    return json({ error: 'Rate limit exceeded' }, 429);
  }

  const ct = req.headers.get('Content-Type') ?? '';
  if (!ct.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, 415);
  }

  let payload: unknown;
  try {
    const text = await req.text();
    if (text.length > max) {
      return json({ error: `Payload too large (max ${max} bytes)` }, 413);
    }
    payload = JSON.parse(text);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (!isShareInput(payload)) {
    return json({ error: 'Expected { name: string, text: string }' }, 400);
  }
  if (payload.name.length > MAX_NAME_LEN) {
    return json({ error: `name too long (max ${MAX_NAME_LEN})` }, 400);
  }
  if (new TextEncoder().encode(payload.text).byteLength > max) {
    return json({ error: `text too large (max ${max} bytes)` }, 413);
  }

  const id = newId();
  const ttlDays = parseInt(env.DEFAULT_TTL_DAYS || '30', 10);
  const ttlSec = ttlDays > 0 ? ttlDays * 86400 : undefined;
  const createdAt = Date.now();
  const stored = JSON.stringify({ name: payload.name, text: payload.text, createdAt });

  await env.SHARES.put(`share:${id}`, stored, ttlSec ? { expirationTtl: ttlSec } : undefined);

  return json({
    id,
    expiresAt: ttlSec ? createdAt + ttlSec * 1000 : undefined,
  });
}

async function getShare(id: string, env: Env): Promise<Response> {
  const raw = await env.SHARES.get(`share:${id}`);
  if (!raw) return json({ error: 'Not found' }, 404);
  try {
    const { name, text } = JSON.parse(raw);
    return json({ name, text });
  } catch {
    return json({ error: 'Corrupt entry' }, 500);
  }
}

function isShareInput(v: unknown): v is { name: string; text: string } {
  return !!v && typeof v === 'object'
    && typeof (v as any).name === 'string'
    && typeof (v as any).text === 'string';
}

async function checkRateLimit(ip: string, env: Env): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60_000);
  const key = `rl:${ip}:${minute}`;
  const cur = parseInt((await env.SHARES.get(key)) ?? '0', 10);
  if (cur >= RATE_LIMIT_PER_MIN) return false;
  await env.SHARES.put(key, String(cur + 1), { expirationTtl: 60 });
  return true;
}

function newId(): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

function base64url(buf: Uint8Array): string {
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pickCorsOrigin(origin: string, env: Env): string | null {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.includes('*')) return '*';
  if (origin && allowed.includes(origin)) return origin;
  return null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function withCors(res: Response, origin: string | null): Response {
  if (!origin) return res;
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
