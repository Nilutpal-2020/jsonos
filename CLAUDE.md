# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Frontend (run from repo root):

```bash
npm run dev       # vite dev server
npm run build     # vite build → dist/
npm run preview   # preview built bundle
npm run check     # svelte-check on tsconfig.app.json + tsc on tsconfig.node.json (typecheck only; no test runner configured)
```

Cloudflare Worker (separate workspace under `worker/`):

```bash
cd worker
npm install
npm run dev        # wrangler dev → http://localhost:8787
npm run deploy     # wrangler deploy
npm run typecheck  # tsc --noEmit
npm run tail       # wrangler tail
```

## Architecture

Browser-first JSON & Markdown workbench. Frontend is **Svelte 5 (runes) + Vite + TypeScript**. Compute-heavy tasks (parse, validate, format, repair, sortKeys, type generation) run inside a Web Worker or decoupled core modules.

### Document Model & State Management

- `src/core/store.svelte.ts` defines `DocStore` (per-document state: `text`, `parse`, `name`, `schemaText`, history `past`/`future`, debounced parse + save) and `WorkspaceStore` (multi-tab, `docs[]` + `slots[]`). Rehydrates from IndexedDB on mount.
- Components do **not** import a DocStore directly. They import `{ doc }` — a `Proxy` forwarding to `workspace.active`. This keeps every panel bound to the active tab without prop drilling. When adding new state, add it on `DocStore`, not on a singleton, or tab-switching will leak state across docs.
- Mutations always go through `setText` (history-tracked) or `applyValuePatch` → `replaceParsed` (re-stringifies). Don't write to `text` directly outside the store.

### Key Core Modules & Utility Engines

- `src/core/json-repair.ts`: Forgiving JSON repair engine (`preClean` pass + tokenizer lookahead for raw quotes, escaped quotes `\"`, HTML entities, Python/JS literals `True`/`None`/`undefined`, unquoted keys, trailing commas, missing colons, comment removal).
- `src/core/type-gen.ts`: Type inference engine inferring TypeScript Interfaces, Zod Schemas, Python Pydantic Models, Rust Serde Structs, Go Structs, **Dart Model Classes** (`final String?`, `fromJson`/`toJson`), and Draft-07 JSON Schema.
- `src/core/anonymize.ts`: PII & Secrets redactor (detects emails, passwords, JWT tokens, credit cards, IPs, **mobile phone numbers**, **web URLs/domains**, and **names/assignees**; supports Redact, Mask, Hash, and **Redact ALL Values** mode).
- `src/core/curl-parser.ts`: Bi-directional cURL parser and command generator.
- `src/core/compare.svelte.ts`: Side-by-side JSON diff comparison engine. Explicitly enabled via `compare.setPair()` on demand to avoid unwanted diff highlights in standard split view mode.
- `src/core/tool-router.svelte.ts`: Top-level workbench router managing switching between **JSON Workbench** (`tool.current === 'json'`) and **Markdown Studio** (`tool.current === 'md'`).

### Views & Side Panels

- **Views** (`src/views/`):
  - `TextView.svelte`: CodeMirror 6 text editor with inline parse error repair banner.
  - `TreeView.svelte`: Virtualized expandable tree view with real-time key/value search filter, breadcrumb navigation, 1-click boolean checkbox toggles, and container count badges.
  - `TableView.svelte`: Sortable spreadsheet grid view with CSV export.
  - `ChartView.svelte`: Interactive SVG Bar, Line, Pie, and Doughnut chart visualizer with summary statistics (**SUM, AVG, MIN, MAX**) and SVG export.
- **Side Panels** (`src/components/`):
  - `SchemaPanel.svelte`: AJV JSON Schema validation with preset templates (User Profile, API Response, GeoJSON, Avro).
  - `QueryPanel.svelte`: MongoDB `$match` query filter panel.
  - `TypeGenPanel.svelte`: Code model inference panel (TS, Zod, Python, Rust, Go, **Dart**, Schema).
  - `AnonymizerPanel.svelte`: PII, secrets, mobile numbers, domain URLs, and names redaction panel.
  - `ApiPanel.svelte`: In-browser HTTP API Sandbox with cURL import/export, active doc request body loading, and response tab opening.
  - `DiffPanel.svelte`: Side-by-side JSON diff comparison with path & array key rules.
  - `ToolSwitcher.svelte`: Workbench selector with quick-switch pill indicator (`● ✎ Markdown Studio`) and first-visit visual hint.

### Markdown Studio (`src/markdown/`)

- Lazy-loaded via dynamic `import()` when switching to `tool.current === 'md'`.
- Integrates `marked`, DOMPurify, `highlight.js`, KaTeX math (`$E=mc^2$`), and Mermaid.js diagrams (Flowcharts, Sequence, Gantt, Mindmap, Class, ER).

### Worker Boundary

- `src/workers/json.worker.ts` exposes a Comlink API consumed via `src/workers/client.ts` as `jsonWorker`.
- AJV is lazy-loaded inside the worker (`getAjv()`); keep it that way to avoid pulling it into the main bundle.

### Persistence

- `src/core/persist.ts` wraps `idb-keyval` with two stores: `jsonos-docs` (`PersistedDoc`) and `jsonos-meta`. Saves are debounced (`SAVE_DEBOUNCE_MS = 400`).
