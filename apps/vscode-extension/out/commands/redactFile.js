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
exports.redactCurrentFile = redactCurrentFile;
exports.redactAllValuesInFile = redactAllValuesInFile;
const vscode = __importStar(require("vscode"));
const redact_core_1 = require("@jsonos/redact-core");
const diagnostics_js_1 = require("../diagnostics.js");
async function redactCurrentFile(forceRedactAllValues = false) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('JSON OS Redact: No active text editor found.');
        return;
    }
    const document = editor.document;
    const originalText = document.getText();
    if (!originalText.trim()) {
        vscode.window.showInformationMessage('JSON OS Redact: Current document is empty.');
        return;
    }
    const baseOptions = (0, diagnostics_js_1.getOptionsFromConfig)();
    const options = forceRedactAllValues ? { ...baseOptions, redactAllValues: true } : baseOptions;
    let redactedText = '';
    let count = 0;
    const isJson = document.languageId === 'json' || document.languageId === 'jsonc';
    if (isJson || forceRedactAllValues) {
        try {
            const parsed = JSON.parse(originalText);
            const res = (0, redact_core_1.anonymizeJson)(parsed, options);
            if (res.result !== undefined) {
                redactedText = JSON.stringify(res.result, null, 2);
                count = res.count;
            }
        }
        catch {
            // Fallback to text-based redaction if JSON parsing fails
            const textRes = (0, redact_core_1.anonymizeText)(originalText, options);
            redactedText = textRes.result;
            count = textRes.count;
        }
    }
    else {
        const textRes = (0, redact_core_1.anonymizeText)(originalText, options);
        redactedText = textRes.result;
        count = textRes.count;
    }
    if (count === 0) {
        vscode.window.showInformationMessage(forceRedactAllValues
            ? 'JSON OS Redact: No values found to redact in current file.'
            : 'JSON OS Redact: No PII or secrets detected in current file.');
        return;
    }
    // Create virtual document URI for diff preview
    const originalUri = document.uri;
    // Create in-memory document with redacted content
    const redactedDoc = await vscode.workspace.openTextDocument({
        content: redactedText,
        language: document.languageId,
    });
    const labelSuffix = forceRedactAllValues ? 'ALL Values Redacted' : 'PII Redacted';
    await vscode.commands.executeCommand('vscode.diff', originalUri, redactedDoc.uri, `JSON OS Redact Diff — ${vscode.workspace.asRelativePath(originalUri)} (${count} items | ${labelSuffix})`);
    // Ask for user confirmation
    const actionLabel = forceRedactAllValues ? 'Apply REDACT ALL VALUES' : 'Apply Redaction';
    const choice = await vscode.window.showInformationMessage(`JSON OS Redact: Replace content of ${vscode.workspace.asRelativePath(originalUri)} (${count} ${forceRedactAllValues ? 'values' : 'items'} ${forceRedactAllValues ? 'redacted/masked' : 'detected'})?`, { modal: true }, actionLabel, 'Cancel');
    if (choice === actionLabel) {
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(originalText.length));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(originalUri, fullRange, redactedText);
        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            vscode.window.showInformationMessage(`JSON OS Redact: Successfully redacted ${count} items in ${vscode.workspace.asRelativePath(originalUri)}!`);
        }
        else {
            vscode.window.showErrorMessage('JSON OS Redact: Failed to apply redaction edit.');
        }
    }
}
async function redactAllValuesInFile() {
    return redactCurrentFile(true);
}
//# sourceMappingURL=redactFile.js.map