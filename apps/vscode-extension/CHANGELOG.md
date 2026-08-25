# Changelog

All notable changes to the **JSON OS Redact** VS Code Extension will be documented in this file.

## [0.1.3] - 2026-08-15

### Fixed
- **Standalone Bundle (`esbuild`)**: Switched to self-contained `esbuild` distribution bundling. The extension now inlines all core redaction and PII detector engines into `dist/extension.js` (21.6 KB), eliminating `Cannot find module '@jsonos/redact-core'` runtime errors when installed from the marketplace.
- **Activation Lifecycle**: Added explicit `onCommand:` and `onLanguage` activation event triggers in `package.json`, ensuring the extension activates instantly upon clicking any context menu item or Command Palette command.
- **Command Palette Labels**: Cleaned up command titles to prevent duplicate `JSON OS Redact:` prefixes in the Command Palette.

### Added
- **Redact ALL Values in Current File**: Added dedicated command (`jsonosRedact.redactAllValuesInFile`) and `"jsonosRedact.redactAllValues"` configuration setting to redact/mask all payload values in JSON and code files before sharing.
- **Prices & Currency Amounts Detector**: Added detection and masking for financial amounts (`$100`, `Rs. 1000`, `€99.99`, `₹50,000`, `£250`).
- **Context Menu Integration**: Added right-click context menu shortcuts in both the active editor and file explorer.

---

## [0.1.0] - 2026-08-15

### Added
- Initial release of **JSON OS Redact** VS Code Extension.
- **Live Warning Diagnostics**: Background scanning (400ms debounced) flagging sensitive data as Warning squiggles in the editor and Problems panel.
- **Quick Fixes** (`Cmd+.` / `Ctrl+.`): 1-click "Redact this value" and "Ignore this line" (`// redact-ignore`).
- **Status Bar Indicator**: Real-time sensitive match count for the active document (`⚠ N PII matches`).
- **Side-by-Side Diff Preview**: Interactive `vscode.diff` review before applying file redactions.
- **Selection Redaction**: In-place redaction of highlighted code blocks.
- **Project-Wide Batch Redactor**: Workspace scanner with an interactive VS Code native webview report and selective multi-file batch execution.
- **Privacy-First**: 100% client-side execution with zero telemetry or network calls.
