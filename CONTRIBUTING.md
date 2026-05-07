# Contributing to JSON OS

Thanks for taking the time to contribute. This guide covers how to set up the project, the conventions used, and how to land a PR.

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Ways to contribute

- 🐛 Report a bug — [open an issue](../../issues/new?template=bug.yml)
- 💡 Request a feature — [open an issue](../../issues/new?template=feature.yml)
- 📖 Improve documentation
- 🧑‍💻 Fix a [`good first issue`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
- 🧪 Add or improve tests
- 🌐 Help with translations / accessibility

> For non-trivial code changes, **please open an issue first** so we can align on scope before you spend time.

---

## Setup

```bash
git clone <your-fork>
cd jsonos
npm install
npm run dev          # http://localhost:5173
npm run check        # svelte-check + tsc
npm run build        # production build → dist/
```

Node ≥ 20 recommended.

If you're working on the share-link backend:

```bash
cd worker
npm install
npm run dev          # http://localhost:8787
```

Point the frontend at it: `VITE_SHARE_API=http://localhost:8787/api npm run dev`.

---

## Project layout

```
src/
  App.svelte              top-level layout
  components/             toolbar, tabs, panels, dialogs
  views/                  Text / Tree / Table views
  core/                   stores, parsing, persistence, types
  workers/                Web Worker boundary (Comlink)
  markdown/               Markdown tool (lazy-loaded)
public/                   static assets, landing pages, sitemap, robots
worker/                   Cloudflare Worker for share links
examples/                 Vercel KV alternative for share API
```

See [CLAUDE.md](CLAUDE.md) for an architecture overview.

---

## Conventions

### Code style
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`) — not Svelte 4 stores.
- TypeScript strict; `checkJs: true` for `.svelte` blocks.
- Prefer editing existing files over creating new ones.
- Don't introduce abstractions or cleanup beyond what the change requires.
- No comments unless the *why* is non-obvious. Don't narrate what the code already shows.
- Keep heavy/blocking work in `src/workers/json.worker.ts` — never in the main thread.

### Components and state
- Mutate documents through `setText` (history-tracked) or `applyValuePatch`. Don't write to `text` directly.
- Components import the `doc` proxy (`src/core/store.svelte.ts`), not a singleton DocStore.
- Add new doc-scoped state on `DocStore`, not on globals — otherwise tab-switching leaks state.
- Preserve sequence guards (`parseSeq`, `schemaSeq`) when adding async ops.

### Performance
- AJV is lazy-loaded inside the worker. Keep it that way.
- Avoid pulling Markdown deps (`marked`, `mermaid`, `katex`) into the JSON bundle.
- Run a Lighthouse / PageSpeed check before submitting performance-sensitive PRs.

### Commits
We follow a light Conventional Commits style. Examples:

```
feat(query): support $regex with flags
fix(tree): drop selection when active doc switches
perf(worker): reuse Ajv instance across validations
docs(readme): clarify share-API setup
chore: bump vite to 8.0.10
```

Keep the subject ≤ 72 chars. Body explains *why* if the diff doesn't.

---

## Pull request flow

1. Fork the repo and create a topic branch from `main`:
   ```
   git checkout -b feat/short-description
   ```
2. Make your changes. Run:
   ```bash
   npm run check          # must pass with no errors
   npm run build          # must succeed
   ```
3. **Test in a browser.** Type checks don't catch UX regressions.
4. Commit with a descriptive message (see above).
5. Push and open a PR using the [PR template](.github/pull_request_template.md).
6. Link the issue your PR addresses (`Fixes #123`).
7. CI must be green before review.

### What we look for
- Scoped diffs (one concern per PR).
- No drive-by refactors.
- No new files unless necessary.
- Clear commit messages and PR description.
- Screenshots / GIFs for UI changes.

---

## Reporting security issues

**Do not open public issues for security vulnerabilities.** See [SECURITY.md](.github/SECURITY.md) for the disclosure process.

---

## License

By contributing, you agree your contributions will be licensed under the [MIT License](LICENSE).
