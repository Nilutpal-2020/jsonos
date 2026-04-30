# JSON OS

A browser-based JSON workbench. View, edit, validate, format, repair, query
(JSONPath), transform, diff, and share JSON — all locally in your browser.

- **Tree · text · table** views, switch independently per column
- **Multi-column workspace** (up to 3) with drag-to-resize columns
- **JSON Schema** validation (Ajv, lazy-loaded)
- **JSONPath** runner
- **Side-by-side compare** (auto-arranges columns from the Compare panel)
- **API client** with response history persisted locally
- **Read-only share links** via a Cloudflare Worker (or Vercel function)
- **CSV export** from the table view
- **Light · dark · system** themes
- **Local-first**: parsing, validation, and storage all happen in the browser
  (Web Worker for hot paths, IndexedDB for persistence)

## Tech stack

- Svelte 5 (runes) + Vite 8 + TypeScript
- CodeMirror 6 (text view, themed via CSS vars)
- @tanstack/virtual-core (tree + table virtualization)
- jsonc-parser (parse with offsets / paths), Ajv (schema), jsonpath-plus
- idb-keyval (IndexedDB) · Comlink (Web Worker RPC)

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build → dist/
npm run preview      # serve the production build
npm run check        # svelte-check + tsc
```

## Environment variables

Copy `.env.example` → `.env` and fill in for your deploy:

| Var | Purpose |
| --- | --- |
| `VITE_PUBLIC_URL` | Public origin (no trailing slash). Used in canonical / OG / sitemap / JSON-LD at build time. |
| `VITE_SHARE_API`  | Endpoint of the share API. Defaults to `/api`. Set to absolute URL when the share API lives elsewhere. |

## Deploy to Vercel

The repo is Vercel-ready: `vercel.json` configures the build, SPA fallback,
caching headers, and security headers. The Vite build outputs to `dist/`.

```bash
# Option 1: from the dashboard
# - Import the repo in Vercel
# - Framework preset: Vite (auto-detected)
# - Add env vars: VITE_PUBLIC_URL (required for SEO),
#   optional VITE_SHARE_API
# - Deploy

# Option 2: CLI
npm i -g vercel
vercel               # follow prompts; first deploy creates the project
vercel --prod        # ship a production deploy
```

After deploy, set `VITE_PUBLIC_URL` in the Vercel project's env vars
(Production + Preview). Redeploy so the build picks it up — it's substituted
into `index.html`, `robots.txt`, and `sitemap.xml` by the Vite plugin.

### Share API: pick one

The frontend's `Share` button POSTs to `VITE_SHARE_API` (default `/api`).
Two ready paths:

**A. Cloudflare Worker (recommended; default)**
The worker in [`worker/`](worker/) is self-contained, KV-backed, rate-limited,
and TTL-based. Deploy:

```bash
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create SHARES
npx wrangler kv namespace create SHARES --preview
# paste returned ids into worker/wrangler.toml
npx wrangler deploy
```

Then in Vercel, set `VITE_SHARE_API=https://jsonos-share.<sub>.workers.dev/api`
(replace with the URL `wrangler deploy` printed). Add your Vercel origin to
`ALLOWED_ORIGINS` in `worker/wrangler.toml` and redeploy the worker.

**B. All-in-one Vercel (Edge function + Vercel KV)**
Templates live in [`examples/vercel-api/`](examples/vercel-api/). To enable:

```bash
mkdir -p api/share
mv examples/vercel-api/share.ts        api/share.ts
mv examples/vercel-api/_share-id.ts    api/share/[id].ts
npm install @vercel/kv
```

Then in Vercel: Storage → create a KV store and link it to the project. Set
`ALLOWED_ORIGINS` env var (comma-separated origins; e.g. `https://your-domain.com`).
Push to redeploy. Leave `VITE_SHARE_API` unset (defaults to `/api`).

## SEO

`index.html` ships with:

- Title + description with target keywords
- Open Graph (title, description, image, URL, locale, dimensions)
- Twitter Card (summary_large_image)
- Canonical link
- JSON-LD `SoftwareApplication` structured data
- `theme-color` per `prefers-color-scheme`
- Inline FOUC-prevention CSS that respects `data-theme`
- Apple touch icon, mask icon, web app manifest

`public/robots.txt` and `public/sitemap.xml` are generated at build time with
`VITE_PUBLIC_URL` substituted in (see the `publicAssetsTokenSubstitute` plugin
in [`vite.config.ts`](vite.config.ts)).

After your first deploy, submit `https://your-domain/sitemap.xml` to Google
Search Console and Bing Webmaster Tools.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘Z` / `⌘⇧Z` | Undo / redo |
| `⌘S` | Download active doc |
| `⌘/` | Format |
| `⌘\` | Toggle side panel |
| `⌘⇧W` | Toggle text wrap |
| `⌘T` | New doc (auto-incremented `untitled.json`) |
| `⌘1` / `⌘2` / `⌘3` | Focus column 1 / 2 / 3 |

## License

MIT.
