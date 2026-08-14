"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProjectReportWebview = createProjectReportWebview;
const vscode = __importStar(require("vscode"));
function createProjectReportWebview(extensionUri, results, onConfirm) {
    const panel = vscode.window.createWebviewPanel('jsonosRedactReport', 'JSON OS Redact — Project Scan Report', vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
    });
    const totalMatches = results.reduce((acc, r) => acc + r.count, 0);
    panel.webview.html = getWebviewContent(results, totalMatches);
    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'applyBatchRedaction') {
            const selectedPaths = message.selectedPaths || [];
            const selectedUris = results
                .filter((r) => selectedPaths.includes(r.relativePath))
                .map((r) => r.uri);
            panel.dispose();
            await onConfirm(selectedUris);
        }
    });
}
function getWebviewContent(results, totalMatches) {
    const fileRows = results
        .map((r, i) => {
        const countsByType = {};
        r.matches.forEach((m) => {
            countsByType[m.type] = (countsByType[m.type] || 0) + 1;
        });
        const badgeTags = Object.entries(countsByType)
            .map(([type, c]) => `<span class="type-badge">${c} ${type}</span>`)
            .join(' ');
        return `
        <div class="file-row">
          <label class="checkbox-container">
            <input type="checkbox" class="file-checkbox" value="${r.relativePath}" checked id="file-${i}">
            <span class="file-path">${r.relativePath}</span>
          </label>
          <div class="badges-group">
            ${badgeTags}
            <span class="count-badge">${r.count} items</span>
          </div>
        </div>
      `;
    })
        .join('');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Scan Report</title>
  <style>
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-editor-background);
      padding: 24px;
      line-height: 1.5;
    }
    .header {
      border-bottom: 1px solid var(--vscode-widget-border, #333);
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 6px 0;
      color: var(--vscode-titleBar-activeForeground);
    }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .summary-card {
      background-color: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.05));
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .stat-number {
      font-size: 20px;
      font-weight: 700;
      color: var(--vscode-statusBarItem-warningForeground, #eab308);
    }
    .files-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 24px;
    }
    .file-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background-color: var(--vscode-sideBar-background, #1e1e1e);
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 6px;
    }
    .checkbox-container {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
    }
    .file-path {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      font-weight: 500;
    }
    .badges-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .count-badge {
      background-color: rgba(234, 179, 8, 0.15);
      color: var(--vscode-statusBarItem-warningForeground, #eab308);
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .type-badge {
      background-color: var(--vscode-badge-background, #333);
      color: var(--vscode-badge-foreground, #fff);
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-widget-border, #333);
    }
    .btn {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>JSON OS Redact — Project Scan Report</h1>
    <div class="subtitle">Review PII & secrets detected across workspace files before batch redaction</div>
  </div>

  <div class="summary-card">
    <div>
      <div>Total Sensitive Items Found</div>
      <div class="subtitle">Across ${results.length} files</div>
    </div>
    <div class="stat-number">${totalMatches}</div>
  </div>

  <div class="files-list">
    ${fileRows}
  </div>

  <div class="toolbar">
    <div>
      <button class="btn btn-secondary" onclick="toggleAll(true)">Select All</button>
      <button class="btn btn-secondary" onclick="toggleAll(false)">Deselect All</button>
    </div>
    <button class="btn" onclick="confirmBatch()">Apply Batch Redaction to Selected Files</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function toggleAll(checked) {
      document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = checked);
    }

    function confirmBatch() {
      const selected = Array.from(document.querySelectorAll('.file-checkbox:checked')).map(cb => cb.value);
      if (selected.length === 0) {
        alert('Please select at least one file to redact.');
        return;
      }
      vscode.postMessage({
        command: 'applyBatchRedaction',
        selectedPaths: selected
      });
    }
  </script>
</body>
</html>`;
}
//# sourceMappingURL=projectReportWebview.js.map