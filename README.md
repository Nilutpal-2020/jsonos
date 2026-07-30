<div align="center">

<img src="public/favicon.svg" width="80" height="80" alt="JSON OS logo" />

# JSON OS

**The ultimate free, local-first browser workbench for JSON &amp; Markdown.**

Format, validate, repair, compare, query, chart, and anonymize JSON. Generate TypeScript/Zod/Pydantic/Serde types, test APIs with cURL import, and write Markdown with Mermaid &amp; KaTeX math. 100% browser-based. No signup, no server uploads.

[**Live app · jsonos.online**](https://jsonos.online) &nbsp;·&nbsp; [Tools](https://jsonos.online/tools/) &nbsp;·&nbsp; [Privacy](https://jsonos.online/privacy.html) &nbsp;·&nbsp; [Report a bug](../../issues/new?template=bug.yml) &nbsp;·&nbsp; [Request a feature](../../issues/new?template=feature.yml)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Made with Svelte](https://img.shields.io/badge/svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![Built with Vite](https://img.shields.io/badge/vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

## Why JSON OS?

Most online JSON editors silently upload your sensitive payloads to a remote server. **JSON OS** runs **100% in your browser** — your documents and API credentials never leave your device. The heavy compute pipeline (parse, validate, format, repair, sort, schema check, type generation) runs in a Web Worker so the UI stays lightning-fast even on huge files.

- &nbsp;✅ &nbsp;**Local-first** — Web Worker compute, IndexedDB persistence, zero tracking
- &nbsp;✅ &nbsp;**No signup, no backend servers** — open the URL and you're ready
- &nbsp;✅ &nbsp;**Works 100% offline** as a native PWA
- &nbsp;✅ &nbsp;**Free and open source** under MIT

---

## Powerful Features

### 📊 Four Synchronized Workbench Views
- **Text View** — CodeMirror 6 with syntax highlighting, inline syntax error banners (`⚡ 1-Click Repair`), soft wrap, and line folding.
- **Tree View** — Virtualized, high-performance tree navigator with expandable nodes, search filtering, and key/value editing.
- **Table View** — Sortable, filterable spreadsheet grid view with 1-click **CSV Export**.
- **Chart View** — Instant interactive **Bar, Line, Pie, and Doughnut SVG Charts** generated directly from JSON arrays with summary stats (**SUM, AVG, MIN, MAX**) and 1-click **SVG Export**.

### ⚙️ 1-Click Type & Schema Generator
- Infer strongly-typed models directly from JSON payloads:
  - **TypeScript Interfaces**: Generates clean type definitions with array unions.
  - **Zod Schemas**: Generates `z.object({...})` runtime validation schemas.
  - **Python Pydantic**: Generates `class Model(BaseModel): ...` with Field aliases.
  - **Rust Serde**: Generates `#[derive(Serialize, Deserialize)] pub struct ...`.
  - **Go Structs**: Generates `type Model struct { ... json:"..." }`.
  - **Dart Model Classes**: Generates null-safe `final String?` models with `fromJson` and `toJson`.
  - **Draft-07 JSON Schema**: Generates formal JSON Schema definitions.
- 1-click **Copy Code** and **Download File** buttons.

### 🔒 PII & Secrets Anonymizer
- Detect and sanitize sensitive payloads before sharing or logging:
  - **Emails**, **Passwords**, **API Keys**, **JWT Tokens**, **Credit Cards**, **IP Addresses**, **Mobile Phone Numbers**, **Web URLs / Endpoints**, and **Names & Assignee PII**.
  - **Redact ALL Values Mode**: Master toggle to redact 100% of scalar payload data.
  - 3 Modes: **Redact** (`[REDACTED]`), **Mask** (`u***@dom.com`), or **Hash** (`hash_a1b2`).
  - 1-click **"⚡ Redact Payload"** action.

### ⚡ In-Browser API Sandbox & cURL Importer
- Send HTTP `GET / POST / PUT / DELETE` requests directly inside your browser.
- **📋 Import cURL**: Paste cURL commands from DevTools or Postman to auto-populate method, URL, headers, and body.
- **⎘ Copy as cURL**: Export any configured request as a formatted cURL command.
- **📥 Load Active Doc as Body**: Use your active verified JSON file as request body with syntax guarding.
- **⚡ Open Response in Workbench Tab**: Load API JSON responses into a new tab for querying, charting, or type generation.

### 🛠️ Forgiving JSON Repair Engine
- Auto-fixes common real-world JSON syntax errors:
  - Escaped double quotes (`\"`), smart curly quotes (`“` `”`), single quotes (`'`).
  - Unquoted object keys with hyphens `-`, dots `.`, `$`, and `@`.
  - Unescaped HTML entities (`&quot;`, `&amp;`) and text prefixes (e.g. `2026-07-22 INFO {"a": 1}`).
  - Strips JS/Python comment lines (`//`, `/* */`, `#`) on repair.
  - Coerces Python/JS literals (`True`, `False`, `None`, `undefined`, `NaN`, `Infinity`).
  - Trailing commas, missing colons (`=`), and unclosed brackets.

### 🔍 Schema Validation & MongoDB Queries
- **JSON Schema Validation** — Validate payloads with Ajv (Draft-07 & 2020-12) with built-in templates (User Profile, API Response, GeoJSON, Avro).
- **MongoDB-Style Querying** — Filter arrays with `$match`, `$eq`, `$gt`, `$gte`, `$in`, `$regex`, `$elemMatch`, `$and`, `$or`.
- **Side-by-Side Compare / Diff** — Explicit on-demand sync-scroll comparison with path matching (`$`), theme-adaptive difference highlights, and ignore rules.

### ✍️ Markdown Studio (`?tool=md`)
- Live Markdown editor & previewer with quick-switch pill indicator (`● ✎ Markdown Studio`).
- **Mermaid.js Diagrams**: Flowcharts, Sequence diagrams, Gantt charts, Mindmaps, Class diagrams, ER diagrams.
- **KaTeX Math Equations**: Inline `$E=mc^2$` and block `$$...$$` rendering.
- Collapsible **Outline Drawer** and **Document Metrics Footer** (Word count, Reading time).

---

## Tech Stack

| Layer          | Technology Choice |
| :---           | :--- |
| **UI Framework** | Svelte 5 (runes) + Vite 8 + TypeScript (strict) |
| **Editor**      | CodeMirror 6 (themed via CSS variables) |
| **Virtualization** | `@tanstack/virtual-core` |
| **Parser**      | `jsonc-parser` + custom Repair Engine |
| **Schema**      | Ajv 8 + `ajv-formats` (lazy-loaded in Web Worker) |
| **Markdown**    | `marked` + DOMPurify + `highlight.js` + KaTeX + Mermaid |
| **Persistence** | `idb-keyval` (IndexedDB) |
| **Workers**     | Comlink RPC over Web Worker |
| **Hosting**     | Vercel |

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Nilutpal-2020/jsonos.git
cd jsonos

# Install dependencies
npm install

# Run Vite dev server
npm run dev          # http://localhost:5173

# Typecheck and build production bundle
npm run check
npm run build        # Output in dist/
```

> **Requirements**: Node.js ≥ 20 recommended.

---

## License

Distributed under the **MIT License**. Free for personal, commercial, and enterprise use.
