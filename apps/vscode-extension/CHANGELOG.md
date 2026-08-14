# Changelog

All notable changes to the **JSON OS Redact** VS Code Extension will be documented in this file.

## [0.1.0] - 2026-08-15

### Added
- Initial release of **JSON OS Redact** VS Code Extension.
- Live background diagnostics flagging secrets, emails, prices, cards, IPs, URLs, and names as Warning squigglies.
- Quick Fixes (`Cmd+.` / `Ctrl+.`): "Redact this value" and "Ignore this line" (`// redact-ignore`).
- Status bar item displaying PII match count for active document.
- Command `JSON OS Redact: Redact Current File` with side-by-side diff preview (`vscode.diff`).
- Command `JSON OS Redact: Redact Selection`.
- Command `JSON OS Redact: Redact Project...` with VS Code native webview report and batch review.
- Editor and Explorer context menu integration.
- Full configuration schema under `jsonosRedact.*`.
