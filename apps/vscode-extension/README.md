# JSON OS Redact — VS Code Extension

[![Visual Studio Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?style=flat-square&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=jsonos.jsonos-redact-vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Privacy: 100% Local](https://img.shields.io/badge/Privacy-100%25%20Local-emerald?style=flat-square&logo=shield)](https://jsonos.online)
[![Companion: JSON OS](https://img.shields.io/badge/Web%20App-jsonos.online-blueviolet?style=flat-square)](https://jsonos.online)

A **zero-network, client-side** VS Code extension companion to [JSON OS](https://jsonos.online) and its sibling Chrome extension. 

**JSON OS Redact** prevents accidental leakage of API keys, passwords, customer PII, credit cards, prices, and secrets while coding or preparing code/JSON to paste into AI models (ChatGPT, Claude, Gemini, Copilot).

> 🔒 **100% Local & Privacy-First**: No network calls, no telemetry, no analytics, no external servers. Everything runs entirely within your local editor environment.

---

## ⚡ Key Features

### 1. Live Warning Diagnostics & Status Bar
- Automatically detects sensitive data in background as you type (400ms debounced).
- Flags matches with **Warning squigglies** in the editor and lists them in the **Problems** panel.
- Displays a real-time sensitive match count in the status bar (`⚠ 3 PII matches`).

### 2. One-Click Quick Fixes (`Cmd+.` / `Ctrl+.`)
- **Redact this value**: Replaces the sensitive value with a safe placeholder (`[REDACTED_EMAIL]`, `j***@dom.com`, or `hash_a1b2`).
- **Ignore this line**: Appends a `// redact-ignore` comment marker to suppress warnings on specific lines.

### 3. Interactive Side-by-Side Diff Preview
- **`JSON OS Redact: Redact Current File`**: Scans the active file and opens a native **`vscode.diff` side-by-side preview** so you can inspect all redactions before confirming changes.
- **`JSON OS Redact: Redact ALL Values in Current File`**: Sanitizes every string and numeric payload value in JSON/code files for sharing.
- **`JSON OS Redact: Redact Selection`**: Instantly sanitizes highlighted code blocks in place.

### 4. Project-Wide Batch Redactor
- **`JSON OS Redact: Redact Project...`**: Scans workspace files (respecting `.gitignore` and file exclusions) and opens an interactive **Project Scan Report Webview** with checkboxes for selective multi-file batch review & execution.

### 5. Context Menu Integration
- Right-click inside any editor ➔ **"Redact Selection"**, **"Redact Current File"**, or **"Redact ALL Values in Current File"**.
- Right-click any file in the File Explorer ➔ **"Redact Current File"**.

---

## 🔍 Supported Detectors

| Category | Patterns & Examples Detected | Default |
|---|---|---|
| **API Keys & Secrets** | OpenAI (`sk-...`), AWS (`AKIA...`), GitHub tokens, Slack webhooks, Stripe keys, JWT tokens, generic `password: "..."`, `secret: "..."`, `token: "..."` | `true` |
| **Prices & Currency** | `$100`, `$99.99`, `Rs. 1000`, `€49.00`, `₹50,000`, `£250`, `¥1000` | `true` |
| **Email Addresses** | Standard and complex emails (`user@company.com`, `john.doe+tag@domain.co.uk`) | `true` |
| **Credit Cards** | Visa, MasterCard, Amex, Discover (13–19 digits with Luhn checksum validation) | `true` |
| **IPv4 Addresses** | Public and internal IPv4 addresses (`192.168.1.1`, `10.0.0.1`) | `true` |
| **Web URLs** | Endpoints, API URLs, webhook addresses (`https://api.domain.com/v1/...`) | `true` |
| **Names & Authors** | Key-value name assignments (`name: "John Doe"`, `author: "Alice"`) | `false` |
| **Phone Numbers** | International and US phone formats (disabled by default to prevent log false positives) | `false` |

---

## ⚙️ Configuration Settings

Access settings via `Preferences: Open User Settings` (`Cmd+,` / `Ctrl+,`) and search for `jsonosRedact`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `jsonosRedact.mode` | `string` | `"redact"` | Redaction style: `"redact"` (`[EMAIL]`), `"mask"` (`u***@dom.com`), or `"hash"` (`SHA-256`) |
| `jsonosRedact.liveSuggestions` | `boolean` | `true` | Enable live warning squiggles while typing |
| `jsonosRedact.redactAllValues` | `boolean` | `false` | JSON files: Treat every value as sensitive regardless of key/pattern |
| `jsonosRedact.maskSecrets` | `boolean` | `true` | Detect passwords, API keys, JWTs, and token assignments |
| `jsonosRedact.maskPrices` | `boolean` | `true` | Detect prices and currency amounts |
| `jsonosRedact.maskEmails` | `boolean` | `true` | Detect email addresses |
| `jsonosRedact.maskCards` | `boolean` | `true` | Detect credit card numbers |
| `jsonosRedact.maskIps` | `boolean` | `true` | Detect IPv4 addresses |
| `jsonosRedact.maskUrls` | `boolean` | `true` | Detect web URLs and endpoints |
| `jsonosRedact.maskPhones` | `boolean` | `false` | Detect mobile/phone numbers |
| `jsonosRedact.maskNames` | `boolean` | `false` | Detect key-value name assignments |
| `jsonosRedact.excludeGlobs` | `array` | `[...]` | Excluded file patterns (`node_modules`, `.git`, `dist`, `build`, etc.) |

---

## ⌨️ Commands Reference

Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) to run:

- **`JSON OS Redact: Redact Current File`** — Scan active file with side-by-side diff preview.
- **`JSON OS Redact: Redact ALL Values in Current File`** — Sanitize all payload values in current file.
- **`JSON OS Redact: Redact Selection`** — Sanitize currently selected text.
- **`JSON OS Redact: Redact Project...`** — Batch scan workspace with interactive webview report.

---

## 🌐 Ecosystem

- **Web Workbench**: [jsonos.online](https://jsonos.online) — Free, browser-based JSON schema validator, formatter, repair, diff, and query workbench.
- **Source Code & Issues**: [GitHub Repository](https://github.com/Nilutpal-2020/jsonos)
- **License**: MIT
