<div align="center">

<img src="public/favicon.svg" width="80" height="80" alt="JSON OS logo" />

# JSON OS

**A free, local-first JSON workbench &amp; Markdown previewer in your browser.**

Format, validate, repair, compare, and query JSON. Render Markdown with Mermaid, KaTeX, and code highlighting. No signup, no uploads.

[**Live app · jsonos.online**](https://jsonos.online) &nbsp;·&nbsp; [Tools](https://jsonos.online/tools/) &nbsp;·&nbsp; [Privacy](https://jsonos.online/privacy.html) &nbsp;·&nbsp; [Report a bug](../../issues/new?template=bug.yml) &nbsp;·&nbsp; [Request a feature](../../issues/new?template=feature.yml)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Made with Svelte](https://img.shields.io/badge/svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![Built with Vite](https://img.shields.io/badge/vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

## Why JSON OS?

Most online JSON editors upload your data to a server. JSON OS runs **entirely in your browser** — your documents never leave your device. The hot path (parse, validate, format, repair, sort, schema check) runs in a Web Worker so the UI stays responsive on huge files.

- &nbsp;✅ &nbsp;**Local-first** — Web Worker for compute, IndexedDB for persistence
- &nbsp;✅ &nbsp;**No signup, no servers** — open the URL and you're in
- &nbsp;✅ &nbsp;**Works offline** as a PWA after first load
- &nbsp;✅ &nbsp;**Free and open source** under MIT

## Features

### JSON workbench
- **Three views per column** — text (CodeMirror 6), tree (virtualized), table (sortable + filterable)
- **Multi-column workspace** up to 3 panes with drag-to-resize
- **Repair** — fix comments, smart quotes, trailing/missing commas, unquoted keys, hex/oct/bin numbers, Python literals (`True`, `False`, `None`), `undefined`, `NaN`, unclosed brackets
- **JSON Schema** validation with Ajv + formats (lazy-loaded)
- **MongoDB-style query** — `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$regex`, `$exists`, `$type`, `$mod`, `$size`, `$all`, `$elemMatch`, `$and`, `$or`, `$nor`, `$not`
- **Side-by-side compare** with sync-scroll, move detection, ignore rules (paths, `null` = missing, case-insensitive, trim, match arrays by id)
- **CSV export** of any table view (UTF-8 BOM, Excel-friendly)
- **Read-only share links** via Cloudflare Worker or Vercel function
- **Find / replace** with regex, case, whole-word

### Markdown previewer (`?tool=md`)
- GitHub-flavored Markdown with live preview
- **Mermaid** diagrams (flowchart, sequence, gantt, class, ER)
- **KaTeX** math (inline `$...$` and block `$$...$$`)
- Syntax-highlighted code (highlight.js)
- Rich embeds (YouTube, CodePen, Gist)
- Sanitized HTML output (DOMPurify)

### UX
- Light, dark, and system themes
- Mobile-responsive layout
- PWA install (iOS, Android, desktop)
- Drag a `.json` file anywhere to load
- Cmd/Ctrl+V paste in tree view
- 20+ keyboard shortcuts (`?` to view all)

## Tech stack

| Layer        | Choice |
| ---          | --- |
| UI           | Svelte 5 (runes) + Vite 8 + TypeScript (strict) |
| Editor       | CodeMirror 6 (themed via CSS vars) |
| Virtualization | @tanstack/virtual-core |
| Parser       | jsonc-parser (with offsets and paths) |
| Schema       | Ajv 8 + ajv-formats (lazy-loaded in worker) |
| Markdown     | marked + DOMPurify + highlight.js + KaTeX + Mermaid |
| Persistence  | idb-keyval (IndexedDB) |
| Workers      | Comlink RPC over Web Worker |
| Share API    | Cloudflare Worker (KV) — optional |
| Hosting      | Vercel |

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build → dist/
npm run preview      # serve the production build
npm run check        # svelte-check + tsc (no test runner configured)
```

> Node ≥ 20 recommended.

### Cloudflare share-link worker (optional)

```bash
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create SHARES
npx wrangler kv namespace create SHARES --preview
# paste returned ids into worker/wrangler.toml
npx wrangler deploy
```

Then point the frontend at it:

```bash
VITE_SHARE_API=https://jsonos-share.<sub>.workers.dev/api npm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  App.svelte         workspace (multi-tab, multi-slot)   │
│  ├─ TabBar, Toolbar, ValidationPanel, SidePanel         │
│  └─ SlotView × N   ──> TextView / TreeView / TableView  │
│                                                         │
│  doc Proxy ─── always forwards to workspace.active      │
│  DocStore   ($state runes; history, debounced parse)    │
│                                                         │
│  ── postMessage / Comlink ────────────────────────────  │
│                                                         │
│  Web Worker (json.worker.ts)                            │
│  ├─ parse / format / minify / sortKeys / repair         │
│  └─ Ajv validate (lazy-loaded)                          │
│                                                         │
│  IndexedDB                                              │
│  ├─ jsonos-docs   per-doc PersistedDoc                  │
│  └─ jsonos-meta   activeDocId etc.                      │
└─────────────────────────────────────────────────────────┘
```

See [`src/core/store.svelte.ts`](src/core/store.svelte.ts) and [`src/workers/json.worker.ts`](src/workers/json.worker.ts) for the meat.

## Deploy

The repo is Vercel-ready (`vercel.json` configures build, SPA rewrites, caching, and security headers). Outputs to `dist/`.

```bash
npm i -g vercel
vercel               # first deploy
vercel --prod
```

Set `VITE_PUBLIC_URL` (production + preview) so canonical/OG/sitemap URLs are correct. Optional `VITE_SHARE_API` for a remote share endpoint.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘Z` / `⌘⇧Z` | Undo / redo |
| `⌘S` | Download active doc |
| `⌘/` | Format JSON |
| `⌘\` | Toggle side panel |
| `⌘⇧W` | Toggle text wrap |
| `⌘⇧K` | Open Query panel |
| `⌘⇧C` | Toggle Compare pair |
| `⌘T` | New doc |
| `⌘1` / `⌘2` / `⌘3` | Focus column 1 / 2 / 3 |

Press `?` inside the app for the full list.

## Contributing

Contributions are welcome — bug reports, feature requests, and PRs alike.

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup and conventions.
2. Read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
3. Open an issue first for non-trivial changes so we can align on scope.

Good first issues are tagged [`good first issue`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## Roadmap

- [ ] JSONPath / JMESPath query alternative
- [ ] Schema generator (sample → JSON Schema)
- [ ] Per-doc share links with expiry control
- [ ] Diff export to patch files
- [ ] Plugin API for custom transforms
- [ ] More languages on landing pages

## Privacy

JSON OS does not upload your documents to any server. Parsing, validation, and storage happen locally. Read the [Privacy Policy](https://jsonos.online/privacy.html). Anonymous, cookieless usage analytics (Vercel) only — no PII.

## License

[MIT](LICENSE) © JSON OS contributors

## Acknowledgements

Stands on the shoulders of giants: [Svelte](https://svelte.dev), [Vite](https://vitejs.dev), [CodeMirror](https://codemirror.net), [Ajv](https://ajv.js.org), [jsonc-parser](https://github.com/microsoft/node-jsonc-parser), [Mermaid](https://mermaid.js.org), [KaTeX](https://katex.org), [marked](https://marked.js.org), [highlight.js](https://highlightjs.org), [TanStack Virtual](https://tanstack.com/virtual), [Comlink](https://github.com/GoogleChromeLabs/comlink), [idb-keyval](https://github.com/jakearchibald/idb-keyval).

---

<div align="center">
<sub>If JSON OS saved you time, consider <a href="https://github.com/sponsors">starring the repo</a> and sharing it.</sub>
</div>
