# JSON OS Redact — VS Code Extension

A zero-network, local VS Code extension companion to [JSON OS](https://jsonos.online) and its sibling Chrome extension. It helps developers avoid accidentally leaking secrets, PII, API keys, passwords, prices, and sensitive customer data while coding — both via **live warning squiggles as you type** and **on-demand file/project redaction**.

**100% Local & Privacy-First**: No network calls, no telemetry, no analytics. Nothing leaves your machine.

---

## Features

### 1. Live Warning Diagnostics & Quick Fixes
- Runs background PII & secrets detection as you type (400ms debounced).
- Flags matches with **Warning** squiggly lines in the editor and in the **Problems** panel.
- Status bar indicator (`⚠ N PII matches`) showing real-time count for the active file.
- **Quick Fixes** (`Cmd+.` or `Ctrl+.` / clicking yellow lightbulb):
  - **Redact this value**: Replaces match with redacted placeholder (`[REDACTED_EMAIL]`, `j***@dom.com`, `hash_a1b2`).
  - **Ignore this line**: Appends a `// redact-ignore` comment marker to suppress warnings on that line.

### 2. On-Demand Redaction Commands
- **`JSON OS Redact: Redact Current File`**:
  - Scans active file and launches a **side-by-side diff preview** (`vscode.diff`) so you can inspect changes before applying.
- **`JSON OS Redact: Redact Selection`**:
  - Redacts highlighted text in place with 1-click confirmation.
- **`JSON OS Redact: Redact Project...`**:
  - Scans workspace files (respecting `.gitignore` and sensible file exclusions).
  - Opens a VS Code native-themed **Project Scan Report Webview** with per-file breakdown and checkboxes for multi-file batch review & execution.

### 3. Context Menu Integration
- Right-click inside any editor ➔ **"Redact Selection"** or **"Redact Current File"**.
- Right-click any file in Explorer ➔ **"Redact Current File"**.

---

## Configuration Settings

Access settings via `Preferences: Open User Settings` and search for `jsonosRedact`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `jsonosRedact.mode` | `string` | `"redact"` | Redaction mode: `"redact"`, `"mask"`, or `"hash"` |
| `jsonosRedact.liveSuggestions` | `boolean` | `true` | Enable live warning squiggles while typing |
| `jsonosRedact.maskSecrets` | `boolean` | `true` | Passwords, API keys (OpenAI, AWS, Stripe, GitHub, Slack), JWTs |
| `jsonosRedact.maskPrices` | `boolean` | `true` | Prices and currency amounts (`$100`, `Rs. 1000`, `€99.99`) |
| `jsonosRedact.maskEmails` | `boolean` | `true` | Email addresses |
| `jsonosRedact.maskCards` | `boolean` | `true` | Credit card numbers |
| `jsonosRedact.maskIps` | `boolean` | `true` | IPv4 addresses |
| `jsonosRedact.maskUrls` | `boolean` | `true` | Web URLs and webhook endpoints |
| `jsonosRedact.maskPhones` | `boolean` | `false` | Phone numbers (off by default to avoid log false positives) |
| `jsonosRedact.maskNames` | `boolean` | `false` | Key-value name assignments (`name: John`) |
| `jsonosRedact.excludeGlobs` | `array` | `[...]` | Excluded file patterns (`node_modules`, `.git`, `dist`, etc.) |

---

## Local Development & Testing

### Running in VS Code (Extension Development Host)

1. Open the repository root or `apps/vscode-extension` in VS Code.
2. Run `npm install` inside `apps/vscode-extension`.
3. Press **`F5`** (or select **Run ➔ Start Debugging**).
4. A new **Extension Development Host** window will open with **JSON OS Redact** active!
5. Open any file with secrets, prices, or emails to see live squiggles, status bar indicators, and test redaction commands.

### Compiling manually

```bash
cd apps/vscode-extension
npm run compile
```
