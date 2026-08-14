# JSON OS Redact — Chrome Extension

A Manifest V3 Chrome extension companion to [JSON OS](https://jsonos.online). It lets developers, engineers, and support teams instantly strip PII and secrets (emails, passwords, API tokens, credit card numbers, IP addresses, phone numbers, domain URLs, and names) out of text, source code, and log files before pasting them into AI chats (ChatGPT, Claude), GitHub issues, support tickets, or public forums.

**100% Client-Side & Privacy First**: Zero network requests, zero telemetry, zero analytics. No data ever leaves your browser.

---

## Features

1. **Popup Window (Primary Interface)**:
   - Live/On-demand redaction of typed or pasted text.
   - 3 Redaction Modes: **Redact** (`[EMAIL]`), **Mask** (`j***@ex***.com`), and **Hash** (SHA-256).
   - 7 Granular Detector Toggles: Emails, Secrets/Tokens, Credit Cards, IP Addresses, URLs/Domains, Phone Numbers, and Names.
   - Match Summary Badge Breakdown showing counts for each detected PII type.
   - One-click **Copy Redacted Text** to clipboard.
   - Persistent preferences saved via `chrome.storage.local`.

2. **Context Menu Integration**:
   - Right-click any selected text on any webpage -> click **"Redact selected text"**.
   - Runs redaction using your default preferences and copies the result straight to your clipboard.
   - Shows desktop notification confirming items removed.

3. **Options Page**:
   - Customize default redaction mode and detector toggles for context menu shortcuts and new sessions.

---

## Installation & Local Development

### 1. Build the Extension

From the repository root or the `apps/chrome-extension` directory:

```bash
# From root repo:
npm run build:ext

# Or inside apps/chrome-extension:
cd apps/chrome-extension
npm install
npm run build
```

This compiles TypeScript, bundles all pages/service workers with Vite, and generates the production distribution folder at `apps/chrome-extension/dist/`.

### 2. Load Unpacked in Chrome

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left toolbar.
4. Select the `apps/chrome-extension/dist` directory.
5. The **JSON OS Redact** icon `{ · }` will appear in your Chrome extensions toolbar!

---

## Chrome Web Store Submission Checklist

Before submitting **JSON OS Redact** to the Chrome Web Store:

- [ ] **Privacy Policy**: Provide link to privacy policy page (e.g. `https://jsonos.online/privacy.html` specifying zero data collection).
- [ ] **Manifest V3 Compliance**: Verify no remote scripts or inline code are included.
- [ ] **Permissions Justification**:
  - `storage`: Required to save user preferences across browser restarts.
  - `contextMenus`: Required for right-click context menu "Redact selected text".
  - `activeTab` & `scripting`: Required to inject clipboard write operation on right-click.
  - `offscreen`: Fallback for clipboard access on restricted pages (`chrome://`).
  - `notifications`: Required to notify user when text has been redacted & copied via context menu.
- [ ] **Store Assets**:
  - Store Icon (128x128 PNG) — located at `public/icons/icon128.png`.
  - Promotional Screenshots (1280x800 or 640x400 PNGs) showing Popup UI, Options Page, and Context Menu in action.
- [ ] **Store Description**:
  - Title: JSON OS Redact — PII & Secrets Anonymizer
  - Short Description: Strip emails, secrets, API keys, IPs, and PII from text client-side before sharing or pasting into AI.
