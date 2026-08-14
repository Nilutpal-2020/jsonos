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
exports.DIAGNOSTIC_SOURCE = void 0;
exports.getOptionsFromConfig = getOptionsFromConfig;
exports.isExcludedFile = isExcludedFile;
exports.updateDiagnostics = updateDiagnostics;
const vscode = __importStar(require("vscode"));
const redact_core_1 = require("@jsonos/redact-core");
exports.DIAGNOSTIC_SOURCE = 'JSON OS Redact';
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB safety limit
function getOptionsFromConfig() {
    const config = vscode.workspace.getConfiguration('jsonosRedact');
    return {
        mode: config.get('mode', 'redact'),
        maskEmails: config.get('maskEmails', true),
        maskSecrets: config.get('maskSecrets', true),
        maskPrices: config.get('maskPrices', true),
        maskCards: config.get('maskCards', true),
        maskIps: config.get('maskIps', true),
        maskUrls: config.get('maskUrls', true),
        maskPhones: config.get('maskPhones', false),
        maskNames: config.get('maskNames', false),
        redactAllValues: config.get('redactAllValues', false),
    };
}
function isExcludedFile(document) {
    if (document.isUntitled)
        return false;
    const config = vscode.workspace.getConfiguration('jsonosRedact');
    const excludeGlobs = config.get('excludeGlobs', []);
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    for (const pattern of excludeGlobs) {
        if (relativePath.includes(pattern.replace(/\*/g, '')))
            return true;
    }
    return false;
}
function updateDiagnostics(document, collection, statusBarItem) {
    if (!document || isExcludedFile(document)) {
        collection.delete(document.uri);
        return;
    }
    const config = vscode.workspace.getConfiguration('jsonosRedact');
    const liveEnabled = config.get('liveSuggestions', true);
    if (!liveEnabled) {
        collection.delete(document.uri);
        statusBarItem.hide();
        return;
    }
    const text = document.getText();
    if (text.length > MAX_FILE_SIZE_BYTES) {
        collection.delete(document.uri);
        return;
    }
    const options = getOptionsFromConfig();
    const { matches } = (0, redact_core_1.anonymizeText)(text, options);
    const diagnostics = [];
    for (const match of matches) {
        const startPos = document.positionAt(match.start);
        const endPos = document.positionAt(match.end);
        // Ignore lines that contain trailing or inline 'redact-ignore' comments
        const lineText = document.lineAt(startPos.line).text;
        if (lineText.includes('redact-ignore'))
            continue;
        const range = new vscode.Range(startPos, endPos);
        const message = `Possible ${match.type} detected — consider redacting before sharing.`;
        const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
        diag.source = exports.DIAGNOSTIC_SOURCE;
        diag.code = match.type;
        diagnostics.push(diag);
    }
    collection.set(document.uri, diagnostics);
    // Update Status Bar Item
    if (vscode.window.activeTextEditor?.document === document) {
        const count = diagnostics.length;
        if (count > 0) {
            statusBarItem.text = `$(warning) ${count} ${count === 1 ? 'PII match' : 'PII matches'}`;
            statusBarItem.tooltip = `JSON OS Redact: ${count} sensitive ${count === 1 ? 'item' : 'items'} found in active file. Click to view Problems.`;
            statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
            statusBarItem.show();
        }
        else {
            statusBarItem.text = `$(shield) 0 PII`;
            statusBarItem.tooltip = 'JSON OS Redact: Clean active file (no PII matches).';
            statusBarItem.color = undefined;
            statusBarItem.show();
        }
    }
}
//# sourceMappingURL=diagnostics.js.map