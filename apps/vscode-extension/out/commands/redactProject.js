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
exports.redactProject = redactProject;
const vscode = __importStar(require("vscode"));
const redact_core_1 = require("@jsonos/redact-core");
const diagnostics_js_1 = require("../diagnostics.js");
const projectReportWebview_js_1 = require("../webview/projectReportWebview.js");
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
async function redactProject(context) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('JSON OS Redact: No workspace folder open.');
        return;
    }
    const config = vscode.workspace.getConfiguration('jsonosRedact');
    const excludeGlobs = config.get('excludeGlobs', []);
    const defaultExcludes = [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/*.lock',
        '**/*.png',
        '**/*.jpg',
        '**/*.jpeg',
        '**/*.gif',
        '**/*.ico',
        '**/*.pdf',
        '**/*.zip',
        '**/*.tar',
        '**/*.gz',
        '**/*.mp4',
        '**/*.mp3',
        '**/*.woff',
        '**/*.woff2',
        '**/*.ttf',
        '**/*.eot',
        ...excludeGlobs,
    ];
    const excludePattern = `{${defaultExcludes.join(',')}}`;
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'JSON OS Redact: Scanning workspace files for PII & secrets...',
        cancellable: true,
    }, async (progress, token) => {
        const files = await vscode.workspace.findFiles('**/*', excludePattern, 1000, token);
        const options = (0, diagnostics_js_1.getOptionsFromConfig)();
        const scanResults = [];
        for (let i = 0; i < files.length; i++) {
            if (token.isCancellationRequested)
                break;
            const uri = files[i];
            progress.report({
                message: `${i + 1}/${files.length} (${vscode.workspace.asRelativePath(uri)})`,
                increment: (1 / files.length) * 100,
            });
            try {
                const stat = await vscode.workspace.fs.stat(uri);
                if (stat.size > MAX_FILE_SIZE_BYTES)
                    continue;
                const doc = await vscode.workspace.openTextDocument(uri);
                const text = doc.getText();
                if (!text || !text.trim())
                    continue;
                const { result, count, matches } = (0, redact_core_1.anonymizeText)(text, options);
                if (count > 0 && matches.length > 0) {
                    scanResults.push({
                        uri,
                        relativePath: vscode.workspace.asRelativePath(uri),
                        count,
                        matches,
                        redactedText: result,
                    });
                }
            }
            catch {
                // Skip unreadable / binary files gracefully
            }
        }
        if (scanResults.length === 0) {
            vscode.window.showInformationMessage('JSON OS Redact: No PII or secrets found across workspace files.');
            return;
        }
        // Open Webview report for interactive batch review
        (0, projectReportWebview_js_1.createProjectReportWebview)(context.extensionUri, scanResults, async (selectedUris) => {
            if (selectedUris.length === 0)
                return;
            const edit = new vscode.WorkspaceEdit();
            const resultsMap = new Map(scanResults.map((r) => [r.uri.toString(), r]));
            for (const uri of selectedUris) {
                const res = resultsMap.get(uri.toString());
                if (res) {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
                    edit.replace(uri, fullRange, res.redactedText);
                }
            }
            const success = await vscode.workspace.applyEdit(edit);
            if (success) {
                // Save modified files
                for (const uri of selectedUris) {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await doc.save();
                }
                vscode.window.showInformationMessage(`JSON OS Redact: Batch redaction complete! Redacted ${selectedUris.length} ${selectedUris.length === 1 ? 'file' : 'files'}.`);
            }
            else {
                vscode.window.showErrorMessage('JSON OS Redact: Failed to apply batch redactions.');
            }
        });
    });
}
//# sourceMappingURL=redactProject.js.map