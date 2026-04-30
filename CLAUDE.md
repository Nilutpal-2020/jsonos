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

To point the frontend at a local worker: `VITE_SHARE_API=http://localhost:8787/api npm run dev`. Default falls back to relative `/api`.

Worker one-time setup needs `npx wrangler login`, then `npx wrangler kv namespace create SHARES` (and `--preview` variant), pasting both ids into `worker/wrangler.toml`. Set `ALLOWED_ORIGINS` there too — `*` only for local.

## Architecture

Browser-first JSON workbench. Frontend is **Svelte 5 (runes) + Vite + TypeScript**. All parse / validate / format / repair / sortKeys work runs in a Web Worker. The optional Cloudflare Worker (`worker/`) only backs read-only share links.

### Document model + state

- `src/core/store.svelte.ts` defines `DocStore` (per-document state: `text`, `parse`, `name`, `schemaText`, history `past`/`future`, debounced parse + save) and `WorkspaceStore` (multi-tab, `docs[]` + `activeId`). `WorkspaceStore.init()` rehydrates from IndexedDB on mount.
- Components do **not** import a DocStore directly. They import `{ doc }` — a `Proxy` that always forwards to `workspace.active`. This keeps every panel bound to the active tab without prop drilling. When adding new state, add it on `DocStore`, not on a singleton, or tab-switching will leak state across docs.
- Mutations always go through `setText` (history-tracked) or `applyValuePatch` → `replaceParsed` (re-stringifies). Don't write to `text` directly outside the store.
- Parse + schema validation are sequence-guarded (`parseSeq`, `schemaSeq`) so out-of-order worker replies are dropped. Preserve this when adding async ops.

### Worker boundary

- `src/workers/json.worker.ts` exposes a Comlink API consumed via `src/workers/client.ts` as `jsonWorker`. Heavy/blocking work (parse, format, minify, repair, sortKeys, AJV schema validate) lives there.
- AJV is lazy-loaded inside the worker (`getAjv()`); keep it that way to avoid pulling it into the main bundle.
- `src/core/json.ts` uses `jsonc-parser` (note: `allowTrailingComma: false, disallowComments: true` — it's strict JSON despite the lib name).
- Patches are typed in `src/core/types.ts` (`Patch` union including a `replaceText` escape hatch); apply via `src/core/patch.ts`.

### Views and panels

- Two synchronized views over the same `DocStore`: `src/views/TextView.svelte` (CodeMirror 6) and `src/views/TreeView.svelte`. Layout in `App.svelte` toggles `text | tree | split`.
- Side panels in `src/components/` (`SchemaPanel`, `QueryPanel`, `DiffPanel`, `ApiPanel`, `ValidationPanel`, `ShareDialog`) all read/write through `doc` proxy.
- Keyboard shortcuts handled in `App.svelte` (`onKey`): cmd/ctrl + Z / shift-Z / Y / S (download) / / (format) / \ (toggle panel) / T (new doc).

### Persistence

- `src/core/persist.ts` wraps `idb-keyval` with two stores: `jsonos-docs` (per-doc `PersistedDoc`) and `jsonos-meta` (e.g. `activeDocId`). Saves are debounced (`SAVE_DEBOUNCE_MS = 400`); quota errors are swallowed.

### Sharing

- `src/core/share.ts` posts to `${VITE_SHARE_API ?? '/api'}/share` and reads back via `?share=<id>` URL param. `App.svelte` consumes the param on mount, loads the payload as a new tab, then `clearShareIdFromUrl()`.
- Worker (`worker/src/index.ts`) is the server side: KV-backed, immutable entries, default 30-day TTL, 1 MiB cap, 96-bit random base64url ids, per-IP 30/min POST rate limit, CORS allow-list from `ALLOWED_ORIGINS`. Don't loosen these without intent.

## Conventions to know

- Svelte 5 runes (`$state`, `$derived`) — not Svelte 4 stores. The two `.svelte.ts` extension on `store.svelte.ts` is required for the Svelte compiler to process runes outside `.svelte` files.
- `tsconfig.app.json` has `checkJs: true` and `allowJs: true` — JS inside `.svelte` is typechecked.
- `implementation-plan.md` is the product/architecture spec. Phase 1 (MVP editor), Phase 2 (power-user), Phase 3 (differentiation) frame what belongs where; check it before adding features at the wrong layer (e.g. don't move worker-side work into the main thread).
