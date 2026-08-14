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
exports.redactSelection = redactSelection;
const vscode = __importStar(require("vscode"));
const redact_core_1 = require("@jsonos/redact-core");
const diagnostics_js_1 = require("../diagnostics.js");
async function redactSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('JSON OS Redact: No active text editor found.');
        return;
    }
    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showInformationMessage('JSON OS Redact: Please select text to redact.');
        return;
    }
    const selectedText = editor.document.getText(selection);
    const options = (0, diagnostics_js_1.getOptionsFromConfig)();
    const { result, count } = (0, redact_core_1.anonymizeText)(selectedText, options);
    if (count === 0) {
        vscode.window.showInformationMessage('JSON OS Redact: No PII or secrets detected in selected text.');
        return;
    }
    const choice = await vscode.window.showInformationMessage(`JSON OS Redact: Redact selection (${count} ${count === 1 ? 'item' : 'items'} found)?`, 'Redact', 'Cancel');
    if (choice === 'Redact') {
        await editor.edit((editBuilder) => {
            editBuilder.replace(selection, result);
        });
        vscode.window.showInformationMessage(`JSON OS Redact: Redacted selection (${count} items removed).`);
    }
}
//# sourceMappingURL=redactSelection.js.map