# jsonos-share-worker

Cloudflare Worker that serves the `/api/share` endpoints used by the JSON OS frontend
to create read-only share links.

## One-time setup

```bash
cd worker
npm install
npx wrangler login

# create KV namespaces (production + preview)
npx wrangler kv namespace create SHARES
npx wrangler kv namespace create SHARES --preview
```

Paste the returned `id` and `preview_id` into `wrangler.toml` under
`[[kv_namespaces]]`.

Set `ALLOWED_ORIGINS` in `wrangler.toml` to the origins you serve the frontend from
(comma-separated). Use `*` only for local development.

## Run locally

```bash
npm run dev          # http://localhost:8787
```

The frontend defaults to `/api`. To point it at the local worker, set
`VITE_SHARE_API=http://localhost:8787/api` when running `npm run dev` from the
project root.

## Deploy

```bash
npm run deploy
```

After deploy, set the frontend `VITE_SHARE_API` to your worker URL (e.g.
`https://jsonos-share.<your-subdomain>.workers.dev/api`).

## Endpoints

- `POST /api/share` — body `{ "name": string, "text": string }` → `{ "id", "expiresAt"? }`
- `GET  /api/share/:id` → `{ "name", "text" }`

Stored entries are immutable. Default TTL is 30 days (override via
`DEFAULT_TTL_DAYS=0` to disable expiry). Max payload defaults to 1 MiB.

## Security

- IDs: 96-bit random base64url (collisions practically impossible).
- Per-IP rate limit on POST: 30 req/min.
- Strict size cap, single content type accepted.
- CORS origin allow-list (no wildcard in prod).
